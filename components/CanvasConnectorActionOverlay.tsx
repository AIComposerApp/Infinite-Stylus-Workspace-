'use client';

import React, { useState } from 'react';
import { Viewport, CanvasConnectorItem, ArrowDirection } from '@/types/canvas';
import { Trash2, ArrowRight, ArrowLeftRight, Minus, Tag, X, Check } from 'lucide-react';

interface CanvasConnectorActionOverlayProps {
  connector: CanvasConnectorItem | null;
  midpoint: { x: number; y: number } | null;
  viewport: Viewport;
  onUpdateConnector: (id: string, updates: Partial<CanvasConnectorItem>) => void;
  onDeleteConnector: (id: string) => void;
  onDeselect: () => void;
}

const CONNECTOR_COLORS = [
  '#374151', // Charcoal
  '#2563EB', // Blue
  '#16A34A', // Emerald
  '#D97706', // Amber
  '#DC2626', // Crimson
  '#7C3AED', // Purple
];

export const CanvasConnectorActionOverlay: React.FC<CanvasConnectorActionOverlayProps> = ({
  connector,
  midpoint,
  viewport,
  onUpdateConnector,
  onDeleteConnector,
  onDeselect,
}) => {
  const [isEditingLabel, setIsEditingLabel] = useState<boolean>(false);
  const [labelText, setLabelText] = useState<string>(connector?.label || '');

  if (!connector || !midpoint) return null;

  const screenX = viewport.x + midpoint.x * viewport.zoom;
  const screenY = viewport.y + midpoint.y * viewport.zoom;

  const handleCycleArrow = () => {
    const current = connector.arrowHead || 'end';
    let next: ArrowDirection = 'end';
    if (current === 'end') next = 'both';
    else if (current === 'both') next = 'none';
    else if (current === 'none') next = 'end';
    onUpdateConnector(connector.id, { arrowHead: next });
  };

  const handleSaveLabel = () => {
    onUpdateConnector(connector.id, { label: labelText.trim() || undefined });
    setIsEditingLabel(false);
  };

  return (
    <div
      id="canvas-connector-action-overlay"
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY - 32,
        transform: 'translate(-50%, -100%)',
        zIndex: 35,
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-lg rounded-full px-2.5 py-1 text-xs text-neutral-800 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Arrowhead toggle */}
      <button
        onClick={handleCycleArrow}
        className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-neutral-100 text-neutral-700 transition-colors font-medium text-[11px]"
        title={`Arrow style: ${connector.arrowHead || 'end'} (Click to cycle)`}
      >
        {connector.arrowHead === 'both' ? (
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
        ) : connector.arrowHead === 'none' ? (
          <Minus className="w-3.5 h-3.5 text-neutral-500" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
        )}
        <span className="capitalize">{connector.arrowHead || 'end'}</span>
      </button>

      <span className="w-px h-3.5 bg-neutral-200" />

      {/* Label Edit */}
      {isEditingLabel ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveLabel();
              if (e.key === 'Escape') setIsEditingLabel(false);
            }}
            placeholder="Label..."
            autoFocus
            className="w-20 px-1.5 py-0.5 text-[11px] bg-neutral-100 rounded border border-neutral-300 outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSaveLabel}
            className="p-1 rounded-full hover:bg-neutral-100 text-emerald-600"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setLabelText(connector.label || '');
            setIsEditingLabel(true);
          }}
          className="flex items-center gap-1 px-1.5 py-1 rounded-full hover:bg-neutral-100 text-neutral-600 transition-colors text-[11px]"
          title="Add or edit line label"
        >
          <Tag className="w-3 h-3" />
          <span>{connector.label || 'Label'}</span>
        </button>
      )}

      <span className="w-px h-3.5 bg-neutral-200" />

      {/* Color swatches */}
      <div className="flex items-center gap-1">
        {CONNECTOR_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onUpdateConnector(connector.id, { color: c })}
            style={{ backgroundColor: c }}
            className={`w-3.5 h-3.5 rounded-full border transition-transform ${
              connector.color === c ? 'scale-125 border-white ring-1 ring-black/40' : 'border-black/10 hover:scale-110'
            }`}
          />
        ))}
      </div>

      <span className="w-px h-3.5 bg-neutral-200" />

      {/* Delete button */}
      <button
        onClick={() => onDeleteConnector(connector.id)}
        className="p-1 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
        title="Delete connector (Del)"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Close/Deselect button */}
      <button
        onClick={onDeselect}
        className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        title="Deselect (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
