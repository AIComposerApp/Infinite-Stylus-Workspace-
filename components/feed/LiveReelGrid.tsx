'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { SharedThoughtDocument, sendThoughtReaction } from '@/lib/thoughtspace-service';
import { parseOrGenerateThoughtCanvas } from '@/lib/thought-canvas-generator';
import { drawSmoothStroke } from '@/lib/canvas-utils';
import {
  ChevronDown,
  Heart,
  Trash2,
  ExternalLink,
  Sparkles,
  Layers,
  Bookmark,
} from 'lucide-react';

interface LiveReelGridProps {
  thoughts: SharedThoughtDocument[];
  onOpenFeed: (thought: SharedThoughtDocument) => void;
}

// Format relative dynamic time offset
function getRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return 'recently';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

// Canvas thumbnail inside accordion drawer
const AccordionCanvasThumbnail: React.FC<{ thought: SharedThoughtDocument }> = ({ thought }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parsed = parseOrGenerateThoughtCanvas(
      thought.title,
      thought.category,
      thought.canvasPayload
    );

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let x = 12; x < width; x += 22) {
      for (let y = 12; y < height; y += 22) {
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }

    const b = parsed.bounds;
    const bw = Math.max(100, b.maxX - b.minX);
    const bh = Math.max(80, b.maxY - b.minY);
    const padding = 24;
    const scale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh);
    const clampedScale = Math.max(0.65, Math.min(1.35, scale));
    const centerX = (b.minX + b.maxX) / 2;
    const centerY = (b.minY + b.maxY) / 2;
    const offsetX = width / 2 - centerX * clampedScale;
    const offsetY = height / 2 - centerY * clampedScale;

    ctx.translate(offsetX, offsetY);
    ctx.scale(clampedScale, clampedScale);

    for (const stroke of parsed.strokes) {
      drawSmoothStroke(ctx, stroke);
    }

    for (const item of parsed.canvasTexts) {
      ctx.save();
      ctx.font = '500 18px "Kalam", "Caveat", cursive';
      ctx.fillStyle = item.color || '#1E1E1E';
      ctx.textBaseline = 'top';
      ctx.fillText(item.text, item.x, item.y);
      ctx.restore();
    }

    ctx.restore();
  }, [thought]);

  return (
    <div className="w-full h-44 sm:h-52 bg-[#FAF9F6] relative overflow-hidden rounded-xl border border-neutral-200/80">
      <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
    </div>
  );
};

// Swipable Accordion Card Component
interface SwipableCardProps {
  thought: SharedThoughtDocument;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenFeed: (thought: SharedThoughtDocument) => void;
  onDismiss: (thoughtId: string) => void;
}

const SwipableAccordionCard: React.FC<SwipableCardProps> = ({
  thought,
  isExpanded,
  onToggleExpand,
  onOpenFeed,
  onDismiss,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Gesture swipe state
  const [translateX, setTranslateX] = useState<number>(0);
  const [isDismissing, setIsDismissing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Heart reaction state
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(thought.reactionCount || 12);

  // Gesture tracking refs
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const lastXRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const velocityXRef = useRef<number>(0);
  const isAxisLockedRef = useRef<boolean | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only capture on primary button
    if (e.button !== 0) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityXRef.current = 0;
    isAxisLockedRef.current = null;
    pointerIdRef.current = e.pointerId;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;
    const now = performance.now();
    const dt = Math.max(1, now - lastTimeRef.current);

    // Track fling velocity
    velocityXRef.current = (e.clientX - lastXRef.current) / dt;
    lastXRef.current = e.clientX;
    lastTimeRef.current = now;

    // Axis Locking: if vertical movement dominates, release capture to allow natural scrolling
    if (isAxisLockedRef.current === null) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isAxisLockedRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        pointerIdRef.current = null;
        return;
      }
      if (Math.abs(deltaX) > 8) {
        isAxisLockedRef.current = true;
        setIsDragging(true);
      }
    }

    if (isAxisLockedRef.current === true) {
      // Elastic resistance if dragging to the right (away from dismiss direction)
      if (deltaX > 0) {
        const dampened = Math.pow(deltaX, 0.75) * 1.5;
        setTranslateX(dampened);
      } else {
        // Dragging left (dismiss direction)
        setTranslateX(deltaX);
      }
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    pointerIdRef.current = null;
    setIsDragging(false);

    if (isAxisLockedRef.current === true) {
      const deltaX = translateX;
      const velocity = velocityXRef.current;

      // Fling & Velocity Dismissal: if displacement < -120px OR velocity < -0.4px/ms
      if (deltaX < -120 || velocity < -0.4) {
        setIsDismissing(true);
        setTranslateX(-window.innerWidth * 1.5);
        setTimeout(() => {
          onDismiss(thought.id);
        }, 350);
        return;
      }

      // Spring back to center
      setTranslateX(0);
    }
  };

  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasLiked) return;
    setHasLiked(true);
    setLikeCount((c) => c + 1);
    await sendThoughtReaction(thought.id, 'resonate');
  };

  const displayName =
    thought.authorName ||
    (thought.authorAnonymousId
      ? thought.authorAnonymousId.replace(/_/g, ' ')
      : 'Anonymous');

  const authorInit = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const [timeString] = useState<string>(() => getRelativeTime(thought.createdAt));
  const [isRecentlyActive] = useState<boolean>(() =>
    thought.createdAt ? Date.now() - thought.createdAt < 2 * 3600 * 1000 : false
  );

  return (
    <div
      style={{
        overflow: 'visible',
        display: isDismissing ? 'none' : 'block',
      }}
      className="relative w-full my-3.5 select-none"
    >
      {/* 1. Underlying Action Tray: position: absolute; inset: 0; z-index: 1 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
        }}
        className="rounded-2xl bg-neutral-100 border border-neutral-200/90 flex items-center justify-between px-6 pointer-events-none"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
          <Bookmark className="w-4 h-4" />
          <span>Save Canvas</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-500">
          <span>Dismiss</span>
          <Trash2 className="w-4 h-4" />
        </div>
      </div>

      {/* 2. Foreground Draggable Card: position: relative; z-index: 2; width: 100% */}
      <div
        ref={cardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          transform: `translateX(${translateX}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 0.5s cubic-bezier(0.65, 0, 1), opacity 0.35s ease',
          opacity: isDismissing ? 0 : 1,
          touchAction: 'pan-y',
        }}
        className="bg-white rounded-2xl border border-neutral-200/90 shadow-xs hover:shadow-md transition-all cursor-pointer overflow-visible"
      >
        {/* Fixed Top Header */}
        <div
          onClick={() => {
            if (Math.abs(translateX) < 6) {
              onToggleExpand();
            }
          }}
          className="p-4 sm:p-5 flex flex-col gap-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Avatar & User Info */}
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Polished Author Avatar with glowing rank ring */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 border border-neutral-300 flex items-center justify-center font-bold text-xs text-neutral-800 shadow-xs">
                  {authorInit}
                </div>
                {isRecentlyActive && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs"
                    title="Active recently"
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-neutral-900 truncate leading-snug">
                    {thought.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-600 mt-0.5">
                  <span className="font-semibold text-neutral-800 text-[12px]">
                    {displayName}
                  </span>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-neutral-600 font-medium">
                    {thought.category}
                  </span>
                  <span>•</span>
                  <span className="text-[11px] text-neutral-500">{timeString}</span>
                </div>
              </div>
            </div>

            {/* Right Controls: Resonate Heart & Accordion Chevron */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleLikeClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-50 hover:bg-rose-50 text-neutral-700 hover:text-rose-600 border border-neutral-200/80 transition-colors text-xs font-semibold"
                title="Resonate"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    hasLiked ? 'text-rose-500 fill-rose-500' : 'text-neutral-500'
                  }`}
                />
                <span>{likeCount}</span>
              </button>

              {/* Accordion Chevron: rotates 180deg with 0.5s cubic-bezier(0.65, 0, 0, 1) */}
              <div
                style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.5s cubic-bezier(0.65, 0, 0, 1)',
                }}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Thought Excerpt & Stats in Collapsed State */}
          {!isExpanded && (
            <div className="flex items-center justify-between gap-4 pt-1 pl-[52px]">
              <p className="text-xs text-neutral-600 line-clamp-1 flex-1 font-normal">
                {thought.summary}
              </p>
              <div className="shrink-0 text-[11px] font-medium text-neutral-500 flex items-center gap-1.5">
                <span>{thought.reactionCount || 0} resonated</span>
                <span>•</span>
                <span>{thought.remixCount || 0} remixes</span>
              </div>
            </div>
          )}
        </div>

        {/* Fluid Height Morphing via CSS Grid (Zero-Jitter Accordion Body Drawer) */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: isExpanded ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.6s cubic-bezier(0.65, 0, 0, 1)',
          }}
        >
          {/* Internal Drawer Content: min-height: 0; overflow: hidden */}
          <div
            style={{
              minHeight: 0,
              overflow: 'hidden',
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? 'translateY(0)' : 'translateY(-8px)',
              transition:
                'opacity 0.35s ease, transform 0.45s cubic-bezier(0.65, 0, 0, 1)',
            }}
            className="px-4 sm:px-5 pb-5 pt-1 flex flex-col gap-3"
          >
            {/* Handwritten Thought Summary */}
            <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/50">
              <p
                style={{ fontFamily: '"Kalam", "Caveat", cursive' }}
                className="text-sm text-neutral-800 leading-relaxed"
              >
                {thought.summary}
              </p>
            </div>

            {/* Live Stroke Canvas Preview Thumbnail */}
            <AccordionCanvasThumbnail thought={thought} />

            {/* Footer Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-neutral-500 font-mono">
                {thought.strokesCount || 24} living strokes
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFeed(thought);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <span>View Full Canvas</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LiveReelGrid: React.FC<LiveReelGridProps> = ({ thoughts, onOpenFeed }) => {
  const [expandedId, setExpandedId] = useState<string | null>(thoughts[0]?.id || null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleThoughts = useMemo(() => {
    return thoughts.filter((t) => !dismissedIds.has(t.id));
  }, [thoughts, dismissedIds]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  return (
    <div
      style={{ overflow: 'visible', overflowX: 'visible' }}
      className="w-full h-full overflow-y-auto px-3 sm:px-6 pt-20 pb-28 bg-[#FAF9F6]"
    >
      <div
        style={{ overflow: 'visible', overflowX: 'visible' }}
        className="max-w-3xl mx-auto"
      >
        {/* Helper Hint */}
        <div className="mb-3 px-1 flex items-center justify-between text-xs text-neutral-500 font-medium">
          <span>Swipe left to dismiss • Tap to expand thought</span>
          <span>{visibleThoughts.length} streams</span>
        </div>

        {/* Stacked Card List with Zero-Jitter Accordion */}
        {visibleThoughts.map((thought) => (
          <SwipableAccordionCard
            key={thought.id}
            thought={thought}
            isExpanded={expandedId === thought.id}
            onToggleExpand={() => {
              setExpandedId((prev) => (prev === thought.id ? null : thought.id));
            }}
            onOpenFeed={onOpenFeed}
            onDismiss={handleDismiss}
          />
        ))}

        {visibleThoughts.length === 0 && (
          <div className="py-16 text-center text-sm text-neutral-500">
            You have reviewed all current streams. Check back soon or switch to 2D Map!
          </div>
        )}
      </div>
    </div>
  );
};
