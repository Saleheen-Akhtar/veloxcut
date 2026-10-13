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
  Maximize2,
  Activity,
  Cpu,
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

// Custom Supersonic Kinetic Delta Logo
function VeloxLogo() {
  return (
    <div className="brand-vector-mark">
      <svg
        width="24"
        height="24"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 4L13 24L16 18L7.5 4H3Z"
          fill="url(#velox-grad-amber)"
        />
        <path
          d="M25 4L15 24L12 18L20.5 4H25Z"
          fill="url(#velox-grad-cyan)"
        />
        <path
          d="M14 2L15.8 8.5H12.2L14 2Z"
          fill="#fde047"
        />
        <defs>
          <linearGradient id="velox-grad-amber" x1="3" y1="4" x2="16" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#ea580c" />
          </linearGradient>
          <linearGradient id="velox-grad-cyan" x1="25" y1="4" x2="12" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

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
  const wipeVideoRef = useRef(null);
  const timelineRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopSegment, setLoopSegment] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  
  // Preview modes: 'original' | 'output' | 'split-wipe'
  const [previewMode, setPreviewMode] = useState('original');
  const [wipePercent, setWipePercent] = useState(50);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);
  
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
  const [crf, setCrf] = useState(20);
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
            'NVIDIA NVENC Hardware Accelerator online. HEVC & H.264 Psycho-Visual 2-Pass Lookahead ready.'
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

  // Quality Health assessment
  const qualityHealth = useMemo(() => {
    if (rateControlMode === 'crf') {
      if (crf <= 20) return { label: '99% Visually Lossless', color: '#f59e0b', needsOptimize: false };
      if (crf <= 23) return { label: '96% Studio HQ', color: '#38bdf8', needsOptimize: false };
      if (crf <= 26) return { label: '90% Balanced Clarity', color: '#10b981', needsOptimize: false };
      return { label: 'Ultra-Slim File', color: '#fb923c', needsOptimize: false };
    }

    const effFps = fpsPreset === 'original' ? meta.fps || 30 : Number(fpsPreset);
    const pixelsPerSec = targetDims.width * targetDims.height * effFps;
    const codecBoost = codec === 'hevc' || codec === 'av1' ? 1.55 : 1.0;
    const effectiveBpp = ((bitratePlan.videoKbps * 1000) / Math.max(1, pixelsPerSec)) * codecBoost;

    if (effectiveBpp >= 0.075) {
      return { label: '99% Sharp Target Fit', color: '#34d399', needsOptimize: false };
    }
    if (effectiveBpp >= 0.045) {
      return { label: 'Balanced Target Clarity', color: '#38bdf8', needsOptimize: false };
    }
    return {
      label: 'Tight Bitrate for Resolution',
      color: '#f97316',
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
    showToast(`Conditioned parameters for ${targetSizeMB} MB target`);
  };

  // 1-Click Quick Presets detection
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
      showToast('Engaged Zero Loss (CQ 19 HEVC)');
    } else if (id === 'discord-10') {
      setRateControlMode('size');
      setTargetSizeMB(10);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Clamped Bitrate to 10 MB (Discord)');
    } else if (id === 'share-25') {
      setRateControlMode('size');
      setTargetSizeMB(25);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('copy');
      showToast('Set 25 MB Web Stream Target');
    } else if (id === 'compact-720') {
      setRateControlMode('crf');
      setCrf(25);
      setResolutionPreset('720');
      setCodec('hevc');
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Configured Ultra-Slim 720p');
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

  // Filmstrip Thumbnails
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
      // Ignore background thumb errors
    }
  }, []);

  // Load Video File
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
      showToast('Loaded 4-Scene 1080p Studio Clip');
    } catch (err) {
      setErrorMsg(`Could not generate demo: ${err.message}`);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Preview Mode Switcher with Timestamp Sync
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

  // In / Out / Split Operations
  const setInPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.min(currentTime, activeSegment.end - 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, start: clamped } : s))
    );
    showToast(`[ In-Point set: ${formatTimecode(clamped)}`);
  }, [activeSegId, activeSegment.end, currentTime, meta.duration, showToast]);

  const setOutPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.max(currentTime, activeSegment.start + 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, end: clamped } : s))
    );
    showToast(`Out-Point set: ${formatTimecode(clamped)} ]`);
  }, [activeSegId, activeSegment.start, currentTime, meta.duration, showToast]);

  const splitAtPlayhead = useCallback(() => {
    if (!meta.duration) return;
    const target = segments.find(
      (s) => currentTime > s.start + 0.15 && currentTime < s.end - 0.15
    );
    if (!target) {
      showToast('Scrub playhead inside clip to split');
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
          label: `Clip ${segments.length + 1}`,
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
      label: `Clip ${segments.length + 1}`,
    };
    setSegments((prev) => [...prev, nextSeg]);
    setActiveSegId(newId);
    showToast(`Registered Clip #${segments.length + 1}`);
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
    showToast('Reset timeline boundaries');
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
      if (wipeVideoRef.current) wipeVideoRef.current.play();
    } else {
      v.pause();
      setIsPlaying(false);
      if (wipeVideoRef.current) wipeVideoRef.current.pause();
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
    if (videoRef.current) videoRef.current.playbackRate = num;
    if (wipeVideoRef.current) wipeVideoRef.current.playbackRate = num;
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
      if (wipeVideoRef.current) wipeVideoRef.current.currentTime = next;
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

  // Timeline Mouse Dragging
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
        if (wipeVideoRef.current) wipeVideoRef.current.currentTime = sec;
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

  // Dragging A/B Wipe Divider
  useEffect(() => {
    if (!isDraggingWipe) return;
    const onWipeMove = (e) => {
      const el = document.getElementById('cinema-viewport-container');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
      setWipePercent(pct);
    };
    const onWipeUp = () => setIsDraggingWipe(false);
    window.addEventListener('mousemove', onWipeMove);
    window.addEventListener('mouseup', onWipeUp);
    return () => {
      window.removeEventListener('mousemove', onWipeMove);
      window.removeEventListener('mouseup', onWipeUp);
    };
  }, [isDraggingWipe]);

  // Run Compression or Lossless Split
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
        setPreviewMode('split-wipe'); // Default to pro split-wipe comparison!
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
        setPreviewMode('split-wipe');
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
        setPreviewMode('split-wipe');
      }
      setProgress(1);
      showToast('Render completed successfully');
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

  // LED Barometer Segments (16 segments)
  const ledLitCount = useMemo(() => {
    if (!meta.size || !activeOutputBytes) return 8;
    const pct = Math.max(0.05, Math.min(1, activeOutputBytes / meta.size));
    return Math.max(1, Math.round(pct * 16));
  }, [meta.size, activeOutputBytes]);

  return (
    <div className="app-viewport-shell">
      {/* Precision Topbar */}
      <header className="studio-topbar">
        <div className="brand-anchor" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <VeloxLogo />
          <div className="brand-name-group">
            <div className="brand-logotype">
              <span>VELOX</span>
              <span className="brand-slash">//</span>
              <span>CUT</span>
            </div>
            <div className="brand-tagline-hud">
              <span>HARDWARE GPU ACCELERATOR</span>
              <span style={{ color: 'var(--border-strong)' }}>•</span>
              <span style={{ color: 'var(--flare-amber)' }}>SYSTEM 01</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="telemetry-tag active-gpu" title="NVIDIA NVENC CUDA or WebCodecs hardware encoder ready">
            <span className="pulse-led" />
            <span>{nvencAvailable ? 'NVENC CUDA ACTIVE' : 'WEBCODECS GPU ACTIVE'}</span>
          </div>

          <div className="telemetry-tag" style={{ display: 'none' }}>
            <span>{codec.toUpperCase()}</span>
          </div>
        </div>

        <div className="topbar-right-controls">
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
            className="tactile-btn tactile-btn-ghost tactile-btn-sm"
            onClick={() => setShowShortcutsModal((v) => !v)}
            title="Keyboard HUD"
          >
            <Keyboard size={13} />
            <span className="keycap">?</span>
          </button>

          <button
            type="button"
            className="tactile-btn tactile-btn-sm"
            onClick={handleLoadDemoVideo}
            disabled={isGeneratingDemo || isProcessing}
          >
            <Sparkles size={13} style={{ color: 'var(--flare-amber)' }} />
            {isGeneratingDemo ? 'Ingesting Demo...' : 'Load 1080p Demo'}
          </button>

          <button
            type="button"
            className="tactile-btn tactile-btn-flare tactile-btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload size={13} />
            {videoFile ? 'Change Video' : 'Open Video File'}
          </button>
        </div>
      </header>

      {/* Floating Keyboard Shortcuts Drawer */}
      {showShortcutsModal && (
        <div
          style={{
            margin: '12px 24px 0',
            padding: '10px 18px',
            borderRadius: '10px',
            background: '#0d0f17',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--flare-amber)', fontFamily: 'Space Grotesk', fontWeight: 700 }}>
              KEYBOARD SHORTCUTS:
            </span>
            <span>
              <span className="keycap">SPACE</span> Play / Pause
            </span>
            <span>
              <span className="keycap">I</span> Mark In-Point
            </span>
            <span>
              <span className="keycap">O</span> Mark Out-Point
            </span>
            <span>
              <span className="keycap">S</span> Razor Split Clip
            </span>
            <span>
              <span className="keycap">←</span> / <span className="keycap">→</span> Frame Step
            </span>
          </div>
          <button
            type="button"
            className="tactile-btn tactile-btn-ghost tactile-btn-sm"
            onClick={() => setShowShortcutsModal(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Studio Workbench */}
      <main className="studio-workbench">
        {/* Left Column: Cinema Monitor & Timeline */}
        <div className="studio-main-stage">
          <div className="cinema-monitor-card">
            {/* Monitor Top Strip */}
            <div className="monitor-top-strip">
              {videoFile ? (
                <div className="file-telemetry-hud">
                  <span className="file-name-hud" title={meta.name}>
                    {meta.name}
                  </span>
                  <span className="hud-pill">
                    RAW: <strong>{formatBytes(meta.size)}</strong>
                  </span>
                  <span className="hud-pill">
                    {meta.width}×{meta.height} • {meta.fps} FPS
                  </span>
                  <span className="hud-pill" style={{ color: 'var(--flare-amber)' }}>
                    {formatTimecode(meta.duration, false)}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-sub)' }}>
                  <Activity size={14} style={{ color: 'var(--flare-amber)' }} />
                  <span>STANDBY // AWAITING MEDIA INGESTION</span>
                </div>
              )}

              {/* View Modes (Original vs Output vs Split-Wipe) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {outputResult?.primary && (
                  <div style={{ display: 'flex', background: '#090b10', padding: 2, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      className={`tactile-btn tactile-btn-ghost tactile-btn-sm ${
                        previewMode === 'split-wipe' ? 'active-compress' : ''
                      }`}
                      style={{
                        padding: '4px 9px',
                        fontSize: '11px',
                        color: previewMode === 'split-wipe' ? 'var(--flare-amber)' : 'var(--text-sub)',
                        background: previewMode === 'split-wipe' ? 'rgba(245,158,11,0.14)' : 'transparent',
                      }}
                      onClick={() => handleSwitchPreviewMode('split-wipe')}
                    >
                      <Sliders size={12} /> A/B Wipe
                    </button>
                    <button
                      type="button"
                      className={`tactile-btn tactile-btn-ghost tactile-btn-sm ${
                        previewMode === 'original' ? 'active-compress' : ''
                      }`}
                      style={{
                        padding: '4px 9px',
                        fontSize: '11px',
                        color: previewMode === 'original' ? '#ffffff' : 'var(--text-sub)',
                        background: previewMode === 'original' ? 'var(--bg-surface-2)' : 'transparent',
                      }}
                      onClick={() => handleSwitchPreviewMode('original')}
                    >
                      Source ({formatBytes(meta.size)})
                    </button>
                    <button
                      type="button"
                      className={`tactile-btn tactile-btn-ghost tactile-btn-sm ${
                        previewMode === 'output' ? 'active-lossless' : ''
                      }`}
                      style={{
                        padding: '4px 9px',
                        fontSize: '11px',
                        color: previewMode === 'output' ? 'var(--phosphor-green-bright)' : 'var(--text-sub)',
                        background: previewMode === 'output' ? 'rgba(16,185,129,0.14)' : 'transparent',
                      }}
                      onClick={() => handleSwitchPreviewMode('output')}
                    >
                      <Eye size={12} /> Result ({formatBytes(outputResult.primary.size)})
                    </button>
                  </div>
                )}

                {videoFile && (
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-ghost tactile-btn-icon"
                    title="Close Video"
                    onClick={handleCloseVideo}
                    disabled={isProcessing}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Viewport Canvas with Crosshairs */}
            <div
              id="cinema-viewport-container"
              className="cinema-viewport"
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
              {/* Digital Cinema Reticles */}
              <div className="crosshair-reticle crosshair-tl" />
              <div className="crosshair-reticle crosshair-tr" />
              <div className="crosshair-reticle crosshair-bl" />
              <div className="crosshair-reticle crosshair-br" />

              {!videoFile ? (
                <div
                  className={`ingest-dock ${isDragOver ? 'drag-active' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="aperture-radar">
                    <Film size={32} style={{ color: 'var(--flare-amber)' }} />
                  </div>
                  <h2 className="ingest-dock-title">
                    FEED SOURCE MATERIAL TO ACCELERATE
                  </h2>
                  <p className="ingest-dock-desc">
                    Drop any MP4, MKV, MOV, or WebM video. Shrink file sizes by <strong>50%–75%</strong> with
                    psycho-visual GPU encoding, or trim &amp; split clips in <strong>0.2 seconds</strong> with zero re-encoding.
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="tactile-btn tactile-btn-flare"
                      style={{ padding: '10px 20px', fontSize: '13px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={14} /> Ingest Video File
                    </button>
                    <button
                      type="button"
                      className="tactile-btn"
                      style={{ padding: '10px 18px', fontSize: '13px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadDemoVideo();
                      }}
                    >
                      <Sparkles size={14} style={{ color: 'var(--flare-amber)' }} /> Try 1080p Clip
                    </button>
                  </div>

                  <div className="dock-features-strip">
                    <span className="dock-chip">
                      <Cpu size={12} style={{ color: 'var(--phosphor-green-bright)' }} />
                      NVIDIA NVENC 2-PASS LOOKAHEAD
                    </span>
                    <span className="dock-chip">
                      <Scissors size={12} style={{ color: 'var(--flare-amber)' }} />
                      0.2s STREAM-COPY SPLITTER
                    </span>
                    <span className="dock-chip">
                      <ShieldCheck size={12} style={{ color: 'var(--cyber-cyan-bright)' }} />
                      100% PRIVATE &amp; AIR-GAPPED
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Floating HUD status */}
                  <div
                    className={`viewport-hud-overlay ${
                      previewMode === 'output' ? 'viewport-hud-output' : 'viewport-hud-original'
                    }`}
                  >
                    {previewMode === 'split-wipe' ? (
                      <>
                        <Sliders size={12} style={{ color: 'var(--flare-amber)' }} />
                        <span>A/B WIPE // LEFT: SOURCE • RIGHT: RENDER</span>
                      </>
                    ) : previewMode === 'output' && outputResult?.primary ? (
                      <>
                        <CheckCircle2 size={12} />
                        <span>RENDERED // {formatBytes(outputResult.primary.size)} (-{savingsPct}%)</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: 'var(--flare-amber)' }}>●</span>
                        <span>SOURCE FOOTAGE // {formatBytes(meta.size)}</span>
                      </>
                    )}
                  </div>

                  {/* Primary Video Element */}
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
                      if (wipeVideoRef.current && Math.abs(wipeVideoRef.current.currentTime - t) > 0.08) {
                        wipeVideoRef.current.currentTime = t;
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onClick={togglePlay}
                  />

                  {/* Split Wipe Comparison Overlay */}
                  {previewMode === 'split-wipe' && outputResult?.primary && (
                    <div className="split-wipe-wrapper">
                      <div
                        className="split-wipe-video-clip"
                        style={{
                          clipPath: `polygon(${wipePercent}% 0, 100% 0, 100% 100%, ${wipePercent}% 100%)`,
                        }}
                      >
                        <video
                          ref={wipeVideoRef}
                          src={outputResult.primary.url}
                          muted
                          playsInline
                        />
                      </div>

                      {/* Interactive Draggable Wipe Divider */}
                      <div
                        className="split-wipe-divider"
                        style={{ left: `${wipePercent}%` }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingWipe(true);
                        }}
                      >
                        <div className="split-wipe-handle">
                          <span>⇔</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Center Play Overlay */}
                  <div className={`cinema-center-indicator ${!isPlaying ? 'is-paused' : ''}`}>
                    <div className="center-play-reticle">
                      <Play size={26} style={{ marginLeft: 3, color: 'var(--flare-amber)' }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sound & Transport Deck */}
            {videoFile && (
              <div className="sound-transport-deck">
                <div className="transport-cluster">
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-icon"
                    onClick={() => stepFrame(-1)}
                    title="Previous Frame (← or ,)"
                  >
                    <SkipBack size={13} />
                  </button>
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-flare"
                    onClick={togglePlay}
                    title="Play / Pause (Space)"
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                  </button>
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-icon"
                    onClick={() => stepFrame(1)}
                    title="Next Frame (→ or .)"
                  >
                    <SkipForward size={13} />
                  </button>

                  <button
                    type="button"
                    className="tactile-btn tactile-btn-icon"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>

                  {/* Animated VU Meter */}
                  <div className="audio-vu-meter" title="Audio Stream Level">
                    <div className={`vu-bar ${isPlaying && !isMuted ? 'active' : ''}`} style={{ height: isPlaying && !isMuted ? '12px' : '4px' }} />
                    <div className={`vu-bar ${isPlaying && !isMuted ? 'active' : ''}`} style={{ height: isPlaying && !isMuted ? '16px' : '6px' }} />
                    <div className={`vu-bar ${isPlaying && !isMuted ? 'active' : ''}`} style={{ height: isPlaying && !isMuted ? '10px' : '3px' }} />
                    <div className={`vu-bar ${isPlaying && !isMuted ? 'active' : ''}`} style={{ height: isPlaying && !isMuted ? '14px' : '5px' }} />
                  </div>

                  <select
                    className="deck-select"
                    value={playbackRate}
                    onChange={(e) => handleSpeedChange(e.target.value)}
                    title="Playback Rate"
                  >
                    <option value="0.5">0.5×</option>
                    <option value="1">1.0×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2.0×</option>
                  </select>

                  <div className="timecode-lcd-readout">
                    <span>{formatTimecode(currentTime)}</span>
                    <span className="dim-denom">/ {formatTimecode(meta.duration)}</span>
                  </div>
                </div>

                <div className="transport-cluster">
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-sm"
                    onClick={setInPoint}
                    title="Set In-Point (Shortcut: I)"
                  >
                    [ IN <span className="keycap">I</span>
                  </button>
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-sm"
                    onClick={setOutPoint}
                    title="Set Out-Point (Shortcut: O)"
                  >
                    OUT ] <span className="keycap">O</span>
                  </button>
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-sm"
                    onClick={splitAtPlayhead}
                    title="Razor split clip at playhead (Shortcut: S)"
                  >
                    <Scissors size={12} style={{ color: 'var(--flare-amber)' }} />
                    SPLIT <span className="keycap">S</span>
                  </button>
                  <button
                    type="button"
                    className="tactile-btn tactile-btn-sm"
                    onClick={addNewSegment}
                    title="Add new clip region"
                  >
                    <Plus size={12} /> CLIP
                  </button>
                  {isTrimmedOrMulti && (
                    <button
                      type="button"
                      className="tactile-btn tactile-btn-ghost tactile-btn-sm"
                      onClick={resetSegments}
                      title="Reset timeline boundaries"
                    >
                      <RotateCcw size={12} />
                      RESET
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Precision Timeline Deck */}
          {videoFile && (
            <div className="timeline-deck-card">
              <div className="timeline-deck-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Layers size={14} style={{ color: 'var(--flare-amber)' }} />
                  <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '13px' }}>
                    TIMELINE TRIM &amp; MULTI-CLIP SEQUENCER
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-sub)', fontSize: '11.5px' }}>
                    ACTIVE DURATION: <strong style={{ color: 'var(--flare-amber)' }}>{formatTimecode(selectedDuration)}</strong>
                    {isTrimmedOrMulti && ` / ${formatTimecode(meta.duration)}`}
                  </span>
                </div>

                <button
                  type="button"
                  className={`tactile-btn tactile-btn-sm ${loopSegment ? 'tactile-btn-emerald' : 'tactile-btn-ghost'}`}
                  style={{ padding: '3px 8px', fontSize: '11px' }}
                  onClick={() => setLoopSegment((v) => !v)}
                  title="Loop playback between In & Out marks"
                >
                  <Repeat size={12} />
                  LOOP SELECTION
                </button>
              </div>

              {/* Filmstrip & Scrub Bounds */}
              <div
                ref={timelineRef}
                className="timeline-track-bounds"
                onMouseMove={(e) => {
                  const sec = getTimelineSecondsFromEvent(e.clientX);
                  setHoverTime(sec);
                }}
                onMouseLeave={() => setHoverTime(null)}
                onMouseDown={(e) => {
                  const sec = getTimelineSecondsFromEvent(e.clientX);
                  setCurrentTime(sec);
                  if (videoRef.current) videoRef.current.currentTime = sec;
                  if (wipeVideoRef.current) wipeVideoRef.current.currentTime = sec;
                  setDragState({ type: 'playhead' });
                }}
              >
                {filmstrip.length > 0 && (
                  <div className="filmstrip-scroller">
                    {filmstrip.map((src, idx) => (
                      <img key={idx} src={src} alt="" className="filmstrip-frame" />
                    ))}
                  </div>
                )}

                {/* Hover Scrubber Line & Floating Timecode Badge */}
                {hoverTime !== null && meta.duration > 0 && (
                  <>
                    <div
                      className="timeline-scrub-guide"
                      style={{ left: `${(hoverTime / meta.duration) * 100}%` }}
                    />
                    <div
                      className="timeline-hover-badge"
                      style={{
                        left: `${Math.max(4, Math.min(96, (hoverTime / meta.duration) * 100))}%`,
                      }}
                    >
                      {formatTimecode(hoverTime)}
                    </div>
                  </>
                )}

                {/* Clamped Segment Boundaries */}
                {segments.map((seg, index) => {
                  const leftPct = meta.duration ? (seg.start / meta.duration) * 100 : 0;
                  const widthPct = meta.duration
                    ? Math.max(0.8, ((seg.end - seg.start) / meta.duration) * 100)
                    : 100;
                  const isActive = seg.id === activeSegId;

                  return (
                    <div
                      key={seg.id}
                      className={`clip-boundary-block ${isActive ? 'active' : ''}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setActiveSegId(seg.id);
                      }}
                    >
                      <div
                        className="clip-drag-handle"
                        title="Drag In-Point"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setActiveSegId(seg.id);
                          setDragState({ type: 'start', segId: seg.id });
                        }}
                      />
                      <span className="clip-label-tag">
                        #{index + 1} ({formatTimecode(seg.start, false)} → {formatTimecode(seg.end, false)})
                      </span>
                      <div
                        className="clip-drag-handle"
                        title="Drag Out-Point"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setActiveSegId(seg.id);
                          setDragState({ type: 'end', segId: seg.id });
                        }}
                      />
                    </div>
                  );
                })}

                {/* Laser Playhead Needle */}
                <div
                  className="needle-playhead"
                  style={{
                    left: `${meta.duration ? (currentTime / meta.duration) * 100 : 0}%`,
                  }}
                >
                  <div className="needle-diamond" />
                </div>
              </div>

              {/* Clip Pods Strip */}
              <div className="timeline-clip-pills-row">
                <div className="clip-pills-wrap">
                  {segments.map((seg, idx) => {
                    const isActive = seg.id === activeSegId;
                    return (
                      <div
                        key={seg.id}
                        className={`clip-pod ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setActiveSegId(seg.id);
                          if (videoRef.current) {
                            videoRef.current.currentTime = seg.start;
                            setCurrentTime(seg.start);
                          }
                        }}
                      >
                        <strong style={{ color: isActive ? 'var(--flare-amber)' : 'var(--text-main)', fontFamily: 'Space Grotesk' }}>
                          CLIP #{idx + 1}
                        </strong>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: 'var(--text-sub)' }}>
                          {formatTimecode(seg.start, false)} – {formatTimecode(seg.end, false)} ({(seg.end - seg.start).toFixed(1)}s)
                        </span>
                        {segments.length > 1 && (
                          <button
                            type="button"
                            className="clip-remove-x"
                            title="Remove this clip"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSegment(seg.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', color: 'var(--text-dim)' }}>
                  DRAG HANDLES TO TRIM // <span className="keycap">S</span> TO RAZOR SPLIT
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tactical Control Bay */}
        <aside className="tactical-control-bay">
          <div className="control-module-card">
            {/* Master Pipeline Mode Switch */}
            <div className="master-pipeline-switch">
              <button
                type="button"
                className={`pipeline-switch-btn ${workflowMode === 'compress' ? 'active-compress' : ''}`}
                onClick={() => setWorkflowMode('compress')}
              >
                <Zap size={13} />
                ACCELERATED COMPRESS
              </button>
              <button
                type="button"
                className={`pipeline-switch-btn ${workflowMode === 'lossless' ? 'active-lossless' : ''}`}
                onClick={() => setWorkflowMode('lossless')}
              >
                <Scissors size={13} />
                STREAM-COPY CUT
              </button>
            </div>

            {workflowMode === 'lossless' ? (
              <>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: '#a7f3d0',
                  }}
                >
                  <strong style={{ fontFamily: 'Space Grotesk' }}>ZERO RE-ENCODING STREAM COPY:</strong> Trims and splits
                  footage in <strong>~0.2 seconds</strong> with bit-for-bit identical original quality, just like LosslessCut.
                </div>

                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>MULTI-CLIP EXPORT MATRIX</span>
                    <span className="val">{segments.length} CLIPS</span>
                  </div>
                  <div className="matrix-selector-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`deck-pod-btn ${!mergeSegments ? 'selected-emerald' : ''}`}
                      onClick={() => setMergeSegments(false)}
                    >
                      SEPARATE FILES
                    </button>
                    <button
                      type="button"
                      className={`deck-pod-btn ${mergeSegments ? 'selected-emerald' : ''}`}
                      onClick={() => setMergeSegments(true)}
                    >
                      MERGE KEPT CLIPS
                    </button>
                  </div>
                </div>

                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>AUDIO PASSTHROUGH</span>
                  </div>
                  <div className="matrix-selector-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`deck-pod-btn ${!losslessStripAudio ? 'selected-emerald' : ''}`}
                      onClick={() => setLosslessStripAudio(false)}
                    >
                      <Volume2 size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      ORIGINAL AUDIO
                    </button>
                    <button
                      type="button"
                      className={`deck-pod-btn ${losslessStripAudio ? 'selected-emerald' : ''}`}
                      onClick={() => setLosslessStripAudio(true)}
                    >
                      <VolumeX size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      MUTE AUDIO
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Quick Mission Matrix (1-Click Presets) */}
                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>MISSION PRESET MATRIX</span>
                    <span className="val" style={{ color: qualityHealth.color }}>
                      {qualityHealth.label}
                    </span>
                  </div>
                  <div className="mission-matrix-grid">
                    <button
                      type="button"
                      className={`matrix-card ${activeQuickPreset === 'smart-lossless' ? 'active' : ''}`}
                      onClick={() => applyQuickPreset('smart-lossless')}
                    >
                      <span className="matrix-title">
                        <Sparkles size={11} style={{ color: 'var(--flare-amber)' }} />
                        ZERO LOSS AUTO
                      </span>
                      <span className="matrix-sub">99% SHARP • -55% SIZE</span>
                    </button>

                    <button
                      type="button"
                      className={`matrix-card ${activeQuickPreset === 'discord-10' ? 'active' : ''}`}
                      onClick={() => applyQuickPreset('discord-10')}
                    >
                      <span className="matrix-title">
                        <Gauge size={11} style={{ color: 'var(--cyber-cyan)' }} />
                        DISCORD 10 MB
                      </span>
                      <span className="matrix-sub">CLAMPED BITRATE FIT</span>
                    </button>

                    <button
                      type="button"
                      className={`matrix-card ${activeQuickPreset === 'share-25' ? 'active' : ''}`}
                      onClick={() => applyQuickPreset('share-25')}
                    >
                      <span className="matrix-title">
                        <Gauge size={11} style={{ color: '#818cf8' }} />
                        WEB STREAM 25M
                      </span>
                      <span className="matrix-sub">CRISP 1080P SHARE</span>
                    </button>

                    <button
                      type="button"
                      className={`matrix-card ${activeQuickPreset === 'compact-720' ? 'active' : ''}`}
                      onClick={() => applyQuickPreset('compact-720')}
                    >
                      <span className="matrix-title">
                        <Zap size={11} style={{ color: '#fbbf24' }} />
                        ULTRA-SLIM 720P
                      </span>
                      <span className="matrix-sub">LIGHTWEIGHT CHAT</span>
                    </button>
                  </div>
                </div>

                {/* Rate Control: Visual Quality vs Exact MB */}
                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>RATE CONTROL PIPELINE</span>
                  </div>
                  <div className="matrix-selector-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button
                      type="button"
                      className={`deck-pod-btn ${rateControlMode === 'crf' ? 'selected-amber' : ''}`}
                      onClick={() => setRateControlMode('crf')}
                    >
                      <ShieldCheck size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      VISUAL QUALITY CQ
                    </button>
                    <button
                      type="button"
                      className={`deck-pod-btn ${rateControlMode === 'size' ? 'selected-cyan' : ''}`}
                      onClick={() => setRateControlMode('size')}
                    >
                      <Gauge size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      TARGET LIMIT (MB)
                    </button>
                  </div>
                </div>

                {rateControlMode === 'crf' ? (
                  <div className="deck-section">
                    <div className="deck-section-title">
                      <span>PERCEPTUAL FIDELITY (CQ)</span>
                      <span className="val">
                        CQ {crf} //{' '}
                        {crf <= 20
                          ? 'VISUALLY LOSSLESS'
                          : crf <= 23
                          ? 'STUDIO HQ'
                          : crf <= 26
                          ? 'BALANCED'
                          : 'MAX SHRINK'}
                      </span>
                    </div>
                    <div className="matrix-selector-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                      {[
                        { label: 'LOSSLESS', val: 19 },
                        { label: 'STUDIO HQ', val: 22 },
                        { label: 'BALANCED', val: 25 },
                        { label: 'SLIM', val: 28 },
                      ].map((q) => (
                        <button
                          key={q.val}
                          type="button"
                          className={`deck-pod-btn ${crf === q.val ? 'selected-amber' : ''}`}
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
                      className="tactile-slider"
                      value={crf}
                      onChange={(e) => setCrf(Number(e.target.value))}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'JetBrains Mono',
                        fontSize: '10px',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <span>← RAZOR SHARPNESS</span>
                      <span>MAXIMUM SHRINKAGE →</span>
                    </div>
                  </div>
                ) : (
                  <div className="deck-section">
                    <div className="deck-section-title">
                      <span>TARGET FILE SIZE CAP</span>
                      <span className="val">
                        {targetSizeMB} MB (~{bitratePlan.videoKbps} kbps)
                      </span>
                    </div>
                    <div className="matrix-selector-row">
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
                          className={`deck-pod-btn ${
                            Math.abs(targetSizeMB - p.mb) < 0.05 ? 'selected-cyan' : ''
                          }`}
                          onClick={() => setTargetSizeMB(p.mb)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ marginTop: 4 }}>
                      <div className="deck-section-title" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: '10.5px' }}>
                          SCALE BY % ({targetSizePct}%) OR TYPE MB:
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          step="5"
                          className="tactile-slider"
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
                          className="tactile-input"
                          style={{ width: 84, textAlign: 'right' }}
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
                        className="tactile-btn tactile-btn-sm"
                        style={{
                          marginTop: 4,
                          borderColor: 'rgba(249, 115, 22, 0.45)',
                          background: 'rgba(249, 115, 22, 0.12)',
                          color: '#fdba74',
                          width: '100%',
                        }}
                        onClick={handleAutoOptimizeForTargetSize}
                      >
                        <Sparkles size={12} />
                        Auto-Scale Resolution to Fit {targetSizeMB} MB
                      </button>
                    )}
                  </div>
                )}

                {/* Spatial (Res & FPS) Conditioning */}
                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>SPATIAL &amp; TEMPORAL RESOLUTION</span>
                    <span className="val">
                      {targetDims.width}×{targetDims.height} • {fpsPreset === 'original' ? meta.fps : fpsPreset}P
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="tactile-select"
                      value={resolutionPreset}
                      onChange={(e) => setResolutionPreset(e.target.value)}
                    >
                      <option value="original">Original ({meta.width}×{meta.height})</option>
                      <option value="2160">4K UHD (2160p)</option>
                      <option value="1440">2K QHD (1440p)</option>
                      <option value="1080">1080p FHD</option>
                      <option value="720">720p HD</option>
                      <option value="480">480p SD</option>
                      <option value="360">360p Compact</option>
                    </select>
                    <select
                      className="tactile-select"
                      style={{ width: '135px' }}
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

                {/* Audio Track Conditioning */}
                <div className="deck-section">
                  <div className="deck-section-title">
                    <span>AUDIO TRACK CONDITIONING</span>
                  </div>
                  <div className="matrix-selector-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <button
                      type="button"
                      className={`deck-pod-btn ${audioMode === 'copy' ? 'selected-emerald' : ''}`}
                      onClick={() => setAudioMode('copy')}
                    >
                      PASSTHROUGH
                    </button>
                    <button
                      type="button"
                      className={`deck-pod-btn ${audioMode === 'aac' ? 'selected-amber' : ''}`}
                      onClick={() => setAudioMode('aac')}
                    >
                      AAC ENCODE
                    </button>
                    <button
                      type="button"
                      className={`deck-pod-btn ${audioMode === 'strip' ? 'selected-cyan' : ''}`}
                      onClick={() => setAudioMode('strip')}
                    >
                      MUTE
                    </button>
                  </div>
                </div>

                {/* Hardware Turbo Accordion (Pro Settings) */}
                <div className="turbo-accordion">
                  <button
                    type="button"
                    className="turbo-header-btn"
                    onClick={() => setShowProSettings((v) => !v)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Sliders size={13} style={{ color: 'var(--flare-amber)' }} />
                      PRO GPU &amp; CODEC ACCELERATOR
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '11px',
                        color: 'var(--phosphor-green-bright)',
                        fontFamily: 'JetBrains Mono',
                      }}
                    >
                      {codec.toUpperCase()} {psychoVisualHq ? '• 2-PASS AQ' : ''}
                      {showProSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>

                  {showProSettings && (
                    <div className="turbo-body">
                      <div className="deck-section">
                        <div className="deck-section-title">
                          <span>SILICON CODEC ARCHITECTURE</span>
                        </div>
                        <div className="matrix-selector-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          {[
                            { id: 'hevc', label: 'HEVC H.265', sub: '✨ 45% SMALLER' },
                            { id: 'h264', label: 'H.264 AVC', sub: 'UNIVERSAL' },
                            { id: 'av1', label: 'AV1', sub: 'NEXT-GEN' },
                          ].map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`deck-pod-btn ${codec === c.id ? 'selected-amber' : ''}`}
                              onClick={() => setCodec(c.id)}
                            >
                              {c.label}
                              <span
                                style={{
                                  display: 'block',
                                  fontSize: '9px',
                                  color: codec === c.id ? 'var(--flare-amber)' : 'var(--text-dim)',
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
                          padding: '9px 12px',
                          borderRadius: 6,
                          background: psychoVisualHq ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${psychoVisualHq ? 'rgba(245,158,11,0.35)' : 'var(--border-subtle)'}`,
                          cursor: 'pointer',
                        }}
                        onClick={() => setPsychoVisualHq((v) => !v)}
                      >
                        <div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--flare-amber)', fontFamily: 'Space Grotesk' }}>
                            PSYCHO-VISUAL 2-PASS AQ
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-sub)', fontFamily: 'JetBrains Mono' }}>
                            Spatial/temporal adaptivity + 24-frame lookahead
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={psychoVisualHq}
                          onChange={(e) => setPsychoVisualHq(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 16, height: 16, accentColor: 'var(--flare-amber)', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Segmented LED Hologram Barometer (Savings Meter) */}
            <div className="hologram-savings-box">
              <div className="hologram-row">
                <span style={{ color: 'var(--text-sub)' }}>SOURCE FILE:</span>
                <strong>{videoFile ? formatBytes(meta.size) : '—'}</strong>
              </div>
              <div className="hologram-row">
                <span style={{ color: 'var(--text-sub)' }}>
                  {outputResult?.primary ? 'RENDERED FILE:' : 'PREDICTED SIZE:'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ color: 'var(--flare-amber)' }}>
                    {videoFile ? formatBytes(activeOutputBytes) : '—'}
                  </strong>
                  {videoFile && savingsPct > 0 && (
                    <span className="flare-badge">-{savingsPct}%</span>
                  )}
                </div>
              </div>

              {/* 16-Segment LED Barometer */}
              <div className="led-gauge-track" title={`Predicted footprint: ${100 - savingsPct}% of source`}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className={`led-bar-seg ${
                      i < ledLitCount ? 'lit-flare' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Ignition Action CTA */}
            <button
              type="button"
              className={`tactile-btn primary-ignition-cta ${
                workflowMode === 'lossless' ? 'tactile-btn-emerald' : 'tactile-btn-flare'
              }`}
              disabled={!videoFile || isProcessing}
              onClick={handleRunAction}
            >
              {isProcessing ? (
                <>
                  PROCESSING... {Math.round(progress * 100)}%
                  {encodingStats.fps > 0 ? ` • ${encodingStats.fps} FPS` : ''}
                  {encodingStats.speed ? ` (${encodingStats.speed})` : ''}
                </>
              ) : !videoFile ? (
                <>FEED VIDEO TO COMMENCE</>
              ) : workflowMode === 'lossless' ? (
                <>
                  <Scissors size={15} />
                  COMMENCE STREAM-COPY CUT ({segments.length} CLIPS)
                </>
              ) : (
                <>
                  <Zap size={15} />
                  IGNITE GPU ACCELERATION ({codec.toUpperCase()})
                </>
              )}
            </button>

            {/* Real-Time Telemetry Bar During Processing */}
            {isProcessing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="cyber-progress-track">
                  <div
                    className="cyber-progress-fill"
                    style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                    color: 'var(--text-sub)',
                  }}
                >
                  <span>
                    {workflowMode === 'lossless'
                      ? 'STREAM RE-MUXING (-C COPY)...'
                      : `HARDWARE NVENC ENCODING (${codec.toUpperCase()})...`}
                  </span>
                  <span>
                    {encodingStats.fps > 0
                      ? `${encodingStats.fps} FPS • ${encodingStats.speed || 'FAST'}`
                      : `${Math.round(progress * 100)}%`}
                  </span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(244, 63, 94, 0.14)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: '#fda4af',
                  fontSize: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* Mission Complete Result Card */}
          {outputResult?.primary && (
            <div className="mission-complete-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontFamily: 'Space Grotesk' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--phosphor-green-bright)' }} />
                  <span>RENDER COMPLETED IN {outputResult.elapsedSec.toFixed(2)}s</span>
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '10.5px', color: 'var(--text-sub)' }}>
                  {outputResult.engineUsed}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px' }}>
                <span>
                  {formatBytes(meta.size)} →{' '}
                  <strong style={{ color: 'var(--phosphor-green-bright)', fontFamily: 'JetBrains Mono' }}>
                    {formatBytes(outputResult.primary.size)}
                  </strong>
                </span>
                {savingsPct > 0 && (
                  <span className="flare-badge">
                    LIBERATED {savingsPct}% ({formatBytes(Math.max(0, meta.size - outputResult.primary.size))})
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="tactile-btn tactile-btn-emerald"
                  style={{ flex: 1, padding: '10px 14px' }}
                  onClick={() => triggerDownload(outputResult.primary)}
                >
                  <Download size={14} />
                  DOWNLOAD OUTPUT FILE
                </button>
                <button
                  type="button"
                  className="tactile-btn"
                  onClick={() => handleSwitchPreviewMode(previewMode === 'split-wipe' ? 'original' : 'split-wipe')}
                >
                  <Sliders size={13} style={{ color: 'var(--flare-amber)' }} />
                  A/B WIPE
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
                  <div style={{ fontFamily: 'Space Grotesk', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-sub)' }}>
                    INDIVIDUAL SPLIT CLIPS ({outputResult.segments.length} FILES):
                  </div>
                  {outputResult.segments.map((seg) => (
                    <div
                      key={seg.index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#07090e',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: '11.5px',
                        fontFamily: 'JetBrains Mono',
                      }}
                    >
                      <span>
                        <strong>CLIP #{seg.index}</strong> ({formatTimecode(seg.start, false)}–
                        {formatTimecode(seg.end, false)}) • {formatBytes(seg.size)}
                      </span>
                      <button
                        type="button"
                        className="tactile-btn tactile-btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => triggerDownload(seg)}
                      >
                        <Download size={11} /> SAVE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Engine Terminal Console Drawer */}
          <div className="control-module-card" style={{ padding: '10px 14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setShowLogs((s) => !s)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '11.5px' }}>
                <Terminal size={13} style={{ color: 'var(--flare-amber)' }} />
                <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, color: 'var(--text-sub)' }}>
                  GPU PIPELINE TELEMETRY LOGS
                </span>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '10.5px', color: 'var(--text-dim)' }}>
                {showLogs ? 'COLLAPSE' : 'EXPAND'}
              </span>
            </div>
            {showLogs && (
              <div className="engine-terminal-drawer">
                {logs.length === 0 ? 'Silicon GPU pipeline primed. Awaiting stream...' : logs.join('\n')}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Tactical Toast Notification */}
      {toastMsg && (
        <div className="tactical-toast">
          <Sparkles size={13} style={{ color: 'var(--flare-amber)' }} />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
