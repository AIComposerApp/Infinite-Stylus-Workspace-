'use client';

import React, { useState } from 'react';
import { Heart } from 'lucide-react';

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
}

interface ExploreScreenProps {
  isOpen: boolean;
  onOpenThoughtCanvas: (post: ExplorePost) => void;
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
}) => {
  const [view, setView] = useState<'Reel' | 'Map' | 'Globe'>('Reel');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [posts, setPosts] = useState<ExplorePost[]>(INITIAL_POSTS);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});

  const toggleLike = (postId: string) => {
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
  };

  const filteredPosts = posts.filter(
    (p) => selectedCategory === 'All' || p.category === selectedCategory
  );

  return (
    <div
      className={`absolute inset-0 overflow-y-auto px-4 pt-5 pb-28 bg-[var(--phone-paper)] transition-opacity duration-200 ${
        isOpen ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'
      }`}
      style={{ scrollbarWidth: 'none' }}
    >
      {/* Top Title */}
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-[34px] font-semibold text-[var(--phone-ink)] tracking-tight leading-tight m-0">
          Explore
        </h1>
      </div>

      {/* Segmented Control (Reel / Map / Globe) */}
      <div className="flex bg-[var(--phone-chip)] rounded-[10px] p-0.5 h-9 mb-3" role="group" aria-label="View">
        {(['Reel', 'Map', 'Globe'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`flex-1 h-8 rounded-lg text-[14px] font-medium transition-all cursor-pointer ${
              view === mode
                ? 'bg-[var(--phone-row)] text-[var(--phone-ink)] shadow-2xs border border-[var(--phone-hair)]'
                : 'bg-transparent text-[var(--phone-ink)] hover:text-black opacity-80'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Category Filter Chips (visible in Reel view) */}
      {view === 'Reel' && (
        <div
          className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3 pt-0.5 no-scrollbar"
          style={{ scrollbarWidth: 'none' }}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 h-10 px-4 rounded-full text-[15px] transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--phone-selbg)] text-[var(--phone-selfg)] font-medium shadow-xs'
                    : 'bg-[var(--phone-chip)] text-[var(--phone-ink)] hover:bg-black/10'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      {view === 'Reel' ? (
        <div className="flex flex-col gap-3">
          {filteredPosts.length > 0 ? (
            filteredPosts.map((post) => {
              const isLiked = !!likedPosts[post.id];
              const initials = post.author
                .split(' ')
                .map((w) => w[0])
                .join('');

              return (
                <article
                  key={post.id}
                  className="bg-[var(--phone-row)] border border-[var(--phone-hair)] rounded-[20px] p-3.5 shadow-2xs"
                >
                  {/* Card Header */}
                  <div className="flex gap-2.5 items-start">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-[var(--phone-chip)] flex items-center justify-center text-[13px] font-medium text-[var(--phone-ink)]">
                      {initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-medium text-[var(--phone-ink)] leading-snug">
                        {post.title}
                      </div>
                      <div className="text-[13px] text-[var(--phone-mute)] mt-0.5">
                        {post.author} · {post.category} · {post.timeAgo}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleLike(post.id)}
                      className={`shrink-0 flex items-center gap-1.5 h-10 px-3 rounded-full text-[14px] font-medium transition-colors cursor-pointer ${
                        isLiked
                          ? 'bg-rose-50 text-[#D4537E]'
                          : 'bg-[var(--phone-chip)] text-[var(--phone-ink)] hover:bg-black/10'
                      }`}
                      aria-label="Like"
                    >
                      <Heart
                        className={`w-4 h-4 transition-transform ${
                          isLiked ? 'fill-[#D4537E] text-[#D4537E] scale-110' : 'text-[var(--phone-mute)]'
                        }`}
                      />
                      <span>{post.likes}</span>
                    </button>
                  </div>

                  {/* Handwriting Quote */}
                  <p className="mt-3 mb-0 p-2.5 px-3 rounded-xl bg-[var(--phone-quote)] text-[15px] leading-relaxed italic text-[var(--phone-ink)] font-serif">
                    &ldquo;{post.quote}&rdquo;
                  </p>

                  {/* Visual Node Graph Preview */}
                  <div className="aspect-[16/10] my-3 bg-[var(--phone-paper)] border border-[var(--phone-hair)] rounded-[14px] overflow-hidden">
                    {renderPreviewSvg(post.nodes)}
                  </div>

                  {/* Card Footer */}
                  <div className="flex justify-between items-center pt-0.5">
                    <span className="text-[13px] text-[var(--phone-mute)]">
                      {post.strokesCount} strokes · {post.remixesCount} remixes
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenThoughtCanvas(post)}
                      className="h-10 px-4 rounded-full bg-[var(--phone-selbg)] text-[var(--phone-selfg)] text-[15px] font-medium hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
                    >
                      Open canvas
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="py-12 px-2 text-center text-[15px] text-[var(--phone-mute)]">
              No streams in this topic yet.
            </div>
          )}
        </div>
      ) : (
        <div className="py-16 px-4 text-center text-[15px] text-[var(--phone-mute)] bg-[var(--phone-row)] rounded-2xl border border-[var(--phone-hair)]">
          The {view.toLowerCase()} view shows the same streams spatially. Tap <span className="font-semibold text-[var(--phone-ink)]">Reel</span> to explore the feed cards.
        </div>
      )}
    </div>
  );
};
export default ExploreScreen;
