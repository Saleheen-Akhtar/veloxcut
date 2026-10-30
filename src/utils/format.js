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
 * Estimates output file size in bytes when using CRF / Quality mode based on target resolution, framerate, and CRF
 */
export function estimateCrfFileSize({
  fullDurationSec,
  selectedDurationSec,
  targetWidth,
  targetHeight,
  targetFps,
  codec,
  crf,
  audioMode,
  audioBitrateKbps = 128,
}) {
  const dur = selectedDurationSec || fullDurationSec || 0;
  if (!dur) return 0;

  const w = targetWidth || 1920;
  const h = targetHeight || 1080;
  const fps = Number(targetFps) && targetFps !== 'original' ? Number(targetFps) : 30;

  // Calibrated bits-per-pixel for true compact compression:
  // Base at CRF 24: ~0.026 bpp (1080p @ 30fps is ~1.6 Mbps)
  // Each +6 CRF halves the bitrate
  const baseBpp = 0.026;
  const crfFactor = Math.pow(2, (24 - Number(crf || 24)) / 6);
  const codecEfficiency =
    codec === 'av1' ? 0.65 : codec === 'hevc' ? 0.75 : 1.0;

  const videoBps = Math.max(100_000, Math.min(25_000_000, w * h * fps * baseBpp * crfFactor * codecEfficiency));
  const audioBps =
    audioMode === 'strip'
      ? 0
      : (Number(audioBitrateKbps) || 128) * 1000;

  const totalBytes = ((videoBps + audioBps) / 8) * dur;
  return Math.max(32 * 1024, Math.round(totalBytes));
}
