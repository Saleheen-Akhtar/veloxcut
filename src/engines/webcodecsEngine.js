import {
  Input,
  Output,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS,
  Conversion,
} from 'mediabunny';

/**
 * Pure-browser hardware-accelerated WebCodecs pipeline powered by Mediabunny.
 * Demuxes packets directly from the File Blob -> Hardware VideoDecoder -> Hardware VideoEncoder
 * without HTML <video> seeking or FFmpeg.wasm overhead.
 */
export async function webcodecsGpuCompress({
  file,
  startTime,
  endTime,
  width,
  height,
  fps,
  codec = 'h264', // 'h264' | 'hevc' | 'av1'
  rateControlMode = 'size', // 'size' | 'crf'
  crf = 24,
  targetVideoKbps = 1500,
  audioMode = 'aac', // 'aac' | 'copy' | 'strip'
  audioBitrateKbps = 128,
  onProgress,
  onLog,
}) {
  const startWall = performance.now();

  // If width/height not provided (e.g. cut-only mode), omit them so Mediabunny keeps original resolution
  const hasExplicitDims = Number(width) > 0 && Number(height) > 0;
  const targetW = hasExplicitDims ? Math.max(2, Math.round(Number(width) / 2) * 2) : undefined;
  const targetH = hasExplicitDims ? Math.max(2, Math.round(Number(height) / 2) * 2) : undefined;
  const numericFps = Number(fps) && fps !== 'original' ? Number(fps) : undefined;
  const clipDuration = Math.max(0.2, endTime - startTime);
  const estTotalFrames = Math.max(1, Math.round(clipDuration * (numericFps || 30)));

  const codecMap = {
    h264: 'avc',
    hevc: 'hevc',
    av1: 'av1',
  };
  const targetCodec = codecMap[codec] || 'avc';

  // Compute positive integer bitrate for hardware VideoEncoder
  // Size mode: computed targetVideoKbps -> exact bps integer
  // CRF mode: calibrated hardware bitrate curve based on resolution, framerate, and CRF
  const targetBitrateInt =
    rateControlMode === 'size' && Number.isFinite(Number(targetVideoKbps)) && Number(targetVideoKbps) > 0
      ? Math.max(80_000, Math.round(Number(targetVideoKbps) * 1000))
      : null;

  const effectiveW = targetW || 1920;
  const effectiveH = targetH || 1080;
  const effectiveFps = numericFps || 30;
  const pixelsPerSec = effectiveW * effectiveH * effectiveFps;
  const baseBpp = 0.028; // Calibrated web efficiency (~1.7 Mbps for 1080p@30fps at CRF 24)
  const crfMultiplier = Math.pow(2, (24 - crf) / 6);
  const codecFactor = targetCodec === 'av1' ? 0.65 : targetCodec === 'hevc' ? 0.75 : 1.0;
  const crfBitrateBps = Math.max(
    90_000,
    Math.min(25_000_000, Math.round(pixelsPerSec * baseBpp * crfMultiplier * codecFactor))
  );

  const finalBitrateBps = targetBitrateInt || crfBitrateBps;

  // Logging
  if (onLog) {
    const dimStr = hasExplicitDims ? `${targetW}x${targetH}` : 'native res';
    onLog(
      `Starting Mediabunny WebCodecs Direct Pipeline (${targetCodec.toUpperCase()} @ ${dimStr}, ${(
        finalBitrateBps / 1000
      ).toFixed(0)} kbps)...`
    );
  }

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });

  // Build video options with valid positive integer bitrate for Mediabunny
  const videoOptions = {
    codec: targetCodec,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',
    forceTranscode: true,
    ...(hasExplicitDims ? { width: targetW, height: targetH, fit: 'contain' } : {}),
    bitrate: finalBitrateBps,
  };
  if (numericFps) {
    videoOptions.frameRate = numericFps;
  }

  const audioOptions =
    audioMode === 'strip'
      ? { discard: true }
      : audioMode === 'copy'
      ? { forceTranscode: false }
      : {
          codec: 'aac',
          bitrate: (Number(audioBitrateKbps) || 128) * 1000,
        };

  const isTrimming = startTime > 0.05 || (endTime && Math.abs(endTime - clipDuration) > 0.1);

  const conversion = await Conversion.init({
    input,
    output,
    trim: isTrimming
      ? {
          start: Math.max(0, startTime),
          end: endTime,
        }
      : undefined,
    video: videoOptions,
    audio: audioOptions,
    showWarnings: false,
  });

  conversion.onProgress = (prog) => {
    const clamped = Math.max(0.01, Math.min(0.99, prog || 0));
    const elapsed = Math.max(0.05, (performance.now() - startWall) / 1000);
    const doneFrames = Math.round(clamped * estTotalFrames);
    const currentFps = Math.round(doneFrames / elapsed);
    if (onProgress) {
      onProgress({
        progress: clamped,
        fps: currentFps,
        frame: doneFrames,
        totalFrames: estTotalFrames,
        speed: `${((clamped * clipDuration) / elapsed).toFixed(1)}x`,
      });
    }
  };

  await conversion.execute();

  const finalBlob = new Blob([target.buffer], { type: 'video/mp4' });
  const elapsedSec = (performance.now() - startWall) / 1000;
  const outputFilename = `${file.name.replace(/\.[^/.]+$/, '')}_${codec}_webcodecs.mp4`;

  return {
    primary: {
      label: `WebCodecs (${codec.toUpperCase()})`,
      start: startTime,
      end: endTime,
      duration: clipDuration,
      blob: finalBlob,
      url: URL.createObjectURL(finalBlob),
      size: finalBlob.size,
      filename: outputFilename,
    },
    segments: [],
    elapsedSec,
    engineUsed: `WebCodecs GPU (${codec.toUpperCase()})`,
  };
}

/**
 * Fast hardware-accelerated Cut & Compression for multiple segments via WebCodecs.
 * Executes in seconds rather than minutes by utilizing direct GPU silicon.
 */
export async function webcodecsCutCompress({
  file,
  segments = [],
  stripAudio = false,
  codec = 'h264',
  crf = 24,
  targetVideoKbps,
  onProgress,
  onLog,
}) {
  const startWall = performance.now();
  const activeSegments = segments.filter((s) => s.end - s.start > 0.05);
  const segmentOutputs = [];
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    if (onLog) {
      onLog(`WebCodecs GPU Encoding Scene ${i + 1}/${activeSegments.length} [${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s]...`);
    }

    const segResult = await webcodecsGpuCompress({
      file,
      startTime: seg.start,
      endTime: seg.end,
      codec,
      rateControlMode: targetVideoKbps ? 'size' : 'crf',
      crf,
      targetVideoKbps,
      audioMode: stripAudio ? 'strip' : 'copy',
      onProgress: ({ progress, fps, speed }) => {
        if (onProgress) {
          onProgress({
            progress: (i + (progress || 0)) / activeSegments.length,
            fps,
            speed,
          });
        }
      },
      onLog,
    });

    const segFilename = `${baseName}_cut_${i + 1}_${codec}.mp4`;
    segmentOutputs.push({
      index: i + 1,
      label: seg.label || `Segment ${i + 1}`,
      start: seg.start,
      end: seg.end,
      duration: seg.end - seg.start,
      blob: segResult.primary.blob,
      url: segResult.primary.url,
      size: segResult.primary.size,
      filename: segFilename,
    });

    if (onProgress) {
      onProgress({ progress: (i + 1) / activeSegments.length });
    }
  }

  const elapsedSec = (performance.now() - startWall) / 1000;
  return {
    primary: segmentOutputs[0],
    segments: segmentOutputs,
    elapsedSec,
    engineUsed: `WebCodecs GPU Hardware Accelerated (${codec.toUpperCase()})`,
  };
}

/**
 * Instant client-side direct stream-copy cutting (0.05s - 0.2s) via Mediabunny.
 * Slices packets directly from BlobSource without re-encoding or loading multi-GB files into WASM memory.
 */
export async function webcodecsLosslessCut({
  file,
  segments = [],
  stripAudio = false,
  onProgress,
  onLog,
}) {
  const startWall = performance.now();
  const activeSegments = segments.filter((s) => s.end - s.start > 0.05);
  if (activeSegments.length === 0) {
    throw new Error('No valid segments selected for cutting');
  }
  const segmentOutputs = [];
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    if (onLog) {
      onLog(
        `Lossless Stream-Copying Scene ${i + 1}/${activeSegments.length} [${seg.start.toFixed(1)}s -> ${seg.end.toFixed(1)}s]...`
      );
    }

    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    });

    const isTrimming = seg.start > 0.05 || seg.end < 9999999;

    const conversion = await Conversion.init({
      input,
      output,
      trim: isTrimming
        ? {
            start: Math.max(0, seg.start),
            end: seg.end,
          }
        : undefined,
      video: { forceTranscode: false },
      audio: stripAudio ? { discard: true } : { forceTranscode: false },
      showWarnings: false,
    });

    conversion.onProgress = (prog) => {
      const clamped = Math.max(0.01, Math.min(0.99, prog || 0));
      if (onProgress) {
        onProgress({ progress: (i + clamped) / activeSegments.length });
      }
    };

    await conversion.execute();

    const buffer = target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const segFilename = `${baseName}_cut_${i + 1}.mp4`;

    segmentOutputs.push({
      index: i + 1,
      label: seg.label || `Segment ${i + 1}`,
      start: seg.start,
      end: seg.end,
      duration: seg.end - seg.start,
      blob,
      url,
      size: blob.size,
      filename: segFilename,
    });

    if (onProgress) {
      onProgress({ progress: (i + 1) / activeSegments.length });
    }
  }

  const elapsedSec = (performance.now() - startWall) / 1000;
  return {
    primary: segmentOutputs[0],
    segments: segmentOutputs,
    elapsedSec,
    engineUsed: `Mediabunny Direct Stream-Copy (${elapsedSec.toFixed(2)}s)`,
  };
}
