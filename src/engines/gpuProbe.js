/**
 * Probes browser WebCodecs API for hardware-accelerated GPU encoders (NVIDIA NVENC, Intel QSV, AMD AMF)
 */
const CODEC_CANDIDATES = {
  h264: [
    'avc1.640028', // High Profile Level 4.0
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.42001f', // Baseline Profile Level 3.1
  ],
  hevc: [
    'hvc1.1.6.L120.90', // Main Profile Level 4.0
    'hev1.1.6.L120.90',
    'hvc1.1.6.L93.B0',
  ],
  av1: [
    'av01.0.08M.08', // Main Profile Level 4.0 8-bit
    'av01.0.04M.08',
  ],
};

export async function probeGpuEncoders(width = 1920, height = 1080) {
  const results = {
    webcodecsAvailable: typeof window !== 'undefined' && 'VideoEncoder' in window,
    codecs: {
      h264: { supported: false, hardware: false, codecString: null, muxerKey: 'avc' },
      hevc: { supported: false, hardware: false, codecString: null, muxerKey: 'hevc' },
      av1: { supported: false, hardware: false, codecString: null, muxerKey: 'av1' },
    },
  };

  if (!results.webcodecsAvailable) {
    return results;
  }

  for (const [key, candidates] of Object.entries(CODEC_CANDIDATES)) {
    // 1. Check hardware-accelerated encoding first (NVENC / QSV)
    for (const codecStr of candidates) {
      try {
        const hwCheck = await window.VideoEncoder.isConfigSupported({
          codec: codecStr,
          width,
          height,
          bitrate: 4_000_000,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware',
        });
        if (hwCheck?.supported) {
          results.codecs[key] = {
            supported: true,
            hardware: hwCheck.config?.hardwareAcceleration === 'prefer-hardware' || true,
            codecString: codecStr,
            muxerKey: key === 'h264' ? 'avc' : key,
          };
          break;
        }
      } catch {
        // Ignore unsupported codec string
      }
    }

    // 2. Fallback to software WebCodecs if hardware wasn't matched
    if (!results.codecs[key].supported) {
      for (const codecStr of candidates) {
        try {
          const swCheck = await window.VideoEncoder.isConfigSupported({
            codec: codecStr,
            width,
            height,
            bitrate: 4_000_000,
            framerate: 30,
            hardwareAcceleration: 'no-preference',
          });
          if (swCheck?.supported) {
            results.codecs[key] = {
              supported: true,
              hardware: false,
              codecString: codecStr,
              muxerKey: key === 'h264' ? 'avc' : key,
            };
            break;
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  return results;
}
