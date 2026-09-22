'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  Compass,
  Map as MapIcon,
  Globe as GlobeIcon,
  Sparkles,
  History,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  SharedThoughtDocument,
  subscribeToLiveFeed,
  sendThoughtReaction,
} from '@/lib/thoughtspace-service';
import { LiveFlat2DCanvas } from '@/components/feed/LiveFlat2DCanvas';
import { DistantGlobeCosmos } from '@/components/feed/DistantGlobeCosmos';
import { HoldToDragPillDock, PillDockItem } from '@/components/ui/HoldToDragPillDock';
import { ReelThoughtProcessModal } from '@/components/feed/ReelThoughtProcessModal';

export interface ExplorePost {
  id: string;
  title: string;
  author: string;
  category: string;
  timeAgo: string;
  likes: number;
  quote: string;
  strokesCount: number;
  remixesCount: number;
  nodes: string[];
  sharedDoc?: SharedThoughtDocument;
}

interface ExploreScreenProps {
  isOpen: boolean;
  onOpenThoughtCanvas: (post: ExplorePost) => void;
  onSelectSharedThought?: (thought: SharedThoughtDocument) => void;
}

const CATEGORIES = [
  'All',
  'Engineering',
  'Creative Vision',
  'Introspection',
  'Philosophy & Study',
];

const VIEW_ITEMS: PillDockItem<'Reel' | 'Map' | 'Globe'>[] = [
  { id: 'Reel', label: 'Reel', icon: Compass },
  { id: 'Map', label: '2D Map', icon: MapIcon },
  { id: 'Globe', label: '3D Globe', icon: GlobeIcon },
];

const INITIAL_POSTS: ExplorePost[] = [
  {
    id: 'post-1',
    title: 'Visualizing latent cognitive states',
    author: 'Elena Rostova',
    category: 'Engineering',
    timeAgo: '42m',
    likes: 48,
    quote:
      'A mental model for mapping multidimensional thoughts into spatial canvas coordinates with pen strokes and gestures.',
    strokesCount: 18,
    remixesCount: 6,
    nodes: ['Core insight', 'Horizon'],
  },
  {
    id: 'post-2',
    title: 'Non-linear narrative composition',
    author: 'Mateo Chen',
    category: 'Creative Vision',
    timeAgo: '2h',
    likes: 31,
    quote:
      'Branching story arcs that loop back upon themselves, drafted as freeform spatial mind webs.',
    strokesCount: 24,
    remixesCount: 3,
    nodes: ['Beginning', 'Forks', 'Return'],
  },
  {
    id: 'post-3',
    title: 'Epistemic humility in system architecture',
    author: 'Sora Tanaka',
    category: 'Engineering',
    timeAgo: '5h',
    likes: 92,
    quote:
      'Designing distributed consensus mechanisms by first embracing unknown system failure modes on an infinite canvas.',
    strokesCount: 42,
    remixesCount: 15,
    nodes: ['Unknowns', 'Fault bounds', 'Consensus'],
  },
  {
    id: 'post-4',
    title: 'Internal silence and creative gestation',
    author: 'Aria Sterling',
    category: 'Introspection',
    timeAgo: '1d',
    likes: 67,
    quote:
      'The quiet period between pen strokes is where synthesis occurs. Unhurried sketches as meditative anchors.',
    strokesCount: 12,
    remixesCount: 8,
    nodes: ['Stillness', 'Incubation', 'Form'],
  },
  {
    id: 'post-5',
    title: 'Dialectics of spatial knowledge representation',
    author: 'Dr. Lucas Vane',
    category: 'Philosophy & Study',
    timeAgo: '2d',
    likes: 54,
    quote:
      'Replacing linear text hierarchies with spatial proximity. Distance reflects conceptual divergence.',
    strokesCount: 36,
    remixesCount: 11,
    nodes: ['Thesis', 'Antithesis', 'Spatial Synthesis'],
  },
];

const MOCK_BASE_TIME = 1773000000000;

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'recently';
  const elapsed = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  return `${Math.floor(elapsed / 86400)}d`;
}

function docToExplorePost(doc: SharedThoughtDocument): ExplorePost {
  return {
    id: doc.id,
    title: doc.title || 'Untitled Thought Dump',
    author: doc.authorName || 'Anonymous',
    category: doc.category || 'Engineering',
    timeAgo: formatTimeAgo(doc.createdAt),
    likes: doc.reactionCount || 1,
    quote: doc.summary || 'Anonymous thoughts dumped onto infinite canvas',
    strokesCount: doc.strokesCount || 12,
    remixesCount: doc.remixCount || 0,
    nodes: ['Stream', 'Insight', 'Action'],
    sharedDoc: doc,
  };
}

function renderPreviewSvg(nodes: string[]) {
  const P = [
    [76, 58],
    [210, 84],
    [120, 134],
  ];

  return (
    <svg
      viewBox="0 0 300 187.5"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
      aria-hidden="true"
    >
      {nodes.length > 1 && (
        <path
          d="M104 50 Q 150 30 182 74"
          fill="none"
          stroke="#7B8CB0"
          strokeWidth="1.6"
          strokeDasharray="3 3"
        />
      )}
      {nodes.length > 2 && (
        <path
          d="M200 112 Q 180 140 150 138"
          fill="none"
          stroke="#7B8CB0"
          strokeWidth="1.6"
        />
      )}
      {nodes.map((n, i) => {
        const pt = P[i % P.length];
        const strokeColor = i === 0 ? '#E08A1E' : i === 1 ? '#7B8CB0' : '#7FA08A';
        return (
          <g key={n}>
            <circle
              cx={pt[0]}
              cy={pt[1]}
              r={28}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.8"
            />
            <text
              x={pt[0]}
              y={pt[1] + 4}
              textAnchor="middle"
              className="font-handwriting-kalam text-[11px] fill-[var(--phone-ink)] font-normal"
            >
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  isOpen,
  onOpenThoughtCanvas,
  onSelectSharedThought,
}) => {
  const [view, setView] = useState<'Reel' | 'Map' | 'Globe'>('Reel');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [firestoreThoughts, setFirestoreThoughts] = useState<SharedThoughtDocument[]>([]);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [inspectingPost, setInspectingPost] = useState<ExplorePost | null>(null);

  // Category scroll container & edge fade mask ref
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);

  // Update scroll gradient indicator states
  const checkCategoryScroll = () => {
    const el = categoryScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
  };

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    checkCategoryScroll();
    el.addEventListener('scroll', checkCategoryScroll, { passive: true });
    window.addEventListener('resize', checkCategoryScroll);
    return () => {
      el.removeEventListener('scroll', checkCategoryScroll);
      window.removeEventListener('resize', checkCategoryScroll);
    };
  }, [view]);

  // Subscribe to real-time live feed from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToLiveFeed((thoughts) => {
      if (thoughts && thoughts.length > 0) {
        setFirestoreThoughts(thoughts);
      }
    });
    return () => unsubscribe();
  }, []);

  const posts = useMemo(() => {
    if (firestoreThoughts.length > 0) {
      const livePosts = firestoreThoughts.map(docToExplorePost);
      const liveIds = new Set(livePosts.map((p) => p.id));
      const fallbackRemaining = INITIAL_POSTS.filter((p) => !liveIds.has(p.id));
      return [...livePosts, ...fallbackRemaining];
    }
    return INITIAL_POSTS;
  }, [firestoreThoughts]);

  const filteredPosts = useMemo(() => {
    if (selectedCategory === 'All') return posts;
    return posts.filter((p) => p.category === selectedCategory);
  }, [posts, selectedCategory]);

  const toggleLike = async (postId: string) => {
    const isCurrentlyLiked = !!likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isCurrentlyLiked }));

    const post = posts.find((p) => p.id === postId);
    if (post) {
      post.likes += isCurrentlyLiked ? -1 : 1;
      if (post.sharedDoc?.id && !isCurrentlyLiked) {
        await sendThoughtReaction(post.sharedDoc.id, 'resonate');
      }
    }
  };

  const spatialThoughts = useMemo<SharedThoughtDocument[]>(() => {
    if (firestoreThoughts.length > 0) {
      return firestoreThoughts;
    }
    return INITIAL_POSTS.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.quote,
      category: p.category,
      duration: '1 week',
      authorAnonymousId: 'anon',
      authorName: p.author,
      expiresAt: MOCK_BASE_TIME + 604800000,
      createdAt: MOCK_BASE_TIME - 3600000,
      reactionCount: p.likes,
      reactions: { resonate: p.likes },
      strokesCount: p.strokesCount,
      canvasPayload: JSON.stringify({
        strokes: [],
        canvasTexts: [{ text: p.quote, x: 120, y: 140, id: 't1' }],
        thoughts: [{ text: p.title, x: 100, y: 60, id: 'th1' }],
      }),
    }));
  }, [firestoreThoughts]);

  const handleSelectSpatialThought = (thought: SharedThoughtDocument) => {
    const post = docToExplorePost(thought);
    setInspectingPost(post);
  };

  const handleScrollCategories = (direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -160 : 160;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div
      className={`absolute inset-0 bg-[var(--phone-paper)] transition-opacity duration-200 flex flex-col ${
        isOpen ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'
      }`}
    >
      {/* STICKY TOP APP HEADER WITH HOLD-TO-DRAG VIEW TOGGLER */}
      <header className="sticky top-0 z-30 bg-[var(--phone-paper)]/95 backdrop-blur-md px-4 sm:px-8 pt-4 pb-3 border-b border-[var(--phone-hair)]/40 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-semibold text-[var(--phone-ink)] tracking-tight leading-tight m-0">
              Explore
            </h1>
            <p className="text-[12px] sm:text-[13px] text-[var(--phone-mute)]">
              Discover anonymous thought streams across the globe in reel, spatial map, and cosmos.
            </p>
          </div>

          {/* Tactile Hold-to-Drag Spring Dock for Top Modes (Reel / 2D Map / 3D Globe) */}
          <div className="w-full sm:w-[320px]">
            <HoldToDragPillDock<'Reel' | 'Map' | 'Globe'>
              items={VIEW_ITEMS}
              activeId={view}
              onSelect={setView}
              size="sm"
              ariaLabel="View Mode: Hold and drag or tap to switch between Reel, 2D Map, and 3D Globe"
            />
          </div>
        </div>

        {/* Enhanced Mobile-Responsive Category Filter Bar with Edge-Fade & Peek Indicators */}
        {view === 'Reel' && (
          <div className="relative flex items-center -mx-4 px-4 sm:mx-0 sm:px-0 mt-1">
            {/* Left Scroll Chevron for quick tapping on mobile/desktop */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScrollCategories('left')}
                className="absolute left-1 z-20 p-1 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-md border border-black/10 text-neutral-700 hover:text-neutral-950 transition-all cursor-pointer active:scale-90 hidden sm:flex"
                title="Scroll categories left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Scrollable Container with Smooth Touch Panning */}
            <div
              ref={categoryScrollRef}
              style={{
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x',
              }}
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 pt-1 w-full scroll-smooth"
            >
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count =
                  cat === 'All'
                    ? posts.length
                    : posts.filter((p) => p.category === cat).length;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={(e) => {
                      setSelectedCategory(cat);
                      e.currentTarget.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center',
                      });
                    }}
                    className={`shrink-0 flex items-center gap-1.5 h-8 sm:h-9 px-3 sm:px-3.5 rounded-full text-[13px] font-medium transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-[var(--phone-selbg)] text-[var(--phone-selfg)] shadow-xs font-semibold'
                        : 'bg-[var(--phone-chip)] text-[var(--phone-ink)] hover:bg-black/10'
                    }`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`text-[10px] sm:text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-black/5 text-[var(--phone-mute)]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Scroll Chevron & Subtle Mobile Peek Gradient */}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScrollCategories('right')}
                className="absolute right-1 z-20 p-1 rounded-full bg-white/90 dark:bg-neutral-800/90 shadow-md border border-black/10 text-neutral-700 hover:text-neutral-950 transition-all cursor-pointer active:scale-90 hidden sm:flex"
                title="Scroll categories right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {/* MAIN VIEW CONTENT CONTAINER */}
      <div className="flex-1 relative overflow-hidden">
        {/* REEL VIEW: Rich Responsive Feed Cards with uninhibited vertical mobile scrolling */}
        {view === 'Reel' && (
          <div
            style={{
              scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              overscrollBehaviorY: 'contain',
            }}
            className="h-full overflow-y-auto px-4 sm:px-8 py-5 pb-32"
          >
            <div className="max-w-7xl mx-auto">
              {filteredPosts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredPosts.map((post) => {
                    const isLiked = !!likedPosts[post.id];
                    const initials = post.author
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2);

                    return (
                      <article
                        key={post.id}
                        className="bg-[var(--phone-row)] border border-[var(--phone-hair)] rounded-[24px] p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow group"
                      >
                        {/* Card Header & Content */}
                        <div>
                          <div className="flex gap-3 items-start">
                            <span className="shrink-0 w-11 h-11 rounded-full bg-[var(--phone-chip)] flex items-center justify-center text-[14px] font-semibold text-[var(--phone-ink)] shadow-2xs">
                              {initials}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h3
                                onClick={() => setInspectingPost(post)}
                                className="text-[17px] font-semibold text-[var(--phone-ink)] leading-snug truncate cursor-pointer hover:underline"
                              >
                                {post.title}
                              </h3>
                              <div className="text-[13px] text-[var(--phone-mute)] mt-0.5 truncate">
                                {post.author} · {post.category} · {post.timeAgo}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleLike(post.id)}
                              className={`shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium transition-all active:scale-95 cursor-pointer ${
                                isLiked
                                  ? 'bg-rose-50 text-[#D4537E] border border-rose-200'
                                  : 'bg-[var(--phone-chip)] text-[var(--phone-ink)] hover:bg-black/10'
                              }`}
                              aria-label="Like"
                              title="Resonates with this thought"
                            >
                              <Heart
                                className={`w-4 h-4 transition-transform ${
                                  isLiked
                                    ? 'fill-[#D4537E] text-[#D4537E] scale-110'
                                    : 'text-[var(--phone-mute)]'
                                }`}
                              />
                              <span className="font-semibold">{post.likes}</span>
                            </button>
                          </div>

                          {/* Handwriting Quote Callout */}
                          <div
                            onClick={() => setInspectingPost(post)}
                            className="mt-3.5 p-3 rounded-xl bg-[var(--phone-quote)] text-[14px] sm:text-[15px] leading-relaxed italic text-[var(--phone-ink)] font-serif border border-amber-200/40 cursor-pointer"
                          >
                            &ldquo;{post.quote}&rdquo;
                          </div>

                          {/* Visual Spatial Node Graph Preview with Dial-back Prompt */}
                          <div
                            onClick={() => setInspectingPost(post)}
                            className="relative aspect-[16/10] my-3.5 bg-[var(--phone-paper)] border border-[var(--phone-hair)] rounded-[16px] overflow-hidden cursor-pointer group-hover:border-neutral-400 transition-colors"
                          >
                            {renderPreviewSvg(post.nodes)}
                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-neutral-900 text-xs font-semibold shadow-md">
                                <History className="w-3.5 h-3.5 text-neutral-700" />
                                <span>Replay Thought Process</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex justify-between items-center pt-2 border-t border-[var(--phone-hair)]/40 mt-1">
                          <button
                            type="button"
                            onClick={() => setInspectingPost(post)}
                            className="flex items-center gap-1 text-[13px] text-neutral-600 hover:text-neutral-950 font-medium transition-colors cursor-pointer"
                            title="Dial back through this author's thought process"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Dial back</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (post.sharedDoc && onSelectSharedThought) {
                                onSelectSharedThought(post.sharedDoc);
                              } else {
                                onOpenThoughtCanvas(post);
                              }
                            }}
                            className="h-9 px-4 rounded-full bg-[var(--phone-selbg)] text-[var(--phone-selfg)] text-[14px] font-medium hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Open canvas</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center text-[15px] text-[var(--phone-mute)]">
                  No thought streams found in this topic yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* MAP VIEW: Full Interactive 2D Spatial Plane */}
        {view === 'Map' && (
          <div className="absolute inset-0 z-10 bg-[var(--phone-paper)]">
            <LiveFlat2DCanvas
              thoughts={spatialThoughts}
              onOpenFeed={(thought) => handleSelectSpatialThought(thought)}
            />
          </div>
        )}

        {/* GLOBE VIEW: Full Interactive 3D Celestial Cosmos */}
        {view === 'Globe' && (
          <div className="absolute inset-0 z-10 bg-[var(--phone-paper)]">
            <DistantGlobeCosmos
              thoughts={spatialThoughts}
              onBackTo2D={() => setView('Map')}
              onSelectThought={(thought) => handleSelectSpatialThought(thought)}
            />
          </div>
        )}
      </div>

      {/* Reel Thought Process Modal with Dial-Back Time Machine */}
      {inspectingPost && (
        <ReelThoughtProcessModal
          post={inspectingPost}
          onClose={() => setInspectingPost(null)}
          onOpenInCanvas={(p) => {
            setInspectingPost(null);
            onOpenThoughtCanvas(p);
          }}
        />
      )}
    </div>
  );
};

export default ExploreScreen;
