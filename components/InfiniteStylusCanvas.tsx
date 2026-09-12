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
} from '@/lib/canvas-utils';
import { LiquidBottomDock } from '@/components/LiquidBottomDock';
import { ThoughtBubbleOffScreen } from '@/components/ThoughtBubbleOffScreen';
import { ProjectsDrawer } from '@/components/ProjectsDrawer';
import { TopToast } from '@/components/TopToast';
import { SentenceCopyOverlay } from '@/components/SentenceCopyOverlay';

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
    activeProjectIdRef.current = activeProjectId;
    activeProjectRef.current = activeProject;
  }, [activeProjectId, activeProject]);

  // History for Undo / Redo
  const [history, setHistory] = useState<{ strokes: Stroke[]; thoughts: AIThought[] }[]>(() => {
    const list = loadSavedProjects();
    const savedId = loadActiveProjectId();
    const proj = list.find((p) => p.id === savedId) || list[0];
    return [{ strokes: proj?.strokes || [], thoughts: proj?.thoughts || [] }];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Stylus Tools State
  const [currentTool, setCurrentTool] = useState<StylusToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#1E1E1E');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Current Drawing Stroke Ref
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);

  // Canvas Pan Interaction Ref (mouse drag or pan tool)
  const isPanningRef = useRef<boolean>(false);
  const lastPanPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Multi-Touch Two-Finger Tracking (Pinch-to-Scale & Pan Move Anywhere)
  const activePointersRef = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  const twoFingerGestureRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialMidpoint: { x: number; y: number };
    initialViewport: Viewport;
  } | null>(null);

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
          viewport: viewportRef.current,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Compute off-screen thought bubble position dynamically
  const offScreenBubble = useMemo(() => {
    if (!activeThoughtId) {
      return { visible: false, screenX: 0, screenY: 0, angleRad: 0, targetCanvasX: 0, targetCanvasY: 0 };
    }

    const thought = thoughts.find((t) => t.id === activeThoughtId);
    if (!thought) {
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
  }, [activeProjectId, strokes, thoughts, viewport, showToast]);

  // Switch Active Project
  const handleSelectProject = useCallback(
    (id: string) => {
      handleSaveProject();

      const target = projects.find((p) => p.id === id);
      if (target) {
        setActiveProjectId(target.id);
        saveActiveProjectId(target.id);
        setStrokes(target.strokes || []);
        setThoughts(target.thoughts || []);
        setViewport(target.viewport || { x: 200, y: 150, zoom: 1 });
        setHistory([{ strokes: target.strokes || [], thoughts: target.thoughts || [] }]);
        setHistoryIndex(0);
        setSelectedSentences([]);
        setActiveThoughtId(null);
      }
    },
    [projects, handleSaveProject]
  );

  // New Project
  const handleNewProject = useCallback(() => {
    handleSaveProject();
    const newId = `proj-${Date.now()}`;
    const newNote: ProjectNote = {
      id: newId,
      title: `Idea Stream ${projects.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      strokes: [],
      thoughts: [],
      viewport: { x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 150, zoom: 1 },
    };

    const updated = [newNote, ...projects];
    setProjects(updated);
    saveProjectsToStorage(updated);
    setActiveProjectId(newId);
    saveActiveProjectId(newId);
    setStrokes([]);
    setThoughts([]);
    setViewport(newNote.viewport);
    setHistory([{ strokes: [], thoughts: [] }]);
    setHistoryIndex(0);
    setSelectedSentences([]);
    setActiveThoughtId(null);
    showToast('New board ready');
  }, [projects, handleSaveProject, showToast]);

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
    (newStrokes: Stroke[], newThoughts: AIThought[]) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push({ strokes: newStrokes, thoughts: newThoughts });
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);

      // Auto-save project immediately
      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: newStrokes,
          thoughts: newThoughts,
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
      setHistoryIndex(historyIndex - 1);
      setSelectedSentences([]);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: prev.strokes,
          thoughts: prev.thoughts,
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
      setHistoryIndex(historyIndex + 1);
      setSelectedSentences([]);

      if (activeProjectRef.current) {
        autoSaveSingleProject({
          ...activeProjectRef.current,
          strokes: next.strokes,
          thoughts: next.thoughts,
          viewport: viewportRef.current,
        });
      }
    }
  }, [history, historyIndex]);

  // Convert Screen coordinate to Canvas Coordinate
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      return {
        x: (screenX - viewport.x) / viewport.zoom,
        y: (screenY - viewport.y) / viewport.zoom,
      };
    },
    [viewport]
  );

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

  // Trigger AI Assistant (Brainstorm response in organic handwriting)
  const triggerAssistantResponse = useCallback(
    async (targetPoint?: { x: number; y: number }, customPrompt?: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        showToast('Offline: Assistant needs internet. Notes are safely saved.');
        return;
      }

      let spawnX = targetPoint?.x ?? 0;
      let spawnY = targetPoint?.y ?? 0;

      if (!targetPoint) {
        if (strokes.length > 0) {
          const lastStroke = strokes[strokes.length - 1];
          spawnX = lastStroke.bounds.minX;
          spawnY = lastStroke.bounds.maxY + 40;
        } else {
          const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
          spawnX = center.x - 100;
          spawnY = center.y;
        }
      }

      const thoughtId = `thought-${Date.now()}`;
      const newThought: AIThought = {
        id: thoughtId,
        x: spawnX,
        y: spawnY,
        status: 'thinking',
        prompt: customPrompt || 'Assistant continuing user thoughts...',
        text: '',
        sentences: [],
        revealedCount: 0,
        color: currentColor === '#1E1E1E' ? '#262626' : currentColor,
        fontFamily: 'Kalam',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        bounds: { minX: spawnX, minY: spawnY, maxX: spawnX + 100, maxY: spawnY + 40 },
      };

      const nextThoughts = [...thoughts, newThought];
      setThoughts(nextThoughts);
      setActiveThoughtId(thoughtId);
      showToast('Assistant writing...');

      const contextSnippet = thoughts.map((t) => t.text).join(' \n ');

      try {
        const res = await fetch('/api/gemini/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: customPrompt || 'Expand on my current thoughts and continue organic brainstorming notes.',
            canvasContext: contextSnippet,
          }),
        });

        const data = await res.json();
        const textResult = data.text || data.fallbackText || 'Exploring organic connections and fluid visual notes.';

        const layout = layoutHandwrittenText(textResult, spawnX, spawnY);

        setThoughts((prev) =>
          prev.map((t) =>
            t.id === thoughtId
              ? {
                  ...t,
                  status: 'writing',
                  text: textResult,
                  sentences: layout.sentences,
                  bounds: layout.totalBounds,
                  revealedCount: 0,
                }
              : t
          )
        );

        let currentRevealed = 0;
        const totalChars = textResult.length;
        const revealInterval = setInterval(() => {
          currentRevealed += 3;
          if (currentRevealed >= totalChars) {
            clearInterval(revealInterval);
            const finishedThoughts = nextThoughts.map((t) =>
              t.id === thoughtId ? { ...t, status: 'completed' as const, revealedCount: totalChars } : t
            );
            setThoughts(finishedThoughts);
            pushHistory(strokes, finishedThoughts);
          } else {
            setThoughts((prev) =>
              prev.map((t) =>
                t.id === thoughtId ? { ...t, revealedCount: currentRevealed } : t
              )
            );
          }
        }, 30);
      } catch (err) {
        console.error('AI assistant error:', err);
        const fallbackText = 'Connecting concepts: tactile feedback, infinite scale, and offline resilience.';
        const fallbackLayout = layoutHandwrittenText(fallbackText, spawnX, spawnY);
        const fallbackThoughts = nextThoughts.map((t) =>
          t.id === thoughtId
            ? {
                ...t,
                status: 'completed' as const,
                text: fallbackText,
                sentences: fallbackLayout.sentences,
                bounds: fallbackLayout.totalBounds,
                revealedCount: fallbackText.length,
              }
            : t
        );
        setThoughts(fallbackThoughts);
        pushHistory(strokes, fallbackThoughts);
      }
    },
    [strokes, thoughts, currentColor, screenToCanvas, showToast, pushHistory]
  );

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
    const ctx = canvas.getContext('2d');
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
      const activeStroke: Stroke = {
        id: 'active',
        points: currentStrokeRef.current,
        color: currentColor,
        width: strokeWidth,
        tool: currentTool,
        timestamp: Date.now(),
        bounds: calculateStrokeBounds(currentStrokeRef.current),
      };
      drawSmoothStroke(ctx, activeStroke);
    }

    // 3. Draw AI Thoughts (Organic Inner-Self Handwriting)
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

        let charCount = 0;
        const maxChars = thought.revealedCount ?? thought.text.length;

        for (const sentence of thought.sentences) {
          if (charCount >= maxChars) break;

          const sliceLength = Math.max(0, maxChars - charCount);
          const visibleSnippet = sentence.text.slice(0, sliceLength);

          ctx.save();
          ctx.globalAlpha = 0.94;
          ctx.fillText(visibleSnippet, sentence.x, sentence.y);
          ctx.restore();

          charCount += sentence.text.length;
        }
      }
    }

    ctx.restore();
  }, [viewport, strokes, thoughts, currentTool, currentColor, strokeWidth]);

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

  // Pointer Down (Stylus Pen, Finger Touch, Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Record this pointer
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // Multi-touch two-finger detection (Pinch to scale/reduce & move anywhere)
    const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
    if (touchPointers.length >= 2) {
      // Two fingers on screen: cancel any in-progress drawing stroke immediately
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

    const isStylus = e.pointerType === 'pen';
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

    if (isDoubleTap || currentTool === 'select') {
      handleSentenceSelectAtCanvasPoint(canvasPos);
      return;
    }

    if (currentTool === 'pan' || isMiddleOrRight) {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: screenX, y: screenY };
      return;
    }

    // Start drawing (with stylus or single finger)
    isDrawingRef.current = true;
    activePointerIdRef.current = e.pointerId;

    const pressure = isStylus ? e.pressure || 0.5 : 0.5;
    currentStrokeRef.current = [
      {
        x: canvasPos.x,
        y: canvasPos.y,
        pressure,
        time: now,
      },
    ];
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Update pointer position
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // Handle two-finger pinch-to-scale and move anywhere
    const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
    if (touchPointers.length >= 2 && twoFingerGestureRef.current) {
      const p1 = touchPointers[0];
      const p2 = touchPointers[1];
      const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const currentMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const { initialDistance, initialZoom, initialMidpoint, initialViewport } = twoFingerGestureRef.current;
      const scaleRatio = currentDist / initialDistance;
      const newZoom = Math.min(4.5, Math.max(0.18, initialZoom * scaleRatio));

      // Focal point on canvas
      const focalCanvasX = (initialMidpoint.x - initialViewport.x) / initialViewport.zoom;
      const focalCanvasY = (initialMidpoint.y - initialViewport.y) / initialViewport.zoom;

      // Two-finger pan translation delta
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

    const screenX = e.clientX;
    const screenY = e.clientY;

    if (isPanningRef.current) {
      const dx = screenX - lastPanPointRef.current.x;
      const dy = screenY - lastPanPointRef.current.y;
      setViewport((prev) => {
        const nextV = { ...prev, x: prev.x + dx, y: prev.y + dy };
        viewportRef.current = nextV;
        return nextV;
      });
      lastPanPointRef.current = { x: screenX, y: screenY };
      return;
    }

    if (isDrawingRef.current && activePointerIdRef.current === e.pointerId) {
      const isStylus = e.pointerType === 'pen';
      const pressure = isStylus ? e.pressure || 0.5 : 0.5;
      const canvasPos = screenToCanvas(screenX, screenY);

      currentStrokeRef.current.push({
        x: canvasPos.x,
        y: canvasPos.y,
        pressure,
        time: Date.now(),
      });
    }
  };

  // Pointer Up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    // If active touch pointers drop below 2, end two-finger gesture
    const touchPointers = Array.from(activePointersRef.current.values()).filter((p) => p.type === 'touch');
    if (touchPointers.length < 2) {
      twoFingerGestureRef.current = null;
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isDrawingRef.current && activePointerIdRef.current === e.pointerId) {
      isDrawingRef.current = false;
      activePointerIdRef.current = null;

      const points = currentStrokeRef.current;
      if (points.length > 0) {
        if (currentTool === 'eraser') {
          const eraserRadius = 18;
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
            pushHistory(filtered, thoughts);
            return filtered;
          });
        } else {
          const newStroke: Stroke = {
            id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            points: [...points],
            color: currentColor,
            width: strokeWidth,
            tool: currentTool,
            timestamp: Date.now(),
            bounds: calculateStrokeBounds(points),
          };

          const nextStrokes = [...strokes, newStroke];
          setStrokes(nextStrokes);
          pushHistory(nextStrokes, thoughts);
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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#FAF9F6] touch-none select-none"
    >
      {/* Top Notification Toast */}
      <TopToast message={toastMessage} />

      {/* Infinite Canvas */}
      <canvas
        id="infinite-stylus-canvas"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        style={{ touchAction: 'none' }}
      />

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
        onExportPDF={() => exportCanvasToPDF(strokes, thoughts, activeProject?.title || 'Note')}
        onExportPNG={async () => {
          const url = await exportCanvasToImage(strokes, thoughts);
          const a = document.createElement('a');
          a.href = url;
          a.download = `stylus-canvas-${Date.now()}.png`;
          a.click();
          showToast('PNG Exported');
        }}
        onTriggerAssistant={() => triggerAssistantResponse()}
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
