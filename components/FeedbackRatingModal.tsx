'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, X, Check, Heart, MessageSquareHeart, Sparkles } from 'lucide-react';

interface FeedbackRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerReason?: 'manual' | 'post_share' | 'high_engagement';
  engagementMetrics?: {
    strokesCount?: number;
    itemsCount?: number;
    sessionDurationSec?: number;
    sharedThoughtsCount?: number;
  };
  onSuccessToast?: (msg: string) => void;
}

const RATING_DESCRIPTIONS: Record<number, string> = {
  1: 'Needs refinement',
  2: 'Fair experience',
  3: 'Good foundation',
  4: 'Great & intuitive',
  5: 'Inspiring & transformative',
};

const CATEGORIES = [
  { id: 'fluidity', label: 'Canvas Fluidity' },
  { id: 'sharing', label: 'Thought Sharing & Feed' },
  { id: 'ai', label: 'Handwriting AI' },
  { id: 'privacy', label: 'Privacy & Anonymity' },
  { id: 'idea', label: 'Feature Request' },
];

export const FeedbackRatingModal: React.FC<FeedbackRatingModalProps> = ({
  isOpen,
  onClose,
  triggerReason = 'manual',
  engagementMetrics,
  onSuccessToast,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('fluidity');
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const displayRating = hoverRating || rating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          feedbackText,
          category: selectedCategory,
          userEmail,
          metrics: {
            ...engagementMetrics,
            triggerReason,
          },
          clientTimestamp: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setIsSubmitted(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('thoughtspace_feedback_submitted', 'true');
          localStorage.setItem('thoughtspace_last_feedback_at', String(Date.now()));
        }
        if (onSuccessToast) {
          onSuccessToast('Feedback received! Thank you for shaping Thoughtspace.');
        }
        setTimeout(() => {
          setIsSubmitted(false);
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDontAskAgain = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('thoughtspace_feedback_opt_out', 'true');
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200/90 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100 text-neutral-800">
                <MessageSquareHeart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 tracking-tight">
                  {triggerReason === 'post_share' ? 'Thought Shared! How was it?' : 'Rate Thoughtspace'}
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Directly influences our scaling architecture & updates
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-3">
                <Check className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h4 className="text-base font-semibold text-neutral-900 mb-1">
                Thank you for your thoughts!
              </h4>
              <p className="text-xs text-neutral-500 max-w-xs">
                Your rating and impressions have been logged to the engineering desk.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              {/* Star Selection */}
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 transition-transform hover:scale-115 active:scale-95 focus:outline-none"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          star <= displayRating
                            ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                            : 'text-neutral-200 fill-transparent hover:text-amber-200'
                        }`}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs font-medium text-neutral-600 min-h-[16px]">
                  {RATING_DESCRIPTIONS[displayRating] || 'Select your rating'}
                </span>
              </div>

              {/* Topic Pills */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  What are you reflecting on?
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-neutral-900 text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80 hover:text-neutral-900'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Feedback Text Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  Your thoughts & suggestions
                </label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What felt effortless? What would make this an indispensable daily thought dump space?"
                  rows={3}
                  className="w-full text-xs text-neutral-800 placeholder-neutral-400 p-2.5 rounded-xl border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900 transition-all resize-none"
                />
              </div>

              {/* Optional Contact / Updates */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Contact / Updates (Optional)</span>
                  <span className="font-normal text-[10px] text-neutral-400">For early live-feed access</span>
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full text-xs text-neutral-800 placeholder-neutral-400 px-3 py-2 rounded-xl border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900 transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                {triggerReason !== 'manual' ? (
                  <button
                    type="button"
                    onClick={handleDontAskAgain}
                    className="text-[11px] text-neutral-400 hover:text-neutral-600 underline underline-offset-2 transition-colors"
                  >
                    Don&apos;t ask again
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || rating < 1}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-black text-white transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span>Sending...</span>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Submit Feedback</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FeedbackRatingModal;
