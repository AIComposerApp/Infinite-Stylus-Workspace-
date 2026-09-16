'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  SharedThoughtDocument,
  subscribeToLiveFeed,
} from '@/lib/thoughtspace-service';
import { PrimaryViewMode } from '@/components/feed/ViewToggler';
import { LiveFlat2DCanvas } from '@/components/feed/LiveFlat2DCanvas';
import { LiveReelGrid } from '@/components/feed/LiveReelGrid';
import { LiveThoughtFeedView } from '@/components/feed/LiveThoughtFeedView';
import { DistantGlobeCosmos } from '@/components/feed/DistantGlobeCosmos';
import { LiveFeedTopDock } from '@/components/feed/LiveFeedTopDock';

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// Curated seed thoughts for instant discovery
const SEED_THOUGHTS: SharedThoughtDocument[] = [
  {
    id: 'seed_1',
    title: 'Visualizing latent cognitive states',
    summary: 'A mental model for mapping multidimensional thoughts into spatial canvas coordinates with pen strokes and gestures.',
    category: 'Engineering',
    duration: '1w',
    authorAnonymousId: 'seed_author_1',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 24,
    reactions: { resonate: 18, inspire: 6 },
    strokesCount: 18,
    canvasPayload: '',
  },
  {
    id: 'seed_2',
    title: 'The silence between architectural iterations',
    summary: 'Why removing interface chrome allows deeper immersion in creative flow than adding endless buttons.',
    category: 'Creative Vision',
    duration: '1w',
    authorAnonymousId: 'seed_author_2',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 32,
    reactions: { resonate: 22, reflect: 10 },
    strokesCount: 31,
    canvasPayload: '',
  },
  {
    id: 'seed_3',
    title: 'Digital ink physics on e-paper vs AMOLED',
    summary: 'Observations on pen latency, pressure curves, and the uncanny valley of digital handwriting tools.',
    category: 'Engineering',
    duration: '1w',
    authorAnonymousId: 'seed_author_3',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 19,
    reactions: { inspire: 12, resonate: 7 },
    strokesCount: 24,
    canvasPayload: '',
  },
  {
    id: 'seed_4',
    title: 'Overcoming the blank canvas freeze',
    summary: 'Starting with a simple scribble or wandering line to unlock spontaneous subconscious connections.',
    category: 'Introspection',
    duration: '1w',
    authorAnonymousId: 'seed_author_4',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 42,
    reactions: { empathy: 28, resonate: 14 },
    strokesCount: 42,
    canvasPayload: '',
  },
  {
    id: 'seed_5',
    title: 'Non-linear project knowledge graphs',
    summary: 'How hierarchical folders fail complex creative brainstorming and why spatial associative clusters work better.',
    category: 'Philosophy & Study',
    duration: '1w',
    authorAnonymousId: 'seed_author_5',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 27,
    reactions: { reflect: 18, resonate: 9 },
    strokesCount: 16,
    canvasPayload: '',
  },
  {
    id: 'seed_6',
    title: 'Autonomous systems and organic interface loops',
    summary: 'Designing tools that respond to biological human intuition rather than rigid grid systems.',
    category: 'Engineering',
    duration: '1w',
    authorAnonymousId: 'seed_author_6',
    expiresAt: 1780000000000,
    createdAt: 1740000000000,
    reactionCount: 29,
    reactions: { inspire: 19, resonate: 10 },
    strokesCount: 29,
    canvasPayload: '',
  },
];

export default function LiveFeedPage() {
  const [thoughts, setThoughts] = useState<SharedThoughtDocument[]>([]);
  const [primaryMode, setPrimaryMode] = useState<PrimaryViewMode>('flat');
  const [isGlobeOpen, setIsGlobeOpen] = useState<boolean>(false);
  const [activeFeedThought, setActiveFeedThought] = useState<SharedThoughtDocument | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const isClientMounted = useIsClient();

  // Realtime Firestore subscription
  useEffect(() => {
    const unsub = subscribeToLiveFeed((incoming) => {
      if (incoming && incoming.length > 0) {
        const ids = new Set(incoming.map((i) => i.id));
        const filteredSeeds = SEED_THOUGHTS.filter((s) => !ids.has(s.id));
        setThoughts([...incoming, ...filteredSeeds]);
      } else {
        setThoughts(SEED_THOUGHTS);
      }
    });
    return () => unsub();
  }, []);

  const allThoughts = useMemo(() => {
    const base = thoughts.length > 0 ? thoughts : SEED_THOUGHTS;
    if (selectedCategory === 'All') return base;
    return base.filter((t) => t.category === selectedCategory);
  }, [thoughts, selectedCategory]);

  return (
    <div className="relative w-screen h-screen bg-[#FAF9F6] text-neutral-900 overflow-hidden select-none font-sans">
      {/* 1. UP FRONT MAIN CANVAS VIEW: 2D Flat Flowchart Map */}
      {isClientMounted && primaryMode === 'flat' && !isGlobeOpen && (
        <div className="absolute inset-0 z-0">
          <LiveFlat2DCanvas
            thoughts={allThoughts}
            onOpenFeed={(t) => setActiveFeedThought(t)}
          />
        </div>
      )}

      {/* 2. UP FRONT MAIN CANVAS VIEW: Linear Reel Stacked Card List with Zero-Jitter Accordion */}
      {isClientMounted && primaryMode === 'reel' && !isGlobeOpen && (
        <div className="absolute inset-0 z-0">
          <LiveReelGrid
            thoughts={allThoughts}
            onOpenFeed={(t) => setActiveFeedThought(t)}
          />
        </div>
      )}

      {/* 3. DISTANT GLOBE VIEW: Hidden by default, opened when Globe icon is clicked */}
      {isGlobeOpen && (
        <div className="absolute inset-0 z-40">
          <DistantGlobeCosmos
            thoughts={allThoughts}
            onBackTo2D={() => setIsGlobeOpen(false)}
            onSelectThought={(t) => {
              setIsGlobeOpen(false);
              setActiveFeedThought(t);
            }}
          />
        </div>
      )}

      {/* FLOATING TOP DOCK: Fluid space-claiming physics navigation */}
      {!activeFeedThought && !isGlobeOpen && (
        <LiveFeedTopDock
          currentMode={primaryMode}
          onChangeMode={(mode) => setPrimaryMode(mode)}
          onOpenGlobe={() => setIsGlobeOpen(true)}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
        />
      )}

      {/* FULLSCREEN LIVE CANVAS FEED VIEW (When clicked) */}
      {activeFeedThought && (
        <LiveThoughtFeedView
          thoughts={allThoughts}
          initialThoughtId={activeFeedThought.id}
          onClose={() => setActiveFeedThought(null)}
        />
      )}
    </div>
  );
}
