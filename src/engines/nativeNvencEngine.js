/**
 * Client for the Local Native NVIDIA NVENC Accelerator (CUDA + h264_nvenc / hevc_nvenc + Psycho-Visual HQ)
 */
export async function checkNativeNvencStatus() {
  try {
    const res = await fetch('/api/nvenc-status');
    if (!res.ok) return { available: false };
    return await res.json();
  } catch {
    return { available: false };
  }
}

export async function runNativeNvencJob({
  file,
  workflowMode = 'compress',
  segments = [],
  mergeSegments = false,
  losslessStripAudio = false,
  startTime = 0,
  endTime = 10,
  width,
  height,
  fps = 'original',
  codec = 'hevc',
  rateControlMode = 'crf',
  crf = 20,
  targetVideoKbps = 2500,
  audioMode = 'copy',
  audioBitrateKbps = 160,
  psychoVisualHq = true,
  onProgress,
  onLog,
}) {
  const extMatch = (file.name || '').match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';

  if (onLog) onLog(`Streaming ${file.name} to Local NVIDIA NVENC GPU Accelerator...`);

  const uploadRes = await fetch(`/api/nvenc-upload?ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error('Failed to stream source video to local NVENC engine.');
  }

  const { inputId } = await uploadRes.json();

  const jobRes = await fetch('/api/nvenc-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputId,
      originalName: file.name,
      workflowMode,
      segments,
      mergeSegments,
      losslessStripAudio,
      startTime,
      endTime,
      width,
      height,
      fps,
      codec,
      rateControlMode,
      crf,
      targetVideoKbps,
      audioMode,
      audioBitrateKbps,
      psychoVisualHq,
    }),
  });

  if (!jobRes.ok || !jobRes.body) {
    throw new Error('NVENC job failed to start.');
  }

  const reader = jobRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === 'log' && onLog) {
        onLog(event.message);
      } else if (event.type === 'progress' && onProgress) {
        onProgress({
          progress: event.progress,
          fps: event.fps,
          speed: event.speed,
        });
      } else if (event.type === 'error') {
        throw new Error(event.message);
      } else if (event.type === 'done') {
        finalPayload = event;
      }
    }
  }

  if (!finalPayload) {
    throw new Error('NVENC job ended without returning output metadata.');
  }

  const hydrateOutput = (item) => ({
    ...item,
    url: `/api/nvenc-file/${item.fileId}`,
  });

  return {
    primary: hydrateOutput(finalPayload.primary),
    segments: (finalPayload.segments || []).map(hydrateOutput),
    elapsedSec: finalPayload.elapsedSec,
    engineUsed: finalPayload.engineUsed,
  };
}
