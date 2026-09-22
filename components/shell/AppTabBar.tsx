'use client';

import React from 'react';
import { Palette, Compass } from 'lucide-react';
import { HoldToDragPillDock, PillDockItem } from '@/components/ui/HoldToDragPillDock';

interface AppTabBarProps {
  activeTab: 'canvases' | 'explore';
  onSelectTab: (tab: 'canvases' | 'explore') => void;
  isVisible: boolean;
}

const TAB_ITEMS: PillDockItem<'canvases' | 'explore'>[] = [
  {
    id: 'canvases',
    label: 'Canvases',
    icon: Palette,
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: Compass,
  },
];

export const AppTabBar: React.FC<AppTabBarProps> = ({
  activeTab,
  onSelectTab,
  isVisible,
}) => {
  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[270px] sm:w-[290px] max-w-[92vw] pointer-events-auto"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="relative p-1 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.12] shadow-[0_12px_36px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]">
        <HoldToDragPillDock<'canvases' | 'explore'>
          items={TAB_ITEMS}
          activeId={activeTab}
          onSelect={onSelectTab}
          size="md"
          ariaLabel="Primary bottom navigation: drag or tap to switch views"
        />
      </div>
    </div>
  );
};

export default AppTabBar;
