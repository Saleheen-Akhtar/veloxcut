import {
  Input,
  Output,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
  ALL_FORMATS,
  Conversion,
} from 'mediabunny';

function crfToHardwareBitrateBps({ width, height, fps, crf, codec }) {
  const pixelsPerSec = width * height * fps;
  const baseBpp = 0.026; // High-efficiency web compression (~1.6 Mbps for 1080p@30fps)
  const crfMultiplier = Math.pow(2, (24 - crf) / 6);
  const codecFactor = codec === 'av1' ? 0.65 : codec === 'hevc' ? 0.75 : 1.0;

  const rawBps = pixelsPerSec * baseBpp * crfMultiplier * codecFactor;
  return Math.max(80_000, Math.min(18_000_000, Math.round(rawBps)));
}

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

  const targetW = Math.max(2, Math.round(width / 2) * 2);
  const targetH = Math.max(2, Math.round(height / 2) * 2);
  const numericFps = Number(fps) && fps !== 'original' ? Number(fps) : undefined;
  const clipDuration = Math.max(0.2, endTime - startTime);
  const estTotalFrames = Math.max(1, Math.round(clipDuration * (numericFps || 30)));

  const codecMap = {
    h264: 'avc',
    hevc: 'hevc',
    av1: 'av1',
  };
  const targetCodec = codecMap[codec] || 'avc';

  const bitrateBps =
    rateControlMode === 'size'
      ? Math.max(80_000, Math.round(targetVideoKbps * 1000))
      : crfToHardwareBitrateBps({
          width: targetW,
          height: targetH,
          fps: numericFps || 30,
          crf,
          codec,
        });

  if (onLog) {
    onLog(
      `Starting Mediabunny WebCodecs Direct Pipeline (${targetCodec.toUpperCase()} @ ${targetW}x${targetH}, ${(
        bitrateBps / 1000
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

  const videoOptions = {
    width: targetW,
    height: targetH,
    fit: 'contain',
    codec: targetCodec,
    bitrate: bitrateBps,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',
    forceTranscode: true,
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
