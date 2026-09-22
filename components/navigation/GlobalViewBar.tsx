'use client';

import React from 'react';
import { Palette, Map, Film, Globe } from 'lucide-react';
import { HoldToDragPillDock, PillDockItem } from '@/components/ui/HoldToDragPillDock';

export type GlobalViewMode = 'canvas' | 'flat' | 'reel' | 'cosmos';

interface GlobalViewBarProps {
  activeView: GlobalViewMode;
  onSwitchView: (view: GlobalViewMode) => void;
  className?: string;
}

const VIEW_ITEMS: PillDockItem<GlobalViewMode>[] = [
  { id: 'canvas', label: 'Canvas', icon: Palette },
  { id: 'flat', label: '2D Map', icon: Map },
  { id: 'reel', label: 'Reel', icon: Film },
  { id: 'cosmos', label: 'Cosmos', icon: Globe },
];

export const GlobalViewBar: React.FC<GlobalViewBarProps> = ({
  activeView,
  onSwitchView,
  className = '',
}) => {
  return (
    <nav
      aria-label="Global View Switcher"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none w-[340px] max-w-[94vw] ${className}`}
    >
      <div className="p-1 rounded-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-neutral-200/90 shadow-[0_6px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.03]">
        <HoldToDragPillDock<GlobalViewMode>
          items={VIEW_ITEMS}
          activeId={activeView}
          onSelect={onSwitchView}
          size="sm"
          ariaLabel="Global view switcher: hold and drag or tap"
        />
      </div>
    </nav>
  );
};

export default GlobalViewBar;
