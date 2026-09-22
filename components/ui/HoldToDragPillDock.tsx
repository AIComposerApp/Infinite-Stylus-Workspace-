'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';

export interface PillDockItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
}

interface HoldToDragPillDockProps<T extends string = string> {
  items: PillDockItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export function HoldToDragPillDock<T extends string = string>({
  items,
  activeId,
  onSelect,
  className = '',
  size = 'md',
  ariaLabel = 'Navigation Switcher',
}: HoldToDragPillDockProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragX, setDragX] = useState<number>(0);
  const [dragPreviewId, setDragPreviewId] = useState<T | null>(null);

  // Derived previewId avoids synchronous setState inside effect
  const previewId = isDragging && dragPreviewId ? dragPreviewId : activeId;

  // Gesture tracking refs
  const pointerIdRef = useRef<number | null>(null);
  const startClientXRef = useRef<number>(0);
  const startPillXRef = useRef<number>(0);
  const lastClientXRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);
  const lastHapticIndexRef = useRef<number>(-1);

  const activeIndex = Math.max(0, items.findIndex((i) => i.id === activeId));
  const numItems = items.length;

  // Track padding is 4px (p-1)
  const trackPadding = size === 'sm' ? 3 : 4;
  const usableWidth = Math.max(0, trackWidth - trackPadding * 2);
  const itemWidth = numItems > 0 ? usableWidth / numItems : 0;
  const maxDragX = Math.max(0, (numItems - 1) * itemWidth);

  // Measure track width with ResizeObserver
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setTrackWidth(entry.contentRect.width);
        }
      }
    });

    ro.observe(el);
    setTrackWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const snapToTarget = useCallback(
    (targetIndex: number) => {
      const clampedIndex = Math.max(0, Math.min(numItems - 1, targetIndex));
      const targetItem = items[clampedIndex];
      if (targetItem && targetItem.id !== activeId) {
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(10);
          }
        } catch {}
        onSelect(targetItem.id);
      }
      setDragPreviewId(null);
    },
    [items, numItems, activeId, onSelect]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !trackRef.current || itemWidth <= 0) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    pointerIdRef.current = e.pointerId;
    startClientXRef.current = e.clientX;
    lastClientXRef.current = e.clientX;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
    hasMovedRef.current = false;
    lastHapticIndexRef.current = activeIndex;

    // Current settled pill position
    const currentSettledX = activeIndex * itemWidth;
    startPillXRef.current = currentSettledX;
    setDragX(currentSettledX);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId || itemWidth <= 0) return;

    const deltaX = e.clientX - startClientXRef.current;
    const now = performance.now();
    const dt = Math.max(1, now - lastTimeRef.current);
    velocityRef.current = (e.clientX - lastClientXRef.current) / dt;
    lastClientXRef.current = e.clientX;
    lastTimeRef.current = now;

    if (!hasMovedRef.current && Math.abs(deltaX) > 4) {
      hasMovedRef.current = true;
      setIsDragging(true);
    }

    if (hasMovedRef.current) {
      // Calculate raw new position
      const rawX = startPillXRef.current + deltaX;

      // Add gentle rubberband resistance beyond edges
      let boundedX: number;
      if (rawX < 0) {
        boundedX = rawX * 0.22;
      } else if (rawX > maxDragX) {
        boundedX = maxDragX + (rawX - maxDragX) * 0.22;
      } else {
        boundedX = rawX;
      }

      setDragX(boundedX);

      // Determine real-time hovered index for visual preview & tactile feedback
      const centerPos = boundedX + itemWidth / 2;
      const hoveredIndex = Math.max(
        0,
        Math.min(numItems - 1, Math.floor(centerPos / itemWidth))
      );

      if (hoveredIndex !== lastHapticIndexRef.current) {
        lastHapticIndexRef.current = hoveredIndex;
        setDragPreviewId(items[hoveredIndex].id);
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(6);
          }
        } catch {}
      }
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    pointerIdRef.current = null;

    if (hasMovedRef.current) {
      // User held and dragged!
      setIsDragging(false);

      const velocity = velocityRef.current;
      let finalIndex: number;

      // Velocity flick / swipe override
      if (velocity < -0.35) {
        finalIndex = Math.max(0, activeIndex - 1);
      } else if (velocity > 0.35) {
        finalIndex = Math.min(numItems - 1, activeIndex + 1);
      } else {
        // Nearest slot based on center position
        const centerPos = dragX + itemWidth / 2;
        finalIndex = Math.max(
          0,
          Math.min(numItems - 1, Math.round(dragX / itemWidth))
        );
      }

      snapToTarget(finalIndex);
    } else {
      // Quick tap / click without drag
      setIsDragging(false);
      if (trackRef.current) {
        const trackRect = trackRef.current.getBoundingClientRect();
        const clickRelativeX = e.clientX - trackRect.left - trackPadding;
        const clickedIndex = Math.max(
          0,
          Math.min(numItems - 1, Math.floor(clickRelativeX / itemWidth))
        );
        snapToTarget(clickedIndex);
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      snapToTarget(activeIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      snapToTarget(activeIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      snapToTarget(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      snapToTarget(numItems - 1);
    }
  };

  // Current active target X for resting state
  const settledX = activeIndex * itemWidth;
  const currentX = isDragging ? dragX : settledX;

  const heightClasses =
    size === 'sm'
      ? 'h-9 text-[12px]'
      : size === 'lg'
      ? 'h-[50px] text-[15px]'
      : 'h-11 text-[13px] sm:text-[14px]';

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      style={{ touchAction: 'none' }}
      className={`relative flex items-center select-none rounded-full p-1 bg-black/[0.04] dark:bg-white/[0.08] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/50 ${heightClasses} ${className}`}
    >
      {/* Tactile Internal Sliding Pill Container */}
      {trackWidth > 0 && itemWidth > 0 && (
        <motion.div
          animate={{
            x: currentX,
            scale: isDragging ? 0.98 : 1,
          }}
          transition={
            isDragging
              ? { duration: 0 } // 1:1 Instant finger tracking
              : { type: 'spring', stiffness: 440, damping: 32, mass: 0.8 } // Spring snap
          }
          style={{
            position: 'absolute',
            top: trackPadding,
            bottom: trackPadding,
            left: trackPadding,
            width: itemWidth,
            pointerEvents: 'none',
          }}
          className="rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 shadow-[0_3px_12px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.08)] z-10 flex items-center justify-center transition-shadow"
        />
      )}

      {/* Render All Items Labels and Icons */}
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isCurrentActive = activeId === item.id;
        const isPreviewed = previewId === item.id;

        return (
          <div
            key={item.id}
            role="tab"
            aria-selected={isCurrentActive}
            className={`relative z-20 flex-1 h-full flex items-center justify-center gap-1.5 px-3 rounded-full font-medium transition-colors duration-150 pointer-events-none ${
              isCurrentActive || (isDragging && isPreviewed)
                ? 'text-white dark:text-neutral-950 font-semibold'
                : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {Icon && (
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform ${
                  isCurrentActive || (isDragging && isPreviewed)
                    ? 'scale-110 stroke-[2.2]'
                    : 'stroke-[1.8]'
                }`}
              />
            )}
            <span className="truncate tracking-tight">{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono transition-colors ${
                  isCurrentActive || (isDragging && isPreviewed)
                    ? 'bg-white/20 dark:bg-black/20 text-white dark:text-neutral-950'
                    : 'bg-black/5 dark:bg-white/10 text-neutral-500'
                }`}
              >
                {item.badge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default HoldToDragPillDock;
