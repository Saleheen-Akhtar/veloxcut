import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Scissors,
  Zap,
  Upload,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Download,
  Cpu,
  Gauge,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  RotateCcw,
  Film,
  CheckCircle2,
  Sparkles,
  Terminal,
  Eye,
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Repeat,
  Keyboard,
  X,
  Sliders,
} from 'lucide-react';
import {
  formatBytes,
  formatTimecode,
  calculateTargetDimensions,
  calculateTargetBitrates,
  estimateCrfFileSize,
} from './utils/format';
import { probeGpuEncoders } from './engines/gpuProbe';
import { losslessSplitOrTrim, wasmCompressVideo } from './engines/ffmpegEngine';
import { webcodecsGpuCompress } from './engines/webcodecsEngine';
import { checkNativeNvencStatus, runNativeNvencJob } from './engines/nativeNvencEngine';
import { generateDemoVideoFile } from './utils/demoVideoGenerator';

export default function App() {
  // Video File & Metadata State
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [meta, setMeta] = useState({
    duration: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    size: 0,
    name: '',
  });

  // Player & Timeline State
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopSegment, setLoopSegment] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [previewMode, setPreviewMode] = useState('original'); // 'original' | 'output'
  const [filmstrip, setFilmstrip] = useState([]);
  const [dragState, setDragState] = useState(null);

  // LosslessCut-style Segments
  const [segments, setSegments] = useState([
    { id: 'seg-1', start: 0, end: 10, label: 'Segment 1' },
  ]);
  const [activeSegId, setActiveSegId] = useState('seg-1');

  // Hardware & Engine Status
  const [nvencAvailable, setNvencAvailable] = useState(false);
  const [gpuCaps, setGpuCaps] = useState({
    webcodecsAvailable: false,
    codecs: {
      h264: { supported: true, hardware: false },
      hevc: { supported: false, hardware: false },
      av1: { supported: false, hardware: false },
    },
  });

  // Workflow & Encoding Settings
  const [workflowMode, setWorkflowMode] = useState('compress'); // 'lossless' | 'compress'
  const [mergeSegments, setMergeSegments] = useState(false);
  const [losslessStripAudio, setLosslessStripAudio] = useState(false);

  const [engineType, setEngineType] = useState('nvenc'); // 'nvenc' | 'webcodecs' | 'wasm'
  const [codec, setCodec] = useState('hevc'); // 'hevc' | 'h264' | 'av1'
  const [rateControlMode, setRateControlMode] = useState('crf'); // 'crf' | 'size'
  const [crf, setCrf] = useState(20); // CQ 20 = Visually Lossless
  const [psychoVisualHq, setPsychoVisualHq] = useState(true);
  const [targetSizeMB, setTargetSizeMB] = useState(15);
  const [targetSizePct, setTargetSizePct] = useState(50);
  const [resolutionPreset, setResolutionPreset] = useState('original');
  const [fpsPreset, setFpsPreset] = useState('original');
  const [audioMode, setAudioMode] = useState('copy'); // 'copy' | 'aac' | 'strip'
  const [audioBitrateKbps, setAudioBitrateKbps] = useState(160);

  // UI Drawers & Feedback State
  const [showProSettings, setShowProSettings] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef(null);

  // Processing & Output State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [encodingStats, setEncodingStats] = useState({
    fps: 0,
    speed: '',
    frame: 0,
    totalFrames: 0,
  });
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [outputResult, setOutputResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg('');
    }, 2400);
  }, []);

  const appendLog = useCallback((line) => {
    setLogs((prev) => [...prev.slice(-80), line]);
  }, []);

  // Probe Native NVIDIA NVENC & Browser WebCodecs on startup
  useEffect(() => {
    Promise.all([checkNativeNvencStatus(), probeGpuEncoders(1920, 1080)]).then(
      ([nvenc, caps]) => {
        setGpuCaps(caps);
        if (nvenc?.available) {
          setNvencAvailable(true);
          setEngineType('nvenc');
          setCodec('hevc');
          appendLog(
            'NVIDIA NVENC Psycho-Visual HQ Ready (HEVC / H.264 2-Pass FullRes + Spatial/Temporal AQ).'
          );
        } else if (caps.webcodecsAvailable) {
          setEngineType('webcodecs');
          setCodec(caps.codecs.hevc?.supported ? 'hevc' : 'h264');
        } else {
          setEngineType('wasm');
          setCodec('h264');
        }
      }
    );
  }, [appendLog]);

  // Active segment helper
  const activeSegment = useMemo(
    () =>
      segments.find((s) => s.id === activeSegId) ||
      segments[0] || { start: 0, end: meta.duration || 1 },
    [segments, activeSegId, meta.duration]
  );

  const isTrimmedOrMulti = useMemo(() => {
    if (!meta.duration) return false;
    if (segments.length > 1) return true;
    const s = segments[0];
    if (!s) return false;
    return s.start > 0.05 || Math.abs(s.end - meta.duration) > 0.05;
  }, [segments, meta.duration]);

  const selectedDuration = useMemo(() => {
    if (workflowMode === 'lossless') {
      return segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
    }
    return Math.max(0.1, (activeSegment?.end || meta.duration) - (activeSegment?.start || 0));
  }, [workflowMode, segments, activeSegment, meta.duration]);

  // Target dimensions & bitrates
  const targetDims = useMemo(
    () => calculateTargetDimensions(meta.width, meta.height, resolutionPreset),
    [meta.width, meta.height, resolutionPreset]
  );

  const bitratePlan = useMemo(
    () =>
      calculateTargetBitrates({
        targetSizeMB,
        durationSec: selectedDuration,
        audioMode,
        audioBitrateKbps,
      }),
    [targetSizeMB, selectedDuration, audioMode, audioBitrateKbps]
  );

  // Bits-Per-Pixel (BPP) Quality Health score
  const qualityHealth = useMemo(() => {
    if (rateControlMode === 'crf') {
      if (crf <= 20) return { label: '99% Visually Lossless', color: '#34d399', needsOptimize: false };
      if (crf <= 23) return { label: '96% Razor Sharp HQ', color: '#38bdf8', needsOptimize: false };
      if (crf <= 26) return { label: '90% Balanced Clarity', color: '#fbbf24', needsOptimize: false };
      return { label: 'Compact Size Mode', color: '#fb923c', needsOptimize: false };
    }

    const effFps = fpsPreset === 'original' ? meta.fps || 30 : Number(fpsPreset);
    const pixelsPerSec = targetDims.width * targetDims.height * effFps;
    const codecBoost = codec === 'hevc' || codec === 'av1' ? 1.55 : 1.0;
    const effectiveBpp = ((bitratePlan.videoKbps * 1000) / Math.max(1, pixelsPerSec)) * codecBoost;

    if (effectiveBpp >= 0.075) {
      return { label: '99% Crisp Quality', color: '#34d399', needsOptimize: false };
    }
    if (effectiveBpp >= 0.045) {
      return { label: 'Good Visual Clarity', color: '#38bdf8', needsOptimize: false };
    }
    return {
      label: 'Low Bitrate for Current Res',
      color: '#fb923c',
      needsOptimize: true,
    };
  }, [rateControlMode, crf, fpsPreset, meta.fps, targetDims, codec, bitratePlan.videoKbps]);

  const handleAutoOptimizeForTargetSize = () => {
    setCodec('hevc');
    setPsychoVisualHq(true);
    setAudioMode('aac');
    setAudioBitrateKbps(128);
    if (targetDims.height > 1080) {
      setResolutionPreset('1080');
    } else if (targetDims.height > 720) {
      setResolutionPreset('720');
    }
    showToast(`Auto-optimized settings for ${targetSizeMB} MB target`);
  };

  // Detect active 1-click quick preset
  const activeQuickPreset = useMemo(() => {
    if (
      rateControlMode === 'crf' &&
      crf === 20 &&
      resolutionPreset === 'original' &&
      codec === 'hevc'
    ) {
      return 'smart-lossless';
    }
    if (rateControlMode === 'size' && Math.abs(targetSizeMB - 10) < 0.05) {
      return 'discord-10';
    }
    if (rateControlMode === 'size' && Math.abs(targetSizeMB - 25) < 0.05) {
      return 'share-25';
    }
    if (rateControlMode === 'crf' && crf === 25 && resolutionPreset === '720') {
      return 'compact-720';
    }
    return null;
  }, [rateControlMode, crf, resolutionPreset, codec, targetSizeMB]);

  const applyQuickPreset = (id) => {
    if (id === 'smart-lossless') {
      setRateControlMode('crf');
      setCrf(20);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setResolutionPreset('original');
      setFpsPreset('original');
      setAudioMode('copy');
      showToast('Applied Smart Auto (Visually Lossless)');
    } else if (id === 'discord-10') {
      setRateControlMode('size');
      setTargetSizeMB(10);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Applied 10 MB Target Preset');
    } else if (id === 'share-25') {
      setRateControlMode('size');
      setTargetSizeMB(25);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('copy');
      showToast('Applied 25 MB Share Preset');
    } else if (id === 'compact-720') {
      setRateControlMode('crf');
      setCrf(25);
      setResolutionPreset('720');
      setCodec('hevc');
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Applied Fast 720p Compact Preset');
    }
  };

  const estimatedOutputBytes = useMemo(() => {
    if (!meta.size || !meta.duration) return 0;
    if (workflowMode === 'lossless') {
      const ratio = Math.min(1, selectedDuration / meta.duration);
      const audioFactor = losslessStripAudio ? 0.9 : 1;
      return Math.round(meta.size * ratio * audioFactor);
    }
    if (rateControlMode === 'size') {
      return Math.round(targetSizeMB * 1024 * 1024);
    }
    return estimateCrfFileSize({
      srcSizeBytes: meta.size,
      fullDurationSec: meta.duration,
      selectedDurationSec: selectedDuration,
      srcWidth: meta.width,
      srcHeight: meta.height,
      targetWidth: targetDims.width,
      targetHeight: targetDims.height,
      srcFps: meta.fps,
      targetFps: fpsPreset === 'original' ? meta.fps : Number(fpsPreset),
      codec,
      crf,
      audioMode,
      audioBitrateKbps,
    });
  }, [
    meta,
    workflowMode,
    selectedDuration,
    losslessStripAudio,
    rateControlMode,
    targetSizeMB,
    targetDims,
    fpsPreset,
    codec,
    crf,
    audioMode,
    audioBitrateKbps,
  ]);

  // Generate filmstrip thumbnails in the background when a video is loaded
  const generateFilmstrip = useCallback(async (url, duration) => {
    if (!url || !duration || duration <= 0) return;
    try {
      const thumbVideo = document.createElement('video');
      thumbVideo.src = url;
      thumbVideo.muted = true;
      thumbVideo.playsInline = true;
      await new Promise((res, rej) => {
        thumbVideo.onloadeddata = res;
        thumbVideo.onerror = rej;
      });

      const count = 10;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      const thumbs = [];

      for (let i = 0; i < count; i++) {
        const t = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
        await new Promise((resolve) => {
          const onSeek = () => {
            thumbVideo.removeEventListener('seeked', onSeek);
            resolve();
          };
          thumbVideo.addEventListener('seeked', onSeek, { once: true });
          thumbVideo.currentTime = Math.max(0, t);
        });
        ctx.drawImage(thumbVideo, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.6));
      }
      setFilmstrip(thumbs);
    } catch {
      // Ignore filmstrip errors
    }
  }, []);

  // Load a video File into the editor
  const loadFile = useCallback(
    (file) => {
      if (!file) return;
      if (videoUrl) URL.revokeObjectURL(videoUrl);

      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setOutputResult(null);
      setPreviewMode('original');
      setErrorMsg('');
      setFilmstrip([]);
      setIsPlaying(false);

      const origMB = file.size / (1024 * 1024);
      const smartTargetMB = Math.max(0.5, Number((origMB * 0.5).toFixed(1)));
      setTargetSizeMB(smartTargetMB);
      setTargetSizePct(50);

      const probeVideo = document.createElement('video');
      probeVideo.preload = 'metadata';
      probeVideo.src = url;
      probeVideo.onloadedmetadata = () => {
        const dur =
          probeVideo.duration && Number.isFinite(probeVideo.duration)
            ? probeVideo.duration
            : 10;
        const w = probeVideo.videoWidth || 1280;
        const h = probeVideo.videoHeight || 720;
        setMeta({
          duration: dur,
          width: w,
          height: h,
          fps: 30,
          size: file.size,
          name: file.name,
        });
        const initialSeg = {
          id: 'seg-1',
          start: 0,
          end: dur,
          label: 'Segment 1',
        };
        setSegments([initialSeg]);
        setActiveSegId('seg-1');
        setCurrentTime(0);
        generateFilmstrip(url, dur);
      };
    },
    [videoUrl, generateFilmstrip]
  );

  const handleCloseVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl('');
    setOutputResult(null);
    setFilmstrip([]);
    setErrorMsg('');
    setIsPlaying(false);
  };

  const handleLoadDemoVideo = async () => {
    try {
      setIsGeneratingDemo(true);
      setErrorMsg('');
      const demoFile = await generateDemoVideoFile();
      loadFile(demoFile);
      showToast('Loaded 4-Scene Demo Video');
    } catch (err) {
      setErrorMsg(`Could not generate demo video: ${err.message}`);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Switch between Original and Output Preview while preserving exact timestamp
  const handleSwitchPreviewMode = useCallback(
    (nextMode) => {
      if (nextMode === previewMode) return;
      if (videoRef.current) {
        savedTimeRef.current = videoRef.current.currentTime;
      }
      setPreviewMode(nextMode);
    },
    [previewMode]
  );

  // Timeline Operations
  const setInPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.min(currentTime, activeSegment.end - 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, start: clamped } : s))
    );
    showToast(`Start set to ${formatTimecode(clamped)}`);
  }, [activeSegId, activeSegment.end, currentTime, meta.duration, showToast]);

  const setOutPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.max(currentTime, activeSegment.start + 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, end: clamped } : s))
    );
    showToast(`End set to ${formatTimecode(clamped)}`);
  }, [activeSegId, activeSegment.start, currentTime, meta.duration, showToast]);

  const splitAtPlayhead = useCallback(() => {
    if (!meta.duration) return;
    const target = segments.find(
      (s) => currentTime > s.start + 0.15 && currentTime < s.end - 0.15
    );
    if (!target) {
      showToast('Move playhead inside a clip to split');
      return;
    }

    const newId = `seg-${Date.now()}`;
    const updated = [];
    segments.forEach((s) => {
      if (s.id === target.id) {
        updated.push({
          ...s,
          end: currentTime,
        });
        updated.push({
          id: newId,
          start: currentTime,
          end: s.end,
          label: `Segment ${segments.length + 1}`,
        });
      } else {
        updated.push(s);
      }
    });
    setSegments(updated);
    setActiveSegId(newId);
    showToast(`Split clip at ${formatTimecode(currentTime)}`);
  }, [segments, currentTime, meta.duration, showToast]);

  const addNewSegment = () => {
    if (!meta.duration) return;
    const newId = `seg-${Date.now()}`;
    const start = Math.min(meta.duration * 0.25, Math.max(0, currentTime));
    const end = Math.min(meta.duration, start + Math.max(1, meta.duration * 0.35));
    const nextSeg = {
      id: newId,
      start,
      end,
      label: `Segment ${segments.length + 1}`,
    };
    setSegments((prev) => [...prev, nextSeg]);
    setActiveSegId(newId);
    showToast(`Added Clip #${segments.length + 1}`);
  };

  const removeSegment = (id) => {
    if (segments.length <= 1) return;
    const filtered = segments.filter((s) => s.id !== id);
    setSegments(filtered);
    if (activeSegId === id && filtered[0]) {
      setActiveSegId(filtered[0].id);
    }
  };

  const resetSegments = () => {
    if (!meta.duration) return;
    const initial = { id: 'seg-1', start: 0, end: meta.duration, label: 'Segment 1' };
    setSegments([initial]);
    setActiveSegId('seg-1');
    showToast('Reset trim to full video');
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleSpeedChange = (rate) => {
    const num = Number(rate) || 1;
    setPlaybackRate(num);
    if (videoRef.current) {
      videoRef.current.playbackRate = num;
    }
  };

  const stepFrame = useCallback(
    (dir) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      setIsPlaying(false);
      const step = 1 / (meta.fps || 30);
      const next = Math.max(0, Math.min(meta.duration || 0, v.currentTime + dir * step));
      v.currentTime = next;
      setCurrentTime(next);
    },
    [meta.fps, meta.duration]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!videoFile || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setOutPoint();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === ',' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(-1);
      } else if (e.key === '.' || e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoFile, togglePlay, setInPoint, setOutPoint, splitAtPlayhead, stepFrame]);

  // Interactive Timeline Mouse Dragging
  const getTimelineSecondsFromEvent = useCallback(
    (clientX) => {
      const el = timelineRef.current;
      if (!el || !meta.duration) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * meta.duration;
    },
    [meta.duration]
  );

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      const sec = getTimelineSecondsFromEvent(e.clientX);
      if (dragState.type === 'playhead') {
        setCurrentTime(sec);
        if (videoRef.current) videoRef.current.currentTime = sec;
      } else if (dragState.type === 'start') {
        setSegments((prev) =>
          prev.map((s) =>
            s.id === dragState.segId
              ? { ...s, start: Math.max(0, Math.min(sec, s.end - 0.1)) }
              : s
          )
        );
      } else if (dragState.type === 'end') {
        setSegments((prev) =>
          prev.map((s) =>
            s.id === dragState.segId
              ? { ...s, end: Math.min(meta.duration, Math.max(sec, s.start + 0.1)) }
              : s
          )
        );
      }
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragState, getTimelineSecondsFromEvent, meta.duration]);

  // Execute Lossless Cut/Split or NVENC / WebCodecs / WASM Compression
  const handleRunAction = async () => {
    if (!videoFile || isProcessing) return;
    setIsProcessing(true);
    setProgress(0.02);
    setEncodingStats({ fps: 0, speed: '', frame: 0, totalFrames: 0 });
    setErrorMsg('');

    try {
      const start = activeSegment?.start || 0;
      const end = activeSegment?.end || meta.duration;

      if (workflowMode === 'lossless') {
        if (nvencAvailable) {
          const res = await runNativeNvencJob({
            file: videoFile,
            workflowMode: 'lossless',
            segments,
            mergeSegments,
            losslessStripAudio,
            onProgress: ({ progress: p, fps, speed }) => {
              setProgress(p);
              setEncodingStats((prev) => ({ ...prev, fps: fps || 0, speed: speed || '' }));
            },
            onLog: appendLog,
          });
          setOutputResult(res);
        } else {
          const res = await losslessSplitOrTrim({
            file: videoFile,
            segments,
            mergeSegments,
            stripAudio: losslessStripAudio,
            onProgress: ({ progress: p }) => setProgress(p),
            onLog: appendLog,
          });
          setOutputResult(res);
        }
      } else if (engineType === 'nvenc' && nvencAvailable) {
        const res = await runNativeNvencJob({
          file: videoFile,
          workflowMode: 'compress',
          startTime: start,
          endTime: end,
          width: targetDims.width,
          height: targetDims.height,
          fps: fpsPreset,
          codec,
          rateControlMode,
          crf,
          targetVideoKbps: bitratePlan.videoKbps,
          audioMode,
          audioBitrateKbps,
          psychoVisualHq,
          onProgress: ({ progress: p, fps, speed }) => {
            setProgress(p);
            setEncodingStats((prev) => ({
              ...prev,
              fps: fps || prev.fps,
              speed: speed || prev.speed,
            }));
          },
          onLog: appendLog,
        });
        setOutputResult(res);
      } else if (engineType === 'webcodecs') {
        const res = await webcodecsGpuCompress({
          file: videoFile,
          startTime: start,
          endTime: end,
          width: targetDims.width,
          height: targetDims.height,
          fps: fpsPreset,
          codec,
          rateControlMode,
          crf,
          targetVideoKbps: bitratePlan.videoKbps,
          audioMode,
          audioBitrateKbps,
          onProgress: ({ progress: p, fps, frame, totalFrames, speed }) => {
            setProgress(p);
            setEncodingStats({
              fps: fps || 0,
              frame: frame || 0,
              totalFrames: totalFrames || 0,
              speed: speed || '',
            });
          },
          onLog: appendLog,
        });
        setOutputResult(res);
      } else {
        const res = await wasmCompressVideo({
          file: videoFile,
          startTime: start,
          endTime: end,
          width: targetDims.width,
          height: targetDims.height,
          fps: fpsPreset,
          rateControlMode,
          crf,
          targetVideoKbps: bitratePlan.videoKbps,
          audioMode,
          audioBitrateKbps,
          onProgress: ({ progress: p }) => setProgress(p),
          onLog: appendLog,
        });
        setOutputResult(res);
      }
      setProgress(1);
      showToast('Video processing complete!');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during video processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerDownload = (item) => {
    if (!item?.url) return;
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.filename || 'veloxcut_output.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeOutputBytes = outputResult?.primary?.size ?? estimatedOutputBytes;

  const savingsPct = useMemo(() => {
    if (!meta.size || !activeOutputBytes) return 0;
    return Math.round(((meta.size - activeOutputBytes) / meta.size) * 100);
  }, [meta.size, activeOutputBytes]);

  const sizeMeterPct = useMemo(() => {
    if (!meta.size || !activeOutputBytes) return 50;
    return Math.max(6, Math.min(100, Math.round((activeOutputBytes / meta.size) * 100)));
  }, [meta.size, activeOutputBytes]);

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-logo">
            <Scissors size={19} />
          </div>
          <div>
            <div className="brand-title">
              VeloxCut
              <span
                className="engine-status-pill"
                title={
                  nvencAvailable
                    ? 'Local NVIDIA NVENC Hardware GPU (2-Pass FullRes + Spatial/Temporal AQ)'
                    : 'WebCodecs Browser Hardware GPU Ready'
                }
              >
                <span className="status-dot" />
                {nvencAvailable ? 'NVIDIA GPU Ready' : 'Hardware GPU Ready'}
              </span>
            </div>
            <div className="brand-subtitle">
              Fast, visually lossless video compression &amp; instant trimming
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mkv,.mov,.mp4,.webm,.avi"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.[0]) loadFile(e.target.files[0]);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowShortcutsModal((v) => !v)}
            title="View Keyboard Shortcuts"
          >
            <Keyboard size={14} />
            Shortcuts
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleLoadDemoVideo}
            disabled={isGeneratingDemo || isProcessing}
          >
            <Sparkles size={13} style={{ color: '#38bdf8' }} />
            {isGeneratingDemo ? 'Creating Demo...' : 'Try Demo Clip'}
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload size={13} />
            {videoFile ? 'Change Video' : 'Open Video'}
          </button>
        </div>
      </header>

      {/* Optional Keyboard Shortcuts Banner */}
      {showShortcutsModal && (
        <div
          style={{
            margin: '12px 24px 0',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'rgba(21, 27, 40, 0.9)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <strong style={{ color: '#38bdf8' }}>Keyboard Shortcuts:</strong>
            <span>
              <span className="kbd-hint">Space</span> Play / Pause
            </span>
            <span>
              <span className="kbd-hint">I</span> Set Start Point
            </span>
            <span>
              <span className="kbd-hint">O</span> Set End Point
            </span>
            <span>
              <span className="kbd-hint">S</span> Split Clip at Playhead
            </span>
            <span>
              <span className="kbd-hint">←</span> / <span className="kbd-hint">→</span> Step 1 Frame
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowShortcutsModal(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="workspace-grid">
        {/* Left Column: Video Stage + Interactive Timeline */}
        <div className="left-stage">
          <div className="stage-card">
            {/* Stage Header */}
            <div className="stage-header">
              {videoFile ? (
                <div className="file-info-bar">
                  <span className="file-title-pill" title={meta.name}>
                    <Film size={15} style={{ color: '#38bdf8', flexShrink: 0 }} />
                    {meta.name}
                  </span>
                  <div className="meta-badges">
                    <span className="meta-tag">
                      <strong>{formatBytes(meta.size)}</strong>
                    </span>
                    <span className="meta-tag">
                      {meta.width}×{meta.height}
                    </span>
                    <span className="meta-tag">{formatTimecode(meta.duration, false)}</span>
                  </div>
                </div>
              ) : (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                  100% local GPU video processing — your files never leave your device
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {outputResult?.primary && (
                  <div className="compare-toggle">
                    <button
                      type="button"
                      className={`compare-tab ${
                        previewMode === 'original' ? 'active-orig' : ''
                      }`}
                      onClick={() => handleSwitchPreviewMode('original')}
                    >
                      Original ({formatBytes(meta.size)})
                    </button>
                    <button
                      type="button"
                      className={`compare-tab ${
                        previewMode === 'output' ? 'active-out' : ''
                      }`}
                      onClick={() => handleSwitchPreviewMode('output')}
                    >
                      <Eye size={13} />
                      Result ({formatBytes(outputResult.primary.size)})
                    </button>
                  </div>
                )}

                {videoFile && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Close video"
                    onClick={handleCloseVideo}
                    disabled={isProcessing}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Video Viewport or Dropzone */}
            <div
              className="video-viewport"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.[0]) {
                  loadFile(e.dataTransfer.files[0]);
                }
              }}
            >
              {!videoFile ? (
                <div
                  className={`dropzone-empty ${isDragOver ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="dropzone-icon-wrap">
                    <Upload size={28} />
                  </div>
                  <h2 className="dropzone-title">
                    Drop a video here to compress or trim
                  </h2>
                  <p className="dropzone-desc">
                    Shrink file size by <strong>50%–75%</strong> with visually lossless GPU encoding,
                    or split clips in <strong>0.2 seconds</strong> without re-encoding.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '10px 18px', fontSize: '13.5px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={15} /> Choose Video File
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '10px 16px', fontSize: '13.5px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadDemoVideo();
                      }}
                    >
                      <Sparkles size={15} style={{ color: '#38bdf8' }} /> Load 4-Scene Demo
                    </button>
                  </div>

                  <div className="dropzone-features">
                    <span className="feature-chip">
                      <ShieldCheck size={14} style={{ color: '#34d399' }} />
                      99% Original Sharpness
                    </span>
                    <span className="feature-chip">
                      <Gauge size={14} style={{ color: '#38bdf8' }} />
                      Exact Target MB Mode
                    </span>
                    <span className="feature-chip">
                      <Scissors size={14} style={{ color: '#a78bfa' }} />
                      Instant Lossless Cut
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Floating badge showing whether user is viewing Original or Compressed Output */}
                  <div
                    className={`viewport-badge-overlay ${
                      previewMode === 'output' ? 'viewport-badge-out' : 'viewport-badge-orig'
                    }`}
                  >
                    {previewMode === 'output' && outputResult?.primary ? (
                      <>
                        <CheckCircle2 size={13} />
                        Compressed Output · {formatBytes(outputResult.primary.size)}
                        {savingsPct > 0 ? ` (-${savingsPct}%)` : ''}
                      </>
                    ) : (
                      <>Original Source · {formatBytes(meta.size)}</>
                    )}
                  </div>

                  <video
                    ref={videoRef}
                    src={
                      previewMode === 'output' && outputResult?.primary?.url
                        ? outputResult.primary.url
                        : videoUrl
                    }
                    onLoadedMetadata={(e) => {
                      e.currentTarget.playbackRate = playbackRate;
                      if (savedTimeRef.current > 0) {
                        e.currentTarget.currentTime = Math.min(
                          e.currentTarget.duration || 0,
                          savedTimeRef.current
                        );
                        savedTimeRef.current = 0;
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const t = e.currentTarget.currentTime;
                      setCurrentTime(t);
                      if (
                        loopSegment &&
                        previewMode === 'original' &&
                        activeSegment &&
                        t >= activeSegment.end
                      ) {
                        e.currentTarget.currentTime = activeSegment.start;
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onClick={togglePlay}
                  />

                  <div className={`video-BigPlayOverlay ${!isPlaying ? 'is-paused' : ''}`}>
                    <div className="big-play-circle">
                      <Play size={24} style={{ marginLeft: 3 }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Player Transport & Quick Trim Bar */}
            {videoFile && (
              <div className="transport-bar">
                <div className="transport-group">
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => stepFrame(-1)}
                    title="Previous Frame (← or ,)"
                  >
                    <SkipBack size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={togglePlay}
                    title="Play / Pause (Space)"
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => stepFrame(1)}
                    title="Next Frame (→ or .)"
                  >
                    <SkipForward size={14} />
                  </button>

                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>

                  <select
                    className="speed-select"
                    value={playbackRate}
                    onChange={(e) => handleSpeedChange(e.target.value)}
                    title="Playback Speed"
                  >
                    <option value="0.5">0.5×</option>
                    <option value="1">1×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                  </select>

                  <div className="timecode-box">
                    <span>{formatTimecode(currentTime)}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      / {formatTimecode(meta.duration)}
                    </span>
                  </div>
                </div>

                <div className="transport-group">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={setInPoint}
                    title="Set start of clip to current playhead (Shortcut: I)"
                  >
                    [ Start <span className="kbd-hint">I</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={setOutPoint}
                    title="Set end of clip to current playhead (Shortcut: O)"
                  >
                    End ] <span className="kbd-hint">O</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={splitAtPlayhead}
                    title="Split clip at current playhead (Shortcut: S)"
                  >
                    <Scissors size={13} style={{ color: '#10b981' }} />
                    Split <span className="kbd-hint">S</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={addNewSegment}
                    title="Add another segment"
                  >
                    <Plus size={13} /> Clip
                  </button>
                  {isTrimmedOrMulti && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={resetSegments}
                      title="Reset trim to full video"
                    >
                      <RotateCcw size={13} />
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Timeline Card */}
          {videoFile && (
            <div className="timeline-card">
              <div className="timeline-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Layers size={15} style={{ color: '#38bdf8' }} />
                  <span style={{ fontWeight: 700, fontSize: '13px' }}>Trim &amp; Cut Timeline</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    Selected: <strong style={{ color: '#f8fafc' }}>{formatTimecode(selectedDuration)}</strong>
                    {isTrimmedOrMulti && ` of ${formatTimecode(meta.duration)}`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${loopSegment ? 'selected-emerald' : 'btn-ghost'}`}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11.5px',
                      borderColor: loopSegment ? 'var(--accent-emerald)' : 'transparent',
                    }}
                    onClick={() => setLoopSegment((v) => !v)}
                    title="Loop playback within active segment"
                  >
                    <Repeat size={12} />
                    Loop Selection
                  </button>
                </div>
              </div>

              {/* Time Ruler */}
              <div className="timeline-ruler">
                <span>00:00</span>
                <span>{formatTimecode(meta.duration * 0.25, false)}</span>
                <span>{formatTimecode(meta.duration * 0.5, false)}</span>
                <span>{formatTimecode(meta.duration * 0.75, false)}</span>
                <span>{formatTimecode(meta.duration, false)}</span>
              </div>

              {/* Track */}
              <div
                ref={timelineRef}
                className="timeline-track-wrapper"
                onMouseMove={(e) => {
                  const sec = getTimelineSecondsFromEvent(e.clientX);
                  setHoverTime(sec);
                }}
                onMouseLeave={() => setHoverTime(null)}
                onMouseDown={(e) => {
                  const sec = getTimelineSecondsFromEvent(e.clientX);
                  setCurrentTime(sec);
                  if (videoRef.current) videoRef.current.currentTime = sec;
                  setDragState({ type: 'playhead' });
                }}
              >
                {filmstrip.length > 0 && (
                  <div className="filmstrip-row">
                    {filmstrip.map((src, idx) => (
                      <img key={idx} src={src} alt="" className="filmstrip-thumb" />
                    ))}
                  </div>
                )}

                {/* Hover Scrub Guide & Timecode Tooltip */}
                {hoverTime !== null && meta.duration > 0 && (
                  <>
                    <div
                      className="timeline-hover-line"
                      style={{ left: `${(hoverTime / meta.duration) * 100}%` }}
                    />
                    <div
                      className="timeline-hover-tooltip"
                      style={{
                        left: `${Math.max(4, Math.min(96, (hoverTime / meta.duration) * 100))}%`,
                      }}
                    >
                      {formatTimecode(hoverTime)}
                    </div>
                  </>
                )}

                {segments.map((seg, index) => {
                  const leftPct = meta.duration ? (seg.start / meta.duration) * 100 : 0;
                  const widthPct = meta.duration
                    ? Math.max(0.8, ((seg.end - seg.start) / meta.duration) * 100)
                    : 100;
                  const isActive = seg.id === activeSegId;

                  return (
                    <div
                      key={seg.id}
                      className={`segment-block ${isActive ? 'active' : ''}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setActiveSegId(seg.id);
                      }}
                    >
                      <div
                        className="segment-handle"
                        title="Drag Start Point"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setActiveSegId(seg.id);
                          setDragState({ type: 'start', segId: seg.id });
                        }}
                      />
                      <span className="segment-label-inside">
                        Clip #{index + 1} · {formatTimecode(seg.start, false)} –{' '}
                        {formatTimecode(seg.end, false)} ({(seg.end - seg.start).toFixed(1)}s)
                      </span>
                      <div
                        className="segment-handle"
                        title="Drag End Point"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setActiveSegId(seg.id);
                          setDragState({ type: 'end', segId: seg.id });
                        }}
                      />
                    </div>
                  );
                })}

                <div
                  className="playhead-line"
                  style={{
                    left: `${meta.duration ? (currentTime / meta.duration) * 100 : 0}%`,
                  }}
                >
                  <div className="playhead-cap" />
                </div>
              </div>

              {/* Segment Chips List */}
              <div className="segments-pill-list">
                <div className="segments-chips-wrap">
                  {segments.map((seg, idx) => {
                    const isActive = seg.id === activeSegId;
                    return (
                      <div
                        key={seg.id}
                        className={`segment-chip ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setActiveSegId(seg.id);
                          if (videoRef.current) {
                            videoRef.current.currentTime = seg.start;
                            setCurrentTime(seg.start);
                          }
                        }}
                      >
                        <strong style={{ color: isActive ? '#34d399' : 'var(--text-primary)' }}>
                          Clip #{idx + 1}
                        </strong>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '11.5px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {formatTimecode(seg.start, false)} → {formatTimecode(seg.end, false)} (
                          {(seg.end - seg.start).toFixed(1)}s)
                        </span>
                        {segments.length > 1 && (
                          <button
                            type="button"
                            className="segment-chip-remove"
                            title="Remove this clip"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSegment(seg.id);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Drag green handles to trim, or press <span className="kbd-hint">S</span> to split
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Clean, Goal-Oriented Controls */}
        <aside className="right-sidebar">
          <div className="sidebar-card">
            {/* Workflow Mode Tabs */}
            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-tab ${workflowMode === 'compress' ? 'active-compress' : ''}`}
                onClick={() => setWorkflowMode('compress')}
              >
                <Zap size={14} />
                Compress &amp; Shrink
              </button>
              <button
                type="button"
                className={`mode-tab ${workflowMode === 'lossless' ? 'active-lossless' : ''}`}
                onClick={() => setWorkflowMode('lossless')}
              >
                <Scissors size={14} />
                Lossless Cut / Split
              </button>
            </div>

            {workflowMode === 'lossless' ? (
              <>
                <div
                  style={{
                    padding: '11px 13px',
                    borderRadius: 10,
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '12.5px',
                    color: '#a7f3d0',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>Instant Lossless Stream Copy</strong> — Trims or splits your video in{' '}
                  <strong>~0.2 seconds</strong> without re-encoding. 100% original video quality.
                </div>

                <div className="control-section">
                  <div className="control-label">
                    <span>When Exporting Multiple Clips</span>
                    <span className="val">{segments.length} clip(s)</span>
                  </div>
                  <div className="preset-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`preset-btn ${!mergeSegments ? 'selected-emerald' : ''}`}
                      onClick={() => setMergeSegments(false)}
                    >
                      Save Separate Files
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${mergeSegments ? 'selected-emerald' : ''}`}
                      onClick={() => setMergeSegments(true)}
                    >
                      Merge Into One Video
                    </button>
                  </div>
                </div>

                <div className="control-section">
                  <div className="control-label">
                    <span>Audio Track</span>
                  </div>
                  <div className="preset-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`preset-btn ${!losslessStripAudio ? 'selected-emerald' : ''}`}
                      onClick={() => setLosslessStripAudio(false)}
                    >
                      <Volume2 size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      Keep Original Audio
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${losslessStripAudio ? 'selected-emerald' : ''}`}
                      onClick={() => setLosslessStripAudio(true)}
                    >
                      <VolumeX size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      Mute Audio
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 1. One-Click Quick Presets */}
                <div className="control-section">
                  <div className="control-label">
                    <span>1-Click Quick Presets</span>
                    <span className="val" style={{ color: qualityHealth.color }}>
                      {qualityHealth.label}
                    </span>
                  </div>
                  <div className="quick-presets-grid">
                    <button
                      type="button"
                      className={`quick-preset-card ${
                        activeQuickPreset === 'smart-lossless' ? 'active' : ''
                      }`}
                      onClick={() => applyQuickPreset('smart-lossless')}
                    >
                      <span className="quick-preset-title">
                        <Sparkles size={12} style={{ color: '#34d399' }} />
                        Best Quality (Auto)
                      </span>
                      <span className="quick-preset-sub">99% sharpness · ~55% smaller</span>
                    </button>

                    <button
                      type="button"
                      className={`quick-preset-card ${
                        activeQuickPreset === 'discord-10' ? 'active' : ''
                      }`}
                      onClick={() => applyQuickPreset('discord-10')}
                    >
                      <span className="quick-preset-title">
                        <Gauge size={12} style={{ color: '#38bdf8' }} />
                        Fit Under 10 MB
                      </span>
                      <span className="quick-preset-sub">Discord &amp; email ready</span>
                    </button>

                    <button
                      type="button"
                      className={`quick-preset-card ${
                        activeQuickPreset === 'share-25' ? 'active' : ''
                      }`}
                      onClick={() => applyQuickPreset('share-25')}
                    >
                      <span className="quick-preset-title">
                        <Gauge size={12} style={{ color: '#818cf8' }} />
                        Fit Under 25 MB
                      </span>
                      <span className="quick-preset-sub">High-clarity web upload</span>
                    </button>

                    <button
                      type="button"
                      className={`quick-preset-card ${
                        activeQuickPreset === 'compact-720' ? 'active' : ''
                      }`}
                      onClick={() => applyQuickPreset('compact-720')}
                    >
                      <span className="quick-preset-title">
                        <Zap size={12} style={{ color: '#fbbf24' }} />
                        Compact 720p
                      </span>
                      <span className="quick-preset-sub">Smallest size for chat</span>
                    </button>
                  </div>
                </div>

                <div className="section-divider" />

                {/* 2. Compression Method: By Quality vs By Target Size */}
                <div className="control-section">
                  <div className="control-label">
                    <span>Compression Mode</span>
                  </div>
                  <div className="preset-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`preset-btn ${
                        rateControlMode === 'crf' ? 'selected-emerald' : ''
                      }`}
                      onClick={() => setRateControlMode('crf')}
                    >
                      <ShieldCheck size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      By Visual Quality
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${rateControlMode === 'size' ? 'selected' : ''}`}
                      onClick={() => setRateControlMode('size')}
                    >
                      <Gauge size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      Exact File Size (MB)
                    </button>
                  </div>
                </div>

                {rateControlMode === 'crf' ? (
                  <div className="control-section">
                    <div className="control-label">
                      <span>Quality Level</span>
                      <span className="val">
                        {crf <= 20
                          ? 'Visually Lossless'
                          : crf <= 23
                          ? 'High Quality'
                          : crf <= 26
                          ? 'Balanced'
                          : 'Max Shrink'}{' '}
                        (CQ {crf})
                      </span>
                    </div>
                    <div className="preset-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                      {[
                        { label: 'Lossless', val: 19 },
                        { label: 'Sharp HQ', val: 22 },
                        { label: 'Balanced', val: 25 },
                        { label: 'Small', val: 28 },
                      ].map((q) => (
                        <button
                          key={q.val}
                          type="button"
                          className={`preset-btn ${crf === q.val ? 'selected-emerald' : ''}`}
                          onClick={() => setCrf(q.val)}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="34"
                      step="1"
                      className="range-slider"
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '10.5px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>← Maximum Sharpness</span>
                      <span>Smaller File Size →</span>
                    </div>
                  </div>
                ) : (
                  <div className="control-section">
                    <div className="control-label">
                      <span>Target File Size Limit</span>
                      <span className="val">
                        {targetSizeMB} MB (~{bitratePlan.videoKbps} kbps)
                      </span>
                    </div>
                    <div className="preset-grid">
                      {[
                        { label: '8 MB', mb: 8 },
                        { label: '10 MB', mb: 10 },
                        { label: '25 MB', mb: 25 },
                        { label: '50 MB', mb: 50 },
                        { label: '100 MB', mb: 100 },
                      ].map((p) => (
                        <button
                          key={p.mb}
                          type="button"
                          className={`preset-btn ${
                            Math.abs(targetSizeMB - p.mb) < 0.05 ? 'selected' : ''
                          }`}
                          onClick={() => setTargetSizeMB(p.mb)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ marginTop: 4 }}>
                      <div className="control-label" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: '11px' }}>
                          Scale by % ({targetSizePct}%) or type exact MB:
                        </span>
                      </div>
                      <div className="input-row">
                        <input
                          type="range"
                          min="10"
                          max="90"
                          step="5"
                          className="range-slider"
                          value={targetSizePct}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            setTargetSizePct(pct);
                            if (meta.size > 0) {
                              const origMB = meta.size / (1024 * 1024);
                              setTargetSizeMB(
                                Math.max(0.2, Number(((origMB * pct) / 100).toFixed(2)))
                              );
                            }
                          }}
                        />
                        <input
                          type="number"
                          min="0.2"
                          max="2000"
                          step="0.5"
                          className="number-input"
                          style={{ width: 86, textAlign: 'right' }}
                          value={targetSizeMB}
                          onChange={(e) =>
                            setTargetSizeMB(Math.max(0.2, Number(e.target.value) || 1))
                          }
                        />
                      </div>
                    </div>

                    {qualityHealth.needsOptimize && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          marginTop: 4,
                          borderColor: 'rgba(251, 146, 60, 0.45)',
                          background: 'rgba(251, 146, 60, 0.1)',
                          color: '#fdba74',
                          width: '100%',
                        }}
                        onClick={handleAutoOptimizeForTargetSize}
                      >
                        <Sparkles size={13} />
                        Auto-Optimize Resolution for {targetSizeMB} MB
                      </button>
                    )}
                  </div>
                )}

                {/* 3. Resolution, Frame Rate & Audio */}
                <div className="control-section">
                  <div className="control-label">
                    <span>Resolution &amp; Frame Rate</span>
                    <span className="val">
                      {targetDims.width}×{targetDims.height} ·{' '}
                      {fpsPreset === 'original' ? `${meta.fps} fps` : `${fpsPreset} fps`}
                    </span>
                  </div>
                  <div className="input-row">
                    <select
                      className="select-input"
                      value={resolutionPreset}
                      onChange={(e) => setResolutionPreset(e.target.value)}
                    >
                      <option value="original">Original ({meta.width}×{meta.height})</option>
                      <option value="2160">4K UHD (2160p)</option>
                      <option value="1440">2K QHD (1440p)</option>
                      <option value="1080">Full HD (1080p)</option>
                      <option value="720">HD (720p)</option>
                      <option value="480">SD (480p)</option>
                      <option value="360">Compact (360p)</option>
                    </select>
                    <select
                      className="select-input"
                      style={{ width: '140px' }}
                      value={fpsPreset}
                      onChange={(e) => setFpsPreset(e.target.value)}
                    >
                      <option value="original">Same FPS</option>
                      <option value="60">60 FPS</option>
                      <option value="30">30 FPS</option>
                      <option value="24">24 FPS</option>
                      <option value="15">15 FPS</option>
                    </select>
                  </div>
                </div>

                <div className="control-section">
                  <div className="control-label">
                    <span>Audio</span>
                    <span className="val">
                      {audioMode === 'strip'
                        ? 'Muted'
                        : audioMode === 'copy'
                        ? 'Original Lossless'
                        : `AAC ${audioBitrateKbps}k`}
                    </span>
                  </div>
                  <div className="preset-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <button
                      type="button"
                      className={`preset-btn ${audioMode === 'copy' ? 'selected-emerald' : ''}`}
                      onClick={() => setAudioMode('copy')}
                    >
                      Keep Original
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${audioMode === 'aac' ? 'selected' : ''}`}
                      onClick={() => setAudioMode('aac')}
                    >
                      Compress AAC
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${audioMode === 'strip' ? 'selected' : ''}`}
                      onClick={() => setAudioMode('strip')}
                    >
                      Mute Audio
                    </button>
                  </div>
                </div>

                {/* 4. Collapsible Pro / GPU Encoder Settings */}
                <div className="pro-accordion">
                  <button
                    type="button"
                    className="pro-accordion-header"
                    onClick={() => setShowProSettings((v) => !v)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Sliders size={13} style={{ color: '#38bdf8' }} />
                      Pro Codec &amp; GPU Tuning
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '11px',
                        color: '#34d399',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {codec.toUpperCase()} {psychoVisualHq ? '· 2-Pass AQ' : ''}
                      {showProSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>

                  {showProSettings && (
                    <div className="pro-accordion-body">
                      <div className="control-section">
                        <div className="control-label">
                          <span>Video Codec</span>
                          <span className="val">
                            {codec === 'hevc' ? '45% smaller than H.264' : 'Universal'}
                          </span>
                        </div>
                        <div className="preset-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          {[
                            { id: 'hevc', label: 'HEVC (H.265)', sub: 'Best Efficiency' },
                            { id: 'h264', label: 'H.264 (AVC)', sub: 'Max Compatibility' },
                            { id: 'av1', label: 'AV1', sub: 'Next-Gen' },
                          ].map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`preset-btn ${codec === c.id ? 'selected-emerald' : ''}`}
                              onClick={() => setCodec(c.id)}
                            >
                              {c.label}
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: '9.5px',
                                  color: codec === c.id ? '#a7f3d0' : 'var(--text-muted)',
                                  marginTop: 1,
                                }}
                              >
                                {c.sub}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: psychoVisualHq
                            ? 'rgba(16, 185, 129, 0.09)'
                            : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${
                            psychoVisualHq ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'
                          }`,
                          cursor: 'pointer',
                        }}
                        onClick={() => setPsychoVisualHq((v) => !v)}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399' }}>
                            Psycho-Visual GPU Enhancer
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                            2-Pass FullRes + Spatial/Temporal AQ + 24f Lookahead
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={psychoVisualHq}
                          onChange={(e) => setPsychoVisualHq(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: 16,
                            height: 16,
                            accentColor: '#10b981',
                            cursor: 'pointer',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Live Size Comparison & Savings Meter */}
            <div className="estimate-box">
              <div className="estimate-row">
                <span style={{ color: 'var(--text-secondary)' }}>Original Size</span>
                <strong>{videoFile ? formatBytes(meta.size) : '—'}</strong>
              </div>
              <div className="estimate-row">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {outputResult?.primary ? 'Final Output Size' : 'Estimated Output'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <strong style={{ color: '#38bdf8', fontSize: '13.5px' }}>
                    {videoFile ? formatBytes(activeOutputBytes) : '—'}
                  </strong>
                  {videoFile && savingsPct > 0 && (
                    <span className="savings-badge">Save {savingsPct}%</span>
                  )}
                </div>
              </div>
              {videoFile && (
                <div className="size-meter-track" title={`Output is ${sizeMeterPct}% of original size`}>
                  <div className="size-meter-fill" style={{ width: `${sizeMeterPct}%` }} />
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              className={`btn action-cta ${
                workflowMode === 'lossless' ? 'btn-emerald' : 'btn-primary'
              }`}
              disabled={!videoFile || isProcessing}
              onClick={handleRunAction}
            >
              {isProcessing ? (
                <>
                  Processing... {Math.round(progress * 100)}%
                  {encodingStats.fps > 0 ? ` · ${encodingStats.fps} FPS` : ''}
                  {encodingStats.speed ? ` (${encodingStats.speed})` : ''}
                </>
              ) : !videoFile ? (
                <>Select a Video to Start</>
              ) : workflowMode === 'lossless' ? (
                <>
                  <Scissors size={16} />
                  Export Lossless {segments.length > 1 && !mergeSegments ? 'Split' : 'Cut'} (
                  {segments.length} {segments.length === 1 ? 'Clip' : 'Clips'})
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Compress Video ({codec.toUpperCase()} · {targetDims.width}×{targetDims.height})
                </>
              )}
            </button>

            {/* Live Progress Bar */}
            {isProcessing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11.5px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>
                    {workflowMode === 'lossless'
                      ? 'Copying video stream (-c copy)...'
                      : `Hardware GPU Encoding (${codec.toUpperCase()})...`}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {encodingStats.fps > 0
                      ? `${encodingStats.fps} FPS ${
                          encodingStats.speed ? `· ${encodingStats.speed}` : ''
                        }`
                      : `${Math.round(progress * 100)}%`}
                  </span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.35)',
                  color: '#fda4af',
                  fontSize: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* Completed Output & Download Card */}
          {outputResult?.primary && (
            <div className="result-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700 }}>
                  <CheckCircle2 size={17} style={{ color: '#34d399' }} />
                  <span>Ready in {outputResult.elapsedSec.toFixed(2)}s</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {outputResult.engineUsed}
                </span>
              </div>

              <div className="estimate-row" style={{ fontSize: '13px' }}>
                <span>
                  {formatBytes(meta.size)} →{' '}
                  <strong style={{ color: '#34d399' }}>
                    {formatBytes(outputResult.primary.size)}
                  </strong>
                </span>
                {savingsPct > 0 && (
                  <span className="savings-badge">
                    Saved {savingsPct}% ({formatBytes(Math.max(0, meta.size - outputResult.primary.size))})
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-emerald"
                  style={{ flex: 1, padding: '10px 14px' }}
                  onClick={() => triggerDownload(outputResult.primary)}
                >
                  <Download size={15} />
                  Download Video
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    handleSwitchPreviewMode(previewMode === 'output' ? 'original' : 'output')
                  }
                >
                  <Eye size={14} />
                  {previewMode === 'output' ? 'View Original' : 'Compare Quality'}
                </button>
              </div>

              {outputResult.segments?.length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginTop: 4,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Split Clips ({outputResult.segments.length} files):
                  </div>
                  {outputResult.segments.map((seg) => (
                    <div
                      key={seg.index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.28)',
                        padding: '7px 10px',
                        borderRadius: 7,
                        fontSize: '12px',
                      }}
                    >
                      <span>
                        <strong>Clip #{seg.index}</strong> ({formatTimecode(seg.start, false)}–
                        {formatTimecode(seg.end, false)}) · {formatBytes(seg.size)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => triggerDownload(seg)}
                      >
                        <Download size={12} /> Save
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compact Engine Console Logs Drawer */}
          <div className="sidebar-card" style={{ padding: '10px 14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setShowLogs((s) => !s)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '12px' }}>
                <Terminal size={13} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Engine Console Logs
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {showLogs ? 'Hide' : 'Show'}
              </span>
            </div>
            {showLogs && (
              <div className="log-drawer">
                {logs.length === 0 ? 'Engine ready. Waiting for job...' : logs.join('\n')}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Subtle Floating Toast Feedback */}
      {toastMsg && (
        <div className="toast-pill">
          <Sparkles size={14} style={{ color: '#38bdf8' }} />
          {toastMsg}
        </div>
      )}
    </div>
  );
}
