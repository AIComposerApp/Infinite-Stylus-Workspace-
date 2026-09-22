'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Sparkles,
  History,
  Heart,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { ExplorePost } from '@/components/shell/ExploreScreen';
import { SharedThoughtDocument, sendThoughtReaction } from '@/lib/thoughtspace-service';
import { parseOrGenerateThoughtCanvas } from '@/lib/thought-canvas-generator';
import { drawSmoothStroke } from '@/lib/canvas-utils';

interface ReelThoughtProcessModalProps {
  post: ExplorePost | null;
  onClose: () => void;
  onOpenInCanvas: (post: ExplorePost) => void;
}

export const ReelThoughtProcessModal: React.FC<ReelThoughtProcessModalProps> = ({
  post,
  onClose,
  onOpenInCanvas,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Parse the thought's canvas payload
  const parsedData = useMemo(() => {
    if (!post) return null;
    return parseOrGenerateThoughtCanvas(
      post.title,
      post.category,
      post.sharedDoc?.canvasPayload
    );
  }, [post]);

  const strokes = useMemo(() => parsedData?.strokes || [], [parsedData]);
  const texts = useMemo(() => parsedData?.canvasTexts || [], [parsedData]);
  const shapes = useMemo(() => parsedData?.shapes || [], [parsedData]);

  // Total timeline steps = strokes + shapes + texts
  const totalSteps = strokes.length + shapes.length + texts.length;
  const [currentStep, setCurrentStep] = useState<number>(totalSteps || 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 1x, 2x, 4x
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(post?.likes || 0);

  // Adjust state during render when post changes (React 19 recommended pattern)
  const [prevPostId, setPrevPostId] = useState<string | undefined>(post?.id);
  if (post?.id !== prevPostId) {
    setPrevPostId(post?.id);
    setCurrentStep(totalSteps);
    setIsPlaying(false);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null);

  // Handle Playback Interval
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      return;
    }

    const intervalMs = Math.max(30, 200 / playbackSpeed);
    playIntervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps) {
          setIsPlaying(false);
          return totalSteps;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, totalSteps]);

  // Render Canvas with strokes up to currentStep
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsedData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Warm paper background
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Subtle dot grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    for (let x = 16; x < width; x += 24) {
      for (let y = 16; y < height; y += 24) {
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }

    // Auto-fit calculation
    const b = parsedData.bounds;
    const bw = Math.max(120, b.maxX - b.minX);
    const bh = Math.max(100, b.maxY - b.minY);
    const padding = 48;
    const baseScale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh);
    const effectiveScale = Math.max(0.6, Math.min(2.0, baseScale)) * zoom;

    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    const offsetX = width / 2 - centerX * effectiveScale + pan.x;
    const offsetY = height / 2 - centerY * effectiveScale + pan.y;

    ctx.translate(offsetX, offsetY);
    ctx.scale(effectiveScale, effectiveScale);

    // Step partitioning: strokes first, then shapes, then texts
    const visibleStrokesCount = Math.min(strokes.length, currentStep);
    const remainingForShapes = Math.max(0, currentStep - strokes.length);
    const visibleShapesCount = Math.min(shapes.length, remainingForShapes);
    const remainingForTexts = Math.max(0, remainingForShapes - shapes.length);
    const visibleTextsCount = Math.min(texts.length, remainingForTexts);

    // Draw visible strokes
    for (let i = 0; i < visibleStrokesCount; i++) {
      const stroke = strokes[i];
      if (stroke) {
        drawSmoothStroke(ctx, stroke);
      }
    }

    // Draw visible shapes
    for (let i = 0; i < visibleShapesCount; i++) {
      const shape = shapes[i];
      if (!shape) continue;
      ctx.save();
      ctx.strokeStyle = shape.strokeColor || '#E08A1E';
      ctx.lineWidth = shape.strokeWidth || 2;
      ctx.beginPath();
      if (shape.type === 'circle') {
        const radius = Math.max(10, (shape.width || 60) / 2);
        ctx.arc(shape.x, shape.y, radius, 0, Math.PI * 2);
      } else {
        ctx.rect(shape.x, shape.y, shape.width || 80, shape.height || 60);
      }
      ctx.stroke();
      if (shape.text) {
        ctx.font = '500 13px "Kalam", cursive, sans-serif';
        ctx.fillStyle = shape.textColor || '#141414';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shape.text, shape.x, shape.y);
      }
      ctx.restore();
    }

    // Draw visible texts
    for (let i = 0; i < visibleTextsCount; i++) {
      const textItem = texts[i];
      if (!textItem) continue;
      ctx.save();
      ctx.font = '500 17px "Kalam", "Caveat", cursive';
      ctx.fillStyle = textItem.color || '#1E1E1E';
      ctx.textBaseline = 'top';
      ctx.fillText(textItem.text, textItem.x, textItem.y);
      ctx.restore();
    }

    ctx.restore();
  }, [parsedData, strokes, shapes, texts, currentStep, zoom, pan]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Resize canvas when window changes
  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas]);

  // Scrubber drag calculation
  const updateScrubberFromClientX = useCallback(
    (clientX: number) => {
      const track = scrubberTrackRef.current;
      if (!track || totalSteps <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const step = Math.round(ratio * totalSteps);
      setIsPlaying(false);
      setCurrentStep(step);
    },
    [totalSteps]
  );

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateScrubberFromClientX(e.clientX);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) {
      updateScrubberFromClientX(e.clientX);
    }
  };

  const handleLike = async () => {
    if (!post || hasLiked) return;
    setHasLiked(true);
    setLikeCount((c) => c + 1);
    if (post.sharedDoc?.id) {
      await sendThoughtReaction(post.sharedDoc.id, 'resonate');
    }
  };

  if (!post) return null;

  const progressRatio = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label={`Inspect thought process: ${post.title}`}
      >
        {/* Top Header Bar */}
        <header className="h-16 px-4 sm:px-6 flex items-center justify-between bg-white/95 dark:bg-neutral-900/95 border-b border-black/[0.08] dark:border-white/[0.1] shadow-xs shrink-0 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-1 rounded-full text-neutral-600 hover:text-neutral-900 hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
              title="Close inspection"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-neutral-100 truncate">
                  {post.title}
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  {post.category}
                </span>
              </div>
              <p className="text-[12px] text-neutral-500 truncate">
                by {post.author} • {post.timeAgo}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLike}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                hasLiked
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  hasLiked ? 'fill-rose-500 text-rose-500' : 'text-neutral-500'
                }`}
              />
              <span>{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenInCanvas(post)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs sm:text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Open in Canvas</span>
            </button>
          </div>
        </header>

        {/* Center Canvas Area */}
        <div className="flex-1 relative overflow-hidden bg-[#FAF9F6] touch-none">
          <canvas
            ref={canvasRef}
            className="w-full h-full block cursor-grab active:cursor-grabbing"
          />

          {/* Quick Floating Zoom Controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-white/90 backdrop-blur-md rounded-full border border-black/[0.08] shadow-md p-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
              className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-700 cursor-pointer active:scale-90"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-neutral-600 px-1 min-w-[36px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
              className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-700 cursor-pointer active:scale-90"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-700 cursor-pointer active:scale-90"
              title="Reset view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Thought Process Hint Badge */}
          <div className="absolute top-4 left-4 z-20 hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-full border border-black/[0.08] shadow-xs text-xs text-neutral-600 font-medium">
            <History className="w-3.5 h-3.5 text-neutral-500" />
            <span>Dial-Back Time Machine active • Drag timeline below to replay</span>
          </div>
        </div>

        {/* Bottom Floating Dial-Back Time Machine Scrubber Dock */}
        <div className="h-20 sm:h-24 px-4 sm:px-8 bg-white/95 dark:bg-neutral-900/95 border-t border-black/[0.08] dark:border-white/[0.1] shadow-xl shrink-0 flex items-center justify-center select-none">
          <div className="w-full max-w-3xl flex flex-col gap-2">
            {/* Scrubber Track Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-neutral-500 min-w-[48px] text-right">
                {currentStep}/{totalSteps}
              </span>

              <div
                ref={scrubberTrackRef}
                onPointerDown={handleScrubberPointerDown}
                onPointerMove={handleScrubberPointerMove}
                className="relative flex-1 h-7 flex items-center cursor-ew-resize group touch-none"
              >
                {/* Track Background */}
                <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative">
                  <div
                    style={{ width: `${progressRatio}%` }}
                    className="h-full bg-neutral-900 dark:bg-neutral-100 rounded-full transition-[width] duration-75"
                  />
                </div>

                {/* Scrubber Thumb Knob */}
                <div
                  style={{ left: `${progressRatio}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-neutral-900 dark:border-white shadow-md transition-transform group-hover:scale-125 group-active:scale-135 pointer-events-none"
                />
              </div>

              <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 min-w-[42px]">
                {Math.round(progressRatio)}%
              </span>
            </div>

            {/* Playback Controls Row */}
            <div className="flex items-center justify-between pt-0.5">
              {/* Reset to Start */}
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStep(0);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-950 hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
                title="Dial back to beginning"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Start</span>
              </button>

              {/* Main Transport (Step Back, Play/Pause, Step Forward) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep((s) => Math.max(0, s - 1));
                  }}
                  disabled={currentStep <= 0}
                  className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 disabled:opacity-30 cursor-pointer active:scale-90 transition-all"
                  title="Step backward"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (currentStep >= totalSteps) {
                      setCurrentStep(0);
                      setIsPlaying(true);
                    } else {
                      setIsPlaying(!isPlaying);
                    }
                  }}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                  title={isPlaying ? 'Pause thought replay' : 'Play thought replay'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep((s) => Math.min(totalSteps, s + 1));
                  }}
                  disabled={currentStep >= totalSteps}
                  className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 disabled:opacity-30 cursor-pointer active:scale-90 transition-all"
                  title="Step forward"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Speed & Dial to End */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1));
                  }}
                  className="px-2 py-1 rounded-full text-xs font-mono font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 active:scale-95 transition-all cursor-pointer"
                  title="Cycle playback speed"
                >
                  {playbackSpeed}x
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep(totalSteps);
                  }}
                  className="px-2.5 py-1 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-950 hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
                  title="Jump to finished state"
                >
                  <span>End</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReelThoughtProcessModal;
