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
import { PenTool, ShieldCheck, Hand, Edit3, Check, History, Maximize2 } from 'lucide-react';

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

export const InfiniteStylusCanvas: React.FC = () => {
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
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.strokes || [];
  });

  const [thoughts, setThoughts] = useState<AIThought[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.thoughts || [];
  });

  const [canvasTexts, setCanvasTexts] = useState<CanvasTextItem[]>(() => {
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
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.shapes || [];
  });

  const [checklists, setChecklists] = useState<CanvasChecklistItem[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return proj?.checklists || [];
  });

  const [selectedItem, setSelectedItem] = useState<SelectedCanvasItem | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<boolean>(false);

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
    activeProjectIdRef.current = activeProjectId;
    activeProjectRef.current = activeProject;
  }, [activeProjectId, activeProject]);

  // Active text block typing session (blinking vertical caret)
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const activeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // History for Undo / Redo
  const [history, setHistory] = useState<{
    strokes: Stroke[];
    thoughts: AIThought[];
    canvasTexts: CanvasTextItem[];
    images: CanvasImageItem[];
    shapes: CanvasShapeItem[];
    checklists: CanvasChecklistItem[];
  }[]>(() => {
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

  // Current Drawing Stroke Ref
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);

  // Canvas Pan Interaction Ref (1-finger drag or mouse drag)
  const isPanningRef = useRef<boolean>(false);
  const lastPanPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);

  // Direct canvas item dragging for shapes and images
  const directDragItemRef = useRef<{
    type: 'shape' | 'image';
    id: string;
    startClientX: number;
    startClientY: number;
    startItemX: number;
    startItemY: number;
  } | null>(null);
  const isDirectDraggingItemRef = useRef<boolean>(false);

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
        viewportRef.current = loadedViewport;

        setStrokes(loadedStrokes);
        setThoughts(loadedThoughts);
        setCanvasTexts(loadedCanvasTexts);
        setImages(loadedImages);
        setShapes(loadedShapes);
        setChecklists(loadedChecklists);
        setViewport(loadedViewport);

        setHistory([
          {
            strokes: loadedStrokes,
            thoughts: loadedThoughts,
            canvasTexts: loadedCanvasTexts,
            images: loadedImages,
            shapes: loadedShapes,
            checklists: loadedChecklists,
          },
        ]);
        setHistoryIndex(0);
        setSelectedSentences([]);
        setActiveThoughtId(null);
        setActiveTextId(null);
        setSelectedItem(null);
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
    viewportRef.current = newNote.viewport;

    setStrokes([]);
    setThoughts([]);
    setCanvasTexts([]);
    setImages([]);
    setShapes([]);
    setChecklists([]);
    setViewport(newNote.viewport);
    setHistory([{ strokes: [], thoughts: [], canvasTexts: [], images: [], shapes: [], checklists: [] }]);
    setHistoryIndex(0);
    setSelectedSentences([]);
    setActiveThoughtId(null);
    setActiveTextId(null);
    setSelectedItem(null);
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

  // Undo / Redo
  const pushHistory = useCallback(
    (
      newStrokes: Stroke[],
      newThoughts: AIThought[],
      newTexts: CanvasTextItem[] = canvasTextsRef.current,
      newImages: CanvasImageItem[] = imagesRef.current,
      newShapes: CanvasShapeItem[] = shapesRef.current,
      newChecklists: CanvasChecklistItem[] = checklistsRef.current
    ) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({
        strokes: newStrokes,
        thoughts: newThoughts,
        canvasTexts: newTexts,
        images: newImages,
        shapes: newShapes,
        checklists: newChecklists,
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

      strokesRef.current = prev.strokes;
      thoughtsRef.current = prev.thoughts;
      canvasTextsRef.current = prev.canvasTexts || [];
      imagesRef.current = prev.images || [];
      shapesRef.current = prev.shapes || [];
      checklistsRef.current = prev.checklists || [];

      setHistoryIndex(historyIndex - 1);
      setSelectedSentences([]);
      setSelectedItem(null);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: prev.strokes,
          thoughts: prev.thoughts,
          canvasTexts: prev.canvasTexts || [],
          images: prev.images || [],
          shapes: prev.shapes || [],
          checklists: prev.checklists || [],
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

      strokesRef.current = next.strokes;
      thoughtsRef.current = next.thoughts;
      canvasTextsRef.current = next.canvasTexts || [];
      imagesRef.current = next.images || [];
      shapesRef.current = next.shapes || [];
      checklistsRef.current = next.checklists || [];

      setHistoryIndex(historyIndex + 1);
      setSelectedSentences([]);
      setSelectedItem(null);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: next.strokes,
          thoughts: next.thoughts,
          canvasTexts: next.canvasTexts || [],
          images: next.images || [],
          shapes: next.shapes || [],
          checklists: next.checklists || [],
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

  // Delete item from canvas
  const handleDeleteItem = useCallback(
    (id: string, type: 'image' | 'shape' | 'text') => {
      if (type === 'image') {
        setImages((prev) => {
          const next = prev.filter((i) => i.id !== id);
          imagesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, next, shapesRef.current);
          return next;
        });
        setSelectedItem(null);
        showToast('Deleted image');
      } else if (type === 'shape') {
        setShapes((prev) => {
          const next = prev.filter((s) => s.id !== id);
          shapesRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, canvasTextsRef.current, imagesRef.current, next);
          return next;
        });
        setSelectedItem(null);
        showToast('Deleted item');
      } else if (type === 'text') {
        setCanvasTexts((prev) => {
          const next = prev.filter((t) => t.id !== id);
          canvasTextsRef.current = next;
          pushHistory(strokesRef.current, thoughtsRef.current, next, imagesRef.current, shapesRef.current);
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
        const resultText = data.text || data.fallbackText;

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

      const layout = layoutHandwrittenText(textResult, spawnX, spawnY);
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

  // Tap on canvas in Move & Type mode to select items, position cursor, or edit text
  const handleCanvasTapToType = useCallback(
    (clientX: number, clientY: number) => {
      const canvasPos = screenToCanvas(clientX, clientY);

      // Check if user clicked an Image
      const clickedImage = [...imagesRef.current].reverse().find(
        (img) =>
          canvasPos.x >= img.x &&
          canvasPos.x <= img.x + img.width &&
          canvasPos.y >= img.y &&
          canvasPos.y <= img.y + img.height
      );

      if (clickedImage) {
        setSelectedItem({ type: 'image', item: clickedImage });
        setActiveTextId(null);
        return;
      }

      // Check if user clicked a Shape or Sticky Note
      const clickedShape = [...shapesRef.current].reverse().find((shp) => {
        const minX = Math.min(shp.x, shp.x + shp.width);
        const maxX = Math.max(shp.x, shp.x + shp.width);
        const minY = Math.min(shp.y, shp.y + shp.height);
        const maxY = Math.max(shp.y, shp.y + shp.height);
        const pad = shp.type === 'line' || shp.type === 'arrow' ? 20 : 6;
        return (
          canvasPos.x >= minX - pad &&
          canvasPos.x <= maxX + pad &&
          canvasPos.y >= minY - pad &&
          canvasPos.y <= maxY + pad
        );
      });

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
      const clickedItem = canvasTextsRef.current.find((item) => {
        const lines = item.text ? item.text.split('\n') : [''];
        const width = Math.max(80, Math.max(...lines.map((l) => l.length * 12)));
        const height = Math.max(36, lines.length * 32);
        return (
          canvasPos.x >= item.x - 14 &&
          canvasPos.x <= item.x + width + 28 &&
          canvasPos.y >= item.y - 14 &&
          canvasPos.y <= item.y + height + 14
        );
      });

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

      // Clicked on blank canvas space: if an item was selected, deselect it
      if (selectedItem) {
        setSelectedItem(null);
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

      setTimeout(() => {
        activeInputRef.current?.focus();
      }, 40);
    },
    [screenToCanvas, currentColor, pushHistory, currentTool, selectedItem]
  );

  // Update text for currently active typing item
  const handleUpdateActiveText = useCallback(
    (newText: string) => {
      if (!activeTextId) return;
      setCanvasTexts((prev) => {
        const updated = prev.map((t) => (t.id === activeTextId ? { ...t, text: newText, updatedAt: Date.now() } : t));
        canvasTextsRef.current = updated;
        return updated;
      });
    },
    [activeTextId]
  );

  // Blur/finish typing
  const handleBlurActiveText = useCallback(() => {
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
  }, [activeTextId, pushHistory]);

  // Double-tap or Click Detection to select sentence
  const handleSentenceSelectAtCanvasPoint = useCallback(
    (canvasPos: Point) => {
      let hitSentence: ThoughtSentence | null = null;

      for (const thought of thoughts) {
        for (const sentence of thought.sentences) {
          const padding = 12;
          if (
            canvasPos.x >= sentence.x - padding &&
            canvasPos.x <= sentence.x + sentence.width + padding &&
            canvasPos.y >= sentence.y - padding &&
            canvasPos.y <= sentence.y + sentence.height + padding
          ) {
            hitSentence = sentence;
            break;
          }
        }
        if (hitSentence) break;
      }

      if (hitSentence) {
        setSelectedSentences((prev) => {
          const exists = prev.some((s) => s.id === hitSentence!.id);
          if (exists) {
            return prev.filter((s) => s.id !== hitSentence!.id);
          } else {
            return [...prev, hitSentence!];
          }
        });
      } else {
        setSelectedSentences([]);
      }
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
    // Request low-latency direct-to-front-buffer context for Android & Samsung S-Pen
    const ctx =
      (canvas.getContext('2d', {
        desynchronized: true,
        alpha: false,
      }) as CanvasRenderingContext2D | null) || canvas.getContext('2d');
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

    // Canvas Background
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Draw Infinite Dot Grid
    const dotSpacing = 28 * viewport.zoom;
    const startX = (viewport.x % dotSpacing + dotSpacing) % dotSpacing;
    const startY = (viewport.y % dotSpacing + dotSpacing) % dotSpacing;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.075)';
    for (let x = startX; x < width; x += dotSpacing) {
      for (let y = startY; y < height; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, 1.2 * Math.min(1.2, viewport.zoom)), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Apply Viewport Transform
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // 0. Draw Shapes & Sticky Notes (bottom layer)
    for (const shape of shapes) {
      drawCanvasShape(ctx, shape);
    }

    // 0.5 Draw Imported Canvas Images
    for (const imgItem of images) {
      let cached = imageCacheRef.current.get(imgItem.src);
      if (!cached) {
        cached = new Image();
        cached.crossOrigin = 'anonymous';
        cached.src = imgItem.src;
        imageCacheRef.current.set(imgItem.src, cached);
      }
      if (cached.complete && cached.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(cached, imgItem.x, imgItem.y, imgItem.width, imgItem.height);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(imgItem.x, imgItem.y, imgItem.width, imgItem.height);
        ctx.restore();
      }
    }

    // 1. Draw Saved Strokes (Filtered chronologically during Time Machine replay)
    const visibleStrokes = isTimeMachineOpen
      ? strokes.slice(0, Math.min(strokes.length, timeMachineStep))
      : strokes;

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

    // 2.5 Draw Typed Canvas Text Items (in the exact same handwriting font Kalam/Caveat with line wrapping)
    for (const item of canvasTexts) {
      if (item.id === activeTextId) continue; // Rendered live in textarea overlay with blinking cursor
      if (!item.text || !item.text.trim()) continue;

      ctx.save();
      ctx.font = '22px "Kalam", "Caveat", cursive';
      ctx.fillStyle = item.color || '#1E1E1E';
      ctx.textBaseline = 'top';

      const rawLines = item.text.split('\n');
      const maxLineWidth = 720;
      const wrappedLines: string[] = [];
      for (const rLine of rawLines) {
        if (!rLine) {
          wrappedLines.push('');
          continue;
        }
        const words = rLine.split(' ');
        let currentLine = words[0] || '';
        for (let w = 1; w < words.length; w++) {
          const testLine = `${currentLine} ${words[w]}`;
          if (ctx.measureText(testLine).width > maxLineWidth) {
            wrappedLines.push(currentLine);
            currentLine = words[w];
          } else {
            currentLine = testLine;
          }
        }
        wrappedLines.push(currentLine);
      }

      const lineHeight = 32;
      wrappedLines.forEach((line, index) => {
        ctx.fillText(line, item.x, item.y + index * lineHeight);
      });
      ctx.restore();
    }

    // 3. Draw AI Thoughts (Organic Inner-Self Handwriting overlapping notes)
    for (const thought of thoughts) {
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

    ctx.restore();
  }, [viewport, strokes, thoughts, canvasTexts, images, shapes, activeTextId, currentTool, currentColor, strokeWidth, isTimeMachineOpen, timeMachineStep]);

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
    const canvasPos = screenToCanvas(screenX, screenY);

    const now = Date.now();
    const isDoubleTap =
      now - lastTapTimeRef.current < 350 &&
      Math.hypot(screenX - lastTapPosRef.current.x, screenY - lastTapPosRef.current.y) < 20;

    lastTapTimeRef.current = now;
    lastTapPosRef.current = { x: screenX, y: screenY };

    const isPenTool = currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser';

    // Direct Canvas Interaction for Shapes and Images when not drawing with a pen tool
    if (!isPenTool && !isMiddleOrRight) {
      // 1. Hit test against Shapes and Sticky Notes (top-most shape first)
      const hitShape = [...shapesRef.current].reverse().find((shp) => {
        const minX = Math.min(shp.x, shp.x + shp.width);
        const maxX = Math.max(shp.x, shp.x + shp.width);
        const minY = Math.min(shp.y, shp.y + shp.height);
        const maxY = Math.max(shp.y, shp.y + shp.height);
        const pad = shp.type === 'line' || shp.type === 'arrow' ? 20 : 6;
        return (
          canvasPos.x >= minX - pad &&
          canvasPos.x <= maxX + pad &&
          canvasPos.y >= minY - pad &&
          canvasPos.y <= maxY + pad
        );
      });

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

      // 2. Hit test against Images
      const hitImage = [...imagesRef.current].reverse().find(
        (img) =>
          canvasPos.x >= img.x &&
          canvasPos.x <= img.x + img.width &&
          canvasPos.y >= img.y &&
          canvasPos.y <= img.y + img.height
      );

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

      // 3. Selection tool on empty canvas: deselect active item and inspect sentence
      if (currentTool === 'select') {
        if (selectedItem) {
          setSelectedItem(null);
        }
        handleSentenceSelectAtCanvasPoint(canvasPos);
        return;
      }

      // 4. Blank canvas click in Move & Type mode: start canvas pan
      isPanningRef.current = true;
      lastPanPointRef.current = { x: screenX, y: screenY };
      pointerDownPosRef.current = { x: screenX, y: screenY };
      hasDraggedRef.current = false;
      return;
    }

    if (isDoubleTap) {
      handleSentenceSelectAtCanvasPoint(canvasPos);
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

    // Direct shape or image dragging on canvas
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

    if (isPanningRef.current) {
      isPanningRef.current = false;
      const isPenTool = currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser';
      if (!hasDraggedRef.current && !isPenTool) {
        handleCanvasTapToType(e.clientX, e.clientY);
      }
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

  // Wheel Zoom / Pan
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      setViewport((prev) => {
        const newZoom = Math.min(4.0, Math.max(0.2, prev.zoom * zoomFactor));
        const updated = {
          zoom: newZoom,
          x: mouseX - (mouseX - prev.x) * (newZoom / prev.zoom),
          y: mouseY - (mouseY - prev.y) * (newZoom / prev.zoom),
        };
        viewportRef.current = updated;
        return updated;
      });
    } else {
      setViewport((prev) => {
        const updated = {
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        };
        viewportRef.current = updated;
        return updated;
      });
    }
  };

  // Keyboard Shortcuts (Undo, Redo, Save, Pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if (e.key === ' ') {
        setCurrentTool('pan');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === ' ' && currentTool === 'pan') {
        setCurrentTool('pen');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleUndo, handleRedo, handleSaveProject, currentTool]);

  const activeTextItem = activeTextId ? canvasTexts.find((t) => t.id === activeTextId) : null;
  const isPenTool = currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter' || currentTool === 'eraser';

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full overflow-hidden bg-[#FAF9F6] touch-none select-none"
    >
      {/* Top Notification Toast */}
      <TopToast message={toastMessage} />

      {/* Top Left: Active Note Title */}
      <div className="fixed top-3 left-3 z-30 pointer-events-auto">
        {isEditingTopTitle ? (
          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md border border-neutral-200/90 rounded-full px-2.5 py-1 shadow-sm">
            <input
              type="text"
              value={topTitleInput}
              autoFocus
              onChange={(e) => setTopTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameProject(activeProjectId, topTitleInput);
                  setIsEditingTopTitle(false);
                } else if (e.key === 'Escape') {
                  setIsEditingTopTitle(false);
                }
              }}
              onBlur={() => {
                handleRenameProject(activeProjectId, topTitleInput);
                setIsEditingTopTitle(false);
              }}
              className="text-xs font-medium text-neutral-800 bg-transparent focus:outline-none w-28 sm:w-44"
            />
            <button
              type="button"
              onClick={() => {
                handleRenameProject(activeProjectId, topTitleInput);
                setIsEditingTopTitle(false);
              }}
              className="p-0.5 rounded-full bg-neutral-900 text-white hover:bg-black"
              title="Save note title"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTopTitleInput(activeProject?.title || 'Untitled Note');
              setIsEditingTopTitle(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/90 hover:bg-white text-neutral-700 hover:text-neutral-900 border border-neutral-200/90 shadow-sm backdrop-blur-md transition-all group active:scale-95"
            title="Click to rename this note"
          >
            <span className="max-w-[120px] sm:max-w-[200px] truncate" suppressHydrationWarning>
              {activeProject?.title || 'Untitled Note'}
            </span>
            <Edit3 className="w-3 h-3 text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0" />
          </button>
        )}
      </div>

      {/* Top Right: Subtle Action Controls */}
      <div className="fixed top-3 right-3 z-30 flex items-center gap-1 p-1 rounded-full bg-white/90 hover:bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-sm pointer-events-auto transition-all">
        {/* Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            if (isPenTool) {
              setCurrentTool('pan');
              showToast('Switched to Move mode');
            } else {
              setCurrentTool('pen');
              showToast('Switched to Drawing mode');
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            isPenTool
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`}
          title={isPenTool ? 'Drawing Mode (Click to switch to Move)' : 'Move Mode (Click to switch to Drawing)'}
        >
          {isPenTool ? (
            isStylusDetected ? (
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-200" />
            ) : (
              <PenTool className="w-3.5 h-3.5 text-neutral-200" />
            )
          ) : (
            <Hand className="w-3.5 h-3.5 text-neutral-600" />
          )}
          <span className="hidden sm:inline">{isPenTool ? 'Draw' : 'Move'}</span>
        </button>

        <div className="w-px h-3.5 bg-neutral-200" />

        {/* Time Machine Timelapse Replay */}
        <button
          type="button"
          onClick={() => {
            setTimeMachineStep(strokes.length);
            setIsTimeMachineOpen(!isTimeMachineOpen);
          }}
          className={`p-1.5 rounded-full transition-colors ${
            isTimeMachineOpen
              ? 'bg-neutral-900 text-white shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
          title="Replay drawing history"
        >
          <History className="w-3.5 h-3.5" />
        </button>

        {/* Fit All to Screen */}
        <button
          type="button"
          onClick={handleFitToContent}
          className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          title="Fit all content to screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

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
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none select-none"
        style={{ touchAction: 'none' }}
      />

      {/* Active typing block on canvas with single native vertical blinking cursor */}
      {activeTextItem && (
        <div
          id="canvas-active-text-wrapper"
          style={{
            position: 'absolute',
            left: viewport.x + activeTextItem.x * viewport.zoom,
            top: viewport.y + activeTextItem.y * viewport.zoom,
            zIndex: 25,
            pointerEvents: 'auto',
          }}
        >
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
              rows={Math.max(1, activeTextItem.text.split('\n').length)}
              placeholder=""
              autoFocus
              className="resize-none overflow-hidden bg-transparent border-none outline-none p-0 m-0 whitespace-pre-wrap select-text cursor-text"
              style={{
                fontFamily: '"Kalam", "Caveat", cursive',
                fontSize: `${22 * viewport.zoom}px`,
                lineHeight: `${32 * viewport.zoom}px`,
                color: activeTextItem.color || currentColor || '#1E1E1E',
                caretColor: '#1E1E1E',
                width: `${Math.max(220, Math.min(1100, (Math.max(...activeTextItem.text.split('\n').map((l) => l.length), 8) + 4) * 14)) * viewport.zoom}px`,
                minWidth: `${180 * viewport.zoom}px`,
                maxWidth: 'min(1200px, 92vw)',
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
        selected={selectedItem}
        viewport={viewport}
        onUpdateImage={handleUpdateImage}
        onUpdateShape={handleUpdateShape}
        onUpdateText={handleUpdateText}
        onCommitTransform={handleCommitTransform}
        onDeleteItem={handleDeleteItem}
        onDuplicateItem={handleDuplicateItem}
        onAnalyzeImage={handleAnalyzeImage}
        isAnalyzingImage={isAnalyzingImage}
        onDeselect={() => setSelectedItem(null)}
      />

      {/* Interactive Checklists on Canvas */}
      {checklists.map((ch) => (
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
          onNavigateViewport={setViewport}
          onFitToContent={handleFitToContent}
        />
      )}

      {/* Time Machine Playback Controller */}
      <CanvasTimeMachine
        isOpen={isTimeMachineOpen}
        onClose={() => {
          setIsTimeMachineOpen(false);
          setTimeMachineStep(strokes.length);
        }}
        totalSteps={strokes.length}
        currentStep={timeMachineStep}
        onStepChange={(stepOrFn) => {
          setTimeMachineStep(stepOrFn);
        }}
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
        onOpenProjects={() => setIsDrawerOpen(true)}
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
        onTriggerAssistant={handleTriggerAssistant}
        isConversationalActive={false}
        isAssistantThinking={thoughts.some((t) => t.status === 'thinking')}
        isOffline={isOffline}
        onImportImages={handleImportImageFiles}
        onAddShape={handleAddShape}
        onAddChecklist={handleAddChecklist}
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
  );
};

export default InfiniteStylusCanvas;
