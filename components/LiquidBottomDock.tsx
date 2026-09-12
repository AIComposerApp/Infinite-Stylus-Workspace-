'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import {
  BookmarkCheck,
  LayoutGrid,
  Plus,
  PenTool,
  PencilLine,
  Highlighter,
  Eraser,
  LassoSelect,
  Undo2,
  Redo2,
  Share2,
  Check,
  GripHorizontal,
  FileText,
  Image as ImageIcon,
  Hand,
} from 'lucide-react';
import { StylusToolType } from '@/types/canvas';

interface LiquidBottomDockProps {
  currentTool: StylusToolType;
  onSelectTool: (tool: StylusToolType) => void;
  currentColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onChangeStrokeWidth: (width: number) => void;
  onSave: () => void;
  isSaving: boolean;
  onOpenProjects: () => void;
  onNewProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExportPDF: () => void;
  onExportPNG: () => void;
  onTriggerAssistant: () => void;
  isAssistantThinking: boolean;
  isConversationalActive?: boolean;
  isOffline?: boolean;
}

const INK_COLORS = [
  { label: 'Ink Black', value: '#1E1E1E' },
  { label: 'Charcoal', value: '#4A5568' },
  { label: 'Midnight Blue', value: '#1E3A8A' },
  { label: 'Crimson Red', value: '#991B1B' },
  { label: 'Forest Green', value: '#166534' },
  { label: 'Warm Amber', value: '#D97706' },
  { label: 'Highlighter Yellow', value: '#FACC15' },
];

// Single Item Width = 38px button + 6px gap = 44px
const ITEM_STEP = 44;

export const LiquidBottomDock: React.FC<LiquidBottomDockProps> = ({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  strokeWidth,
  onChangeStrokeWidth,
  onSave,
  isSaving,
  onOpenProjects,
  onNewProject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportPDF,
  onExportPNG,
  onTriggerAssistant,
  isAssistantThinking,
  isConversationalActive = false,
  isOffline = false,
}) => {
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState<boolean>(false);

  // Framer Motion controls for repositioning whole dock via grip only
  const dockDragControls = useDragControls();

  // State for the finger-dragged infinite tools ribbon
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Base tools in sequence
  const toolDefinitions = [
    { id: 'pan', label: 'Move & Type', type: 'tool', tool: 'pan' as StylusToolType },
    { id: 'pen', label: 'Fountain Pen', type: 'tool', tool: 'pen' as StylusToolType },
    { id: 'pencil', label: 'Graphite Pencil', type: 'tool', tool: 'pencil' as StylusToolType },
    { id: 'highlighter', label: 'Highlighter', type: 'tool', tool: 'highlighter' as StylusToolType },
    { id: 'eraser', label: 'Eraser', type: 'tool', tool: 'eraser' as StylusToolType },
    { id: 'select', label: 'Select & Copy', type: 'tool', tool: 'select' as StylusToolType },
    { id: 'color', label: 'Ink Color & Size', type: 'color' },
    { id: 'undo', label: 'Undo', type: 'undo' },
    { id: 'redo', label: 'Redo', type: 'redo' },
    { id: 'export', label: 'Export Board', type: 'export' },
    { id: 'assistant', label: 'AI Assistant', type: 'assistant' },
  ];

  const oneLoopWidth = toolDefinitions.length * ITEM_STEP; // 440px
  // Start at -440px so middle copy is displayed upfront
  const [translateX, setTranslateX] = useState<number>(-oneLoopWidth);

  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPointerXRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const totalDragDistRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const momentumAnimRef = useRef<number | null>(null);

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  // Cancel any running inertia animation
  const stopMomentum = useCallback(() => {
    if (momentumAnimRef.current !== null) {
      cancelAnimationFrame(momentumAnimRef.current);
      momentumAnimRef.current = null;
    }
  }, []);

  // Wrap translateX modulo oneLoopWidth seamlessly
  const wrapTranslateX = useCallback(
    (x: number): number => {
      let current = x;
      while (current < -oneLoopWidth * 2) {
        current += oneLoopWidth;
      }
      while (current > 0) {
        current -= oneLoopWidth;
      }
      return current;
    },
    [oneLoopWidth]
  );

  // Pointer Down on Tools Ribbon (Finger Hold starts subtle offset bounce)
  const handleRibbonPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopMomentum();
    setIsHolding(true);
    setIsDragging(false);
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    lastPointerXRef.current = e.clientX;
    lastTimeRef.current = Date.now();
    totalDragDistRef.current = 0;
    velocityRef.current = 0;
    // Capture pointer to track smoothly even if finger moves slightly outside
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Pointer Move on Tools Ribbon (Finger Drag moves items with infinite seamless wrap)
  const handleRibbonPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHolding) return;

    const now = Date.now();
    const dt = Math.max(1, now - lastTimeRef.current);
    const dx = e.clientX - lastPointerXRef.current;

    totalDragDistRef.current += Math.abs(dx);
    if (totalDragDistRef.current > 5) {
      setIsDragging(true);
      // Close popovers if user starts sliding
      setShowColorPicker(false);
      setShowExportMenu(false);
    }

    velocityRef.current = dx / dt;
    lastPointerXRef.current = e.clientX;
    lastTimeRef.current = now;

    setTranslateX((prev) => wrapTranslateX(prev + dx));
  };

  // Pointer Up on Tools Ribbon (Spring release & momentum glide)
  const handleRibbonPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHolding) return;
    setIsHolding(false);

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored if pointer capture already released
    }

    // If dragged with velocity, glide with smooth momentum
    if (totalDragDistRef.current > 5 && Math.abs(velocityRef.current) > 0.1) {
      let vel = velocityRef.current * 16; // speed multiplier
      const glide = () => {
        if (Math.abs(vel) > 0.25) {
          setTranslateX((prev) => wrapTranslateX(prev + vel));
          vel *= 0.92; // friction deceleration
          momentumAnimRef.current = requestAnimationFrame(glide);
        } else {
          setIsDragging(false);
        }
      };
      momentumAnimRef.current = requestAnimationFrame(glide);
    } else {
      setIsDragging(false);
    }
  };

  // Wheel / Trackpad horizontal swipe
  const handleRibbonWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    stopMomentum();
    const delta = -(e.deltaX || (e.shiftKey ? e.deltaY : 0));
    if (Math.abs(delta) > 0) {
      setTranslateX((prev) => wrapTranslateX(prev + delta * 0.8));
    }
  };

  // Execute tool action only if not dragging
  const handleItemClick = (type: string, toolName?: StylusToolType) => {
    if (totalDragDistRef.current > 6) {
      // Finger was dragging/swiping, do not trigger item
      return;
    }

    if (type === 'tool' && toolName) {
      if (currentTool === toolName && toolName !== 'pan') {
        onSelectTool('pan');
      } else {
        onSelectTool(toolName);
      }
    } else if (type === 'color') {
      setShowColorPicker((prev) => !prev);
      setShowExportMenu(false);
    } else if (type === 'undo') {
      if (canUndo) onUndo();
    } else if (type === 'redo') {
      if (canRedo) onRedo();
    } else if (type === 'export') {
      setShowExportMenu((prev) => !prev);
      setShowColorPicker(false);
    } else if (type === 'assistant') {
      onTriggerAssistant();
    }
  };

  // Render individual tool button
  const renderToolButton = (item: (typeof toolDefinitions)[0], keySuffix: string | number) => {
    const key = `${item.id}-${keySuffix}`;
    const isSelected = item.type === 'tool' && currentTool === item.tool;

    if (item.id === 'pan') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'pan')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Move & Type Anywhere (1-Finger Drag)"
        >
          <Hand className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'pen') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'pen')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Fountain Pen"
        >
          <PenTool className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'pencil') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'pencil')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Graphite Pencil"
        >
          <PencilLine className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'highlighter') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'highlighter')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-yellow-200 text-yellow-900 font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Highlighter"
        >
          <Highlighter className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'eraser') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'eraser')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Eraser"
        >
          <Eraser className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'select') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'select')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Lasso Selection Tool"
        >
          <LassoSelect className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'color') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('color')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#444444] hover:bg-black/5 hover:text-black transition-all shrink-0 select-none"
          title="Pen Color & Stroke Width"
        >
          <div
            className="w-4 h-4 rounded-full border border-black/20 shadow-xs ring-1 ring-black/10"
            style={{ backgroundColor: currentColor }}
          />
        </button>
      );
    }

    if (item.id === 'undo') {
      return (
        <button
          key={key}
          disabled={!canUndo}
          onClick={() => handleItemClick('undo')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            canUndo
              ? 'text-[#444444] hover:bg-black/5 hover:text-black active:scale-95'
              : 'text-neutral-300 cursor-not-allowed'
          }`}
          title="Undo"
        >
          <Undo2 className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'redo') {
      return (
        <button
          key={key}
          disabled={!canRedo}
          onClick={() => handleItemClick('redo')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            canRedo
              ? 'text-[#444444] hover:bg-black/5 hover:text-black active:scale-95'
              : 'text-neutral-300 cursor-not-allowed'
          }`}
          title="Redo"
        >
          <Redo2 className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'export') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('export')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#444444] hover:bg-black/5 hover:text-black transition-all shrink-0 select-none"
          title="Export Board to PDF or Image"
        >
          <Share2 className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'assistant') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('assistant')}
          className={`relative flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all active:scale-95 shrink-0 select-none bg-black hover:bg-neutral-800 ${
            isAssistantThinking ? 'ring-2 ring-neutral-400 animate-pulse' : ''
          }`}
          title="AI Assistant (Organic handwriting answers overlapping your text)"
        >
          <Image
            src="/icons/ai-assistant-white-64.png"
            alt="AI Assistant"
            width={22}
            height={22}
            referrerPolicy="no-referrer"
            className="w-[22px] h-[22px] object-contain pointer-events-none select-none"
            priority
          />
        </button>
      );
    }

    return null;
  };

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      stopMomentum();
    };
  }, [stopMomentum]);

  return (
    <div className="fixed bottom-5 left-0 right-0 z-30 flex justify-center items-end pointer-events-none px-2 select-none">
      {/* Dock wrapper. Dragging whole dock only activates if user drags the left grip handle */}
      <motion.div
        id="liquid-dock-wrapper"
        drag
        dragListener={false}
        dragControls={dockDragControls}
        dragConstraints={{ left: -360, right: 360, top: -650, bottom: 20 }}
        dragElastic={0.08}
        dragMomentum={false}
        className="pointer-events-auto relative flex items-center justify-center max-w-[96vw]"
      >
        {/* Dock Card Body */}
        <div
          id="liquid-dock"
          className="relative flex items-center gap-1.5 p-1.5 rounded-full backdrop-blur-2xl border border-black/[0.09] shadow-[0_16px_45px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)] bg-white/95 transition-all duration-300 overflow-visible"
        >
          {/* Subtle Dock Reposition Grip Handle (Only this moves the entire dock) */}
          <div
            onPointerDown={(e) => dockDragControls.start(e)}
            className="flex items-center justify-center w-5 h-9 text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing px-0.5 touch-none shrink-0"
            title="Drag grip to reposition dock on screen"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </div>

          {/* 3 FIXED LEFT ITEMS IN PERMANENT POSITION */}
          <div className="flex items-center gap-1 shrink-0">
            {/* 1. Permanent Pinned Save Button */}
            <motion.button
              id="btn-dock-save"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={handleSaveClick}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors shrink-0 ${
                justSaved
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-[#1E1E1E] text-white hover:bg-black shadow-xs'
              }`}
              title="Save Notes & Board (Also Auto-Saves)"
            >
              {justSaved ? (
                <Check className="w-5 h-5 stroke-[2.5]" />
              ) : isSaving ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <BookmarkCheck className="w-4 h-4" strokeWidth={1.8} />
              )}

              {/* Status pulse dot */}
              <span
                suppressHydrationWarning
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  isOffline ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                title={isOffline ? 'Working Offline - Safe on device' : 'Saved Locally'}
              />
            </motion.button>

            {/* 2. Permanent Previous Projects / Notes Drawer */}
            <motion.button
              id="btn-dock-projects"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onOpenProjects}
              className="flex items-center justify-center w-9 h-9 rounded-full text-[#333333] hover:bg-black/5 hover:text-black transition-colors shrink-0"
              title="Notes & Canvases Library"
            >
              <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
            </motion.button>

            {/* 3. Permanent New Board Workspace */}
            <motion.button
              id="btn-dock-new"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onNewProject}
              className="flex items-center justify-center w-9 h-9 rounded-full text-[#333333] hover:bg-black/5 hover:text-black transition-colors shrink-0"
              title="New Blank Board"
            >
              <Plus className="w-4 h-4" strokeWidth={2.4} />
            </motion.button>
          </div>

          {/* EXACT DOCK CENTERPIECE: The Main Dark Icon (No container or shadow, pure icon revealing inner white) */}
          <motion.div
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className="flex items-center justify-center mx-2 shrink-0"
          >
            <button
              id="btn-dock-main-center"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('recenter-canvas'));
              }}
              className="flex items-center justify-center p-0.5 cursor-pointer select-none group"
              title="Infinite Stylus Canvas — Tap to recenter view"
            >
              <Image
                src="/icons/dock-main-dark-128.png"
                alt="Main Workspace Emblem"
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="w-10 h-10 object-contain pointer-events-none select-none group-hover:scale-105 active:scale-95 transition-transform"
                priority
              />
            </button>
          </motion.div>

          {/* DRAGGABLE & INFINITE TOOLS RIBBON
              Holding with finger creates a subtle offset bounce.
              Moving finger left or right slides the items with infinite looping!
              No scrollbar whatsoever! */}
          <div
            id="liquid-tools-viewport"
            onPointerDown={handleRibbonPointerDown}
            onPointerMove={handleRibbonPointerMove}
            onPointerUp={handleRibbonPointerUp}
            onPointerCancel={handleRibbonPointerUp}
            onWheel={handleRibbonWheel}
            className={`relative overflow-hidden w-[160px] xs:w-[200px] sm:w-[260px] md:w-[320px] lg:w-[380px] h-10 flex items-center cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-200 ${
              isHolding ? 'scale-[0.98] translate-y-0.5' : 'scale-100 translate-y-0'
            }`}
            title="Hold and slide finger left or right to reveal all tools"
          >
            {/* Left Edge Subtle Fade */}
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white/95 to-transparent z-10 pointer-events-none" />

            {/* Right Edge Subtle Fade */}
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white/95 to-transparent z-10 pointer-events-none" />

            {/* Infinite Looping Track (3 identical sets side by side) */}
            <div
              className="flex items-center will-change-transform"
              style={{
                transform: `translate3d(${translateX}px, 0, 0)`,
                width: `${oneLoopWidth * 3}px`,
              }}
            >
              {/* Copy 0 */}
              <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                {toolDefinitions.map((item) => renderToolButton(item, 'c0'))}
              </div>

              {/* Copy 1 (Middle Initial Copy) */}
              <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                {toolDefinitions.map((item) => renderToolButton(item, 'c1'))}
              </div>

              {/* Copy 2 */}
              <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                {toolDefinitions.map((item) => renderToolButton(item, 'c2'))}
              </div>
            </div>
          </div>

          {/* Floating Color Palette & Stroke Size Panel */}
          <AnimatePresence>
            {showColorPicker && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl border border-black/10 flex flex-col gap-3 min-w-[220px] z-50 pointer-events-auto select-none"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Ink Palette
                  </span>
                  <button
                    onClick={() => setShowColorPicker(false)}
                    className="text-[11px] text-neutral-400 hover:text-neutral-700"
                  >
                    Done
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {INK_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => {
                        onSelectColor(c.value);
                      }}
                      className={`w-6 h-6 rounded-full border transition-transform ${
                        currentColor === c.value
                          ? 'scale-125 ring-2 ring-black/30 border-white'
                          : 'border-black/10 hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/5">
                  <span className="text-[11px] text-neutral-500 font-medium">Size</span>
                  <input
                    type="range"
                    min="1.5"
                    max="14"
                    step="0.5"
                    value={strokeWidth}
                    onChange={(e) => onChangeStrokeWidth(parseFloat(e.target.value))}
                    className="w-24 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#1E1E1E]"
                  />
                  <span className="text-xs font-mono text-neutral-700 w-4 text-right">
                    {strokeWidth}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Export Menu */}
          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-black/10 flex flex-col gap-1 min-w-[170px] z-50 pointer-events-auto select-none"
              >
                <button
                  onClick={() => {
                    onExportPDF();
                    setShowExportMenu(false);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-800 hover:bg-black/5 rounded-xl transition-colors font-medium text-left"
                >
                  <FileText className="w-4 h-4 text-red-600" strokeWidth={1.8} />
                  <span>Export as PDF</span>
                </button>
                <button
                  onClick={() => {
                    onExportPNG();
                    setShowExportMenu(false);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-800 hover:bg-black/5 rounded-xl transition-colors font-medium text-left"
                >
                  <ImageIcon className="w-4 h-4 text-blue-600" strokeWidth={1.8} />
                  <span>Export as PNG</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
