export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatTimecode(seconds, includeMs = true) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const hStr = hrs > 0 ? `${String(hrs).padStart(2, '0')}:` : '';
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  const msStr = includeMs ? `.${String(ms).padStart(2, '0')}` : '';

  return `${hStr}${mStr}:${sStr}${msStr}`;
}

export function formatFfmpegTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  return seconds.toFixed(3);
}

/**
 * Computes aspect-ratio-preserving even dimensions for video encoders (H.264/HEVC/AV1 require mod-2)
 */
export function calculateTargetDimensions(srcWidth, srcHeight, resolutionPreset) {
  if (!srcWidth || !srcHeight) return { width: 1280, height: 720 };

  const makeEven = (n) => Math.max(2, Math.round(n / 2) * 2);

  if (!resolutionPreset || resolutionPreset === 'original') {
    return { width: makeEven(srcWidth), height: makeEven(srcHeight) };
  }

  const targetShortSide = parseInt(resolutionPreset, 10);
  if (!targetShortSide || Number.isNaN(targetShortSide)) {
    return { width: makeEven(srcWidth), height: makeEven(srcHeight) };
  }

  const isLandscape = srcWidth >= srcHeight;
  const currentShortSide = isLandscape ? srcHeight : srcWidth;

  const scale = targetShortSide / currentShortSide;
  return {
    width: makeEven(srcWidth * scale),
    height: makeEven(srcHeight * scale),
  };
}

/**
 * Calculates target video & audio bitrates (in kbps) to hit a desired file size in MB
 * over a given duration in seconds.
 */
export function calculateTargetBitrates({
  targetSizeMB,
  durationSec,
  audioMode,
  audioBitrateKbps = 128,
}) {
  const safeDuration = Math.max(0.5, durationSec || 1);
  // Leave a 4% container & muxing overhead safety margin so output stays strictly under targetSizeMB
  const totalBitsAvailable = targetSizeMB * 1024 * 1024 * 8 * 0.96;
  const totalKbps = totalBitsAvailable / 1000 / safeDuration;

  const effectiveAudioKbps =
    audioMode === 'strip'
      ? 0
      : audioMode === 'copy'
      ? 160
      : Number(audioBitrateKbps) || 128;

  const videoKbps = Math.max(80, Math.floor(totalKbps - effectiveAudioKbps));

  return {
    videoKbps,
    audioKbps: effectiveAudioKbps,
    totalKbps: Math.floor(totalKbps),
  };
}

/**
 * Estimates output file size in bytes when using CRF / Quality mode
 */
export function estimateCrfFileSize({
  srcSizeBytes,
  fullDurationSec,
  selectedDurationSec,
  srcWidth,
  srcHeight,
  targetWidth,
  targetHeight,
  srcFps,
  targetFps,
  codec,
  crf,
  audioMode,
  audioBitrateKbps = 128,
}) {
  if (!srcSizeBytes || !fullDurationSec) return 0;

  const durationRatio = Math.min(1, Math.max(0.01, selectedDurationSec / fullDurationSec));
  const pixelRatio =
    srcWidth && srcHeight
      ? (targetWidth * targetHeight) / (srcWidth * srcHeight)
      : 1;
  const fpsRatio =
    targetFps && srcFps && targetFps < srcFps ? Math.pow(targetFps / srcFps, 0.65) : 1;

  // Baseline CRF 23 is ~0.55x of typical unoptimized source at same resolution; each +6 CRF halves bitrate
  const crfFactor = Math.pow(2, (23 - crf) / 6) * 0.55;
  const codecEfficiency =
    codec === 'av1' ? 0.62 : codec === 'hevc' ? 0.72 : 1.0;

  const baseVideoBytes =
    srcSizeBytes * durationRatio * pixelRatio * fpsRatio * crfFactor * codecEfficiency;

  const audioBytes =
    audioMode === 'strip'
      ? 0
      : ((audioBitrateKbps * 1000) / 8) * selectedDurationSec;

  return Math.max(32 * 1024, Math.round(baseVideoBytes + audioBytes));
}
