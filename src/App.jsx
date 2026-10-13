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
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Eye,
  Sliders,
  ChevronDown,
  ChevronUp,
  Repeat,
  X,
  PanelRightClose,
  PanelRightOpen,
  Film,
  Cpu,
  Layers,
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

// Modern, minimalist vector brand logo
function BrandLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 4.5L12 20L14.5 15.5L7.5 4.5H3Z"
        fill="#3b82f6"
      />
      <path
        d="M21 4.5L12 20L15.5 20L21 10.5V4.5Z"
        fill="#60a5fa"
      />
      <circle cx="12" cy="7" r="2" fill="#ffffff" />
    </svg>
  );
}

export default function App() {
  // Video File & Metadata
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

  // Inspector & Layout
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [showProSettings, setShowProSettings] = useState(false);

  // Preview Mode: 'original' | 'output' | 'split-wipe'
  const [previewMode, setPreviewMode] = useState('original');
  const [wipePercent, setWipePercent] = useState(50);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);

  // Filmstrip & Dragging
  const [filmstrip, setFilmstrip] = useState([]);
  const [dragState, setDragState] = useState(null);

  // LosslessCut Segments
  const [segments, setSegments] = useState([
    { id: 'seg-1', start: 0, end: 10, label: 'Clip 1' },
  ]);
  const [activeSegId, setActiveSegId] = useState('seg-1');

  // Hardware Status
  const [nvencAvailable, setNvencAvailable] = useState(false);
  const [gpuCaps, setGpuCaps] = useState({
    webcodecsAvailable: false,
    codecs: {
      h264: { supported: true, hardware: false },
      hevc: { supported: false, hardware: false },
      av1: { supported: false, hardware: false },
    },
  });

  // Settings
  const [workflowMode, setWorkflowMode] = useState('compress'); // 'lossless' | 'compress'
  const [mergeSegments, setMergeSegments] = useState(false);
  const [losslessStripAudio, setLosslessStripAudio] = useState(false);

  const [engineType, setEngineType] = useState('nvenc'); // 'nvenc' | 'webcodecs' | 'wasm'
  const [codec, setCodec] = useState('hevc');
  const [rateControlMode, setRateControlMode] = useState('crf'); // 'crf' | 'size'
  const [crf, setCrf] = useState(20);
  const [psychoVisualHq, setPsychoVisualHq] = useState(true);
  const [targetSizeMB, setTargetSizeMB] = useState(15);
  const [targetSizePct, setTargetSizePct] = useState(50);
  const [resolutionPreset, setResolutionPreset] = useState('original');
  const [fpsPreset, setFpsPreset] = useState('original');
  const [audioMode, setAudioMode] = useState('copy'); // 'copy' | 'aac' | 'strip'
  const [audioBitrateKbps, setAudioBitrateKbps] = useState(160);

  // Processing & Output
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [encodingStats, setEncodingStats] = useState({ fps: 0, speed: '', frame: 0 });
  const [outputResult, setOutputResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2400);
  }, []);

  // Hardware Probe
  useEffect(() => {
    Promise.all([checkNativeNvencStatus(), probeGpuEncoders(1920, 1080)]).then(
      ([nvenc, caps]) => {
        setGpuCaps(caps);
        if (nvenc?.available) {
          setNvencAvailable(true);
          setEngineType('nvenc');
          setCodec('hevc');
        } else if (caps.webcodecsAvailable) {
          setEngineType('webcodecs');
          setCodec(caps.codecs.hevc?.supported ? 'hevc' : 'h264');
        } else {
          setEngineType('wasm');
          setCodec('h264');
        }
      }
    );
  }, []);

  // Active segment
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

  // Quick Preset Helper
  const activeQuickPreset = useMemo(() => {
    if (rateControlMode === 'crf' && crf === 20 && resolutionPreset === 'original' && codec === 'hevc') {
      return 'best';
    }
    if (rateControlMode === 'size' && Math.abs(targetSizeMB - 10) < 0.05) {
      return 'discord';
    }
    if (rateControlMode === 'size' && Math.abs(targetSizeMB - 25) < 0.05) {
      return 'web';
    }
    if (rateControlMode === 'crf' && crf === 25 && resolutionPreset === '720') {
      return 'slim';
    }
    return null;
  }, [rateControlMode, crf, resolutionPreset, codec, targetSizeMB]);

  const applyQuickPreset = (id) => {
    if (id === 'best') {
      setRateControlMode('crf');
      setCrf(20);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setResolutionPreset('original');
      setFpsPreset('original');
      setAudioMode('copy');
      showToast('Preset: Best Quality (Auto)');
    } else if (id === 'discord') {
      setRateControlMode('size');
      setTargetSizeMB(10);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Preset: 10 MB Discord Limit');
    } else if (id === 'web') {
      setRateControlMode('size');
      setTargetSizeMB(25);
      setCodec('hevc');
      setPsychoVisualHq(true);
      setAudioMode('copy');
      showToast('Preset: 25 MB Web Share');
    } else if (id === 'slim') {
      setRateControlMode('crf');
      setCrf(25);
      setResolutionPreset('720');
      setCodec('hevc');
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Preset: 720p Compact');
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

  const activeOutputBytes = outputResult?.primary?.size ?? estimatedOutputBytes;

  const savingsPct = useMemo(() => {
    if (!meta.size || !activeOutputBytes) return 0;
    return Math.round(((meta.size - activeOutputBytes) / meta.size) * 100);
  }, [meta.size, activeOutputBytes]);

  // Generate Filmstrip
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

      const count = 12;
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
      // Ignore thumb errors
    }
  }, []);

  // Load File
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
      setTargetSizeMB(Math.max(0.5, Number((origMB * 0.5).toFixed(1))));
      setTargetSizePct(50);

      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.src = url;
      probe.onloadedmetadata = () => {
        const dur = probe.duration && Number.isFinite(probe.duration) ? probe.duration : 10;
        const w = probe.videoWidth || 1280;
        const h = probe.videoHeight || 720;
        setMeta({
          duration: dur,
          width: w,
          height: h,
          fps: 30,
          size: file.size,
          name: file.name,
        });
        setSegments([{ id: 'seg-1', start: 0, end: dur, label: 'Clip 1' }]);
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

  const handleLoadDemo = async () => {
    try {
      setIsGeneratingDemo(true);
      const demo = await generateDemoVideoFile();
      loadFile(demo);
      showToast('Loaded 1080p Studio Clip');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Preview Mode Switch
  const switchPreview = (mode) => {
    if (mode === previewMode) return;
    if (videoRef.current) savedTimeRef.current = videoRef.current.currentTime;
    setPreviewMode(mode);
  };

  // Timeline Shortcuts
  const setInPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.min(currentTime, activeSegment.end - 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, start: clamped } : s))
    );
    showToast(`Mark In: ${formatTimecode(clamped)}`);
  }, [activeSegId, activeSegment.end, currentTime, meta.duration, showToast]);

  const setOutPoint = useCallback(() => {
    if (!meta.duration) return;
    const clamped = Math.max(currentTime, activeSegment.start + 0.1);
    setSegments((prev) =>
      prev.map((s) => (s.id === activeSegId ? { ...s, end: clamped } : s))
    );
    showToast(`Mark Out: ${formatTimecode(clamped)}`);
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
        updated.push({ ...s, end: currentTime });
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
    showToast(`Split at ${formatTimecode(currentTime)}`);
  }, [segments, currentTime, meta.duration, showToast]);

  const addNewSegment = () => {
    if (!meta.duration) return;
    const newId = `seg-${Date.now()}`;
    const start = Math.min(meta.duration * 0.25, Math.max(0, currentTime));
    const end = Math.min(meta.duration, start + Math.max(1, meta.duration * 0.35));
    setSegments((prev) => [...prev, { id: newId, start, end, label: `Clip ${segments.length + 1}` }]);
    setActiveSegId(newId);
    showToast(`Added Clip #${segments.length + 1}`);
  };

  const removeSegment = (id) => {
    if (segments.length <= 1) return;
    const filtered = segments.filter((s) => s.id !== id);
    setSegments(filtered);
    if (activeSegId === id && filtered[0]) setActiveSegId(filtered[0].id);
  };

  const resetSegments = () => {
    if (!meta.duration) return;
    setSegments([{ id: 'seg-1', start: 0, end: meta.duration, label: 'Clip 1' }]);
    setActiveSegId('seg-1');
    showToast('Reset timeline to full length');
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

  // Keyboard Shortcuts
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

  // Timeline Mouse Drag
  const getTimelineSeconds = useCallback(
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
      const sec = getTimelineSeconds(e.clientX);
      if (dragState.type === 'playhead') {
        setCurrentTime(sec);
        if (videoRef.current) videoRef.current.currentTime = sec;
        if (wipeVideoRef.current) wipeVideoRef.current.currentTime = sec;
      } else if (dragState.type === 'start') {
        setSegments((prev) =>
          prev.map((s) => (s.id === dragState.segId ? { ...s, start: Math.max(0, Math.min(sec, s.end - 0.1)) } : s))
        );
      } else if (dragState.type === 'end') {
        setSegments((prev) =>
          prev.map((s) => (s.id === dragState.segId ? { ...s, end: Math.min(meta.duration, Math.max(sec, s.start + 0.1)) } : s))
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
  }, [dragState, getTimelineSeconds, meta.duration]);

  // Split Wipe Curtain Dragging
  useEffect(() => {
    if (!isDraggingWipe) return;
    const onWipeMove = (e) => {
      const el = document.getElementById('nle-video-container');
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

  // Execute Action
  const handleRunAction = async () => {
    if (!videoFile || isProcessing) return;
    setIsProcessing(true);
    setProgress(0.02);
    setEncodingStats({ fps: 0, speed: '', frame: 0 });
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
          });
          setOutputResult(res);
        } else {
          const res = await losslessSplitOrTrim({
            file: videoFile,
            segments,
            mergeSegments,
            stripAudio: losslessStripAudio,
            onProgress: ({ progress: p }) => setProgress(p),
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
            setEncodingStats((prev) => ({ ...prev, fps: fps || prev.fps, speed: speed || prev.speed }));
          },
        });
        setOutputResult(res);
        setPreviewMode('split-wipe');
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
          onProgress: ({ progress: p, fps, frame, speed }) => {
            setProgress(p);
            setEncodingStats({ fps: fps || 0, frame: frame || 0, speed: speed || '' });
          },
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
        });
        setOutputResult(res);
        setPreviewMode('split-wipe');
      }
      setProgress(1);
      showToast('Export completed successfully');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Export error');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerDownload = (item) => {
    if (!item?.url) return;
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.filename || 'veloxcut_export.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="nle-app-shell">
      {/* 1. TOP NAVBAR */}
      <header className="nle-topbar">
        <div className="topbar-left">
          <div className="app-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="app-brand-logo">
              <BrandLogo />
            </div>
            <span className="app-brand-title">VeloxCut</span>
          </div>

          <div className="topbar-mode-selector">
            <button
              type="button"
              className={`mode-toggle-btn ${workflowMode === 'lossless' ? 'active' : ''}`}
              onClick={() => setWorkflowMode('lossless')}
            >
              <Scissors size={13} />
              Cut &amp; Split
            </button>
            <button
              type="button"
              className={`mode-toggle-btn ${workflowMode === 'compress' ? 'active' : ''}`}
              onClick={() => setWorkflowMode('compress')}
            >
              <Zap size={13} />
              Compress
            </button>
          </div>
        </div>

        <div className="topbar-center">
          {videoFile && (
            <div className="file-meta-pill">
              <span className="file-meta-name">{meta.name}</span>
              <span className="file-meta-stat">{formatBytes(meta.size)}</span>
              <span className="file-meta-stat">•</span>
              <span className="file-meta-stat">{meta.width}×{meta.height}</span>
              <span className="file-meta-stat">•</span>
              <span className="file-meta-stat">{formatTimecode(meta.duration, false)}</span>
            </div>
          )}
        </div>

        <div className="topbar-right">
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

          <div className="status-badge" title="Hardware Acceleration Ready">
            <span className="status-dot" />
            <span>{nvencAvailable ? 'NVIDIA NVENC' : 'WebCodecs GPU'}</span>
          </div>

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleLoadDemo}
            disabled={isGeneratingDemo || isProcessing}
          >
            <Sparkles size={13} style={{ color: '#38bdf8' }} />
            {isGeneratingDemo ? 'Loading...' : 'Demo Clip'}
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload size={13} />
            {videoFile ? 'Replace File' : 'Open Video'}
          </button>

          {videoFile && (
            <button
              type="button"
              className={`btn btn-sm ${workflowMode === 'lossless' ? 'btn-green' : 'btn-primary'}`}
              onClick={handleRunAction}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>Processing... {Math.round(progress * 100)}%</>
              ) : workflowMode === 'lossless' ? (
                <>Export Cut</>
              ) : (
                <>Export ({codec.toUpperCase()})</>
              )}
            </button>
          )}

          <button
            type="button"
            className={`btn btn-icon btn-ghost ${isInspectorOpen ? 'active' : ''}`}
            title="Toggle Inspector"
            onClick={() => setIsInspectorOpen((v) => !v)}
          >
            {isInspectorOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="nle-workspace-body">
        {/* Center Stage Viewport */}
        <div className="nle-center-stage">
          <div
            id="nle-video-container"
            className="video-container"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.[0]) loadFile(e.dataTransfer.files[0]);
            }}
          >
            {!videoFile ? (
              <div
                className={`empty-hero-dropzone ${isDragOver ? 'drag-active' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="dropzone-upload-icon">
                  <Film size={24} />
                </div>
                <h2>Drop a video file to begin</h2>
                <p>
                  Perform instant stream-copy cuts in 0.2s or compress video with 99% visually lossless GPU
                  encoding. Everything runs locally on your machine.
                </p>
                <div className="dropzone-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={14} /> Open Video File
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadDemo();
                    }}
                  >
                    <Sparkles size={14} style={{ color: '#38bdf8' }} /> Try 1080p Demo
                  </button>
                </div>
                <div className="dropzone-specs">
                  <span>MP4</span>
                  <span>•</span>
                  <span>MKV</span>
                  <span>•</span>
                  <span>MOV</span>
                  <span>•</span>
                  <span>WEBM</span>
                  <span>•</span>
                  <span>Client-side GPU</span>
                </div>
              </div>
            ) : (
              <>
                {/* On-Video Floating HUD */}
                <div className="stage-hud-overlay">
                  <div className={`hud-tag ${previewMode === 'output' ? 'tag-output' : ''}`}>
                    {previewMode === 'split-wipe' ? (
                      <>
                        <Sliders size={12} />
                        <span>A/B Split View</span>
                      </>
                    ) : previewMode === 'output' && outputResult?.primary ? (
                      <>
                        <CheckCircle2 size={12} />
                        <span>Compressed Preview ({formatBytes(outputResult.primary.size)})</span>
                      </>
                    ) : (
                      <>
                        <span>Source ({formatBytes(meta.size)})</span>
                      </>
                    )}
                  </div>

                  <div className="hud-actions">
                    {outputResult?.primary && (
                      <div className="compare-segmented">
                        <button
                          type="button"
                          className={`compare-btn ${previewMode === 'split-wipe' ? 'active' : ''}`}
                          onClick={() => switchPreview('split-wipe')}
                        >
                          Split
                        </button>
                        <button
                          type="button"
                          className={`compare-btn ${previewMode === 'original' ? 'active' : ''}`}
                          onClick={() => switchPreview('original')}
                        >
                          Source
                        </button>
                        <button
                          type="button"
                          className={`compare-btn ${previewMode === 'output' ? 'active' : ''}`}
                          onClick={() => switchPreview('output')}
                        >
                          Output
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={handleCloseVideo}
                      title="Close Video"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Primary Video */}
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

                {/* Split Wipe Comparison Layer */}
                {previewMode === 'split-wipe' && outputResult?.primary && (
                  <div className="split-wipe-container">
                    <div
                      className="split-wipe-layer"
                      style={{
                        clipPath: `polygon(${wipePercent}% 0, 100% 0, 100% 100%, ${wipePercent}% 100%)`,
                      }}
                    >
                      <video ref={wipeVideoRef} src={outputResult.primary.url} muted playsInline />
                    </div>

                    <div
                      className="split-divider-line"
                      style={{ left: `${wipePercent}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setIsDraggingWipe(true);
                      }}
                    >
                      <div className="split-divider-handle">
                        <span>⇔</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Centered Play Pause Overlay */}
                <div className={`center-play-overlay ${!isPlaying ? 'paused' : ''}`}>
                  <div className="center-play-circle">
                    <Play size={22} style={{ marginLeft: 2 }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Inspector Panel */}
        {isInspectorOpen && (
          <aside className="nle-inspector-panel">
            <div className="inspector-header">
              <span className="inspector-title">
                {workflowMode === 'lossless' ? 'Cut Settings' : 'Compress Settings'}
              </span>
              <button
                type="button"
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => setIsInspectorOpen(false)}
                title="Hide Inspector"
              >
                <X size={14} />
              </button>
            </div>

            <div className="inspector-scroll-body">
              {workflowMode === 'lossless' ? (
                <>
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Multi-Clip Export</span>
                      <span className="val">{segments.length} Clips</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={`seg-btn ${!mergeSegments ? 'active-green' : ''}`}
                        onClick={() => setMergeSegments(false)}
                      >
                        Separate Files
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${mergeSegments ? 'active-green' : ''}`}
                        onClick={() => setMergeSegments(true)}
                      >
                        Merge Clips
                      </button>
                    </div>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Audio Track</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={`seg-btn ${!losslessStripAudio ? 'active-green' : ''}`}
                        onClick={() => setLosslessStripAudio(false)}
                      >
                        Keep Audio
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${losslessStripAudio ? 'active-green' : ''}`}
                        onClick={() => setLosslessStripAudio(true)}
                      >
                        Strip (Mute)
                      </button>
                    </div>
                  </div>

                  <div className="size-preview-card">
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Selected Duration</span>
                      <span className="size-val">{formatTimecode(selectedDuration)}</span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Estimated Size</span>
                      <span className="size-val" style={{ color: '#34d399' }}>
                        {formatBytes(activeOutputBytes)}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Instant stream copy (-c copy). No transcoding or quality loss.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Quick Presets */}
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Quick Presets</span>
                    </div>
                    <div className="preset-chips-grid">
                      <button
                        type="button"
                        className={`preset-chip-card ${activeQuickPreset === 'best' ? 'active' : ''}`}
                        onClick={() => applyQuickPreset('best')}
                      >
                        <span className="chip-title">Auto Lossless</span>
                        <span className="chip-sub">99% sharp • ~55% smaller</span>
                      </button>
                      <button
                        type="button"
                        className={`preset-chip-card ${activeQuickPreset === 'discord' ? 'active' : ''}`}
                        onClick={() => applyQuickPreset('discord')}
                      >
                        <span className="chip-title">Discord 10 MB</span>
                        <span className="chip-sub">Auto clamp bitrate</span>
                      </button>
                      <button
                        type="button"
                        className={`preset-chip-card ${activeQuickPreset === 'web' ? 'active' : ''}`}
                        onClick={() => applyQuickPreset('web')}
                      >
                        <span className="chip-title">Web 25 MB</span>
                        <span className="chip-sub">1080p web share</span>
                      </button>
                      <button
                        type="button"
                        className={`preset-chip-card ${activeQuickPreset === 'slim' ? 'active' : ''}`}
                        onClick={() => applyQuickPreset('slim')}
                      >
                        <span className="chip-title">Compact 720p</span>
                        <span className="chip-sub">Maximum shrinkage</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode */}
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Compression Target</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={`seg-btn ${rateControlMode === 'crf' ? 'active-blue' : ''}`}
                        onClick={() => setRateControlMode('crf')}
                      >
                        By Quality
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${rateControlMode === 'size' ? 'active-blue' : ''}`}
                        onClick={() => setRateControlMode('size')}
                      >
                        Target Size (MB)
                      </button>
                    </div>
                  </div>

                  {rateControlMode === 'crf' ? (
                    <div className="inspector-group">
                      <div className="inspector-group-title">
                        <span>Quality Factor</span>
                        <span className="val">
                          CQ {crf} (
                          {crf <= 20
                            ? 'Lossless'
                            : crf <= 23
                            ? 'High'
                            : crf <= 26
                            ? 'Balanced'
                            : 'Compact'}
                          )
                        </span>
                      </div>
                      <div className="segmented-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {[
                          { label: 'Lossless', val: 19 },
                          { label: 'High', val: 22 },
                          { label: 'Balanced', val: 25 },
                          { label: 'Compact', val: 28 },
                        ].map((q) => (
                          <button
                            key={q.val}
                            type="button"
                            className={`seg-btn ${crf === q.val ? 'active-blue' : ''}`}
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
                        className="slider-control"
                        value={crf}
                        onChange={(e) => setCrf(Number(e.target.value))}
                      />
                    </div>
                  ) : (
                    <div className="inspector-group">
                      <div className="inspector-group-title">
                        <span>Max Output Size</span>
                        <span className="val">{targetSizeMB} MB</span>
                      </div>
                      <div className="segmented-grid">
                        {[8, 10, 25, 50, 100].map((mb) => (
                          <button
                            key={mb}
                            type="button"
                            className={`seg-btn ${Math.abs(targetSizeMB - mb) < 0.05 ? 'active-blue' : ''}`}
                            onClick={() => setTargetSizeMB(mb)}
                          >
                            {mb}MB
                          </button>
                        ))}
                      </div>
                      <div className="input-row">
                        <input
                          type="range"
                          min="10"
                          max="90"
                          step="5"
                          className="slider-control"
                          value={targetSizePct}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            setTargetSizePct(pct);
                            if (meta.size > 0) {
                              const origMB = meta.size / (1024 * 1024);
                              setTargetSizeMB(Math.max(0.2, Number(((origMB * pct) / 100).toFixed(2))));
                            }
                          }}
                        />
                        <input
                          type="number"
                          min="0.2"
                          max="2000"
                          step="0.5"
                          className="text-input"
                          style={{ width: 80, textAlign: 'right' }}
                          value={targetSizeMB}
                          onChange={(e) => setTargetSizeMB(Math.max(0.2, Number(e.target.value) || 1))}
                        />
                      </div>
                    </div>
                  )}

                  {/* Resolution & FPS */}
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Resolution &amp; FPS</span>
                      <span className="val">
                        {targetDims.width}×{targetDims.height}
                      </span>
                    </div>
                    <div className="input-row">
                      <select
                        className="select-input"
                        value={resolutionPreset}
                        onChange={(e) => setResolutionPreset(e.target.value)}
                      >
                        <option value="original">Original ({meta.width}×{meta.height})</option>
                        <option value="2160">4K (2160p)</option>
                        <option value="1440">2K (1440p)</option>
                        <option value="1080">1080p FHD</option>
                        <option value="720">720p HD</option>
                        <option value="480">480p SD</option>
                      </select>
                      <select
                        className="select-input"
                        style={{ width: 110 }}
                        value={fpsPreset}
                        onChange={(e) => setFpsPreset(e.target.value)}
                      >
                        <option value="original">Same FPS</option>
                        <option value="60">60 fps</option>
                        <option value="30">30 fps</option>
                        <option value="24">24 fps</option>
                      </select>
                    </div>
                  </div>

                  {/* Audio */}
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Audio</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                      <button
                        type="button"
                        className={`seg-btn ${audioMode === 'copy' ? 'active-blue' : ''}`}
                        onClick={() => setAudioMode('copy')}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${audioMode === 'aac' ? 'active-blue' : ''}`}
                        onClick={() => setAudioMode('aac')}
                      >
                        AAC
                      </button>
                      <button
                        type="button"
                        className={`seg-btn ${audioMode === 'strip' ? 'active-blue' : ''}`}
                        onClick={() => setAudioMode('strip')}
                      >
                        Mute
                      </button>
                    </div>
                  </div>

                  {/* Hardware Pro Settings Accordion */}
                  <div className="accordion-wrapper">
                    <button
                      type="button"
                      className="accordion-header"
                      onClick={() => setShowProSettings((v) => !v)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={13} style={{ color: '#3b82f6' }} />
                        Pro Codec Settings
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {codec.toUpperCase()} {showProSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </button>

                    {showProSettings && (
                      <div className="accordion-content">
                        <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          {['hevc', 'h264', 'av1'].map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`seg-btn ${codec === c ? 'active-blue' : ''}`}
                              onClick={() => setCodec(c)}
                            >
                              {c.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          <span>2-Pass Lookahead AQ</span>
                          <input
                            type="checkbox"
                            checked={psychoVisualHq}
                            onChange={(e) => setPsychoVisualHq(e.target.checked)}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Size Preview Card */}
                  <div className="size-preview-card">
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Source Size</span>
                      <span className="size-val">{videoFile ? formatBytes(meta.size) : '—'}</span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {outputResult?.primary ? 'Final Size' : 'Estimated'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="size-val" style={{ color: '#38bdf8' }}>
                          {videoFile ? formatBytes(activeOutputBytes) : '—'}
                        </span>
                        {videoFile && savingsPct > 0 && (
                          <span className="savings-tag">-{savingsPct}%</span>
                        )}
                      </div>
                    </div>
                    {videoFile && (
                      <div className="size-bar-track">
                        <div
                          className="size-bar-fill"
                          style={{
                            width: `${Math.max(6, Math.min(100, Math.round((activeOutputBytes / meta.size) * 100)))}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Output Done Card */}
              {outputResult?.primary && (
                <div className="done-result-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                      <CheckCircle2 size={15} /> Ready in {outputResult.elapsedSec.toFixed(1)}s
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Saved {savingsPct}%
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-green btn-sm"
                    style={{ width: '100%' }}
                    onClick={() => triggerDownload(outputResult.primary)}
                  >
                    <Download size={13} /> Download Video
                  </button>
                </div>
              )}
            </div>

            {/* Inspector Footer CTA */}
            {videoFile && (
              <div className="inspector-footer">
                <button
                  type="button"
                  className={`btn ${workflowMode === 'lossless' ? 'btn-green' : 'btn-primary'}`}
                  style={{ width: '100%', padding: '9px 14px' }}
                  disabled={isProcessing}
                  onClick={handleRunAction}
                >
                  {isProcessing ? (
                    <>
                      Encoding... {Math.round(progress * 100)}%
                      {encodingStats.fps > 0 ? ` (${encodingStats.fps} fps)` : ''}
                    </>
                  ) : workflowMode === 'lossless' ? (
                    <>
                      <Scissors size={14} /> Export Lossless Cut
                    </>
                  ) : (
                    <>
                      <Zap size={14} /> Compress ({codec.toUpperCase()})
                    </>
                  )}
                </button>

                {isProcessing && (
                  <div className="progress-strip">
                    <div
                      className="progress-fill-bar"
                      style={{ width: `${Math.max(5, Math.round(progress * 100))}%` }}
                    />
                  </div>
                )}

                {errorMsg && (
                  <div style={{ fontSize: '11.5px', color: '#f87171' }}>{errorMsg}</div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 3. BOTTOM FULL-WIDTH TIMELINE */}
      <footer className="nle-bottom-timeline">
        {/* Toolbar */}
        <div className="timeline-control-bar">
          <div className="timeline-tools-left">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={setInPoint}
              disabled={!videoFile}
              title="Set In-Point (I)"
            >
              [ In <span className="kbd-badge">I</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={setOutPoint}
              disabled={!videoFile}
              title="Set Out-Point (O)"
            >
              Out ] <span className="kbd-badge">O</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={splitAtPlayhead}
              disabled={!videoFile}
              title="Razor Split at Playhead (S)"
            >
              <Scissors size={13} style={{ color: '#3b82f6' }} />
              Split <span className="kbd-badge">S</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={addNewSegment}
              disabled={!videoFile}
              title="Add Clip"
            >
              <Plus size={13} /> Clip
            </button>
            {isTrimmedOrMulti && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={resetSegments}
                title="Reset Trim"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>

          <div className="timeline-playback-center">
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={() => stepFrame(-1)}
              disabled={!videoFile}
              title="Previous Frame (←)"
            >
              <SkipBack size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-primary"
              onClick={togglePlay}
              disabled={!videoFile}
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={() => stepFrame(1)}
              disabled={!videoFile}
              title="Next Frame (→)"
            >
              <SkipForward size={13} />
            </button>

            <div className="timecode-lcd">
              <span>{formatTimecode(currentTime)}</span>
              <span className="total-time">/ {formatTimecode(meta.duration)}</span>
            </div>
          </div>

          <div className="timeline-tools-right">
            <button
              type="button"
              className={`btn btn-sm btn-ghost ${loopSegment ? 'active' : ''}`}
              onClick={() => setLoopSegment((v) => !v)}
              disabled={!videoFile}
              title="Loop Selection"
            >
              <Repeat size={12} />
              Loop
            </button>

            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setIsMuted(v.muted);
              }}
              disabled={!videoFile}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>

            <select
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              value={playbackRate}
              onChange={(e) => {
                const num = Number(e.target.value) || 1;
                setPlaybackRate(num);
                if (videoRef.current) videoRef.current.playbackRate = num;
                if (wipeVideoRef.current) wipeVideoRef.current.playbackRate = num;
              }}
              disabled={!videoFile}
            >
              <option value="0.5">0.5×</option>
              <option value="1">1.0×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2.0×</option>
            </select>
          </div>
        </div>

        {/* Track Area */}
        <div className="timeline-track-area">
          <div className="timeline-time-ruler">
            <span>00:00</span>
            <span>{formatTimecode(meta.duration * 0.25, false)}</span>
            <span>{formatTimecode(meta.duration * 0.5, false)}</span>
            <span>{formatTimecode(meta.duration * 0.75, false)}</span>
            <span>{formatTimecode(meta.duration, false)}</span>
          </div>

          <div
            ref={timelineRef}
            className="timeline-scroll-stage"
            onMouseMove={(e) => {
              const sec = getTimelineSeconds(e.clientX);
              setHoverTime(sec);
            }}
            onMouseLeave={() => setHoverTime(null)}
            onMouseDown={(e) => {
              const sec = getTimelineSeconds(e.clientX);
              setCurrentTime(sec);
              if (videoRef.current) videoRef.current.currentTime = sec;
              if (wipeVideoRef.current) wipeVideoRef.current.currentTime = sec;
              setDragState({ type: 'playhead' });
            }}
          >
            {/* Filmstrip */}
            {filmstrip.length > 0 && (
              <div className="filmstrip-backdrop">
                {filmstrip.map((src, idx) => (
                  <img key={idx} src={src} alt="" className="filmstrip-cell" />
                ))}
              </div>
            )}

            {/* Hover Indicator */}
            {hoverTime !== null && meta.duration > 0 && (
              <>
                <div
                  className="timeline-hover-cursor"
                  style={{ left: `${(hoverTime / meta.duration) * 100}%` }}
                />
                <div
                  className="timeline-hover-bubble"
                  style={{
                    left: `${Math.max(4, Math.min(96, (hoverTime / meta.duration) * 100))}%`,
                  }}
                >
                  {formatTimecode(hoverTime)}
                </div>
              </>
            )}

            {/* Clamped Segment Range */}
            {segments.map((seg, index) => {
              const leftPct = meta.duration ? (seg.start / meta.duration) * 100 : 0;
              const widthPct = meta.duration
                ? Math.max(0.6, ((seg.end - seg.start) / meta.duration) * 100)
                : 100;
              const isActive = seg.id === activeSegId;

              return (
                <div
                  key={seg.id}
                  className={`timeline-segment-range ${isActive ? 'active' : ''}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setActiveSegId(seg.id);
                  }}
                >
                  <div
                    className="segment-edge-handle"
                    title="Drag In-Point"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setActiveSegId(seg.id);
                      setDragState({ type: 'start', segId: seg.id });
                    }}
                  />
                  <span className="segment-title-text">
                    Clip {index + 1} ({formatTimecode(seg.start, false)} - {formatTimecode(seg.end, false)})
                  </span>
                  <div
                    className="segment-edge-handle"
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

            {/* Playhead */}
            <div
              className="timeline-playhead-line"
              style={{
                left: `${meta.duration ? (currentTime / meta.duration) * 100 : 0}%`,
              }}
            >
              <div className="timeline-playhead-head" />
            </div>
          </div>
        </div>

        {/* Subtrack Segment Chips */}
        {videoFile && (
          <div className="timeline-subtrack-bar">
            <div className="segment-pills-flow">
              {segments.map((seg, idx) => {
                const isActive = seg.id === activeSegId;
                return (
                  <div
                    key={seg.id}
                    className={`clip-chip-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveSegId(seg.id);
                      if (videoRef.current) {
                        videoRef.current.currentTime = seg.start;
                        setCurrentTime(seg.start);
                      }
                    }}
                  >
                    <strong>Clip {idx + 1}</strong>
                    <span>
                      {formatTimecode(seg.start, false)} – {formatTimecode(seg.end, false)} (
                      {(seg.end - seg.start).toFixed(1)}s)
                    </span>
                    {segments.length > 1 && (
                      <span
                        style={{ cursor: 'pointer', opacity: 0.7 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSegment(seg.id);
                        }}
                      >
                        ×
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Shortcuts: <kbd>Space</kbd> Play • <kbd>I</kbd> In • <kbd>O</kbd> Out • <kbd>S</kbd> Split
            </div>
          </div>
        )}
      </footer>

      {/* Floating Toast Notification */}
      {toastMsg && <div className="studio-toast">{toastMsg}</div>}
    </div>
  );
}
