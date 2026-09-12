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
import { ConversationalAssistantBar } from '@/components/ConversationalAssistantBar';
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

  // Samsung S-Pen & Stylus Digitizer Integration with Palm Rejection
  const [isStylusDetected, setIsStylusDetected] = useState<boolean>(false);
  const [isPalmRejectionActive, setIsPalmRejectionActive] = useState<boolean>(true);
  const isPenInContactRef = useRef<boolean>(false);
  const lastPenTimeRef = useRef<number>(0);
  const isStylusEraserRef = useRef<boolean>(false);

  // Assistant & Off-Screen Thought Bubble State
  const [activeThoughtId, setActiveThoughtId] = useState<string | null>(null);
  const [isConversationalActive, setIsConversationalActive] = useState<boolean>(false);

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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        showToast('Offline: Assistant needs internet. Notes are safely saved.');
        return;
      }

      let spawnX = targetPoint?.x ?? 0;
      let spawnY = targetPoint?.y ?? 0;

      if (!targetPoint) {
        const completedThoughts = thoughtsRef.current.filter((t) => t.text && t.text.trim());
        if (completedThoughts.length > 0) {
          const lastThought = completedThoughts[completedThoughts.length - 1];
          spawnX = lastThought.x;
          spawnY = lastThought.bounds.maxY + 36;
        } else if (strokesRef.current.length > 0) {
          const lastStroke = strokesRef.current[strokesRef.current.length - 1];
          spawnX = lastStroke.bounds.minX;
          spawnY = lastStroke.bounds.maxY + 36;
        } else {
          const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
          spawnX = center.x - 120;
          spawnY = center.y - 40;
        }
      }

      // Smoothly pan canvas to keep newly writing thought within comfortable view
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
        prompt: customPrompt || 'Assistant continuing dialogue...',
        text: '',
        sentences: [],
        revealedCount: 0,
        color: currentColor === '#1E1E1E' ? '#262626' : currentColor,
        fontFamily: 'Kalam',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        bounds: { minX: spawnX, minY: spawnY, maxX: spawnX + 160, maxY: spawnY + 40 },
      };

      setThoughts((prev) => [...prev, newThought]);
      setActiveThoughtId(thoughtId);
      showToast('Assistant writing in ink...');

      // Gather ongoing conversation history so back-and-forth context is preserved
      const conversationHistory = thoughtsRef.current
        .filter((t) => t.text && t.text.trim())
        .map((t) => ({
          prompt: t.prompt,
          response: t.text,
        }));
      const contextSnippet = thoughtsRef.current.map((t) => t.text).join(' \n ');

      try {
        const res = await fetch('/api/gemini/assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: customPrompt || (conversationHistory.length > 0 ? 'Continue our conversational thread.' : 'Expand on my current thoughts and continue organic brainstorming notes.'),
            canvasContext: contextSnippet,
            conversationHistory,
          }),
        });

        const data = await res.json();
        const textResult = data.text || data.fallbackText || 'Continuing this thread: explore core structures, intuitive flow, and organic tactile clarity.';

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

        // Sequential fade-in timing: sentences smoothly reveal one by one over ~900ms per sentence
        const totalWritingDuration = Math.max(1400, (layout.sentences.length - 1) * 900 + 750);
        setTimeout(() => {
          setThoughts((prev) => {
            const updated = prev.map((t) =>
              t.id === thoughtId ? { ...t, status: 'completed' as const } : t
            );
            pushHistory(strokesRef.current, updated);
            return updated;
          });
        }, totalWritingDuration);
      } catch (err) {
        console.error('AI assistant error:', err);
        const fallbackText = 'Connecting ideas: tactile feedback, infinite scale, and seamless continuity.';
        const fallbackLayout = layoutHandwrittenText(fallbackText, spawnX, spawnY);
        const writingStartTime = Date.now();

        setThoughts((prev) =>
          prev.map((t) =>
            t.id === thoughtId
              ? {
                  ...t,
                  status: 'writing' as const,
                  text: fallbackText,
                  sentences: fallbackLayout.sentences,
                  bounds: fallbackLayout.totalBounds,
                  revealedCount: fallbackText.length,
                  writingStartTime,
                }
              : t
          )
        );

        setTimeout(() => {
          setThoughts((prev) => {
            const updated = prev.map((t) =>
              t.id === thoughtId ? { ...t, status: 'completed' as const } : t
            );
            pushHistory(strokesRef.current, updated);
            return updated;
          });
        }, 1500);
      }
    },
    [currentColor, screenToCanvas, showToast, pushHistory]
  );

  // Toggle Conversational Flow Mode
  const handleToggleConversational = useCallback(() => {
    setIsConversationalActive((prev) => {
      const next = !prev;
      if (next) {
        showToast('Conversational Mode: Active. Write notes or reply to continue.');
        const completedThoughts = thoughtsRef.current.filter((t) => t.text && t.text.trim());
        if (completedThoughts.length === 0 && strokesRef.current.length === 0) {
          triggerAssistantResponse(undefined, 'Ready to brainstorm together. Write or sketch on the canvas, or ask anything to begin.');
        } else if (strokesRef.current.length > 0) {
          triggerAssistantResponse(undefined, 'Respond to and continue my handwritten notes on the canvas.');
        }
      } else {
        showToast('Conversation paused. All thoughts and notes are saved.');
      }
      return next;
    });
  }, [showToast, triggerAssistantResponse]);

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

        const now = Date.now();
        const startTime = thought.writingStartTime || thought.createdAt;

        for (let sIdx = 0; sIdx < thought.sentences.length; sIdx++) {
          const sentence = thought.sentences[sIdx];
          const sentenceDelay = sIdx * 900; // 900ms stagger between sentences for readable, sequential fade-in
          const elapsed = now - (startTime + sentenceDelay);

          if (thought.status === 'writing' && elapsed < 0) {
            // Sequential reveal: sentence has not started fading in yet
            continue;
          }

          let alpha = 0.94;
          let offsetY = 0;

          if (thought.status === 'writing') {
            const fadeProgress = Math.min(1, Math.max(0, elapsed / 700)); // 700ms smooth fade-in
            // Smooth ease-out quad
            const eased = 1 - Math.pow(1 - fadeProgress, 2);
            alpha = Math.max(0.04, eased * 0.94);
            offsetY = (1 - eased) * 4; // subtle 4px float into place
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

    if (isDoubleTap || currentTool === 'select') {
      handleSentenceSelectAtCanvasPoint(canvasPos);
      return;
    }

    if (currentTool === 'pan' || isMiddleOrRight) {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: screenX, y: screenY };
      return;
    }

    // If Palm Rejection is active and stylus is detected, single finger touches pan the canvas instead of drawing
    if (isTouch && isPalmRejectionActive && isStylusDetected) {
      isPanningRef.current = true;
      lastPanPointRef.current = { x: screenX, y: screenY };
      return;
    }

    // Start drawing (with stylus or touch)
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
            pushHistory(filtered, thoughtsRef.current);
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
          pushHistory(nextStrokes, thoughtsRef.current);
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

      {/* S-Pen / Stylus Palm Rejection Mode Badge (Optimized for Samsung & Stylus Screens) */}
      <div className="fixed top-3 left-3 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setIsPalmRejectionActive((prev) => {
              const next = !prev;
              showToast(
                next
                  ? 'Palm Rejection: ON (Only S-Pen draws, palm ignored)'
                  : 'Palm Rejection: OFF (Finger + Stylus both draw)'
              );
              return next;
            });
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md transition-all shadow-sm select-none border active:scale-95 ${
            isStylusDetected
              ? isPalmRejectionActive
                ? 'bg-neutral-900/90 text-white border-neutral-700/60 shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
                : 'bg-white/90 text-neutral-700 border-neutral-200/80 hover:bg-white'
              : isPalmRejectionActive
              ? 'bg-white/90 text-neutral-700 border-neutral-200/80 hover:bg-white'
              : 'bg-white/70 text-neutral-400 border-neutral-200/60'
          }`}
          title="Toggle Palm Rejection mode"
        >
          {isStylusDetected ? (
            isPalmRejectionActive ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Hand className="w-3.5 h-3.5 text-amber-500" />
            )
          ) : (
            <PenTool className="w-3.5 h-3.5 text-neutral-500" />
          )}
          <span>
            {isStylusDetected
              ? isPalmRejectionActive
                ? 'S-Pen • Palm Rejection ON'
                : 'S-Pen • Touch Draw ON'
              : isPalmRejectionActive
              ? 'Stylus Mode (Palm Reject)'
              : 'Touch + Pen Mode'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isStylusDetected
                ? isPalmRejectionActive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
                : 'bg-neutral-300'
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

      {/* Conversational Mode Floating Bar */}
      <ConversationalAssistantBar
        isActive={isConversationalActive}
        isThinking={thoughts.some((t) => t.status === 'thinking')}
        onSend={(msg) => triggerAssistantResponse(undefined, msg)}
        onClose={() => {
          setIsConversationalActive(false);
          showToast('Conversation ended. All thoughts saved.');
        }}
        hasCanvasInk={strokes.length > 0}
        onRespondToInk={() => triggerAssistantResponse(undefined, 'Respond to and continue my handwritten notes on the canvas.')}
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
        onTriggerAssistant={handleToggleConversational}
        isConversationalActive={isConversationalActive}
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
