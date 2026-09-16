'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { SharedThoughtDocument, sendThoughtReaction } from '@/lib/thoughtspace-service';
import { parseOrGenerateThoughtCanvas } from '@/lib/thought-canvas-generator';
import { drawSmoothStroke } from '@/lib/canvas-utils';
import { Stroke, Viewport } from '@/types/canvas';
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Heart,
  Plus,
  Check,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Compass,
  Maximize2,
} from 'lucide-react';

interface LiveThoughtFeedViewProps {
  thoughts: SharedThoughtDocument[];
  initialThoughtId: string;
  onClose: () => void;
}

// Custom easing matching cubic-bezier(0.65, 0, 0, 1)
function cubicEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const LiveThoughtFeedView: React.FC<LiveThoughtFeedViewProps> = ({
  thoughts,
  initialThoughtId,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const idx = thoughts.findIndex((t) => t.id === initialThoughtId);
    return idx >= 0 ? idx : 0;
  });

  const activeThought = thoughts[currentIndex] || thoughts[0];

  // Heavy sequential wave fade state
  // waveProgress goes from 0 to 1 during transition
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'fading_out' | 'fading_in'>('idle');
  const [waveProgress, setWaveProgress] = useState<number>(1);
  const [waveDirection, setWaveDirection] = useState<'forward' | 'backward'>('forward');
  const animFrameRef = useRef<number | null>(null);

  // Time-machine replay state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replayStep, setReplayStep] = useState<number>(1000);
  const animIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Heart reaction state
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [likeBonus, setLikeBonus] = useState<number>(0);
  const [isLikingAnim, setIsLikingAnim] = useState<boolean>(false);

  // Author follow state
  const [isFollowed, setIsFollowed] = useState<boolean>(false);

  // Touch & Wheel scroll tracking refs
  const touchStartYRef = useRef<number>(0);
  const lastWheelTimeRef = useRef<number>(0);

  // Canvas element ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Parse strokes and text for active thought
  const parsedCanvas = useMemo(() => {
    if (!activeThought) return { strokes: [], canvasTexts: [], bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 } };
    return parseOrGenerateThoughtCanvas(
      activeThought.title,
      activeThought.category,
      activeThought.canvasPayload
    );
  }, [activeThought]);

  const totalStrokes = parsedCanvas.strokes.length;

  // Viewport calculation
  const computeViewportForBounds = useCallback((b: { minX: number; minY: number; maxX: number; maxY: number }): Viewport => {
    if (typeof window === 'undefined') return { x: 0, y: 0, zoom: 1 };
    const bw = Math.max(200, b.maxX - b.minX);
    const bh = Math.max(200, b.maxY - b.minY);
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const targetZoom = Math.min((screenW * 0.75) / bw, (screenH * 0.7) / bh, 1.4);
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    return {
      x: screenW / 2 - centerX * targetZoom,
      y: screenH / 2 - centerY * targetZoom,
      zoom: targetZoom,
    };
  }, []);

  const [viewport, setViewport] = useState<Viewport>(() => computeViewportForBounds(parsedCanvas.bounds));
  const [isRadarOpen, setIsRadarOpen] = useState<boolean>(false);

  const fitThoughtToScreen = useCallback(() => {
    setViewport(computeViewportForBounds(parsedCanvas.bounds));
  }, [computeViewportForBounds, parsedCanvas.bounds]);

  useEffect(() => {
    const handleResize = () => {
      fitThoughtToScreen();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitThoughtToScreen]);

  // Heavy Sequential Wave Transition
  const navigateTo = useCallback(
    (newIndex: number, direction: 'forward' | 'backward' = 'forward') => {
      if (newIndex < 0 || newIndex >= thoughts.length || transitionPhase !== 'idle') return;

      setIsPlaying(false);
      setWaveDirection(direction);
      setTransitionPhase('fading_out');

      const startTime = performance.now();
      const fadeDuration = 550; // smooth 550ms wave fade

      const stepFadeOut = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / fadeDuration);
        const eased = cubicEase(progress);
        setWaveProgress(1 - eased); // goes from 1 down to 0

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(stepFadeOut);
        } else {
          // Switch active thought at the trough
          const nextThought = thoughts[newIndex];
          const nextParsed = parseOrGenerateThoughtCanvas(
            nextThought.title,
            nextThought.category,
            nextThought.canvasPayload
          );
          setCurrentIndex(newIndex);
          setReplayStep(nextParsed.strokes.length);
          setHasLiked(false);
          setLikeBonus(0);
          setViewport(computeViewportForBounds(nextParsed.bounds));

          // Start sequential fade-in wave
          setTransitionPhase('fading_in');
          const inStartTime = performance.now();

          const stepFadeIn = (inNow: number) => {
            const inElapsed = inNow - inStartTime;
            const inProgress = Math.min(1, inElapsed / fadeDuration);
            const inEased = cubicEase(inProgress);
            setWaveProgress(inEased); // goes from 0 up to 1

            if (inProgress < 1) {
              animFrameRef.current = requestAnimationFrame(stepFadeIn);
            } else {
              setTransitionPhase('idle');
              setWaveProgress(1);
            }
          };
          animFrameRef.current = requestAnimationFrame(stepFadeIn);
        }
      };

      animFrameRef.current = requestAnimationFrame(stepFadeOut);
    },
    [thoughts, transitionPhase, computeViewportForBounds]
  );

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) navigateTo(currentIndex - 1, 'backward');
  }, [currentIndex, navigateTo]);

  const handleNext = useCallback(() => {
    if (currentIndex < thoughts.length - 1) navigateTo(currentIndex + 1, 'forward');
  }, [currentIndex, thoughts.length, navigateTo]);

  // Clean up animation frames
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Mouse wheel scroll to navigate with debounced threshold
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - lastWheelTimeRef.current < 600) return; // debounce 600ms

      if (e.deltaY > 35) {
        lastWheelTimeRef.current = now;
        handleNext();
      } else if (e.deltaY < -35) {
        lastWheelTimeRef.current = now;
        handlePrev();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [handleNext, handlePrev]);

  // Touch vertical swipe to navigate
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1) {
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      if (deltaY < -50) {
        handleNext();
      } else if (deltaY > 50) {
        handlePrev();
      }
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose]);

  // Living ink automated replay playback
  useEffect(() => {
    if (isPlaying) {
      animIntervalRef.current = setInterval(() => {
        setReplayStep((prev) => {
          if (prev >= totalStrokes) {
            setIsPlaying(false);
            return totalStrokes;
          }
          return prev + 1;
        });
      }, 75);
    } else if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
    }
    return () => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
  }, [isPlaying, totalStrokes]);

  // Canvas drawing loop with heavy sequential wave fade
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Warm infinite canvas background (#FAF9F6)
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Hardware dot grid
    const dotSpacing = 28 * viewport.zoom;
    if (dotSpacing >= 10 && dotSpacing <= 250) {
      const startX = ((viewport.x % dotSpacing) + dotSpacing) % dotSpacing;
      const startY = ((viewport.y % dotSpacing) + dotSpacing) % dotSpacing;
      const dotSize = Math.max(1, Math.min(2.0, 1.2 * viewport.zoom));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
      for (let x = startX; x < width; x += dotSpacing) {
        for (let y = startY; y < height; y += dotSpacing) {
          ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        }
      }
    }

    // Apply Viewport Transform
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Canvas coordinate bounds for sequential wave calculation
    const b = parsedCanvas.bounds;
    const minX = b.minX;
    const maxX = Math.max(minX + 200, b.maxX);

    // Replay filtered strokes
    const visibleStrokes: Stroke[] = parsedCanvas.strokes.slice(
      0,
      Math.min(parsedCanvas.strokes.length, replayStep)
    );

    // Draw strokes with wave opacity
    for (const s of visibleStrokes) {
      const strokeMidX = s.bounds ? (s.bounds.minX + s.bounds.maxX) / 2 : minX;
      // Normalized X between 0 and 1
      const normX = Math.max(0, Math.min(1, (strokeMidX - minX) / (maxX - minX)));

      // Sequential wave opacity math:
      // waveDirection forward: left sweeps first; backward: right sweeps first
      const directedNormX = waveDirection === 'forward' ? normX : 1 - normX;
      let strokeOpacity = 1;

      if (transitionPhase === 'fading_out') {
        // Elements dissolve sequentially across X
        // waveProgress goes from 1 -> 0
        const waveFront = waveProgress * 1.5;
        strokeOpacity = Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      } else if (transitionPhase === 'fading_in') {
        // Elements appear sequentially across X
        // waveProgress goes from 0 -> 1
        const waveFront = waveProgress * 1.5;
        strokeOpacity = Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      }

      if (strokeOpacity > 0.01) {
        ctx.save();
        ctx.globalAlpha = strokeOpacity;
        drawSmoothStroke(ctx, s);
        ctx.restore();
      }
    }

    // Handwritten canvas texts with sequential wave opacity
    for (const item of parsedCanvas.canvasTexts) {
      const normX = Math.max(0, Math.min(1, (item.x - minX) / (maxX - minX)));
      const directedNormX = waveDirection === 'forward' ? normX : 1 - normX;
      let textOpacity = 1;

      if (transitionPhase === 'fading_out') {
        const waveFront = waveProgress * 1.5;
        textOpacity = Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      } else if (transitionPhase === 'fading_in') {
        const waveFront = waveProgress * 1.5;
        textOpacity = Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      }

      if (textOpacity > 0.01) {
        ctx.save();
        ctx.globalAlpha = textOpacity;
        ctx.font = '500 22px "Kalam", "Caveat", cursive';
        ctx.fillStyle = item.color || '#1E1E1E';
        ctx.textBaseline = 'top';
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [viewport, parsedCanvas, replayStep, waveProgress, transitionPhase, waveDirection]);

  // Handle Heart reaction
  const handleToggleHeart = async () => {
    if (hasLiked) return;
    setHasLiked(true);
    setLikeBonus(1);
    setIsLikingAnim(true);
    setTimeout(() => setIsLikingAnim(false), 700);

    if (activeThought?.id) {
      await sendThoughtReaction(activeThought.id, 'resonate');
    }
  };

  const displayLikeCount = (activeThought?.reactionCount || 12) + likeBonus;
  const authorInit = activeThought?.authorAnonymousId
    ? activeThought.authorAnonymousId.slice(0, 2).toUpperCase()
    : 'AN';

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-[#FAF9F6] text-neutral-900 overflow-hidden select-none"
    >
      {/* Fullscreen Live Canvas */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* 1. PINNED FLOATING ITEM: Return to 2D Map (Top-Left) */}
      <div className="fixed top-5 left-5 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={onClose}
          title="Back to 2D Map"
          className="p-3 rounded-full bg-white/95 hover:bg-white text-neutral-700 hover:text-neutral-950 border border-neutral-200/80 shadow-md backdrop-blur-md transition-all cursor-pointer active:scale-90"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      {/* 2. PINNED FLOATING ITEMS: Right-End Vertical Controls (No containers around them) */}
      <div className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-4 pointer-events-auto">
        {/* Item A: Polished Circular Avatar with glowing halo ring & tiny plus tag */}
        <div
          onClick={() => setIsFollowed(!isFollowed)}
          title={isFollowed ? 'Connected with author' : 'Connect with author'}
          className="relative cursor-pointer group active:scale-95 transition-transform"
        >
          {/* Subtle halo ring */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-200 via-rose-200 to-indigo-200 p-0.5 shadow-md">
            <div className="w-full h-full rounded-full bg-white text-neutral-800 flex items-center justify-center font-bold text-xs tracking-wider">
              {authorInit}
            </div>
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs transition-all ${
              isFollowed ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'
            }`}
          >
            {isFollowed ? (
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            ) : (
              <Plus className="w-2.5 h-2.5 stroke-[3]" />
            )}
          </div>
        </div>

        {/* Item B: Up Arrow (above love icon) */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0 || transitionPhase !== 'idle'}
          title="Previous thought (Swipe up or scroll up)"
          className={`p-3 rounded-full bg-white/95 text-neutral-700 border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer ${
            currentIndex === 0
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white hover:text-neutral-950 active:scale-90'
          }`}
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        {/* Item C: Pinned Floating Love Icon with live count */}
        <button
          type="button"
          onClick={handleToggleHeart}
          title="Resonate"
          className="flex flex-col items-center gap-1 p-3 rounded-full bg-white/95 hover:bg-white border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer active:scale-90"
        >
          <Heart
            className={`w-5 h-5 transition-transform ${
              hasLiked
                ? 'text-rose-500 fill-rose-500'
                : 'text-neutral-600 hover:text-rose-500'
            } ${isLikingAnim ? 'scale-130' : 'scale-100'}`}
          />
          <span className="text-[10px] font-bold text-neutral-600 leading-none">
            {displayLikeCount}
          </span>
        </button>

        {/* Item D: Down Arrow (below love icon) */}
        <button
          type="button"
          onClick={handleNext}
          disabled={currentIndex >= thoughts.length - 1 || transitionPhase !== 'idle'}
          title="Next thought (Swipe down or scroll down)"
          className={`p-3 rounded-full bg-white/95 text-neutral-700 border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer ${
            currentIndex >= thoughts.length - 1
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white hover:text-neutral-950 active:scale-90'
          }`}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* 3. PINNED FLOATING REPLAY TOOL: Bottom Center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-4 py-2 rounded-full bg-white/95 border border-neutral-200/90 shadow-lg backdrop-blur-md max-w-[92vw]">
        {/* Step back */}
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setReplayStep((s) => Math.max(0, s - 1));
          }}
          title="Step back"
          className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer active:scale-90"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={() => {
            if (replayStep >= totalStrokes) {
              setReplayStep(0);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
          title={isPlaying ? 'Pause replay' : 'Replay strokes'}
          className="p-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full transition-all cursor-pointer shadow-xs active:scale-90"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        {/* Step forward */}
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setReplayStep((s) => Math.min(totalStrokes, s + 1));
          }}
          title="Step forward"
          className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer active:scale-90"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Scrubber slider */}
        <input
          type="range"
          min={0}
          max={Math.max(1, totalStrokes)}
          value={Math.min(replayStep, totalStrokes)}
          onChange={(e) => {
            setIsPlaying(false);
            setReplayStep(Number(e.target.value));
          }}
          className="w-24 sm:w-44 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
        />

        {/* Step Indicator */}
        <span className="text-[11px] font-mono font-medium text-neutral-500 whitespace-nowrap">
          {Math.min(replayStep, totalStrokes)} / {totalStrokes}
        </span>
      </div>

      {/* 4. PINNED FLOATING MINI-VIEWPORT: Bottom-Right */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-40 pointer-events-auto">
        {!isRadarOpen ? (
          <button
            type="button"
            onClick={() => setIsRadarOpen(true)}
            title="Open mini-viewport radar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white/95 border border-neutral-200/90 shadow-md backdrop-blur-md transition-colors active:scale-95 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[11px] font-mono">{Math.round(viewport.zoom * 100)}%</span>
          </button>
        ) : (
          <div className="p-2.5 rounded-2xl bg-white/95 border border-neutral-200/90 shadow-xl backdrop-blur-md flex flex-col items-end gap-1.5 animate-in fade-in zoom-in-95">
            <div className="w-full flex items-center justify-between pb-1 border-b border-neutral-100 text-[11px] font-medium text-neutral-500">
              <span className="flex items-center gap-1 text-neutral-700">
                <Compass className="w-3 h-3 text-neutral-500" />
                Viewport
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={fitThoughtToScreen}
                  title="Fit to center"
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRadarOpen(false)}
                  title="Close mini-viewport"
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              onClick={fitThoughtToScreen}
              className="w-32 h-20 bg-neutral-50 border border-neutral-200 rounded-lg relative overflow-hidden flex items-center justify-center cursor-pointer group"
              title="Click to re-center"
            >
              <div className="w-14 h-10 border border-blue-500/80 bg-blue-500/10 rounded group-hover:scale-105 transition-transform" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
