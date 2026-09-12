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
} from '@/types/canvas';
import {
  calculateStrokeBounds,
  drawSmoothStroke,
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
import { PenTool, ShieldCheck, Hand } from 'lucide-react';

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
    activeProjectIdRef.current = activeProjectId;
    activeProjectRef.current = activeProject;
  }, [activeProjectId, activeProject]);

  // Active text block typing session (blinking vertical caret)
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const activeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // History for Undo / Redo
  const [history, setHistory] = useState<{ strokes: Stroke[]; thoughts: AIThought[]; canvasTexts: CanvasTextItem[] }[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return [{ strokes: proj?.strokes || [], thoughts: proj?.thoughts || [], canvasTexts: proj?.canvasTexts || [] }];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Stylus Tools State - default to 'pan' (Move & Type mode). Pen tools explicitly activate drawing/stylus!
  const [currentTool, setCurrentTool] = useState<StylusToolType>('pan');
  const [currentColor, setCurrentColor] = useState<string>('#1E1E1E');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Current Drawing Stroke Ref
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);

  // Canvas Pan Interaction Ref (1-finger drag or mouse drag)
  const isPanningRef = useRef<boolean>(false);
  const lastPanPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);

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
  }, [activeProjectId, strokes, thoughts, canvasTexts, viewport, showToast]);

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
        const loadedViewport = target.viewport || { x: 200, y: 150, zoom: 1 };

        setActiveProjectId(target.id);
        activeProjectIdRef.current = target.id;
        activeProjectRef.current = target;
        saveActiveProjectId(target.id);

        strokesRef.current = loadedStrokes;
        thoughtsRef.current = loadedThoughts;
        canvasTextsRef.current = loadedCanvasTexts;
        viewportRef.current = loadedViewport;

        setStrokes(loadedStrokes);
        setThoughts(loadedThoughts);
        setCanvasTexts(loadedCanvasTexts);
        setViewport(loadedViewport);

        setHistory([{ strokes: loadedStrokes, thoughts: loadedThoughts, canvasTexts: loadedCanvasTexts }]);
        setHistoryIndex(0);
        setSelectedSentences([]);
        setActiveThoughtId(null);
        setActiveTextId(null);
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
    viewportRef.current = newNote.viewport;

    setStrokes([]);
    setThoughts([]);
    setCanvasTexts([]);
    setViewport(newNote.viewport);
    setHistory([{ strokes: [], thoughts: [], canvasTexts: [] }]);
    setHistoryIndex(0);
    setSelectedSentences([]);
    setActiveThoughtId(null);
    setActiveTextId(null);
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

  // Undo / Redo
  const pushHistory = useCallback(
    (newStrokes: Stroke[], newThoughts: AIThought[], newTexts: CanvasTextItem[] = canvasTextsRef.current) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({ strokes: newStrokes, thoughts: newThoughts, canvasTexts: newTexts });
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);

      // Auto-save project immediately
      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: newStrokes,
          thoughts: newThoughts,
          canvasTexts: newTexts,
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
      setHistoryIndex(historyIndex - 1);
      setSelectedSentences([]);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: prev.strokes,
          thoughts: prev.thoughts,
          canvasTexts: prev.canvasTexts || [],
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
      setHistoryIndex(historyIndex + 1);
      setSelectedSentences([]);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: next.strokes,
          thoughts: next.thoughts,
          canvasTexts: next.canvasTexts || [],
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

  // Support pasting copied text from outside at any time directly onto the canvas
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If user is currently typing in an active input/textarea, allow native browser paste inside the input!
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
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
      pushHistory(strokesRef.current, thoughtsRef.current, updatedTexts);
      showToast('Pasted note to canvas');
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [screenToCanvas, currentColor, pushHistory, showToast]);

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

      // If offline or network request failed, seamlessly invoke on-device offline intelligence!
      if (!textResult || !textResult.trim()) {
        const offlineRes = await generateOfflineAssistantThought(
          customPrompt || (conversationHistory.length > 0 ? 'Continue this note thought.' : 'Expand on notes.'),
          contextSnippet
        );
        textResult = offlineRes.text;
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

  // Tap on canvas in Move & Type mode to position cursor or edit text
  const handleCanvasTapToType = useCallback(
    (clientX: number, clientY: number) => {
      const canvasPos = screenToCanvas(clientX, clientY);

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
        setActiveTextId(clickedItem.id);
        setTimeout(() => {
          activeInputRef.current?.focus();
        }, 30);
      } else {
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
        pushHistory(strokesRef.current, thoughtsRef.current, updated);
        setActiveTextId(newId);

        setTimeout(() => {
          activeInputRef.current?.focus();
        }, 40);
      }
    },
    [screenToCanvas, currentColor, pushHistory]
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

    // 1. Draw Saved Strokes
    for (const stroke of strokes) {
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
  }, [viewport, strokes, thoughts, canvasTexts, activeTextId, currentTool, currentColor, strokeWidth]);

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

    if (isDoubleTap || currentTool === 'select') {
      handleSentenceSelectAtCanvasPoint(canvasPos);
      return;
    }

    // Move & Type mode (1-finger drag moves the canvas, single tap enables typing anywhere)
    // Stylus is NOT the default: only pen tools activate drawing!
    if (!isPenTool || isMiddleOrRight) {
      isPanningRef.current = true;
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
          pushHistory(nextStrokes, thoughtsRef.current, canvasTextsRef.current);
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
      className="relative w-full h-full overflow-hidden bg-[#FAF9F6] touch-none select-none"
    >
      {/* Top Notification Toast */}
      <TopToast message={toastMessage} />

      {/* Mode Indicator & S-Pen Palm Rejection Badge (Optimized for Samsung & Stylus Screens) */}
      <div className="fixed top-3 left-3 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            if (isPenTool) {
              setCurrentTool('pan');
              showToast('Switched to Move & Type Mode (1-Finger Drag)');
            } else {
              setCurrentTool('pen');
              showToast('Switched to Pen Mode (Stylus & Drawing)');
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md transition-all shadow-sm select-none border active:scale-95 ${
            isPenTool
              ? 'bg-neutral-900/90 text-white border-neutral-700/60 shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
              : 'bg-white/95 text-neutral-800 border-neutral-200/90 shadow-sm hover:bg-white'
          }`}
          title="Click to toggle between Move & Type and Pen Mode"
        >
          {isPenTool ? (
            isStylusDetected ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <PenTool className="w-3.5 h-3.5 text-indigo-400" />
            )
          ) : (
            <Hand className="w-3.5 h-3.5 text-amber-500" />
          )}
          <span>
            {isPenTool
              ? isStylusDetected
                ? 'Pen Mode • S-Pen Active'
                : 'Pen Mode (Stylus Active)'
              : 'Move & Type • 1-Finger Drag'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPenTool ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
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
        onExportPDF={() => exportCanvasToPDF(strokes, thoughts, canvasTexts, activeProject?.title || 'Note')}
        onExportPNG={async () => {
          const url = await exportCanvasToImage(strokes, thoughts, canvasTexts);
          const a = document.createElement('a');
          a.href = url;
          a.download = `stylus-canvas-${Date.now()}.png`;
          a.click();
          showToast('PNG Exported');
        }}
        onTriggerAssistant={handleTriggerAssistant}
        isConversationalActive={false}
        isAssistantThinking={thoughts.some((t) => t.status === 'thinking')}
        isOffline={isOffline}
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
        onNotify={showToast}
      />
    </div>
  );
};
