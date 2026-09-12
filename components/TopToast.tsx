'use client';

import React from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Pin, Trash2, Copy } from 'lucide-react';

interface TopToastProps {
  message: string | null;
}

export const TopToast: React.FC<TopToastProps> = ({ message }) => {
  return (
    <AnimatePresence>
      {message && (
        <div className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none select-none">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/95 backdrop-blur-md text-white text-xs font-medium shadow-xl border border-white/10 capitalize"
          >
            {message.toLowerCase().includes('delete') && (
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            )}
            {message.toLowerCase().includes('pin') && (
              <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            )}
            {message.toLowerCase().includes('cop') && (
              <Copy className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {message.toLowerCase().includes('sav') && (
              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
            )}
            {(message.toLowerCase().includes('online') || message.toLowerCase().includes('connect')) && (
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-xs">
                <Image
                  src="/icons/back-online-48.png"
                  alt="Back Online"
                  width={14}
                  height={14}
                  referrerPolicy="no-referrer"
                  className="w-3.5 h-3.5 object-contain pointer-events-none select-none"
                  priority
                />
              </div>
            )}
            {(message.toLowerCase().includes('assist') || message.toLowerCase().includes('writing')) && (
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-xs">
                <Image
                  src="/icons/ai-assistant-48.png"
                  alt="Assistant is writing"
                  width={14}
                  height={14}
                  referrerPolicy="no-referrer"
                  className="w-3.5 h-3.5 object-contain pointer-events-none select-none"
                  priority
                />
              </div>
            )}
            <span>{message}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
