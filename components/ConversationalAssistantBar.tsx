'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, X, CornerDownLeft, PenTool } from 'lucide-react';

interface ConversationalAssistantBarProps {
  isActive: boolean;
  isThinking: boolean;
  onSend: (message: string) => void;
  onClose: () => void;
  hasCanvasInk: boolean;
  onRespondToInk: () => void;
}

export const ConversationalAssistantBar: React.FC<ConversationalAssistantBarProps> = ({
  isActive,
  isThinking,
  onSend,
  onClose,
  hasCanvasInk,
  onRespondToInk,
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isActive) {
      // Focus input when opened on desktop if comfortable
      const timer = setTimeout(() => {
        if (inputRef.current && window.innerWidth > 640) {
          inputRef.current.focus();
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isThinking) return;
    onSend(trimmed);
    setInputValue('');
  };

  const handleQuickPrompt = (promptText: string) => {
    if (isThinking) return;
    onSend(promptText);
  };

  return (
    <AnimatePresence>
      {isActive && (
        <div className="fixed bottom-22 left-0 right-0 z-30 flex justify-center items-end pointer-events-none px-3 select-none">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="pointer-events-auto w-full max-w-xl bg-white/95 backdrop-blur-xl rounded-2xl border border-black/[0.08] shadow-[0_18px_45px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)] p-2.5 flex flex-col gap-2"
          >
            {/* Top Bar: Active Indicator & Close */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold tracking-wide text-neutral-800">
                  Conversational Mode
                </span>
                <span className="text-[11px] text-neutral-400 font-normal">
                  {isThinking ? 'Writing thought in ink...' : 'Back-and-forth active'}
                </span>
              </div>

              <button
                onClick={onClose}
                className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 px-2 py-0.5 rounded-full hover:bg-black/5 transition-colors"
                title="End Conversation (or click the assistant icon in dock)"
              >
                <span>End</span>
                <X className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>

            {/* Quick Suggestions Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none px-0.5">
              {hasCanvasInk && (
                <button
                  onClick={onRespondToInk}
                  disabled={isThinking}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors border border-emerald-200/60 shrink-0 disabled:opacity-50"
                  title="Have the assistant read and respond to your latest canvas handwriting"
                >
                  <PenTool className="w-3 h-3 text-emerald-600" />
                  <span>Respond to canvas ink</span>
                </button>
              )}
              <button
                onClick={() => handleQuickPrompt('Continue and deepen this line of thought.')}
                disabled={isThinking}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 transition-colors shrink-0 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3 text-neutral-500" />
                <span>Deepen thought</span>
              </button>
              <button
                onClick={() => handleQuickPrompt('Offer a counter-perspective or constructive challenge to this.')}
                disabled={isThinking}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 transition-colors shrink-0 disabled:opacity-50"
              >
                Challenge premise
              </button>
              <button
                onClick={() => handleQuickPrompt('What is the actionable next step or synthesis?')}
                disabled={isThinking}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 transition-colors shrink-0 disabled:opacity-50"
              >
                Synthesize next step
              </button>
            </div>

            {/* Prompt Input Form */}
            <form onSubmit={handleSubmit} className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Reply here or write on canvas with pen..."
                disabled={isThinking}
                className="w-full pl-3.5 pr-10 py-2 text-sm bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white text-neutral-800 placeholder-neutral-400 rounded-xl border border-neutral-200/80 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
              />

              <button
                type="submit"
                disabled={!inputValue.trim() || isThinking}
                className="absolute right-1.5 flex items-center justify-center w-7 h-7 rounded-lg bg-neutral-900 text-white hover:bg-black disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors"
                title="Send reply"
              >
                {isThinking ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={2.2} />
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
