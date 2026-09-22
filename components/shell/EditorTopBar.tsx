'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Share2,
  MoreHorizontal,
  Redo2,
  Maximize2,
  History,
  Check,
  HelpCircle,
  MessageCircle,
  Edit3,
} from 'lucide-react';

interface EditorTopBarProps {
  title: string;
  onRenameTitle: (newTitle: string) => void;
  onBack: () => void;
  onShare: () => void;
  onRedo: () => void;
  canRedo: boolean;
  onFitToScreen: () => void;
  onReplayHistory: () => void;
  isMiniMapActive: boolean;
  onToggleMiniMap: () => void;
  onOpenGuide: () => void;
  onOpenFeedback: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  title,
  onRenameTitle,
  onBack,
  onShare,
  onRedo,
  canRedo,
  onFitToScreen,
  onReplayHistory,
  isMiniMapActive,
  onToggleMiniMap,
  onOpenGuide,
  onOpenFeedback,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(title);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // Click outside to dismiss menu
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  const handleSaveTitle = () => {
    if (titleInput.trim()) {
      onRenameTitle(titleInput.trim());
    }
    setIsEditingTitle(false);
  };

  return (
    <>
      {/* Prototype Top Bar: 3-column grid (1fr auto 1fr) */}
      <div className="absolute top-3.5 left-3.5 right-3.5 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-2 pointer-events-none">
        {/* Left: Circular Back Button */}
        <div className="justify-self-start pointer-events-auto">
          <button
            type="button"
            onClick={onBack}
            className="w-12 h-12 rounded-full bg-[var(--glass)] border border-[var(--hair)] text-[var(--ink)] flex items-center justify-center transition-transform active:scale-90 hover:bg-[var(--chip)] cursor-pointer shadow-xs backdrop-blur-2xl"
            aria-label="Back to canvases"
            title="Back to canvases"
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
          </button>
        </div>

        {/* Center: Canvas Title Pill */}
        <div className="justify-self-center pointer-events-auto">
          {isEditingTitle ? (
            <div className="flex items-center h-12 px-3 bg-[var(--glass)] border border-[var(--hair)] rounded-full backdrop-blur-2xl shadow-xs gap-1.5">
              <input
                type="text"
                value={titleInput}
                autoFocus
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onBlur={handleSaveTitle}
                className="text-[15px] font-medium text-[var(--ink)] bg-transparent border-0 outline-none w-32 sm:w-44"
              />
              <button
                type="button"
                onClick={handleSaveTitle}
                className="w-6 h-6 rounded-full bg-[var(--selbg)] text-[var(--selfg)] flex items-center justify-center cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleInput(title);
                setIsEditingTitle(true);
              }}
              className="flex items-center h-12 px-4 bg-[var(--glass)] border border-[var(--hair)] rounded-full backdrop-blur-2xl shadow-xs transition-transform active:scale-95 group cursor-pointer"
              title="Click to rename canvas"
            >
              <span className="text-[15px] font-medium text-[var(--ink)] max-w-[150px] sm:max-w-[210px] truncate">
                {title || 'Idea Stream'}
              </span>
              <Edit3 className="w-3 h-3 text-[var(--mute)] group-hover:text-[var(--ink)] ml-1.5 transition-colors shrink-0" />
            </button>
          )}
        </div>

        {/* Right: Pill with Share and More buttons */}
        <div className="justify-self-end pointer-events-auto flex items-center">
          <div className="flex items-center h-12 px-0.5 bg-[var(--glass)] border border-[var(--hair)] rounded-full backdrop-blur-2xl shadow-xs">
            <button
              type="button"
              onClick={onShare}
              className="w-11 h-11 rounded-full text-[var(--ink)] flex items-center justify-center hover:bg-[var(--chip)] active:scale-90 transition-all cursor-pointer"
              aria-label="Share"
              title="Share Canvas"
            >
              <Share2 className="w-5 h-5 stroke-[1.8]" />
            </button>
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="w-11 h-11 rounded-full text-[var(--ink)] flex items-center justify-center hover:bg-[var(--chip)] active:scale-90 transition-all cursor-pointer"
              aria-label="More options"
              title="More Options"
            >
              <MoreHorizontal className="w-5 h-5 stroke-[1.8]" />
            </button>
          </div>
        </div>
      </div>

      {/* Fluid Spring Glass More Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.88, y: -10, originX: 0.95, originY: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 28,
              mass: 0.7,
            }}
            className="absolute top-[70px] right-3.5 z-50 w-[252px] p-1.5 bg-[var(--glass)] border border-[var(--hair)] rounded-[22px] backdrop-blur-2xl shadow-2xl flex flex-col gap-0.5 select-none"
          >
            {/* Redo */}
            <button
              type="button"
              role="menuitem"
              disabled={!canRedo}
              onClick={() => {
                onRedo();
                setIsMenuOpen(false);
              }}
              className={`flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] transition-all cursor-pointer active:scale-[0.98] ${
                canRedo
                  ? 'text-[var(--ink)] hover:bg-[var(--chip)]'
                  : 'text-[var(--mute)] opacity-40 cursor-not-allowed'
              }`}
            >
              <span className="font-medium">Redo</span>
              <Redo2 className="w-4 h-4 text-[var(--mute)]" />
            </button>

            {/* Fit to screen */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onFitToScreen();
                setIsMenuOpen(false);
              }}
              className="flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--chip)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Fit to screen</span>
              <Maximize2 className="w-4 h-4 text-[var(--mute)]" />
            </button>

            {/* Replay history */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onReplayHistory();
                setIsMenuOpen(false);
              }}
              className="flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--chip)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Replay history</span>
              <History className="w-4 h-4 text-[var(--mute)]" />
            </button>

            {/* Mini-map */}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={isMiniMapActive}
              onClick={() => {
                onToggleMiniMap();
                setIsMenuOpen(false);
              }}
              className="flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--chip)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Mini-map</span>
              {isMiniMapActive && <Check className="w-4 h-4 text-[var(--ink)]" />}
            </button>

            <div className="h-[0.5px] bg-[var(--hair)] my-1 mx-2" />

            {/* Guide and shortcuts */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenGuide();
                setIsMenuOpen(false);
              }}
              className="flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--chip)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Guide and shortcuts</span>
              <HelpCircle className="w-4 h-4 text-[var(--mute)]" />
            </button>

            {/* Send feedback */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenFeedback();
                setIsMenuOpen(false);
              }}
              className="flex justify-between items-center w-full h-11 px-3.5 rounded-xl text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--chip)] transition-all cursor-pointer active:scale-[0.98]"
            >
              <span>Send feedback</span>
              <MessageCircle className="w-4 h-4 text-[var(--mute)]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default EditorTopBar;
