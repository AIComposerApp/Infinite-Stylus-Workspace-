'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Grid2x2,
  Globe,
  Plus,
  ArrowLeft,
  SlidersHorizontal,
  X,
  Sparkles,
  Compass,
  Radio,
} from 'lucide-react';
import { PrimaryViewMode } from '@/components/feed/ViewToggler';

interface LiveFeedTopDockProps {
  currentMode: PrimaryViewMode;
  onChangeMode: (mode: PrimaryViewMode) => void;
  onOpenGlobe: () => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
}

const CATEGORIES = ['All', 'Engineering', 'Creative Vision', 'Introspection', 'Philosophy & Study'];

export const LiveFeedTopDock: React.FC<LiveFeedTopDockProps> = ({
  currentMode,
  onChangeMode,
  onOpenGlobe,
  selectedCategory,
  onSelectCategory,
}) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <header className="fixed top-4 inset-x-0 z-40 flex justify-center items-center pointer-events-none px-3 select-none">
      {/* Outer Floating Dock Container */}
      <div
        className={`pointer-events-auto relative flex items-center justify-between w-[94vw] max-w-[560px] h-[52px] ${
          isOpen ? 'is-open' : ''
        }`}
      >
        {/* 1. Adjacent Icon / Logo: .nav_logo_wrap */}
        <div
          onClick={() => router.push('/')}
          title="Return to Canvas Studio"
          style={{
            transform: isOpen ? 'scale(0)' : 'scale(1)',
            opacity: isOpen ? 0 : 1,
            pointerEvents: isOpen ? 'none' : 'auto',
            transition:
              'transform 0.6s cubic-bezier(0.65, 0, 0, 1) 0.05s, opacity 0.4s ease',
          }}
          className="nav_logo_wrap flex items-center justify-center w-[3.5rem] h-[48px] rounded-2xl bg-white/95 border border-neutral-200/90 shadow-md backdrop-blur-md cursor-pointer hover:bg-neutral-50 shrink-0 group active:scale-95"
        >
          <ArrowLeft className="w-4 h-4 text-neutral-600 group-hover:text-neutral-950 transition-colors" />
        </div>

        {/* 2. Inner Interaction Pill: .nav_bar_inner (Space-Claim Tradeoff) */}
        <div
          style={{
            width: isOpen ? '100%' : 'calc(100% - 4.1rem)',
            backgroundColor: isOpen ? '#141414' : '#FFFDF9',
            color: isOpen ? '#FFFFFF' : '#171717',
            transition:
              'width 0.6s cubic-bezier(0.65, 0, 0, 1), background-color 0.4s ease, color 0.4s ease',
          }}
          className="nav_bar_inner h-[48px] rounded-2xl border border-neutral-200/90 shadow-md backdrop-blur-md flex items-center justify-between px-3 sm:px-4 relative overflow-hidden"
        >
          {/* Default Unexpanded Content */}
          {!isOpen ? (
            <div className="flex items-center justify-between w-full">
              {/* Left Brand & Live Icon */}
              <div className="flex items-center gap-2">
                <Image
                  src="/icons/dock-main-dark-128.png"
                  alt="Thoughtspace"
                  width={20}
                  height={20}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 object-contain pointer-events-none select-none"
                />
                <span className="text-xs font-bold tracking-tight text-neutral-800 hidden xs:inline">
                  Streams
                </span>
              </div>

              {/* Center Mode Controls (2D Map vs Linear Reel) */}
              <div className="flex items-center gap-1 bg-neutral-100/90 p-0.5 rounded-xl border border-neutral-200/60">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeMode('flat');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    currentMode === 'flat'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                  title="2D Flowchart Map"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">2D Map</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeMode('reel');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    currentMode === 'reel'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                  title="Linear Reel Streams"
                >
                  <Grid2x2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reel</span>
                </button>
              </div>

              {/* Right Social Actions: Distant Cosmos & Expand Trigger */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenGlobe();
                  }}
                  className="p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer"
                  title="View 3D Cosmos"
                >
                  <Globe className="w-4 h-4 text-blue-600" />
                </button>

                {/* Space Claim Expansion Trigger (calls e.stopPropagation()) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                  }}
                  className="p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer active:scale-90"
                  title="Filter categories & options"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Expanded Space-Claimed State: Inverted colors, social filters, and quick thought dump */
            <div className="flex items-center justify-between w-full animate-in fade-in duration-300">
              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-[calc(100%-5rem)]">
                {CATEGORIES.map((cat) => {
                  const isSel = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategory(cat);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-white text-neutral-950 shadow-xs'
                          : 'bg-white/10 text-neutral-300 hover:bg-white/20 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Right Actions in Expanded Mode */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push('/');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold transition-colors cursor-pointer active:scale-95"
                  title="Dump new thought"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Thought</span>
                </button>

                {/* Close/Collapse Trigger (calls e.stopPropagation()) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer active:scale-90"
                  title="Collapse"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
