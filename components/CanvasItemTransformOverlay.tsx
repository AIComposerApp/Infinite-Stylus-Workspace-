'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Viewport,
  CanvasImageItem,
  CanvasShapeItem,
  CanvasTextItem,
} from '@/types/canvas';
import {
  Glasses,
  FileText,
  Download,
  Trash2,
  Copy,
  GripHorizontal,
  Palette,
  ScanText,
  Type,
  Check,
  MoreHorizontal,
  X,
} from 'lucide-react';

export type SelectedCanvasItem =
  | { type: 'image'; item: CanvasImageItem }
  | { type: 'shape'; item: CanvasShapeItem }
  | { type: 'text'; item: CanvasTextItem };

interface CanvasItemTransformOverlayProps {
  selected: SelectedCanvasItem | null;
  viewport: Viewport;
  onUpdateImage: (item: CanvasImageItem) => void;
  onUpdateShape: (item: CanvasShapeItem) => void;
  onUpdateText: (item: CanvasTextItem) => void;
  onCommitTransform?: () => void;
  onDeleteItem: (id: string, type: 'image' | 'shape' | 'text') => void;
  onDuplicateItem: (selected: SelectedCanvasItem) => void;
  onAnalyzeImage: (image: CanvasImageItem, mode: 'describe' | 'ocr' | 'brainstorm') => void;
  isAnalyzingImage: boolean;
  onDeselect: () => void;
}

type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

// Curated Charcoal & Muted Architectural Palette
const SHAPE_FILL_PRESETS = [
  { label: 'Transparent', value: 'transparent' },
  { label: 'Charcoal Tint', value: 'rgba(24, 24, 27, 0.08)' },
  { label: 'Pure White', value: '#FFFFFF' },
  { label: 'Warm Paper', value: '#FEF3C7' },
  { label: 'Soft Sage', value: '#DCFCE7' },
  { label: 'Sky Mist', value: '#DBEAFE' },
  { label: 'Lavender', value: '#F3E8FF' },
  { label: 'Blush Rose', value: '#FFE4E6' },
  { label: 'Solid Charcoal', value: '#18181B' },
];

const SHAPE_STROKE_PRESETS = [
  { label: 'Charcoal Black', value: '#18181B' },
  { label: 'Slate Gray', value: '#52525B' },
  { label: 'Warm Taupe', value: '#78716C' },
  { label: 'Muted Amber', value: '#D97706' },
  { label: 'Forest Green', value: '#15803D' },
  { label: 'Brick Red', value: '#B91C1C' },
  { label: 'Navy Blue', value: '#1E3A8A' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'None', value: 'transparent' },
];

export const CanvasItemTransformOverlay: React.FC<CanvasItemTransformOverlayProps> = ({
  selected,
  viewport,
  onUpdateImage,
  onUpdateShape,
  onUpdateText,
  onCommitTransform,
  onDeleteItem,
  onDuplicateItem,
  onAnalyzeImage,
  isAnalyzingImage,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
  const [showColorPopover, setShowColorPopover] = useState<boolean>(false);
  const [isEditingShapeText, setIsEditingShapeText] = useState<boolean>(false);
  const [showSettingsBar, setShowSettingsBar] = useState<boolean>(false);

  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const currentSelectedId = selected?.item.id || null;

  if (prevSelectedId !== currentSelectedId) {
    setPrevSelectedId(currentSelectedId);
    setShowSettingsBar(false);
    setShowColorPopover(false);
    setIsEditingShapeText(false);
  }

  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const isDraggingRef = useRef<boolean>(false);
  const resizingHandleRef = useRef<ResizeHandle | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pointerMovedRef = useRef<boolean>(false);

  const startPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startItemBounds = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // RAF Throttling for seamless 120Hz interaction
  const rafIdRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<(() => void) | null>(null);

  const scheduleUpdate = (fn: () => void) => {
    pendingUpdateRef.current = fn;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (pendingUpdateRef.current) {
          pendingUpdateRef.current();
          pendingUpdateRef.current = null;
        }
      });
    }
  };

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const shapeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Global window listeners for foolproof 120Hz dragging and resizing across any screen boundaries
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        if (Math.hypot(e.clientX - startPointerPos.current.x, e.clientY - startPointerPos.current.y) > 5) {
          pointerMovedRef.current = true;
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }

        const vp = viewportRef.current;
        const currentSel = selectedRef.current;
        if (!currentSel) return;
        const dx = (e.clientX - startPointerPos.current.x) / vp.zoom;
        const dy = (e.clientY - startPointerPos.current.y) / vp.zoom;

        const newX = Math.round(startItemBounds.current.x + dx);
        const newY = Math.round(startItemBounds.current.y + dy);

        scheduleUpdate(() => {
          if (currentSel.type === 'image') {
            onUpdateImage({ ...(currentSel.item as CanvasImageItem), x: newX, y: newY });
          } else if (currentSel.type === 'shape') {
            onUpdateShape({ ...(currentSel.item as CanvasShapeItem), x: newX, y: newY });
          } else if (currentSel.type === 'text') {
            onUpdateText({ ...(currentSel.item as CanvasTextItem), x: newX, y: newY });
          }
        });
      } else if (resizingHandleRef.current) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        const vp = viewportRef.current;
        const currentSel = selectedRef.current;
        if (!currentSel) return;
        const dx = (e.clientX - startPointerPos.current.x) / vp.zoom;
        const dy = (e.clientY - startPointerPos.current.y) / vp.zoom;

        let { x, y, width, height } = startItemBounds.current;
        const isImg = currentSel.type === 'image';
        const aspectRatio = isImg ? (currentSel.item as CanvasImageItem).aspectRatio || width / height : null;

        const handle = resizingHandleRef.current;
        if (handle === 'se') {
          width = Math.max(30, width + dx);
          if (aspectRatio && !e.shiftKey) {
            height = Math.round(width / aspectRatio);
          } else {
            height = Math.max(20, height + dy);
          }
        } else if (handle === 'sw') {
          const newWidth = Math.max(30, width - dx);
          x = x + (width - newWidth);
          width = newWidth;
          if (aspectRatio && !e.shiftKey) {
            height = Math.round(width / aspectRatio);
          } else {
            height = Math.max(20, height + dy);
          }
        } else if (handle === 'ne') {
          width = Math.max(30, width + dx);
          if (aspectRatio && !e.shiftKey) {
            const newHeight = Math.round(width / aspectRatio);
            y = y + (height - newHeight);
            height = newHeight;
          } else {
            const newHeight = Math.max(20, height - dy);
            y = y + (height - newHeight);
            height = newHeight;
          }
        } else if (handle === 'nw') {
          const newWidth = Math.max(30, width - dx);
          x = x + (width - newWidth);
          width = newWidth;
          if (aspectRatio && !e.shiftKey) {
            const newHeight = Math.round(width / aspectRatio);
            y = y + (height - newHeight);
            height = newHeight;
          } else {
            const newHeight = Math.max(20, height - dy);
            y = y + (height - newHeight);
            height = newHeight;
          }
        }

        const finalX = Math.round(x);
        const finalY = Math.round(y);
        const finalW = Math.round(width);
        const finalH = Math.round(height);

        scheduleUpdate(() => {
          if (currentSel.type === 'image') {
            onUpdateImage({ ...(currentSel.item as CanvasImageItem), x: finalX, y: finalY, width: finalW, height: finalH });
          } else if (currentSel.type === 'shape') {
            onUpdateShape({ ...(currentSel.item as CanvasShapeItem), x: finalX, y: finalY, width: finalW, height: finalH });
          } else if (currentSel.type === 'text') {
            onUpdateText({ ...(currentSel.item as CanvasTextItem), x: finalX, y: finalY, width: finalW, height: finalH });
          }
        });
      }
    };

    const handleGlobalPointerUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      let shouldCommit = false;
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        shouldCommit = true;
      }
      if (resizingHandleRef.current) {
        resizingHandleRef.current = null;
        setResizingHandle(null);
        shouldCommit = true;
      }
      if (shouldCommit) {
        if (pendingUpdateRef.current) {
          pendingUpdateRef.current();
          pendingUpdateRef.current = null;
        }
        onCommitTransform?.();
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [onUpdateImage, onUpdateShape, onUpdateText, onCommitTransform]);

  if (!selected) return null;

  const item = selected.item;
  const isImage = selected.type === 'image';
  const isShape = selected.type === 'shape';
  const isText = selected.type === 'text';
  const shapeItem = isShape ? (item as CanvasShapeItem) : null;
  const isStickyNote = isShape && shapeItem?.type === 'sticky-note';

  const itemX = item.x;
  const itemY = item.y;
  const itemWidth = Math.max(20, (item as { width?: number }).width || 240);
  const itemHeight = Math.max(20, (item as { height?: number }).height || 120);

  // Screen coordinates
  const screenLeft = viewport.x + itemX * viewport.zoom;
  const screenTop = viewport.y + itemY * viewport.zoom;
  const screenWidth = itemWidth * viewport.zoom;
  const screenHeight = itemHeight * viewport.zoom;

  // Handle Drag Move initiation
  const handleDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    pointerMovedRef.current = false;
    startPointerPos.current = { x: e.clientX, y: e.clientY };
    startItemBounds.current = {
      x: itemX,
      y: itemY,
      width: itemWidth,
      height: itemHeight,
    };

    // Long press / Touch & Hold (360ms) reveals the settings bar without showing it upfront
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (!pointerMovedRef.current) {
        setShowSettingsBar(true);
      }
    }, 360);
  };

  // Handle Corner Resize initiation
  const handleResizeStart = (handle: ResizeHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    resizingHandleRef.current = handle;
    setResizingHandle(handle);
    startPointerPos.current = { x: e.clientX, y: e.clientY };
    startItemBounds.current = {
      x: itemX,
      y: itemY,
      width: itemWidth,
      height: itemHeight,
    };
  };

  return (
    <div
      id="canvas-item-transform-overlay"
      style={{
        position: 'absolute',
        left: screenLeft,
        top: screenTop,
        width: screenWidth,
        height: screenHeight,
        zIndex: 35,
        pointerEvents: 'none',
      }}
    >
      {/* Crisp Charcoal Selection Border & Full Drag Surface */}
      <div
        className="absolute inset-0 border-2 border-[#18181B] bg-black/[0.001] ring-1 ring-black/15 rounded-sm pointer-events-auto cursor-move select-none"
        onPointerDown={handleDragStart}
        onDoubleClick={() => {
          if (isShape) {
            setIsEditingShapeText(true);
            setTimeout(() => shapeTextareaRef.current?.focus(), 50);
          }
        }}
        title="Drag anywhere to move • Double-click to edit text"
      >
        {/* Non-blocking live text preview when not in active typing mode */}
        {isShape && !isEditingShapeText && shapeItem?.text && (
          <div
            className={`w-full h-full flex ${
              isStickyNote ? 'items-start justify-start p-3' : 'items-center justify-center p-2'
            } pointer-events-none select-none overflow-hidden`}
          >
            <p
              className={`w-full leading-snug whitespace-pre-wrap break-words ${
                isStickyNote ? 'text-left' : 'text-center'
              }`}
              style={{
                fontFamily: '"Kalam", "Caveat", cursive',
                fontSize: `${Math.max(12, (shapeItem?.fontSize || 18) * viewport.zoom)}px`,
                color:
                  shapeItem?.textColor ||
                  (shapeItem?.fillColor === '#18181B' ? '#FFFFFF' : '#1E1E1E'),
              }}
            >
              {shapeItem.text}
            </p>
          </div>
        )}
      </div>

      {/* Discreet Hold-for-Settings Indicator (Hidden by default; revealed on touch & hold or tap) */}
      {!showSettingsBar && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSettingsBar(true);
          }}
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#18181B] text-neutral-300 hover:text-white px-2.5 py-0.5 rounded-full text-[10px] font-medium shadow-lg border border-neutral-700/80 pointer-events-auto transition-transform hover:scale-105 active:scale-95 select-none"
          title="Touch & hold anywhere on item to show settings, or tap here"
        >
          <MoreHorizontal className="w-3 h-3 text-neutral-400" />
          <span className="text-[9px] text-neutral-300 tracking-tight font-sans">Hold for settings</span>
        </button>
      )}

      {/* Sleek Charcoal Black Floating Action Bar (Shown when touched & held or opened) */}
      {showSettingsBar && (
        <div
          style={{
            position: 'absolute',
            top: -46,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
          className="flex items-center gap-1 bg-[#18181B] text-neutral-200 px-2.5 py-1.5 rounded-xl shadow-2xl border border-neutral-700/80 pointer-events-auto select-none z-50 shrink-0 whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Drag handle */}
          <div
            onPointerDown={handleDragStart}
            className="p-1 text-neutral-400 hover:text-white cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reposition"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </div>

          {/* AI Vision Actions for Images - Replaced with Glasses Icon */}
          {isImage && (
            <>
              <button
                onClick={() => onAnalyzeImage(item as CanvasImageItem, 'describe')}
                disabled={isAnalyzingImage}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Analyze image with Vision AI"
              >
                <Glasses className={`w-3.5 h-3.5 ${isAnalyzingImage ? 'animate-pulse text-amber-400' : 'text-neutral-300'}`} />
                <span>{isAnalyzingImage ? 'Analyzing...' : 'Vision AI'}</span>
              </button>

              <button
                onClick={() => onAnalyzeImage(item as CanvasImageItem, 'ocr')}
                disabled={isAnalyzingImage}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Extract text and handwriting via OCR"
              >
                <ScanText className="w-3.5 h-3.5" />
                <span>OCR</span>
              </button>

              <button
                onClick={() => onAnalyzeImage(item as CanvasImageItem, 'brainstorm')}
                disabled={isAnalyzingImage}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Brainstorm ideas based on this image"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Ideas</span>
              </button>

              <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />

              {/* Direct Image File Download */}
              <a
                href={(item as CanvasImageItem).src}
                download={(item as CanvasImageItem).name || 'canvas-image.png'}
                className="p-1 text-neutral-300 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                title="Download image file"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </>
          )}

          {/* Shape Specific Controls: Text & Colors */}
          {isShape && (
            <>
              {/* Shape Text Button */}
              <button
                onClick={() => {
                  setIsEditingShapeText(true);
                  setTimeout(() => shapeTextareaRef.current?.focus(), 50);
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Add or edit text inside shape"
              >
                <Type className="w-3.5 h-3.5" />
                <span>{shapeItem?.text ? 'Edit Text' : 'Add Text'}</span>
              </button>

              {/* Shape Color Picker Trigger */}
              <button
                onClick={() => setShowColorPopover((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Change shape colors & stroke"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Color</span>
              </button>
            </>
          )}

          {/* Duplicate */}
          <button
            onClick={() => onDuplicateItem(selected)}
            className="p-1 text-neutral-300 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Duplicate item"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDeleteItem(item.id, selected.type)}
            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-md transition-colors"
            title="Delete item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />

          {/* Close Settings Bar */}
          <button
            onClick={() => {
              setShowSettingsBar(false);
              setShowColorPopover(false);
            }}
            className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title="Hide settings bar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Charcoal Shape Color Popover */}
      {showSettingsBar && isShape && showColorPopover && (
        <div
          style={{
            position: 'absolute',
            top: -195,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
          className="bg-[#18181B] text-neutral-200 p-3 rounded-2xl shadow-2xl border border-neutral-700/80 pointer-events-auto z-50 flex flex-col gap-2.5 min-w-[240px]"
        >
          <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-400">
              Shape Appearance
            </span>
            <button
              onClick={() => setShowColorPopover(false)}
              className="text-[11px] text-neutral-400 hover:text-white"
            >
              Done
            </button>
          </div>

          {/* Fill Color */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-medium text-neutral-400">Fill Color</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SHAPE_FILL_PRESETS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => {
                    onUpdateShape({ ...shapeItem!, fillColor: f.value });
                    onCommitTransform?.();
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    shapeItem?.fillColor === f.value
                      ? 'ring-2 ring-white scale-110 border-black'
                      : 'border-white/20'
                  }`}
                  style={{
                    backgroundColor: f.value === 'transparent' ? 'transparent' : f.value,
                    backgroundImage:
                      f.value === 'transparent'
                        ? 'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%)'
                        : undefined,
                    backgroundSize: '6px 6px',
                  }}
                  title={f.label}
                />
              ))}
            </div>
          </div>

          {/* Stroke Color */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-800">
            <span className="text-[10px] uppercase font-medium text-neutral-400">Outline Color</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SHAPE_STROKE_PRESETS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    onUpdateShape({ ...shapeItem!, strokeColor: s.value });
                    onCommitTransform?.();
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    shapeItem?.strokeColor === s.value
                      ? 'ring-2 ring-white scale-110 border-black'
                      : 'border-white/20'
                  }`}
                  style={{ backgroundColor: s.value === 'transparent' ? 'transparent' : s.value }}
                  title={s.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Shape Text Area (Interactive Text inside ANY Shape or Sticky Note when editing) */}
      {isShape && isEditingShapeText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: isStickyNote
              ? `${Math.max(10, 16 * viewport.zoom)}px ${Math.max(8, 12 * viewport.zoom)}px`
              : `${Math.max(8, 12 * viewport.zoom)}px`,
            zIndex: 45,
          }}
          className={`flex ${
            isStickyNote ? 'items-start justify-start' : 'items-center justify-center'
          } bg-white/20 backdrop-blur-[1px] rounded-sm pointer-events-auto`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={shapeTextareaRef}
            value={shapeItem?.text || ''}
            onChange={(e) => {
              onUpdateShape({ ...shapeItem!, text: e.target.value });
            }}
            onBlur={() => {
              onCommitTransform?.();
              setIsEditingShapeText(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onCommitTransform?.();
                setIsEditingShapeText(false);
              }
            }}
            placeholder={isStickyNote ? 'Write note here...' : 'Add text...'}
            className={`w-full bg-transparent border-none outline-none resize-none overflow-hidden select-text cursor-text leading-snug ${
              isStickyNote ? 'text-left' : 'text-center'
            } placeholder:text-neutral-400/60 font-handwriting`}
            style={{
              fontFamily: '"Kalam", "Caveat", cursive',
              fontSize: `${Math.max(12, (shapeItem?.fontSize || 18) * viewport.zoom)}px`,
              color:
                shapeItem?.textColor ||
                (shapeItem?.fillColor === '#18181B' ? '#FFFFFF' : '#1E1E1E'),
              height: isStickyNote ? '100%' : 'auto',
              maxHeight: '100%',
            }}
            rows={isStickyNote ? 6 : 2}
            autoFocus
          />
        </div>
      )}

      {/* 4 Corner Resize Handles in Crisp White & Charcoal Black */}
      {/* NW */}
      <div
        onPointerDown={(e) => handleResizeStart('nw', e)}
        className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[#18181B] rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
        title="Resize top-left"
      />
      {/* NE */}
      <div
        onPointerDown={(e) => handleResizeStart('ne', e)}
        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[#18181B] rounded-full shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
        title="Resize top-right"
      />
      {/* SE */}
      <div
        onPointerDown={(e) => handleResizeStart('se', e)}
        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-[#18181B] rounded-full shadow-md cursor-nwse-resize pointer-events-auto hover:scale-125 transition-transform"
        title="Resize bottom-right"
      />
      {/* SW */}
      <div
        onPointerDown={(e) => handleResizeStart('sw', e)}
        className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-[#18181B] rounded-full shadow-md cursor-nesw-resize pointer-events-auto hover:scale-125 transition-transform"
        title="Resize bottom-left"
      />
    </div>
  );
};

export default CanvasItemTransformOverlay;
