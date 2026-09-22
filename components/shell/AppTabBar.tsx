'use client';

import React from 'react';
import { Palette, Compass } from 'lucide-react';

interface AppTabBarProps {
  activeTab: 'canvases' | 'explore';
  onSelectTab: (tab: 'canvases' | 'explore') => void;
  isVisible: boolean;
}

export const AppTabBar: React.FC<AppTabBarProps> = ({
  activeTab,
  onSelectTab,
  isVisible,
}) => {
  if (!isVisible) return null;

  return (
    <nav
      className="absolute left-0 right-0 bottom-0 h-[83px] pb-[26px] flex items-center justify-around bg-[var(--glass)] border-t border-[var(--hair)] z-30 backdrop-blur-2xl transition-opacity duration-200"
      aria-label="Main navigation"
      role="tablist"
    >
      {/* Canvases Tab */}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'canvases'}
        onClick={() => onSelectTab('canvases')}
        className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
          activeTab === 'canvases'
            ? 'text-[var(--ink)] font-medium'
            : 'text-[var(--mute)] hover:text-[var(--ink)]'
        }`}
      >
        <Palette className="w-6 h-6 stroke-[1.8]" />
        <span className="text-[11px] leading-tight">Canvases</span>
      </button>

      {/* Explore Tab */}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'explore'}
        onClick={() => onSelectTab('explore')}
        className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
          activeTab === 'explore'
            ? 'text-[var(--ink)] font-medium'
            : 'text-[var(--mute)] hover:text-[var(--ink)]'
        }`}
      >
        <Compass className="w-6 h-6 stroke-[1.8]" />
        <span className="text-[11px] leading-tight">Explore</span>
      </button>
    </nav>
  );
};

export default AppTabBar;
