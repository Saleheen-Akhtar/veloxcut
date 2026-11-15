import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Scissors,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  Sliders,
  Check,
  Maximize2,
  Film,
  Download,
  RotateCcw,
  Play,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function VeloxLandingShowcase({
  onLaunchStudio,
  onLoadDemo,
  onDropFile,
  nvencAvailable,
}) {
  const containerRef = useRef(null);
  const heroRef = useRef(null);
  const heroStageRef = useRef(null);
  const scrubTextRef = useRef(null);
  const [activeAccordion, setActiveAccordion] = useState(0);
  const [wipePosition, setWipePosition] = useState(54);
  const [isWipeDragging, setIsWipeDragging] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const wipeTrackRef = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      // 1. Hero Stage Scale & Specular Fade Scroll
      if (heroStageRef.current) {
        gsap.fromTo(
          heroStageRef.current,
          { scale: 0.88, opacity: 0.7 },
          {
            scale: 1,
            opacity: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: heroStageRef.current,
              start: 'top 85%',
              end: 'top 35%',
              scrub: 1.2,
            },
          }
        );
      }

      // 2. Scrubbing Text Reveal (Word by Word)
      if (scrubTextRef.current) {
        const words = scrubTextRef.current.querySelectorAll('.scrub-word');
        gsap.fromTo(
          words,
          { opacity: 0.14, y: 4 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.08,
            ease: 'none',
            scrollTrigger: {
              trigger: scrubTextRef.current,
              start: 'top 75%',
              end: 'bottom 45%',
              scrub: 1,
            },
          }
        );
      }

      // 3. Bento Grid Cards Entrance
      const bentoCards = containerRef.current?.querySelectorAll('.bento-cell');
      if (bentoCards && bentoCards.length > 0) {
        gsap.fromTo(
          bentoCards,
          { opacity: 0, y: 32 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '.bento-grid-container',
              start: 'top 80%',
            },
          }
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Split wipe drag handler for bento card 1
  const handleWipePointerMove = (e) => {
    if (!isWipeDragging || !wipeTrackRef.current) return;
    const rect = wipeTrackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = Math.round((x / rect.width) * 100);
    setWipePosition(pct);
  };

  const handleWipePointerUp = () => {
    setIsWipeDragging(false);
  };

  useEffect(() => {
    if (isWipeDragging) {
      window.addEventListener('pointermove', handleWipePointerMove);
      window.addEventListener('pointerup', handleWipePointerUp);
      return () => {
        window.removeEventListener('pointermove', handleWipePointerMove);
        window.removeEventListener('pointerup', handleWipePointerUp);
      };
    }
  }, [isWipeDragging]);

  const accordionItems = [
    {
      title: 'Lossless Bitstream Splitter',
      subtitle: 'Instant Keyframe Stream-Copy',
      description:
        'Slices and trims multi-gigabyte video clips in under 0.2s without re-encoding, preserving exact bit-for-bit video and audio fidelity.',
      metric: '0.2s Export Speed',
      gradient: 'radial-gradient(circle at 30% 30%, rgba(56, 189, 248, 0.4), transparent 70%), linear-gradient(135deg, #0369a1 0%, #082f49 50%, #020617 100%)',
    },
    {
      title: 'NVENC Direct Bitstream Pipeline',
      subtitle: 'Zero CPU Bottlenecks',
      description:
        'Streams high-bitrate video straight to the NVIDIA NVENC silicon for sub-second exports at calibrated constant-quality CQ compression.',
      metric: '380+ FPS Encoding',
      gradient: 'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.4), transparent 70%), linear-gradient(135deg, #4338ca 0%, #1e1b4b 50%, #020617 100%)',
    },
    {
      title: 'WebCodecs GPU Stream Engine',
      subtitle: 'In-Browser Silicon Acceleration',
      description:
        'Splits, trims, and remuxes MP4 and MKV containers losslessly at memory speed without touching CPU cycles or uncompressing frames.',
      metric: '0.00% Quality Loss',
      gradient: 'radial-gradient(circle at 30% 30%, rgba(16, 185, 129, 0.4), transparent 70%), linear-gradient(135deg, #047857 0%, #064e3b 50%, #020617 100%)',
    },
  ];

  return (
    <main
      ref={containerRef}
      className="landing-root overflow-x-hidden w-full max-w-full"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDropActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDropActive(false);
        if (e.dataTransfer.files?.[0]) {
          onDropFile(e.dataTransfer.files[0]);
        }
      }}
    >
      {/* 1. FLOATING GLASS PILL NAVIGATION */}
      <nav className="fixed-nav-wrapper">
        <header className="glass-nav-pill">
          <div className="nav-brand-group" onClick={onLaunchStudio}>
            <div className="nav-logo-mark">
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect
                  x="2"
                  y="2"
                  width="24"
                  height="24"
                  rx="6"
                  fill="#0e111a"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="1.2"
                />
                <path d="M7 8L12.5 20L14 17L9.5 8H7Z" fill="#38bdf8" />
                <path d="M21 8L15 20L13.8 20L18.5 10.5H14.5L15.5 8H21Z" fill="#6366f1" />
              </svg>
            </div>
            <span className="nav-brand-text">
              VELOX<span className="accent">CUT</span>
            </span>
          </div>

          <div className="nav-links-cluster">
            <a href="#architecture" className="nav-link">
              Architecture
            </a>
            <a href="#bento-tech" className="nav-link">
              Engines
            </a>
            <a href="#pipeline" className="nav-link">
              Pipeline
            </a>
          </div>

          <div className="nav-cta-cluster">
            <div className="nav-hw-badge" title="Hardware Acceleration Detected">
              <span className="status-dot-active" />
              <span>{nvencAvailable ? 'NVIDIA NVENC' : 'WebCodecs GPU'}</span>
            </div>
            <button
              type="button"
              className="nav-primary-action"
              onClick={onLaunchStudio}
            >
              Open Studio
              <ArrowRight size={14} />
            </button>
          </div>
        </header>
      </nav>

      {/* 2. HERO */}
      <section ref={heroRef} className="hero-cinematic-section">
        <div className="hero-content-boundary">
          <div className="hero-editorial-group">
            <h1 className="hero-h1-editorial">
              Lossless video trimming and GPU compression
            </h1>

            <p className="hero-subtitle-editorial">
              Perform instant stream-copy cuts with zero transcoding, or compress footage into compact
              H.264 and HEVC files using hardware acceleration.
            </p>

            <div className="hero-action-row">
              <button
                type="button"
                className="btn-primary-hero"
                onClick={onLaunchStudio}
              >
                Open studio
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                className="btn-secondary-hero"
                onClick={onLoadDemo}
              >
                <Play size={14} />
                Load sample clip
              </button>
            </div>
          </div>

          {/* Interactive Studio Preview Mockup */}
          <div ref={heroStageRef} className="hero-mockup-wrapper">
            <div className="hero-mockup-frame">
              <div className="mockup-header-bar">
                <div className="mockup-traffic-lights">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mockup-title-tab">
                  veloxcut_lossless_timeline.mp4
                </div>
                <div className="mockup-engine-indicator">
                  1080p • 60 fps
                </div>
              </div>

              <div
                className="mockup-stage-viewport"
                onClick={onLaunchStudio}
                role="button"
                tabIndex={0}
              >
                <div className="mockup-video-bg">
                  <div className="mockup-split-overlay">
                    <div className="mockup-split-label left">Source stream</div>
                    <div className="mockup-split-divider" />
                    <div className="mockup-split-label right">Trimmed segment (0.2s)</div>
                  </div>

                  <div className="mockup-center-prompt">
                    <div className="prompt-play-glyph">
                      <Maximize2 size={18} />
                    </div>
                    <span>Enter studio workspace</span>
                  </div>
                </div>

                <div className="mockup-timeline-strip">
                  <div className="timeline-track-ruler">
                    <span>00:00:00</span>
                    <span>00:00:15</span>
                    <span>00:00:30</span>
                    <span>00:00:45</span>
                    <span>00:01:00</span>
                  </div>
                  <div className="timeline-track-clip">
                    <div className="clip-handle-start" />
                    <div className="clip-body-preview">
                      <span className="clip-label-text">
                        scene_01_trimmed.mp4
                      </span>
                    </div>
                    <div className="clip-handle-end" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HARDWARE CAPABILITIES STRIP */}
      <section className="marquee-strip-section">
        <div className="marquee-viewport">
          <div className="marquee-content-track">
            {[
              'Lossless stream-copy',
              'NVIDIA NVENC hardware encoding',
              'WebCodecs GPU pipeline',
              'In-memory MP4 remuxing',
              'H.264 & HEVC export',
              'Zero cloud uploads',
              'Tabular audio sync',
              'Lossless stream-copy',
              'NVIDIA NVENC hardware encoding',
              'WebCodecs GPU pipeline',
              'In-memory MP4 remuxing',
              'H.264 & HEVC export',
              'Zero cloud uploads',
              'Tabular audio sync',
            ].map((item, idx) => (
              <div key={idx} className="marquee-pill-item">
                <span className="pill-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. TECHNICAL FEATURES GRID */}
      <section id="bento-tech" className="bento-editorial-section">
        <div className="section-header-block">
          <h2 className="section-h2-title">
            Engineered for local video operations
          </h2>
          <p className="section-p-subtitle">
            Fast stream operations with zero cloud uploads or generational quality loss.
          </p>
        </div>

        <div className="bento-grid-container">
          {/* Card A: Lossless Stream Splitter with comparison */}
          <div className="bento-cell bento-hero-wipe col-span-2 row-span-2">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Stream-copy</span>
                <span className="badge-highlight">&lt; 0.2s export</span>
              </div>

              <h3 className="bento-h3-title">
                Zero-transcode stream trimming
              </h3>
              <p className="bento-p-body">
                Split and trim multi-scene video clips in milliseconds without re-encoding frames.
                Original video and audio bitstreams remain bit-identical.
              </p>

              <div
                ref={wipeTrackRef}
                className="interactive-wipe-stage"
                onPointerDown={() => setIsWipeDragging(true)}
              >
                <div className="wipe-layer-base">
                  <span className="layer-tag left">Source stream</span>
                </div>

                <div
                  className="wipe-layer-sharp"
                  style={{ width: `${wipePosition}%` }}
                >
                  <span className="layer-tag right">Trimmed segment</span>
                </div>

                <div
                  className="wipe-divider-handle"
                  style={{ left: `${wipePosition}%` }}
                >
                  <div className="handle-pip">
                    <Sliders size={11} />
                  </div>
                </div>
              </div>

              <div className="bento-spec-grid">
                <div>
                  <span className="spec-label">Export latency</span>
                  <span className="spec-val">&lt; 0.2s</span>
                </div>
                <div>
                  <span className="spec-label">Transcode loss</span>
                  <span className="spec-val">0.00%</span>
                </div>
                <div>
                  <span className="spec-label">Stream fidelity</span>
                  <span className="spec-val">Bit-identical</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card B: Hardware Accelerator */}
          <div className="bento-cell bento-nvenc col-span-2 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Hardware encoder</span>
                <span className="badge-highlight">NVENC &amp; WebCodecs</span>
              </div>
              <h3 className="bento-h3-title">Local GPU acceleration</h3>
              <p className="bento-p-body">
                Direct integration with local GPU silicon delivers fast encoding without browser freezing.
              </p>

              <div className="nvenc-meter-bar">
                <div className="meter-label-row">
                  <span>Encoding throughput</span>
                  <span className="meter-stat">Hardware accelerated</span>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: '85%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card C: Lossless Bitstream Cutter */}
          <div className="bento-cell bento-cutter col-span-1 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Precision</span>
              </div>
              <h3 className="bento-h3-title">Keyframe cuts</h3>
              <p className="bento-p-body">
                Split and extract scenes cleanly with exact keyframe boundary detection.
              </p>
              <div className="cutter-status-pill">
                <Check size={13} />
                <span>Lossless stream copy</span>
              </div>
            </div>
          </div>

          {/* Card D: Target Size Control */}
          <div className="bento-cell bento-compress col-span-1 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Rate control</span>
              </div>
              <h3 className="bento-h3-title">Target size control</h3>
              <p className="bento-p-body">
                Calibrated bitrate curves match Discord 10 MB and Web 25 MB limits cleanly.
              </p>
              <div className="compress-preset-tags">
                <span className="preset-chip">Discord 10MB</span>
                <span className="preset-chip">Web 25MB</span>
                <span className="preset-chip">CRF 24</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. ARCHITECTURE PIPELINE */}
      <section id="pipeline" className="pipeline-scrub-section">
        <div className="scrub-container">
          <div ref={scrubTextRef} className="scrub-headline-block">
            {[
              'Direct',
              'silicon',
              'encoding',
              'keeps',
              'your',
              'media',
              'private.',
              'Experience',
              'instant',
              'stream-copy',
              'cutting',
              'and',
              'calibrated',
              'compression',
              'locally.',
            ].map((word, i) => (
              <span key={i} className="scrub-word">
                {word}{' '}
              </span>
            ))}
          </div>

          {/* Clean Horizontal Accordion */}
          <div className="horizontal-accordion-container">
            {[
              {
                title: 'Lossless stream copy',
                subtitle: 'Zero re-encoding',
                description: 'Trims multi-gigabyte video clips in under 0.2s by copying container bitstreams directly without uncompressing frames.',
                metric: '0.2s latency',
              },
              {
                title: 'Hardware GPU encoder',
                subtitle: 'NVENC and WebCodecs',
                description: 'Direct GPU silicon encoding delivers smooth compression with calibrated constant-quality rate curves.',
                metric: 'Local GPU',
              },
              {
                title: 'In-browser processing',
                subtitle: 'Zero cloud transfers',
                description: 'Container demuxing and remuxing occur in local browser memory. Files never leave your workstation.',
                metric: '100% private',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className={`accordion-slice ${
                  activeAccordion === idx ? 'slice-expanded' : 'slice-collapsed'
                }`}
                onMouseEnter={() => setActiveAccordion(idx)}
                onClick={() => setActiveAccordion(idx)}
              >
                <div className="accordion-content">
                  <div className="accordion-top-row">
                    <span className="accordion-index">{`0${idx + 1}`}</span>
                    <span className="accordion-metric-chip">{item.metric}</span>
                  </div>

                  <div className="accordion-text-group">
                    <h4 className="accordion-title">{item.title}</h4>
                    <p className="accordion-subtitle">{item.subtitle}</p>
                    {activeAccordion === idx && (
                      <p className="accordion-desc-expanded">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION & DROPZONE */}
      <section id="architecture" className="action-cta-section">
        <div
          className={`action-dropzone-card ${
            isDropActive ? 'dropzone-active-drag' : ''
          }`}
          onClick={onLaunchStudio}
        >
          <div className="action-inner-content">
            <span className="action-eyebrow">Local processing</span>
            <h2 className="action-h2-large">
              Start editing video
            </h2>
            <p className="action-p-sub">
              Drop any MP4, MKV, or MOV file to begin, or open the studio workspace.
            </p>

            <div className="action-buttons-group">
              <button
                type="button"
                className="btn-primary-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onLaunchStudio();
                }}
              >
                Open studio workspace
                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                className="btn-demo-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadDemo();
                }}
              >
                <Play size={14} />
                Load sample clip
              </button>
            </div>

            <div className="action-drop-indicator">
              <span className="drop-hint-text">
                Or drag and drop video files anywhere on this page
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 7. CLEAN EDITORIAL FOOTER */}
      <footer className="editorial-footer">
        <div className="footer-content-row">
          <div className="footer-brand-side">
            <span className="footer-logo-title">
              VELOX<span className="accent">CUT</span>
            </span>
            <span className="footer-tagline">
              Browser-native video trimmer &amp; GPU compressor
            </span>
          </div>

          <div className="footer-links-side">
            <button
              type="button"
              className="footer-link-btn"
              onClick={onLaunchStudio}
            >
              Studio editor
            </button>
            <button
              type="button"
              className="footer-link-btn"
              onClick={onLoadDemo}
            >
              Sample clip
            </button>
          </div>
        </div>

        <div className="footer-bottom-row">
          <span>Client-side local memory processing. Zero cloud telemetry.</span>
          <span>VeloxCut Studio</span>
        </div>
      </footer>
    </main>
  );
}
