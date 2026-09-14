'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, X, Type, Workflow, Move, MousePointer, Copy, Sparkles, Command } from 'lucide-react';

interface CanvasOnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export const CanvasOnboardingGuide: React.FC<CanvasOnboardingGuideProps> = ({
  isOpen,
  onClose,
  onOpen,
}) => {
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('stylus_intro_banner_dismissed') === 'true';
    } catch {
      return true;
    }
  });

  const handleDismissBanner = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsBannerDismissed(true);
    try {
      localStorage.setItem('stylus_intro_banner_dismissed', 'true');
    } catch {
      // Ignored
    }
  };

  return (
    <>
      {/* Discreet Non-Intrusive Quick-Tip Pill (Top-Center) */}
      {!isBannerDismissed && (
        <div
          id="canvas-quick-tips-banner"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-2.5 bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-sm rounded-full px-3.5 py-1.5 text-xs text-neutral-700 animate-in fade-in slide-in-from-top-2 duration-200 select-none max-w-[92vw]"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>Double-click canvas to type</span>
            <span className="text-neutral-300">•</span>
            <span>Wheel to zoom</span>
            <span className="text-neutral-300">•</span>
            <span>Drag blue dots on items to link</span>
          </div>

          <button
            onClick={() => onOpen?.()}
            className="text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer ml-1"
          >
            Guide
          </button>

          <button
            onClick={handleDismissBanner}
            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded-full hover:bg-neutral-100 transition-colors ml-0.5"
            title="Dismiss banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating ? Help Trigger Button (Top-Right beside Time Machine) */}
      <button
        id="canvas-help-guide-trigger"
        onClick={onOpen}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm border border-neutral-200 shadow-xs text-neutral-600 hover:text-neutral-950 hover:bg-white transition-all cursor-pointer select-none"
        title="Controls & Shortcuts Guide (?)"
      >
        <HelpCircle className="w-4 h-4" strokeWidth={1.9} />
      </button>

      {/* Full Help Modal / Guide Dialog */}
      {isOpen && (
        <div
          id="canvas-guide-modal-overlay"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4 pointer-events-auto animate-in fade-in duration-150 select-none"
        >
          <div
            id="canvas-guide-modal-content"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white rounded-2xl border border-neutral-200/90 shadow-xl p-6 text-neutral-800 max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-neutral-900">Infinite Canvas Quick Guide</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-neutral-600">
              {/* Feature 1: Double-Click to Type */}
              <div className="flex items-start gap-3 p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
                <div className="p-2 bg-white rounded-lg shadow-xs text-neutral-700 shrink-0">
                  <Type className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-900 text-xs uppercase tracking-wider mb-0.5">Typing & Notes</h4>
                  <p className="text-xs leading-relaxed">
                    Double-click anywhere on the canvas to place a note at that spot. Press <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-mono">T</kbd> for the Text tool. Selected notes can be copied anytime with <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-mono">Ctrl+C</kbd>.
                  </p>
                </div>
              </div>

              {/* Feature 2: Dynamic Flowchart Connectors */}
              <div className="flex items-start gap-3 p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
                <div className="p-2 bg-white rounded-lg shadow-xs text-blue-600 shrink-0">
                  <Workflow className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-900 text-xs uppercase tracking-wider mb-0.5">Flowchart Connectors</h4>
                  <p className="text-xs leading-relaxed">
                    Click any item (image, sticky note, shape, text) and drag from any of the 4 blue side dots (<span className="text-blue-600 font-medium">Top, Right, Bottom, Left</span>) to connect items with dynamic curvy arrows. Or press <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-mono">C</kbd> for the Connector tool.
                  </p>
                </div>
              </div>

              {/* Feature 3: Canvas Navigation & Zoom */}
              <div className="flex items-start gap-3 p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
                <div className="p-2 bg-white rounded-lg shadow-xs text-neutral-700 shrink-0">
                  <MousePointer className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-900 text-xs uppercase tracking-wider mb-0.5">Navigation & Zoom</h4>
                  <p className="text-xs leading-relaxed">
                    Roll your external mouse wheel to smoothly zoom in & out at the cursor. Hold <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-mono">Space</kbd> or drag the canvas / bottom dock to pan freely.
                  </p>
                </div>
              </div>

              {/* Keyboard Shortcuts Reference Table */}
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Command className="w-3.5 h-3.5 text-neutral-400" />
                  Key Shortcuts
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Text Tool</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">T</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Flowchart Link</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">C</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Select & Move</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">V</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Fountain Pen</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">P</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Copy Selected Text</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">Ctrl+C</kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                    <span className="text-neutral-600">Time Machine</span>
                    <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono font-medium">M</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-neutral-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              >
                Got it, let&apos;s create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
