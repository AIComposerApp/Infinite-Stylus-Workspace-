'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Viewport,
  Stroke,
  AIThought,
  CanvasTextItem,
  CanvasImageItem,
  CanvasShapeItem,
  CanvasChecklistItem,
} from '@/types/canvas';
import { Compass, Maximize2, Minimize2, Navigation, ZoomIn, ZoomOut } from 'lucide-react';

interface CanvasMiniRadarProps {
  viewport: Viewport;
  strokes: Stroke[];
  thoughts: AIThought[];
  canvasTexts: CanvasTextItem[];
  images: CanvasImageItem[];
  shapes: CanvasShapeItem[];
  checklists: CanvasChecklistItem[];
  onNavigateViewport: (newViewport: Viewport) => void;
  onFitToContent: () => void;
}

export const CanvasMiniRadar: React.FC<CanvasMiniRadarProps> = ({
  viewport,
  strokes,
  thoughts,
  canvasTexts,
  images,
  shapes,
  checklists,
  onNavigateViewport,
  onFitToContent,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const radarRef = useRef<HTMLDivElement | null>(null);

  // Compute world bounds of all content on the canvas
  const contentBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const s of strokes) {
      if (s.bounds) {
        if (s.bounds.minX < minX) minX = s.bounds.minX;
        if (s.bounds.minY < minY) minY = s.bounds.minY;
        if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
        if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
      }
    }

    for (const t of thoughts) {
      if (t.bounds) {
        if (t.bounds.minX < minX) minX = t.bounds.minX;
        if (t.bounds.minY < minY) minY = t.bounds.minY;
        if (t.bounds.maxX > maxX) maxX = t.bounds.maxX;
        if (t.bounds.maxY > maxY) maxY = t.bounds.maxY;
      }
    }

    for (const txt of canvasTexts) {
      if (txt.x < minX) minX = txt.x;
      if (txt.y < minY) minY = txt.y;
      if (txt.x + 200 > maxX) maxX = txt.x + 200;
      if (txt.y + 100 > maxY) maxY = txt.y + 100;
    }

    for (const img of images) {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    }

    for (const shp of shapes) {
      if (shp.x < minX) minX = shp.x;
      if (shp.y < minY) minY = shp.y;
      if (shp.x + shp.width > maxX) maxX = shp.x + shp.width;
      if (shp.y + shp.height > maxY) maxY = shp.y + shp.height;
    }

    for (const chk of checklists) {
      if (chk.x < minX) minX = chk.x;
      if (chk.y < minY) minY = chk.y;
      if (chk.x + (chk.width || 300) > maxX) maxX = chk.x + (chk.width || 300);
      if (chk.y + 240 > maxY) maxY = chk.y + 240;
    }

    if (!isFinite(minX)) {
      minX = -1000;
      minY = -800;
      maxX = 1000;
      maxY = 800;
    }

    // Also include current viewport view into radar view area
    const viewWorldLeft = -viewport.x / viewport.zoom;
    const viewWorldTop = -viewport.y / viewport.zoom;
    const viewWorldRight = (window.innerWidth - viewport.x) / viewport.zoom;
    const viewWorldBottom = (window.innerHeight - viewport.y) / viewport.zoom;

    const overallMinX = Math.min(minX, viewWorldLeft) - 250;
    const overallMinY = Math.min(minY, viewWorldTop) - 250;
    const overallMaxX = Math.max(maxX, viewWorldRight) + 250;
    const overallMaxY = Math.max(maxY, viewWorldBottom) + 250;

    return {
      minX: overallMinX,
      minY: overallMinY,
      maxX: overallMaxX,
      maxY: overallMaxY,
      width: Math.max(800, overallMaxX - overallMinX),
      height: Math.max(600, overallMaxY - overallMinY),
      hasContent: strokes.length > 0 || canvasTexts.length > 0 || images.length > 0 || shapes.length > 0 || checklists.length > 0,
    };
  }, [strokes, thoughts, canvasTexts, images, shapes, checklists, viewport]);

  const radarWidth = 160;
  const radarHeight = 110;

  const scale = Math.min(
    radarWidth / contentBounds.width,
    radarHeight / contentBounds.height
  );

  const worldToRadar = useCallback(
    (wx: number, wy: number) => {
      const rx = (wx - contentBounds.minX) * scale;
      const ry = (wy - contentBounds.minY) * scale;
      return { rx, ry };
    },
    [contentBounds, scale]
  );

  const radarToWorld = useCallback(
    (rx: number, ry: number) => {
      const wx = rx / scale + contentBounds.minX;
      const wy = ry / scale + contentBounds.minY;
      return { wx, wy };
    },
    [contentBounds, scale]
  );

  // Viewport rectangle in radar coordinates
  const viewRect = useMemo(() => {
    const viewWorldLeft = -viewport.x / viewport.zoom;
    const viewWorldTop = -viewport.y / viewport.zoom;
    const viewWorldWidth = window.innerWidth / viewport.zoom;
    const viewWorldHeight = window.innerHeight / viewport.zoom;

    const { rx: left, ry: top } = worldToRadar(viewWorldLeft, viewWorldTop);
    const width = Math.max(6, viewWorldWidth * scale);
    const height = Math.max(6, viewWorldHeight * scale);

    return { left, top, width, height };
  }, [viewport, worldToRadar, scale]);

  // Jump or drag to navigate
  const handlePointerNavigate = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!radarRef.current) return;
      const rect = radarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const { wx, wy } = radarToWorld(clickX, clickY);

      // Center the clicked world point in the viewport
      const targetX = window.innerWidth / 2 - wx * viewport.zoom;
      const targetY = window.innerHeight / 2 - wy * viewport.zoom;

      onNavigateViewport({
        ...viewport,
        x: Math.round(targetX),
        y: Math.round(targetY),
      });
    },
    [radarToWorld, viewport, onNavigateViewport]
  );

  const [isNavDragging, setIsNavDragging] = useState<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsNavDragging(true);
    handlePointerNavigate(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isNavDragging) {
      e.stopPropagation();
      handlePointerNavigate(e);
    }
  };

  const handlePointerUp = () => {
    setIsNavDragging(false);
  };

  // When collapsed: show minimal, unobtrusive pill with zoom & compass
  if (!isOpen) {
    return (
      <button
        id="canvas-constellation-radar-toggle"
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-3.5 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white/90 hover:bg-white border border-neutral-200/90 shadow-sm backdrop-blur-md transition-all active:scale-95 select-none"
        title="Open canvas navigator"
      >
        <Compass className="w-3.5 h-3.5 text-neutral-500" />
        <span className="text-[11px] font-mono text-neutral-500">{Math.round(viewport.zoom * 100)}%</span>
      </button>
    );
  }

  return (
    <div
      id="canvas-constellation-radar"
      className="fixed bottom-20 right-3.5 z-20 flex flex-col items-end gap-1.5 pointer-events-auto select-none"
    >
      {/* Mini Radar Panel */}
      <div className="bg-white/95 backdrop-blur-md text-neutral-800 border border-neutral-200/90 rounded-2xl p-2.5 shadow-lg transition-all duration-200">
        <div className="flex items-center justify-between pb-1.5 px-0.5 border-b border-neutral-100 text-[11px] font-medium text-neutral-500">
          <div className="flex items-center gap-1.5 text-neutral-700">
            <Compass className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-xs font-medium">Navigator</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onFitToContent}
              title="Fit all content into screen"
              className="p-1 hover:bg-neutral-100 rounded-md text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Close navigator"
              className="p-1 hover:bg-neutral-100 rounded-md text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Interactive Radar Box */}
        <div
          ref={radarRef}
          style={{ width: radarWidth, height: radarHeight }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative mt-1.5 rounded-xl bg-neutral-100/90 border border-neutral-200/80 overflow-hidden cursor-crosshair"
        >
          {/* Subtle Grid crosshairs */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-15 pointer-events-none">
            <div className="border-r border-b border-neutral-500" />
            <div className="border-r border-b border-neutral-500" />
            <div className="border-b border-neutral-500" />
            <div className="border-r border-b border-neutral-500" />
            <div className="border-r border-b border-neutral-500" />
            <div className="border-b border-neutral-500" />
            <div className="border-r border-neutral-500" />
            <div className="border-r border-neutral-500" />
            <div />
          </div>

          {/* Stroke Points (Rendered as muted dots) */}
          {strokes.map((s) => {
            if (!s.bounds) return null;
            const { rx, ry } = worldToRadar(s.bounds.minX, s.bounds.minY);
            const w = Math.max(2, (s.bounds.maxX - s.bounds.minX) * scale);
            const h = Math.max(2, (s.bounds.maxY - s.bounds.minY) * scale);
            return (
              <div
                key={s.id}
                style={{
                  position: 'absolute',
                  left: rx,
                  top: ry,
                  width: w,
                  height: h,
                  backgroundColor: '#4B5563',
                }}
                className="opacity-70 rounded-sm pointer-events-none"
              />
            );
          })}

          {/* Shapes (Mini rectangles) */}
          {shapes.map((shp) => {
            const { rx, ry } = worldToRadar(shp.x, shp.y);
            const w = Math.max(4, shp.width * scale);
            const h = Math.max(4, shp.height * scale);
            return (
              <div
                key={shp.id}
                style={{
                  position: 'absolute',
                  left: rx,
                  top: ry,
                  width: w,
                  height: h,
                }}
                className="border border-neutral-400 bg-neutral-200/50 rounded-xs pointer-events-none"
              />
            );
          })}

          {/* Checklists */}
          {checklists.map((chk) => {
            const { rx, ry } = worldToRadar(chk.x, chk.y);
            const w = Math.max(5, (chk.width || 300) * scale);
            const h = Math.max(4, 180 * scale);
            return (
              <div
                key={chk.id}
                style={{
                  position: 'absolute',
                  left: rx,
                  top: ry,
                  width: w,
                  height: h,
                }}
                className="bg-emerald-600/30 border border-emerald-500/60 rounded-xs pointer-events-none"
              />
            );
          })}

          {/* Images */}
          {images.map((img) => {
            const { rx, ry } = worldToRadar(img.x, img.y);
            const w = Math.max(4, img.width * scale);
            const h = Math.max(4, img.height * scale);
            return (
              <div
                key={img.id}
                style={{
                  position: 'absolute',
                  left: rx,
                  top: ry,
                  width: w,
                  height: h,
                }}
                className="bg-sky-500/20 border border-sky-400/50 rounded-xs pointer-events-none"
              />
            );
          })}

          {/* Current Viewport Frustum / Lens Box */}
          <div
            style={{
              position: 'absolute',
              left: Math.max(0, Math.min(radarWidth - viewRect.width, viewRect.left)),
              top: Math.max(0, Math.min(radarHeight - viewRect.height, viewRect.top)),
              width: Math.min(radarWidth, viewRect.width),
              height: Math.min(radarHeight, viewRect.height),
            }}
            className="border-2 border-neutral-700 bg-neutral-900/10 rounded-md pointer-events-none shadow-xs transition-transform"
          />
        </div>

        {/* Zoom Level & Position Indicator */}
        <div className="flex items-center justify-between pt-1.5 px-0.5 text-[11px] text-neutral-500">
          <span className="font-mono">{Math.round(viewport.zoom * 100)}%</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNavigateViewport({ ...viewport, zoom: Math.min(4.0, viewport.zoom * 1.25) })}
              className="hover:text-neutral-900 p-0.5"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateViewport({ ...viewport, zoom: Math.max(0.25, viewport.zoom * 0.8) })}
              className="hover:text-neutral-900 p-0.5"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateViewport({ ...viewport, x: 200, y: 150, zoom: 1 })}
              className="text-neutral-500 hover:text-neutral-900 underline underline-offset-2 ml-0.5"
            >
              Center
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
