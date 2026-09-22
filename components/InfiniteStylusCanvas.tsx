'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  Point,
  Stroke,
  AIThought,
  ThoughtSentence,
  Viewport,
  StylusToolType,
  ProjectNote,
  CanvasTextItem,
  CanvasImageItem,
  CanvasShapeItem,
  CanvasChecklistItem,
  ShapeType,
  CanvasConnectorItem,
  CanvasConnectorEndpoint,
  ConnectorAnchorSide,
} from '@/types/canvas';
import {
  calculateStrokeBounds,
  drawSmoothStroke,
  drawCanvasShape,
  layoutHandwrittenText,
  getOffScreenBubblePosition,
  exportCanvasToImage,
  exportCanvasToPDF,
  loadSavedProjects,
  saveProjectsToStorage,
  autoSaveSingleProject,
  loadActiveProjectId,
  saveActiveProjectId,
  calculateCanvasTextBounds,
  findCollisionFreeAssistantSpawn,
  drawCurvyConnector,
  getItemBoundingBox,
  getAnchorPointForSide,
  resolveConnectorEndpoint,
  computeCurvyConnectorControlPoints,
  cleanAiOutput,
} from '@/lib/canvas-utils';
import { generateOfflineAssistantThought } from '@/lib/offline-intelligence';
import { LiquidBottomDock } from '@/components/LiquidBottomDock';
import { ThoughtBubbleOffScreen } from '@/components/ThoughtBubbleOffScreen';
import { ProjectsDrawer } from '@/components/ProjectsDrawer';
import { TopToast } from '@/components/TopToast';
import { SentenceCopyOverlay } from '@/components/SentenceCopyOverlay';
import { CanvasItemTransformOverlay, SelectedCanvasItem } from '@/components/CanvasItemTransformOverlay';
import { CanvasChecklistCard } from '@/components/CanvasChecklistCard';
import { CanvasMiniRadar } from '@/components/CanvasMiniRadar';
import { CanvasTimeMachine } from '@/components/CanvasTimeMachine';
import { CanvasOnboardingGuide } from '@/components/CanvasOnboardingGuide';
import { CanvasConnectorActionOverlay } from '@/components/CanvasConnectorActionOverlay';
import { FeedbackRatingModal } from '@/components/FeedbackRatingModal';
import { ShareThoughtDumpModal } from '@/components/ShareThoughtDumpModal';
import { LiveThoughtFeedModal } from '@/components/LiveThoughtFeedModal';
import { AppNavigationDrawer } from '@/components/AppNavigationDrawer';
import { CanvasesScreen } from '@/components/shell/CanvasesScreen';
import { ExploreScreen, ExplorePost } from '@/components/shell/ExploreScreen';
import { EditorTopBar } from '@/components/shell/EditorTopBar';
import { AppTabBar } from '@/components/shell/AppTabBar';
import { publishThoughtDumpToFirestore, SharedThoughtDocument } from '@/lib/thoughtspace-service';
import { useRouter } from 'next/navigation';
import { GlobalViewBar, GlobalViewMode } from '@/components/navigation/GlobalViewBar';
import { PenTool, ShieldCheck, Hand, Edit3, Check, History, Maximize2, HelpCircle, Workflow, Type, Copy, Compass, GripHorizontal, Globe2, Star, Radio, Menu, Undo2, Redo2 } from 'lucide-react';

// Living Ink: Detect natural scratch-out / scribble gesture
const isScratchOutGesture = (points: Point[]): boolean => {
  if (points.length < 16) return false;

  let directionReversals = 0;
  let lastDx = 0;
  let totalLength = 0;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.hypot(dx, dy);

    if (Math.abs(dx) > 2.5) {
      if (lastDx !== 0 && ((dx > 0 && lastDx < 0) || (dx < 0 && lastDx > 0))) {
        directionReversals++;
      }
      lastDx = dx;
    }
  }

  const startToEnd = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y
  );

  return directionReversals >= 5 && totalLength > startToEnd * 2.8;
};

const subscribeOnline = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const getOnlineSnapshot = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);
const getServerSnapshot = () => true;

let cachedPendingThoughtDump: {
  strokes?: Stroke[];
  thoughts?: AIThought[];
  canvasTexts?: CanvasTextItem[];
  shapes?: CanvasShapeItem[];
  checklists?: CanvasChecklistItem[];
  title?: string;
} | null = null;
let hasCheckedPendingThoughtDump = false;

function getPendingThoughtDump() {
  if (typeof window === 'undefined') return null;
  if (!hasCheckedPendingThoughtDump) {
    hasCheckedPendingThoughtDump = true;
    try {
      const payload = localStorage.getItem('thoughtspace_pending_load');
      const title = localStorage.getItem('thoughtspace_pending_title');
      if (payload) {
        localStorage.removeItem('thoughtspace_pending_load');
        localStorage.removeItem('thoughtspace_pending_title');
        cachedPendingThoughtDump = { ...JSON.parse(payload), title: title || 'Thought Stream' };
      }
    } catch {
      // ignore
    }
  }
  return cachedPendingThoughtDump;
}

export const InfiniteStylusCanvas: React.FC = () => {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Connectivity state for offline resilience
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const isOffline = !isOnline;

  // Initialize Projects & Canvas state lazily
  const [projects, setProjects] = useState<ProjectNote[]>(() => {
    return loadSavedProjects();
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const savedId = loadActiveProjectId();
    const list = loadSavedProjects();
    if (savedId && list.some((p) => p.id === savedId)) return savedId;
    return list.length > 0 ? list[0].id : 'proj-seed-default-1';
  });

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === activeProjectId) || projects[0] || null;
  }, [projects, activeProjectId]);

  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  // Current Canvas State
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending?.strokes && pending.strokes.length > 0) {
      return pending.strokes;
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.strokes || [];
  });

  const [thoughts, setThoughts] = useState<AIThought[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending?.thoughts && pending.thoughts.length > 0) {
      return pending.thoughts;
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.thoughts || [];
  });

  const [canvasTexts, setCanvasTexts] = useState<CanvasTextItem[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending?.canvasTexts && pending.canvasTexts.length > 0) {
      return pending.canvasTexts;
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.canvasTexts || [];
  });

  const [images, setImages] = useState<CanvasImageItem[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.images || [];
  });

  const [shapes, setShapes] = useState<CanvasShapeItem[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending?.shapes && pending.shapes.length > 0) {
      return pending.shapes;
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.shapes || [];
  });

  const [checklists, setChecklists] = useState<CanvasChecklistItem[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending?.checklists && pending.checklists.length > 0) {
      return pending.checklists;
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.checklists || [];
  });

  const [connectors, setConnectors] = useState<CanvasConnectorItem[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.connectors || [];
  });

  const [selectedItem, setSelectedItem] = useState<SelectedCanvasItem | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);

  // Active in-progress connector drag state (from anchor dot to target item or free point)
  const [activeConnectorDrag, setActiveConnectorDrag] = useState<{
    fromItemId?: string;
    fromSide?: ConnectorAnchorSide;
    startPoint: { x: number; y: number };
    currentPoint: { x: number; y: number };
    targetCandidate?: { itemId: string; side: ConnectorAnchorSide; point: { x: number; y: number } } | null;
  } | null>(null);
  const activeConnectorDragRef = useRef<typeof activeConnectorDrag>(null);

  useEffect(() => {
    activeConnectorDragRef.current = activeConnectorDrag;
  }, [activeConnectorDrag]);

  const [viewport, setViewport] = useState<Viewport>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.viewport || { x: 200, y: 150, zoom: 1 };
  });

  // Keep references to current state for high-frequency callbacks & gestures
  const viewportRef = useRef<Viewport>(viewport);
  const strokesRef = useRef<Stroke[]>(strokes);
  const thoughtsRef = useRef<AIThought[]>(thoughts);
  const canvasTextsRef = useRef<CanvasTextItem[]>(canvasTexts);
  const imagesRef = useRef<CanvasImageItem[]>(images);
  const shapesRef = useRef<CanvasShapeItem[]>(shapes);
  const checklistsRef = useRef<CanvasChecklistItem[]>(checklists);
  const connectorsRef = useRef<CanvasConnectorItem[]>(connectors);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const activeProjectIdRef = useRef<string>(activeProjectId);
  const activeProjectRef = useRef<ProjectNote | null>(activeProject);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    thoughtsRef.current = thoughts;
  }, [thoughts]);

  useEffect(() => {
    canvasTextsRef.current = canvasTexts;
  }, [canvasTexts]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    checklistsRef.current = checklists;
  }, [checklists]);

  useEffect(() => {
    connectorsRef.current = connectors;
  }, [connectors]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    activeProjectRef.current = activeProject;
  }, [activeProjectId, activeProject]);

  // Active text block typing session (blinking vertical caret)
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const activeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isDraggingActiveText, setIsDraggingActiveText] = useState<boolean>(false);
  const isDraggingActiveTextRef = useRef<boolean>(false);
  const activeTextDragRef = useRef<{
    startX: number;
    startY: number;
    itemX: number;
    itemY: number;
    textId: string;
    hasMoved: boolean;
  } | null>(null);

  // History for Undo / Redo
  const [history, setHistory] = useState<{
    strokes: Stroke[];
    thoughts: AIThought[];
    canvasTexts: CanvasTextItem[];
    images: CanvasImageItem[];
    shapes: CanvasShapeItem[];
    checklists: CanvasChecklistItem[];
    connectors: CanvasConnectorItem[];
  }[]>(() => {
    const pending = getPendingThoughtDump();
    if (pending) {
      return [
        {
          strokes: pending.strokes || [],
          thoughts: pending.thoughts || [],
          canvasTexts: pending.canvasTexts || [],
          images: [],
          shapes: pending.shapes || [],
          checklists: pending.checklists || [],
          connectors: [],
        },
      ];
    }
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return [
      {
        strokes: proj?.strokes || [],
        thoughts: proj?.thoughts || [],
        canvasTexts: proj?.canvasTexts || [],
        images: proj?.images || [],
        shapes: proj?.shapes || [],
        checklists: proj?.checklists || [],
        connectors: proj?.connectors || [],
      },
    ];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Stylus Tools State - default to 'pan' (Move & Type mode). Pen tools explicitly activate drawing/stylus!
  const [currentTool, setCurrentTool] = useState<StylusToolType>('pan');
  const [currentColor, setCurrentColor] = useState<string>('#1E1E1E');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Time Machine Playback & Spatial Radar States
  const [isTimeMachineOpen, setIsTimeMachineOpen] = useState<boolean>(false);
  const [timeMachineStep, setTimeMachineStep] = useState<number>(0);
  const [isMiniRadarVisible, setIsMiniRadarVisible] = useState<boolean>(true);

  // Chronological unified timeline of all canvas elements for full-state playback
  const timelineItems = useMemo(() => {
    const list: {
      id: string;
      type: 'shape' | 'image' | 'stroke' | 'text' | 'thought' | 'checklist' | 'connector';
      timestamp: number;
    }[] = [];

    shapes.forEach((s) => list.push({ id: s.id, type: 'shape', timestamp: s.createdAt || 1 }));
    images.forEach((i) => list.push({ id: i.id, type: 'image', timestamp: i.createdAt || 1 }));
    strokes.forEach((s) => list.push({ id: s.id, type: 'stroke', timestamp: s.timestamp || 1 }));
    canvasTexts.forEach((t) => list.push({ id: t.id, type: 'text', timestamp: t.createdAt || 1 }));
    thoughts.forEach((th) => list.push({ id: th.id, type: 'thought', timestamp: th.createdAt || 1 }));
    checklists.forEach((c) => list.push({ id: c.id, type: 'checklist', timestamp: c.createdAt || 1 }));
    connectors.forEach((c) => list.push({ id: c.id, type: 'connector', timestamp: c.createdAt || 1 }));

    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [shapes, images, strokes, canvasTexts, thoughts, checklists, connectors]);

  const timeMachineVisibleSet = useMemo(() => {
    if (!isTimeMachineOpen) return null;
    const set = new Set<string>();
    const count = Math.min(timelineItems.length, timeMachineStep);
    for (let i = 0; i < count; i++) {
      set.add(timelineItems[i].id);
    }
    return set;
  }, [isTimeMachineOpen, timelineItems, timeMachineStep]);

  // Current Drawing Stroke Ref
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);

  // Canvas Pan Interaction Ref (1-finger drag or mouse drag)
  const isPanningRef = useRef<boolean>(false);
  const lastPanPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const isSpaceHeldRef = useRef<boolean>(false);
  const prevToolRef = useRef<StylusToolType>('pan');
  const [isPanningState, setIsPanningState] = useState<boolean>(false);

  // Direct canvas item dragging for shapes, images, and text
  const directDragItemRef = useRef<{
    type: 'shape' | 'image' | 'text';
    id: string;
    startClientX: number;
    startClientY: number;
    startItemX: number;
    startItemY: number;
  } | null>(null);
  const isDirectDraggingItemRef = useRef<boolean>(false);
  const isTextHighlightDragRef = useRef<boolean>(false);

  // Multi-Touch Two-Finger Tracking (Pinch-to-Scale & Pan Move Anywhere)
  const activePointersRef = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  const twoFingerGestureRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialMidpoint: { x: number; y: number };
    initialViewport: Viewport;
  } | null>(null);

  // Samsung S-Pen & Stylus Digitizer Integration with Palm Rejection
  const [isStylusDetected, setIsStylusDetected] = useState<boolean>(false);
  const [isPalmRejectionActive, setIsPalmRejectionActive] = useState<boolean>(true);
  const isPenInContactRef = useRef<boolean>(false);
  const lastPenTimeRef = useRef<number>(0);
  const isStylusEraserRef = useRef<boolean>(false);

  // Assistant & Off-Screen Thought Bubble State
  const [activeThoughtId, setActiveThoughtId] = useState<string | null>(null);

  // Top header project title inline editing
  const [isEditingTopTitle, setIsEditingTopTitle] = useState<boolean>(false);
  const [topTitleInput, setTopTitleInput] = useState<string>('');

  // Mobile App Shell Prototype State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(true);
  const [activeShellTab, setActiveShellTab] = useState<'canvases' | 'explore'>('canvases');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [edgeDragX, setEdgeDragX] = useState<number>(0);
  const [isEdgeDragging, setIsEdgeDragging] = useState<boolean>(false);
  const edgeStartXRef = useRef<number>(0);

  // Phase 1: Anonymous Thought Dump Sharing & Feedback/Rating System
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);
  const [feedbackTriggerReason, setFeedbackTriggerReason] = useState<'manual' | 'post_share' | 'high_engagement'>('manual');
  // Phase 2: Multi-Page Navigation & Live Feed Integration
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState<boolean>(false);
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState<boolean>(false);
  const [lastCanvasTapTime, setLastCanvasTapTime] = useState<number>(0);
  const isInteractingWithMoveHandleRef = useRef<boolean>(false);
  const sessionStartTimeRef = useRef<number>(0);
  const [sessionDurationSec, setSessionDurationSec] = useState<number>(0);
  const highEngagementTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (sessionStartTimeRef.current > 0) {
        setSessionDurationSec(Math.round((Date.now() - sessionStartTimeRef.current) / 1000));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Screen dimensions for off-screen bubble calculation
  const [windowDimensions, setWindowDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Offline / Online connectivity event toast notifications
  useEffect(() => {
    const handleOnline = () => {
      showToast('Back online — Assistant ready');
    };
    const handleOffline = () => {
      showToast('Offline mode — All notes safe on device');
    };
    const handleRecenter = () => {
      setViewport({ x: 0, y: 0, zoom: 1 });
      showToast('Canvas centered');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('recenter-canvas', handleRecenter);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('recenter-canvas', handleRecenter);
    };
  }, [showToast]);

  // Auto-save active project viewport (debounced) so reloads never lose canvas position
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeProjectIdRef.current && activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: strokesRef.current,
          thoughts: thoughtsRef.current,
          canvasTexts: canvasTextsRef.current,
          images: imagesRef.current,
          shapes: shapesRef.current,
          checklists: checklistsRef.current,
          connectors: connectorsRef.current,
          viewport,
        });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [viewport]);

  // Synchronous flush on page beforeunload / reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeProjectIdRef.current && activeProjectRef.current) {
        saveActiveProjectId(activeProjectIdRef.current);
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: strokesRef.current,
          thoughts: thoughtsRef.current,
          canvasTexts: canvasTextsRef.current,
          images: imagesRef.current,
          shapes: shapesRef.current,
          checklists: checklistsRef.current,
          connectors: connectorsRef.current,
          viewport: viewportRef.current,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Compute off-screen thought bubble position dynamically
  // ONLY shows while the assistant is actively thinking or writing!
  const offScreenBubble = useMemo(() => {
    if (!activeThoughtId) {
      return { visible: false, screenX: 0, screenY: 0, angleRad: 0, targetCanvasX: 0, targetCanvasY: 0 };
    }

    const thought = thoughts.find((t) => t.id === activeThoughtId);
    if (!thought || (thought.status !== 'thinking' && thought.status !== 'writing')) {
      return { visible: false, screenX: 0, screenY: 0, angleRad: 0, targetCanvasX: 0, targetCanvasY: 0 };
    }

    const { isOffScreen, screenX, screenY, angleRad } = getOffScreenBubblePosition(
      thought.x,
      thought.y,
      viewport,
      windowDimensions.width,
      windowDimensions.height,
      56
    );

    return {
      visible: isOffScreen,
      screenX,
      screenY,
      angleRad,
      targetCanvasX: thought.x,
      targetCanvasY: thought.y,
    };
  }, [activeThoughtId, thoughts, viewport, windowDimensions]);

  // Selected Sentences State for Copy
  const [selectedSentences, setSelectedSentences] = useState<ThoughtSentence[]>([]);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Double-tap tracker for stylus
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Save current project state manually
  const handleSaveProject = useCallback(() => {
    setIsSaving(true);
    setProjects((prevProjects) => {
      const updated = prevProjects.map((p) => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            strokes,
            thoughts,
            canvasTexts,
            images,
            shapes,
            checklists,
            viewport,
            updatedAt: Date.now(),
          };
        }
        return p;
      });
      saveProjectsToStorage(updated);
      return updated;
    });
    setTimeout(() => {
      setIsSaving(false);
      showToast('Saved to device');
    }, 300);
  }, [activeProjectId, strokes, thoughts, canvasTexts, images, shapes, checklists, viewport, showToast]);

  // Switch Active Project
  const handleSelectProject = useCallback(
    (id: string) => {
      // 1. Immediately flush & save current project
      if (activeProjectIdRef.current) {
        autoSaveSingleProject({
          id: activeProjectIdRef.current,
          title: activeProjectRef.current?.title || 'Note',
          createdAt: activeProjectRef.current?.createdAt || Date.now(),
          updatedAt: Date.now(),
          isPinned: activeProjectRef.current?.isPinned || false,
          strokes: strokesRef.current,
          thoughts: thoughtsRef.current,
          canvasTexts: canvasTextsRef.current,
          images: imagesRef.current,
          shapes: shapesRef.current,
          checklists: checklistsRef.current,
          connectors: connectorsRef.current,
          viewport: viewportRef.current,
        });
      }

      // 2. Fetch fresh projects directly from storage & state
      const allProjects = loadSavedProjects();
      const target = allProjects.find((p) => p.id === id) || projects.find((p) => p.id === id);

      if (target) {
        const loadedStrokes = target.strokes || [];
        const loadedThoughts = target.thoughts || [];
        const loadedCanvasTexts = target.canvasTexts || [];
        const loadedImages = target.images || [];
        const loadedShapes = target.shapes || [];
        const loadedChecklists = target.checklists || [];
        const loadedConnectors = target.connectors || [];
        const loadedViewport = target.viewport || { x: 200, y: 150, zoom: 1 };

        setActiveProjectId(target.id);
        activeProjectIdRef.current = target.id;
        activeProjectRef.current = target;
        saveActiveProjectId(target.id);

        strokesRef.current = loadedStrokes;
        thoughtsRef.current = loadedThoughts;
        canvasTextsRef.current = loadedCanvasTexts;
        imagesRef.current = loadedImages;
        shapesRef.current = loadedShapes;
        checklistsRef.current = loadedChecklists;
        connectorsRef.current = loadedConnectors;
        viewportRef.current = loadedViewport;

        setStrokes(loadedStrokes);
        setThoughts(loadedThoughts);
        setCanvasTexts(loadedCanvasTexts);
        setImages(loadedImages);
        setShapes(loadedShapes);
        setChecklists(loadedChecklists);
        setConnectors(loadedConnectors);
        setViewport(loadedViewport);

        setHistory([
          {
            strokes: loadedStrokes,
            thoughts: loadedThoughts,
            canvasTexts: loadedCanvasTexts,
            images: loadedImages,
            shapes: loadedShapes,
            checklists: loadedChecklists,
            connectors: loadedConnectors,
          },
        ]);
        setHistoryIndex(0);
        setSelectedSentences([]);
        setActiveThoughtId(null);
        setActiveTextId(null);
        setSelectedItem(null);
        setSelectedConnectorId(null);
        setCurrentTool('pan');
        showToast(`Opened: ${target.title}`);
      }
    },
    [projects, showToast]
  );

  // New Project
  const handleNewProject = useCallback(() => {
    if (activeProjectIdRef.current) {
      autoSaveSingleProject({
        id: activeProjectIdRef.current,
        title: activeProjectRef.current?.title || 'Note',
        createdAt: activeProjectRef.current?.createdAt || Date.now(),
        updatedAt: Date.now(),
        isPinned: activeProjectRef.current?.isPinned || false,
        strokes: strokesRef.current,
        thoughts: thoughtsRef.current,
        canvasTexts: canvasTextsRef.current,
        images: imagesRef.current,
        shapes: shapesRef.current,
        checklists: checklistsRef.current,
        connectors: connectorsRef.current,
        viewport: viewportRef.current,
      });
    }

    const currentList = loadSavedProjects();
    const newId = `proj-${Date.now()}`;
    const newNote: ProjectNote = {
      id: newId,
      title: `Idea Stream ${currentList.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      strokes: [],
      thoughts: [],
      canvasTexts: [],
      images: [],
      shapes: [],
      checklists: [],
      connectors: [],
      viewport: { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 150, zoom: 1 },
    };

    const updated = [newNote, ...currentList];
    setProjects(updated);
    saveProjectsToStorage(updated);

    setActiveProjectId(newId);
    activeProjectIdRef.current = newId;
    activeProjectRef.current = newNote;
    saveActiveProjectId(newId);

    strokesRef.current = [];
    thoughtsRef.current = [];
    canvasTextsRef.current = [];
    imagesRef.current = [];
    shapesRef.current = [];
    checklistsRef.current = [];
    connectorsRef.current = [];
    viewportRef.current = newNote.viewport;

    setStrokes([]);
    setThoughts([]);
    setCanvasTexts([]);
    setImages([]);
    setShapes([]);
    setChecklists([]);
    setConnectors([]);
    setViewport(newNote.viewport);
    setHistory([{ strokes: [], thoughts: [], canvasTexts: [], images: [], shapes: [], checklists: [], connectors: [] }]);
    setHistoryIndex(0);
    setSelectedSentences([]);
    setActiveThoughtId(null);
    setActiveTextId(null);
    setSelectedItem(null);
    setSelectedConnectorId(null);
    setCurrentTool('pan');
    showToast('New board ready');
  }, [showToast]);

  // Pin Project
  const handlePinProject = useCallback((id: string) => {
    setProjects((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, isPinned: !p.isPinned } : p));
      saveProjectsToStorage(updated);
      return updated;
    });
  }, []);

  // Delete Project
  const handleDeleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const updated = prev.filter((p) => p.id !== id);
        saveProjectsToStorage(updated);
        if (id === activeProjectId) {
          if (updated.length > 0) {
            handleSelectProject(updated[0].id);
          } else {
            handleNewProject();
          }
        }
        return updated;
      });
    },
    [activeProjectId, handleSelectProject, handleNewProject]
  );

  // Rename Project
  const handleRenameProject = useCallback(
    (id: string, newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      setProjects((prev) => {
        const updated = prev.map((p) => (p.id === id ? { ...p, title: trimmed, updatedAt: Date.now() } : p));
        saveProjectsToStorage(updated);
        return updated;
      });
      if (activeProjectIdRef.current === id && activeProjectRef.current) {
        activeProjectRef.current = { ...activeProjectRef.current, title: trimmed, updatedAt: Date.now() };
      }
      showToast(`Renamed to "${trimmed}"`);
    },
    [showToast]
  );

  // Load thought post from Explore screen into canvas
  const handleOpenExplorePost = useCallback(
    (post: ExplorePost) => {
      const newProjId = 'proj-explore-' + Date.now();
      const P = [
        [120, 160],
        [280, 200],
        [180, 300],
      ];
      const newShapes: CanvasShapeItem[] = post.nodes.map((n, i) => {
        const pt = P[i % P.length];
        return {
          id: 'shape-' + Date.now() + '-' + i,
          type: 'circle',
          x: pt[0],
          y: pt[1],
          width: 130,
          height: 130,
          strokeColor: i === 0 ? '#E08A1E' : i === 1 ? '#7B8CB0' : '#7FA08A',
          strokeWidth: 2,
          fillColor: 'transparent',
          text: n,
          textColor: '#141414',
          fontSize: 14,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      });

      const newTexts: CanvasTextItem[] = [
        {
          id: 'text-' + Date.now(),
          text: post.quote,
          x: 100,
          y: 420,
          fontSize: 15,
          color: '#141414',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const newProj: ProjectNote = {
        id: newProjId,
        title: post.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
        strokes: [],
        thoughts: [],
        canvasTexts: newTexts,
        shapes: newShapes,
        viewport: { x: 0, y: 0, zoom: 1 },
      };

      setProjects((prev) => {
        const updated = [newProj, ...prev];
        saveProjectsToStorage(updated);
        return updated;
      });
      handleSelectProject(newProjId);
      setIsEditorOpen(true);
      showToast(`Opened "${post.title}"`);
    },
    [handleSelectProject, showToast]
  );

  // Undo / Redo
  const pushHistory = useCallback(
    (
      newStrokes: Stroke[],
      newThoughts: AIThought[],
      newTexts: CanvasTextItem[] = canvasTextsRef.current,
      newImages: CanvasImageItem[] = imagesRef.current,
      newShapes: CanvasShapeItem[] = shapesRef.current,
      newChecklists: CanvasChecklistItem[] = checklistsRef.current,
      newConnectors: CanvasConnectorItem[] = connectorsRef.current
    ) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({
        strokes: newStrokes,
        thoughts: newThoughts,
        canvasTexts: newTexts,
        images: newImages,
        shapes: newShapes,
        checklists: newChecklists,
        connectors: newConnectors,
      });
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);

      // Auto-save project immediately
      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: newStrokes,
          thoughts: newThoughts,
          canvasTexts: newTexts,
          images: newImages,
          shapes: newShapes,
          checklists: newChecklists,
          connectors: newConnectors,
          viewport: viewportRef.current,
        });
      }
    },
    [history, historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setStrokes(prev.strokes);
      setThoughts(prev.thoughts);
      setCanvasTexts(prev.canvasTexts || []);
      setImages(prev.images || []);
      setShapes(prev.shapes || []);
      setChecklists(prev.checklists || []);
      setConnectors(prev.connectors || []);

      strokesRef.current = prev.strokes;
      thoughtsRef.current = prev.thoughts;
      canvasTextsRef.current = prev.canvasTexts || [];
      imagesRef.current = prev.images || [];
      shapesRef.current = prev.shapes || [];
      checklistsRef.current = prev.checklists || [];
      connectorsRef.current = prev.connectors || [];

      setHistoryIndex(historyIndex - 1);
      setSelectedSentences([]);
      setSelectedItem(null);
      setSelectedConnectorId(null);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: prev.strokes,
          thoughts: prev.thoughts,
          canvasTexts: prev.canvasTexts || [],
          images: prev.images || [],
          shapes: prev.shapes || [],
          checklists: prev.checklists || [],
          connectors: prev.connectors || [],
          viewport: viewportRef.current,
        });
      }
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setStrokes(next.strokes);
      setThoughts(next.thoughts);
      setCanvasTexts(next.canvasTexts || []);
      setImages(next.images || []);
      setShapes(next.shapes || []);
      setChecklists(next.checklists || []);
      setConnectors(next.connectors || []);

      strokesRef.current = next.strokes;
      thoughtsRef.current = next.thoughts;
      canvasTextsRef.current = next.canvasTexts || [];
      imagesRef.current = next.images || [];
      shapesRef.current = next.shapes || [];
      checklistsRef.current = next.checklists || [];
      connectorsRef.current = next.connectors || [];

      setHistoryIndex(historyIndex + 1);
      setSelectedSentences([]);
      setSelectedItem(null);
      setSelectedConnectorId(null);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: next.strokes,
          thoughts: next.thoughts,
          canvasTexts: next.canvasTexts || [],
          images: next.images || [],
          shapes: next.shapes || [],
          checklists: next.checklists || [],
          connectors: next.connectors || [],
          viewport: viewportRef.current,
        });
      }
    }
  }, [history, historyIndex]);

  // Convert Screen coordinate to Canvas Coordinate with accurate sub-pixel getBoundingClientRect
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return {
          x: (screenX - viewport.x) / viewport.zoom,
          y: (screenY - viewport.y) / viewport.zoom,
        };
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: (screenX - rect.left - viewport.x) / viewport.zoom,
        y: (screenY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport]
  );

  // Convert Canvas coordinate to Screen Coordinate
  const canvasToScreen = useCallback(
    (canvasX: number, canvasY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return {
          x: canvasX * viewport.zoom + viewport.x,
          y: canvasY * viewport.zoom + viewport.y,
        };
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + viewport.x + canvasX * viewport.zoom,
        y: rect.top + viewport.y + canvasY * viewport.zoom,
      };
    },
    [viewport]
  );

  // Start dragging a connector from an item's anchor side
  const handleStartConnectorDrag = useCallback(
    (itemId: string, side: ConnectorAnchorSide, startX: number, startY: number) => {
      setActiveConnectorDrag({
        fromItemId: itemId,
        fromSide: side,
        startPoint: { x: startX, y: startY },
        currentPoint: { x: startX, y: startY },
        targetCandidate: null,
      });
      setSelectedConnectorId(null);
    },
    []
  );

  // Update connector properties (color, arrowHead, label, etc.)
  const handleUpdateConnector = useCallback(
    (id: string, updates: Partial<CanvasConnectorItem>) => {
      setConnectors((prev) => {
        const updated = prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
        connectorsRef.current = updated;
        pushHistory(
          strokesRef.current,
          thoughtsRef.current,
          canvasTextsRef.current,
          imagesRef.current,
          shapesRef.current,
          checklistsRef.current,
          updated
        );
        return updated;
      });
    },
    [pushHistory]
  );

  // Delete a connector
  const handleDeleteConnector = useCallback(
    (id: string) => {
      setConnectors((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        connectorsRef.current = updated;
        pushHistory(
          strokesRef.current,
          thoughtsRef.current,
          canvasTextsRef.current,
          imagesRef.current,
          shapesRef.current,
          checklistsRef.current,
          updated
        );
        return updated;
      });
      setSelectedConnectorId(null);
      showToast('Connector removed');
    },
    [pushHistory, showToast]
  );

  // Active connector drag move and drop listeners (zero lag, snapping to nearest candidate side)
  useEffect(() => {
    if (!activeConnectorDrag) return;

    const onPointerMove = (e: PointerEvent) => {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      let bestCandidate: { itemId: string; side: ConnectorAnchorSide; point: { x: number; y: number } } | null = null;
      let minDistance = 55;

      const checkItemSides = (itemId: string, bbox: { x: number; y: number; width: number; height: number }) => {
        if (itemId === activeConnectorDragRef.current?.fromItemId) return;
        const sides: ConnectorAnchorSide[] = ['top', 'right', 'bottom', 'left'];
        for (const side of sides) {
          const p = getAnchorPointForSide(bbox, side);
          const d = Math.hypot(canvasPos.x - p.x, canvasPos.y - p.y);
          if (d < minDistance) {
            minDistance = d;
            bestCandidate = { itemId, side, point: p };
          }
        }
      };

      for (const img of imagesRef.current) {
        checkItemSides(img.id, { x: img.x, y: img.y, width: img.width, height: img.height });
      }
      for (const shp of shapesRef.current) {
        checkItemSides(shp.id, { x: shp.x, y: shp.y, width: shp.width, height: shp.height });
      }
      for (const txt of canvasTextsRef.current) {
        const lines = txt.text ? txt.text.split('\n') : [''];
        const w = Math.max(80, Math.max(...lines.map((l) => l.length * 12)));
        const h = Math.max(36, lines.length * 32);
        checkItemSides(txt.id, { x: txt.x, y: txt.y, width: w, height: h });
      }
      for (const chk of checklistsRef.current) {
        const w = chk.width || 300;
        const count = chk.hideCompleted ? chk.items.filter((i) => !i.completed).length : chk.items.length;
        const h = 60 + count * 40 + 60;
        checkItemSides(chk.id, { x: chk.x, y: chk.y, width: w, height: h });
      }

      setActiveConnectorDrag((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentPoint: bestCandidate ? bestCandidate.point : canvasPos,
          targetCandidate: bestCandidate,
        };
      });
    };

    const onPointerUp = () => {
      const drag = activeConnectorDragRef.current;
      if (drag) {
        const dist = Math.hypot(drag.currentPoint.x - drag.startPoint.x, drag.currentPoint.y - drag.startPoint.y);
        if (dist > 18) {
          const newConnector: CanvasConnectorItem = {
            id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: {
              itemId: drag.fromItemId,
              side: drag.fromSide,
              x: drag.startPoint.x,
              y: drag.startPoint.y,
            },
            to: drag.targetCandidate
              ? {
                  itemId: drag.targetCandidate.itemId,
                  side: drag.targetCandidate.side,
                  x: drag.targetCandidate.point.x,
                  y: drag.targetCandidate.point.y,
                }
              : {
                  x: drag.currentPoint.x,
                  y: drag.currentPoint.y,
                },
            color: currentColor === '#FAF9F6' ? '#374151' : currentColor || '#374151',
            width: 2.5,
            arrowHead: 'end',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const next = [...connectorsRef.current, newConnector];
          setConnectors(next);
          connectorsRef.current = next;
          pushHistory(
            strokesRef.current,
            thoughtsRef.current,
            canvasTextsRef.current,
            imagesRef.current,
            shapesRef.current,
            checklistsRef.current,
            next
          );
          setSelectedConnectorId(newConnector.id);
          showToast('Flowchart link connected');
        }
      }
      setActiveConnectorDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeConnectorDrag, screenToCanvas, currentColor, pushHistory, showToast]);

  // Selected Connector computation
  const selectedConnector = useMemo(() => {
    if (!selectedConnectorId) return null;
    return connectors.find((c) => c.id === selectedConnectorId) || null;
  }, [selectedConnectorId, connectors]);

  const selectedConnectorMidpoint = useMemo(() => {
    if (!selectedConnector) return null;
    const start = resolveConnectorEndpoint(
      selectedConnector.from,
      images,
      shapes,
      canvasTexts,
      checklists
    );
    const end = resolveConnectorEndpoint(
      selectedConnector.to,
      images,
      shapes,
      canvasTexts,
      checklists
    );
    const { cp1, cp2 } = computeCurvyConnectorControlPoints(start, end);
    const t = 0.5;
    const mx =
      Math.pow(1 - t, 3) * start.x +
      3 * Math.pow(1 - t, 2) * t * cp1.x +
      3 * (1 - t) * Math.pow(t, 2) * cp2.x +
      Math.pow(t, 3) * end.x;
    const my =
      Math.pow(1 - t, 3) * start.y +
      3 * Math.pow(1 - t, 2) * t * cp1.y +
      3 * (1 - t) * Math.pow(t, 2) * cp2.y +
      Math.pow(t, 3) * end.y;
    return { x: mx, y: my };
  }, [selectedConnector, images, shapes, canvasTexts, checklists]);

  // Hit test against connectors on canvas
  const hitTestConnector = useCallback((canvasPt: Point): CanvasConnectorItem | null => {
    for (let i = connectorsRef.current.length - 1; i >= 0; i--) {
      const conn = connectorsRef.current[i];
      const start = resolveConnectorEndpoint(conn.from, imagesRef.current, shapesRef.current, canvasTextsRef.current, checklistsRef.current);
      const end = resolveConnectorEndpoint(conn.to, imagesRef.current, shapesRef.current, canvasTextsRef.current, checklistsRef.current);
      const { cp1, cp2 } = computeCurvyConnectorControlPoints(start, end);

      for (let step = 0; step <= 20; step++) {
        const t = step / 20;
        const x =
          Math.pow(1 - t, 3) * start.x +
          3 * Math.pow(1 - t, 2) * t * cp1.x +
          3 * (1 - t) * Math.pow(t, 2) * cp2.x +
          Math.pow(t, 3) * end.x;
        const y =
          Math.pow(1 - t, 3) * start.y +
          3 * Math.pow(1 - t, 2) * t * cp1.y +
          3 * (1 - t) * Math.pow(t, 2) * cp2.y +
          Math.pow(t, 3) * end.y;
        if (Math.hypot(canvasPt.x - x, canvasPt.y - y) <= 14) {
          return conn;
        }
      }
    }
    return null;
  }, []);

  // Import images from file picker, drag & drop, or clipboard
  const handleImportImageFiles = useCallback(
    (files: FileList | File[]) => {
      const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileList.length === 0) return;

      const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      let offset = 0;

      fileList.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const src = ev.target?.result as string;
          if (!src) return;

          const img = new Image();
          img.onload = () => {
            let w = img.naturalWidth || 380;
            let h = img.naturalHeight || 280;
            const maxDim = 380;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h / w) * maxDim);
                w = maxDim;
              } else {
                w = Math.round((w / h) * maxDim);
                h = maxDim;
              }
            }

            const newImage: CanvasImageItem = {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              src,
              name: file.name,
              x: Math.round(center.x - w / 2 + offset),
              y: Math.round(center.y - h / 2 + offset),
              width: w,
              height: h,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              aspectRatio: (img.naturalWidth || 1) / (img.naturalHeight || 1),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };

            offset += 32;

            setImages((prev) => {
              const next = [...prev, newImage];
              imagesRef.current = next;
              pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, next, shapesRef.current);
              return next;
            });

            setSelectedItem({ type: 'image', item: newImage });
            showToast(`Imported ${file.name}`);
          };
          img.src = src;
        };
        reader.readAsDataURL(file);
      });
    },
    [screenToCanvas, pushHistory, showToast]
  );

  // Add geometric shape, line, arrow, or sticky note
  const handleAddShape = useCallback(
    (type: ShapeType, strokeColor?: string, fillColor?: string) => {
      const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      let w = 220;
      let h = 160;

      if (type === 'circle') {
        w = 180;
        h = 180;
      } else if (type === 'sticky-note') {
        w = 230;
        h = 210;
      } else if (type === 'line' || type === 'arrow') {
        w = 220;
        h = 40;
      } else if (type === 'diamond' || type === 'star') {
        w = 180;
        h = 180;
      }

      const newShape: CanvasShapeItem = {
        id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        x: Math.round(center.x - w / 2),
        y: Math.round(center.y - h / 2),
        width: w,
        height: h,
        strokeColor: strokeColor || currentColor || '#1E1E1E',
        strokeWidth: type === 'sticky-note' ? 1 : strokeWidth || 2,
        fillColor: fillColor || (type === 'sticky-note' ? '#FEF08A' : 'transparent'),
        text: type === 'sticky-note' ? 'Idea note...' : '',
        textColor: '#1E1E1E',
        fontSize: 18,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setShapes((prev) => {
        const next = [...prev, newShape];
        shapesRef.current = next;
        pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, next);
        return next;
      });

      setSelectedItem({ type: 'shape', item: newShape });
      showToast(`Added ${type.replace('-', ' ')}`);
    },
    [screenToCanvas, currentColor, strokeWidth, pushHistory, showToast]
  );

  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleDebouncedSave = useCallback(() => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }
    saveDebounceTimerRef.current = setTimeout(() => {
      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: strokesRef.current,
          thoughts: thoughtsRef.current,
          canvasTexts: canvasTextsRef.current,
          images: imagesRef.current,
          shapes: shapesRef.current,
          checklists: checklistsRef.current,
          viewport: viewportRef.current,
        });
      }
    }, 700);
  }, []);

  // Commit transform immediately on release & push to undo/redo history
  const handleCommitTransform = useCallback(() => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }
    pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, checklistsRef.current);
    if (activeProjectRef.current) {
      autoSaveSingleProject({
        ...activeProjectRef.current,
        strokes: strokesRef.current,
        thoughts: thoughtsRef.current,
        canvasTexts: canvasTextsRef.current,
        images: imagesRef.current,
        shapes: shapesRef.current,
        checklists: checklistsRef.current,
        viewport: viewportRef.current,
      });
    }
  }, [pushHistory]);

  // Add interactive Checklist card to canvas
  const handleAddChecklist = useCallback(() => {
    const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
    const newChecklist: CanvasChecklistItem = {
      id: `checklist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'Tasks & Ideas',
      x: Math.round(center.x - 145),
      y: Math.round(center.y - 100),
      width: 290,
      items: [
        { id: `check-1-${Date.now()}`, text: 'Brainstorm concepts', completed: false },
        { id: `check-2-${Date.now()}`, text: 'Outline architecture', completed: false },
      ],
      hideCompleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const next = [...checklistsRef.current, newChecklist];
    setChecklists(next);
    checklistsRef.current = next;
    pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, next);
    showToast('Checklist added to canvas');
  }, [screenToCanvas, pushHistory, showToast]);

  const handleUpdateChecklist = useCallback((updated: CanvasChecklistItem) => {
    setChecklists((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      checklistsRef.current = next;
      return next;
    });
    if (activeProjectRef.current) {
      autoSaveSingleProject({
        ...activeProjectRef.current,
        strokes: strokesRef.current,
        thoughts: thoughtsRef.current,
        canvasTexts: canvasTextsRef.current,
        images: imagesRef.current,
        shapes: shapesRef.current,
        checklists: checklistsRef.current,
        viewport: viewportRef.current,
      });
    }
  }, []);

  const handleDeleteChecklist = useCallback((id: string) => {
    const next = checklistsRef.current.filter((c) => c.id !== id);
    setChecklists(next);
    checklistsRef.current = next;
    pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, next);
    showToast('Checklist deleted');
  }, [pushHistory, showToast]);

  const handleChecklistDragStart = useCallback((checklistId: string, clientX: number, clientY: number) => {
    const target = checklistsRef.current.find((c) => c.id === checklistId);
    if (!target) return;

    const startX = clientX;
    const startY = clientY;
    const startCardX = target.x;
    const startCardY = target.y;

    const onPointerMove = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / viewportRef.current.zoom;
      const dy = (e.clientY - startY) / viewportRef.current.zoom;
      const newX = Math.round(startCardX + dx);
      const newY = Math.round(startCardY + dy);
      setChecklists((prev) => {
        const updated = prev.map((c) => (c.id === checklistId ? { ...c, x: newX, y: newY } : c));
        checklistsRef.current = updated;
        return updated;
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, checklistsRef.current);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [pushHistory]);

  // Zoom to Fit All content on the canvas
  const handleFitToContent = useCallback(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const s of strokesRef.current) {
      if (s.bounds) {
        if (s.bounds.minX < minX) minX = s.bounds.minX;
        if (s.bounds.minY < minY) minY = s.bounds.minY;
        if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
        if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
      }
    }

    for (const shp of shapesRef.current) {
      if (shp.x < minX) minX = shp.x;
      if (shp.y < minY) minY = shp.y;
      if (shp.x + shp.width > maxX) maxX = shp.x + shp.width;
      if (shp.y + shp.height > maxY) maxY = shp.y + shp.height;
    }

    for (const chk of checklistsRef.current) {
      if (chk.x < minX) minX = chk.x;
      if (chk.y < minY) minY = chk.y;
      if (chk.x + (chk.width || 300) > maxX) maxX = chk.x + (chk.width || 300);
      if (chk.y + 240 > maxY) maxY = chk.y + 240;
    }

    for (const img of imagesRef.current) {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    }

    for (const txt of canvasTextsRef.current) {
      if (txt.x < minX) minX = txt.x;
      if (txt.y < minY) minY = txt.y;
      if (txt.x + 200 > maxX) maxX = txt.x + 200;
      if (txt.y + 100 > maxY) maxY = txt.y + 100;
    }

    if (!isFinite(minX) || !isFinite(minY)) {
      setViewport({ x: 200, y: 150, zoom: 1 });
      showToast('Centered on canvas');
      return;
    }

    const padding = 100;
    const contentW = Math.max(120, maxX - minX);
    const contentH = Math.max(120, maxY - minY);

    const zoom = Math.min(
      2.0,
      Math.max(
        0.2,
        Math.min(
          (window.innerWidth - padding * 2) / contentW,
          (window.innerHeight - padding * 2) / contentH
        )
      )
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const targetX = window.innerWidth / 2 - centerX * zoom;
    const targetY = window.innerHeight / 2 - centerY * zoom;

    setViewport({
      x: Math.round(targetX),
      y: Math.round(targetY),
      zoom,
    });
    showToast('Fitted all content to screen');
  }, [showToast]);

  // Update image position / size (zero lag, throttled by overlay RAF, debounced storage)
  const handleUpdateImage = useCallback((updated: CanvasImageItem) => {
    imagesRef.current = imagesRef.current.map((img) => (img.id === updated.id ? updated : img));
    setImages(imagesRef.current);
    setSelectedItem((prev) =>
      prev && prev.type === 'image' && prev.item.id === updated.id ? { type: 'image', item: updated } : prev
    );
    scheduleDebouncedSave();
  }, [scheduleDebouncedSave]);

  // Update shape position / size / color / text
  const handleUpdateShape = useCallback((updated: CanvasShapeItem) => {
    shapesRef.current = shapesRef.current.map((shp) => (shp.id === updated.id ? updated : shp));
    setShapes(shapesRef.current);
    setSelectedItem((prev) =>
      prev && prev.type === 'shape' && prev.item.id === updated.id ? { type: 'shape', item: updated } : prev
    );
    scheduleDebouncedSave();
  }, [scheduleDebouncedSave]);

  // Update text item position / size
  const handleUpdateText = useCallback((updated: CanvasTextItem) => {
    canvasTextsRef.current = canvasTextsRef.current.map((txt) => (txt.id === updated.id ? updated : txt));
    setCanvasTexts(canvasTextsRef.current);
    setSelectedItem((prev) =>
      prev && prev.type === 'text' && prev.item.id === updated.id ? { type: 'text', item: updated } : prev
    );
    scheduleDebouncedSave();
  }, [scheduleDebouncedSave]);

  // Dynamic auto-grow for active text note input (prevents characters from cutting off on mobile and desktop)
  const autoResizeActiveTextarea = useCallback(() => {
    const el = activeInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(34 * viewportRef.current.zoom, el.scrollHeight)}px`;
  }, []);

  // Edit text note: clear transform selection and focus active input
  const handleEditText = useCallback(
    (textId: string) => {
      setSelectedSentences([]);
      setSelectedItem(null);
      setActiveTextId(textId);
      setTimeout(() => {
        activeInputRef.current?.focus();
        autoResizeActiveTextarea();
      }, 40);
    },
    [autoResizeActiveTextarea]
  );

  // Delete item from canvas
  const handleDeleteItem = useCallback(
    (id: string, type: 'image' | 'shape' | 'text') => {
      // Also clean up any connectors linked to this item
      const cleanedConnectors = connectorsRef.current.filter(
        (c) => c.from.itemId !== id && c.to.itemId !== id
      );
      if (cleanedConnectors.length !== connectorsRef.current.length) {
        setConnectors(cleanedConnectors);
        connectorsRef.current = cleanedConnectors;
      }

      if (type === 'image') {
        setImages((prev) => {
          const next = prev.filter((i) => i.id !== id);
          imagesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, next, shapesRef.current, checklistsRef.current, cleanedConnectors);
          return next;
        });
        setSelectedItem(null);
        showToast('Deleted image');
      } else if (type === 'shape') {
        setShapes((prev) => {
          const next = prev.filter((s) => s.id !== id);
          shapesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, next, checklistsRef.current, cleanedConnectors);
          return next;
        });
        setSelectedItem(null);
        showToast('Deleted item');
      } else if (type === 'text') {
        setCanvasTexts((prev) => {
          const next = prev.filter((t) => t.id !== id);
          canvasTextsRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, next, imagesRef.current, shapesRef.current, checklistsRef.current, cleanedConnectors);
          return next;
        });
        setSelectedItem(null);
        showToast('Deleted text');
      }
    },
    [pushHistory, showToast]
  );

  // Duplicate item
  const handleDuplicateItem = useCallback(
    (selected: SelectedCanvasItem) => {
      const offset = 28;
      if (selected.type === 'image') {
        const orig = selected.item;
        const duplicated: CanvasImageItem = {
          ...orig,
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: orig.x + offset,
          y: orig.y + offset,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setImages((prev) => {
          const next = [...prev, duplicated];
          imagesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, next, shapesRef.current);
          return next;
        });
        setSelectedItem({ type: 'image', item: duplicated });
        showToast('Duplicated image');
      } else if (selected.type === 'shape') {
        const orig = selected.item;
        const duplicated: CanvasShapeItem = {
          ...orig,
          id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: orig.x + offset,
          y: orig.y + offset,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setShapes((prev) => {
          const next = [...prev, duplicated];
          shapesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, next);
          return next;
        });
        setSelectedItem({ type: 'shape', item: duplicated });
        showToast('Duplicated item');
      } else if (selected.type === 'text') {
        const orig = selected.item;
        const duplicated: CanvasTextItem = {
          ...orig,
          id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: orig.x + offset,
          y: orig.y + offset,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setCanvasTexts((prev) => {
          const next = [...prev, duplicated];
          canvasTextsRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, next, imagesRef.current, shapesRef.current);
          return next;
        });
        setSelectedItem({ type: 'text', item: duplicated });
        showToast('Duplicated text');
      }
    },
    [pushHistory, showToast]
  );

  // Gemini Vision AI Analysis on Imported Images
  const handleAnalyzeImage = useCallback(
    async (imageItem: CanvasImageItem, mode: 'describe' | 'ocr' | 'brainstorm' = 'describe') => {
      setIsAnalyzingImage(true);
      const modeLabel =
        mode === 'ocr' ? 'handwriting & text OCR' : mode === 'brainstorm' ? 'creative brainstorming' : 'visual analysis';
      showToast(`Gemini Vision analyzing ${modeLabel}...`);

      try {
        const res = await fetch('/api/gemini/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageItem.src,
            mode,
            prompt:
              mode === 'ocr'
                ? 'Extract and transcribe all handwritten text, typed text, equations, and diagrams found in this image accurately.'
                : mode === 'brainstorm'
                ? 'Generate actionable, creative insights, next steps, and thought questions based on this image.'
                : 'Analyze this image thoroughly with key observations and conceptual summary.',
          }),
        });

        if (!res.ok) {
          throw new Error(`Vision API error: ${res.status}`);
        }

        const data = await res.json();
        const rawText = data.text || data.fallbackText;
        const resultText = cleanAiOutput(rawText);

        if (resultText && resultText.trim()) {
          const spawnX = imageItem.x + imageItem.width + 40;
          const spawnY = imageItem.y;
          const layout = layoutHandwrittenText(resultText, spawnX, spawnY);

          const thoughtId = `thought-vision-${Date.now()}`;
          const newThought: AIThought = {
            id: thoughtId,
            x: spawnX,
            y: spawnY,
            status: 'writing',
            prompt: `Vision (${mode}): ${imageItem.name || 'Image'}`,
            text: resultText,
            sentences: layout.sentences,
            revealedCount: 0,
            writingStartTime: Date.now(),
            color: '#1E3A8A',
            fontFamily: 'Kalam',
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            bounds: layout.totalBounds,
          };

          setThoughts((prev) => [...prev, newThought]);
          thoughtsRef.current = [...thoughtsRef.current, newThought];
          setActiveThoughtId(thoughtId);
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current);
          showToast(data.fallback ? 'Vision summary placed on canvas (high demand fallback)' : 'Vision thought placed on canvas');
        } else {
          showToast('Could not extract text from image');
        }
      } catch (err) {
        console.error('Vision analysis error:', err);
        showToast('Vision analysis could not be completed. Please try again.');
      } finally {
        setIsAnalyzingImage(false);
      }
    },
    [pushHistory, showToast]
  );

  // Download complete canvas JSON backup
  const handleExportJSON = useCallback(() => {
    const data = {
      title: activeProject?.title || 'Untitled Note',
      createdAt: activeProject?.createdAt || Date.now(),
      updatedAt: Date.now(),
      strokes,
      thoughts,
      canvasTexts,
      images,
      shapes,
      viewport,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeProject?.title || 'note').toLowerCase().replace(/\s+/g, '-')}-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Canvas Data Downloaded');
  }, [activeProject, strokes, thoughts, canvasTexts, images, shapes, viewport, showToast]);

  // Drag and drop image files onto canvas
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleImportImageFiles(e.dataTransfer.files);
      }
    },
    [handleImportImageFiles]
  );

  // Support pasting copied text or images from outside at any time directly onto the canvas
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If user is currently typing in an active input/textarea, allow native browser paste inside the input!
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Check for image in clipboard
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleImportImageFiles([file]);
              return;
            }
          }
        }
      }

      const pastedText = e.clipboardData?.getData('text/plain');
      if (!pastedText || !pastedText.trim()) return;

      e.preventDefault();

      // Paste at center of current view
      const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      const newTextId = `text-pasted-${Date.now()}`;
      const newItem: CanvasTextItem = {
        id: newTextId,
        text: pastedText,
        x: Math.round(center.x - 140),
        y: Math.round(center.y - 40),
        color: currentColor || '#1E1E1E',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedTexts = [...canvasTextsRef.current, newItem];
      setCanvasTexts(updatedTexts);
      canvasTextsRef.current = updatedTexts;
      pushHistory(strokesRef.current, thoughtsRef.current, updatedTexts, imagesRef.current, shapesRef.current);
      showToast('Pasted note to canvas');
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [screenToCanvas, currentColor, pushHistory, showToast, handleImportImageFiles]);

  // Jump/Focus to Thought
  const handleFocusThought = useCallback(() => {
    if (!offScreenBubble.targetCanvasX) return;
    const targetScreenCenterX = window.innerWidth / 2;
    const targetScreenCenterY = window.innerHeight / 2;

    setViewport((prev) => ({
      ...prev,
      x: targetScreenCenterX - offScreenBubble.targetCanvasX * prev.zoom,
      y: targetScreenCenterY - offScreenBubble.targetCanvasY * prev.zoom,
    }));
  }, [offScreenBubble]);

  // Trigger AI Assistant (Brainstorm response in organic handwriting with sequential readable fade-in)
  const triggerAssistantResponse = useCallback(
    async (targetPoint?: { x: number; y: number }, customPrompt?: string) => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
      const textsWithContent = canvasTextsRef.current.filter((t) => t.text && t.text.trim());
      const activeTextItem = activeTextId
        ? canvasTextsRef.current.find((t) => t.id === activeTextId && t.text.trim())
        : null;
      const targetText = activeTextItem || (textsWithContent.length > 0 ? textsWithContent[textsWithContent.length - 1] : null);

      if (!customPrompt && targetText) {
        customPrompt = targetText.text;
      }

      // Calculate mathematically guaranteed collision-free spawn position that accounts for long wrapped text
      const freeSpawn = findCollisionFreeAssistantSpawn(
        targetText,
        canvasTextsRef.current,
        thoughtsRef.current,
        strokesRef.current,
        center
      );

      let spawnX = targetPoint?.x !== undefined ? targetPoint.x : freeSpawn.x;
      let spawnY = targetPoint?.y !== undefined ? targetPoint.y : freeSpawn.y;

      // If a target point was explicitly provided, ensure it still clears the full visual height of targetText
      if (targetText && targetText.text && targetText.text.trim()) {
        const tBounds = calculateCanvasTextBounds(targetText.text, targetText.x, targetText.y);
        if (spawnY < tBounds.maxY + 24) {
          spawnY = tBounds.maxY + 36;
        }
      }

      // Smoothly pan canvas if needed to keep newly writing thought within comfortable view
      const currentViewport = viewportRef.current;
      const screenY = spawnY * currentViewport.zoom + currentViewport.y;
      if (screenY > window.innerHeight - 220 || screenY < 80) {
        setViewport((prev) => ({
          ...prev,
          y: Math.min(prev.y, window.innerHeight * 0.45 - spawnY * prev.zoom),
        }));
      }

      const thoughtId = `thought-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newThought: AIThought = {
        id: thoughtId,
        x: spawnX,
        y: spawnY,
        status: 'thinking',
        prompt: customPrompt || 'Assistant expanding thoughts...',
        text: '',
        sentences: [],
        revealedCount: 0,
        color: currentColor === '#1E1E1E' ? '#1E3A8A' : currentColor,
        fontFamily: 'Kalam',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        bounds: { minX: spawnX, minY: spawnY, maxX: spawnX + 160, maxY: spawnY + 40 },
      };

      setThoughts((prev) => [...prev, newThought]);
      setActiveThoughtId(thoughtId);

      if (isOffline) {
        showToast('Assistant writing (On-Device Offline Mode)...');
      } else {
        showToast('Assistant pondering thought...');
      }

      const requestStartTime = Date.now();

      // Gather ongoing conversation and canvas notes context
      const conversationHistory = thoughtsRef.current
        .filter((t) => t.text && t.text.trim())
        .map((t) => ({
          prompt: t.prompt,
          response: t.text,
        }));
      const textNotesContext = canvasTextsRef.current.map((t) => t.text).join(' \n ');
      const thoughtsContext = thoughtsRef.current.map((t) => t.text).join(' \n ');
      const contextSnippet = `${textNotesContext}\n${thoughtsContext}`.trim();

      let textResult = '';

      if (!isOffline) {
        try {
          const res = await fetch('/api/gemini/assist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: customPrompt || (conversationHistory.length > 0 ? 'Continue this note thought.' : 'Expand on my current notes and continue organic brainstorming.'),
              canvasContext: contextSnippet,
              conversationHistory,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            textResult = data.text || data.fallbackText || '';
          }
        } catch (netErr) {
          console.warn('Network assist call failed, falling back to on-device offline intelligence:', netErr);
        }
      }

      // If offline or network request failed, check for on-device local model
      if (!textResult || !textResult.trim()) {
        const offlineRes = await generateOfflineAssistantThought(
          customPrompt || (conversationHistory.length > 0 ? 'Continue this note thought.' : 'Expand on notes.'),
          contextSnippet
        );
        if (offlineRes.success && offlineRes.text) {
          textResult = offlineRes.text;
        } else {
          // Remove the temporary thinking indicator and inform the user
          setThoughts((prev) => prev.filter((t) => t.id !== thoughtId));
          setActiveThoughtId(null);
          showToast('Offline: Reconnect to internet for Gemini AI answers. Notes are saved safely.');
          return;
        }
      }

      // Natural human contemplation pause before picking up the pen to write
      const elapsedSinceRequest = Date.now() - requestStartTime;
      const remainingThinkingTime = Math.max(0, 2400 - elapsedSinceRequest);
      if (remainingThinkingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingThinkingTime));
      }

      const sanitizedResult = cleanAiOutput(textResult);
      const layout = layoutHandwrittenText(sanitizedResult, spawnX, spawnY);
      const writingStartTime = Date.now();

      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thoughtId
            ? {
                ...t,
                status: 'writing' as const,
                text: textResult,
                sentences: layout.sentences,
                bounds: layout.totalBounds,
                revealedCount: textResult.length,
                writingStartTime,
              }
            : t
        )
      );

      // Sequential fade-in timing: sentences smoothly reveal one by one at a calm, readable pace (~1900ms per sentence)
      const totalWritingDuration = Math.max(2400, (layout.sentences.length - 1) * 1900 + 1600);
      setTimeout(() => {
        setThoughts((prev) => {
          const updated = prev.map((t) =>
            t.id === thoughtId ? { ...t, status: 'completed' as const } : t
          );
          pushHistory(strokesRef.current, updated, canvasTextsRef.current);
          return updated;
        });
        // When done typing, dismiss the active thought bubble
        setActiveThoughtId((prev) => (prev === thoughtId ? null : prev));
      }, totalWritingDuration);
    },
    [currentColor, screenToCanvas, showToast, pushHistory, activeTextId]
  );

  // Trigger AI Assistant directly from dock or shortcut (placed cleanly below existing text)
  const handleTriggerAssistant = useCallback(() => {
    const textsWithContent = canvasTextsRef.current.filter((t) => t.text && t.text.trim());
    const activeTextItem = activeTextId
      ? canvasTextsRef.current.find((t) => t.id === activeTextId && t.text.trim())
      : null;
    const targetText = activeTextItem || (textsWithContent.length > 0 ? textsWithContent[textsWithContent.length - 1] : null);

    if (targetText) {
      triggerAssistantResponse(undefined, targetText.text);
    } else {
      triggerAssistantResponse();
    }
  }, [activeTextId, triggerAssistantResponse]);

  // Hit test against Canvas Text Items
  const hitTestText = useCallback((pos: Point): CanvasTextItem | null => {
    for (let i = canvasTextsRef.current.length - 1; i >= 0; i--) {
      const txt = canvasTextsRef.current[i];
      if (!txt.text) continue;
      const bounds = calculateCanvasTextBounds(txt.text, txt.x, txt.y, txt.width || 640);
      const pad = 12;
      if (
        pos.x >= bounds.minX - pad &&
        pos.x <= bounds.maxX + pad &&
        pos.y >= bounds.minY - pad &&
        pos.y <= bounds.maxY + pad
      ) {
        return txt;
      }
    }
    return null;
  }, []);

  // Hit test against Images
  const hitTestImage = useCallback((pos: Point): CanvasImageItem | null => {
    for (let i = imagesRef.current.length - 1; i >= 0; i--) {
      const img = imagesRef.current[i];
      const pad = 6;
      if (
        pos.x >= img.x - pad &&
        pos.x <= img.x + img.width + pad &&
        pos.y >= img.y - pad &&
        pos.y <= img.y + img.height + pad
      ) {
        return img;
      }
    }
    return null;
  }, []);

  // Hit test against Shapes and Sticky Notes
  const hitTestShape = useCallback((pos: Point): CanvasShapeItem | null => {
    for (let i = shapesRef.current.length - 1; i >= 0; i--) {
      const shp = shapesRef.current[i];
      const minX = Math.min(shp.x, shp.x + shp.width);
      const maxX = Math.max(shp.x, shp.x + shp.width);
      const minY = Math.min(shp.y, shp.y + shp.height);
      const maxY = Math.max(shp.y, shp.y + shp.height);
      const pad = shp.type === 'line' || shp.type === 'arrow' ? 20 : 6;
      if (
        pos.x >= minX - pad &&
        pos.x <= maxX + pad &&
        pos.y >= minY - pad &&
        pos.y <= maxY + pad
      ) {
        return shp;
      }
    }
    return null;
  }, []);

  // Tap on canvas to select items, position cursor, or edit text
  const handleCanvasTapToType = useCallback(
    (clientX: number, clientY: number) => {
      const canvasPos = screenToCanvas(clientX, clientY);

      // Check if user clicked an Image
      const clickedImage = hitTestImage(canvasPos);
      if (clickedImage) {
        setSelectedItem({ type: 'image', item: clickedImage });
        setActiveTextId(null);
        return;
      }

      // Check if user clicked a Shape or Sticky Note
      const clickedShape = hitTestShape(canvasPos);
      if (clickedShape) {
        setSelectedItem({ type: 'shape', item: clickedShape });
        setActiveTextId(null);
        return;
      }

      // Check if user clicked a Checklist Card
      const clickedChecklist = checklistsRef.current.find((chk) => {
        const w = chk.width || 300;
        const count = chk.hideCompleted ? chk.items.filter((i) => !i.completed).length : chk.items.length;
        const h = 60 + count * 40 + 60;
        return (
          canvasPos.x >= chk.x - 10 &&
          canvasPos.x <= chk.x + w + 10 &&
          canvasPos.y >= chk.y - 10 &&
          canvasPos.y <= chk.y + h
        );
      });

      if (clickedChecklist) {
        setActiveTextId(null);
        return;
      }

      // Check if user clicked an existing text item
      const clickedItem = hitTestText(canvasPos);
      if (clickedItem) {
        if (currentTool === 'select') {
          setSelectedItem({ type: 'text', item: clickedItem });
          setActiveTextId(null);
        } else {
          setActiveTextId(clickedItem.id);
          setSelectedItem(null);
          setTimeout(() => {
            activeInputRef.current?.focus();
          }, 30);
        }
        return;
      }

      // Create new text block with normal blinking vertical line
      const newId = `text-${Date.now()}`;
      const newItem: CanvasTextItem = {
        id: newId,
        text: '',
        x: Math.round(canvasPos.x),
        y: Math.round(canvasPos.y),
        color: currentColor || '#1E1E1E',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const cleaned = canvasTextsRef.current.filter((t) => t.text && t.text.trim().length > 0);
      const updated = [...cleaned, newItem];
      setCanvasTexts(updated);
      canvasTextsRef.current = updated;
      pushHistory(strokesRef.current, thoughtsRef.current, updated, imagesRef.current, shapesRef.current);
      setActiveTextId(newId);
      setSelectedItem(null);
      setSelectedSentences([]);

      setTimeout(() => {
        activeInputRef.current?.focus();
      }, 40);
    },
    [screenToCanvas, hitTestImage, hitTestShape, hitTestText, currentColor, pushHistory, currentTool]
  );

  // Cache wrapped lines for canvas text items to eliminate measureText recalculation on every frame
  const textWrapCacheRef = useRef<Map<string, string[]>>(new Map());

  // Clear text wrapping cache when web fonts finish loading so measureText uses real Kalam glyph metrics
  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        textWrapCacheRef.current.clear();
      });
    }
  }, []);

  useEffect(() => {
    autoResizeActiveTextarea();
  }, [activeTextId, autoResizeActiveTextarea]);

  // Update text for currently active typing item with real-time dynamic auto-growth
  const handleUpdateActiveText = useCallback(
    (newText: string) => {
      if (!activeTextId) return;
      // Invalidate wrap cache for this text item
      for (const key of textWrapCacheRef.current.keys()) {
        if (key.startsWith(`${activeTextId}:`)) {
          textWrapCacheRef.current.delete(key);
        }
      }
      setCanvasTexts((prev) => {
        const updated = prev.map((t) => (t.id === activeTextId ? { ...t, text: newText, updatedAt: Date.now() } : t));
        canvasTextsRef.current = updated;
        return updated;
      });
      requestAnimationFrame(() => {
        autoResizeActiveTextarea();
      });
    },
    [activeTextId, autoResizeActiveTextarea]
  );

  // Blur/finish typing
  const handleBlurActiveText = useCallback(
    (e?: React.FocusEvent) => {
      if (isDraggingActiveTextRef.current || isInteractingWithMoveHandleRef.current) return;
      if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('#canvas-active-text-wrapper')) {
        return;
      }
      setCanvasTexts((prev) => {
        const activeItem = prev.find((t) => t.id === activeTextId);
        let updated = prev;
        if (activeItem && !activeItem.text.trim()) {
          updated = prev.filter((t) => t.id !== activeTextId);
        }
        canvasTextsRef.current = updated;
        pushHistory(strokesRef.current, thoughtsRef.current, updated);
        return updated;
      });
      setActiveTextId(null);
    },
    [activeTextId, pushHistory]
  );

  // Start dragging active text from the Move handle
  const handleActiveTextMoveStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isInteractingWithMoveHandleRef.current = true;
      const currentActiveText = canvasTextsRef.current.find((t) => t.id === activeTextId);
      if (!currentActiveText) return;

      activeTextDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        itemX: currentActiveText.x,
        itemY: currentActiveText.y,
        textId: currentActiveText.id,
        hasMoved: false,
      };
      isDraggingActiveTextRef.current = true;
      setIsDraggingActiveText(true);

      try {
        if (e.currentTarget && typeof (e.currentTarget as HTMLElement).setPointerCapture === 'function') {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
      } catch (_) {}
    },
    [activeTextId]
  );

  // 120Hz window pointer listeners for moving active text seamlessly across any screen boundary
  useEffect(() => {
    if (!isDraggingActiveText) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const drag = activeTextDragRef.current;
      if (!drag) return;

      const dx = (e.clientX - drag.startX) / viewportRef.current.zoom;
      const dy = (e.clientY - drag.startY) / viewportRef.current.zoom;

      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3) {
        drag.hasMoved = true;
      }

      const newX = Math.round(drag.itemX + dx);
      const newY = Math.round(drag.itemY + dy);

      canvasTextsRef.current = canvasTextsRef.current.map((t) =>
        t.id === drag.textId ? { ...t, x: newX, y: newY } : t
      );
      setCanvasTexts([...canvasTextsRef.current]);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const drag = activeTextDragRef.current;
      if (drag) {
        if (drag.hasMoved) {
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current);
          scheduleDebouncedSave();
        }
        activeTextDragRef.current = null;
        isDraggingActiveTextRef.current = false;
        setIsDraggingActiveText(false);
        setTimeout(() => {
          isInteractingWithMoveHandleRef.current = false;
        }, 140);

        // Keep textarea focused so user can smoothly resume typing
        setTimeout(() => {
          activeInputRef.current?.focus();
        }, 30);
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [isDraggingActiveText, pushHistory, scheduleDebouncedSave]);

  // Double-tap or Click/Drag Detection to select sentence for unobtrusive copy (AI thoughts only, never canvas texts)
  const handleSentenceSelectAtCanvasPoint = useCallback(
    (canvasPos: Point): boolean => {
      // Hit test AI thoughts
      for (const thought of thoughts) {
        for (const sentence of thought.sentences) {
          const padding = 12;
          if (
            canvasPos.x >= sentence.x - padding &&
            canvasPos.x <= sentence.x + sentence.width + padding &&
            canvasPos.y >= sentence.y - padding &&
            canvasPos.y <= sentence.y + sentence.height + padding
          ) {
            setSelectedSentences((prev) => {
              const exists = prev.some((s) => s.id === sentence.id);
              if (exists) {
                return prev.filter((s) => s.id !== sentence.id);
              } else {
                return [...prev, sentence];
              }
            });
            return true;
          }
        }
      }

      return false;
    },
    [thoughts]
  );

  // Copy selected sentences as clean plain text
  const handleCopySelectedText = useCallback(() => {
    if (selectedSentences.length === 0) return;
    const textToCopy = selectedSentences.map((s) => s.text.trim()).join(' ');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      showToast('Copied');
      setTimeout(() => {
        setIsCopied(false);
      }, 1500);
    });
  }, [selectedSentences, showToast]);

  // Main Canvas Rendering Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // High-performance double-buffered 2D canvas context
    const ctx = canvas.getContext('2d', { alpha: false });
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

    // Use latest viewport from ref for zero-latency 60/120fps hardware canvas rendering
    const v = viewportRef.current;

    // Canvas Background
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // High-performance hardware blit dot grid (avoids thousands of path/arc allocations per frame)
    const dotSpacing = 28 * v.zoom;
    if (dotSpacing >= 10 && dotSpacing <= 320) {
      const startX = ((v.x % dotSpacing) + dotSpacing) % dotSpacing;
      const startY = ((v.y % dotSpacing) + dotSpacing) % dotSpacing;
      const dotSize = Math.max(1, Math.min(2.0, 1.2 * v.zoom));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
      for (let x = startX; x < width; x += dotSpacing) {
        for (let y = startY; y < height; y += dotSpacing) {
          ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        }
      }
    }

    // Apply Viewport Transform
    ctx.translate(v.x, v.y);
    ctx.scale(v.zoom, v.zoom);

    // Full-state filtering during Time Machine playback
    const visibleShapes = isTimeMachineOpen && timeMachineVisibleSet ? shapes.filter((s) => timeMachineVisibleSet.has(s.id)) : shapes;
    const visibleImages = isTimeMachineOpen && timeMachineVisibleSet ? images.filter((i) => timeMachineVisibleSet.has(i.id)) : images;
    const visibleStrokes = isTimeMachineOpen && timeMachineVisibleSet ? strokes.filter((s) => timeMachineVisibleSet.has(s.id)) : strokes;
    const visibleTexts = isTimeMachineOpen && timeMachineVisibleSet ? canvasTexts.filter((t) => timeMachineVisibleSet.has(t.id)) : canvasTexts;
    const visibleThoughts = isTimeMachineOpen && timeMachineVisibleSet ? thoughts.filter((th) => timeMachineVisibleSet.has(th.id)) : thoughts;
    const visibleConnectors = isTimeMachineOpen && timeMachineVisibleSet ? connectors.filter((c) => timeMachineVisibleSet.has(c.id)) : connectors;

    // 0. Draw Shapes & Sticky Notes (bottom layer)
    for (const shape of visibleShapes) {
      drawCanvasShape(ctx, shape);
    }

    // 0.5 Draw Imported Canvas Images (lightweight crisp border, zero GPU blur pipeline stall)
    for (const imgItem of visibleImages) {
      let cached = imageCacheRef.current.get(imgItem.src);
      if (!cached) {
        cached = new Image();
        cached.crossOrigin = 'anonymous';
        cached.src = imgItem.src;
        imageCacheRef.current.set(imgItem.src, cached);
      }
      if (cached.complete && cached.naturalWidth > 0) {
        ctx.drawImage(cached, imgItem.x, imgItem.y, imgItem.width, imgItem.height);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(imgItem.x, imgItem.y, imgItem.width, imgItem.height);
      }
    }

    // 1. Draw Saved Strokes (Filtered chronologically during Time Machine replay)
    for (const stroke of visibleStrokes) {
      drawSmoothStroke(ctx, stroke);
    }

    // 2. Draw Currently Active Drawing Stroke
    if (isDrawingRef.current && currentStrokeRef.current.length > 0) {
      const effectiveTool = isStylusEraserRef.current ? 'eraser' : currentTool;
      const activeStroke: Stroke = {
        id: 'active',
        points: currentStrokeRef.current,
        color: currentColor,
        width: strokeWidth,
        tool: effectiveTool,
        timestamp: Date.now(),
        bounds: calculateStrokeBounds(currentStrokeRef.current),
      };

      if (effectiveTool === 'eraser') {
        // Draw active eraser halo at stylus tip
        const lastP = currentStrokeRef.current[currentStrokeRef.current.length - 1];
        if (lastP) {
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(lastP.x, lastP.y, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        drawSmoothStroke(ctx, activeStroke);
      }
    }

    // 2.5 Draw Typed Canvas Text Items (in the exact same handwriting font Kalam/Caveat with cached line wrapping)
    for (const item of visibleTexts) {
      if (item.id === activeTextId) continue; // Rendered live in textarea overlay with blinking cursor
      if (!item.text || !item.text.trim()) continue;

      ctx.save();
      ctx.font = '500 22px "Kalam", "Caveat", cursive';
      ctx.fillStyle = item.color || '#1E1E1E';
      ctx.textBaseline = 'top';

      const maxLineWidth = item.width || 640;
      const cacheKey = `${item.id}:${item.text}:${maxLineWidth}`;
      let wrappedLines = textWrapCacheRef.current.get(cacheKey);

      if (!wrappedLines) {
        wrappedLines = [];
        const rawLines = item.text.split('\n');
        for (const rLine of rawLines) {
          if (!rLine) {
            wrappedLines.push('');
            continue;
          }
          const words = rLine.split(/\s+/);
          let currentLine = words[0] || '';
          for (let w = 1; w < words.length; w++) {
            const testLine = `${currentLine} ${words[w]}`;
            if (ctx.measureText(testLine).width > maxLineWidth && currentLine.length > 0) {
              wrappedLines.push(currentLine);
              currentLine = words[w];
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine.length > 0) {
            wrappedLines.push(currentLine);
          }
        }
        textWrapCacheRef.current.set(cacheKey, wrappedLines);
      }

      const lineHeight = 32;
      for (let index = 0; index < wrappedLines.length; index++) {
        ctx.fillText(wrappedLines[index], item.x, item.y + index * lineHeight);
      }
      ctx.restore();
    }

    // 3. Draw AI Thoughts (Organic Inner-Self Handwriting overlapping notes)
    for (const thought of visibleThoughts) {
      if (thought.status === 'thinking') {
        const bounceTime = Date.now() / 200;
        const dotY1 = Math.sin(bounceTime) * 4;
        const dotY2 = Math.sin(bounceTime + 1) * 4;
        const dotY3 = Math.sin(bounceTime + 2) * 4;

        ctx.fillStyle = '#1E1E1E';
        // Draw each dot individually with its own beginPath to guarantee no connecting line
        ctx.beginPath();
        ctx.arc(thought.x, thought.y + dotY1, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(thought.x + 12, thought.y + dotY2, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(thought.x + 24, thought.y + dotY3, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = '22px "Kalam", "Caveat", cursive';
        ctx.fillStyle = thought.color || '#222222';
        ctx.textBaseline = 'top';

        const now = Date.now();
        const startTime = thought.writingStartTime || thought.createdAt;

        for (let sIdx = 0; sIdx < thought.sentences.length; sIdx++) {
          const sentence = thought.sentences[sIdx];
          const sentenceDelay = sIdx * 1900; // 1.9s calm stagger between sentences for thoughtful, sequential readability
          const elapsed = now - (startTime + sentenceDelay);

          if (thought.status === 'writing' && elapsed < 0) {
            // Sequential reveal: sentence has not started fading in yet
            continue;
          }

          let alpha = 0.94;
          let offsetY = 0;

          if (thought.status === 'writing') {
            const fadeProgress = Math.min(1, Math.max(0, elapsed / 1300)); // 1.3s gentle organic ink fade-in
            // Smooth ease-out quad
            const eased = 1 - Math.pow(1 - fadeProgress, 2);
            alpha = Math.max(0.04, eased * 0.94);
            offsetY = (1 - eased) * 5; // subtle 5px float into place
          }

          ctx.save();
          ctx.globalAlpha = alpha;

          if (sentence.lines && sentence.lines.length > 0) {
            for (const line of sentence.lines) {
              ctx.fillText(line.text, line.x, line.y + offsetY);
            }
          } else {
            ctx.fillText(sentence.text, sentence.x, sentence.y + offsetY);
          }
          ctx.restore();
        }
      }
    }

    // 4. Draw Curvy Flowchart Connectors
    for (const conn of visibleConnectors) {
      drawCurvyConnector(
        ctx,
        conn,
        images,
        shapes,
        canvasTexts,
        checklists,
        selectedConnectorId === conn.id
      );
    }

    // 4.5 Draw Active Connector Drag Line & Snap Halo
    if (activeConnectorDrag) {
      const start = activeConnectorDrag.startPoint;
      const end = activeConnectorDrag.currentPoint;
      const { cp1, cp2 } = computeCurvyConnectorControlPoints(start, end);

      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      ctx.stroke();

      // Active tip indicator dot
      ctx.setLineDash([]);
      ctx.fillStyle = '#2563EB';
      ctx.beginPath();
      ctx.arc(end.x, end.y, activeConnectorDrag.targetCandidate ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fill();

      if (activeConnectorDrag.targetCandidate) {
        ctx.strokeStyle = '#60A5FA';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }, [
    strokes,
    thoughts,
    canvasTexts,
    images,
    shapes,
    checklists,
    connectors,
    selectedConnectorId,
    activeConnectorDrag,
    activeTextId,
    currentTool,
    currentColor,
    strokeWidth,
    isTimeMachineOpen,
    timeMachineVisibleSet,
  ]);

  // Animation Frame Loop
  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderCanvas();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  // Pointer Enter (Detect S-Pen hover within 15mm above Samsung screen)
  const handlePointerEnter = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') {
      if (!isStylusDetected) {
        setIsStylusDetected(true);
        showToast('S-Pen detected • Palm Rejection active');
      }
      lastPenTimeRef.current = Date.now();
    }
  };

  // Pointer Down (Stylus Pen, Finger Touch, Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Suppress default Android gesture navigation or pull-to-refresh
    if (e.cancelable) e.preventDefault();

    const isStylus = e.pointerType === 'pen';
    const isTouch = e.pointerType === 'touch';

    if (isStylus) {
      if (!isStylusDetected) {
        setIsStylusDetected(true);
      }
      isPenInContactRef.current = true;
      lastPenTimeRef.current = Date.now();
      // Detect Samsung S-Pen barrel button: button 2 or secondary button pressed
      isStylusEraserRef.current = (e.buttons & 2) !== 0 || e.button === 2;
    }

    // STRICT PALM REJECTION:
    // If an S-Pen is physically in contact, OR hovered/drawn within the last 750ms,
    // OR if Palm Rejection is active and stylus is detected, completely reject touch input!
    if (isTouch) {
      const timeSincePen = Date.now() - lastPenTimeRef.current;
      if (isPenInContactRef.current || (isPalmRejectionActive && (isStylusDetected || timeSincePen < 750))) {
        // Discard palm meat contact
        return;
      }
    }

    // Lock pointer capture so Samsung edge-swipe gestures don't abort strokes
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    // Record pointer
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // Multi-touch two-finger detection (Pinch to scale/reduce & move anywhere)
    // NEVER allowed if S-Pen is actively drawing!
    if (!isPenInContactRef.current) {
      const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
      if (touchPointers.length >= 2) {
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          currentStrokeRef.current = [];
          activePointerIdRef.current = null;
        }
        isPanningRef.current = false;

        const p1 = touchPointers[0];
        const p2 = touchPointers[1];
        const initialDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const initialMidpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        twoFingerGestureRef.current = {
          initialDistance: Math.max(initialDistance, 10),
          initialZoom: viewportRef.current.zoom,
          initialMidpoint,
          initialViewport: { ...viewportRef.current },
        };
        return;
      }
    }

    const isMiddleOrRight = e.button === 1 || e.button === 2;
    const screenX = e.clientX;
    const screenY = e.clientY;

    // External mouse middle-click (button 1), right-click (button 2), spacebar held: pan canvas
    if (isMiddleOrRight || isSpaceHeldRef.current) {
      isPanningRef.current = true;
      setIsPanningState(true);
      lastPanPointRef.current = { x: screenX, y: screenY };
      pointerDownPosRef.current = { x: screenX, y: screenY };
      hasDraggedRef.current = false;
      return;
    }

    const canvasPos = screenToCanvas(screenX, screenY);

    const now = Date.now();
    const isDoubleTap =
      now - lastTapTimeRef.current < 450 &&
      Math.hypot(screenX - lastTapPosRef.current.x, screenY - lastTapPosRef.current.y) < 35;

    lastTapTimeRef.current = now;
    lastTapPosRef.current = { x: screenX, y: screenY };
    setLastCanvasTapTime(now);

    const isPenTool = currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser';

    // 1. Double Tap Detection across all elements & canvas
    if (isDoubleTap) {
      // 1a. Double tap on an existing text item: activate typing mode
      const hitTxt = hitTestText(canvasPos);
      if (hitTxt) {
        setSelectedSentences([]);
        setSelectedItem(null);
        setActiveTextId(hitTxt.id);
        setTimeout(() => {
          activeInputRef.current?.focus();
          autoResizeActiveTextarea();
        }, 40);
        return;
      }

      // 1b. Double tap on an image: select it and allow moving immediately
      const hitImg = hitTestImage(canvasPos);
      if (hitImg) {
        setSelectedItem({ type: 'image', item: hitImg });
        directDragItemRef.current = {
          type: 'image',
          id: hitImg.id,
          startClientX: screenX,
          startClientY: screenY,
          startItemX: hitImg.x,
          startItemY: hitImg.y,
        };
        isDirectDraggingItemRef.current = true;
        hasDraggedRef.current = false;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        return;
      }

      // 1c. Double tap on a shape / sticky note: select it and allow moving immediately
      const hitShp = hitTestShape(canvasPos);
      if (hitShp) {
        setSelectedItem({ type: 'shape', item: hitShp });
        directDragItemRef.current = {
          type: 'shape',
          id: hitShp.id,
          startClientX: screenX,
          startClientY: screenY,
          startItemX: hitShp.x,
          startItemY: hitShp.y,
        };
        isDirectDraggingItemRef.current = true;
        hasDraggedRef.current = false;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        return;
      }

      // 1d. Double tap on an AI thought sentence: highlight to copy
      const sentenceHit = handleSentenceSelectAtCanvasPoint(canvasPos);
      if (sentenceHit) {
        return;
      }

      // 1e. Double tap on empty canvas space: start typing text note!
      setSelectedItem(null);
      setSelectedSentences([]);
      setSelectedConnectorId(null);
      handleCanvasTapToType(screenX, screenY);
      return;
    }

    // 2. Direct Non-Pen Canvas Interaction: Hand mode, Select tool, Text tool, Connectors
    if (!isPenTool) {
      // 2a. Hit test against Connectors
      const hitConn = hitTestConnector(canvasPos);
      if (hitConn) {
        setSelectedConnectorId(hitConn.id);
        setSelectedItem(null);
        return;
      } else {
        setSelectedConnectorId(null);
      }

      // 2b. Direct typing if Text tool active
      if (currentTool === 'text') {
        handleCanvasTapToType(screenX, screenY);
        return;
      }

      // 2c. Connector Tool active: initiate drag from under pointer
      if (currentTool === 'connector') {
        const hitShp = hitTestShape(canvasPos);
        const hitImg = hitTestImage(canvasPos);
        const hitTxt = hitTestText(canvasPos);
        const fromId = hitShp ? hitShp.id : hitImg ? hitImg.id : hitTxt ? hitTxt.id : `pt-${Date.now()}`;
        handleStartConnectorDrag(fromId, 'right', canvasPos.x, canvasPos.y);
        return;
      }

      // 2d. Hit test against Images: Single touch selects & enables direct drag-to-move!
      const hitImage = hitTestImage(canvasPos);
      if (hitImage) {
        setSelectedItem({ type: 'image', item: hitImage });
        setActiveTextId(null);
        directDragItemRef.current = {
          type: 'image',
          id: hitImage.id,
          startClientX: screenX,
          startClientY: screenY,
          startItemX: hitImage.x,
          startItemY: hitImage.y,
        };
        isDirectDraggingItemRef.current = true;
        hasDraggedRef.current = false;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        return;
      }

      // 2e. Hit test against Shapes and Sticky Notes: Single touch selects & enables direct drag-to-move!
      const hitShape = hitTestShape(canvasPos);
      if (hitShape) {
        setSelectedItem({ type: 'shape', item: hitShape });
        setActiveTextId(null);
        directDragItemRef.current = {
          type: 'shape',
          id: hitShape.id,
          startClientX: screenX,
          startClientY: screenY,
          startItemX: hitShape.x,
          startItemY: hitShape.y,
        };
        isDirectDraggingItemRef.current = true;
        hasDraggedRef.current = false;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        return;
      }

      // 2f. Hit test against Canvas Text Items:
      // Single touch selects & enables direct drag-to-move (just like images and shapes).
      // Never shows any 'copy' tooltip (copy is in item settings on hold / toolbar).
      const hitText = hitTestText(canvasPos);
      if (hitText) {
        setSelectedSentences([]);
        setSelectedItem({ type: 'text', item: hitText });
        setActiveTextId(null);
        directDragItemRef.current = {
          type: 'text',
          id: hitText.id,
          startClientX: screenX,
          startClientY: screenY,
          startItemX: hitText.x,
          startItemY: hitText.y,
        };
        isDirectDraggingItemRef.current = true;
        hasDraggedRef.current = false;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        return;
      }

      // 2g. Hit test against AI thought sentences: highlight to copy
      const sentenceHit = handleSentenceSelectAtCanvasPoint(canvasPos);
      if (sentenceHit) {
        isTextHighlightDragRef.current = true;
        pointerDownPosRef.current = { x: screenX, y: screenY };
        hasDraggedRef.current = false;
        return;
      }

      // 2h. Empty Canvas Space in Hand mode or any non-drawing mode:
      // Deselect and smoothly pan canvas without needing to switch tools
      if (selectedItem) {
        setSelectedItem(null);
      }
      if (selectedSentences.length > 0) {
        setSelectedSentences([]);
      }
      isPanningRef.current = true;
      setIsPanningState(true);
      lastPanPointRef.current = { x: screenX, y: screenY };
      pointerDownPosRef.current = { x: screenX, y: screenY };
      hasDraggedRef.current = false;
      return;
    }

    // If Palm Rejection is active and stylus is detected, single finger touches pan the canvas instead of drawing
    if (isTouch && isPalmRejectionActive && isStylusDetected) {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: screenX, y: screenY };
      pointerDownPosRef.current = { x: screenX, y: screenY };
      hasDraggedRef.current = false;
      return;
    }

    // Start drawing (with stylus or touch when a pen tool is selected)
    isDrawingRef.current = true;
    activePointerIdRef.current = e.pointerId;

    const pressure =
      isStylus && typeof e.pressure === 'number' && e.pressure > 0
        ? e.pressure
        : isStylus
        ? 0.45
        : 0.5;

    currentStrokeRef.current = [
      {
        x: canvasPos.x,
        y: canvasPos.y,
        pressure,
        time: now,
      },
    ];
  };

  // Pointer Move (with 120Hz-240Hz Coalesced Events from S-Pen Digitizer)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.cancelable) e.preventDefault();

    const isStylus = e.pointerType === 'pen';
    const isTouch = e.pointerType === 'touch';

    if (isStylus) {
      if (!isStylusDetected) setIsStylusDetected(true);
      lastPenTimeRef.current = Date.now();
      if ((e.buttons & 2) !== 0 || e.button === 2) {
        isStylusEraserRef.current = true;
      }
    }

    // Palm rejection on pointermove: ignore palm meat
    if (isTouch) {
      const timeSincePen = Date.now() - lastPenTimeRef.current;
      if (isPenInContactRef.current || (isPalmRejectionActive && (isStylusDetected || timeSincePen < 750))) {
        return;
      }
    }

    // Update active pointers position
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // Handle two-finger pinch-to-scale and move anywhere (only when pen is not in contact)
    if (!isPenInContactRef.current) {
      const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
      if (touchPointers.length >= 2 && twoFingerGestureRef.current) {
        const p1 = touchPointers[0];
        const p2 = touchPointers[1];
        const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const currentMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        const { initialDistance, initialZoom, initialMidpoint, initialViewport } = twoFingerGestureRef.current;
        const scaleRatio = currentDist / initialDistance;
        const newZoom = Math.min(4.5, Math.max(0.18, initialZoom * scaleRatio));

        const focalCanvasX = (initialMidpoint.x - initialViewport.x) / initialViewport.zoom;
        const focalCanvasY = (initialMidpoint.y - initialViewport.y) / initialViewport.zoom;

        const panDx = currentMid.x - initialMidpoint.x;
        const panDy = currentMid.y - initialMidpoint.y;

        const updatedViewport: Viewport = {
          zoom: newZoom,
          x: initialMidpoint.x + panDx - focalCanvasX * newZoom,
          y: initialMidpoint.y + panDy - focalCanvasY * newZoom,
        };

        setViewport(updatedViewport);
        viewportRef.current = updatedViewport;
        return;
      }
    }

    const screenX = e.clientX;
    const screenY = e.clientY;

    // Direct shape, image, or text dragging on canvas
    if (isDirectDraggingItemRef.current && directDragItemRef.current) {
      const info = directDragItemRef.current;
      if (Math.hypot(screenX - pointerDownPosRef.current.x, screenY - pointerDownPosRef.current.y) > 3) {
        hasDraggedRef.current = true;
      }
      const dx = (screenX - info.startClientX) / viewport.zoom;
      const dy = (screenY - info.startClientY) / viewport.zoom;
      const newX = Math.round(info.startItemX + dx);
      const newY = Math.round(info.startItemY + dy);

      if (info.type === 'shape') {
        const updated = shapesRef.current.map((shp) =>
          shp.id === info.id ? { ...shp, x: newX, y: newY } : shp
        );
        shapesRef.current = updated;
        setShapes(updated);
        const currentHit = updated.find((s) => s.id === info.id);
        if (currentHit) {
          setSelectedItem({ type: 'shape', item: currentHit });
        }
      } else if (info.type === 'image') {
        const updated = imagesRef.current.map((img) =>
          img.id === info.id ? { ...img, x: newX, y: newY } : img
        );
        imagesRef.current = updated;
        setImages(updated);
        const currentHit = updated.find((i) => i.id === info.id);
        if (currentHit) {
          setSelectedItem({ type: 'image', item: currentHit });
        }
      } else if (info.type === 'text') {
        const updated = canvasTextsRef.current.map((txt) =>
          txt.id === info.id ? { ...txt, x: newX, y: newY } : txt
        );
        canvasTextsRef.current = updated;
        setCanvasTexts(updated);
        const currentHit = updated.find((t) => t.id === info.id);
        if (currentHit && activeTextId !== info.id) {
          setSelectedItem({ type: 'text', item: currentHit });
        }
      }
      return;
    }

    // Touch and drag across text to highlight/select lines for copying
    if (isTextHighlightDragRef.current) {
      if (Math.hypot(screenX - pointerDownPosRef.current.x, screenY - pointerDownPosRef.current.y) > 8) {
        hasDraggedRef.current = true;
        const canvasPos = screenToCanvas(screenX, screenY);
        handleSentenceSelectAtCanvasPoint(canvasPos);
      }
      return;
    }

    if (isPanningRef.current) {
      const dx = screenX - lastPanPointRef.current.x;
      const dy = screenY - lastPanPointRef.current.y;
      if (Math.hypot(screenX - pointerDownPosRef.current.x, screenY - pointerDownPosRef.current.y) > 6) {
        hasDraggedRef.current = true;
      }
      setViewport((prev) => {
        const nextV = { ...prev, x: prev.x + dx, y: prev.y + dy };
        viewportRef.current = nextV;
        return nextV;
      });
      lastPanPointRef.current = { x: screenX, y: screenY };
      return;
    }

    if (isDrawingRef.current && activePointerIdRef.current === e.pointerId) {
      // Extract high-rate hardware digitizer points via getCoalescedEvents
      const rawEvents: Array<{ clientX: number; clientY: number; pressure?: number; timeStamp?: number }> =
        typeof (e.nativeEvent as any)?.getCoalescedEvents === 'function'
          ? (e.nativeEvent as any).getCoalescedEvents()
          : [e.nativeEvent || e];

      const effectiveTool = isStylusEraserRef.current ? 'eraser' : currentTool;

      for (const ev of rawEvents) {
        const pRaw =
          typeof ev.pressure === 'number' && ev.pressure > 0
            ? ev.pressure
            : isStylus
            ? 0.45
            : 0.5;
        const cPos = screenToCanvas(ev.clientX, ev.clientY);

        currentStrokeRef.current.push({
          x: cPos.x,
          y: cPos.y,
          pressure: pRaw,
          time: ev.timeStamp || Date.now(),
        });

        // Real-time erasure when using eraser tool or pressing S-Pen button
        if (effectiveTool === 'eraser') {
          const eraserRadius = 22;
          setStrokes((prev) =>
            prev.filter(
              (s) =>
                !(
                  cPos.x >= s.bounds.minX - eraserRadius &&
                  cPos.x <= s.bounds.maxX + eraserRadius &&
                  cPos.y >= s.bounds.minY - eraserRadius &&
                  cPos.y <= s.bounds.maxY + eraserRadius
                )
            )
          );
        }
      }
    }
  };

  // Pointer Up & Pointer Cancel
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (e.pointerType === 'pen') {
      isPenInContactRef.current = false;
      lastPenTimeRef.current = Date.now();
    }

    const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
    if (touchPointers.length < 2) {
      twoFingerGestureRef.current = null;
    }

    if (isDirectDraggingItemRef.current) {
      isDirectDraggingItemRef.current = false;
      directDragItemRef.current = null;
      if (hasDraggedRef.current) {
        handleCommitTransform();
      }
      return;
    }

    if (isTextHighlightDragRef.current) {
      isTextHighlightDragRef.current = false;
      return;
    }

    setIsPanningState(false);
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isDrawingRef.current && activePointerIdRef.current === e.pointerId) {
      isDrawingRef.current = false;
      activePointerIdRef.current = null;

      const effectiveTool = isStylusEraserRef.current ? 'eraser' : currentTool;
      isStylusEraserRef.current = false;

      const points = currentStrokeRef.current;
      if (points.length > 0) {
        if (effectiveTool === 'eraser') {
          const eraserRadius = 22;
          setStrokes((prev) => {
            const filtered = prev.filter((s) => {
              for (const p of points) {
                if (
                  p.x >= s.bounds.minX - eraserRadius &&
                  p.x <= s.bounds.maxX + eraserRadius &&
                  p.y >= s.bounds.minY - eraserRadius &&
                  p.y <= s.bounds.maxY + eraserRadius
                ) {
                  return false;
                }
              }
              return true;
            });
            pushHistory(filtered, thoughtsRef.current, canvasTextsRef.current);
            return filtered;
          });
        } else {
          // Living Ink: Natural Scratch-to-Erase Gesture
          // Rapid zigzag scribble over existing strokes vaporizes them instantly
          if (isScratchOutGesture(points)) {
            const scratchBounds = calculateStrokeBounds(points);
            const pad = 10;
            const remaining = strokes.filter(
              (s) =>
                !(
                  s.bounds.minX < scratchBounds.maxX + pad &&
                  s.bounds.maxX > scratchBounds.minX - pad &&
                  s.bounds.minY < scratchBounds.maxY + pad &&
                  s.bounds.maxY > scratchBounds.minY - pad
                )
            );

            if (remaining.length < strokes.length) {
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([20, 25, 20]);
              }
              setStrokes(remaining);
              strokesRef.current = remaining;
              pushHistory(remaining, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, checklistsRef.current);
              showToast('Scratched out ink');
              currentStrokeRef.current = [];
              return;
            }
          }

          const newStroke: Stroke = {
            id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            points: [...points],
            color: currentColor,
            width: strokeWidth,
            tool: effectiveTool,
            timestamp: Date.now(),
            bounds: calculateStrokeBounds(points),
          };

          const nextStrokes = [...strokes, newStroke];
          setStrokes(nextStrokes);
          strokesRef.current = nextStrokes;
          pushHistory(nextStrokes, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, shapesRef.current, checklistsRef.current);
        }
      }

      currentStrokeRef.current = [];
    }
  };

  // Wheel Zoom / Pan (Continuous smooth exponential zoom centered at mouse cursor)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Zoom conditions:
    // Any external mouse wheel roll (deltaY != 0), trackpad pinch (ctrlKey/metaKey), or Alt key
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    // On desktop, rotating mouse wheel (or pinch zoom) should zoom centered at cursor
    const isScrollWheelZoom = !e.shiftKey && (hasModifier || e.deltaMode !== 0 || Math.abs(e.deltaY) >= Math.abs(e.deltaX));

    if (isScrollWheelZoom && Math.abs(e.deltaY) > 0) {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20; // Standard mouse line mode
      else if (e.deltaMode === 2) delta *= 80; // Page mode

      // Normalize delta across high-precision mice and standard wheels
      const clampedDelta = Math.max(-100, Math.min(100, delta));
      const zoomIntensity = e.ctrlKey ? 0.0035 : 0.0018;
      const zoomFactor = Math.exp(-clampedDelta * zoomIntensity);

      const prev = viewportRef.current;
      const newZoom = Math.min(6.0, Math.max(0.12, prev.zoom * zoomFactor));
      const updated = {
        zoom: newZoom,
        x: mouseX - (mouseX - prev.x) * (newZoom / prev.zoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / prev.zoom),
      };
      viewportRef.current = updated;
      setViewport(updated);
    } else {
      // Trackpad 2-finger pan or Shift+Wheel horizontal pan
      const panX = e.shiftKey ? e.deltaY : e.deltaX;
      const panY = e.shiftKey ? 0 : e.deltaY;

      const prev = viewportRef.current;
      const updated = {
        ...prev,
        x: prev.x - panX,
        y: prev.y - panY,
      };
      viewportRef.current = updated;
      setViewport(updated);
    }
  };

  // Double click on canvas to immediately activate text typing mode
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const hitTxt = hitTestText(canvasPos);
      if (hitTxt) {
        setSelectedSentences([]);
        setSelectedItem(null);
        setActiveTextId(hitTxt.id);
        setTimeout(() => {
          activeInputRef.current?.focus();
          autoResizeActiveTextarea();
        }, 40);
      }
    },
    [autoResizeActiveTextarea, hitTestText, screenToCanvas]
  );

  // Keyboard Shortcuts (Undo, Redo, Save, Pan, Tool switching, Duplicate, Delete, Copy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.metaKey || e.ctrlKey) && key === 'c') {
        if (selectedItem?.type === 'text') {
          e.preventDefault();
          const txt = (selectedItem.item as CanvasTextItem).text;
          if (txt) {
            navigator.clipboard.writeText(txt).then(() => showToast('Text note copied'));
          }
        } else if (selectedSentences.length > 0) {
          e.preventDefault();
          handleCopySelectedText();
        }
      } else if ((e.metaKey || e.ctrlKey) && key === 'd' && selectedItem) {
        e.preventDefault();
        handleDuplicateItem(selectedItem);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItem) {
          e.preventDefault();
          handleDeleteItem(selectedItem.item.id, selectedItem.type);
        } else if (selectedConnectorId) {
          e.preventDefault();
          handleDeleteConnector(selectedConnectorId);
        }
      } else if (e.key === 'Escape') {
        if (selectedItem) setSelectedItem(null);
        if (selectedConnectorId) setSelectedConnectorId(null);
        if (isTimeMachineOpen) setIsTimeMachineOpen(false);
        if (isGuideOpen) setIsGuideOpen(false);
      } else if (e.key === ' ' || e.code === 'Space') {
        if (!isSpaceHeldRef.current) {
          isSpaceHeldRef.current = true;
          setIsSpaceHeld(true);
          prevToolRef.current = currentTool;
          setCurrentTool('pan');
        }
      } else if (key === 'v' || key === '1') {
        setCurrentTool('select');
      } else if (key === 'p' || key === '2') {
        setCurrentTool('pen');
      } else if (key === 'b' || key === '3') {
        setCurrentTool('pencil');
      } else if (key === 'h' || key === '4') {
        setCurrentTool('highlighter');
      } else if (key === 'e' || key === '5') {
        setCurrentTool('eraser');
      } else if (key === 't') {
        setCurrentTool('text');
        showToast('Text tool active • Click canvas to type');
      } else if (key === 'c' && !e.metaKey && !e.ctrlKey) {
        setCurrentTool('connector');
        showToast('Flowchart connector active');
      } else if (key === '?' || key === '/') {
        setIsGuideOpen(true);
      } else if (key === 'm') {
        setIsTimeMachineOpen((prev) => !prev);
      } else if (e.key === '[') {
        setStrokeWidth((prev) => Math.max(1, prev - 1));
      } else if (e.key === ']') {
        setStrokeWidth((prev) => Math.min(24, prev + 1));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        isSpaceHeldRef.current = false;
        setIsSpaceHeld(false);
        setCurrentTool(prevToolRef.current || 'pen');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    handleUndo,
    handleRedo,
    handleSaveProject,
    currentTool,
    selectedItem,
    isTimeMachineOpen,
    handleDuplicateItem,
    handleDeleteItem,
    handleCopySelectedText,
    handleDeleteConnector,
    isGuideOpen,
    selectedConnectorId,
    selectedSentences.length,
    showToast,
  ]);

  // Automatic high-engagement feedback trigger (e.g. user drawn 25+ strokes and active for over 90 seconds)
  useEffect(() => {
    if (highEngagementTriggeredRef.current) return;
    if (strokes.length >= 25) {
      if (typeof window !== 'undefined') {
        const hasSubmitted = localStorage.getItem('thoughtspace_feedback_submitted');
        const hasOptedOut = localStorage.getItem('thoughtspace_feedback_opt_out');
        const sessionElapsed = (Date.now() - sessionStartTimeRef.current) / 1000;
        if (!hasSubmitted && !hasOptedOut && sessionElapsed > 75) {
          highEngagementTriggeredRef.current = true;
          const timer = setTimeout(() => {
            setFeedbackTriggerReason('high_engagement');
            setIsFeedbackModalOpen(true);
          }, 2500);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [strokes.length]);

  // Handle sharing thought dump to anonymous live feed with Cloud Firestore persistence
  const handleConfirmShareThoughtDump = useCallback(
    async (payload: { duration: string; summary: string; scanStatus: 'clean' | 'sanitized' }) => {
      const canvasPayloadString = JSON.stringify({
        strokes: strokesRef.current.slice(0, 1500),
        canvasTexts: canvasTextsRef.current.slice(0, 200),
        thoughts: thoughtsRef.current.slice(0, 50),
        shapes: shapesRef.current.slice(0, 100),
        checklists: checklistsRef.current.slice(0, 20),
      });
      const title = activeProject?.title || 'Untitled Thought Dump';

      try {
        const publishedId = await publishThoughtDumpToFirestore({
          title,
          summary: payload.summary || 'Anonymous thoughts dumped onto infinite canvas',
          duration: payload.duration,
          strokesCount: strokesRef.current.length,
          canvasPayload: canvasPayloadString,
        });

        if (typeof window !== 'undefined') {
          const existing = JSON.parse(localStorage.getItem('thoughtspace_shared_dumps') || '[]');
          const newEntry = {
            id: publishedId,
            title,
            summary: payload.summary,
            duration: payload.duration,
            scanStatus: payload.scanStatus,
            createdAt: new Date().toISOString(),
            strokesCount: strokesRef.current.length,
            textsCount: canvasTextsRef.current.length,
          };
          existing.unshift(newEntry);
          localStorage.setItem('thoughtspace_shared_dumps', JSON.stringify(existing.slice(0, 50)));
          localStorage.setItem('thoughtspace_has_shared_first_thought', 'true');
        }

        showToast(`Thought Dump live on feed for ${payload.duration} • Shared anonymously`);
      } catch (err) {
        console.error('Error publishing thought dump to Firestore:', err);
        showToast(`Thought Dump published locally (offline mode)`);
      }

      // Post-share feedback trigger: if user hasn't rated yet, prompt gently
      if (typeof window !== 'undefined') {
        const hasSubmitted = localStorage.getItem('thoughtspace_feedback_submitted');
        const hasOptedOut = localStorage.getItem('thoughtspace_feedback_opt_out');
        if (!hasSubmitted && !hasOptedOut) {
          setTimeout(() => {
            setFeedbackTriggerReason('post_share');
            setIsFeedbackModalOpen(true);
          }, 1200);
        }
      }
    },
    [activeProject?.title, showToast]
  );

  // Load a stranger's shared thought dump directly onto the canvas for exploration
  const handleLoadThoughtToCanvas = useCallback(
    (thought: SharedThoughtDocument) => {
      if (!thought.canvasPayload) {
        showToast('This thought dump has no canvas items to render.');
        return;
      }

      try {
        const parsed = JSON.parse(thought.canvasPayload);
        const {
          strokes: newStrokes,
          canvasTexts: newTexts,
          thoughts: newThoughts,
          shapes: newShapes,
          checklists: newChecklists,
        } = parsed;

        if (newStrokes && newStrokes.length > 0) {
          setStrokes(newStrokes);
          strokesRef.current = newStrokes;
        }
        if (newTexts && newTexts.length > 0) {
          setCanvasTexts(newTexts);
          canvasTextsRef.current = newTexts;
        }
        if (newThoughts && newThoughts.length > 0) {
          setThoughts(newThoughts);
          thoughtsRef.current = newThoughts;
        }
        if (newShapes && newShapes.length > 0) {
          setShapes(newShapes);
          shapesRef.current = newShapes;
        }
        if (newChecklists && newChecklists.length > 0) {
          setChecklists(newChecklists);
          checklistsRef.current = newChecklists;
        }

        pushHistory(
          newStrokes || strokesRef.current,
          newThoughts || thoughtsRef.current,
          newTexts || canvasTextsRef.current,
          imagesRef.current,
          newShapes || shapesRef.current,
          newChecklists || checklistsRef.current
        );

        setViewport({ x: 80, y: 80, zoom: 1 });
        showToast(`Loaded "${thought.title}" onto canvas`);
        setIsLiveFeedOpen(false);
      } catch (err) {
        console.error('Error loading stranger thought canvas data:', err);
        showToast('Failed to parse thought canvas data');
      }
    },
    [pushHistory, showToast]
  );

  // Sanitize text items on canvas with PII redaction
  const handleSanitizeCanvasTexts = useCallback(
    (sanitizer: (text: string) => string) => {
      const sanitizedTexts = canvasTextsRef.current.map((item) => ({
        ...item,
        text: sanitizer(item.text),
      }));
      canvasTextsRef.current = sanitizedTexts;
      setCanvasTexts(sanitizedTexts);
      pushHistory(strokesRef.current, thoughtsRef.current, sanitizedTexts);
      showToast('Canvas text sanitized & redacted');
    },
    [pushHistory, showToast]
  );

  const activeTextItem = activeTextId ? canvasTexts.find((t) => t.id === activeTextId) : null;
  const isPenTool = currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser';

  const canvasCursor =
    isSpaceHeld || currentTool === 'pan'
      ? isPanningState ? 'cursor-grabbing' : 'cursor-grab'
      : currentTool === 'select'
      ? 'cursor-default'
      : currentTool === 'eraser'
      ? 'cursor-cell'
      : 'cursor-crosshair';

  return (
    <div className={`stage-wrapper ${themeMode === 'dark' ? 'dark-shell' : ''}`}>
      {/* Top Appearance Switcher matching prototype .mode */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 hidden sm:flex items-center gap-0.5 p-0.5 bg-[var(--phone-surface-2)] border border-[var(--phone-border)] rounded-lg backdrop-blur-md shadow-2xs">
        <button
          type="button"
          onClick={() => setThemeMode('light')}
          className={`h-7 px-3.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
            themeMode === 'light'
              ? 'bg-[var(--phone-surface-1)] text-[var(--phone-ink)] shadow-2xs'
              : 'text-[var(--phone-mute)] hover:text-[var(--phone-ink)]'
          }`}
          aria-pressed={themeMode === 'light'}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setThemeMode('dark')}
          className={`h-7 px-3.5 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
            themeMode === 'dark'
              ? 'bg-[var(--phone-surface-1)] text-[var(--phone-ink)] shadow-2xs'
              : 'text-[var(--phone-mute)] hover:text-[var(--phone-ink)]'
          }`}
          aria-pressed={themeMode === 'dark'}
        >
          Dark
        </button>
      </div>

      {/* Main Mobile App Shell (.phone-shell) */}
      <div className="phone-shell" id="ph">
        {/* Top Notification Toast */}
        <TopToast message={toastMessage} />

        {/* Canvases Screen (Library) */}
        <CanvasesScreen
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={(id) => {
            handleSelectProject(id);
            setIsEditorOpen(true);
          }}
          onNewProject={() => {
            handleNewProject();
            setIsEditorOpen(true);
          }}
          onPinProject={handlePinProject}
          onDeleteProject={handleDeleteProject}
          isOpen={!isEditorOpen && activeShellTab === 'canvases'}
        />

        {/* Explore Screen (Feed) */}
        <ExploreScreen
          isOpen={!isEditorOpen && activeShellTab === 'explore'}
          onOpenThoughtCanvas={handleOpenExplorePost}
        />

        {/* Bottom Tab Bar (Visible when Editor is closed) */}
        <AppTabBar
          activeTab={activeShellTab}
          onSelectTab={setActiveShellTab}
          isVisible={!isEditorOpen}
        />

        {/* Editor Screen (.scr.ed) */}
        <div
          ref={containerRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            transform: isEditorOpen
              ? isEdgeDragging
                ? `translateX(${edgeDragX}px)`
                : 'none'
              : 'translateX(100%)',
            transition: isEdgeDragging
              ? 'none'
              : 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s ' + (isEditorOpen ? '0s' : '0.45s'),
            visibility: isEditorOpen ? 'visible' : 'hidden',
          }}
          className="absolute inset-0 z-20 overflow-hidden bg-[var(--phone-paper)] touch-none select-none"
        >
          {/* Dot Grid Pattern */}
          <div className="dotsbg-pattern" />

          {/* Left Edge Drag Gesture Detector */}
          <div
            id="edge"
            onPointerDown={(e) => {
              setIsEdgeDragging(true);
              edgeStartXRef.current = e.clientX;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!isEdgeDragging) return;
              const dx = Math.max(0, e.clientX - edgeStartXRef.current);
              setEdgeDragX(dx);
            }}
            onPointerUp={() => {
              if (!isEdgeDragging) return;
              setIsEdgeDragging(false);
              if (edgeDragX > 100) {
                setIsEditorOpen(false);
              }
              setEdgeDragX(0);
            }}
            onPointerCancel={() => {
              setIsEdgeDragging(false);
              setEdgeDragX(0);
            }}
            className="absolute left-0 top-0 bottom-0 w-6 z-40 touch-none cursor-ew-resize"
            title="Swipe right to return to Canvases"
          />

          {/* iOS 18 Compact Top Bar */}
          <EditorTopBar
            title={activeProject?.title || 'Idea Stream'}
            onRenameTitle={(newTitle) => handleRenameProject(activeProjectId, newTitle)}
            onBack={() => setIsEditorOpen(false)}
            onShare={() => setIsShareModalOpen(true)}
            onRedo={handleRedo}
            canRedo={historyIndex < history.length - 1}
            onFitToScreen={handleFitToContent}
            onReplayHistory={() => {
              setIsTimeMachineOpen((prev) => {
                if (!prev) setTimeMachineStep(timelineItems.length);
                return !prev;
              });
            }}
            isMiniMapActive={isMiniRadarVisible}
            onToggleMiniMap={() => setIsMiniRadarVisible((prev) => !prev)}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenFeedback={() => {
              setFeedbackTriggerReason('manual');
              setIsFeedbackModalOpen(true);
            }}
          />

      {/* Infinite Canvas */}
      <canvas
        id="infinite-stylus-canvas"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        className={`absolute inset-0 w-full h-full ${canvasCursor} touch-none select-none`}
        style={{ touchAction: 'none' }}
      />

      {/* Active typing block on canvas with single native vertical blinking cursor and move handle */}
      {activeTextItem && (
        <div
          id="canvas-active-text-wrapper"
          style={{
            position: 'absolute',
            left: viewport.x + activeTextItem.x * viewport.zoom,
            top: viewport.y + activeTextItem.y * viewport.zoom,
            zIndex: 45,
            pointerEvents: 'auto',
          }}
        >
          {/* Grab handle allowing user to smoothly move the text block around while typing */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={handleActiveTextMoveStart}
            className={`flex items-center gap-1.5 px-2.5 py-1 mb-1.5 rounded-md text-[11px] font-medium select-none shadow-sm w-fit pointer-events-auto transition-all ${
              isDraggingActiveText
                ? 'bg-neutral-950 text-white ring-2 ring-neutral-900/40 cursor-grabbing scale-102 shadow-md'
                : 'bg-neutral-900/90 hover:bg-neutral-950 text-white cursor-grab hover:scale-102'
            }`}
            style={{ touchAction: 'none' }}
            title="Drag to adjust position while typing"
          >
            <GripHorizontal className="w-3.5 h-3.5 text-neutral-300" />
            <span>Move</span>
          </div>

          <div className="relative inline-block">
            <textarea
              ref={activeInputRef}
              value={activeTextItem.text}
              onChange={(e) => handleUpdateActiveText(e.target.value)}
              onBlur={handleBlurActiveText}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleBlurActiveText();
                }
              }}
              placeholder=""
              autoFocus
              className="resize-none overflow-visible bg-transparent border-none outline-none p-0 m-0 whitespace-pre-wrap select-text cursor-text"
              style={{
                fontFamily: '"Kalam", "Caveat", cursive',
                fontWeight: 500,
                fontSize: `${22 * viewport.zoom}px`,
                lineHeight: `${32 * viewport.zoom}px`,
                color: activeTextItem.color || currentColor || '#1E1E1E',
                caretColor: '#1E1E1E',
                width: `${(activeTextItem.width || 640) * viewport.zoom}px`,
                maxWidth: 'calc(94vw - 24px)',
                minHeight: `${34 * viewport.zoom}px`,
                padding: 0,
                margin: 0,
                border: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {/* Sentence Highlight & Copy Overlay */}
      <SentenceCopyOverlay
        selectedSentences={selectedSentences}
        viewport={viewport}
        onCopy={handleCopySelectedText}
        onClearSelection={() => setSelectedSentences([])}
        isCopied={isCopied}
      />

      {/* Interactive Transform, Move & Resize Overlay for Selected Canvas Item (Images, Shapes, Sticky Notes, Texts) */}
      <CanvasItemTransformOverlay
        selected={activeTextId ? null : selectedItem}
        viewport={viewport}
        lastCanvasTapTime={lastCanvasTapTime}
        onUpdateImage={handleUpdateImage}
        onUpdateShape={handleUpdateShape}
        onUpdateText={handleUpdateText}
        onEditText={handleEditText}
        onCommitTransform={handleCommitTransform}
        onDeleteItem={handleDeleteItem}
        onDuplicateItem={handleDuplicateItem}
        onAnalyzeImage={handleAnalyzeImage}
        isAnalyzingImage={isAnalyzingImage}
        onStartConnectorDrag={handleStartConnectorDrag}
        onDeselect={() => setSelectedItem(null)}
      />

      {/* Interactive Flowchart Connector Action Overlay (Direction, Arrowheads, Color, Label, Delete) */}
      {selectedConnector && selectedConnectorMidpoint && (
        <CanvasConnectorActionOverlay
          connector={selectedConnector}
          midpoint={selectedConnectorMidpoint}
          viewport={viewport}
          onUpdateConnector={handleUpdateConnector}
          onDeleteConnector={handleDeleteConnector}
          onDeselect={() => setSelectedConnectorId(null)}
        />
      )}

      {/* Interactive Checklists on Canvas */}
      {(isTimeMachineOpen && timeMachineVisibleSet
        ? checklists.filter((ch) => timeMachineVisibleSet.has(ch.id))
        : checklists
      ).map((ch) => (
        <CanvasChecklistCard
          key={ch.id}
          checklist={ch}
          viewport={viewport}
          onUpdate={handleUpdateChecklist}
          onDelete={handleDeleteChecklist}
          onDragStart={handleChecklistDragStart}
        />
      ))}

      {/* Interactive Constellation Mini-Radar Navigator */}
      {isMiniRadarVisible && (
        <CanvasMiniRadar
          viewport={viewport}
          strokes={strokes}
          thoughts={thoughts}
          canvasTexts={canvasTexts}
          images={images}
          shapes={shapes}
          checklists={checklists}
          connectors={connectors}
          onNavigateViewport={setViewport}
          onFitToContent={handleFitToContent}
        />
      )}

      {/* First-time Onboarding & Keyboard Shortcut Guide */}
      <CanvasOnboardingGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onOpen={() => setIsGuideOpen(true)}
      />

      {/* Time Machine Playback Controller */}
      <CanvasTimeMachine
        isOpen={isTimeMachineOpen}
        onClose={() => {
          setIsTimeMachineOpen(false);
          setTimeMachineStep(timelineItems.length);
        }}
        totalSteps={timelineItems.length}
        currentStep={timeMachineStep}
        onStepChange={(stepOrFn) => {
          setTimeMachineStep(stepOrFn);
        }}
        activeItemType={timelineItems[Math.max(0, timeMachineStep - 1)]?.type}
      />

      {/* Off-Screen Thought Bubble Indicator */}
      <ThoughtBubbleOffScreen
        visible={offScreenBubble.visible}
        screenX={offScreenBubble.screenX}
        screenY={offScreenBubble.screenY}
        angleRad={offScreenBubble.angleRad}
        onFocusThought={handleFocusThought}
      />

      {/* Liquid Bottom Dock (Draggable in any direction, swipeable tools) */}
      <LiquidBottomDock
        currentTool={currentTool}
        onSelectTool={setCurrentTool}
        currentColor={currentColor}
        onSelectColor={setCurrentColor}
        strokeWidth={strokeWidth}
        onChangeStrokeWidth={setStrokeWidth}
        onSave={handleSaveProject}
        isSaving={isSaving}
        onOpenProjects={() => {
          setIsEditorOpen(false);
          setActiveShellTab('canvases');
        }}
        onNewProject={handleNewProject}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onExportPDF={() => exportCanvasToPDF(strokes, thoughts, canvasTexts, images, shapes, checklists, activeProject?.title || 'Note')}
        onExportPNG={async () => {
          const url = await exportCanvasToImage(strokes, thoughts, canvasTexts, images, shapes, checklists);
          const a = document.createElement('a');
          a.href = url;
          a.download = `stylus-canvas-${Date.now()}.png`;
          a.click();
          showToast('PNG Exported');
        }}
        onExportJSON={handleExportJSON}
        onShareThoughtDump={() => setIsShareModalOpen(true)}
        onTriggerAssistant={handleTriggerAssistant}
        isConversationalActive={false}
        isAssistantThinking={thoughts.some((t) => t.status === 'thinking')}
        isOffline={isOffline}
        onImportImages={handleImportImageFiles}
        onAddShape={handleAddShape}
        onAddChecklist={handleAddChecklist}
      />

      {/* Share Anonymous Thought Dump Modal with Edge PII & Content Guardrail */}
      <ShareThoughtDumpModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        canvasTexts={canvasTexts}
        thoughts={thoughts}
        checklists={checklists}
        strokesCount={strokes.length}
        projectTitle={activeProject?.title || 'Untitled Thought'}
        onConfirmShare={handleConfirmShareThoughtDump}
        onSanitizeCanvasTexts={handleSanitizeCanvasTexts}
        onViewExplore={() => {
          setIsShareModalOpen(false);
          setIsEditorOpen(false);
          setActiveShellTab('explore');
        }}
      />

      {/* Anonymous Live Feed & Infinite Canvas Thought Explorer */}
      <LiveThoughtFeedModal
        isOpen={isLiveFeedOpen}
        onClose={() => setIsLiveFeedOpen(false)}
        onLoadThoughtToCanvas={handleLoadThoughtToCanvas}
      />

      {/* Thoughtspace Community Feedback & Rating System */}
      <FeedbackRatingModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        triggerReason={feedbackTriggerReason}
        engagementMetrics={{
          strokesCount: strokes.length,
          itemsCount: canvasTexts.length + images.length + shapes.length + checklists.length,
          sessionDurationSec: sessionDurationSec,
          sharedThoughtsCount: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('thoughtspace_shared_dumps') || '[]').length : 0,
        }}
        onSuccessToast={showToast}
      />

      {/* App Navigation Hamburger Drawer */}
      <AppNavigationDrawer
        isOpen={isNavDrawerOpen}
        onClose={() => setIsNavDrawerOpen(false)}
        onOpenProjects={() => setIsDrawerOpen(true)}
        onOpenTimeMachine={() => {
          setTimeMachineStep(strokes.length);
          setIsTimeMachineOpen(true);
        }}
        onToggleMiniRadar={() => {
          setIsMiniRadarVisible((prev) => !prev);
          showToast(isMiniRadarVisible ? 'Mini radar hidden' : 'Mini radar visible');
        }}
        isMiniRadarVisible={isMiniRadarVisible}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenFeedback={() => {
          setFeedbackTriggerReason('manual');
          setIsFeedbackModalOpen(true);
        }}
      />

      {/* Previous Projects & Conversations Drawer */}
      <ProjectsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onPinProject={handlePinProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
        onNotify={showToast}
      />
        </div>

        {/* iOS Home Indicator */}
        <div className="ios-home-indicator" />
      </div>
    </div>
  );
};

export default InfiniteStylusCanvas;
