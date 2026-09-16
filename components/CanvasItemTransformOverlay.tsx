'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Viewport,
  CanvasImageItem,
  CanvasShapeItem,
  CanvasTextItem,
  ConnectorAnchorSide,
} from '@/types/canvas';
import { calculateCanvasTextBounds } from '@/lib/canvas-utils';
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
  Workflow,
} from 'lucide-react';

export type SelectedCanvasItem =
  | { type: 'image'; item: CanvasImageItem }
  | { type: 'shape'; item: CanvasShapeItem }
  | { type: 'text'; item: CanvasTextItem };

interface CanvasItemTransformOverlayProps {
  selected: SelectedCanvasItem | null;
  viewport: Viewport;
  lastCanvasTapTime?: number;
  onUpdateImage: (item: CanvasImageItem) => void;
  onUpdateShape: (item: CanvasShapeItem) => void;
  onUpdateText: (item: CanvasTextItem) => void;
  onCommitTransform?: () => void;
  onDeleteItem: (id: string, type: 'image' | 'shape' | 'text') => void;
  onDuplicateItem: (selected: SelectedCanvasItem) => void;
  onAnalyzeImage: (image: CanvasImageItem, mode: 'describe' | 'ocr' | 'brainstorm') => void;
  isAnalyzingImage: boolean;
  onDeselect: () => void;
  onStartConnectorDrag?: (itemId: string, side: ConnectorAnchorSide, startCanvasX: number, startCanvasY: number) => void;
  onCopyText?: (text: string) => void;
  onEditText?: (textId: string) => void;
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
  lastCanvasTapTime,
  onUpdateImage,
  onUpdateShape,
  onUpdateText,
  onCommitTransform,
  onDeleteItem,
  onDuplicateItem,
  onAnalyzeImage,
  isAnalyzingImage,
  onDeselect,
  onStartConnectorDrag,
  onCopyText,
  onEditText,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
  const [showColorPopover, setShowColorPopover] = useState<boolean>(false);
  const [isEditingShapeText, setIsEditingShapeText] = useState<boolean>(false);
  const [showSettingsBar, setShowSettingsBar] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const lastOverlayTapTimeRef = useRef<number>(0);
  const lastOverlayTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Keyboard shortcut Ctrl+C / Cmd+C for copying text of selected item
  useEffect(() => {
    if (!selected) return;
    const isText = selected.type === 'text';
    const isShape = selected.type === 'shape';
    const textItem = isText ? (selected.item as CanvasTextItem) : null;
    const shapeItem = isShape ? (selected.item as CanvasShapeItem) : null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        if (isText && textItem?.text) {
          navigator.clipboard.writeText(textItem.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
          onCopyText?.(textItem.text);
        } else if (isShape && shapeItem?.text) {
          navigator.clipboard.writeText(shapeItem.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
          onCopyText?.(shapeItem.text);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, onCopyText]);

  if (!selected) return null;

  const item = selected.item;
  const isImage = selected.type === 'image';
  const isShape = selected.type === 'shape';
  const isText = selected.type === 'text';
  const shapeItem = isShape ? (item as CanvasShapeItem) : null;
  const textItem = isText ? (item as CanvasTextItem) : null;
  const isStickyNote = isShape && shapeItem?.type === 'sticky-note';

  const textBounds = isText
    ? calculateCanvasTextBounds(textItem?.text || '', item.x, item.y, textItem?.width || 640)
    : null;

  const itemX = item.x;
  const itemY = item.y;
  const itemWidth = isText
    ? Math.max(60, textBounds ? textBounds.width : 120)
    : (textBounds ? textBounds.width : Math.max(20, (item as { width?: number }).width || 240));
  const itemHeight = textBounds ? textBounds.height : Math.max(20, (item as { height?: number }).height || 120);

  // Screen coordinates
  const screenLeft = viewport.x + itemX * viewport.zoom;
  const screenTop = viewport.y + itemY * viewport.zoom;
  const screenWidth = itemWidth * viewport.zoom;
  const screenHeight = itemHeight * viewport.zoom;

  // Handle Drag Move initiation
  const handleDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();

    // Fast double-tap detection for touch/stylus/mouse across canvas and overlay boundaries
    const now = Date.now();
    const isDoubleTap =
      (now - lastOverlayTapTimeRef.current < 450 &&
        Math.hypot(e.clientX - lastOverlayTapPosRef.current.x, e.clientY - lastOverlayTapPosRef.current.y) < 35) ||
      (typeof lastCanvasTapTime === 'number' && lastCanvasTapTime > 0 && now - lastCanvasTapTime < 520);

    lastOverlayTapTimeRef.current = now;
    lastOverlayTapPosRef.current = { x: e.clientX, y: e.clientY };

    if (isDoubleTap) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (isText && textItem) {
        onEditText?.(textItem.id);
        return;
      }
      if (isShape) {
        setIsEditingShapeText(true);
        setTimeout(() => shapeTextareaRef.current?.focus(), 50);
        return;
      }
    }

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
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isText && textItem) {
            onEditText?.(textItem.id);
          } else if (isShape) {
            setIsEditingShapeText(true);
            setTimeout(() => shapeTextareaRef.current?.focus(), 50);
          }
        }}
        title="Drag anywhere to move • Double-click or double-tap to edit text"
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

      {/* Discreet, Non-intrusive Settings Trigger */}
      <AnimatePresence mode="wait">
        {!showSettingsBar ? (
          <motion.button
            key="item-settings-trigger"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsBar(true);
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 26 }}
            className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center justify-center w-6 h-5 bg-white/95 text-neutral-600 hover:text-neutral-900 rounded-full shadow-md border border-neutral-200/90 pointer-events-auto backdrop-blur-md cursor-pointer select-none transition-transform hover:scale-110 active:scale-95"
            title="Open settings"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </motion.button>
        ) : (
          <motion.div
            key="item-settings-toolbar"
            initial={{ scaleX: 0.08, scaleY: 0.6, opacity: 0 }}
            animate={{ scaleX: 1, scaleY: 1, opacity: 1 }}
            exit={{ scaleX: 0.08, scaleY: 0.6, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 440,
              damping: 26,
              mass: 0.7,
            }}
            style={{
              position: 'absolute',
              top: -46,
              left: '50%',
              x: '-50%',
              transformOrigin: 'center center',
            }}
            className="flex items-center gap-1 bg-white/95 text-neutral-800 px-2 py-1.5 rounded-xl shadow-xl border border-neutral-200/90 backdrop-blur-md pointer-events-auto select-none z-50 shrink-0 whitespace-nowrap"
          >
            {/* Drag handle */}
            <div
              onPointerDown={handleDragStart}
              className="p-1 text-neutral-400 hover:text-neutral-800 cursor-grab active:cursor-grabbing transition-colors"
              title="Drag to reposition"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </div>

            {/* AI Vision Actions for Images */}
            {isImage && (
              <>
                <button
                  onClick={() => onAnalyzeImage(item as CanvasImageItem, 'describe')}
                  disabled={isAnalyzingImage}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Analyze image with Vision AI"
                >
                  <Glasses className={`w-3.5 h-3.5 ${isAnalyzingImage ? 'animate-pulse text-amber-500' : 'text-neutral-500'}`} />
                  <span>{isAnalyzingImage ? 'Analyzing...' : 'Vision AI'}</span>
                </button>

                <button
                  onClick={() => onAnalyzeImage(item as CanvasImageItem, 'ocr')}
                  disabled={isAnalyzingImage}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Extract text and handwriting via OCR"
                >
                  <ScanText className="w-3.5 h-3.5 text-neutral-500" />
                  <span>OCR</span>
                </button>

                <button
                  onClick={() => onAnalyzeImage(item as CanvasImageItem, 'brainstorm')}
                  disabled={isAnalyzingImage}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Brainstorm ideas based on this image"
                >
                  <FileText className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Ideas</span>
                </button>

                <div className="w-[1px] h-3.5 bg-neutral-200 mx-0.5" />

                {/* Direct Image File Download */}
                <a
                  href={(item as CanvasImageItem).src}
                  download={(item as CanvasImageItem).name || 'canvas-image.png'}
                  className="p-1 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-md transition-colors"
                  title="Download image file"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </>
            )}

            {/* Text Specific Controls: Edit & Copy */}
            {isText && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (textItem) {
                      onEditText?.(textItem.id);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Edit text note"
                >
                  <Type className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => {
                    if (textItem?.text) {
                      navigator.clipboard.writeText(textItem.text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                      onCopyText?.(textItem.text);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Copy text note (Ctrl+C)"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-neutral-500" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </>
            )}

            {/* Shape Specific Controls: Text, Copy & Colors */}
            {isShape && (
              <>
                {/* Shape Text Button */}
                <button
                  onClick={() => {
                    setIsEditingShapeText(true);
                    setTimeout(() => shapeTextareaRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Add or edit text inside shape"
                >
                  <Type className="w-3.5 h-3.5 text-neutral-500" />
                  <span>{shapeItem?.text ? 'Edit Text' : 'Add Text'}</span>
                </button>

                {shapeItem?.text && (
                  <button
                    onClick={() => {
                      if (shapeItem?.text) {
                        navigator.clipboard.writeText(shapeItem.text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                        onCopyText?.(shapeItem.text);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    title="Copy shape text (Ctrl+C)"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-neutral-500" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}

                {/* Shape Color Picker Trigger */}
                <button
                  onClick={() => setShowColorPopover((prev) => !prev)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                  title="Change shape colors & stroke"
                >
                  <Palette className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Color</span>
                </button>
              </>
            )}

            {/* Connect to other canvas items */}
            <button
              onClick={() => {
                onStartConnectorDrag?.(item.id, 'right', itemX + itemWidth, itemY + itemHeight / 2);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
              title="Connect to other elements"
            >
              <Workflow className="w-3.5 h-3.5 text-blue-500" />
              <span>Connect</span>
            </button>

            {/* Duplicate */}
            <button
              onClick={() => onDuplicateItem(selected)}
              className="p-1 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
              title="Duplicate item"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {/* Delete */}
            <button
              onClick={() => onDeleteItem(item.id, selected.type)}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              title="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-neutral-200 mx-0.5" />

            {/* Close Settings Bar */}
            <button
              onClick={() => {
                setShowSettingsBar(false);
                setShowColorPopover(false);
              }}
              className="p-1 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
              title="Hide settings bar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clean Shape Color Popover */}
      <AnimatePresence>
        {showSettingsBar && isShape && showColorPopover && (
          <motion.div
            initial={{ scaleX: 0.15, scaleY: 0.1, y: 15, opacity: 0 }}
            animate={{ scaleX: 1, scaleY: 1, y: 0, opacity: 1 }}
            exit={{ scaleX: 0.15, scaleY: 0.1, y: 15, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 26, mass: 0.7 }}
            style={{
              position: 'absolute',
              top: -195,
              left: '50%',
              x: '-50%',
              transformOrigin: 'bottom center',
            }}
            className="bg-white/95 text-neutral-800 p-3 rounded-2xl shadow-2xl border border-neutral-200/90 backdrop-blur-xl pointer-events-auto z-50 flex flex-col gap-2.5 min-w-[240px]"
          >
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500">
                Shape Appearance
              </span>
              <button
                onClick={() => setShowColorPopover(false)}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                Done
              </button>
            </div>

            {/* Fill Color */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-medium text-neutral-500">Fill Color</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {SHAPE_FILL_PRESETS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => {
                      onUpdateShape({ ...shapeItem!, fillColor: f.value });
                      onCommitTransform?.();
                    }}
                    className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                      shapeItem?.fillColor === f.value
                        ? 'ring-2 ring-neutral-900 scale-110 border-white'
                        : 'border-neutral-300'
                    }`}
                    style={{
                      backgroundColor: f.value === 'transparent' ? 'transparent' : f.value,
                      backgroundImage:
                        f.value === 'transparent'
                          ? 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%)'
                          : undefined,
                      backgroundSize: '6px 6px',
                    }}
                    title={f.label}
                  />
                ))}
              </div>
            </div>

            {/* Stroke Color */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="text-[10px] uppercase font-medium text-neutral-500">Outline Color</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {SHAPE_STROKE_PRESETS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      onUpdateShape({ ...shapeItem!, strokeColor: s.value });
                      onCommitTransform?.();
                    }}
                    className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                      shapeItem?.strokeColor === s.value
                        ? 'ring-2 ring-neutral-900 scale-110 border-white'
                        : 'border-neutral-300'
                    }`}
                    style={{ backgroundColor: s.value === 'transparent' ? 'transparent' : s.value }}
                    title={s.label}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* 4 Corner Resize Handles in Crisp White & Charcoal Black (Images & Shapes only) */}
      {!isText && (
        <>
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
        </>
      )}

      {/* 4 Dynamic Curvy Flowchart Connection Anchors on all 4 sides (Images & Shapes only) */}
      {!isText && (
        <>
          {/* Top Anchor */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartConnectorDrag?.(item.id, 'top', itemX + itemWidth / 2, itemY);
            }}
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-blue-600 hover:bg-blue-600 hover:scale-125 rounded-full shadow-md cursor-crosshair pointer-events-auto transition-all flex items-center justify-center group z-40"
            title="Drag connector from top side"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 group-hover:bg-white transition-colors" />
          </div>

          {/* Right Anchor */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartConnectorDrag?.(item.id, 'right', itemX + itemWidth, itemY + itemHeight / 2);
            }}
            className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 hover:bg-blue-600 hover:scale-125 rounded-full shadow-md cursor-crosshair pointer-events-auto transition-all flex items-center justify-center group z-40"
            title="Drag connector from right side"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 group-hover:bg-white transition-colors" />
          </div>

          {/* Bottom Anchor */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartConnectorDrag?.(item.id, 'bottom', itemX + itemWidth / 2, itemY + itemHeight);
            }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-blue-600 hover:bg-blue-600 hover:scale-125 rounded-full shadow-md cursor-crosshair pointer-events-auto transition-all flex items-center justify-center group z-40"
            title="Drag connector from bottom side"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 group-hover:bg-white transition-colors" />
          </div>

          {/* Left Anchor */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartConnectorDrag?.(item.id, 'left', itemX, itemY + itemHeight / 2);
            }}
            className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 hover:bg-blue-600 hover:scale-125 rounded-full shadow-md cursor-crosshair pointer-events-auto transition-all flex items-center justify-center group z-40"
            title="Drag connector from left side"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 group-hover:bg-white transition-colors" />
          </div>
        </>
      )}
    </div>
  );
};

export default CanvasItemTransformOverlay;
