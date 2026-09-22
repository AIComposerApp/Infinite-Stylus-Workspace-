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
      className="absolute left-0 right-0 bottom-0 h-[83px] pb-[26px] flex items-center justify-around bg-[var(--phone-glass)] border-t border-[var(--phone-hair)] z-30 backdrop-blur-2xl transition-opacity duration-200"
      aria-label="Main navigation"
    >
      {/* Canvases Tab */}
      <button
        type="button"
        role="tab"
        onClick={() => onSelectTab('canvases')}
        className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
          activeTab === 'canvases'
            ? 'text-[var(--phone-ink)] font-medium'
            : 'text-[var(--phone-mute)] hover:text-[var(--phone-ink)]'
        }`}
        aria-selected={activeTab === 'canvases'}
      >
        <Palette className="w-6 h-6 stroke-[1.8]" />
        <span className="text-[11px] leading-tight">Canvases</span>
      </button>

      {/* Explore Tab */}
      <button
        type="button"
        role="tab"
        onClick={() => onSelectTab('explore')}
        className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
          activeTab === 'explore'
            ? 'text-[var(--phone-ink)] font-medium'
            : 'text-[var(--phone-mute)] hover:text-[var(--phone-ink)]'
        }`}
        aria-selected={activeTab === 'explore'}
      >
        <Compass className="w-6 h-6 stroke-[1.8]" />
        <span className="text-[11px] leading-tight">Explore</span>
      </button>
    </nav>
  );
};
export default AppTabBar;
