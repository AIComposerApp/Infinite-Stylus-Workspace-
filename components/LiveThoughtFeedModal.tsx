'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Radio,
  Layers,
  Sparkles,
  ArrowUpRight,
  Clock,
  Heart,
  ChevronRight,
} from 'lucide-react';
import {
  SharedThoughtDocument,
  subscribeToLiveFeed,
  sendThoughtReaction,
  ReactionType,
} from '@/lib/thoughtspace-service';
import { LiveThoughtFeedView } from '@/components/feed/LiveThoughtFeedView';

interface LiveThoughtFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadThoughtToCanvas?: (thought: SharedThoughtDocument) => void;
}

export const LiveThoughtFeedModal: React.FC<LiveThoughtFeedModalProps> = ({
  isOpen,
  onClose,
  onLoadThoughtToCanvas,
}) => {
  const [thoughts, setThoughts] = useState<SharedThoughtDocument[]>([]);
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToLiveFeed((liveThoughts) => {
      setThoughts(liveThoughts);
    });
    return () => unsub();
  }, [isOpen]);

  const filteredThoughts = activeCategory === 'All'
    ? thoughts
    : thoughts.filter((t) => t.category.toLowerCase() === activeCategory.toLowerCase());

  if (!isOpen) return null;

  // If a thought is selected for immersive view, show the full LiveThoughtFeedView
  if (selectedThoughtId) {
    return (
      <LiveThoughtFeedView
        thoughts={thoughts}
        initialThoughtId={selectedThoughtId}
        onClose={() => setSelectedThoughtId(null)}
      />
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative z-10 w-full max-w-3xl max-h-[88vh] bg-[var(--surface)] text-[var(--ink)] border border-[var(--hair)] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hair)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Radio className="w-4 h-4 animate-pulse stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">Live Thought Feed</h3>
                <p className="text-xs text-[var(--muted)]">Real-time anonymous thoughts from the cosmos</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--chip)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-[var(--hair)] overflow-x-auto no-scrollbar">
            {['All', 'Engineering', 'Creative Vision', 'Introspection', 'Philosophy & Study'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-[var(--ink)] text-[var(--surface)]'
                    : 'bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {filteredThoughts.length === 0 ? (
              <div className="text-center py-16 text-[var(--muted)]">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30 stroke-[1.5]" />
                <p className="text-sm font-medium">No live thoughts in this category yet</p>
                <p className="text-xs mt-1">Be the first to share an ink dump!</p>
              </div>
            ) : (
              filteredThoughts.map((thought) => (
                <div
                  key={thought.id}
                  className="p-4 rounded-2xl border border-[var(--hair)] bg-[var(--surface)] hover:bg-[var(--chip)] transition-all flex flex-col gap-2.5 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--chip)] text-[var(--ink)]">
                          {thought.category}
                        </span>
                        <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {thought.duration || 'Session'}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold mt-1 text-[var(--ink)]">{thought.title}</h4>
                      <p className="text-xs text-[var(--muted)] line-clamp-2 mt-0.5">{thought.summary}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onLoadThoughtToCanvas && thought.canvasPayload && (
                        <button
                          type="button"
                          onClick={() => {
                            onLoadThoughtToCanvas(thought);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--surface)] text-xs font-medium flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
                          title="Import into canvas"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.2]" />
                          Load
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedThoughtId(thought.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--chip)] text-[var(--ink)] text-xs font-medium flex items-center gap-1 hover:bg-[var(--hair)] transition-colors cursor-pointer"
                      >
                        Explore
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--hair)] text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      {thought.strokesCount || 0} strokes
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await sendThoughtReaction(thought.id, 'resonate');
                      }}
                      className="flex items-center gap-1 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Heart className="w-3.5 h-3.5 stroke-[2]" />
                      <span>{thought.reactionCount || 0}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
