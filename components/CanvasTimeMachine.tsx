'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
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
}

export const CanvasTimeMachine: React.FC<CanvasTimeMachineProps> = ({
  isOpen,
  onClose,
  totalSteps,
  currentStep,
  onStepChange,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 1x, 2x, 5x
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      return;
    }

    const intervalMs = Math.max(30, 200 / playbackSpeed);

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

  if (!isOpen) return null;

  return (
    <div
      id="canvas-time-machine-controller"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md text-neutral-800 border border-neutral-200/90 px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2.5 select-none pointer-events-auto max-w-[94vw] sm:max-w-xl animate-in fade-in slide-in-from-top-4 duration-200"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 shrink-0">
        <History className="w-3.5 h-3.5 text-neutral-500" />
        <span className="hidden sm:inline">Time Machine</span>
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
        className="p-1.5 rounded-full bg-neutral-900 hover:bg-black text-white font-medium transition-all shrink-0 active:scale-95 shadow-xs"
        title={isPlaying ? 'Pause replay' : 'Play timelapse'}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>

      {/* Step backward */}
      <button
        type="button"
        onClick={() => {
          setIsPlaying(false);
          onStepChange(Math.max(0, currentStep - 1));
        }}
        className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0"
        title="Step Back"
      >
        <SkipBack className="w-3.5 h-3.5" />
      </button>

      {/* Scrub Slider */}
      <div className="flex-1 flex items-center gap-2 min-w-[100px] sm:min-w-[180px]">
        <input
          type="range"
          min={0}
          max={Math.max(1, totalSteps)}
          value={currentStep}
          onChange={(e) => {
            setIsPlaying(false);
            onStepChange(Number(e.target.value));
          }}
          className="w-full accent-neutral-800 cursor-pointer h-1.5 bg-neutral-200 rounded-lg appearance-none"
        />
        <span className="text-[11px] font-mono text-neutral-500 whitespace-nowrap shrink-0">
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
        className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0"
        title="Step Forward"
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
        className="p-1 text-neutral-500 hover:text-neutral-900 rounded transition-colors shrink-0 hidden sm:block"
        title="Restart from beginning"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Speed Selector */}
      <button
        type="button"
        onClick={() => {
          setPlaybackSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 5 : 1));
        }}
        className="px-2 py-0.5 rounded bg-neutral-100 text-[11px] font-mono text-neutral-700 border border-neutral-200 hover:bg-neutral-200 transition-colors shrink-0"
        title="Change playback speed"
      >
        {playbackSpeed}x
      </button>

      <div className="h-4 w-px bg-neutral-200 shrink-0" />

      {/* Close Replay Mode */}
      <button
        type="button"
        onClick={() => {
          setIsPlaying(false);
          onClose();
        }}
        className="p-1 text-neutral-400 hover:text-neutral-800 rounded transition-colors shrink-0"
        title="Exit Time Machine"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
