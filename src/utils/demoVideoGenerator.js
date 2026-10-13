import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

/**
 * Generates an 8-second synthetic 1280x720 30fps MP4 test video in under 0.6s using WebCodecs
 * so users can immediately test LosslessCut splitting and compression even before picking a local file.
 */
export async function generateDemoVideoFile() {
  const width = 1280;
  const height = 720;
  const fps = 30;
  const durationSec = 8;
  const totalFrames = fps * durationSec;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    fastStart: 'in-memory',
  });

  let configured = false;
  const candidateCodecs = [
    { codec: 'avc1.4d002a', hardwareAcceleration: 'no-preference' },
    { codec: 'avc1.420028', hardwareAcceleration: 'no-preference' },
    { codec: 'avc1.42001f', hardwareAcceleration: 'no-preference' },
    { codec: 'avc1.640028', hardwareAcceleration: 'prefer-hardware' },
  ];

  let encoder = null;
  if (typeof window.VideoEncoder === 'function') {
    try {
      for (const cand of candidateCodecs) {
        try {
          const support = await window.VideoEncoder.isConfigSupported({
            ...cand,
            width,
            height,
            bitrate: 5_000_000,
            framerate: fps,
          });
          if (support.supported) {
            encoder = new window.VideoEncoder({
              output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
              error: (e) => console.error(e),
            });
            encoder.configure({
              ...cand,
              width,
              height,
              bitrate: 5_000_000,
              framerate: fps,
            });
            configured = true;
            break;
          }
        } catch {
          // continue
        }
      }
    } catch {
      // fallback
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const scenes = [
    { title: 'SCENE 1 · NEON HORIZON', bg1: '#0f172a', bg2: '#1e1b4b', accent: '#38bdf8' },
    { title: 'SCENE 2 · CYBER GRID', bg1: '#052e16', bg2: '#064e3b', accent: '#34d399' },
    { title: 'SCENE 3 · SOLAR FLARE', bg1: '#451a03', bg2: '#7c2d12', accent: '#fb923c' },
    { title: 'SCENE 4 · QUANTUM PULSE', bg1: '#2e1065', bg2: '#4c1d95', accent: '#c084fc' },
  ];

  const frameDurUs = Math.round(1_000_000 / fps);

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const sceneIdx = Math.min(scenes.length - 1, Math.floor(t / 2));
    const scene = scenes[sceneIdx];

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, scene.bg1);
    grad.addColorStop(1, scene.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Animated grid lines for high motion entropy
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    const offset = (i * 6) % 80;
    for (let x = -80 + offset; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -80 + offset; y < height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Animated orb
    const orbX = width * 0.5 + Math.cos(t * 2.5) * 320;
    const orbY = height * 0.5 + Math.sin(t * 3.5) * 160;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 72, 0, Math.PI * 2);
    ctx.fillStyle = scene.accent;
    ctx.fill();

    // Scene banner & frame counter
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(48, 48, 540, 150);
    ctx.strokeStyle = scene.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, 540, 150);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px Inter, system-ui, sans-serif';
    ctx.fillText(scene.title, 76, 105);

    ctx.fillStyle = scene.accent;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`TIME: ${t.toFixed(2)}s   FRAME: ${String(i + 1).padStart(3, '0')}/${totalFrames}`, 76, 158);

    const frame = new window.VideoFrame(canvas, {
      timestamp: i * frameDurUs,
      duration: frameDurUs,
    });
    encoder.encode(frame, { keyFrame: i % 15 === 0 });
    frame.close();
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  return new File([blob], 'VeloxCut_Demo_720p_4Scenes.mp4', { type: 'video/mp4' });
}
