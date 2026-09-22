'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { SharedThoughtDocument, sendThoughtReaction } from '@/lib/thoughtspace-service';
import { parseOrGenerateThoughtCanvas } from '@/lib/thought-canvas-generator';
import {
  drawSmoothStroke,
  loadSavedProjects,
  saveProjectsToStorage,
  saveActiveProjectId,
} from '@/lib/canvas-utils';
import { useRouter } from 'next/navigation';
import {
  Stroke,
  Viewport,
  CanvasShapeItem,
  CanvasTextItem,
  CanvasChecklistItem,
  CanvasConnectorItem,
  CanvasImageItem,
  ProjectNote,
} from '@/types/canvas';
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Heart,
  Plus,
  Minus,
  Check,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Compass,
  Maximize2,
  RotateCcw,
  Copy,
  Sparkles,
} from 'lucide-react';

interface LiveThoughtFeedViewProps {
  thoughts: SharedThoughtDocument[];
  initialThoughtId: string;
  onClose: () => void;
}

function cubicEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const LiveThoughtFeedView: React.FC<LiveThoughtFeedViewProps> = ({
  thoughts,
  initialThoughtId,
  onClose,
}) => {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const idx = thoughts.findIndex((t) => t.id === initialThoughtId);
    return idx >= 0 ? idx : 0;
  });

  const activeThought = thoughts[currentIndex] || thoughts[0];
  const [remixSuccess, setRemixSuccess] = useState<boolean>(false);

  // Heavy sequential wave fade state
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'fading_out' | 'fading_in'>('idle');
  const [waveProgress, setWaveProgress] = useState<number>(1);
  const [waveDirection, setWaveDirection] = useState<'forward' | 'backward'>('forward');
  const animFrameRef = useRef<number | null>(null);

  // Time-machine replay state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replayStep, setReplayStep] = useState<number>(9999);
  const animIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Heart reaction state
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [likeBonus, setLikeBonus] = useState<number>(0);
  const [isLikingAnim, setIsLikingAnim] = useState<boolean>(false);

  // Author follow state
  const [isFollowed, setIsFollowed] = useState<boolean>(false);

  // Canvas element ref & Image cache
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Interactive Pan & Zoom State
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const touchDistRef = useRef<number>(0);
  const hasMovedSignificantRef = useRef<boolean>(false);

  // Parse all content for active thought
  const parsedCanvas = useMemo(() => {
    if (!activeThought) {
      return {
        strokes: [],
        canvasTexts: [],
        shapes: [],
        images: [],
        checklists: [],
        connectors: [],
        bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      };
    }
    return parseOrGenerateThoughtCanvas(
      activeThought.title,
      activeThought.category,
      activeThought.canvasPayload
    );
  }, [activeThought]);

  // Preload any images
  useEffect(() => {
    if (!parsedCanvas.images || parsedCanvas.images.length === 0) return;
    parsedCanvas.images.forEach((imgItem) => {
      if (!imgCacheRef.current.has(imgItem.src)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imgItem.src;
        img.onload = () => {
          imgCacheRef.current.set(imgItem.src, img);
          // Trigger redraw
          setReplayStep((s) => s);
        };
      }
    });
  }, [parsedCanvas.images]);

  // Chronological unified list of all items for full playback
  const unifiedItems = useMemo(() => {
    const list: {
      type: 'shape' | 'connector' | 'image' | 'checklist' | 'stroke' | 'text';
      item: any;
      order: number;
    }[] = [];

    parsedCanvas.shapes.forEach((s) => list.push({ type: 'shape', item: s, order: s.createdAt || 1 }));
    parsedCanvas.connectors.forEach((c) => list.push({ type: 'connector', item: c, order: c.createdAt || 2 }));
    parsedCanvas.images.forEach((i) => list.push({ type: 'image', item: i, order: i.createdAt || 3 }));
    parsedCanvas.checklists.forEach((c) => list.push({ type: 'checklist', item: c, order: c.createdAt || 4 }));
    parsedCanvas.strokes.forEach((s) => list.push({ type: 'stroke', item: s, order: s.timestamp || 5 }));
    parsedCanvas.canvasTexts.forEach((t) => list.push({ type: 'text', item: t, order: t.createdAt || 6 }));

    return list.sort((a, b) => a.order - b.order);
  }, [parsedCanvas]);

  const totalPlaybackSteps = unifiedItems.length;

  // Viewport calculation
  const computeViewportForBounds = useCallback((b: { minX: number; minY: number; maxX: number; maxY: number }): Viewport => {
    if (typeof window === 'undefined') return { x: 0, y: 0, zoom: 1 };
    const bw = Math.max(240, b.maxX - b.minX);
    const bh = Math.max(240, b.maxY - b.minY);
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const targetZoom = Math.min((screenW * 0.72) / bw, (screenH * 0.68) / bh, 1.25);
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    return {
      x: screenW / 2 - centerX * targetZoom,
      y: screenH / 2 - centerY * targetZoom,
      zoom: Math.max(0.3, targetZoom),
    };
  }, []);

  const [viewport, setViewport] = useState<Viewport>(() => computeViewportForBounds(parsedCanvas.bounds));
  const [isRadarOpen, setIsRadarOpen] = useState<boolean>(false);

  const fitThoughtToScreen = useCallback(() => {
    setViewport(computeViewportForBounds(parsedCanvas.bounds));
  }, [computeViewportForBounds, parsedCanvas.bounds]);

  // Handle Zoom In / Zoom Out
  const handleZoomIn = () => {
    setViewport((prev) => {
      const newZoom = Math.min(4, prev.zoom * 1.25);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        zoom: newZoom,
        x: cx - ((cx - prev.x) / prev.zoom) * newZoom,
        y: cy - ((cy - prev.y) / prev.zoom) * newZoom,
      };
    });
  };

  const handleZoomOut = () => {
    setViewport((prev) => {
      const newZoom = Math.max(0.2, prev.zoom * 0.8);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        zoom: newZoom,
        x: cx - ((cx - prev.x) / prev.zoom) * newZoom,
        y: cy - ((cy - prev.y) / prev.zoom) * newZoom,
      };
    });
  };

  const handleResetZoom = () => {
    setViewport((prev) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        zoom: 1,
        x: cx - ((cx - prev.x) / prev.zoom),
        y: cy - ((cy - prev.y) / prev.zoom),
      };
    });
  };

  // Heavy Sequential Wave Transition
  const navigateTo = useCallback(
    (newIndex: number, direction: 'forward' | 'backward' = 'forward') => {
      if (newIndex < 0 || newIndex >= thoughts.length || transitionPhase !== 'idle') return;

      setIsPlaying(false);
      setWaveDirection(direction);
      setTransitionPhase('fading_out');

      const startTime = performance.now();
      const fadeDuration = 520;

      const stepFadeOut = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / fadeDuration);
        const eased = cubicEase(progress);
        setWaveProgress(1 - eased);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(stepFadeOut);
        } else {
          const nextThought = thoughts[newIndex];
          const nextParsed = parseOrGenerateThoughtCanvas(
            nextThought.title,
            nextThought.category,
            nextThought.canvasPayload
          );
          setViewport(computeViewportForBounds(nextParsed.bounds));
          setCurrentIndex(newIndex);
          setReplayStep(9999);
          setHasLiked(false);
          setLikeBonus(0);
          setTransitionPhase('fading_in');

          const inStartTime = performance.now();
          const stepFadeIn = (inNow: number) => {
            const inElapsed = inNow - inStartTime;
            const inProgress = Math.min(1, inElapsed / fadeDuration);
            const inEased = cubicEase(inProgress);
            setWaveProgress(inEased);

            if (inProgress < 1) {
              animFrameRef.current = requestAnimationFrame(stepFadeIn);
            } else {
              setTransitionPhase('idle');
              setWaveProgress(1);
            }
          };
          animFrameRef.current = requestAnimationFrame(stepFadeIn);
        }
      };

      animFrameRef.current = requestAnimationFrame(stepFadeOut);
    },
    [thoughts, transitionPhase, computeViewportForBounds]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < thoughts.length - 1) {
      navigateTo(currentIndex + 1, 'forward');
    }
  }, [currentIndex, thoughts.length, navigateTo]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      navigateTo(currentIndex - 1, 'backward');
    }
  }, [currentIndex, navigateTo]);

  // Mouse drag & wheel zoom handlers on canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    hasMovedSignificantRef.current = false;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    touchStartRef.current = { x: e.clientX, y: e.clientY, time: performance.now() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    if (Math.hypot(dx, dy) > 2) {
      hasMovedSignificantRef.current = true;
    }

    setViewport((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsPanning(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
  };

  // Canvas Mouse Wheel for zooming into cursor position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // If ctrlKey or standard wheel: smooth zoom centered at pointer
      const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
      setViewport((prev) => {
        const newZoom = Math.max(0.2, Math.min(4.5, prev.zoom * zoomFactor));
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const canvasX = (mouseX - prev.x) / prev.zoom;
        const canvasY = (mouseY - prev.y) / prev.zoom;

        return {
          zoom: newZoom,
          x: mouseX - canvasX * newZoom,
          y: mouseY - canvasY * newZoom,
        };
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Touch gesture handler for mobile/tablet (Pinch to zoom + 1-finger pan + vertical swipe navigation)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      touchDistRef.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
    } else if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: performance.now(),
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistRef.current > 0) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const newDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const ratio = newDist / touchDistRef.current;
      touchDistRef.current = newDist;

      setViewport((prev) => {
        const newZoom = Math.max(0.2, Math.min(4.5, prev.zoom * ratio));
        const midX = (p1.clientX + p2.clientX) / 2;
        const midY = (p1.clientY + p2.clientY) / 2;
        const canvasX = (midX - prev.x) / prev.zoom;
        const canvasY = (midY - prev.y) / prev.zoom;
        return {
          zoom: newZoom,
          x: midX - canvasX * newZoom,
          y: midY - canvasY * newZoom,
        };
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1 && !hasMovedSignificantRef.current) {
      const touch = e.changedTouches[0];
      const dy = touch.clientY - touchStartRef.current.y;
      const dx = touch.clientX - touchStartRef.current.x;
      const elapsed = performance.now() - touchStartRef.current.time;

      // Fast vertical flick navigates thought
      if (elapsed < 350 && Math.abs(dy) > 60 && Math.abs(dx) < 50) {
        if (dy < 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        fitThoughtToScreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, onClose, fitThoughtToScreen]);

  // Automated living ink replay playback
  useEffect(() => {
    if (isPlaying) {
      animIntervalRef.current = setInterval(() => {
        setReplayStep((prev) => {
          if (prev >= totalPlaybackSteps) {
            setIsPlaying(false);
            return totalPlaybackSteps;
          }
          return prev + 1;
        });
      }, 90);
    } else if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
    }
    return () => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
  }, [isPlaying, totalPlaybackSteps]);

  // Render complete canvas with all elements (Strokes, Shapes, Texts, Images, Checklists, Connectors)
  useEffect(() => {
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

    // Warm infinite canvas background
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Dot grid
    const dotSpacing = 28 * viewport.zoom;
    if (dotSpacing >= 10 && dotSpacing <= 250) {
      const startX = ((viewport.x % dotSpacing) + dotSpacing) % dotSpacing;
      const startY = ((viewport.y % dotSpacing) + dotSpacing) % dotSpacing;
      const dotSize = Math.max(1, Math.min(2.0, 1.2 * viewport.zoom));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
      for (let x = startX; x < width; x += dotSpacing) {
        for (let y = startY; y < height; y += dotSpacing) {
          ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
        }
      }
    }

    // Apply Viewport Transform
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Coordinate bounds for sequential wave calculation
    const b = parsedCanvas.bounds;
    const minX = b.minX;
    const maxX = Math.max(minX + 200, b.maxX);

    // Sequential wave opacity helper
    const getWaveOpacity = (itemX: number) => {
      const normX = Math.max(0, Math.min(1, (itemX - minX) / (maxX - minX)));
      const directedNormX = waveDirection === 'forward' ? normX : 1 - normX;
      if (transitionPhase === 'fading_out') {
        const waveFront = waveProgress * 1.5;
        return Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      } else if (transitionPhase === 'fading_in') {
        const waveFront = waveProgress * 1.5;
        return Math.max(0, Math.min(1, (waveFront - directedNormX) * 3));
      }
      return 1;
    };

    // Filter items based on replayStep
    const visibleEntries = unifiedItems.slice(0, Math.min(unifiedItems.length, replayStep));

    // 1. Draw Shapes (Sticky notes, rectangles, ellipses)
    visibleEntries
      .filter((e) => e.type === 'shape')
      .forEach(({ item }: { item: CanvasShapeItem }) => {
        const opacity = getWaveOpacity(item.x);
        if (opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (item.type === 'sticky-note') {
          // Sticky note shadow
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.beginPath();
          ctx.roundRect(item.x + 3, item.y + 4, item.width, item.height, 12);
          ctx.fill();

          // Sticky note body
          ctx.fillStyle = item.fillColor || '#FEF3C7';
          ctx.beginPath();
          ctx.roundRect(item.x, item.y, item.width, item.height, 12);
          ctx.fill();

          ctx.strokeStyle = item.strokeColor || '#D97706';
          ctx.lineWidth = item.strokeWidth || 1.5;
          ctx.stroke();

          // Sticky note text
          if (item.text) {
            ctx.fillStyle = item.textColor || '#1E1E1E';
            ctx.font = `${item.fontSize || 14}px "Plus Jakarta Sans", sans-serif`;
            ctx.textBaseline = 'top';
            const lines = item.text.split('\n');
            lines.forEach((line, li) => {
              ctx.fillText(line, item.x + 14, item.y + 16 + li * 20);
            });
          }
        } else {
          // Generic shape
          ctx.fillStyle = item.fillColor || 'transparent';
          ctx.strokeStyle = item.strokeColor || '#1E1E1E';
          ctx.lineWidth = item.strokeWidth || 2;
          ctx.beginPath();
          if (item.type === 'circle') {
            ctx.ellipse(
              item.x + item.width / 2,
              item.y + item.height / 2,
              item.width / 2,
              item.height / 2,
              0,
              0,
              Math.PI * 2
            );
          } else {
            ctx.roundRect(item.x, item.y, item.width, item.height, 8);
          }
          if (item.fillColor && item.fillColor !== 'transparent') ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      });

    // 2. Draw Connectors (Lines and curves linking concepts)
    visibleEntries
      .filter((e) => e.type === 'connector')
      .forEach(({ item }: { item: CanvasConnectorItem }) => {
        const opacity = getWaveOpacity((item.from.x + item.to.x) / 2);
        if (opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = item.color || '#64748B';
        ctx.lineWidth = item.width || 2;
        ctx.beginPath();
        ctx.moveTo(item.from.x, item.from.y);

        if (item.style === 'curved') {
          const midX = (item.from.x + item.to.x) / 2;
          const midY = (item.from.y + item.to.y) / 2 - 20;
          ctx.quadraticCurveTo(midX, midY, item.to.x, item.to.y);
        } else {
          ctx.lineTo(item.to.x, item.to.y);
        }
        ctx.stroke();

        // Arrow head
        if (item.arrowHead === 'end' || item.arrowHead === 'both') {
          const angle = Math.atan2(item.to.y - item.from.y, item.to.x - item.from.x);
          ctx.fillStyle = item.color || '#64748B';
          ctx.beginPath();
          ctx.moveTo(item.to.x, item.to.y);
          ctx.lineTo(item.to.x - 12 * Math.cos(angle - Math.PI / 6), item.to.y - 12 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(item.to.x - 12 * Math.cos(angle + Math.PI / 6), item.to.y - 12 * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      });

    // 3. Draw Images
    visibleEntries
      .filter((e) => e.type === 'image')
      .forEach(({ item }: { item: CanvasImageItem }) => {
        const opacity = getWaveOpacity(item.x);
        if (opacity <= 0.01) return;

        const cachedImg = imgCacheRef.current.get(item.src);
        if (cachedImg && cachedImg.complete) {
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.drawImage(cachedImg, item.x, item.y, item.width, item.height);
          ctx.restore();
        }
      });

    // 4. Draw Checklist Cards
    visibleEntries
      .filter((e) => e.type === 'checklist')
      .forEach(({ item }: { item: CanvasChecklistItem }) => {
        const opacity = getWaveOpacity(item.x);
        if (opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = opacity;

        const cardH = 44 + item.items.length * 28;
        // Background card
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, item.width, cardH, 14);
        ctx.fill();
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Card Title
        ctx.fillStyle = '#1E1E1E';
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(item.title, item.x + 14, item.y + 24);

        // Card Items
        item.items.forEach((entry, idx) => {
          const itemY = item.y + 44 + idx * 26;

          // Checkbox circle/square
          ctx.strokeStyle = entry.completed ? '#10B981' : '#94A3B8';
          ctx.fillStyle = entry.completed ? '#10B981' : 'transparent';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(item.x + 14, itemY, 14, 14, 3);
          if (entry.completed) ctx.fill();
          ctx.stroke();

          // Text
          ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = entry.completed ? '#94A3B8' : '#334155';
          ctx.fillText(entry.text, item.x + 36, itemY + 11);

          if (entry.completed) {
            // Strikethrough
            const textWidth = ctx.measureText(entry.text).width;
            ctx.strokeStyle = '#94A3B8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(item.x + 36, itemY + 6);
            ctx.lineTo(item.x + 36 + textWidth, itemY + 6);
            ctx.stroke();
          }
        });

        ctx.restore();
      });

    // 5. Draw Handwritten Strokes
    visibleEntries
      .filter((e) => e.type === 'stroke')
      .forEach(({ item }: { item: Stroke }) => {
        const strokeMidX = item.bounds ? (item.bounds.minX + item.bounds.maxX) / 2 : minX;
        const opacity = getWaveOpacity(strokeMidX);
        if (opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        drawSmoothStroke(ctx, item);
        ctx.restore();
      });

    // 6. Draw Handwritten Canvas Texts
    visibleEntries
      .filter((e) => e.type === 'text')
      .forEach(({ item }: { item: CanvasTextItem }) => {
        const opacity = getWaveOpacity(item.x);
        if (opacity <= 0.01) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.font = `600 ${item.fontSize || 22}px "Kalam", "Caveat", cursive`;
        ctx.fillStyle = item.color || '#1E1E1E';
        ctx.textBaseline = 'top';
        ctx.fillText(item.text, item.x, item.y);
        ctx.restore();
      });

    ctx.restore();
  }, [viewport, parsedCanvas, unifiedItems, replayStep, waveProgress, transitionPhase, waveDirection]);

  // Handle Heart reaction
  const handleToggleHeart = async () => {
    if (hasLiked) return;
    setHasLiked(true);
    setLikeBonus(1);
    setIsLikingAnim(true);
    setTimeout(() => setIsLikingAnim(false), 700);

    if (activeThought?.id) {
      await sendThoughtReaction(activeThought.id, 'resonate');
    }
  };

  // Remix thought to user's personal canvas library
  const handleRemixToMyCanvases = useCallback(() => {
    if (!activeThought) return;
    const currentList = loadSavedProjects();
    const newId = `remix-${Date.now()}`;
    const newCanvas: ProjectNote = {
      id: newId,
      title: `Remix: ${activeThought.title}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      strokes: parsedCanvas.strokes || [],
      thoughts: [],
      canvasTexts: parsedCanvas.canvasTexts || [],
      images: parsedCanvas.images || [],
      shapes: parsedCanvas.shapes || [],
      checklists: parsedCanvas.checklists || [],
      connectors: parsedCanvas.connectors || [],
      viewport: { x: 200, y: 150, zoom: 1 },
    };

    const updated = [newCanvas, ...currentList];
    saveProjectsToStorage(updated);
    saveActiveProjectId(newId);

    setRemixSuccess(true);
    setTimeout(() => {
      router.push('/');
    }, 800);
  }, [activeThought, parsedCanvas, router]);

  const displayLikeCount = (activeThought?.reactionCount || 12) + likeBonus;
  const displayName =
    activeThought?.authorName ||
    (activeThought?.authorAnonymousId
      ? activeThought.authorAnonymousId.replace(/_/g, ' ')
      : 'Anonymous');
  const authorInit = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-[#FAF9F6] text-neutral-900 overflow-hidden select-none"
    >
      {/* Interactive Fullscreen Live Canvas (Pan & Zoom enabled) */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`absolute inset-0 z-0 w-full h-full block ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        } touch-none`}
      />

      {/* 1. TOP FLOATING BAR: Back to 2D Map, Title, and Remix Action */}
      <div className="fixed top-5 left-4 sm:left-6 right-4 sm:right-6 z-40 pointer-events-none flex items-center justify-between">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onClose}
            title="Back to 2D Map"
            className="p-3 rounded-full bg-white/95 hover:bg-white text-neutral-700 hover:text-neutral-950 border border-neutral-200/80 shadow-md backdrop-blur-md transition-all cursor-pointer active:scale-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="hidden sm:flex flex-col px-3 py-1 bg-white/90 rounded-2xl border border-neutral-200/70 shadow-xs backdrop-blur-md">
            <h3 className="text-xs font-bold text-neutral-900 truncate max-w-[240px]">
              {activeThought?.title}
            </h3>
            <span className="text-[10px] text-neutral-500">
              by {displayName} • {activeThought?.category}
            </span>
          </div>
        </div>

        {/* Remix to My Canvases Action Button */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleRemixToMyCanvases}
            disabled={remixSuccess}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold shadow-md transition-all cursor-pointer active:scale-95 ${
              remixSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white'
            }`}
            title="Copy and save this thought as an editable personal canvas"
          >
            {remixSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Saved to My Canvases! Opening...</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Remix to Canvas</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. PINNED FLOATING ITEMS: Right-End Vertical Controls (Thought Switching) */}
      <div className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3.5 pointer-events-auto">
        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest pointer-events-none rotate-90 my-2">
          Streams
        </span>

        {/* Author Avatar */}
        <div
          onClick={() => setIsFollowed(!isFollowed)}
          title={isFollowed ? 'Connected with author' : 'Connect with author'}
          className="relative cursor-pointer group active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-200 via-rose-200 to-indigo-200 p-0.5 shadow-md">
            <div className="w-full h-full rounded-full bg-white text-neutral-800 flex items-center justify-center font-bold text-xs tracking-wider">
              {authorInit}
            </div>
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-xs transition-all ${
              isFollowed ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'
            }`}
          >
            {isFollowed ? (
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            ) : (
              <Plus className="w-2.5 h-2.5 stroke-[3]" />
            )}
          </div>
        </div>

        {/* Up Arrow: Previous Thought */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0 || transitionPhase !== 'idle'}
          title="Previous Thought in Feed (Swipe up)"
          className={`p-3 rounded-full bg-white/95 text-neutral-700 border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer ${
            currentIndex === 0
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white hover:text-neutral-950 active:scale-90'
          }`}
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        {/* Love / Resonate Icon */}
        <button
          type="button"
          onClick={handleToggleHeart}
          title="Resonate"
          className="flex flex-col items-center gap-1 p-3 rounded-full bg-white/95 hover:bg-white border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer active:scale-90"
        >
          <Heart
            className={`w-5 h-5 transition-transform ${
              hasLiked
                ? 'text-rose-500 fill-rose-500'
                : 'text-neutral-600 hover:text-rose-500'
            } ${isLikingAnim ? 'scale-130' : 'scale-100'}`}
          />
          <span className="text-[10px] font-bold text-neutral-600 leading-none">
            {displayLikeCount}
          </span>
        </button>

        {/* Down Arrow: Next Thought */}
        <button
          type="button"
          onClick={handleNext}
          disabled={currentIndex >= thoughts.length - 1 || transitionPhase !== 'idle'}
          title="Next Thought in Feed (Swipe down)"
          className={`p-3 rounded-full bg-white/95 text-neutral-700 border border-neutral-200/90 shadow-md backdrop-blur-md transition-all cursor-pointer ${
            currentIndex >= thoughts.length - 1
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:bg-white hover:text-neutral-950 active:scale-90'
          }`}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      {/* 3. PINNED FLOATING TIMELAPSE REPLAY TOOL: Bottom Center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2 sm:gap-2.5 px-3.5 sm:px-4 py-2 rounded-full bg-white/95 border border-neutral-200/90 shadow-lg backdrop-blur-md max-w-[92vw]">
        <div className="hidden md:flex items-center gap-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider pr-1 border-r border-neutral-200">
          <span>Replay</span>
        </div>

        {/* Step back */}
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setReplayStep((s) => Math.max(0, s - 1));
          }}
          title="Step back in creation timeline"
          className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer active:scale-90"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={() => {
            if (replayStep >= totalPlaybackSteps) {
              setReplayStep(0);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
          title={isPlaying ? 'Pause replay' : 'Play creation timelapse'}
          className="p-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full transition-all cursor-pointer shadow-xs active:scale-90"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        {/* Step forward */}
        <button
          type="button"
          onClick={() => {
            setIsPlaying(false);
            setReplayStep((s) => Math.min(totalPlaybackSteps, s + 1));
          }}
          title="Step forward in creation timeline"
          className="p-1.5 hover:bg-neutral-100 rounded-full text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer active:scale-90"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Scrubber slider */}
        <input
          type="range"
          min={0}
          max={Math.max(1, totalPlaybackSteps)}
          value={Math.min(replayStep, totalPlaybackSteps)}
          onChange={(e) => {
            setIsPlaying(false);
            setReplayStep(Number(e.target.value));
          }}
          className="w-20 sm:w-36 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
        />

        {/* Step Indicator */}
        <span className="text-[11px] font-mono font-medium text-neutral-600 whitespace-nowrap">
          {Math.min(replayStep, totalPlaybackSteps)} / {totalPlaybackSteps}
        </span>
      </div>

      {/* 4. PINNED FLOATING MINI-VIEWPORT & ZOOM TOOLS: Bottom-Right */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-40 pointer-events-auto flex items-center gap-2">
        {/* Floating Zoom Controls (+, -, 1:1, Fit) */}
        <div className="flex items-center bg-white/95 border border-neutral-200/90 shadow-md backdrop-blur-md rounded-full px-1 py-0.5">
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out (-)"
            className="p-1.5 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-full cursor-pointer active:scale-90"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-neutral-600 px-1 min-w-[38px] text-center">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In (+)"
            className="p-1.5 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-full cursor-pointer active:scale-90"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3 bg-neutral-200 mx-0.5" />
          <button
            type="button"
            onClick={fitThoughtToScreen}
            title="Fit to Screen (0)"
            className="p-1.5 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 rounded-full cursor-pointer active:scale-90"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        {/* Mini-Radar Viewport toggle */}
        {!isRadarOpen ? (
          <button
            type="button"
            onClick={() => setIsRadarOpen(true)}
            title="Open mini-viewport radar"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white/95 border border-neutral-200/90 shadow-md backdrop-blur-md transition-colors active:scale-95 cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        ) : (
          <div className="p-2.5 rounded-2xl bg-white/95 border border-neutral-200/90 shadow-xl backdrop-blur-md flex flex-col items-end gap-1.5 animate-in fade-in zoom-in-95">
            <div className="w-full flex items-center justify-between pb-1 border-b border-neutral-100 text-[11px] font-medium text-neutral-500">
              <span className="flex items-center gap-1 text-neutral-700">
                <Compass className="w-3 h-3 text-neutral-500" />
                Viewport
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset to 100%"
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRadarOpen(false)}
                  title="Close mini-viewport"
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              onClick={fitThoughtToScreen}
              className="w-32 h-20 bg-neutral-50 border border-neutral-200 rounded-lg relative overflow-hidden flex items-center justify-center cursor-pointer group"
              title="Click to re-center"
            >
              <div className="w-14 h-10 border border-blue-500/80 bg-blue-500/10 rounded group-hover:scale-105 transition-transform" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
