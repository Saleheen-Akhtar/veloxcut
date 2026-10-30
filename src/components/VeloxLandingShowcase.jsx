import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Sparkles,
  Zap,
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

      {/* 2. ATTENTION (HERO): CINEMATIC CENTER ARCHITECTURE */}
      <section ref={heroRef} className="hero-cinematic-section">
        <div className="hero-backdrop-wash" />
        <div className="hero-radial-glow" />

        <div className="hero-content-boundary">
          <div className="hero-editorial-group">
            <h1 className="hero-h1-editorial">
              High-Speed Precision Cutting
              <span
                className="inline-pill-image"
                style={{
                  background:
                    'radial-gradient(circle at 35% 35%, #38bdf8 0%, #6366f1 55%, #0f172a 100%)',
                  boxShadow: '0 0 20px rgba(56, 189, 248, 0.45), inset 0 0 10px rgba(255, 255, 255, 0.35)',
                }}
              />
              for Any Video Format
            </h1>

            <p className="hero-subtitle-editorial">
              Perform sub-second stream-copy cuts with zero transcoding, or compress heavy footage
              into ultra-compact H.264 files ready for Grok, Discord, and messaging.
            </p>

            <div className="hero-action-row">
              <button
                type="button"
                className="btn-primary-hero"
                onClick={onLaunchStudio}
              >
                Launch Studio Workspace
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn-secondary-hero"
                onClick={onLoadDemo}
              >
                <Sparkles size={16} />
                Load Interactive Demo Clip
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
                  1080p FHD • 60 FPS
                </div>
              </div>

              <div
                className="mockup-stage-viewport"
                onClick={onLaunchStudio}
                role="button"
                tabIndex={0}
              >
                <div
                  className="mockup-video-bg"
                  style={{
                    background:
                      'radial-gradient(ellipse at 50% 35%, rgba(56, 189, 248, 0.18) 0%, rgba(99, 102, 241, 0.08) 50%, #06080d 100%)',
                    backgroundColor: '#07090e',
                  }}
                >
                  <div className="mockup-split-overlay">
                    <div className="mockup-split-label left">Original Stream</div>
                    <div className="mockup-split-divider" />
                    <div className="mockup-split-label right">Lossless Cut (0.2s)</div>
                  </div>

                  <div className="mockup-center-prompt">
                    <div className="prompt-play-glyph">
                      <Maximize2 size={24} />
                    </div>
                    <span>Click to Enter Full NLE Workspace</span>
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
                        Scene 01_Lossless_Cut.mp4
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

      {/* 3. INFINITE MARQUEE (HARDWARE STACK) */}
      <section className="marquee-strip-section">
        <div className="marquee-viewport">
          <div className="marquee-content-track">
            {[
              'NVIDIA NVENC DUAL GEN-8',
              'WEBM & MP4 LOSSLESS MUX',
              'CONTRAST-ADAPTIVE CAS 0.65',
              'AV1 SILICON CODEC',
              'HEVC MAIN 10-BIT',
              'WEBAUDIO ZERO-LATENCY DSP',
              'CLIENT-SIDE LOCAL ENCODING',
              'KEYFRAME-ACCURATE CUTS',
              'NVIDIA NVENC DUAL GEN-8',
              'WEBM & MP4 LOSSLESS MUX',
              'CONTRAST-ADAPTIVE CAS 0.65',
              'AV1 SILICON CODEC',
              'HEVC MAIN 10-BIT',
              'WEBAUDIO ZERO-LATENCY DSP',
              'CLIENT-SIDE LOCAL ENCODING',
              'KEYFRAME-ACCURATE CUTS',
            ].map((item, idx) => (
              <div key={idx} className="marquee-pill-item">
                <span className="pill-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. INTEREST: MATHEMATICALLY GAPLESS BENTO GRID */}
      <section id="bento-tech" className="bento-editorial-section">
        <div className="section-header-block">
          <h2 className="section-h2-title">
            Engineered for Precision Video Operations
          </h2>
          <p className="section-p-subtitle">
            Every feature runs independently with zero unwanted compression side-effects.
          </p>
        </div>

        {/* 4-column, 2-row mathematically interlocking grid (8/8 cells filled) */}
        <div className="bento-grid-container">
          {/* Card A: Lossless Stream Splitter with interactive comparison (Col span 2, Row span 2 = 4 cells) */}
          <div className="bento-cell bento-hero-wipe col-span-2 row-span-2">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Lossless Stream-Copy</span>
                <span className="badge-highlight">0.2s Instant Cut</span>
              </div>

              <h3 className="bento-h3-title">
                Zero-Transcode Precision Cutting
              </h3>
              <p className="bento-p-body">
                Split, trim, and export multi-scene video clips in milliseconds without re-encoding a single frame.
                100% original video &amp; audio fidelity with zero generational loss.
              </p>

              <div
                ref={wipeTrackRef}
                className="interactive-wipe-stage"
                onPointerDown={() => setIsWipeDragging(true)}
              >
                <div
                  className="wipe-layer-base"
                  style={{
                    background:
                      'radial-gradient(circle at 60% 40%, rgba(239, 68, 68, 0.2), transparent 70%), linear-gradient(135deg, #181d28 0%, #0a0d14 100%)',
                    filter: 'blur(1px)',
                  }}
                >
                  <span className="layer-tag left">Original Stream</span>
                </div>

                <div
                  className="wipe-layer-sharp"
                  style={{
                    width: `${wipePosition}%`,
                    background:
                      'radial-gradient(circle at 40% 40%, rgba(56, 189, 248, 0.35), transparent 70%), linear-gradient(135deg, #0e2030 0%, #071018 100%)',
                    borderRight: '2px solid #38bdf8',
                  }}
                >
                  <span className="layer-tag right">Lossless Cut (0.2s)</span>
                </div>

                <div
                  className="wipe-divider-handle"
                  style={{ left: `${wipePosition}%` }}
                >
                  <div className="handle-pip">
                    <Sliders size={12} />
                  </div>
                </div>
              </div>

              <div className="bento-spec-grid">
                <div>
                  <span className="spec-label">Export Latency</span>
                  <span className="spec-val">&lt; 0.2s Instant</span>
                </div>
                <div>
                  <span className="spec-label">Transcode Loss</span>
                  <span className="spec-val">0.00% (None)</span>
                </div>
                <div>
                  <span className="spec-label">Stream Fidelity</span>
                  <span className="spec-val">100% Bit-Identical</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card B: NVENC Hardware Accelerator (Col span 2, Row span 1 = 2 cells) */}
          <div className="bento-cell bento-nvenc col-span-2 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Silicon Direct</span>
                <span className="badge-highlight">NVIDIA NVENC Engine</span>
              </div>
              <h3 className="bento-h3-title">Zero-CPU Hardware Encoding</h3>
              <p className="bento-p-body">
                Direct integration with local GPU silicon delivers up to 12x real-time speed.
                Compress 1 GB files in under 3 seconds without fan noise.
              </p>

              <div className="nvenc-meter-bar">
                <div className="meter-label-row">
                  <span>Encoding Speed Benchmark</span>
                  <span className="meter-stat">380 FPS Average</span>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" style={{ width: '92%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card C: Lossless Bitstream Cutter (Col span 1, Row span 1 = 1 cell) */}
          <div className="bento-cell bento-cutter col-span-1 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">LosslessCut</span>
              </div>
              <h3 className="bento-h3-title">Keyframe Stream Cut</h3>
              <p className="bento-p-body">
                Split, splice, and trim clips without re-encoding a single frame. Zero quality degradation.
              </p>
              <div className="cutter-status-pill">
                <Check size={14} />
                <span>0.00% Quality Loss</span>
              </div>
            </div>
          </div>

          {/* Card D: Psycho-Visual Compression (Col span 1, Row span 1 = 1 cell) */}
          <div className="bento-cell bento-compress col-span-1 row-span-1">
            <div className="bento-card-inner">
              <div className="bento-badge-row">
                <span className="badge-technical">Psycho-Visual</span>
              </div>
              <h3 className="bento-h3-title">Target Size Control</h3>
              <p className="bento-p-body">
                Hit exact Discord 10 MB or Web 25 MB targets with intelligent rate control curves.
              </p>
              <div className="compress-preset-tags">
                <span className="preset-chip">Discord 10MB</span>
                <span className="preset-chip">Web 25MB</span>
                <span className="preset-chip">CRF 20 HQ</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. DESIRE: SCRUBBING REVEAL & HORIZONTAL ACCORDIONS */}
      <section id="pipeline" className="pipeline-scrub-section">
        <div className="scrub-container">
          <div ref={scrubTextRef} className="scrub-headline-block">
            {[
              'Direct',
              'silicon',
              'encoding',
              'means',
              'your',
              'raw',
              'media',
              'never',
              'leaves',
              'your',
              'workstation.',
              'Experience',
              'precision',
              'compression',
              'and',
              'instant',
              'bitstream',
              'cuts',
              'with',
              'zero',
              'cloud',
              'latency.',
            ].map((word, i) => (
              <span key={i} className="scrub-word">
                {word}{' '}
              </span>
            ))}
          </div>

          {/* Horizontal Accordion */}
          <div className="horizontal-accordion-container">
            {accordionItems.map((item, idx) => (
              <div
                key={idx}
                className={`accordion-slice ${
                  activeAccordion === idx ? 'slice-expanded' : 'slice-collapsed'
                }`}
                onMouseEnter={() => setActiveAccordion(idx)}
                onClick={() => setActiveAccordion(idx)}
              >
                <div
                  className="accordion-bg-layer"
                  style={{
                    background: item.gradient,
                  }}
                />
                <div className="accordion-overlay" />

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

      {/* 6. ACTION: MASSIVE CALL TO ACTION & DRAG DROP ZONE */}
      <section id="architecture" className="action-cta-section">
        <div
          className={`action-dropzone-card ${
            isDropActive ? 'dropzone-active-drag' : ''
          }`}
          onClick={onLaunchStudio}
        >
          <div className="action-glow-orb" />

          <div className="action-inner-content">
            <span className="action-eyebrow">Local Silicon Engine</span>
            <h2 className="action-h2-large">
              Start Editing at the Speed of Silicon
            </h2>
            <p className="action-p-sub">
              Drop any MP4, MKV, or MOV file directly here, or launch the studio workspace to begin.
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
                Open Studio Workspace
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn-demo-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onLoadDemo();
                }}
              >
                <Sparkles size={16} />
                Load Demo Footage
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
              Precision In-Browser NLE & GPU Mastering Suite
            </span>
          </div>

          <div className="footer-links-side">
            <button
              type="button"
              className="footer-link-btn"
              onClick={onLaunchStudio}
            >
              Studio Editor
            </button>
            <button
              type="button"
              className="footer-link-btn"
              onClick={onLoadDemo}
            >
              Demo Clip
            </button>
            <a
              href="https://github.com/Leonxlnx/taste-skill"
              target="_blank"
              rel="noreferrer"
              className="footer-link-btn"
            >
              Taste System
            </a>
          </div>
        </div>

        <div className="footer-bottom-row">
          <span>Zero cloud telemetry. Client-side local memory processing.</span>
          <span>Version 1.4.0 Studio Release</span>
        </div>
      </footer>
    </main>
  );
}
