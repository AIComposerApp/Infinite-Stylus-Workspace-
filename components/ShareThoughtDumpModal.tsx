'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Globe2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Sparkles,
  X,
  Lock,
  ArrowRight,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import {
  scanForPiiAndSensitiveContent,
  aggregateCanvasTextContent,
  sanitizeTextContent,
  PiiScanResult,
} from '@/lib/privacy-scanner';

interface ShareThoughtDumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasTexts: Array<{ id: string; text: string }>;
  thoughts: Array<{ id: string; text?: string; response?: string; prompt?: string }>;
  checklists: Array<{ id: string; title: string; items: Array<{ text: string }> }>;
  strokesCount: number;
  projectTitle: string;
  onConfirmShare: (sharePayload: {
    duration: string;
    summary: string;
    scanStatus: 'clean' | 'sanitized';
  }) => void;
  onSanitizeCanvasTexts?: (sanitizer: (text: string) => string) => void;
}

const DURATION_OPTIONS = [
  { id: '24h', label: '24 Hours', desc: 'Ephemeral daily thought' },
  { id: '3d', label: '3 Days', desc: 'Short reflection cycle' },
  { id: '1w', label: '1 Week', desc: 'Recommended balance', recommended: true },
  { id: '1m', label: '1 Month', desc: 'Long-arc exploration' },
];

export const ShareThoughtDumpModal: React.FC<ShareThoughtDumpModalProps> = ({
  isOpen,
  onClose,
  canvasTexts,
  thoughts,
  checklists,
  strokesCount,
  projectTitle,
  onConfirmShare,
  onSanitizeCanvasTexts,
}) => {
  const [selectedDuration, setSelectedDuration] = useState<string>('1w');
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [hasSanitizedLocally, setHasSanitizedLocally] = useState<boolean>(false);

  // Aggregate raw text from the canvas
  const aggregatedText = useMemo(() => {
    return aggregateCanvasTextContent(canvasTexts, thoughts, checklists);
  }, [canvasTexts, thoughts, checklists]);

  // Derived pure privacy scan calculation
  const scanResult: PiiScanResult | null = useMemo(() => {
    if (!isOpen) return null;
    const textToScan = hasSanitizedLocally ? sanitizeTextContent(aggregatedText) : aggregatedText;
    return scanForPiiAndSensitiveContent(textToScan);
  }, [isOpen, aggregatedText, hasSanitizedLocally]);

  // Generate lightweight conceptual summary for the algorithmic clustering
  const generatedSummary = useMemo(() => {
    if (!aggregatedText.trim()) {
      return strokesCount > 0
        ? `Abstract visual thought sketch consisting of ${strokesCount} organic ink gestures.`
        : 'Spontaneous conceptual brainstorm note.';
    }
    const cleanSample = sanitizeTextContent(aggregatedText)
      .replace(/\n+/g, ' ')
      .trim();
    if (cleanSample.length <= 160) return cleanSample;
    return cleanSample.slice(0, 157) + '...';
  }, [aggregatedText, strokesCount]);

  if (!isOpen) return null;

  const hasIssues = Boolean(scanResult && (scanResult.hasPii || scanResult.hasExplicit));

  const handleApplySanitize = () => {
    if (onSanitizeCanvasTexts) {
      onSanitizeCanvasTexts(sanitizeTextContent);
    }
    setHasSanitizedLocally(true);
  };

  const handleShare = () => {
    if (hasIssues && !hasSanitizedLocally) return;

    setIsSharing(true);
    setTimeout(() => {
      onConfirmShare({
        duration: selectedDuration,
        summary: generatedSummary,
        scanStatus: hasSanitizedLocally ? 'sanitized' : 'clean',
      });
      setIsSharing(false);
      onClose();
    }, 450);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200/90 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white shadow-xs">
                <Globe2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 tracking-tight flex items-center gap-1.5">
                  <span>Share Anonymous Thought Dump</span>
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Broadcasts to Thoughtspace live feed with zero identity tracking
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

          <div className="p-6 flex flex-col gap-4">
            {/* Privacy & Security Scan Status Banner */}
            {hasIssues ? (
              <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-amber-900">
                      {scanResult?.hasExplicit
                        ? 'Explicit content detected. Review or make edits.'
                        : 'Private information detected. Review or make edits.'}
                    </span>
                    <p className="text-[11px] text-amber-800/90 leading-relaxed">
                      To preserve your complete anonymity, sensitive details must not be published to the live feed.
                    </p>
                  </div>
                </div>

                {/* List of Detected Findings */}
                <div className="mt-1 flex flex-col gap-1 pl-6">
                  {scanResult?.findings.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px] bg-white/70 px-2 py-1 rounded-lg border border-amber-200/60"
                    >
                      <span className="font-medium text-amber-950">{f.label}</span>
                      <span className="font-mono text-amber-800 truncate max-w-[180px]">
                        {f.snippet}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Quick One-Click Redaction */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/50">
                  <button
                    type="button"
                    onClick={handleApplySanitize}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-amber-900 text-amber-50 hover:bg-amber-950 transition-colors"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Auto-Redact Private Info</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Privacy verified:</strong> No personal emails, phone numbers, cards, or private identifiers found.
                </span>
              </div>
            )}

            {/* Algorithmic Semantic Summary Preview */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                <span>Semantic Thought Summary</span>
                <span className="font-normal text-[10px] text-neutral-400">
                  Used by clustering algorithm to find relatable strangers
                </span>
              </label>
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 text-xs text-neutral-700 leading-relaxed italic">
                &ldquo;{generatedSummary}&rdquo;
              </div>
            </div>

            {/* Retention Duration Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                <span>Live Feed Duration</span>
                <span className="font-normal text-[10px] text-neutral-400">
                  Automatically disappears after this time
                </span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATION_OPTIONS.map((opt) => {
                  const isSelected = selectedDuration === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedDuration(opt.id)}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold">{opt.label}</span>
                        {opt.recommended && (
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            Rec.
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] mt-0.5 leading-tight ${
                          isSelected ? 'text-neutral-300' : 'text-neutral-400'
                        }`}
                      >
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Anonymity Guarantee Notice */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-50 border border-neutral-100 text-[11px] text-neutral-500">
              <EyeOff className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
              <span>
                <strong>Pure Anonymity:</strong> Strangers view this space directly on the canvas with stroke-replay capability. No comments are allowed—reactions only. You will be notified of incoming reactions.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={isSharing || (hasIssues && !hasSanitizedLocally)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-black text-white transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSharing ? (
                  <span>Publishing...</span>
                ) : (
                  <>
                    <Globe2 className="w-3.5 h-3.5" />
                    <span>Publish to Live Feed</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ShareThoughtDumpModal;
