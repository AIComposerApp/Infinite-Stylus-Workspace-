'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  SharedThoughtDocument,
  subscribeToLiveFeed,
} from '@/lib/thoughtspace-service';
import { PrimaryViewMode } from '@/components/feed/ViewToggler';
import { LiveFlat2DCanvas } from '@/components/feed/LiveFlat2DCanvas';
import { LiveReelGrid } from '@/components/feed/LiveReelGrid';
import { LiveThoughtFeedView } from '@/components/feed/LiveThoughtFeedView';
import { DistantGlobeCosmos } from '@/components/feed/DistantGlobeCosmos';
import { GlobalViewBar, GlobalViewMode } from '@/components/navigation/GlobalViewBar';

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// Curated seed thoughts with dynamic realistic timestamps, authentic author names & remix counts
const getCuratedSeedThoughts = (): SharedThoughtDocument[] => {
  const now = typeof Date.now === 'function' ? Date.now() : 1780000000000;
  return [
    {
      id: 'seed_1',
      title: 'Visualizing latent cognitive states',
      summary: 'A mental model for mapping multidimensional thoughts into spatial canvas coordinates with pen strokes and gestures.',
      category: 'Engineering',
      duration: '1w',
      authorAnonymousId: 'elena_rostova',
      authorName: 'Elena Rostova',
      remixCount: 12,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 35 * 60 * 1000, // 35 minutes ago
      reactionCount: 48,
      reactions: { resonate: 32, inspire: 16 },
      strokesCount: 18,
      canvasPayload: '',
    },
    {
      id: 'seed_2',
      title: 'The silence between architectural iterations',
      summary: 'Why removing interface chrome allows deeper immersion in creative flow than adding endless buttons.',
      category: 'Creative Vision',
      duration: '1w',
      authorAnonymousId: 'maya_lin',
      authorName: 'Maya Lin',
      remixCount: 9,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 75 * 60 * 1000, // 1 hour ago
      reactionCount: 64,
      reactions: { resonate: 42, reflect: 22 },
      strokesCount: 31,
      canvasPayload: '',
    },
    {
      id: 'seed_3',
      title: 'Digital ink physics on e-paper vs AMOLED',
      summary: 'Observations on pen latency, pressure curves, and the uncanny valley of digital handwriting tools.',
      category: 'Engineering',
      duration: '1w',
      authorAnonymousId: 'david_kim',
      authorName: 'David Kim',
      remixCount: 7,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 180 * 60 * 1000, // 3 hours ago
      reactionCount: 37,
      reactions: { inspire: 24, resonate: 13 },
      strokesCount: 24,
      canvasPayload: '',
    },
    {
      id: 'seed_4',
      title: 'Overcoming the blank canvas freeze',
      summary: 'Starting with a simple scribble or wandering line to unlock spontaneous subconscious connections.',
      category: 'Introspection',
      duration: '1w',
      authorAnonymousId: 'kofi_mensah',
      authorName: 'Kofi Mensah',
      remixCount: 15,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 360 * 60 * 1000, // 6 hours ago
      reactionCount: 82,
      reactions: { empathy: 54, resonate: 28 },
      strokesCount: 42,
      canvasPayload: '',
    },
    {
      id: 'seed_5',
      title: 'Non-linear project knowledge graphs',
      summary: 'How hierarchical folders fail complex creative brainstorming and why spatial associative clusters work better.',
      category: 'Philosophy & Study',
      duration: '1w',
      authorAnonymousId: 'aria_vance',
      authorName: 'Aria Vance',
      remixCount: 8,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 840 * 60 * 1000, // 14 hours ago
      reactionCount: 51,
      reactions: { reflect: 31, resonate: 20 },
      strokesCount: 16,
      canvasPayload: '',
    },
    {
      id: 'seed_6',
      title: 'Autonomous systems and organic interface loops',
      summary: 'Designing tools that respond to biological human intuition rather than rigid grid systems.',
      category: 'Engineering',
      duration: '1w',
      authorAnonymousId: 'sora_takahashi',
      authorName: 'Sora Takahashi',
      remixCount: 11,
      expiresAt: now + 7 * 86400 * 1000,
      createdAt: now - 1440 * 60 * 1000, // 1 day ago
      reactionCount: 59,
      reactions: { inspire: 38, resonate: 21 },
      strokesCount: 29,
      canvasPayload: '',
    },
  ];
};

const SEED_THOUGHTS: SharedThoughtDocument[] = getCuratedSeedThoughts();

const CATEGORIES = ['All', 'Engineering', 'Creative Vision', 'Introspection', 'Philosophy & Study'];

export default function LiveFeedPage() {
  const router = useRouter();
  const [thoughts, setThoughts] = useState<SharedThoughtDocument[]>([]);
  const [primaryMode, setPrimaryMode] = useState<PrimaryViewMode>(() => {
    if (typeof window === 'undefined') return 'flat';
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'reel' ? 'reel' : 'flat';
  });
  const [isGlobeOpen, setIsGlobeOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'cosmos';
  });
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

  const currentGlobalView: GlobalViewMode = isGlobeOpen
    ? 'cosmos'
    : primaryMode === 'reel'
    ? 'reel'
    : 'flat';

  const handleGlobalViewSwitch = (mode: GlobalViewMode) => {
    if (mode === 'canvas') {
      router.push('/');
    } else if (mode === 'flat') {
      setIsGlobeOpen(false);
      setPrimaryMode('flat');
      window.history.replaceState(null, '', '/feed?mode=flat');
    } else if (mode === 'reel') {
      setIsGlobeOpen(false);
      setPrimaryMode('reel');
      window.history.replaceState(null, '', '/feed?mode=reel');
    } else if (mode === 'cosmos') {
      setIsGlobeOpen(true);
      window.history.replaceState(null, '', '/feed?mode=cosmos');
    }
  };

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

      {/* 3. DISTANT GLOBE VIEW: Opened when Cosmos mode is selected */}
      {isGlobeOpen && (
        <div className="absolute inset-0 z-40">
          <DistantGlobeCosmos
            thoughts={allThoughts}
            onBackTo2D={() => {
              setIsGlobeOpen(false);
              window.history.replaceState(null, '', `/feed?mode=${primaryMode}`);
            }}
            onSelectThought={(t) => {
              setIsGlobeOpen(false);
              setActiveFeedThought(t);
            }}
            onSwitchView={handleGlobalViewSwitch}
          />
        </div>
      )}

      {/* UNIFIED GLOBAL VIEW SWITCHER: Top-Centered Anchor Across All Interfaces */}
      {!activeFeedThought && !isGlobeOpen && (
        <>
          <GlobalViewBar
            activeView={currentGlobalView}
            onSwitchView={handleGlobalViewSwitch}
          />

          {/* Minimal Floating Category Filters: Sits cleanly beneath the Global View Switcher */}
          <div className="fixed top-16 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
            <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-white/85 border border-neutral-200/70 shadow-xs backdrop-blur-md overflow-x-auto max-w-[94vw] scrollbar-none">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold tracking-tight transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </>
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
