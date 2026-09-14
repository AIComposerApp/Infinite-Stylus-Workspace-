'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, Check, X } from 'lucide-react';
import { Viewport } from '@/types/canvas';

interface SentenceCopyOverlayProps {
  selectedSentences: Array<{ id: string; text: string; x: number; y: number; width: number; height: number }>;
  viewport: Viewport;
  onCopy: () => void;
  onClearSelection: () => void;
  isCopied: boolean;
}

export const SentenceCopyOverlay: React.FC<SentenceCopyOverlayProps> = ({
  selectedSentences,
  viewport,
  onCopy,
  onClearSelection,
  isCopied,
}) => {
  if (selectedSentences.length === 0) return null;

  // Calculate bounding box on screen for the floating copy pop-up
  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;

  selectedSentences.forEach((s) => {
    const sx = s.x * viewport.zoom + viewport.x;
    const sy = s.y * viewport.zoom + viewport.y;
    const sw = s.width * viewport.zoom;

    minScreenX = Math.min(minScreenX, sx);
    minScreenY = Math.min(minScreenY, sy);
    maxScreenX = Math.max(maxScreenX, sx + sw);
  });

  const popupX = (minScreenX + maxScreenX) / 2;
  const popupY = Math.max(20, minScreenY - 45);

  return (
    <div className="fixed inset-0 pointer-events-none z-30 select-none">
      {/* Visual Highlighter Underlay around each selected sentence in screen coordinates */}
      {selectedSentences.map((s) => {
        const sx = s.x * viewport.zoom + viewport.x;
        const sy = s.y * viewport.zoom + viewport.y;
        const sw = Math.max(60, s.width * viewport.zoom);
        const sh = Math.max(24, s.height * viewport.zoom);

        return (
          <div
            key={s.id}
            style={{
              position: 'absolute',
              left: `${sx - 4}px`,
              top: `${sy - 2}px`,
              width: `${sw + 8}px`,
              height: `${sh + 4}px`,
            }}
            className="rounded bg-amber-300/25 ring-1 ring-amber-400/35 mix-blend-multiply transition-all pointer-events-none"
          />
        );
      })}

      {/* Discreet, Non-intrusive Floating Copy Tooltip */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{
            opacity: 1,
            scale: 1,
            x: popupX - 45,
            y: popupY,
          }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-1 bg-neutral-900/90 text-white rounded-full shadow-lg border border-neutral-800 backdrop-blur-md z-40 text-[11px]"
        >
          <button
            onClick={onCopy}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
              isCopied
                ? 'bg-neutral-800 text-emerald-400'
                : 'text-neutral-200 hover:text-white hover:bg-neutral-800'
            }`}
            title="Copy text (Ctrl+C)"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400 stroke-[2.2]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 stroke-[1.8]" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={onClearSelection}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Deselect"
          >
            <X className="w-3 h-3 stroke-[2]" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
