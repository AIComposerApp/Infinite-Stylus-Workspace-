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
  ImagePlus,
  Shapes,
  Square,
  Circle,
  Triangle,
  StickyNote,
  MoveRight,
  Minus,
  Sparkles,
  Download,
  Star,
  Diamond,
  Hand,
  ListTodo,
  Type,
  Workflow,
  Globe2,
  Focus,
  SlidersHorizontal,
  Minimize2,
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
  onExportJSON,
  onShareThoughtDump,
  onTriggerAssistant,
  isAssistantThinking,
  isConversationalActive = false,
  isOffline = false,
  onImportImages,
  onAddShape,
  onAddChecklist,
}) => {
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [showShapesMenu, setShowShapesMenu] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [isDockOpen, setIsDockOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Framer Motion controls for repositioning whole dock via grip only
  const dockDragControls = useDragControls();

  // State for the finger-dragged infinite tools ribbon (Right side: drawing tools)
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // State for the finger-dragged infinite tools ribbon (Left side: creation & workspace tools)
  const [leftIsHolding, setLeftIsHolding] = useState<boolean>(false);
  const [leftIsDragging, setLeftIsDragging] = useState<boolean>(false);

  // Left tools definitions (Creation, workspace, library, shapes, checklist, and quick undo/redo)
  const leftToolDefinitions = [
    { id: 'save', label: 'Save', type: 'save' },
    { id: 'projects', label: 'Library', type: 'projects' },
    { id: 'new', label: 'New Board', type: 'new', dividerAfter: true },
    { id: 'image', label: 'Import Image', type: 'image' },
    { id: 'shapes', label: 'Shapes & Sticky Notes', type: 'shapes' },
    { id: 'checklist', label: 'Checklist Card', type: 'checklist', dividerAfter: true },
    { id: 'undo', label: 'Undo', type: 'undo' },
    { id: 'redo', label: 'Redo', type: 'redo' },
  ];

  // Right tools definitions (Stylus drawing tools, text, connector, colors, undo/redo, export, assistant)
  const toolDefinitions = [
    { id: 'pan', label: 'Move & Type', type: 'tool', tool: 'pan' as StylusToolType },
    { id: 'select', label: 'Select & Copy', type: 'tool', tool: 'select' as StylusToolType, dividerAfter: true },
    { id: 'text', label: 'Type Text (T)', type: 'tool', tool: 'text' as StylusToolType },
    { id: 'connector', label: 'Flowchart Connector (C)', type: 'tool', tool: 'connector' as StylusToolType, dividerAfter: true },
    { id: 'pen', label: 'Fountain Pen', type: 'tool', tool: 'pen' as StylusToolType },
    { id: 'pencil', label: 'Graphite Pencil', type: 'tool', tool: 'pencil' as StylusToolType },
    { id: 'highlighter', label: 'Highlighter', type: 'tool', tool: 'highlighter' as StylusToolType },
    { id: 'eraser', label: 'Eraser', type: 'tool', tool: 'eraser' as StylusToolType, dividerAfter: true },
    { id: 'color', label: 'Ink Color & Size', type: 'color', dividerAfter: true },
    { id: 'undo', label: 'Undo', type: 'undo' },
    { id: 'redo', label: 'Redo', type: 'redo', dividerAfter: true },
    { id: 'export', label: 'Export Board', type: 'export' },
    { id: 'assistant', label: 'AI Assistant', type: 'assistant' },
  ];

  // Loop width calculations
  const DIVIDER_STEP = 8;
  const rightDividersCount = toolDefinitions.filter((d) => (d as any).dividerAfter).length;
  const oneLoopWidth = toolDefinitions.length * ITEM_STEP + rightDividersCount * DIVIDER_STEP;
  const [translateX, setTranslateX] = useState<number>(-oneLoopWidth);

  const leftDividersCount = leftToolDefinitions.filter((d) => (d as any).dividerAfter).length;
  const leftOneLoopWidth = leftToolDefinitions.length * ITEM_STEP + leftDividersCount * DIVIDER_STEP;
  const [leftTranslateX, setLeftTranslateX] = useState<number>(-leftOneLoopWidth);

  // Right ribbon drag refs
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPointerXRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const totalDragDistRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const momentumAnimRef = useRef<number | null>(null);

  // Left ribbon drag refs
  const leftPointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const leftLastPointerXRef = useRef<number>(0);
  const leftLastTimeRef = useRef<number>(0);
  const leftTotalDragDistRef = useRef<number>(0);
  const leftVelocityRef = useRef<number>(0);
  const leftMomentumAnimRef = useRef<number | null>(null);

  const handleSaveClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onSave();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  // Cancel any running inertia animation on right ribbon
  const stopMomentum = useCallback(() => {
    if (momentumAnimRef.current !== null) {
      cancelAnimationFrame(momentumAnimRef.current);
      momentumAnimRef.current = null;
    }
  }, []);

  // Cancel any running inertia animation on left ribbon
  const stopLeftMomentum = useCallback(() => {
    if (leftMomentumAnimRef.current !== null) {
      cancelAnimationFrame(leftMomentumAnimRef.current);
      leftMomentumAnimRef.current = null;
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

  // Wrap leftTranslateX modulo leftOneLoopWidth seamlessly
  const wrapLeftTranslateX = useCallback(
    (x: number): number => {
      let current = x;
      while (current < -leftOneLoopWidth * 2) {
        current += leftOneLoopWidth;
      }
      while (current > 0) {
        current -= leftOneLoopWidth;
      }
      return current;
    },
    [leftOneLoopWidth]
  );

  // Pointer Down on Right Tools Ribbon
  const handleRibbonPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopMomentum();
    setIsHolding(true);
    setIsDragging(false);
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    lastPointerXRef.current = e.clientX;
    lastTimeRef.current = Date.now();
    totalDragDistRef.current = 0;
    velocityRef.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Pointer Move on Right Tools Ribbon
  const handleRibbonPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHolding) return;

    const now = Date.now();
    const dt = Math.max(1, now - lastTimeRef.current);
    const dx = e.clientX - lastPointerXRef.current;

    totalDragDistRef.current += Math.abs(dx);
    if (totalDragDistRef.current > 5) {
      setIsDragging(true);
      setShowColorPicker(false);
      setShowExportMenu(false);
      setShowShapesMenu(false);
    }

    velocityRef.current = dx / dt;
    lastPointerXRef.current = e.clientX;
    lastTimeRef.current = now;

    setTranslateX((prev) => wrapTranslateX(prev + dx));
  };

  // Pointer Up on Right Tools Ribbon
  const handleRibbonPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isHolding) return;
    setIsHolding(false);

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored
    }

    if (totalDragDistRef.current > 5 && Math.abs(velocityRef.current) > 0.1) {
      let vel = velocityRef.current * 16;
      const glide = () => {
        if (Math.abs(vel) > 0.25) {
          setTranslateX((prev) => wrapTranslateX(prev + vel));
          vel *= 0.92;
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

  // Wheel on Right Ribbon
  const handleRibbonWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    stopMomentum();
    const delta = -(e.deltaX || (e.shiftKey ? e.deltaY : 0));
    if (Math.abs(delta) > 0) {
      setTranslateX((prev) => wrapTranslateX(prev + delta * 0.8));
    }
  };

  // Pointer Down on Left Tools Ribbon
  const handleLeftRibbonPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLeftMomentum();
    setLeftIsHolding(true);
    setLeftIsDragging(false);
    leftPointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    leftLastPointerXRef.current = e.clientX;
    leftLastTimeRef.current = Date.now();
    leftTotalDragDistRef.current = 0;
    leftVelocityRef.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Pointer Move on Left Tools Ribbon
  const handleLeftRibbonPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!leftIsHolding) return;

    const now = Date.now();
    const dt = Math.max(1, now - leftLastTimeRef.current);
    const dx = e.clientX - leftLastPointerXRef.current;

    leftTotalDragDistRef.current += Math.abs(dx);
    if (leftTotalDragDistRef.current > 5) {
      setLeftIsDragging(true);
      setShowColorPicker(false);
      setShowExportMenu(false);
      setShowShapesMenu(false);
    }

    leftVelocityRef.current = dx / dt;
    leftLastPointerXRef.current = e.clientX;
    leftLastTimeRef.current = now;

    setLeftTranslateX((prev) => wrapLeftTranslateX(prev + dx));
  };

  // Pointer Up on Left Tools Ribbon
  const handleLeftRibbonPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!leftIsHolding) return;
    setLeftIsHolding(false);

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignored
    }

    if (leftTotalDragDistRef.current > 5 && Math.abs(leftVelocityRef.current) > 0.1) {
      let vel = leftVelocityRef.current * 16;
      const glide = () => {
        if (Math.abs(vel) > 0.25) {
          setLeftTranslateX((prev) => wrapLeftTranslateX(prev + vel));
          vel *= 0.92;
          leftMomentumAnimRef.current = requestAnimationFrame(glide);
        } else {
          setLeftIsDragging(false);
        }
      };
      leftMomentumAnimRef.current = requestAnimationFrame(glide);
    } else {
      setLeftIsDragging(false);
    }
  };

  // Wheel on Left Ribbon
  const handleLeftRibbonWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    stopLeftMomentum();
    const delta = -(e.deltaX || (e.shiftKey ? e.deltaY : 0));
    if (Math.abs(delta) > 0) {
      setLeftTranslateX((prev) => wrapLeftTranslateX(prev + delta * 0.8));
    }
  };

  // Execute left tool action only if user wasn't dragging
  const handleLeftItemClick = (type: string) => {
    if (leftTotalDragDistRef.current > 6) return;

    if (type === 'save') {
      handleSaveClick();
    } else if (type === 'projects') {
      onOpenProjects();
    } else if (type === 'new') {
      onNewProject();
    } else if (type === 'image') {
      fileInputRef.current?.click();
    } else if (type === 'shapes') {
      setShowShapesMenu((prev) => !prev);
      setShowColorPicker(false);
      setShowExportMenu(false);
    } else if (type === 'checklist') {
      onAddChecklist();
      setShowShapesMenu(false);
    } else if (type === 'undo') {
      if (canUndo) onUndo();
    } else if (type === 'redo') {
      if (canRedo) onRedo();
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

    const renderButtonNode = () => {
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
          title="Select & Move (V)"
        >
          <LassoSelect className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'text') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'text')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-black/15 text-black font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Type Text Anywhere (T) • Double-click canvas"
        >
          <Type className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'connector') {
      return (
        <button
          key={key}
          onClick={() => handleItemClick('tool', 'connector')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            isSelected
              ? 'bg-blue-100 text-blue-800 font-semibold shadow-xs'
              : 'text-[#444444] hover:bg-black/5 hover:text-black'
          }`}
          title="Curvy Flowchart Connector (C)"
        >
          <Workflow className="w-4 h-4" strokeWidth={1.8} />
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

    const node = renderButtonNode();
    if (!node) return null;

    return (
      <React.Fragment key={key}>
        {node}
        {(item as any).dividerAfter && (
          <div className="w-[1px] h-4 bg-black/10 shrink-0 mx-0.5 pointer-events-none select-none" />
        )}
      </React.Fragment>
    );
  };

  // Render buttons on the Left infinite looping ribbon
  const renderLeftToolButton = (item: (typeof leftToolDefinitions)[0], keySuffix: string | number) => {
    const key = `left-${item.id}-${keySuffix}`;

    const renderLeftButtonNode = () => {
      if (item.id === 'save') {
      return (
        <button
          key={key}
          id="btn-dock-save"
          onClick={handleSaveClick}
          className={`relative flex items-center justify-center w-[38px] h-[38px] rounded-full transition-all shrink-0 select-none ${
            justSaved
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-[#1E1E1E] text-white hover:bg-black shadow-xs active:scale-95'
          }`}
          title="Save Notes & Board (Also Auto-Saves)"
        >
          {justSaved ? (
            <Check className="w-4 h-4 stroke-[2.5]" />
          ) : isSaving ? (
            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <BookmarkCheck className="w-4 h-4" strokeWidth={1.8} />
          )}
          <span
            suppressHydrationWarning
            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
              isOffline ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            title={isOffline ? 'Working Offline - Safe on device' : 'Saved Locally'}
          />
        </button>
      );
    }

    if (item.id === 'projects') {
      return (
        <button
          key={key}
          id="btn-dock-projects"
          onClick={() => handleLeftItemClick('projects')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#333333] hover:bg-black/5 hover:text-black transition-colors shrink-0 select-none active:scale-95"
          title="Notes & Canvases Library"
        >
          <LayoutGrid className="w-4 h-4" strokeWidth={1.8} />
        </button>
      );
    }

    if (item.id === 'new') {
      return (
        <button
          key={key}
          id="btn-dock-new"
          onClick={() => handleLeftItemClick('new')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#333333] hover:bg-black/5 hover:text-black transition-colors shrink-0 select-none active:scale-95"
          title="New Blank Board"
        >
          <Plus className="w-4 h-4" strokeWidth={2.4} />
        </button>
      );
    }

    if (item.id === 'image') {
      return (
        <button
          key={key}
          id="btn-dock-import-image"
          onClick={() => handleLeftItemClick('image')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#18181B] hover:bg-black/5 transition-colors shrink-0 select-none active:scale-95"
          title="Import Image to Canvas (PNG, JPG, WebP, SVG)"
        >
          <ImagePlus className="w-4 h-4 text-[#18181B]" strokeWidth={1.9} />
        </button>
      );
    }

    if (item.id === 'shapes') {
      return (
        <button
          key={key}
          id="btn-dock-shapes"
          onClick={() => handleLeftItemClick('shapes')}
          className={`flex items-center justify-center w-[38px] h-[38px] rounded-full transition-colors shrink-0 select-none active:scale-95 ${
            showShapesMenu
              ? 'bg-black/10 text-black shadow-xs font-semibold'
              : 'text-[#18181B] hover:bg-black/5'
          }`}
          title="Add Shapes, Lines, Arrows & Sticky Notes"
        >
          <Shapes className="w-4 h-4 text-[#18181B]" strokeWidth={1.9} />
        </button>
      );
    }

    if (item.id === 'checklist') {
      return (
        <button
          key={key}
          id="btn-dock-checklist"
          onClick={() => handleLeftItemClick('checklist')}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full text-[#18181B] hover:bg-black/5 transition-colors shrink-0 select-none active:scale-95"
          title="Add Checklist (Tick items, strike out & hide completed)"
        >
          <ListTodo className="w-4 h-4 text-[#18181B]" strokeWidth={1.9} />
        </button>
      );
    }

    if (item.id === 'undo') {
      return (
        <button
          key={key}
          disabled={!canUndo}
          onClick={() => handleLeftItemClick('undo')}
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
          onClick={() => handleLeftItemClick('redo')}
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

      return null;
    };

    const node = renderLeftButtonNode();
    if (!node) return null;

    return (
      <React.Fragment key={key}>
        {node}
        {(item as any).dividerAfter && (
          <div className="w-[1px] h-4 bg-black/10 shrink-0 mx-0.5 pointer-events-none select-none" />
        )}
      </React.Fragment>
    );
  };

  // Clean up animations on unmount
  useEffect(() => {
    return () => {
      stopMomentum();
      stopLeftMomentum();
    };
  }, [stopMomentum, stopLeftMomentum]);

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
        className="pointer-events-auto relative flex items-center justify-center max-w-[98vw]"
      >
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

        {/* Floating Dock Navigation Container with Space-Claiming Physics */}
        <div
          id="liquid-dock-container"
          className={`relative flex items-center justify-between gap-1.5 w-[96vw] max-w-[740px] ${
            isDockOpen ? 'is-open' : ''
          }`}
        >
          {/* 1. Adjacent Icon / Logo: .nav_logo_wrap */}
          <div
            id="nav-logo-wrap"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('recenter-canvas'));
            }}
            style={{
              transform: isDockOpen ? 'scale(0)' : 'scale(1)',
              opacity: isDockOpen ? 0 : 1,
              pointerEvents: isDockOpen ? 'none' : 'auto',
              transition:
                'transform 0.6s cubic-bezier(0.65, 0, 0, 1) 0.05s, opacity 0.4s ease',
            }}
            className="nav_logo_wrap flex items-center justify-center w-[3.75rem] h-[52px] rounded-full bg-white/95 border border-black/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-neutral-50 shrink-0 group active:scale-90 z-30 transition-all"
            title="Recenter Infinite Canvas (0, 0)"
          >
            <div className="flex flex-col items-center justify-center text-neutral-700 group-hover:text-black transition-colors">
              <Focus className="w-5 h-5 stroke-[2] transition-transform duration-200 group-hover:scale-115" />
            </div>
          </div>

          {/* 2. Inner Interaction Pill: .nav_bar_inner (Space-Claim Tradeoff) */}
          <div
            id="liquid-dock"
            style={{
              width: isDockOpen ? '100%' : 'calc(100% - 4.25rem)',
              backgroundColor: isDockOpen ? '#141414' : 'rgba(255, 255, 255, 0.95)',
              color: isDockOpen ? '#FFFFFF' : '#171717',
              transition:
                'width 0.6s cubic-bezier(0.65, 0, 0, 1), background-color 0.4s ease, color 0.4s ease',
            }}
            className="nav_bar_inner flex items-center justify-between gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-full backdrop-blur-2xl border border-black/[0.08] shadow-[0_12px_36px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.03)] overflow-visible"
          >
            {/* Subtle Dock Reposition Grip Handle */}
            <div
              onPointerDown={(e) => dockDragControls.start(e)}
              className="flex items-center justify-center w-4 sm:w-5 h-9 text-neutral-300 hover:text-neutral-600 cursor-grab active:cursor-grabbing px-0.5 touch-none shrink-0"
              title="Drag grip to reposition dock on screen"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </div>

            {/* LEFT INFINITE LOOPING RIBBON (Creation, workspace, library, shapes, checklist, quick undo/redo) */}
            <div
              id="liquid-left-tools-viewport"
              onPointerDown={handleLeftRibbonPointerDown}
              onPointerMove={handleLeftRibbonPointerMove}
              onPointerUp={handleLeftRibbonPointerUp}
              onPointerCancel={handleLeftRibbonPointerUp}
              onWheel={handleLeftRibbonWheel}
              className={`relative overflow-hidden w-[125px] xs:w-[155px] sm:w-[195px] md:w-[230px] lg:w-[260px] h-10 flex items-center cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-200 ${
                leftIsHolding ? 'scale-[0.98] translate-y-0.5' : 'scale-100 translate-y-0'
              }`}
              title="Hold and slide finger left or right to reveal creation tools"
            >
              {/* Left Edge Subtle Fade */}
              <div className="absolute left-0 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-r from-white/95 to-transparent z-10 pointer-events-none" />

              {/* Right Edge Subtle Fade */}
              <div className="absolute right-0 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-l from-white/95 to-transparent z-10 pointer-events-none" />

              {/* Infinite Looping Track */}
              <div
                className="flex items-center will-change-transform"
                style={{
                  transform: `translate3d(${leftTranslateX}px, 0, 0)`,
                  width: `${leftOneLoopWidth * 3}px`,
                }}
              >
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${leftOneLoopWidth}px` }}>
                  {leftToolDefinitions.map((item) => renderLeftToolButton(item, 'l0'))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${leftOneLoopWidth}px` }}>
                  {leftToolDefinitions.map((item) => renderLeftToolButton(item, 'l1'))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${leftOneLoopWidth}px` }}>
                  {leftToolDefinitions.map((item) => renderLeftToolButton(item, 'l2'))}
                </div>
              </div>
            </div>

            {/* DOCK EXPAND / RECENTER TRIGGER BUTTON (Complete Event Isolation) */}
            <button
              id="btn-dock-main-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsDockOpen(!isDockOpen);
              }}
              className={`relative shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 cursor-pointer select-none group active:scale-90 transition-all outline-none z-30 rounded-full border ${
                isDockOpen
                  ? 'bg-neutral-800 text-white border-white/20'
                  : 'bg-neutral-100/90 text-neutral-800 border-black/10 hover:bg-neutral-200/90'
              }`}
              title={isDockOpen ? 'Collapse dock ribbon' : 'Expand full dock space'}
            >
              {isDockOpen ? (
                <Minimize2 className="w-4 h-4 stroke-[2] transition-transform duration-200 group-hover:scale-110" />
              ) : (
                <SlidersHorizontal className="w-4 h-4 stroke-[2] transition-transform duration-200 group-hover:scale-110" />
              )}
            </button>

            {/* RIGHT INFINITE LOOPING RIBBON (Drawing tools, colors, undo/redo, export, assistant) */}
            <div
              id="liquid-tools-viewport"
              onPointerDown={handleRibbonPointerDown}
              onPointerMove={handleRibbonPointerMove}
              onPointerUp={handleRibbonPointerUp}
              onPointerCancel={handleRibbonPointerUp}
              onWheel={handleRibbonWheel}
              className={`relative overflow-hidden w-[125px] xs:w-[155px] sm:w-[195px] md:w-[230px] lg:w-[260px] h-10 flex items-center cursor-grab active:cursor-grabbing touch-none select-none transition-all duration-200 ${
                isHolding ? 'scale-[0.98] translate-y-0.5' : 'scale-100 translate-y-0'
              }`}
              title="Hold and slide finger left or right to reveal all drawing tools"
            >
              {/* Left Edge Subtle Fade */}
              <div className="absolute left-0 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-r from-white/95 to-transparent z-10 pointer-events-none" />

              {/* Right Edge Subtle Fade */}
              <div className="absolute right-0 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-l from-white/95 to-transparent z-10 pointer-events-none" />

              {/* Infinite Looping Track */}
              <div
                className="flex items-center will-change-transform"
                style={{
                  transform: `translate3d(${translateX}px, 0, 0)`,
                  width: `${oneLoopWidth * 3}px`,
                }}
              >
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                  {toolDefinitions.map((item) => renderToolButton(item, 'c0'))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                  {toolDefinitions.map((item) => renderToolButton(item, 'c1'))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" style={{ width: `${oneLoopWidth}px` }}>
                  {toolDefinitions.map((item) => renderToolButton(item, 'c2'))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Backdrop overlay for active popups so clicking anywhere outside dismisses them */}
      {(showShapesMenu || showColorPicker || showExportMenu) && (
        <div
          className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[0.5px] pointer-events-auto"
          onClick={() => {
            setShowShapesMenu(false);
            setShowColorPicker(false);
            setShowExportMenu(false);
          }}
        />
      )}

      {/* Floating Color Palette & Stroke Size Panel */}
      <AnimatePresence>
        {showColorPicker && (
          <motion.div
            initial={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            animate={{ scaleX: 1, scaleY: 1, y: 0, opacity: 1 }}
            exit={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.75 }}
            style={{ transformOrigin: 'bottom center' }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white/95 text-neutral-800 rounded-2xl p-3.5 shadow-2xl border border-neutral-200/90 backdrop-blur-xl flex flex-col gap-3 w-[calc(100vw-32px)] max-w-[280px] z-50 pointer-events-auto select-none"
          >
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Ink Palette
              </span>
              <button
                onClick={() => setShowColorPicker(false)}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
            <div className="flex items-center justify-center gap-2">
              {INK_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    onSelectColor(c.value);
                  }}
                  className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                    currentColor === c.value
                      ? 'scale-125 ring-2 ring-neutral-900 border-white'
                      : 'border-neutral-300 hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
              <span className="text-[11px] text-neutral-500 font-medium">Size</span>
              <input
                type="range"
                min="1.5"
                max="14"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => onChangeStrokeWidth(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
              />
              <span className="text-xs font-mono text-neutral-700 w-4 text-right">
                {strokeWidth}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Shapes, Lines, Sticky Notes & Checklist Menu (Viewport-safe, centered on mobile) */}
      <AnimatePresence>
        {showShapesMenu && (
          <motion.div
            initial={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            animate={{ scaleX: 1, scaleY: 1, y: 0, opacity: 1 }}
            exit={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.75 }}
            style={{ transformOrigin: 'bottom center' }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white/95 text-neutral-800 rounded-2xl p-3.5 shadow-2xl border border-neutral-200/90 backdrop-blur-xl flex flex-col gap-2.5 w-[calc(100vw-32px)] max-w-[320px] max-h-[72vh] overflow-y-auto z-50 pointer-events-auto select-none"
          >
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Add to Canvas
              </span>
              <button
                onClick={() => setShowShapesMenu(false)}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Sticky Notes */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wider">
                Sticky Notes
              </span>
              <div className="flex items-center justify-between gap-1.5">
                {[
                  { label: 'Yellow', bg: '#FEF08A', border: '#FACC15' },
                  { label: 'Pink', bg: '#FBCFE8', border: '#F472B6' },
                  { label: 'Mint', bg: '#BBF7D0', border: '#4ADE80' },
                  { label: 'Sky', bg: '#BAE6FD', border: '#38BDF8' },
                  { label: 'Lavender', bg: '#E9D5FF', border: '#C084FC' },
                ].map((note) => (
                  <button
                    key={note.label}
                    onClick={() => {
                      onAddShape('sticky-note', '#1E1E1E', note.bg);
                      setShowShapesMenu(false);
                    }}
                    className="w-8 h-8 rounded-lg shadow-xs border transition-transform hover:scale-110 active:scale-95 flex items-center justify-center text-xs cursor-pointer"
                    style={{ backgroundColor: note.bg, borderColor: note.border }}
                    title={`Add ${note.label} Sticky Note`}
                  >
                    <StickyNote className="w-3.5 h-3.5 opacity-80 text-neutral-900" />
                  </button>
                ))}
              </div>
            </div>

            {/* Geometric Shapes */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wider">
                Geometric Shapes
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => {
                    onAddShape('rectangle', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Rectangle"
                >
                  <Square className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Rect</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('rounded-rectangle', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Rounded Rectangle"
                >
                  <Square className="w-3.5 h-3.5 text-neutral-600 rounded-xs" />
                  <span>Round</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('circle', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Circle"
                >
                  <Circle className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Circle</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('triangle', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Triangle"
                >
                  <Triangle className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Triangle</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('diamond', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Diamond"
                >
                  <Diamond className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Diamond</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('star', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Star"
                >
                  <Star className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Star</span>
                </button>
              </div>
            </div>

            {/* Lines & Arrows */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wider">
                Lines & Connectors
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    onAddShape('line', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Straight Line"
                >
                  <Minus className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Line</span>
                </button>
                <button
                  onClick={() => {
                    onAddShape('arrow', currentColor, 'transparent');
                    setShowShapesMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Directional Arrow"
                >
                  <MoveRight className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Arrow</span>
                </button>
              </div>
            </div>

            {/* Checklist Tool */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wider">
                Interactive Tasks
              </span>
              <button
                onClick={() => {
                  onAddChecklist();
                  setShowShapesMenu(false);
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-neutral-700 bg-neutral-100 hover:bg-neutral-200 hover:text-neutral-900 transition-colors text-left cursor-pointer"
                title="Add Checklist"
              >
                <ListTodo className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-neutral-900">Checklist Card</span>
                  <span className="text-[10px] text-neutral-500 truncate">Tick, strike out & hide completed</span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Export Menu */}
      <AnimatePresence>
        {showExportMenu && (
          <motion.div
            initial={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            animate={{ scaleX: 1, scaleY: 1, y: 0, opacity: 1 }}
            exit={{ scaleX: 0.15, scaleY: 0.1, y: 35, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.75 }}
            style={{ transformOrigin: 'bottom center' }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white/95 text-neutral-800 rounded-2xl p-2 shadow-2xl border border-neutral-200/90 backdrop-blur-xl flex flex-col gap-1 w-[calc(100vw-32px)] max-w-[240px] z-50 pointer-events-auto select-none"
          >
            {onShareThoughtDump && (
              <button
                onClick={() => {
                  onShareThoughtDump();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-900 bg-neutral-100/90 hover:bg-neutral-900 hover:text-white rounded-xl transition-all font-semibold text-left cursor-pointer group"
              >
                <Globe2 className="w-4 h-4 text-neutral-800 group-hover:text-white transition-colors" strokeWidth={1.8} />
                <div className="flex flex-col">
                  <span>Share Anonymous Thought</span>
                  <span className="text-[10px] font-normal text-neutral-500 group-hover:text-neutral-300">Broadcast to Thoughtspace feed</span>
                </div>
              </button>
            )}
            <div className="h-px bg-neutral-100 my-0.5" />
            <button
              onClick={() => {
                onExportPNG();
                setShowExportMenu(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded-xl transition-colors font-medium text-left cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-neutral-500" strokeWidth={1.8} />
              <span>Export as PNG Image</span>
            </button>
            <button
              onClick={() => {
                onExportPDF();
                setShowExportMenu(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded-xl transition-colors font-medium text-left cursor-pointer"
            >
              <FileText className="w-4 h-4 text-neutral-500" strokeWidth={1.8} />
              <span>Export as PDF Document</span>
            </button>
            {onExportJSON && (
              <button
                onClick={() => {
                  onExportJSON();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded-xl transition-colors font-medium text-left cursor-pointer"
              >
                <Download className="w-4 h-4 text-neutral-500" strokeWidth={1.8} />
                <span>Download Canvas (JSON)</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
