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
              left: `${sx - 6}px`,
              top: `${sy - 4}px`,
              width: `${sw + 12}px`,
              height: `${sh + 8}px`,
            }}
            className="rounded-lg bg-amber-200/45 ring-2 ring-amber-400/50 mix-blend-multiply transition-all pointer-events-none"
          />
        );
      })}

      {/* Floating Copy Popup */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: 1,
            scale: 1,
            x: popupX - 60,
            y: popupY,
          }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 450, damping: 28 }}
          className="fixed top-0 left-0 pointer-events-auto flex items-center gap-1.5 p-1 bg-white/95 backdrop-blur-md rounded-full border border-black/10 shadow-xl"
        >
          <button
            onClick={onCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isCopied
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-900 text-white hover:bg-black'
            }`}
            title="Copy as plain text"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>
                  Copy {selectedSentences.length > 1 ? `(${selectedSentences.length})` : 'Text'}
                </span>
              </>
            )}
          </button>

          <button
            onClick={onClearSelection}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-black/5 transition-colors"
            title="Deselect"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
