'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
  History,
} from 'lucide-react';

interface CanvasTimeMachineProps {
  isOpen: boolean;
  onClose: () => void;
  totalSteps: number;
  currentStep: number;
  onStepChange: (step: number | ((prev: number) => number)) => void;
  activeItemType?: 'stroke' | 'shape' | 'text' | 'image' | 'checklist' | 'connector' | 'thought';
}

export const CanvasTimeMachine: React.FC<CanvasTimeMachineProps> = ({
  isOpen,
  onClose,
  totalSteps,
  currentStep,
  onStepChange,
  activeItemType,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 1x, 2x, 4x
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      return;
    }

    const intervalMs = Math.max(25, 180 / playbackSpeed);

    playIntervalRef.current = setInterval(() => {
      onStepChange((prev) => {
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
  }, [isPlaying, playbackSpeed, totalSteps, onStepChange]);

  // Smooth Scrubber Pointer Capture (Zero lag, free drag back & forth)
  const updateStepFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current || totalSteps <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawRatio = (clientX - rect.left) / rect.width;
      const clampedRatio = Math.max(0, Math.min(1, rawRatio));
      const newStep = Math.round(clampedRatio * totalSteps);
      onStepChange(newStep);
    },
    [totalSteps, onStepChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    isDraggingRef.current = true;
    setIsScrubbing(true);
    setIsPlaying(false);
    updateStepFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    updateStepFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Keyboard navigation for desktop when Time Machine is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        const stepAmount = e.shiftKey ? 5 : 1;
        onStepChange((prev) => Math.max(0, prev - stepAmount));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        const stepAmount = e.shiftKey ? 5 : 1;
        onStepChange((prev) => Math.min(totalSteps, prev + stepAmount));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsPlaying(false);
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalSteps, onStepChange, onClose]);

  const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  const itemTypeLabels: Record<string, string> = {
    stroke: 'Ink Stroke',
    shape: 'Shape / Sticky Note',
    text: 'Handwritten Text',
    image: 'Imported Image',
    checklist: 'Checklist Card',
    connector: 'Flow Connector',
    thought: 'AI Thought',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="canvas-time-machine-controller"
          initial={{ scaleX: 0.15, scaleY: 0.35, y: -25, opacity: 0 }}
          animate={{ scaleX: 1, scaleY: 1, y: 0, opacity: 1 }}
          exit={{ scaleX: 0.15, scaleY: 0.35, y: -25, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.75 }}
          style={{ transformOrigin: 'top center' }}
          className="fixed top-14 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-xl text-neutral-800 border border-neutral-200/90 px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-2.5 select-none pointer-events-auto max-w-[94vw] sm:max-w-xl"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 shrink-0">
            <History className="w-3.5 h-3.5 text-neutral-500" />
            <span className="hidden sm:inline font-semibold">Time Machine</span>
            {activeItemType && (
              <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600 font-sans">
                {itemTypeLabels[activeItemType] || activeItemType}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-200 shrink-0" />

          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => {
              if (currentStep >= totalSteps && !isPlaying) {
                onStepChange(0);
              }
              setIsPlaying(!isPlaying);
            }}
            className="p-1.5 rounded-full bg-neutral-900 hover:bg-black text-white font-medium transition-all shrink-0 active:scale-95 shadow-xs cursor-pointer"
            title={isPlaying ? 'Pause replay (Space)' : 'Play timelapse (Space)'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          {/* Step backward */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onStepChange(Math.max(0, currentStep - 1));
            }}
            className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0 cursor-pointer"
            title="Step Back (Left Arrow)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          {/* Fluid Drag Scrubber Track (Continuous, Zero-Lag, Back-and-Forth Pointer Capture) */}
          <div className="flex-1 flex items-center gap-2 min-w-[120px] sm:min-w-[180px]">
            <div
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="relative flex-1 h-7 flex items-center cursor-ew-resize touch-none select-none group"
              title="Drag back and forth freely to scrub time"
            >
              {/* Background Track Bar */}
              <div className="relative w-full h-2 bg-neutral-200/90 rounded-full overflow-hidden transition-all group-hover:h-2.5">
                {/* Filled Progress Bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-neutral-900 rounded-full will-change-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Smooth Draggable Thumb Handle */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-neutral-900 rounded-full shadow-md pointer-events-none transition-transform will-change-[left] ${
                  isScrubbing ? 'scale-125 ring-2 ring-neutral-400' : 'group-hover:scale-110'
                }`}
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <span className="text-[11px] font-mono text-neutral-500 whitespace-nowrap shrink-0 min-w-[36px] text-right">
              {currentStep}/{totalSteps}
            </span>
          </div>

          {/* Step forward */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onStepChange(Math.min(totalSteps, currentStep + 1));
            }}
            className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0 cursor-pointer"
            title="Step Forward (Right Arrow)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Replay from Start */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onStepChange(0);
            }}
            className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0 hidden sm:block cursor-pointer"
            title="Restart from beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Speed Modifier Toggles (1x, 2x, 4x) */}
          <div className="flex items-center p-0.5 rounded-lg bg-neutral-100 border border-neutral-200 shrink-0">
            {([1, 2, 4] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-black/5'
                }`}
                title={`Play at ${spd}x speed`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-neutral-200 shrink-0" />

          {/* Close Replay Mode (Reverse-closes elastically along same path) */}
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              onClose();
            }}
            className="p-1 text-neutral-400 hover:text-neutral-800 rounded transition-colors shrink-0 cursor-pointer"
            title="Exit Time Machine (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
