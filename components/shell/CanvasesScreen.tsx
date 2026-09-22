'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, ChevronRight, Pin, Trash2 } from 'lucide-react';
import { ProjectNote } from '@/types/canvas';

interface CanvasesScreenProps {
  projects: ProjectNote[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onPinProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  isOpen: boolean;
}

// Procedural SVG thumbnail matching prototype palette
const THUMB_COLORS = ['#E08A1E', '#7B8CB0', '#7FA08A', '#D4537E', '#007AFF'];

function renderThumbnail(project: ProjectNote) {
  // If project has strokes, generate a miniature preview
  if (project.strokes && project.strokes.length > 0) {
    const stroke1 = project.strokes[0];
    const stroke2 = project.strokes[1];
    const p1 = stroke1?.points?.[0] || { x: 14, y: 18 };
    const p2 = stroke1?.points?.[stroke1.points.length - 1] || { x: 32, y: 30 };
    const p3 = stroke2?.points?.[0] || { x: 20, y: 34 };
    
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

  // Generative fallback based on title seed matching the prototype
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

export const CanvasesScreen: React.FC<CanvasesScreenProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onPinProject,
  onDeleteProject,
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
      className={`absolute inset-0 overflow-y-auto px-4 pt-5 pb-28 bg-[var(--phone-paper)] transition-opacity duration-200 ${
        isOpen ? 'visible opacity-100 z-10' : 'invisible opacity-0 pointer-events-none z-0'
      }`}
      style={{ scrollbarWidth: 'none' }}
    >
      {/* Top Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-[34px] font-semibold text-[var(--phone-ink)] tracking-tight leading-tight m-0">
          Canvases
        </h1>
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
      <label className="flex items-center gap-2.5 h-11 px-3.5 bg-[var(--phone-chip)] rounded-xl text-[var(--phone-mute)] mb-4 transition-colors focus-within:ring-1 focus-within:ring-[var(--phone-hair)]">
        <Search className="w-4 h-4 stroke-[2.2] shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search canvases"
          autoComplete="off"
          className="bg-transparent border-0 outline-none text-[17px] text-[var(--phone-ink)] placeholder-[var(--phone-mute)] w-full min-w-0"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-[var(--phone-mute)] hover:text-[var(--phone-ink)] px-1"
          >
            Clear
          </button>
        )}
      </label>

      {/* Grouped Canvas Lists */}
      {groupedSections.length > 0 ? (
        <div className="flex flex-col gap-5">
          {groupedSections.map((sec) => (
            <div key={sec.title}>
              <div className="text-[20px] font-medium text-[var(--phone-ink)] mb-2 px-1">
                {sec.title}
              </div>
              <div className="bg-[var(--phone-row)] rounded-2xl overflow-hidden border border-[var(--phone-hair)] shadow-2xs divide-y divide-[var(--phone-hair)]">
                {sec.items.map((proj) => {
                  const isActive = proj.id === activeProjectId;
                  return (
                    <div
                      key={proj.id}
                      className="group flex items-center justify-between w-full p-2.5 hover:bg-[var(--phone-chip)] transition-colors text-left cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectProject(proj.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-none text-left cursor-pointer p-0"
                      >
                        {/* Thumbnail 48x48 */}
                        <div className="shrink-0 w-12 h-12 rounded-[10px] bg-[var(--phone-paper)] border border-[var(--phone-hair)] overflow-hidden flex items-center justify-center">
                          {renderThumbnail(proj)}
                        </div>

                        {/* Text info */}
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="text-[16px] font-medium text-[var(--phone-ink)] truncate flex items-center gap-1.5">
                            <span className="truncate">{proj.title || 'Untitled Canvas'}</span>
                            {proj.isPinned && (
                              <Pin className="w-3.5 h-3.5 fill-[#E08A1E] text-[#E08A1E] shrink-0" />
                            )}
                          </div>
                          <div className="text-[14px] text-[var(--phone-mute)] truncate">
                            {formatSubtitle(proj)}
                          </div>
                        </div>
                      </button>

                      {/* Right actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {onPinProject && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPinProject(proj.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--phone-mute)] hover:text-[#E08A1E] rounded-full transition-opacity cursor-pointer"
                            title={proj.isPinned ? 'Unpin' : 'Pin to top'}
                          >
                            <Pin className="w-4 h-4" />
                          </button>
                        )}
                        {onDeleteProject && projects.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(proj.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--phone-mute)] hover:text-red-500 rounded-full transition-opacity cursor-pointer"
                            title="Delete canvas"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <ChevronRight className="w-5 h-5 text-[var(--phone-mute)] shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 px-2 text-center text-[15px] text-[var(--phone-mute)]">
          {searchQuery ? 'No canvases match that search.' : 'No canvases found. Tap + to create one.'}
        </div>
      )}
    </div>
  );
};
export default CanvasesScreen;
