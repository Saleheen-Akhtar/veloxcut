import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { formatFfmpegTime } from '../utils/format';

let ffmpegInstance = null;
let isLoaded = false;
let currentLogHandler = null;
let currentProgressHandler = null;

export async function getFFmpeg({ onLog, onProgress } = {}) {
  currentLogHandler = onLog || null;
  currentProgressHandler = onProgress || null;

  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegInstance.on('log', ({ message }) => {
    if (currentLogHandler) currentLogHandler(message);
  });

  ffmpegInstance.on('progress', ({ progress, time }) => {
    if (currentProgressHandler) {
      const clamped = Math.max(0, Math.min(1, progress || 0));
      currentProgressHandler({ progress: clamped, time });
    }
  });

  const baseURL = `${window.location.origin}/ffmpeg`;
  const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

  await ffmpegInstance.load({
    coreURL,
    wasmURL,
  });

  isLoaded = true;
  return ffmpegInstance;
}

function getSafeExtension(filename = 'video.mp4') {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'mp4';
}

/**
 * Instant LosslessCut-style stream copy trim & multi-segment split (`-c copy`, zero re-encoding)
 */
export async function losslessSplitOrTrim({
  file,
  segments,
  mergeSegments = false,
  stripAudio = false,
  onProgress,
  onLog,
}) {
  const startWall = performance.now();
  const ffmpeg = await getFFmpeg({ onLog, onProgress });
  const ext = getSafeExtension(file.name);
  const outExt = ['mp4', 'mov', 'mkv', 'webm'].includes(ext) ? ext : 'mp4';
  const inputName = `input_lossless.${ext}`;

  if (onLog) onLog(`Mounting ${file.name} into WASM memory...`);
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const activeSegments = segments.filter((s) => s.end - s.start > 0.05);
  const segmentOutputs = [];

  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    const segFilename = `seg_${i + 1}.${outExt}`;

    const args = [
      '-ss',
      formatFfmpegTime(seg.start),
      '-to',
      formatFfmpegTime(seg.end),
      '-i',
      inputName,
      '-map',
      '0:v:0',
    ];

    if (stripAudio) {
      args.push('-an');
    } else {
      args.push('-map', '0:a?');
    }

    args.push(
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      segFilename
    );

    if (onLog) {
      onLog(
        `Lossless cutting Segment #${i + 1} [${formatFfmpegTime(seg.start)}s -> ${formatFfmpegTime(
          seg.end
        )}s] (-c copy)...`
      );
    }

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(segFilename);
    const mime =
      outExt === 'webm'
        ? 'video/webm'
        : outExt === 'mkv'
        ? 'video/x-matroska'
        : 'video/mp4';
    const blob = new Blob([data.buffer], { type: mime });
    segmentOutputs.push({
      index: i + 1,
      label: seg.label || `Segment ${i + 1}`,
      start: seg.start,
      end: seg.end,
      duration: seg.end - seg.start,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}_cut_${i + 1}.${outExt}`,
      segInternalFile: segFilename,
    });

    if (onProgress) {
      onProgress({ progress: (i + 1) / (activeSegments.length + (mergeSegments ? 1 : 0)) });
    }
  }

  let primaryOutput = segmentOutputs[0];

  // If user requested merging multiple lossless segments into one video (like LosslessCut "Merge cuts")
  if (mergeSegments && segmentOutputs.length > 1) {
    const concatList = segmentOutputs
      .map((s) => `file '${s.segInternalFile}'`)
      .join('\n');
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));
    const mergedFilename = `merged_output.${outExt}`;

    if (onLog) onLog(`Losslessly merging ${segmentOutputs.length} segments (-f concat -c copy)...`);
    await ffmpeg.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'concat_list.txt',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      mergedFilename,
    ]);

    const mergedData = await ffmpeg.readFile(mergedFilename);
    const mergedBlob = new Blob([mergedData.buffer], { type: 'video/mp4' });
    primaryOutput = {
      index: 0,
      label: `Merged (${segmentOutputs.length} clips)`,
      start: activeSegments[0].start,
      end: activeSegments[activeSegments.length - 1].end,
      duration: activeSegments.reduce((acc, s) => acc + (s.end - s.start), 0),
      blob: mergedBlob,
      url: URL.createObjectURL(mergedBlob),
      size: mergedBlob.size,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}_lossless_merged.${outExt}`,
    };

    await ffmpeg.deleteFile('concat_list.txt').catch(() => {});
    await ffmpeg.deleteFile(mergedFilename).catch(() => {});
  }

  // Cleanup WASM FS
  await ffmpeg.deleteFile(inputName).catch(() => {});
  for (const s of segmentOutputs) {
    await ffmpeg.deleteFile(s.segInternalFile).catch(() => {});
  }

  const elapsedSec = (performance.now() - startWall) / 1000;
  return {
    primary: primaryOutput,
    segments: segmentOutputs,
    elapsedSec,
    engineUsed: 'FFmpeg.wasm Stream Copy (-c copy)',
  };
}

/**
 * Muxes audio from original file into a WebCodecs GPU-encoded video blob using -c:v copy (takes <0.5s)
 */
export async function muxAudioWithGpuVideo({
  gpuVideoBlob,
  sourceFile,
  startTime,
  endTime,
  audioMode = 'aac',
  audioBitrateKbps = 128,
  onLog,
}) {
  if (audioMode === 'strip') {
    return gpuVideoBlob;
  }

  try {
    const ffmpeg = await getFFmpeg({ onLog });
    const ext = getSafeExtension(sourceFile.name);
    const srcName = `audio_src.${ext}`;
    const gpuName = 'gpu_video.mp4';
    const outName = 'final_muxed.mp4';

    await ffmpeg.writeFile(gpuName, await fetchFile(gpuVideoBlob));
    await ffmpeg.writeFile(srcName, await fetchFile(sourceFile));

    const args = [
      '-i',
      gpuName,
      '-ss',
      formatFfmpegTime(startTime),
      '-to',
      formatFfmpegTime(endTime),
      '-i',
      srcName,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0?',
      '-c:v',
      'copy',
    ];

    if (audioMode === 'copy') {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', 'aac', '-b:a', `${audioBitrateKbps}k`);
    }

    args.push('-shortest', '-movflags', '+faststart', outName);

    if (onLog) onLog('Muxing audio track into GPU-encoded video stream (-c:v copy)...');
    const code = await ffmpeg.exec(args);

    let finalBlob = gpuVideoBlob;
    if (code === 0) {
      const outData = await ffmpeg.readFile(outName);
      if (outData && outData.byteLength > 1024) {
        finalBlob = new Blob([outData.buffer], { type: 'video/mp4' });
      }
    }

    await ffmpeg.deleteFile(gpuName).catch(() => {});
    await ffmpeg.deleteFile(srcName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});

    return finalBlob;
  } catch (err) {
    if (onLog) onLog(`Audio mux fallback warning: ${err.message}`);
    return gpuVideoBlob;
  }
}

/**
 * Pure FFmpeg.wasm CPU video compression (supports CRF or Target Bitrate, scaling, FPS, audio control)
 */
export async function wasmCompressVideo({
  file,
  startTime,
  endTime,
  width,
  height,
  fps,
  rateControlMode, // 'size' | 'crf'
  crf = 24,
  targetVideoKbps = 1500,
  audioMode = 'aac', // 'aac' | 'copy' | 'strip'
  audioBitrateKbps = 128,
  onProgress,
  onLog,
}) {
  const startWall = performance.now();
  const clipDuration = Math.max(0.5, endTime - startTime);

  const ffmpeg = await getFFmpeg({
    onLog,
    onProgress: ({ time }) => {
      if (onProgress && time > 0) {
        const currentSec = time / 1_000_000;
        const pct = Math.min(0.99, Math.max(0.01, currentSec / clipDuration));
        onProgress({ progress: pct });
      }
    },
  });

  const ext = getSafeExtension(file.name);
  const inputName = `input_compress.${ext}`;
  const outputName = 'compressed_out.mp4';

  if (onLog) onLog(`Loading ${file.name} into FFmpeg.wasm...`);
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const vfFilters = [];
  if (width && height) {
    vfFilters.push(`scale=${width}:${height}:flags=fast_bilinear`);
  }
  if (fps && fps !== 'original') {
    vfFilters.push(`fps=${fps}`);
  }

  const args = [
    '-ss',
    formatFfmpegTime(startTime),
    '-to',
    formatFfmpegTime(endTime),
    '-i',
    inputName,
  ];

  if (vfFilters.length > 0) {
    args.push('-vf', vfFilters.join(','));
  }

  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');

  if (rateControlMode === 'size') {
    const vKbps = Math.max(80, Math.floor(targetVideoKbps));
    args.push(
      '-b:v',
      `${vKbps}k`,
      '-maxrate',
      `${Math.floor(vKbps * 1.15)}k`,
      '-bufsize',
      `${Math.floor(vKbps * 2)}k`
    );
  } else {
    args.push('-crf', String(crf));
  }

  if (audioMode === 'strip') {
    args.push('-an');
  } else if (audioMode === 'copy') {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', 'aac', '-b:a', `${audioBitrateKbps}k`);
  }

  args.push('-movflags', '+faststart', outputName);

  if (onLog) onLog(`Running FFmpeg.wasm: ffmpeg ${args.join(' ')}`);
  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });

  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  const elapsedSec = (performance.now() - startWall) / 1000;
  const outputFilename = `${file.name.replace(/\.[^/.]+$/, '')}_compressed.mp4`;

  return {
    primary: {
      label: 'Compressed Video',
      start: startTime,
      end: endTime,
      duration: clipDuration,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size,
      filename: outputFilename,
    },
    segments: [],
    elapsedSec,
    engineUsed: 'FFmpeg.wasm (libx264 ultrafast)',
  };
}
