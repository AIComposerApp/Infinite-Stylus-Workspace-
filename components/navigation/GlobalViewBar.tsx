'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Palette, Map, Film, Globe } from 'lucide-react';

export type GlobalViewMode = 'canvas' | 'flat' | 'reel' | 'cosmos';

interface GlobalViewBarProps {
  activeView: GlobalViewMode;
  onSwitchView: (view: GlobalViewMode) => void;
  className?: string;
}

interface ViewItem {
  id: GlobalViewMode;
  label: string;
  icon: React.ElementType;
}

const VIEW_ITEMS: ViewItem[] = [
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
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none ${className}`}
    >
      <div className="flex items-center p-1 rounded-full bg-white/95 backdrop-blur-xl border border-neutral-200/90 shadow-[0_6px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.03]">
        {VIEW_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSwitchView(item.id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-white'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-black/5 active:scale-95'
              }`}
              title={`Switch to ${item.label} view`}
            >
              {isActive && (
                <motion.div
                  layoutId="global-view-active-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 bg-neutral-900 rounded-full shadow-xs"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-neutral-100' : 'text-neutral-500'}`} strokeWidth={2} />
                <span className="hidden xs:inline tracking-tight font-semibold">{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
