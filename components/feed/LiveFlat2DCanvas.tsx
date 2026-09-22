'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SharedThoughtDocument } from '@/lib/thoughtspace-service';
import { Viewport } from '@/types/canvas';
import { ZoomIn, ZoomOut, Maximize2, Heart, Sparkles, Move } from 'lucide-react';

interface LiveFlat2DCanvasProps {
  thoughts: SharedThoughtDocument[];
  onOpenFeed: (thought: SharedThoughtDocument) => void;
}

interface FlowNode {
  thought: SharedThoughtDocument;
  x: number;
  y: number;
  width: number;
  height: number;
  connectsTo: number[];
}

export const LiveFlat2DCanvas: React.FC<LiveFlat2DCanvasProps> = ({ thoughts, onOpenFeed }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport state
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 80, zoom: 0.85 });

  // Mouse & Touch interaction refs
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedSignificantlyRef = useRef<boolean>(false);

  // Responsive layout calculation for nodes
  const nodes = React.useMemo<FlowNode[]>(() => {
    if (!thoughts || thoughts.length === 0) return [];

    const result: FlowNode[] = [];
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const cardWidth = isMobile ? 280 : 340;
    const cardHeight = isMobile ? 165 : 185;
    const colSpacing = isMobile ? 320 : 430;
    const rowSpacing = isMobile ? 240 : 290;
    const cols = isMobile ? 2 : Math.max(2, Math.ceil(Math.sqrt(thoughts.length * 1.4)));

    thoughts.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const staggerY = col % 2 === 1 ? 40 : 0;
      const x = col * colSpacing + (isMobile ? 40 : 120);
      const y = row * rowSpacing + (isMobile ? 60 : 120) + staggerY;

      const connectsTo: number[] = [];
      if (i + 1 < thoughts.length && (i + 1) % cols !== 0) {
        connectsTo.push(i + 1);
      }
      if (i + cols < thoughts.length) {
        connectsTo.push(i + cols);
      }

      result.push({
        thought: t,
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        connectsTo,
      });
    });

    return result;
  }, [thoughts]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Warm canvas background
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Hardware dot grid
    const dotSpacing = 28 * viewport.zoom;
    if (dotSpacing >= 9 && dotSpacing <= 260) {
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

    // Viewport transform
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Flowchart Connecting Lines
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    nodes.forEach((node) => {
      const fromX = node.x + node.width;
      const fromY = node.y + node.height / 2;

      node.connectsTo.forEach((targetIdx) => {
        const target = nodes[targetIdx];
        if (!target) return;

        const toX = target.x;
        const toY = target.y + target.height / 2;

        ctx.beginPath();
        const midX = (fromX + toX) / 2;
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
        ctx.stroke();

        // Terminal anchor pins where connector touches cards
        ctx.fillStyle = '#64748B';
        ctx.beginPath();
        ctx.arc(fromX, fromY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(toX, toY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Direction arrow
        const arrowAngle = Math.atan2(toY - (fromY + toY) / 2, toX - midX);
        const arrowLen = 9;
        ctx.fillStyle = '#64748B';
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
          toX - arrowLen * Math.cos(arrowAngle - Math.PI / 6),
          toY - arrowLen * Math.sin(arrowAngle - Math.PI / 6)
        );
        ctx.lineTo(
          toX - arrowLen * Math.cos(arrowAngle + Math.PI / 6),
          toY - arrowLen * Math.sin(arrowAngle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      });
    });

    ctx.restore();
  }, [viewport, nodes]);

  // --- Mouse Controls ---
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    hasMovedSignificantlyRef.current = false;
    dragStartRef.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = Math.abs(e.clientX - (dragStartRef.current.x + viewport.x));
    const dy = Math.abs(e.clientY - (dragStartRef.current.y + viewport.y));
    if (dx > 4 || dy > 4) {
      hasMovedSignificantlyRef.current = true;
    }
    setViewport((prev) => ({
      ...prev,
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    }));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setViewport((prev) => {
      const newZoom = Math.min(2.8, Math.max(0.25, prev.zoom * zoomFactor));
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      return {
        x: mouseX - (mouseX - prev.x) * (newZoom / prev.zoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / prev.zoom),
        zoom: newZoom,
      };
    });
  }, []);

  // --- Exact Finger / Touch Controls (1-finger pan, 2-finger pinch-zoom & pan) ---
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      touchPointsRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (touches.length === 1) {
      isDraggingRef.current = true;
      hasMovedSignificantlyRef.current = false;
      dragStartRef.current = {
        x: touches[0].clientX - viewport.x,
        y: touches[0].clientY - viewport.y,
      };
    } else if (touches.length === 2) {
      isDraggingRef.current = false;
      hasMovedSignificantlyRef.current = true;
      const t0 = touches[0];
      const t1 = touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = viewport.zoom;
      pinchCenterRef.current = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };
      dragStartRef.current = {
        x: pinchCenterRef.current.x - viewport.x,
        y: pinchCenterRef.current.y - viewport.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1 && isDraggingRef.current) {
      const t = touches[0];
      const dx = Math.abs(t.clientX - (dragStartRef.current.x + viewport.x));
      const dy = Math.abs(t.clientY - (dragStartRef.current.y + viewport.y));
      if (dx > 4 || dy > 4) {
        hasMovedSignificantlyRef.current = true;
      }
      setViewport((prev) => ({
        ...prev,
        x: t.clientX - dragStartRef.current.x,
        y: t.clientY - dragStartRef.current.y,
      }));
    } else if (touches.length === 2 && pinchStartDistRef.current > 0) {
      const t0 = touches[0];
      const t1 = touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const center = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };

      const scale = dist / pinchStartDistRef.current;
      const newZoom = Math.min(2.8, Math.max(0.25, pinchStartZoomRef.current * scale));

      setViewport((prev) => {
        return {
          x: center.x - (center.x - prev.x) * (newZoom / prev.zoom),
          y: center.y - (center.y - prev.y) * (newZoom / prev.zoom),
          zoom: newZoom,
        };
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = e.touches;
    touchPointsRef.current.clear();
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      touchPointsRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (touches.length === 1) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: touches[0].clientX - viewport.x,
        y: touches[0].clientY - viewport.y,
      };
    } else if (touches.length === 0) {
      isDraggingRef.current = false;
      pinchStartDistRef.current = 0;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleZoom = (delta: number) => {
    setViewport((prev) => {
      const newZoom = Math.min(2.8, Math.max(0.25, prev.zoom + delta));
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return {
        x: cx - (cx - prev.x) * (newZoom / prev.zoom),
        y: cy - (cy - prev.y) * (newZoom / prev.zoom),
        zoom: newZoom,
      };
    });
  };

  const resetView = () => {
    setViewport({ x: 80, y: 80, zoom: 0.85 });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ touchAction: 'none' }}
      className="relative w-full h-full cursor-grab active:cursor-grabbing select-none overflow-hidden"
    >
      {/* 2D Canvas for Grid and Connectors */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Interactive Flowchart Nodes Layer */}
      <div
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute top-0 left-0 pointer-events-none will-change-transform"
      >
        {nodes.map((node) => {
          const t = node.thought;
          return (
            <div
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                if (hasMovedSignificantlyRef.current) return;
                onOpenFeed(t);
              }}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.width}px`,
                minHeight: `${node.height}px`,
              }}
              className="absolute pointer-events-auto bg-[#FFFDF9] border border-neutral-300/90 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-neutral-500/80 transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
            >
              {/* Category & Status */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                  {t.category}
                </span>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-600">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                  <span>{t.reactionCount || 12}</span>
                </div>
              </div>

              {/* Title */}
              <h3 className="text-sm font-bold text-neutral-900 leading-snug line-clamp-2">
                {t.title}
              </h3>

              {/* Summary rendered directly as handwritten canvas text */}
              <div className="my-2 p-2 rounded-xl bg-amber-50/40 border border-amber-200/40">
                <p
                  style={{ fontFamily: '"Kalam", "Caveat", cursive' }}
                  className="text-[13px] text-neutral-700 leading-relaxed line-clamp-3"
                >
                  {t.summary}
                </p>
              </div>

              {/* Card visual anchor nodes for incoming/outgoing curves */}
              <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow-xs pointer-events-none" />
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-400 border-2 border-white shadow-xs pointer-events-none" />

              {/* Footer Author & Interaction indicator */}
              <div className="flex items-center justify-between pt-1.5 border-t border-neutral-100 text-[11px] text-neutral-600">
                <span className="font-semibold text-neutral-800 truncate max-w-[120px]">
                  {t.authorName || (t.authorAnonymousId ? t.authorAnonymousId.replace(/_/g, ' ') : 'Anonymous')}
                </span>
                <span className="text-neutral-500 font-medium">
                  {t.reactionCount || 0} resonated • {t.remixCount || 0} remixes
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Legend for Flowchart Connections (Bottom Left) */}
      <div className="absolute bottom-6 left-4 sm:left-6 z-20 hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-full border border-neutral-200/80 shadow-xs text-xs text-neutral-600 font-medium pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <span>Connected topic flows • Click card to view</span>
      </div>

      {/* Floating Gesture Guide & Zoom Controls (Standardized to Bottom Right) */}
      <div className="absolute bottom-6 right-4 sm:right-6 z-20 flex items-center gap-1.5 p-1 bg-white/95 rounded-2xl border border-neutral-200/90 shadow-md backdrop-blur-md pointer-events-auto">
        <div className="hidden sm:flex items-center gap-1 px-2 text-[11px] font-medium text-neutral-500 border-r border-neutral-200">
          <Move className="w-3.5 h-3.5" />
          <span>Pan / Pinch</span>
        </div>
        <button
          type="button"
          onClick={() => handleZoom(0.18)}
          title="Zoom in"
          className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-700 hover:text-neutral-950 transition-colors cursor-pointer active:scale-95"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.18)}
          title="Zoom out"
          className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-700 hover:text-neutral-950 transition-colors cursor-pointer active:scale-95"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          title="Reset View"
          className="p-2 hover:bg-neutral-100 rounded-xl text-neutral-700 hover:text-neutral-950 transition-colors cursor-pointer active:scale-95"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs font-mono font-medium text-neutral-600 border-l border-neutral-200">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>
    </div>
  );
};
