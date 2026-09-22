'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import {
  X,
  Radio,
  PenTool,
  FolderKanban,
  History,
  Compass,
  Globe2,
  HelpCircle,
  Star,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface AppNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProjects?: () => void;
  onOpenTimeMachine?: () => void;
  onToggleMiniRadar?: () => void;
  isMiniRadarVisible?: boolean;
  onOpenShareModal?: () => void;
  onOpenGuide?: () => void;
  onOpenFeedback?: () => void;
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
  const router = useRouter();
  const pathname = usePathname();
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-start pointer-events-auto select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/25 backdrop-blur-xs"
          />

          {/* Drawer Container with Spring Drag-to-Close (Left side) */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            drag="x"
            dragDirectionLock
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.8, right: 0 }}
            onDragEnd={(_, info) => {
              // Drag left to close
              if (info.offset.x < -75 || info.velocity.x < -220) {
                onClose();
              }
            }}
            className="relative z-10 w-full max-w-xs sm:max-w-sm h-full bg-[#FAF9F6]/95 backdrop-blur-xl border-r border-black/10 shadow-2xl flex flex-col justify-between touch-pan-y"
          >
            {/* Right Edge Grab Handle & Hit Area (Drag left to close) */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                dragControls.start(e);
              }}
              className="absolute top-0 -right-6 bottom-0 w-8 z-30 cursor-ew-resize flex items-center justify-center touch-none select-none group"
              title="Drag left to close"
            >
              <div className="w-1.5 h-16 rounded-full bg-neutral-400/60 group-hover:bg-neutral-600 transition-colors shadow-sm" />
            </div>

            {/* Top Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              {/* Drawer Header (Draggable) */}
              <div
                onPointerDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button') || target.closest('input')) return;
                  dragControls.start(e);
                }}
                className="p-4 border-b border-black/5 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
              >
                <div className="flex items-center gap-3">
                  <Image
                    src="/icons/dock-main-dark-128.png"
                    alt="Thoughtspace"
                    width={36}
                    height={36}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 object-contain select-none pointer-events-none shrink-0"
                    priority
                  />
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900 leading-tight">Thoughtspace</h2>
                    <span className="text-[11px] text-neutral-500 font-medium">
                      Infinite Stylus Studio • Pull handle to close
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-black/5 hover:text-neutral-900 transition-colors cursor-pointer"
                  title="Close menu"
                >
                  <X className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>

              {/* Navigation Links */}
              <div className="p-3 space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Spaces
                </div>

                {/* Canvas Studio */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (pathname !== '/') router.push('/');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    pathname === '/'
                      ? 'bg-neutral-950 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <PenTool className="w-4 h-4 shrink-0" />
                    <span>Canvas Studio</span>
                  </div>
                  {pathname === '/' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>

                {/* Live Feed (Dedicated Page) */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/feed');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    pathname === '/feed'
                      ? 'bg-neutral-950 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Radio className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
                    <span>Live Feed</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Live
                  </span>
                </button>

                {/* Projects / Notes */}
                {onOpenProjects && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenProjects();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <FolderKanban className="w-4 h-4 shrink-0 text-neutral-600" />
                      <span>My Notes & Projects</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                  </button>
                )}

                <div className="pt-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Studio Tools
                </div>

                {/* Broadcast Thought Dump */}
                {onOpenShareModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenShareModal();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950 transition-all cursor-pointer"
                  >
                    <Globe2 className="w-4 h-4 shrink-0 text-neutral-600" />
                    <span>Share Thought Dump</span>
                  </button>
                )}

                {/* Time Machine Timelapse */}
                {onOpenTimeMachine && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTimeMachine();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950 transition-all cursor-pointer"
                  >
                    <History className="w-4 h-4 shrink-0 text-neutral-600" />
                    <span>Time Machine Replay</span>
                  </button>
                )}

                {/* Mini Radar Navigator */}
                {onToggleMiniRadar && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMiniRadar();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-950 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Compass className="w-4 h-4 shrink-0 text-neutral-600" />
                      <span>Mini-Radar Map</span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isMiniRadarVisible ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {isMiniRadarVisible ? 'On' : 'Off'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Footer info & Feedback */}
            <div className="p-3 border-t border-black/5 bg-white/40 space-y-1">
              {onOpenGuide && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGuide();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 transition-all cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  <span>Shortcuts & Guide</span>
                </button>
              )}

              {onOpenFeedback && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFeedback();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 transition-all cursor-pointer"
                >
                  <Star className="w-4 h-4 shrink-0 text-amber-500 fill-amber-400" />
                  <span>Send Feedback</span>
                </button>
              )}

              <div className="px-3 pt-2 text-[10px] text-neutral-400 font-mono flex items-center justify-between">
                <span>Private & Offline-Ready</span>
                <span className="flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" /> v2.4
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
