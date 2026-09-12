'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Navigation } from 'lucide-react';

interface ThoughtBubbleOffScreenProps {
  visible: boolean;
  screenX: number;
  screenY: number;
  angleRad: number;
  onFocusThought: () => void;
}

export const ThoughtBubbleOffScreen: React.FC<ThoughtBubbleOffScreenProps> = ({
  visible,
  screenX,
  screenY,
  angleRad,
  onFocusThought,
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          id="offscreen-thought-bubble"
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            x: screenX - 32,
            y: screenY - 32,
          }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          onClick={onFocusThought}
          className="fixed top-0 left-0 z-40 cursor-pointer pointer-events-auto select-none"
          title="Assistant is writing here — tap to jump"
        >
          {/* Subtle directional pointer indicator */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              transform: `rotate(${angleRad}rad) translate(36px, 0px)`,
            }}
          >
            <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-[#333333]/80 drop-shadow-sm" />
          </div>

          {/* Thought bubble container with bouncing dots */}
          <div className="relative flex items-center justify-center w-16 h-12 bg-white/95 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-[#E8E6DF] hover:scale-105 active:scale-95 transition-transform duration-150">
            {/* 3 Sequential Bouncing Dots */}
            <div className="flex items-center space-x-1.5 px-3">
              <span className="w-2 h-2 bg-[#2D2D2D] rounded-full animate-bounce-dot-1" />
              <span className="w-2 h-2 bg-[#2D2D2D] rounded-full animate-bounce-dot-2" />
              <span className="w-2 h-2 bg-[#2D2D2D] rounded-full animate-bounce-dot-3" />
            </div>

            {/* Small thought bubbles trailing tail */}
            <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-white/95 rounded-full border border-[#E8E6DF] shadow-xs" />
            <div className="absolute -bottom-2.5 -left-2.5 w-1.5 h-1.5 bg-white/90 rounded-full border border-[#E8E6DF]" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
