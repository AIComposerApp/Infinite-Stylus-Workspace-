'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PenTool,
  Highlighter,
  Eraser,
  LassoSelect,
  Undo2,
  Redo2,
  Plus,
  X,
  ImagePlus,
  Shapes,
  Type,
  ListTodo,
  StickyNote,
  FolderPlus,
  FolderOpen,
  Share2,
  Sparkles,
  Download,
  FileDown,
  FileJson,
  Crosshair,
  Square,
  Circle,
  Triangle,
  Diamond,
  Star,
  Minus,
  Workflow,
  Check,
} from 'lucide-react';
import { StylusToolType, ShapeType } from '@/types/canvas';

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
  onExportJSON?: () => void;
  onShareThoughtDump?: () => void;
  onTriggerAssistant: () => void;
  isAssistantThinking: boolean;
  isConversationalActive?: boolean;
  isOffline?: boolean;
  onImportImages: (files: FileList | File[]) => void;
  onAddShape: (type: ShapeType, color?: string, fillColor?: string) => void;
  onAddChecklist: () => void;
}

type ActivePopover = 'none' | 'tool' | 'color';

// Curated stationery palette matching the prototype
const PALETTE = [
  { key: 'ink', label: 'Ink', color: '#141414' },
  { key: 'slate', label: 'Slate', color: '#7B8CB0' },
  { key: 'amber', label: 'Amber', color: '#E08A1E' },
  { key: 'sage', label: 'Sage', color: '#7FA08A' },
  { key: 'rose', label: 'Rose', color: '#D4537E' },
  { key: 'blue', label: 'Apple Blue', color: '#007AFF' },
  { key: 'yellow', label: 'Highlighter', color: '#FACC15' },
];

// Curated preset sizes matching the prototype
const TOOL_SIZES: Record<string, { name: string; presets: number[] }> = {
  pen: { name: 'Pen', presets: [1.5, 2.5, 4.5] },
  highlighter: { name: 'Highlighter', presets: [10, 16, 26] },
  eraser: { name: 'Eraser', presets: [10, 18, 32] },
};

const STICKY_NOTES = [
  { label: 'Warm Cream', bg: '#FEF08A', border: '#FACC15' },
  { label: 'Rose Blush', bg: '#FBCFE8', border: '#F472B6' },
  { label: 'Mint Paper', bg: '#BBF7D0', border: '#4ADE80' },
  { label: 'Sky Mist', bg: '#BAE6FD', border: '#38BDF8' },
  { label: 'Lavender', bg: '#E9D5FF', border: '#C084FC' },
];

export const LiquidBottomDock: React.FC<LiquidBottomDockProps> = ({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  strokeWidth,
  onChangeStrokeWidth,
  onSave,
  onOpenProjects,
  onNewProject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExportPDF,
  onExportPNG,
  onExportJSON,
  onShareThoughtDump,
  onTriggerAssistant,
  isAssistantThinking,
  onImportImages,
  onAddShape,
  onAddChecklist,
}) => {
  const [activePopover, setActivePopover] = useState<ActivePopover>('none');
  const [popoverTool, setPopoverTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [showShapePicker, setShowShapePicker] = useState<boolean>(false);
  const [showNotePicker, setShowNotePicker] = useState<boolean>(false);
  const [highlighterOpacity, setHighlighterOpacity] = useState<number>(35);
  const [sheetDragY, setSheetDragY] = useState<number>(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartYRef = useRef<number>(0);

  // Close popovers and sheets on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover('none');
        setIsSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle clicking a tool
  const handleToolClick = (tool: StylusToolType) => {
    // If the tool is already selected, toggle its size options popover
    if (currentTool === tool) {
      if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
        if (activePopover === 'tool' && popoverTool === tool) {
          setActivePopover('none');
        } else {
          setPopoverTool(tool);
          setActivePopover('tool');
        }
      }
      return;
    }

    // Otherwise select the tool and close popovers
    onSelectTool(tool);
    setActivePopover('none');
  };

  // Toggle Color Popover
  const handleColorButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSheetOpen(false);
    setActivePopover((prev) => (prev === 'color' ? 'none' : 'color'));
  };

  // Toggle Sheet
  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePopover('none');
    setIsSheetOpen((prev) => !prev);
    setShowShapePicker(false);
    setShowNotePicker(false);
  };

  const closeAll = () => {
    setActivePopover('none');
    setIsSheetOpen(false);
    setShowShapePicker(false);
    setShowNotePicker(false);
  };

  // Touch drag for bottom sheet grab bar
  const handleGrabPointerDown = (e: React.PointerEvent) => {
    setIsDraggingSheet(true);
    dragStartYRef.current = e.clientY;
    setSheetDragY(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleGrabPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSheet) return;
    const dy = Math.max(0, e.clientY - dragStartYRef.current);
    setSheetDragY(dy);
  };

  const handleGrabPointerUp = () => {
    if (!isDraggingSheet) return;
    setIsDraggingSheet(false);
    if (sheetDragY > 80) {
      setIsSheetOpen(false);
    }
    setSheetDragY(0);
  };

  return (
    <>
      {/* Hidden File Input for Image Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportImages(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Global Scrim Backdrop when Bottom Sheet is Open */}
      <div
        onClick={closeAll}
        className={`fixed inset-0 z-50 bg-black/28 transition-opacity duration-300 pointer-events-none ${
          isSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0'
        }`}
      />

      {/* Click-away detector for popovers */}
      {activePopover !== 'none' && (
        <div
          onClick={() => setActivePopover('none')}
          className="fixed inset-0 z-40 bg-transparent pointer-events-auto"
        />
      )}

      {/* Bottom Dock & Popovers Wrapper */}
      <div className="fixed bottom-7 left-0 right-0 z-50 flex flex-col items-center pointer-events-none px-3.5 select-none pb-[env(safe-area-inset-bottom,0px)]">
        <div className="relative w-full max-w-[344px] flex flex-col items-center">
          {/* ================================================================= */}
          {/* 1. Tool Size & Opacity Popover */}
          {/* ================================================================= */}
          <AnimatePresence>
            {activePopover === 'tool' && (
              <motion.div
                key="tool-popover"
                initial={{ opacity: 0, scale: 0.88, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 10 }}
                transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                className="pointer-events-auto absolute bottom-[72px] w-full p-3.5 bg-white/94 backdrop-blur-2xl backdrop-saturate-180 rounded-[22px] border border-black/10 shadow-[0_16px_36px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.9)] z-50"
              >
                {/* Title */}
                <div className="text-[13px] font-medium text-neutral-500 mb-2.5">
                  {TOOL_SIZES[popoverTool]?.name} size
                </div>

                {/* 3 Preset Sizes with Dynamic Sized Dots */}
                <div className="flex gap-2">
                  {TOOL_SIZES[popoverTool]?.presets.map((s) => {
                    const isSelected = Math.abs(strokeWidth - s) < 0.2;
                    // Calculate preview dot diameter
                    const dotDiameter =
                      popoverTool === 'pen'
                        ? Math.max(5, Math.min(20, Math.round(s * 3.5)))
                        : Math.max(8, Math.min(24, Math.round(s * 0.9)));

                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onChangeStrokeWidth(s)}
                        className={`flex-1 h-11 border-none rounded-[14px] flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 ${
                          isSelected
                            ? 'bg-black/[0.08] ring-2 ring-[#141414]'
                            : 'bg-black/[0.05] hover:bg-black/[0.08]'
                        }`}
                        title={`Size ${s}px`}
                      >
                        <span
                          className="block rounded-full bg-[#141414] transition-all"
                          style={{
                            width: `${dotDiameter}px`,
                            height: `${dotDiameter}px`,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Continuous fine-tuning slider */}
                <div className="flex items-center gap-3 mt-3 text-sm text-neutral-500">
                  <span className="text-xs font-medium text-neutral-600">Custom</span>
                  <input
                    type="range"
                    min="1"
                    max={popoverTool === 'pen' ? 12 : 36}
                    step="0.5"
                    value={strokeWidth}
                    onChange={(e) => onChangeStrokeWidth(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                  />
                  <span className="text-xs font-mono font-medium text-neutral-700 min-w-[32px] text-right">
                    {strokeWidth}px
                  </span>
                </div>

                {/* Highlighter Opacity Slider */}
                {popoverTool === 'highlighter' && (
                  <div className="flex items-center gap-3 mt-2.5 text-sm text-neutral-500">
                    <span className="text-xs font-medium text-neutral-600">Opacity</span>
                    <input
                      type="range"
                      min="20"
                      max="80"
                      step="5"
                      value={highlighterOpacity}
                      onChange={(e) => setHighlighterOpacity(parseInt(e.target.value, 10))}
                      className="flex-1 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                    />
                    <span className="text-xs font-mono font-medium text-neutral-700 min-w-[32px] text-right">
                      {highlighterOpacity}%
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================================================================= */}
          {/* 2. Color Swatch Popover */}
          {/* ================================================================= */}
          <AnimatePresence>
            {activePopover === 'color' && (
              <motion.div
                key="color-popover"
                initial={{ opacity: 0, scale: 0.88, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 10 }}
                transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                className="pointer-events-auto absolute bottom-[72px] w-full p-3.5 bg-white/94 backdrop-blur-2xl backdrop-saturate-180 rounded-[22px] border border-black/10 shadow-[0_16px_36px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.9)] z-50"
              >
                <div className="text-[13px] font-medium text-neutral-500 mb-2.5">Color</div>
                <div className="flex justify-between items-center">
                  {PALETTE.map((p) => {
                    const isSelected = currentColor.toLowerCase() === p.color.toLowerCase();
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => onSelectColor(p.color)}
                        className="w-10 h-10 border-none bg-transparent rounded-full flex items-center justify-center p-0 cursor-pointer transition-transform active:scale-90"
                        title={p.label}
                      >
                        <span
                          className={`block w-7 h-7 rounded-full transition-transform shadow-xs ${
                            isSelected ? 'ring-2 ring-[#141414] ring-offset-2 scale-105' : 'hover:scale-105'
                          }`}
                          style={{
                            backgroundColor: p.color,
                            border: p.color === '#141414' ? 'none' : '0.5px solid rgba(0,0,0,0.15)',
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================================================================= */}
          {/* 3. The Main Bottom Dock (Matches Prototype Exactly) */}
          {/* ================================================================= */}
          <div
            id="mobile-dock"
            role="toolbar"
            aria-label="Drawing tools"
            className="pointer-events-auto w-full h-[60px] flex items-center px-2 bg-white/92 backdrop-blur-2xl backdrop-saturate-180 border border-black/10 rounded-[30px] shadow-[0_12px_32px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)]"
          >
            {/* Tool 1: Pen */}
            <button
              type="button"
              onClick={() => handleToolClick('pen')}
              aria-label="Pen"
              aria-pressed={currentTool === 'pen'}
              className={`flex-1 max-w-[48px] h-11 border-none rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                currentTool === 'pen'
                  ? 'bg-[#141414] text-white -translate-y-1.5 shadow-sm active:scale-90 active:-translate-y-1.5'
                  : 'text-[#141414] hover:bg-black/[0.06] active:scale-90'
              }`}
              title="Pen (click again for sizes)"
            >
              <PenTool className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Tool 2: Highlighter */}
            <button
              type="button"
              onClick={() => handleToolClick('highlighter')}
              aria-label="Highlighter"
              aria-pressed={currentTool === 'highlighter'}
              className={`flex-1 max-w-[48px] h-11 border-none rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                currentTool === 'highlighter'
                  ? 'bg-[#141414] text-white -translate-y-1.5 shadow-sm active:scale-90 active:-translate-y-1.5'
                  : 'text-[#141414] hover:bg-black/[0.06] active:scale-90'
              }`}
              title="Highlighter (click again for sizes)"
            >
              <Highlighter className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Tool 3: Eraser */}
            <button
              type="button"
              onClick={() => handleToolClick('eraser')}
              aria-label="Eraser"
              aria-pressed={currentTool === 'eraser'}
              className={`flex-1 max-w-[48px] h-11 border-none rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                currentTool === 'eraser'
                  ? 'bg-[#141414] text-white -translate-y-1.5 shadow-sm active:scale-90 active:-translate-y-1.5'
                  : 'text-[#141414] hover:bg-black/[0.06] active:scale-90'
              }`}
              title="Eraser (click again for sizes)"
            >
              <Eraser className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Tool 4: Lasso / Select */}
            <button
              type="button"
              onClick={() => handleToolClick('select')}
              aria-label="Lasso"
              aria-pressed={currentTool === 'select'}
              className={`flex-1 max-w-[48px] h-11 border-none rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                currentTool === 'select'
                  ? 'bg-[#141414] text-white -translate-y-1.5 shadow-sm active:scale-90 active:-translate-y-1.5'
                  : 'text-[#141414] hover:bg-black/[0.06] active:scale-90'
              }`}
              title="Lasso / Select"
            >
              <LassoSelect className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Separator */}
            <span className="w-[0.5px] h-6 bg-black/10 mx-1 shrink-0" />

            {/* Color Swatch Button */}
            <button
              id="colorbtn"
              type="button"
              onClick={handleColorButtonClick}
              aria-label="Color"
              className="flex-1 max-w-[48px] h-11 border-none bg-transparent rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-black/[0.06] active:scale-90"
              title="Color Palette"
            >
              <span
                id="sw"
                className="block w-[26px] h-[26px] rounded-full shadow-2xs"
                style={{
                  backgroundColor: currentColor,
                  outline: '0.5px solid rgba(0,0,0,0.15)',
                  outlineOffset: '2px',
                }}
              />
            </button>

            {/* Undo Button */}
            <button
              id="undo"
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
              aria-disabled={!canUndo}
              className={`flex-1 max-w-[48px] h-11 border-none bg-transparent rounded-[22px] flex items-center justify-center transition-all duration-200 text-[#141414] ${
                canUndo
                  ? 'cursor-pointer hover:bg-black/[0.06] active:scale-90'
                  : 'opacity-35 cursor-not-allowed'
              }`}
              title="Undo"
            >
              <Undo2 className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Add (+) Button */}
            <button
              id="plus"
              type="button"
              onClick={handlePlusClick}
              aria-label="Add to canvas"
              className={`flex-1 max-w-[48px] h-11 border-none rounded-[22px] flex items-center justify-center cursor-pointer transition-all duration-200 text-[#141414] ${
                isSheetOpen
                  ? 'bg-black/[0.1] scale-95'
                  : 'hover:bg-black/[0.06] active:scale-90'
              }`}
              title="Add to canvas"
            >
              <Plus className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. iOS 18 Bottom Sheet ("Add to canvas") */}
      {/* ================================================================= */}
      <div
        id="sheet"
        role="dialog"
        aria-label="Add to canvas"
        style={{
          transform: isSheetOpen
            ? `translateY(${sheetDragY}px)`
            : 'translateY(102%)',
          transition: isDraggingSheet ? 'none' : 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="fixed left-0 right-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto px-4 pb-8 bg-[#F4F3EF] rounded-t-[28px] border-t border-black/10 shadow-[0_-10px_40px_rgba(0,0,0,0.12)] text-[#141414]"
      >
        {/* Grab Handle */}
        <div
          id="grab"
          onPointerDown={handleGrabPointerDown}
          onPointerMove={handleGrabPointerMove}
          onPointerUp={handleGrabPointerUp}
          onPointerCancel={handleGrabPointerUp}
          className="h-7 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        >
          <span className="block w-9 h-1.5 rounded-full bg-neutral-400/50" />
        </div>

        {/* Sheet Header */}
        <div className="flex justify-between items-center mb-3 px-1">
          <span className="text-[20px] font-semibold text-[#141414]">Add to canvas</span>
          <button
            type="button"
            onClick={closeAll}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center text-[#141414] cursor-pointer transition-colors active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5-Column Tiles Grid (Image, Shape, Text, Checklist, Note) */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {/* Tile 1: Image */}
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
              closeAll();
            }}
            className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-white text-[#141414] text-[11px] font-medium border-none cursor-pointer shadow-2xs hover:bg-black/[0.04] active:scale-95 transition-all"
          >
            <ImagePlus className="w-6 h-6 text-neutral-700" strokeWidth={1.8} />
            <span>Image</span>
          </button>

          {/* Tile 2: Shape */}
          <button
            type="button"
            onClick={() => {
              setShowShapePicker((prev) => !prev);
              setShowNotePicker(false);
            }}
            className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl text-[#141414] text-[11px] font-medium border-none cursor-pointer shadow-2xs transition-all ${
              showShapePicker
                ? 'bg-black/[0.1] ring-2 ring-[#141414]'
                : 'bg-white hover:bg-black/[0.04] active:scale-95'
            }`}
          >
            <Shapes className="w-6 h-6 text-neutral-700" strokeWidth={1.8} />
            <span>Shape</span>
          </button>

          {/* Tile 3: Text */}
          <button
            type="button"
            onClick={() => {
              onSelectTool('text');
              closeAll();
            }}
            className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-white text-[#141414] text-[11px] font-medium border-none cursor-pointer shadow-2xs hover:bg-black/[0.04] active:scale-95 transition-all"
          >
            <Type className="w-6 h-6 text-neutral-700" strokeWidth={1.8} />
            <span>Text</span>
          </button>

          {/* Tile 4: Checklist */}
          <button
            type="button"
            onClick={() => {
              onAddChecklist();
              closeAll();
            }}
            className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-white text-[#141414] text-[11px] font-medium border-none cursor-pointer shadow-2xs hover:bg-black/[0.04] active:scale-95 transition-all"
          >
            <ListTodo className="w-6 h-6 text-neutral-700" strokeWidth={1.8} />
            <span>Checklist</span>
          </button>

          {/* Tile 5: Note */}
          <button
            type="button"
            onClick={() => {
              setShowNotePicker((prev) => !prev);
              setShowShapePicker(false);
            }}
            className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl text-[#141414] text-[11px] font-medium border-none cursor-pointer shadow-2xs transition-all ${
              showNotePicker
                ? 'bg-black/[0.1] ring-2 ring-[#141414]'
                : 'bg-white hover:bg-black/[0.04] active:scale-95'
            }`}
          >
            <StickyNote className="w-6 h-6 text-neutral-700" strokeWidth={1.8} />
            <span>Note</span>
          </button>
        </div>

        {/* Sub-Panel: Shape Picker (when Shape Tile is clicked) */}
        <AnimatePresence>
          {showShapePicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-2xl p-2.5 mb-4 shadow-2xs grid grid-cols-4 sm:grid-cols-8 gap-2 overflow-hidden"
            >
              {[
                { type: 'rectangle' as ShapeType, label: 'Rect', icon: Square },
                { type: 'rounded-rectangle' as ShapeType, label: 'Round', icon: Square },
                { type: 'circle' as ShapeType, label: 'Circle', icon: Circle },
                { type: 'triangle' as ShapeType, label: 'Triangle', icon: Triangle },
                { type: 'diamond' as ShapeType, label: 'Diamond', icon: Diamond },
                { type: 'star' as ShapeType, label: 'Star', icon: Star },
                { type: 'line' as ShapeType, label: 'Line', icon: Minus },
                { type: 'arrow' as ShapeType, label: 'Arrow', icon: Workflow },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => {
                      onAddShape(s.type, currentColor, 'transparent');
                      closeAll();
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl bg-black/[0.03] hover:bg-black/[0.07] text-neutral-700 transition-colors cursor-pointer text-[11px]"
                  >
                    <Icon className="w-4 h-4 text-neutral-700" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sub-Panel: Note Color Picker (when Note Tile is clicked) */}
        <AnimatePresence>
          {showNotePicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-2xl p-2.5 mb-4 shadow-2xs flex gap-2 justify-between overflow-hidden"
            >
              {STICKY_NOTES.map((n) => (
                <button
                  key={n.label}
                  type="button"
                  onClick={() => {
                    onAddShape('sticky-note', '#141414', n.bg);
                    closeAll();
                  }}
                  className="flex-1 h-10 rounded-xl border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
                  style={{ backgroundColor: n.bg, borderColor: n.border }}
                  title={n.label}
                >
                  <StickyNote className="w-4 h-4 text-neutral-800 opacity-80" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action List Items (Matches Prototype .list) */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xs divide-y divide-black/[0.07]">
          {/* Action 1: Start Project / All Projects */}
          <button
            type="button"
            onClick={() => {
              closeAll();
              onOpenProjects();
            }}
            className="flex items-center gap-3 w-full h-[52px] px-4 bg-transparent hover:bg-black/[0.04] text-[#141414] text-[15px] font-medium text-left cursor-pointer transition-colors"
          >
            <FolderOpen className="w-5 h-5 text-neutral-500" />
            <span>All Projects</span>
          </button>

          {/* Action 2: New Canvas */}
          <button
            type="button"
            onClick={() => {
              closeAll();
              onNewProject();
            }}
            className="flex items-center gap-3 w-full h-[52px] px-4 bg-transparent hover:bg-black/[0.04] text-[#141414] text-[15px] font-medium text-left cursor-pointer transition-colors"
          >
            <FolderPlus className="w-5 h-5 text-neutral-500" />
            <span>Start new project</span>
          </button>

          {/* Action 3: Share canvas / Export */}
          <div className="flex items-center justify-between w-full h-[52px] px-4 bg-transparent hover:bg-black/[0.04] text-[#141414] text-[15px] font-medium transition-colors">
            <button
              type="button"
              onClick={() => {
                closeAll();
                onExportPNG();
              }}
              className="flex items-center gap-3 flex-1 h-full text-left cursor-pointer bg-transparent border-none p-0 text-[#141414]"
            >
              <Share2 className="w-5 h-5 text-neutral-500" />
              <span>Share canvas (PNG)</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeAll();
                onExportPDF();
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-black/[0.06] hover:bg-black/[0.1] text-neutral-700 cursor-pointer transition-colors"
            >
              or PDF
            </button>
          </div>

          {/* Action 4: Ask AI */}
          <button
            type="button"
            onClick={() => {
              closeAll();
              onTriggerAssistant();
            }}
            className="flex items-center gap-3 w-full h-[52px] px-4 bg-transparent hover:bg-black/[0.04] text-[#141414] text-[15px] font-medium text-left cursor-pointer transition-colors"
          >
            <Sparkles className={`w-5 h-5 ${isAssistantThinking ? 'text-[#007AFF] animate-pulse' : 'text-neutral-500'}`} />
            <span>Ask AI</span>
          </button>

          {/* Action 5: Recenter Canvas */}
          <button
            type="button"
            onClick={() => {
              closeAll();
              window.dispatchEvent(new CustomEvent('recenter-canvas'));
            }}
            className="flex items-center gap-3 w-full h-[52px] px-4 bg-transparent hover:bg-black/[0.04] text-[#141414] text-[15px] font-medium text-left cursor-pointer transition-colors"
          >
            <Crosshair className="w-5 h-5 text-neutral-500" />
            <span>Recenter canvas (0, 0)</span>
          </button>

          {/* Action 6: Redo (if redo history exists) */}
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => {
              onRedo();
            }}
            className={`flex items-center gap-3 w-full h-[52px] px-4 bg-transparent text-[15px] font-medium text-left transition-colors ${
              canRedo
                ? 'hover:bg-black/[0.04] text-[#141414] cursor-pointer'
                : 'text-neutral-300 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-5 h-5 text-neutral-400" />
            <span>Redo</span>
          </button>
        </div>
      </div>
    </>
  );
};
