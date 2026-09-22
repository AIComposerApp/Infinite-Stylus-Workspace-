'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  RefreshCw,
  Eye,
  Bell,
  ShieldCheck,
  AlertCircle,
  Check,
  Lock,
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
  }) => Promise<void> | void;
  onSanitizeCanvasTexts?: (sanitizer: (text: string) => string) => void;
  onViewExplore?: () => void;
}

const DUR_OPTIONS: [string, number][] = [
  ['24 hours', 864e5],
  ['3 days', 2592e5],
  ['1 week', 6048e5],
  ['1 month', 2592e6],
];

function formatUntil(ms: number): string {
  const d = new Date(Date.now() + ms);
  return (
    d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

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
  onViewExplore,
}) => {
  const [selectedDur, setSelectedDur] = useState<string>('1 week');
  const [summaryInput, setSummaryInput] = useState<string>('');
  const [notifyReactions, setNotifyReactions] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(true);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<PiiScanResult | null>(null);
  const [hasSanitizedLocally, setHasSanitizedLocally] = useState<boolean>(false);

  // Drag sheet state for touch & mouse swipe dismiss
  const [dragY, setDragY] = useState(0);
  const dragStartYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Aggregated text for privacy scanning
  const combinedText = useMemo(() => {
    return aggregateCanvasTextContent(canvasTexts, thoughts, checklists);
  }, [canvasTexts, thoughts, checklists]);

  // Initial scan and summary on modal open
  useEffect(() => {
    if (!isOpen) {
      setDragY(0);
      setPublishError(null);
      setIsPublishing(false);
      setIsPublished(false);
      return;
    }

    setIsScanning(true);
    setIsSummaryLoading(true);
    setPublishError(null);
    setHasSanitizedLocally(false);

    // Run real PII scanner
    const timer1 = setTimeout(() => {
      const res = scanForPiiAndSensitiveContent(combinedText);
      setScanResult(res);
      setIsScanning(false);
    }, 750);

    // Generate semantic summary from canvas contents or title
    const timer2 = setTimeout(() => {
      let defaultSum = 'Spontaneous conceptual brainstorm note.';
      if (combinedText.trim()) {
        const sentences = combinedText
          .split(/[.\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (sentences.length > 0) {
          defaultSum = sentences[0].slice(0, 75);
        }
      } else if (projectTitle && projectTitle !== 'Untitled Canvas') {
        defaultSum = `Visual design and exploratory sketches for ${projectTitle}.`;
      }
      setSummaryInput(defaultSum.slice(0, 80));
      setIsSummaryLoading(false);
    }, 1100);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isOpen, combinedText, projectTitle]);

  const hasIssues = scanResult ? scanResult.findings.length > 0 : false;

  const handleApplySanitize = () => {
    if (onSanitizeCanvasTexts) {
      onSanitizeCanvasTexts(sanitizeTextContent);
      setHasSanitizedLocally(true);
      setScanResult({ isClean: true, findings: [] });
    }
  };

  const handleRegenerateSummary = () => {
    if (isSummaryLoading || isPublishing) return;
    setIsSummaryLoading(true);
    setTimeout(() => {
      const alternatives = [
        'Spontaneous conceptual brainstorm note.',
        'Exploratory mind map with connected thoughts and sketches.',
        'Early visual ideas mixing structured layout and handwriting.',
        'Non-linear project brainstorming on an infinite canvas.',
      ];
      const next = alternatives[Math.floor(Math.random() * alternatives.length)];
      setSummaryInput(next.slice(0, 80));
      setIsSummaryLoading(false);
    }, 850);
  };

  const handlePublish = async () => {
    if (isPublishing || isScanning || isSummaryLoading) return;
    if (hasIssues && !hasSanitizedLocally) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      await onConfirmShare({
        duration: selectedDur,
        summary: summaryInput || 'Anonymous thought stream',
        scanStatus: hasSanitizedLocally ? 'sanitized' : 'clean',
      });

      setIsPublishing(false);
      setIsPublished(true);

      setTimeout(() => {
        onClose();
        setShowToast(true);
        setTimeout(() => setShowToast(false), 4500);
      }, 700);
    } catch (err) {
      console.error('Failed to publish canvas:', err);
      setIsPublishing(false);
      setPublishError("Couldn't publish. Check your connection and try again.");
    }
  };

  // Pointer drag events on grab handle
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dy = Math.max(0, e.clientY - dragStartYRef.current);
    setDragY(dy);
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (dragY > 120) {
      onClose();
    }
    setDragY(0);
  };

  const selectedDurMs = DUR_OPTIONS.find((d) => d[0] === selectedDur)?.[1] || 6048e5;
  const elementCount = strokesCount + canvasTexts.length + thoughts.length + checklists.length;
  const isReady = !isScanning && !isSummaryLoading && (!hasIssues || hasSanitizedLocally);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
            {/* Backdrop Scrim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs cursor-pointer z-10"
            />

            {/* Bottom Sheet Modal Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: dragY }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{ transform: `translateY(${dragY}px)` }}
              className="relative z-20 w-full sm:max-w-[440px] max-h-[92vh] sm:max-h-[85vh] bg-[#faf9f6] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-black/10 select-none"
            >
              {/* Grab Handle */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-7 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shrink-0"
              >
                <div className="w-9 h-1.5 rounded-full bg-black/20" />
              </div>

              {/* Sheet Body with Scroll */}
              <div className="flex-1 overflow-y-auto px-5 pb-6 pt-1" style={{ scrollbarWidth: 'none' }}>
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-[24px] font-semibold text-[#141414] leading-tight m-0">
                      Publish to Explore
                    </h2>
                    <p className="text-[14px] text-neutral-500 mt-0.5">
                      Shared anonymously. No name or account is shown.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-neutral-700 flex items-center justify-center transition-colors cursor-pointer shrink-0 mt-0.5"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4 stroke-[2.2]" />
                  </button>
                </div>

                {/* Preview Row (pvr) */}
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-16 h-16 rounded-[14px] bg-white border border-black/10 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" className="w-full h-full">
                      <rect x="8" y="16" width="14" height="22" rx="3" fill="none" stroke="#7b8cb0" strokeWidth="1.5" />
                      <rect x="26" y="24" width="18" height="18" rx="3" fill="none" stroke="#e08a1e" strokeWidth="1.5" />
                      <circle cx="51" cy="20" r="6" fill="none" stroke="#7fa08a" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[17px] font-semibold text-[#141414] truncate">
                      {projectTitle || 'Idea Stream'}
                    </div>
                    <div className="text-[14px] text-neutral-500 mt-0.5 truncate">
                      {elementCount} elements · Today
                    </div>
                  </div>
                </div>

                {/* Privacy Scan Status Card (stt) */}
                <div className="mb-4">
                  {isScanning ? (
                    <div className="flex items-center gap-3 min-h-[56px] px-3.5 py-2.5 rounded-[14px] bg-black/5 text-[#141414]">
                      <div className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin shrink-0" />
                      <div className="text-[14px] font-medium">Checking for personal details…</div>
                    </div>
                  ) : hasIssues && !hasSanitizedLocally ? (
                    <div className="flex flex-col gap-2 p-3.5 rounded-[14px] bg-amber-50 border border-amber-200 text-amber-900">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                        <span className="text-[14px] font-semibold">Sensitive details detected</span>
                      </div>
                      <p className="text-[12px] text-amber-800 leading-snug">
                        Please remove or redact phone numbers, emails, or card details before publishing.
                      </p>
                      {scanResult?.findings.map((f, i) => (
                        <div key={i} className="text-[11px] bg-white/70 px-2 py-1 rounded border border-amber-200">
                          <strong>{f.label}:</strong> {f.snippet}
                        </div>
                      ))}
                      {onSanitizeCanvasTexts && (
                        <button
                          type="button"
                          onClick={handleApplySanitize}
                          className="mt-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Auto-redact private info</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 min-h-[56px] px-3.5 py-2.5 rounded-[14px] bg-emerald-50 text-emerald-900 border border-emerald-200/80">
                      <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-[14px] font-semibold text-emerald-800">
                          No personal details found
                        </div>
                        <div className="text-[12px] text-emerald-700/80 mt-0.5">
                          Checked for emails, phone numbers, and card numbers.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Group: Summary */}
                <div className="text-[13px] font-medium text-neutral-500 mb-1.5 px-1">
                  Summary
                </div>
                <div className="bg-white rounded-[14px] border border-black/10 overflow-hidden flex items-center min-h-[48px] px-3.5 gap-2 shadow-2xs">
                  {isSummaryLoading ? (
                    <div className="flex-1 h-3.5 rounded-full bg-black/10 sk-pulse" />
                  ) : (
                    <input
                      type="text"
                      value={summaryInput}
                      onChange={(e) => setSummaryInput(e.target.value)}
                      maxLength={80}
                      placeholder="Spontaneous brainstorm note..."
                      className="flex-1 text-[15px] text-[#141414] bg-transparent border-0 outline-none"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleRegenerateSummary}
                    disabled={isSummaryLoading}
                    className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                    title="Regenerate summary"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSummaryLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-[12px] text-neutral-500 mt-1.5 px-1 leading-normal mb-4">
                  Used to group your canvas with similar ones on Explore.
                </div>

                {/* Group: Disappears After */}
                <div className="text-[13px] font-medium text-neutral-500 mb-1.5 px-1">
                  Disappears after
                </div>
                <div className="grid grid-cols-4 bg-black/5 rounded-[12px] p-1 gap-1">
                  {DUR_OPTIONS.map(([durLabel]) => {
                    const isSelected = selectedDur === durLabel;
                    return (
                      <button
                        key={durLabel}
                        type="button"
                        onClick={() => setSelectedDur(durLabel)}
                        className={`h-8 rounded-[8px] text-[13px] font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-[#141414] shadow-xs border border-black/10 font-semibold'
                            : 'text-neutral-600 hover:text-black'
                        }`}
                      >
                        {durLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[12px] text-neutral-500 mt-1.5 px-1 leading-normal mb-4">
                  Removed from Explore on {formatUntil(selectedDurMs)}.
                </div>

                {/* Group: Viewers */}
                <div className="text-[13px] font-medium text-neutral-500 mb-1.5 px-1">
                  Viewers
                </div>
                <div className="bg-white rounded-[14px] border border-black/10 overflow-hidden shadow-2xs divide-y divide-black/10">
                  <div className="flex items-center gap-3 px-3.5 py-3 text-[15px] text-[#141414]">
                    <Eye className="w-5 h-5 text-neutral-400 shrink-0" />
                    <span>Can replay strokes and react</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3.5 py-3 text-[15px] text-[#141414]">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-neutral-400 shrink-0" />
                      <span>Notify me of reactions</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifyReactions}
                      onClick={() => setNotifyReactions((prev) => !prev)}
                      className={`sw2 ${notifyReactions ? 'on' : ''}`}
                    />
                  </div>
                </div>
                <div className="text-[12px] text-neutral-500 mt-1.5 px-1 leading-normal">
                  No comments. You can remove your canvas from Explore at any time.
                </div>
              </div>

              {/* Sheet Footer */}
              <div className="p-4 sm:p-5 pt-3 bg-[#faf9f6] border-t border-black/10 shrink-0">
                {publishError && (
                  <div className="flex items-center gap-2 mb-2 p-2.5 rounded-xl bg-red-50 text-red-700 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{publishError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!isReady || isPublishing}
                  className={`w-full h-12 rounded-full font-semibold text-[16px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-xs ${
                    isReady && !isPublishing
                      ? 'bg-[#141414] hover:bg-black text-white'
                      : 'bg-black/15 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {isPublishing ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Publishing…</span>
                    </>
                  ) : isPublished ? (
                    <>
                      <Check className="w-5 h-5 stroke-[2.4]" />
                      <span>Published</span>
                    </>
                  ) : (
                    <span>Publish to Explore</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post-Publish Feedback Toast matching Prototype */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-white/95 border border-black/10 rounded-full px-4 py-2 shadow-lg backdrop-blur-md"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="text-[14px] font-medium text-[#141414]">Published to Explore</span>
            {onViewExplore && (
              <button
                type="button"
                onClick={() => {
                  setShowToast(false);
                  onViewExplore();
                }}
                className="ml-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-black/5 hover:bg-black/10 text-[#141414] cursor-pointer"
              >
                View
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ShareThoughtDumpModal;
