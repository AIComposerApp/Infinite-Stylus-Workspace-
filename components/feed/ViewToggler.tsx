'use client';

import React from 'react';
import { Layers, Grid2x2 } from 'lucide-react';

export type PrimaryViewMode = 'flat' | 'reel';

interface ViewTogglerProps {
  currentMode: PrimaryViewMode;
  onChangeMode: (mode: PrimaryViewMode) => void;
}

export const ViewToggler: React.FC<ViewTogglerProps> = ({ currentMode, onChangeMode }) => {
  const modes: { id: PrimaryViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'flat', label: '2D Map', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'reel', label: 'Linear Reel', icon: <Grid2x2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="inline-flex items-center p-1 rounded-2xl bg-white/95 border border-neutral-200/90 shadow-md backdrop-blur-md">
      {modes.map((m) => {
        const isActive = currentMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChangeMode(m.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-neutral-900 text-white shadow-xs scale-[1.02]'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100'
            }`}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
};
