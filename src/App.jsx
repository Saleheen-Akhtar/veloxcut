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
  MessageSquare,
  Globe,
  Smartphone,
  ShieldCheck,
  Check,
  MousePointer,
} from 'lucide-react';
import {
  formatBytes,
  formatTimecode,
  calculateTargetDimensions,
  calculateTargetBitrates,
  estimateCrfFileSize,
} from './utils/format';
import { probeGpuEncoders } from './engines/gpuProbe';
import { losslessSplitOrTrim, wasmCompressVideo, wasmUpscaleVideo } from './engines/ffmpegEngine';
import { webcodecsGpuCompress } from './engines/webcodecsEngine';
import { checkNativeNvencStatus, runNativeNvencJob } from './engines/nativeNvencEngine';
import { generateDemoVideoFile } from './utils/demoVideoGenerator';
import VeloxLandingShowcase from './components/VeloxLandingShowcase';

// Precision vector brand glyph with glowing aperture
function BrandLogo() {
  return (
    <div className="brand-logo-wrapper">
      <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="vxGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id="vxGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <filter id="vxGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect x="2" y="2" width="24" height="24" rx="7" fill="#10131d" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
        <path d="M7 7.5L12.5 20.5L14 17L9.5 7.5H7Z" fill="url(#vxGrad1)" />
        <path d="M21 7.5L15 20.5L13.8 20.5L18.5 10H14.5L15.5 7.5H21Z" fill="url(#vxGrad2)" />
        <circle cx="14" cy="14" r="1.5" fill="#38bdf8" filter="url(#vxGlow)" />
      </svg>
    </div>
  );
}

export default function App() {
  // Experience Mode: 'showcase' (Awwwards AIDA landing) | 'studio' (NLE Suite)
  const [viewMode, setViewMode] = useState('showcase');

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

  // Feature Navigation & Workflow
  const [activeToolTab, setActiveToolTab] = useState('enhance'); // 'enhance' | 'compress' | 'cut' | 'audio' | 'media'
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 1. Lossless Cut Suite (Dedicated State)
  const [mergeSegments, setMergeSegments] = useState(false);
  const [losslessStripAudio, setLosslessStripAudio] = useState(false);

  // 2. Hardware Engine
  const [engineType, setEngineType] = useState('nvenc'); // 'nvenc' | 'webcodecs' | 'wasm'

  // 3. AI Cinema Upscaler Suite (Dedicated State - Defaults to 4K UHD 2160p)
  const [upscaleTargetRes, setUpscaleTargetRes] = useState('2160'); // '2160' | '1440' | '1080'
  const [upscaleMode, setUpscaleMode] = useState('cinema'); // 'cinema' | 'standard'
  const [upscaleAntiPlastic, setUpscaleAntiPlastic] = useState(true);
  const [upscaleCasStrength, setUpscaleCasStrength] = useState(0.65);
  const [upscaleFps, setUpscaleFps] = useState('original'); // 'original' | '60' | '30' | '24'

  // 4. Video Compressor Suite (Dedicated State - Defaults to Original resolution, CQ 20)
  const [compressResolution, setCompressResolution] = useState('original'); // 'original' | '1080' | '720' | '480'
  const [compressFps, setCompressFps] = useState('original'); // 'original' | '60' | '30' | '24'
  const [compressRateMode, setCompressRateMode] = useState('crf'); // 'crf' | 'size'
  const [compressCrf, setCompressCrf] = useState(24);
  const [compressTargetMB, setCompressTargetMB] = useState(15);
  const [compressCodec, setCompressCodec] = useState('h264'); // 'hevc' | 'h264' | 'av1'
  const [compressPsychoVisual, setCompressPsychoVisual] = useState(true);
  const [cutMode, setCutMode] = useState('lossless'); // 'lossless' | 'compress'

  // 5. Audio Processing Suite (Dedicated State)
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
          setCompressCodec('h264');
        } else if (caps.webcodecsAvailable) {
          setEngineType('webcodecs');
          setCompressCodec('h264');
        } else {
          setEngineType('wasm');
          setCompressCodec('h264');
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
    if (activeToolTab === 'cut') {
      return segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
    }
    return Math.max(0.1, (activeSegment?.end || meta.duration) - (activeSegment?.start || 0));
  }, [activeToolTab, segments, activeSegment, meta.duration]);

  // Realistic simulated audio waveform heights
  const waveformBars = useMemo(() => {
    const bars = [];
    const count = 90;
    for (let i = 0; i < count; i++) {
      const seed = Math.sin(i * 0.45) * 0.35 + Math.cos(i * 0.85) * 0.25 + Math.sin(i * 2.1) * 0.15;
      const heightPct = Math.max(16, Math.min(94, Math.round((seed + 0.55) * 85)));
      bars.push(heightPct);
    }
    return bars;
  }, []);

  // 1. AI Cinema Upscaler Dimensions & Scaling Factor
  const upscaleDims = useMemo(
    () => calculateTargetDimensions(meta.width, meta.height, upscaleTargetRes),
    [meta.width, meta.height, upscaleTargetRes]
  );

  const upscaleMultiplier = useMemo(() => {
    if (!meta.height || !upscaleDims.height) return '1.0';
    return (upscaleDims.height / meta.height).toFixed(1);
  }, [meta.height, upscaleDims.height]);

  // 2. Video Compressor Dimensions
  const compressDims = useMemo(
    () => calculateTargetDimensions(meta.width, meta.height, compressResolution),
    [meta.width, meta.height, compressResolution]
  );

  // Bitrate Plan for Compressor
  const compressBitratePlan = useMemo(
    () =>
      calculateTargetBitrates({
        targetSizeMB: compressTargetMB,
        durationSec: selectedDuration,
        audioMode,
        audioBitrateKbps,
      }),
    [compressTargetMB, selectedDuration, audioMode, audioBitrateKbps]
  );

  // Quick Preset Helper for Compressor Suite (strictly isolated from upscaler)
  const activeQuickPreset = useMemo(() => {
    if (
      compressRateMode === 'crf' &&
      compressCrf === 20 &&
      compressResolution === 'original' &&
      compressCodec === 'hevc'
    ) {
      return 'best';
    }
    if (compressRateMode === 'size' && Math.abs(compressTargetMB - 10) < 0.05) {
      return 'discord';
    }
    if (compressRateMode === 'size' && Math.abs(compressTargetMB - 25) < 0.05) {
      return 'web';
    }
    if (compressRateMode === 'crf' && compressCrf === 25 && compressResolution === '720') {
      return 'slim';
    }
    return null;
  }, [compressRateMode, compressCrf, compressResolution, compressCodec, compressTargetMB]);

  const applyQuickPreset = (id) => {
    if (id === 'best') {
      setCompressRateMode('crf');
      setCompressCrf(22);
      setCompressCodec('h264');
      setCompressPsychoVisual(true);
      setCompressResolution('original');
      setCompressFps('original');
      setAudioMode('copy');
      showToast('Preset: Auto Lossless (H.264 CQ 22)');
    } else if (id === 'discord') {
      setCompressRateMode('size');
      setCompressTargetMB(10);
      setCompressCodec('h264');
      setCompressPsychoVisual(true);
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Preset: 10 MB Discord Limit (H.264)');
    } else if (id === 'web') {
      setCompressRateMode('size');
      setCompressTargetMB(25);
      setCompressCodec('h264');
      setCompressPsychoVisual(true);
      setAudioMode('copy');
      showToast('Preset: 25 MB Web Share (H.264)');
    } else if (id === 'grok') {
      setCompressRateMode('size');
      setCompressTargetMB(10);
      setCompressCodec('h264');
      setCompressPsychoVisual(true);
      setAudioMode('strip');
      setCompressResolution('original');
      showToast('Preset: Grok & AI Safe (H.264 • Muted • Clean Metadata)');
    } else if (id === 'slim') {
      setCompressRateMode('crf');
      setCompressCrf(26);
      setCompressResolution('720');
      setCompressCodec('h264');
      setAudioMode('aac');
      setAudioBitrateKbps(128);
      showToast('Preset: 720p Compact (H.264)');
    }
  };

  // Estimated Output Size for AI Cinema Upscale (~32 Mbps for 4K, ~18 Mbps for 2K, ~10 Mbps for 1080p)
  const estimatedUpscaleBytes = useMemo(() => {
    if (!selectedDuration) return 0;
    const mbps = upscaleTargetRes === '2160' ? 32 : upscaleTargetRes === '1440' ? 18 : 10;
    return Math.round(((mbps * 1_000_000) / 8) * selectedDuration);
  }, [selectedDuration, upscaleTargetRes]);

  // Estimated Output Size for Lossless Cut
  const estimatedCutBytes = useMemo(() => {
    if (!meta.size || !meta.duration) return 0;
    const ratio = Math.min(1, selectedDuration / meta.duration);
    const audioFactor = losslessStripAudio ? 0.9 : 1;
    return Math.round(meta.size * ratio * audioFactor);
  }, [meta.size, meta.duration, selectedDuration, losslessStripAudio]);

  // Estimated Output Size for Video Compressor
  const estimatedCompressBytes = useMemo(() => {
    if (!meta.size || !meta.duration) return 0;
    if (compressRateMode === 'size') {
      return Math.round(compressTargetMB * 1024 * 1024);
    }
    return estimateCrfFileSize({
      srcSizeBytes: meta.size,
      fullDurationSec: meta.duration,
      selectedDurationSec: selectedDuration,
      srcWidth: meta.width,
      srcHeight: meta.height,
      targetWidth: compressDims.width,
      targetHeight: compressDims.height,
      srcFps: meta.fps,
      targetFps: compressFps === 'original' ? meta.fps : Number(compressFps),
      codec: compressCodec,
      crf: compressCrf,
      audioMode,
      audioBitrateKbps,
    });
  }, [
    meta,
    selectedDuration,
    compressRateMode,
    compressTargetMB,
    compressDims,
    compressFps,
    compressCodec,
    compressCrf,
    audioMode,
    audioBitrateKbps,
  ]);

  const activeOutputBytes =
    outputResult?.primary?.size ??
    (activeToolTab === 'enhance'
      ? estimatedUpscaleBytes
      : activeToolTab === 'cut'
      ? estimatedCutBytes
      : estimatedCompressBytes);

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
      setViewMode('studio');
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
      setCompressTargetMB(Math.max(0.5, Number((origMB * 0.5).toFixed(1))));

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
  const handleRunAction = async (targetMode) => {
    if (!videoFile || isProcessing) return;
    setShowExportMenu(false);
    setIsProcessing(true);
    setProgress(0.02);
    setEncodingStats({ fps: 0, speed: '', frame: 0 });
    setErrorMsg('');

    try {
      const start = activeSegment?.start || 0;
      const end = activeSegment?.end || meta.duration;
      const effectiveMode =
        targetMode ||
        (activeToolTab === 'enhance'
          ? 'upscale'
          : activeToolTab === 'cut'
          ? 'lossless'
          : 'compress');

      if (effectiveMode === 'lossless') {
        const isCutCompress = activeToolTab === 'cut' && cutMode === 'compress';
        if (nvencAvailable) {
          const res = await runNativeNvencJob({
            file: videoFile,
            workflowMode: isCutCompress ? 'cut_compress' : 'lossless',
            codec: compressCodec,
            crf: compressCrf,
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
            compressCut: isCutCompress,
            codec: compressCodec,
            onProgress: ({ progress: p }) => setProgress(p),
          });
          setOutputResult(res);
        }
      } else if (effectiveMode === 'upscale' || effectiveMode === 'enhance') {
        // AI Cinema Super-Resolution Mastering: Strictly Uncompressed Mastering Quality (-cq 14, -maxrate 80M)
        if (nvencAvailable) {
          const res = await runNativeNvencJob({
            file: videoFile,
            workflowMode: 'upscale',
            startTime: start,
            endTime: end,
            width: upscaleDims.width,
            height: upscaleDims.height,
            fps: upscaleFps,
            codec: 'hevc',
            rateControlMode: 'crf',
            crf: 14,
            audioMode: 'copy',
            audioBitrateKbps: 320,
            psychoVisualHq: true,
            enhanceMode: upscaleMode,
            antiPlasticGrain: upscaleAntiPlastic,
            casStrength: upscaleCasStrength,
            onProgress: ({ progress: p, fps, speed }) => {
              setProgress(p);
              setEncodingStats((prev) => ({ ...prev, fps: fps || prev.fps, speed: speed || prev.speed }));
            },
          });
          setOutputResult(res);
          setPreviewMode('split-wipe');
        } else {
          // In-Browser Client-Side Super-Resolution Engine (Runs on ANY live deployed web host)
          showToast(`Enhancing video in-browser to ${upscaleDims.width}×${upscaleDims.height}...`);
          const res = await wasmUpscaleVideo({
            file: videoFile,
            startTime: start,
            endTime: end,
            width: upscaleDims.width,
            height: upscaleDims.height,
            fps: upscaleFps,
            casStrength: upscaleCasStrength,
            antiPlasticGrain: upscaleAntiPlastic,
            onProgress: ({ progress: p }) => {
              setProgress(p);
              setEncodingStats((prev) => ({ ...prev, speed: 'In-Browser DSP' }));
            },
            onLog: (msg) => {
              console.log('[In-Browser Super-Resolution]', msg);
            },
          });
          setOutputResult(res);
          setPreviewMode('split-wipe');
        }
      } else if (engineType === 'nvenc' && nvencAvailable) {
        const res = await runNativeNvencJob({
          file: videoFile,
          workflowMode: 'compress',
          startTime: start,
          endTime: end,
          width: compressDims.width,
          height: compressDims.height,
          fps: compressFps,
          codec: compressCodec,
          rateControlMode: compressRateMode,
          crf: compressCrf,
          targetVideoKbps: compressBitratePlan.videoKbps,
          audioMode,
          audioBitrateKbps,
          psychoVisualHq: compressPsychoVisual,
          enhanceMode: 'off',
          antiPlasticGrain: false,
          casStrength: 0,
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
          width: compressDims.width,
          height: compressDims.height,
          fps: compressFps,
          codec: compressCodec,
          rateControlMode: compressRateMode,
          crf: compressCrf,
          targetVideoKbps: compressBitratePlan.videoKbps,
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
          width: compressDims.width,
          height: compressDims.height,
          fps: compressFps,
          rateControlMode: compressRateMode,
          crf: compressCrf,
          targetVideoKbps: compressBitratePlan.videoKbps,
          audioMode,
          audioBitrateKbps,
          onProgress: ({ progress: p }) => setProgress(p),
        });
        setOutputResult(res);
        setPreviewMode('split-wipe');
      }
      setProgress(1);
      showToast(
        effectiveMode === 'upscale' || effectiveMode === 'enhance'
          ? `AI Cinema ${upscaleDims.width}×${upscaleDims.height} complete!`
          : effectiveMode === 'lossless'
          ? 'Instant Lossless Cut complete!'
          : 'Video compression complete!'
      );
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

  const triggerDownloadAll = (items) => {
    if (!items || !items.length) return;
    items.forEach((item, idx) => {
      setTimeout(() => {
        triggerDownload(item);
      }, idx * 350);
    });
    showToast(`Downloading all ${items.length} clips...`);
  };

  if (viewMode === 'showcase') {
    return (
      <VeloxLandingShowcase
        onLaunchStudio={() => setViewMode('studio')}
        onLoadDemo={handleLoadDemo}
        onDropFile={(file) => loadFile(file)}
        nvencAvailable={nvencAvailable}
      />
    );
  }

  return (
    <div className="nle-app-shell">
      {/* 1. TOP NAVBAR */}
      <header className="nle-topbar">
        <div className="topbar-left">
          <div className="app-brand" onClick={() => setViewMode('showcase')} style={{ cursor: 'pointer' }} title="Return to Overview Showcase">
            <BrandLogo />
            <div className="app-brand-title-group">
              <span className="app-brand-name">VELOX<span className="app-brand-accent">CUT</span></span>
              <span className="app-brand-badge">STUDIO</span>
            </div>
          </div>

          <div className="topbar-tool-indicator">
            <span>Suite:</span>
            <span className="active-tab">
              {activeToolTab === 'enhance' && <><Sparkles size={12} /> AI Cinema Enhancer</>}
              {activeToolTab === 'compress' && <><Zap size={12} /> Compression</>}
              {activeToolTab === 'cut' && <><Scissors size={12} /> Cut &amp; Clips</>}
              {activeToolTab === 'audio' && <><Volume2 size={12} /> Audio</>}
              {activeToolTab === 'media' && <><Film size={12} /> Project Media</>}
            </span>
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
            onClick={() => setViewMode('showcase')}
            title="Switch to Product Showcase"
          >
            <Layers size={13} style={{ color: '#38bdf8' }} />
            Showcase
          </button>

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
            <div className="topbar-export-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                className={`btn btn-sm ${activeToolTab === 'cut' ? 'btn-green' : 'btn-primary'}`}
                onClick={() => handleRunAction()}
                disabled={isProcessing}
                title="Run active action"
              >
                {isProcessing ? (
                  <>Encoding... {Math.round(progress * 100)}%</>
                ) : (
                  <>
                    <Download size={13} />
                    {activeToolTab === 'enhance' ? (
                      <>AI Cinema Upscale ({upscaleDims.width}×{upscaleDims.height})</>
                    ) : activeToolTab === 'cut' ? (
                      <>Export Lossless Cut</>
                    ) : (
                      <>Export Video</>
                    )}
                  </>
                )}
              </button>

              <button
                type="button"
                className={`btn btn-sm btn-icon ${activeToolTab === 'cut' ? 'btn-green' : 'btn-primary'}`}
                onClick={() => setShowExportMenu((v) => !v)}
                title="More Export Options"
                disabled={isProcessing}
                style={{ padding: '0 6px' }}
              >
                <ChevronDown size={12} />
              </button>

              {showExportMenu && !isProcessing && (
                <div className="export-dropdown-menu">
                  <button
                    type="button"
                    className="export-dropdown-item"
                    onClick={() => handleRunAction('lossless')}
                  >
                    <Scissors size={15} style={{ color: '#34d399', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <span className="export-dropdown-item-title">Instant Lossless Cut</span>
                      <span className="export-dropdown-item-desc">Stream-copy in 0.2s with 0% quality loss</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-dropdown-item"
                    onClick={() => handleRunAction('upscale')}
                  >
                    <Sparkles size={15} style={{ color: '#38bdf8', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <span className="export-dropdown-item-title">AI Cinema 4K Super-Res</span>
                      <span className="export-dropdown-item-desc">RTX 4050 NVENC p7 with Anti-Plastic Grain &amp; CAS</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="export-dropdown-item"
                    onClick={() => handleRunAction('compress')}
                  >
                    <Zap size={15} style={{ color: '#60a5fa', marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <span className="export-dropdown-item-title">Compressed Export ({compressCodec.toUpperCase()})</span>
                      <span className="export-dropdown-item-desc">Apply CQ quality factor or target file size</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
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
        {/* Left Activity Rail (CapCut / Premiere Pro style) */}
        <nav className="nle-left-rail" aria-label="Editor Tools">
          <button
            type="button"
            className={`rail-btn ${activeToolTab === 'enhance' ? 'active' : ''}`}
            onClick={() => { setActiveToolTab('enhance'); setIsInspectorOpen(true); }}
            title="AI Cinema Enhancer"
          >
            <Sparkles size={17} />
            <span>Enhance</span>
          </button>

          <button
            type="button"
            className={`rail-btn ${activeToolTab === 'compress' ? 'active' : ''}`}
            onClick={() => { setActiveToolTab('compress'); setIsInspectorOpen(true); }}
            title="Compression & Presets"
          >
            <Zap size={17} />
            <span>Compress</span>
          </button>

          <button
            type="button"
            className={`rail-btn ${activeToolTab === 'cut' ? 'active green' : ''}`}
            onClick={() => { setActiveToolTab('cut'); setIsInspectorOpen(true); }}
            title="Cut & Multi-Clip Segments"
          >
            <Scissors size={17} />
            <span>Cut</span>
          </button>

          <button
            type="button"
            className={`rail-btn ${activeToolTab === 'audio' ? 'active' : ''}`}
            onClick={() => { setActiveToolTab('audio'); setIsInspectorOpen(true); }}
            title="Audio Track Settings"
          >
            <Volume2 size={17} />
            <span>Audio</span>
          </button>

          <button
            type="button"
            className={`rail-btn ${activeToolTab === 'media' ? 'active' : ''}`}
            onClick={() => { setActiveToolTab('media'); setIsInspectorOpen(true); }}
            title="Project Media Asset"
          >
            <Film size={17} />
            <span>Media</span>
          </button>
        </nav>

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
                <div className="dropzone-eyebrow-badge">
                  <ShieldCheck size={12} />
                  <span>100% PRIVATE • CLIENT-SIDE GPU ENGINE</span>
                </div>

                <div className="dropzone-aperture-icon">
                  <Film size={28} />
                </div>

                <h2>Drop a video file to begin</h2>
                <p>
                  Perform instant stream-copy cuts in 0.2s or compress video with 99% visually lossless GPU
                  encoding. Everything executes locally in your browser.
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
                    <Sparkles size={14} style={{ color: '#38bdf8' }} /> Try 1080p Demo Clip
                  </button>
                </div>

                <div className="dropzone-feature-grid">
                  <div className="dropzone-feat-card">
                    <span className="dropzone-feat-icon">✂️</span>
                    <div className="dropzone-feat-text">
                      <strong>Instant Lossless Cut</strong>
                      <span>Export in 0.2s with 0% quality loss</span>
                    </div>
                  </div>
                  <div className="dropzone-feat-card">
                    <span className="dropzone-feat-icon">⚡</span>
                    <div className="dropzone-feat-text">
                      <strong>Hardware Acceleration</strong>
                      <span>Native NVIDIA NVENC &amp; WebCodecs GPU</span>
                    </div>
                  </div>
                  <div className="dropzone-feat-card">
                    <span className="dropzone-feat-icon">🎯</span>
                    <div className="dropzone-feat-text">
                      <strong>Target Size Clamping</strong>
                      <span>Auto-tune for Discord 10MB &amp; Web 25MB</span>
                    </div>
                  </div>
                  <div className="dropzone-feat-card">
                    <span className="dropzone-feat-icon">🔒</span>
                    <div className="dropzone-feat-text">
                      <strong>Zero Cloud Uploads</strong>
                      <span>100% private, files never leave your PC</span>
                    </div>
                  </div>
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
                  <span>H.264 / HEVC / AV1</span>
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
                {activeToolTab === 'enhance' && 'AI Cinema Enhancer'}
                {activeToolTab === 'compress' && 'Compression Suite'}
                {activeToolTab === 'cut' && 'Cut & Segments'}
                {activeToolTab === 'audio' && 'Audio Track'}
                {activeToolTab === 'media' && 'Project Media'}
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

            {/* Inspector Tab Strip */}
            <div className="inspector-tab-strip">
              <button
                type="button"
                className={`insp-tab-btn ${activeToolTab === 'enhance' ? 'active blue' : ''}`}
                onClick={() => setActiveToolTab('enhance')}
              >
                <Sparkles size={11} /> Enhance
              </button>
              <button
                type="button"
                className={`insp-tab-btn ${activeToolTab === 'compress' ? 'active blue' : ''}`}
                onClick={() => setActiveToolTab('compress')}
              >
                <Zap size={11} /> Compress
              </button>
              <button
                type="button"
                className={`insp-tab-btn ${activeToolTab === 'cut' ? 'active green' : ''}`}
                onClick={() => setActiveToolTab('cut')}
              >
                <Scissors size={11} /> Cut
              </button>
              <button
                type="button"
                className={`insp-tab-btn ${activeToolTab === 'audio' ? 'active blue' : ''}`}
                onClick={() => setActiveToolTab('audio')}
              >
                <Volume2 size={11} /> Audio
              </button>
              <button
                type="button"
                className={`insp-tab-btn ${activeToolTab === 'media' ? 'active' : ''}`}
                onClick={() => setActiveToolTab('media')}
              >
                <Film size={11} /> Media
              </button>
            </div>

                        <div className="inspector-scroll-body">
              {/* TAB 1: AI CINEMA ENHANCER */}
              {activeToolTab === 'enhance' && (
                <>
                  <div className="cinema-enhancement-card">
                    <div className="inspector-group-title">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}>
                        <Sparkles size={13} />
                        AI Super-Resolution
                      </span>
                      <span className="enhancer-badge">
                        {upscaleMultiplier}× Super-Res
                      </span>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                        Target Cinema Resolution
                      </label>
                      <select
                        className="select-control"
                        value={upscaleTargetRes}
                        onChange={(e) => setUpscaleTargetRes(e.target.value)}
                      >
                        <option value="2160">AI Cinema 4K UHD (3840×2160) — Recommended</option>
                        <option value="1440">Enhanced 2K QHD (2560×1440)</option>
                        <option value="1080">Enhanced 1080p FHD (1920×1080)</option>
                      </select>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                        Framerate
                      </label>
                      <select
                        className="select-control"
                        value={upscaleFps}
                        onChange={(e) => setUpscaleFps(e.target.value)}
                      >
                        <option value="original">Original FPS ({meta.fps || 30} fps)</option>
                        <option value="60">Smooth 60 FPS</option>
                        <option value="30">Cinema 30 FPS</option>
                        <option value="24">Cinematic 24 FPS</option>
                      </select>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <button
                          type="button"
                          className={"seg-btn " + (upscaleMode === 'cinema' ? 'active-blue' : '')}
                          onClick={() => setUpscaleMode('cinema')}
                        >
                          Cinema Anti-Plastic
                        </button>
                        <button
                          type="button"
                          className={"seg-btn " + (upscaleMode === 'standard' ? 'active-blue' : '')}
                          onClick={() => setUpscaleMode('standard')}
                        >
                          Standard Lanczos
                        </button>
                      </div>
                    </div>

                    {upscaleMode === 'cinema' && (
                      <div className="enhancer-subpanel" style={{ marginTop: 10 }}>
                        <label className="enhancer-toggle-row">
                          <div className="enhancer-label-text">
                            <strong>Organic Texture Guard</strong>
                            <span>Injects temporal sensor grain to stop plastic wax look</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={upscaleAntiPlastic}
                            onChange={(e) => setUpscaleAntiPlastic(e.target.checked)}
                          />
                        </label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            <span>Contrast-Adaptive Sharpen (CAS)</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                              {Math.round(upscaleCasStrength * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            className="slider-control"
                            value={upscaleCasStrength}
                            onChange={(e) => setUpscaleCasStrength(Number(e.target.value))}
                          />
                        </div>

                        <div className="enhancer-pipeline-info">
                          Temporal Deblock • AMD CAS • Sinc Lanczos-4 • NVENC p7 (Mastering Bitrate)
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="size-preview-card">
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Hardware Engine</span>
                      <span className="size-val" style={{ color: '#38bdf8' }}>
                        {nvencAvailable ? 'NVIDIA NVENC (Mastering Quality)' : 'WebCodecs GPU'}
                      </span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Source Resolution</span>
                      <span className="size-val">{meta.width}×{meta.height}</span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Target Upscale Canvas</span>
                      <span className="size-val" style={{ color: '#38bdf8', fontWeight: 600 }}>
                        {upscaleDims.width}×{upscaleDims.height} ({upscaleMultiplier}×)
                      </span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Bitrate / Compression</span>
                      <span className="size-val" style={{ color: '#34d399' }}>
                        Mastering CQ 14 (No Compression)
                      </span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Estimated Size</span>
                      <span className="size-val" style={{ color: '#38bdf8' }}>
                        ~{formatBytes(estimatedUpscaleBytes)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: COMPRESSION & PRESETS */}
              {activeToolTab === 'compress' && (
                <>
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Quick Presets</span>
                    </div>
                    <div className="preset-chips-grid">
                      <button
                        type="button"
                        className={"preset-chip-card " + (activeQuickPreset === 'best' ? 'active' : '')}
                        onClick={() => applyQuickPreset('best')}
                      >
                        <div className="chip-title-row">
                          <Zap size={13} className="chip-icon" />
                          <span className="chip-title">Auto Lossless</span>
                        </div>
                        <span className="chip-sub">99% sharp • ~55% smaller</span>
                      </button>
                      <button
                        type="button"
                        className={"preset-chip-card " + (activeQuickPreset === 'discord' ? 'active' : '')}
                        onClick={() => applyQuickPreset('discord')}
                      >
                        <div className="chip-title-row">
                          <MessageSquare size={13} className="chip-icon" />
                          <span className="chip-title">Discord 10 MB</span>
                        </div>
                        <span className="chip-sub">Auto clamp bitrate</span>
                      </button>
                      <button
                        type="button"
                        className={"preset-chip-card " + (activeQuickPreset === 'grok' ? 'active' : '')}
                        onClick={() => applyQuickPreset('grok')}
                      >
                        <div className="chip-title-row">
                          <ShieldCheck size={13} className="chip-icon" style={{ color: '#38bdf8' }} />
                          <span className="chip-title">Grok / AI Safe</span>
                        </div>
                        <span className="chip-sub">H.264 • Clean Meta • Muted</span>
                      </button>
                      <button
                        type="button"
                        className={"preset-chip-card " + (activeQuickPreset === 'web' ? 'active' : '')}
                        onClick={() => applyQuickPreset('web')}
                      >
                        <div className="chip-title-row">
                          <Globe size={13} className="chip-icon" />
                          <span className="chip-title">Web 25 MB</span>
                        </div>
                        <span className="chip-sub">1080p web share</span>
                      </button>
                      <button
                        type="button"
                        className={"preset-chip-card " + (activeQuickPreset === 'slim' ? 'active' : '')}
                        onClick={() => applyQuickPreset('slim')}
                      >
                        <div className="chip-title-row">
                          <Smartphone size={13} className="chip-icon" />
                          <span className="chip-title">Compact 720p</span>
                        </div>
                        <span className="chip-sub">Maximum shrinkage</span>
                      </button>
                    </div>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Compression Target</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={"seg-btn " + (compressRateMode === 'crf' ? 'active-blue' : '')}
                        onClick={() => setCompressRateMode('crf')}
                      >
                        By Quality
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (compressRateMode === 'size' ? 'active-blue' : '')}
                        onClick={() => setCompressRateMode('size')}
                      >
                        Target Size (MB)
                      </button>
                    </div>
                  </div>

                  {compressRateMode === 'crf' ? (
                    <div className="inspector-group">
                      <div className="inspector-group-title">
                        <span>Quality Factor</span>
                        <span className="val">
                          CQ {compressCrf} (
                          {compressCrf <= 20
                            ? 'Lossless'
                            : compressCrf <= 23
                            ? 'High'
                            : compressCrf <= 26
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
                            className={"seg-btn " + (compressCrf === q.val ? 'active-blue' : '')}
                            onClick={() => setCompressCrf(q.val)}
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
                        value={compressCrf}
                        onChange={(e) => setCompressCrf(Number(e.target.value))}
                      />
                    </div>
                  ) : (
                    <div className="inspector-group">
                      <div className="inspector-group-title">
                        <span>Max Output Size</span>
                        <span className="val">{compressTargetMB} MB</span>
                      </div>
                      <div className="segmented-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {[8, 10, 25, 50].map((mb) => (
                          <button
                            key={mb}
                            type="button"
                            className={"seg-btn " + (compressTargetMB === mb ? 'active-blue' : '')}
                            onClick={() => setCompressTargetMB(mb)}
                          >
                            {mb}MB
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="200"
                        step="1"
                        className="slider-control"
                        value={compressTargetMB}
                        onChange={(e) => setCompressTargetMB(Number(e.target.value))}
                      />
                    </div>
                  )}

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Resolution &amp; Framerate</span>
                      <span className="val">{compressDims.width}×{compressDims.height}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <select
                        className="select-control"
                        value={compressResolution}
                        onChange={(e) => setCompressResolution(e.target.value)}
                      >
                        <option value="original">Original ({meta.width}×{meta.height})</option>
                        <option value="1080">1080p FHD</option>
                        <option value="720">720p HD</option>
                        <option value="480">480p SD</option>
                      </select>
                      <select
                        className="select-control"
                        value={compressFps}
                        onChange={(e) => setCompressFps(e.target.value)}
                      >
                        <option value="original">Same FPS</option>
                        <option value="60">60 FPS</option>
                        <option value="30">30 FPS</option>
                        <option value="24">24 FPS</option>
                      </select>
                    </div>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Video Codec</span>
                      <span className="val" style={{ color: compressCodec === 'h264' ? '#38bdf8' : 'var(--text-muted)' }}>
                        {compressCodec === 'h264' ? 'H.264 (Universal / Grok / Web)' : compressCodec === 'hevc' ? 'HEVC (H.265)' : 'AV1 (Compact)'}
                      </span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                      <button
                        type="button"
                        className={"seg-btn " + (compressCodec === 'h264' ? 'active-blue' : '')}
                        onClick={() => setCompressCodec('h264')}
                        title="Universal format supported on Grok, Twitter, Discord, WhatsApp, browsers, iPhones, and Premiere"
                      >
                        H.264 (Web/AI)
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (compressCodec === 'hevc' ? 'active-blue' : '')}
                        onClick={() => setCompressCodec('hevc')}
                        title="H.265 high-efficiency compression (may not play in all web browsers)"
                      >
                        HEVC (H.265)
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (compressCodec === 'av1' ? 'active-blue' : '')}
                        onClick={() => setCompressCodec('av1')}
                        title="Next-generation AV1 open codec"
                      >
                        AV1
                      </button>
                    </div>
                  </div>

                  <div className="accordion-wrapper">
                    <button
                      type="button"
                      className="accordion-header"
                      onClick={() => setShowProSettings((v) => !v)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={13} style={{ color: '#3b82f6' }} />
                        Pro Quality Enhancements
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {compressPsychoVisual ? '2-Pass AQ Active' : 'Standard'} {showProSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </button>

                    {showProSettings && (
                      <div className="accordion-content">
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '11.5px',
                            cursor: 'pointer',
                          }}
                        >
                          <span>2-Pass Lookahead AQ (Psycho-Visual)</span>
                          <input
                            type="checkbox"
                            checked={compressPsychoVisual}
                            onChange={(e) => setCompressPsychoVisual(e.target.checked)}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="size-preview-card">
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Source Size</span>
                      <span className="size-val">{videoFile ? formatBytes(meta.size) : '—'}</span>
                    </div>
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Estimated Output</span>
                      <span className="size-val" style={{ color: '#38bdf8' }}>
                        {videoFile ? formatBytes(estimatedCompressBytes) : '—'}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 3: CUT & SEGMENTS */}
              {activeToolTab === 'cut' && (
                <>
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Timeline Clips</span>
                      <span className="val">{segments.length} Segments</span>
                    </div>

                    <div className="segment-list-container">
                      {segments.map((seg, idx) => {
                        const isActive = seg.id === activeSegId;
                        const duration = Math.max(0, seg.end - seg.start);
                        return (
                          <div
                            key={seg.id}
                            className={"segment-item-card " + (isActive ? 'active' : '')}
                            onClick={() => {
                              setActiveSegId(seg.id);
                              setCurrentTime(seg.start);
                              if (videoRef.current) videoRef.current.currentTime = seg.start;
                            }}
                          >
                            <div>
                              <div className="segment-item-title">{seg.label || ("Clip " + (idx + 1))}</div>
                              <div className="segment-item-time">
                                {formatTimecode(seg.start)} → {formatTimecode(seg.end)} ({duration.toFixed(1)}s)
                              </div>
                            </div>
                            {segments.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-icon btn-ghost btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSegments((prev) => prev.filter((s) => s.id !== seg.id));
                                  if (activeSegId === seg.id) {
                                    const rem = segments.filter((s) => s.id !== seg.id);
                                    if (rem.length) setActiveSegId(rem[0].id);
                                  }
                                }}
                                title="Delete Segment"
                              >
                                <Trash2 size={12} style={{ color: '#f87171' }} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ width: '100%', marginTop: 4 }}
                      onClick={addNewSegment}
                      disabled={!videoFile}
                    >
                      <Plus size={13} /> Add Clip Segment
                    </button>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Encoding Mode</span>
                      <span className="val" style={{ color: cutMode === 'compress' ? '#38bdf8' : '#34d399' }}>
                        {cutMode === 'compress' ? 'Compress (H.264 Small Size)' : 'Instant Lossless (0.2s)'}
                      </span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={"seg-btn " + (cutMode === 'lossless' ? 'active-green' : '')}
                        onClick={() => setCutMode('lossless')}
                      >
                        ⚡ Lossless (0.2s)
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (cutMode === 'compress' ? 'active-green' : '')}
                        onClick={() => setCutMode('compress')}
                      >
                        📦 Compress (H.264)
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.4 }}>
                      {cutMode === 'lossless'
                        ? 'Instant stream-copy without re-encoding (preserves 100% original quality, but retains full raw camera bitrate).'
                        : 'Re-encodes cuts into lightweight H.264 files (perfect for Grok, Discord, and messaging).'}
                    </p>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Export Mode</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        className={"seg-btn " + (!mergeSegments ? 'active-green' : '')}
                        onClick={() => setMergeSegments(false)}
                      >
                        Separate Files
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (mergeSegments ? 'active-green' : '')}
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
                        className={"seg-btn " + (!losslessStripAudio ? 'active-green' : '')}
                        onClick={() => setLosslessStripAudio(false)}
                      >
                        Keep Audio
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (losslessStripAudio ? 'active-green' : '')}
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
                        {formatBytes(estimatedCutBytes)}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Instant stream copy (-c copy). No transcoding or quality loss.
                    </div>
                  </div>
                </>
              )}

              {/* TAB 4: AUDIO */}
              {activeToolTab === 'audio' && (
                <>
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Audio Processing</span>
                    </div>
                    <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                      <button
                        type="button"
                        className={"seg-btn " + (audioMode === 'copy' ? 'active-blue' : '')}
                        onClick={() => setAudioMode('copy')}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (audioMode === 'aac' ? 'active-blue' : '')}
                        onClick={() => setAudioMode('aac')}
                      >
                        AAC
                      </button>
                      <button
                        type="button"
                        className={"seg-btn " + (audioMode === 'strip' ? 'active-blue' : '')}
                        onClick={() => setAudioMode('strip')}
                      >
                        Mute
                      </button>
                    </div>
                  </div>

                  {audioMode === 'aac' && (
                    <div className="inspector-group">
                      <div className="inspector-group-title">
                        <span>AAC Audio Bitrate</span>
                        <span className="val">{audioBitrateKbps} kbps</span>
                      </div>
                      <div className="segmented-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                        {[128, 160, 192, 256].map((kbps) => (
                          <button
                            key={kbps}
                            type="button"
                            className={"seg-btn " + (audioBitrateKbps === kbps ? 'active-blue' : '')}
                            onClick={() => setAudioBitrateKbps(kbps)}
                          >
                            {kbps}k
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="size-preview-card">
                    <div className="size-row">
                      <span style={{ color: 'var(--text-secondary)' }}>Audio Status</span>
                      <span className="size-val" style={{ color: audioMode === 'strip' ? '#f87171' : '#34d399' }}>
                        {audioMode === 'strip' ? 'Stripped / Muted' : audioMode === 'copy' ? 'Direct Stream Copy' : ('AAC ' + audioBitrateKbps + ' kbps')}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Preserve original multichannel audio or re-encode to high-efficiency AAC stereo.
                    </div>
                  </div>
                </>
              )}

              {/* TAB 5: MEDIA */}
              {activeToolTab === 'media' && (
                <>
                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>File Information</span>
                    </div>
                    <div className="size-preview-card" style={{ gap: 8 }}>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>File Name</span>
                        <span className="size-val" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meta.name || '—'}
                        </span>
                      </div>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>File Size</span>
                        <span className="size-val">{videoFile ? formatBytes(meta.size) : '—'}</span>
                      </div>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Resolution</span>
                        <span className="size-val">{meta.width ? (meta.width + '×' + meta.height) : '—'}</span>
                      </div>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Duration</span>
                        <span className="size-val">{meta.duration ? formatTimecode(meta.duration) : '—'}</span>
                      </div>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Container</span>
                        <span className="size-val" style={{ textTransform: 'uppercase' }}>
                          {(meta.name || '').split('.').pop() || 'MP4'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="inspector-group">
                    <div className="inspector-group-title">
                      <span>Acceleration Engine</span>
                    </div>
                    <div className="size-preview-card">
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>Device GPU</span>
                        <span className="size-val" style={{ color: '#34d399' }}>
                          {nvencAvailable ? 'NVIDIA RTX 4050' : 'Integrated GPU'}
                        </span>
                      </div>
                      <div className="size-row">
                        <span style={{ color: 'var(--text-secondary)' }}>NVENC Status</span>
                        <span className="size-val" style={{ color: nvencAvailable ? '#34d399' : 'var(--text-muted)' }}>
                          {nvencAvailable ? 'Active (Ada Lovelace p7)' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={13} /> Replace Video File
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleLoadDemo}
                      disabled={isGeneratingDemo || isProcessing}
                    >
                      <Sparkles size={13} style={{ color: '#38bdf8' }} /> Try 1080p Studio Demo
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Inspector Footer CTA */}
            {videoFile && (
              <div className="inspector-footer">
                {outputResult?.primary ? (
                  <div className="done-result-box">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                        <CheckCircle2 size={15} /> Ready in {outputResult.elapsedSec.toFixed(1)}s
                      </span>
                      <span className="savings-tag">
                        {outputResult.primary.label?.includes('AI Cinema') ? (
                          '4K Master'
                        ) : (
                          `Saved ${savingsPct}%`
                        )}
                      </span>
                    </div>
                    {outputResult.segments && outputResult.segments.length > 1 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        {!mergeSegments ? (
                          <button
                            type="button"
                            className="btn btn-green"
                            style={{ width: '100%', padding: '10px 14px' }}
                            onClick={() => triggerDownloadAll(outputResult.segments)}
                          >
                            <Download size={14} /> Download All {outputResult.segments.length} Clips (Batch)
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-green"
                              style={{ width: '100%', padding: '10px 14px' }}
                              onClick={() => triggerDownload(outputResult.primary)}
                            >
                              <Download size={14} /> Download Merged Video ({formatBytes(outputResult.primary.size)})
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ width: '100%', fontSize: '11.5px' }}
                              onClick={() => triggerDownloadAll(outputResult.segments)}
                            >
                              <Download size={12} /> Download All {outputResult.segments.length} Separate Clips
                            </button>
                          </>
                        )}

                        <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
                          {outputResult.segments.map((seg, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 6,
                                fontSize: '11.5px',
                              }}
                            >
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                                <span style={{ fontWeight: 600 }}>{seg.label || `Clip ${idx + 1}`}</span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                  ({(seg.duration || 0).toFixed(1)}s • {formatBytes(seg.size)})
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                style={{ padding: '3px 8px', height: 'auto', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => triggerDownload(seg)}
                                title="Download this clip"
                              >
                                <Download size={11} /> Save
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-green"
                        style={{ width: '100%', padding: '10px 14px', marginTop: 8 }}
                        onClick={() => triggerDownload(outputResult.primary)}
                      >
                        <Download size={14} /> Download {outputResult.primary.label || 'Output'} ({formatBytes(outputResult.primary.size)})
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', color: 'var(--text-muted)' }}
                      onClick={() => handleRunAction()}
                      disabled={isProcessing}
                    >
                      Re-encode clip
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        padding: '8px 10px',
                        background: 'rgba(56, 189, 248, 0.05)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <ShieldCheck size={13} /> Grok & AI Pre-Flight
                        </span>
                        <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: 4, background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 600 }}>
                          Clean Meta ✓
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Codec</span>
                          <span style={{ color: compressCodec === 'h264' ? '#34d399' : '#f59e0b', fontWeight: 500 }}>
                            {compressCodec === 'h264' ? 'H.264 (Universal ✓)' : `${compressCodec.toUpperCase()} (Switch to H.264)`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Copyright / Audio</span>
                          {(activeToolTab === 'cut' ? losslessStripAudio : audioMode === 'strip') ? (
                            <span style={{ color: '#34d399', fontWeight: 500 }}>Audio Muted (Safe ✓)</span>
                          ) : (
                            <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                              Audio Active
                              <button
                                type="button"
                                onClick={() => {
                                  if (activeToolTab === 'cut') setLosslessStripAudio(true);
                                  else setAudioMode('strip');
                                  showToast('Audio muted to avoid copyright filters');
                                }}
                                style={{ color: '#38bdf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                              >
                                Mute
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={"btn " + (activeToolTab === 'cut' ? 'btn-green' : 'btn-primary')}
                      style={{ width: '100%', padding: '10px 14px' }}
                      disabled={isProcessing}
                      onClick={() => handleRunAction()}
                    >
                      {isProcessing ? (
                        <>
                          Encoding... {Math.round(progress * 100)}%
                          {encodingStats.fps > 0 ? (" (" + encodingStats.fps + " fps)") : ''}
                        </>
                      ) : activeToolTab === 'cut' ? (
                        <>
                          <Scissors size={14} /> {cutMode === 'compress' ? 'Export Compressed Cuts (H.264)' : 'Export Lossless Cut (0.2s)'}
                        </>
                      ) : activeToolTab === 'enhance' ? (
                        <>
                          <Sparkles size={14} /> AI Cinema Upscale ({upscaleDims.width}×{upscaleDims.height})
                        </>
                      ) : (
                        <>
                          <Zap size={14} /> Compress Video ({compressRateMode === 'size' ? `${compressTargetMB} MB` : `CQ ${compressCrf}`})
                        </>
                      )}
                    </button>
                  </>
                )}

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

          <div className="timeline-tracks-stack">
            {/* V1 Video Track */}
            <div className="timeline-track-row">
              <div className="timeline-track-header v1">
                <Film size={12} />
                <span>V1</span>
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

            {/* A1 Audio Track */}
            <div className="timeline-track-row">
              <div className="timeline-track-header a1">
                <Volume2 size={12} />
                <span>A1</span>
              </div>
              <div
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
                <div className="audio-waveform-backdrop">
                  {waveformBars.map((heightPct, idx) => {
                    const barTime = meta.duration ? (idx / waveformBars.length) * meta.duration : 0;
                    const inSeg = activeSegment && barTime >= activeSegment.start && barTime <= activeSegment.end;
                    return (
                      <div
                        key={idx}
                        className={`audio-waveform-bar ${inSeg ? 'in-segment' : ''}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    );
                  })}
                </div>

                {/* Playhead on A1 track as well */}
                <div
                  className="timeline-playhead-line"
                  style={{
                    left: `${meta.duration ? (currentTime / meta.duration) * 100 : 0}%`,
                  }}
                />
              </div>
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
