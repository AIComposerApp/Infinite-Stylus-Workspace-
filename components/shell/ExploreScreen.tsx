'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Compass, Map as MapIcon, Globe as GlobeIcon, Sparkles } from 'lucide-react';
import {
  SharedThoughtDocument,
  subscribeToLiveFeed,
  sendThoughtReaction,
} from '@/lib/thoughtspace-service';
import { LiveFlat2DCanvas } from '@/components/feed/LiveFlat2DCanvas';
import { DistantGlobeCosmos } from '@/components/feed/DistantGlobeCosmos';

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

const CATEGORIES = ['All', 'Engineering', 'Creative Vision', 'Introspection', 'Philosophy & Study'];

const INITIAL_POSTS: ExplorePost[] = [
  {
    id: 'post-1',
    title: 'Visualizing latent cognitive states',
    author: 'Elena Rostova',
    category: 'Engineering',
    timeAgo: '42m',
    likes: 48,
    quote: 'A mental model for mapping multidimensional thoughts into spatial canvas coordinates with pen strokes and gestures.',
    strokesCount: 18,
    remixesCount: 6,
    nodes: ['Core insight', 'Horizon'],
  },
  {
    id: 'post-2',
    title: 'The silence between architectural iterations',
    author: 'Maya Lin',
    category: 'Creative Vision',
    timeAgo: '1h',
    likes: 64,
    quote: 'Why removing interface chrome allows deeper immersion in creative flow than adding endless buttons.',
    strokesCount: 31,
    remixesCount: 9,
    nodes: ['Core insight', 'Convergence', 'Future horizon'],
  },
  {
    id: 'post-3',
    title: 'Overcoming the blank canvas freeze',
    author: 'Tunde Bakare',
    category: 'Introspection',
    timeAgo: '3h',
    likes: 42,
    quote: 'Starting with a simple scribble or wandering line to unlock spontaneous subconscious connections.',
    strokesCount: 42,
    remixesCount: 4,
    nodes: ['Scribble', 'First mark'],
  },
  {
    id: 'post-4',
    title: 'Non-linear project knowledge graphs',
    author: 'Sofia Marin',
    category: 'Philosophy & Study',
    timeAgo: '5h',
    likes: 27,
    quote: 'How hierarchical folders fail complex creative brainstorming and why spatial associative clusters work better.',
    strokesCount: 16,
    remixesCount: 3,
    nodes: ['Folders', 'Clusters'],
  },
  {
    id: 'post-5',
    title: 'Digital ink physics on e-paper vs AMOLED',
    author: 'Noah Reyes',
    category: 'Engineering',
    timeAgo: '1d',
    likes: 19,
    quote: 'Observations on pen latency, pressure curves, and the uncanny valley of digital handwriting tools.',
    strokesCount: 24,
    remixesCount: 2,
    nodes: ['Latency', 'Pressure'],
  },
];

function formatTimeAgo(timestamp: number): string {
  const elapsed = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`;
  return `${Math.floor(elapsed / 86400)}d`;
}

// Convert Firestore SharedThoughtDocument to ExplorePost format
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

// Procedural SVG vector diagram matching prototype
function renderPreviewSvg(nodes: string[]) {
  const P = [
    [76, 58],
    [210, 84],
    [120, 134],
  ];

  return (
    <svg viewBox="0 0 300 187.5" preserveAspectRatio="xMidYMid meet" className="w-full h-full block" aria-hidden="true">
      {nodes.length > 1 && (
        <path d="M104 50 Q 150 30 182 74" fill="none" stroke="#7B8CB0" strokeWidth="1.6" strokeDasharray="3 3" />
      )}
      {nodes.length > 2 && (
        <path d="M200 112 Q 180 140 150 138" fill="none" stroke="#7B8CB0" strokeWidth="1.6" />
      )}
      {nodes.map((n, i) => {
        const pt = P[i % P.length];
        const strokeColor = i === 0 ? '#E08A1E' : i === 1 ? '#7B8CB0' : '#7FA08A';
        return (
          <g key={n}>
            <circle cx={pt[0]} cy={pt[1]} r={28} fill="none" stroke={strokeColor} strokeWidth="1.8" />
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
  const [posts, setPosts] = useState<ExplorePost[]>(INITIAL_POSTS);
  const [firestoreThoughts, setFirestoreThoughts] = useState<SharedThoughtDocument[]>([]);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});

  // Real-time live feed subscription
  useEffect(() => {
    try {
      const unsub = subscribeToLiveFeed((remoteDocs) => {
        if (remoteDocs && remoteDocs.length > 0) {
          setFirestoreThoughts(remoteDocs);
          const livePosts = remoteDocs.map(docToExplorePost);
          setPosts([...livePosts, ...INITIAL_POSTS]);
        }
      });
      return () => unsub();
    } catch {
      // Offline fallback
    }
  }, []);

  const toggleLike = async (postId: string) => {
    const isLiked = !!likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isLiked }));
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          return { ...p, likes: p.likes + (isLiked ? -1 : 1) };
        }
        return p;
      })
    );

    // If it's a Firestore document, record reaction
    const post = posts.find((p) => p.id === postId);
    if (post?.sharedDoc && !isLiked) {
      try {
        await sendThoughtReaction(post.sharedDoc.id, 'resonate');
      } catch {
        // silent error handling
      }
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => selectedCategory === 'All' || p.category === selectedCategory);
  }, [posts, selectedCategory]);

  // Combined thoughts list for 2D Map and 3D Globe
  const spatialThoughts = useMemo<SharedThoughtDocument[]>(() => {
    if (firestoreThoughts.length > 0) return firestoreThoughts;
    // Map initial posts into SharedThoughtDocuments if Firestore empty
    return INITIAL_POSTS.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.quote,
      category: p.category,
      duration: '1 week',
      authorAnonymousId: 'anon',
      authorName: p.author,
      expiresAt: Date.now() + 604800000,
      createdAt: Date.now() - 3600000,
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
    if (onSelectSharedThought && thought.canvasPayload) {
      onSelectSharedThought(thought);
    } else {
      const p = docToExplorePost(thought);
      onOpenThoughtCanvas(p);
    }
  };

  return (
    <div
      className={`absolute inset-0 bg-[var(--phone-paper)] transition-opacity duration-200 flex flex-col ${
        isOpen ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'
      }`}
    >
      {/* STICKY TOP APP HEADER WITH REEL / MAP / GLOBE TOGGLER */}
      <header className="sticky top-0 z-30 bg-[var(--phone-paper)]/95 backdrop-blur-md px-4 sm:px-8 pt-5 pb-3 border-b border-[var(--phone-hair)]/40 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-[32px] sm:text-[36px] font-semibold text-[var(--phone-ink)] tracking-tight leading-tight m-0">
              Explore
            </h1>
            <p className="text-[13px] text-[var(--phone-mute)] hidden sm:block">
              Discover anonymous thought streams across the globe in reel, spatial map, and celestial 3D cosmos.
            </p>
          </div>

          {/* Segmented Control (Reel / Map / Globe) */}
          <div
            className="flex bg-[var(--phone-chip)] rounded-[12px] p-1 h-11 w-full sm:w-auto shadow-inner"
            role="group"
            aria-label="View Mode"
          >
            {(
              [
                { id: 'Reel', label: 'Reel', icon: Compass },
                { id: 'Map', label: '2D Map', icon: MapIcon },
                { id: 'Globe', label: '3D Globe', icon: GlobeIcon },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              const isSelected = view === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setView(mode.id)}
                  className={`flex-1 sm:flex-initial sm:px-5 flex items-center justify-center gap-1.5 h-9 rounded-[9px] text-[14px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--phone-row)] text-[var(--phone-ink)] shadow-xs border border-[var(--phone-hair)]'
                      : 'bg-transparent text-[var(--phone-mute)] hover:text-[var(--phone-ink)]'
                  }`}
                >
                  <Icon className="w-4 h-4 stroke-[2]" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter Chips Bar (Visible in Reel View) */}
        {view === 'Reel' && (
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0"
            style={{ scrollbarWidth: 'none' }}
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
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 flex items-center gap-1.5 h-9 px-4 rounded-full text-[14px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--phone-selbg)] text-[var(--phone-selfg)] shadow-xs'
                      : 'bg-[var(--phone-chip)] text-[var(--phone-ink)] hover:bg-black/10'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${
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
        )}
      </header>

      {/* MAIN VIEW CONTENT CONTAINER */}
      <div className="flex-1 relative overflow-hidden">
        {/* REEL VIEW: Rich Responsive Feed Cards */}
        {view === 'Reel' && (
          <div
            className="h-full overflow-y-auto px-4 sm:px-8 py-5 pb-32"
            style={{ scrollbarWidth: 'none' }}
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
                        className="bg-[var(--phone-row)] border border-[var(--phone-hair)] rounded-[24px] p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
                      >
                        {/* Card Header */}
                        <div>
                          <div className="flex gap-3 items-start">
                            <span className="shrink-0 w-11 h-11 rounded-full bg-[var(--phone-chip)] flex items-center justify-center text-[14px] font-semibold text-[var(--phone-ink)] shadow-2xs">
                              {initials}
                            </span>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[17px] font-semibold text-[var(--phone-ink)] leading-snug truncate">
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
                          <div className="mt-3.5 p-3 rounded-xl bg-[var(--phone-quote)] text-[14px] sm:text-[15px] leading-relaxed italic text-[var(--phone-ink)] font-serif border border-amber-200/40">
                            &ldquo;{post.quote}&rdquo;
                          </div>

                          {/* Visual Spatial Node Graph Preview */}
                          <div className="aspect-[16/10] my-3.5 bg-[var(--phone-paper)] border border-[var(--phone-hair)] rounded-[16px] overflow-hidden">
                            {renderPreviewSvg(post.nodes)}
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex justify-between items-center pt-2 border-t border-[var(--phone-hair)]/40 mt-1">
                          <span className="text-[13px] text-[var(--phone-mute)]">
                            {post.strokesCount} strokes · {post.remixesCount} remixes
                          </span>
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
    </div>
  );
};

export default ExploreScreen;
