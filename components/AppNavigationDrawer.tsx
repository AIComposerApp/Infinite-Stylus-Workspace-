'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FolderOpen,
  History,
  Compass,
  Share2,
  HelpCircle,
  MessageSquareHeart,
  ChevronRight,
} from 'lucide-react';

interface AppNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProjects: () => void;
  onOpenTimeMachine: () => void;
  onToggleMiniRadar: () => void;
  isMiniRadarVisible?: boolean;
  onOpenShareModal: () => void;
  onOpenGuide: () => void;
  onOpenFeedback: () => void;
}

export const AppNavigationDrawer: React.FC<AppNavigationDrawerProps> = ({
  isOpen,
  onClose,
  onOpenProjects,
  onOpenTimeMachine,
  onToggleMiniRadar,
  isMiniRadarVisible = false,
  onOpenShareModal,
  onOpenGuide,
  onOpenFeedback,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          {/* Drawer Sheet */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative z-10 w-80 max-w-[85vw] h-full bg-[var(--surface)] text-[var(--ink)] border-r border-[var(--hair)] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hair)]">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">Infinite Stylus</h2>
                <p className="text-xs text-[var(--muted)]">Canvas Navigation & Tools</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--chip)] transition-colors cursor-pointer"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProjects();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <FolderOpen className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">My Canvases</div>
                    <div className="text-xs text-[var(--muted)]">Browse and switch thought spaces</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTimeMachine();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <History className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">Time Machine</div>
                    <div className="text-xs text-[var(--muted)]">Replay thought emergence sequence</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onToggleMiniRadar();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <Compass className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">Mini Radar</div>
                    <div className="text-xs text-[var(--muted)]">{isMiniRadarVisible ? 'Currently visible' : 'Currently hidden'}</div>
                  </div>
                </div>
                <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${isMiniRadarVisible ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--chip)] text-[var(--muted)]'}`}>
                  {isMiniRadarVisible ? 'ON' : 'OFF'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShareModal();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <Share2 className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">Share Thought Dump</div>
                    <div className="text-xs text-[var(--muted)]">Publish anonymously to live cosmos</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="h-px bg-[var(--hair)] my-2" />

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGuide();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <HelpCircle className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">Guide & Gestures</div>
                    <div className="text-xs text-[var(--muted)]">Stylus shortcuts & tips</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFeedback();
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-[var(--chip)] transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--chip)] flex items-center justify-center text-[var(--ink)]">
                    <MessageSquareHeart className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">Feedback & Ratings</div>
                    <div className="text-xs text-[var(--muted)]">Rate experience & suggest ideas</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--hair)] text-xs text-[var(--muted)] text-center">
              Stylus Thoughtspace v2.1 • Zero-friction ink
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
