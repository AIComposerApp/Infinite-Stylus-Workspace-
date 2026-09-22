'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { Plus, Search, ChevronRight, Pin, Trash2, Edit3, Check } from 'lucide-react';
import { ProjectNote } from '@/types/canvas';

interface CanvasesScreenProps {
  projects: ProjectNote[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onPinProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  onRenameProject?: (id: string, newTitle: string) => void;
  isOpen: boolean;
}

// Procedural SVG thumbnail matching prototype palette
const THUMB_COLORS = ['#E08A1E', '#7B8CB0', '#7FA08A', '#D4537E', '#007AFF'];

function renderThumbnail(project: ProjectNote) {
  if (project.strokes && project.strokes.length > 0) {
    const stroke1 = project.strokes[0];
    const stroke2 = project.strokes[1];
    const p1 = stroke1?.points?.[0] || { x: 14, y: 18 };
    const p2 = stroke1?.points?.[stroke1.points.length - 1] || { x: 32, y: 30 };
    
    // Normalize into 0-48 space
    const x1 = Math.min(38, Math.max(10, (Math.abs(p1.x) % 28) + 10));
    const y1 = Math.min(38, Math.max(10, (Math.abs(p1.y) % 28) + 10));
    const x2 = Math.min(38, Math.max(10, (Math.abs(p2.x) % 28) + 10));
    const y2 = Math.min(38, Math.max(10, (Math.abs(p2.y) % 28) + 10));

    return (
      <svg viewBox="0 0 48 48" width="48" height="48" className="w-full h-full" aria-hidden="true">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7B8CB0" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r="6" fill="none" stroke="#E08A1E" strokeWidth="1.6" />
        <circle cx={x2} cy={y2} r="4.5" fill="none" stroke="#7FA08A" strokeWidth="1.4" />
      </svg>
    );
  }

  const str = project.title || 'Untitled';
  const len = str.length;
  const a = (len * 17) % 22;
  const b = (len * 29) % 18;
  const x1 = 16 + (a % 9);
  const y1 = 17 + (b % 8);
  const x2 = 32 - (b % 7);
  const y2 = 31 - (a % 6);
  const c1 = THUMB_COLORS[len % THUMB_COLORS.length];
  const c2 = THUMB_COLORS[(len + 1) % THUMB_COLORS.length];

  return (
    <svg viewBox="0 0 48 48" width="48" height="48" className="w-full h-full" aria-hidden="true">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7B8CB0" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="6.5" fill="none" stroke={c1} strokeWidth="1.6" />
      <circle cx={x2} cy={y2} r="5" fill="none" stroke={c2} strokeWidth="1.4" />
    </svg>
  );
}

function formatSubtitle(p: ProjectNote): string {
  const date = new Date(p.updatedAt || p.createdAt || Date.now());
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = isToday
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const strokeCount = p.strokes?.length || 0;
  const imageCount = p.images?.length || 0;
  const shapeCount = p.shapes?.length || 0;
  const thoughtCount = p.thoughts?.length || 0;

  const totalItems = strokeCount + imageCount + shapeCount + thoughtCount;

  if (totalItems === 0) {
    return `${timeStr} · Blank canvas`;
  }
  if (imageCount > 0 && strokeCount === 0) {
    return `${timeStr} · ${imageCount} ${imageCount === 1 ? 'image' : 'images'}`;
  }
  if (strokeCount > 0) {
    return `${timeStr} · ${strokeCount} stylus ${strokeCount === 1 ? 'stroke' : 'strokes'}`;
  }
  return `${timeStr} · ${totalItems} elements`;
}

interface SwipeableCanvasItemProps {
  project: ProjectNote;
  isActive: boolean;
  onSelect: () => void;
  onPin?: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  canDelete: boolean;
}

const SwipeableCanvasItem: React.FC<SwipeableCanvasItemProps> = ({
  project,
  isActive,
  onSelect,
  onPin,
  onDelete,
  onRename,
  canDelete,
}) => {
  const x = useMotionValue(0);
  const [isRemoved, setIsRemoved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(project.title || 'Untitled');
  const isDraggingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isEditing]);

  const handleSaveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== project.title && onRename) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  // Swiping Right (> 0) reveals Delete (Red)
  const deleteOpacity = useTransform(x, [10, 60], [0, 1]);
  const deleteScale = useTransform(x, [10, 60], [0.8, 1.1]);

  // Swiping Left (< 0) reveals Pin/Unpin (Amber)
  const pinOpacity = useTransform(x, [-10, -60], [0, 1]);
  const pinScale = useTransform(x, [-10, -60], [0.8, 1.1]);

  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const threshold = 55;

    if ((offset > threshold || velocity > 200) && canDelete && onDelete) {
      // Swiped Right -> Delete
      setIsRemoved(true);
      setTimeout(() => {
        onDelete();
      }, 160);
    } else if ((offset < -threshold || velocity < -200) && onPin) {
      // Swiped Left -> Pin / Unpin
      onPin();
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    }

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 120);
  };

  if (isRemoved) return null;

  return (
    <div className="relative overflow-hidden group select-none">
      {/* Background Action: Delete (Revealed when sliding right) */}
      {canDelete && onDelete && (
        <motion.button
          type="button"
          style={{ opacity: deleteOpacity }}
          onClick={(e) => {
            e.stopPropagation();
            setIsRemoved(true);
            setTimeout(() => onDelete(), 160);
          }}
          className="absolute inset-y-0 left-0 w-24 bg-red-600 flex items-center justify-start pl-6 text-white z-0 cursor-pointer"
          title="Delete canvas"
          aria-label="Delete canvas"
        >
          <motion.div style={{ scale: deleteScale }} className="flex items-center gap-1">
            <Trash2 className="w-5 h-5 stroke-[2.2]" />
          </motion.div>
        </motion.button>
      )}

      {/* Background Action: Pin (Revealed when sliding left) */}
      {onPin && (
        <motion.button
          type="button"
          style={{ opacity: pinOpacity }}
          onClick={(e) => {
            e.stopPropagation();
            onPin();
            animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
          }}
          className="absolute inset-y-0 right-0 w-24 bg-[#E08A1E] flex items-center justify-end pr-6 text-white z-0 cursor-pointer"
          title={project.isPinned ? 'Unpin' : 'Pin to top'}
          aria-label={project.isPinned ? 'Unpin' : 'Pin to top'}
        >
          <motion.div style={{ scale: pinScale }} className="flex items-center gap-1">
            <Pin className="w-5 h-5 stroke-[2.2] fill-white" />
          </motion.div>
        </motion.button>
      )}

      {/* Foreground Swipeable Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: onPin ? -90 : 0, right: canDelete ? 90 : 0 }}
        dragElastic={0.2}
        style={{ x }}
        onDragStart={() => {
          isDraggingRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        className={`relative z-10 flex items-center justify-between w-full p-3 sm:p-3.5 bg-[var(--phone-row)] hover:bg-[var(--phone-chip)] transition-colors cursor-pointer ${
          isActive ? 'bg-[var(--phone-chip)]/70' : ''
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (isDraggingRef.current || isEditing) return;
            onSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (isDraggingRef.current || isEditing) return;
              e.preventDefault();
              onSelect();
            }
          }}
          className="flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0 bg-transparent border-none text-left cursor-pointer p-0"
        >
          {/* Thumbnail 48x48 */}
          <div className="shrink-0 w-12 h-12 rounded-[11px] bg-[var(--phone-paper)] border border-[var(--phone-hair)] overflow-hidden flex items-center justify-center shadow-2xs">
            {renderThumbnail(project)}
          </div>

          {/* Text Info / Inline Title Editing */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {isEditing ? (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  onBlur={handleSaveTitle}
                  className="text-[16px] font-medium text-[var(--phone-ink)] bg-white px-2 py-0.5 rounded border border-[var(--phone-hair)] outline-none w-full max-w-[200px]"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="p-1 text-emerald-600 hover:text-emerald-700"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-[16px] font-medium text-[var(--phone-ink)] truncate flex items-center gap-1.5">
                <span className="truncate">{project.title || 'Untitled Canvas'}</span>
                {project.isPinned && (
                  <Pin className="w-3.5 h-3.5 fill-[#E08A1E] text-[#E08A1E] shrink-0" />
                )}
              </div>
            )}
            <div className="text-[14px] text-[var(--phone-mute)] truncate">
              {formatSubtitle(project)}
            </div>
          </div>
        </div>

        {/* Right Desktop/Hover Quick Actions */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onRename && !isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--phone-mute)] hover:text-[var(--phone-ink)] rounded-full transition-opacity cursor-pointer hidden sm:block"
              title="Rename canvas"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          {onPin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--phone-mute)] hover:text-[#E08A1E] rounded-full transition-opacity cursor-pointer"
              title={project.isPinned ? 'Unpin' : 'Pin to top'}
            >
              <Pin className="w-4 h-4" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsRemoved(true);
                setTimeout(() => onDelete(), 160);
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--phone-mute)] hover:text-red-600 rounded-full transition-opacity cursor-pointer"
              title="Delete canvas"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className="w-5 h-5 text-[var(--phone-mute)] shrink-0" />
        </div>
      </motion.div>
    </div>
  );
};

export const CanvasesScreen: React.FC<CanvasesScreenProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onPinProject,
  onDeleteProject,
  onRenameProject,
  isOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime] = useState(() => Date.now());

  // Filter and group projects according to prototype sections
  const groupedSections = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = projects.filter((p) => {
      if (!q) return true;
      const titleMatch = (p.title || '').toLowerCase().includes(q);
      const thoughtMatch = p.thoughts?.some((t) => t.text?.toLowerCase().includes(q));
      return titleMatch || thoughtMatch;
    });

    const now = currentTime;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * ONE_DAY;
    const THIRTY_DAYS = 30 * ONE_DAY;

    const pinned: ProjectNote[] = [];
    const today: ProjectNote[] = [];
    const prev7Days: ProjectNote[] = [];
    const prev30Days: ProjectNote[] = [];
    const older: ProjectNote[] = [];

    filtered.forEach((p) => {
      if (p.isPinned) {
        pinned.push(p);
        return;
      }
      const age = now - (p.updatedAt || p.createdAt || now);
      if (age < ONE_DAY) {
        today.push(p);
      } else if (age < SEVEN_DAYS) {
        prev7Days.push(p);
      } else if (age < THIRTY_DAYS) {
        prev30Days.push(p);
      } else {
        older.push(p);
      }
    });

    const sections: { title: string; items: ProjectNote[] }[] = [];
    if (pinned.length > 0) sections.push({ title: 'Pinned', items: pinned });
    if (today.length > 0) sections.push({ title: 'Today', items: today });
    if (prev7Days.length > 0) sections.push({ title: 'Previous 7 days', items: prev7Days });
    if (prev30Days.length > 0) sections.push({ title: 'Previous 30 days', items: prev30Days });
    if (older.length > 0) sections.push({ title: 'Older', items: older });

    return sections;
  }, [projects, searchQuery, currentTime]);

  return (
    <div
      className={`absolute inset-0 overflow-y-auto bg-[var(--phone-paper)] transition-opacity duration-200 ${
        isOpen ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'
      }`}
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col">
        {/* PINNED TOP HEADER & SEARCH BAR */}
        <header className="sticky top-0 z-30 bg-[var(--phone-paper)]/95 backdrop-blur-md pt-5 pb-3 px-4 sm:px-8 border-b border-[var(--phone-hair)]/40">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="text-[32px] sm:text-[36px] font-semibold text-[var(--phone-ink)] tracking-tight leading-tight m-0">
                Canvases
              </h1>
              <p className="text-[13px] text-[var(--phone-mute)] hidden sm:block">
                Slide left to pin, slide right to delete. Tap to enter infinite canvas.
              </p>
            </div>
            <button
              type="button"
              onClick={onNewProject}
              className="w-12 h-12 rounded-full bg-[var(--phone-glass)] border border-[var(--phone-hair)] text-[var(--phone-ink)] flex items-center justify-center transition-transform active:scale-90 hover:bg-[var(--phone-chip)] cursor-pointer shadow-xs"
              aria-label="New canvas"
              title="New canvas"
            >
              <Plus className="w-6 h-6 stroke-[2]" />
            </button>
          </div>

          {/* Pill Search Bar */}
          <label className="flex items-center gap-2.5 h-11 px-3.5 bg-[var(--phone-chip)] rounded-xl text-[var(--phone-mute)] transition-colors focus-within:ring-1 focus-within:ring-[var(--phone-hair)] w-full">
            <Search className="w-4 h-4 stroke-[2.2] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search canvases, thoughts, ideas..."
              aria-label="Search canvases"
              autoComplete="off"
              className="bg-transparent border-0 outline-none text-[16px] text-[var(--phone-ink)] placeholder-[var(--phone-mute)] w-full min-w-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-[var(--phone-mute)] hover:text-[var(--phone-ink)] px-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </label>
        </header>

        {/* Grouped Canvas Lists Container */}
        <main className="flex-1 px-4 sm:px-8 py-5 pb-32">
          {groupedSections.length > 0 ? (
            <div className="flex flex-col gap-6">
              {groupedSections.map((sec) => (
                <div key={sec.title}>
                  <div className="text-[19px] sm:text-[20px] font-medium text-[var(--phone-ink)] mb-2.5 px-1 flex items-center justify-between">
                    <span>{sec.title}</span>
                    <span className="text-xs text-[var(--phone-mute)] font-normal">
                      {sec.items.length} {sec.items.length === 1 ? 'canvas' : 'canvases'}
                    </span>
                  </div>
                  <div className="bg-[var(--phone-row)] rounded-2xl overflow-hidden border border-[var(--phone-hair)] shadow-2xs divide-y divide-[var(--phone-hair)]">
                    {sec.items.map((proj) => (
                      <SwipeableCanvasItem
                        key={proj.id}
                        project={proj}
                        isActive={proj.id === activeProjectId}
                        onSelect={() => onSelectProject(proj.id)}
                        onPin={onPinProject ? () => onPinProject(proj.id) : undefined}
                        onDelete={onDeleteProject ? () => onDeleteProject(proj.id) : undefined}
                        onRename={onRenameProject ? (newTitle) => onRenameProject(proj.id, newTitle) : undefined}
                        canDelete={projects.length > 1}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 px-4 text-center text-[15px] text-[var(--phone-mute)]">
              {searchQuery ? 'No canvases match that search.' : 'No canvases found. Tap + to create one.'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CanvasesScreen;
