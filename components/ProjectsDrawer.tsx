'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'motion/react';
import {
  X,
  Plus,
  Pin,
  Trash2,
  Search,
  LayoutGrid,
  Clock,
  ChevronRight,
  Edit3,
  Check,
} from 'lucide-react';
import { ProjectNote } from '@/types/canvas';

interface ProjectsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectNote[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onPinProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onNotify: (message: string) => void;
}

interface SwipeableProjectItemProps {
  project: ProjectNote;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onNotify: (msg: string) => void;
}

const SwipeableProjectItem: React.FC<SwipeableProjectItemProps> = ({
  project,
  isActive,
  onSelect,
  onPin,
  onDelete,
  onRename,
  onNotify,
}) => {
  const x = useMotionValue(0);
  const [isRemoved, setIsRemoved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(project.title || 'Untitled Note');
  const isDraggingCardRef = useRef(false);
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
    if (trimmed && trimmed !== project.title) {
      onRename(trimmed);
      onNotify('Renamed note');
    }
    setIsEditing(false);
  };

  // Background icon opacities and scales based on drag position
  // Dragging right (> 0) reveals Delete
  // Dragging left (< 0) reveals Pin
  const deleteOpacity = useTransform(x, [10, 60], [0, 1]);
  const deleteScale = useTransform(x, [10, 60], [0.8, 1.1]);

  const pinOpacity = useTransform(x, [-10, -60], [0, 1]);
  const pinScale = useTransform(x, [-10, -60], [0.8, 1.1]);

  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const threshold = 50;

    if (offset > threshold || velocity > 180) {
      // Swipe Right -> Delete
      setIsRemoved(true);
      setTimeout(() => {
        onDelete();
        onNotify('Note deleted');
      }, 150);
    } else if (offset < -threshold || velocity < -180) {
      // Swipe Left -> Pin/Unpin
      onPin();
      onNotify(project.isPinned ? 'Unpinned' : 'Pinned to top');
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    } else {
      // Snap back if released below threshold
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
    }

    // Keep drag lock briefly to prevent click from triggering onSelect
    setTimeout(() => {
      isDraggingCardRef.current = false;
    }, 120);
  };

  if (isRemoved) return null;

  const dateStr = new Date(project.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const previewSnippet =
    project.thoughts.length > 0
      ? project.thoughts[0].text
      : project.strokes.length > 0
      ? `${project.strokes.length} stylus handwriting strokes`
      : 'Blank workspace';

  return (
    <div className="project-card-item relative overflow-hidden rounded-2xl my-1.5 select-none">
      {/* Background action layers underneath */}
      {/* Delete (Right reveal) */}
      <motion.button
        type="button"
        style={{ opacity: deleteOpacity }}
        onClick={(e) => {
          e.stopPropagation();
          setIsRemoved(true);
          setTimeout(() => {
            onDelete();
            onNotify('Note deleted');
          }, 150);
        }}
        className="absolute inset-y-0 left-0 w-24 bg-red-600 flex items-center justify-start pl-6 text-white rounded-l-2xl z-0 cursor-pointer"
        title="Delete note"
      >
        <motion.div style={{ scale: deleteScale }} className="flex items-center gap-1">
          <Trash2 className="w-5 h-5 stroke-[2]" />
        </motion.div>
      </motion.button>

      {/* Pin (Left reveal) */}
      <motion.button
        type="button"
        style={{ opacity: pinOpacity }}
        onClick={(e) => {
          e.stopPropagation();
          onPin();
          onNotify(project.isPinned ? 'Unpinned' : 'Pinned to top');
        }}
        className="absolute inset-y-0 right-0 w-24 bg-amber-500 flex items-center justify-end pr-6 text-white rounded-r-2xl z-0 cursor-pointer"
        title={project.isPinned ? 'Unpin note' : 'Pin note'}
      >
        <motion.div style={{ scale: pinScale }} className="flex items-center gap-1">
          <Pin className={`w-5 h-5 stroke-[2] ${project.isPinned ? 'fill-white' : ''}`} />
        </motion.div>
      </motion.button>

      {/* Foreground Swipeable Card */}
      <motion.div
        style={{ x, touchAction: 'pan-y' }}
        drag="x"
        dragConstraints={{ left: -140, right: 140 }}
        dragElastic={0.25}
        onDragStart={() => {
          isDraggingCardRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        onClick={(e) => {
          // If the user was swiping or dragging, NEVER select or close drawer!
          if (isDraggingCardRef.current || Math.abs(x.get()) > 5) {
            e.stopPropagation();
            return;
          }
          if (isEditing) {
            e.stopPropagation();
            return;
          }
          onSelect();
        }}
        className={`relative z-10 px-4 py-3.5 bg-white/95 backdrop-blur-sm border transition-colors cursor-pointer active:cursor-grabbing ${
          isActive
            ? 'border-black/30 bg-[#FAF9F6] shadow-sm'
            : 'border-black/5 hover:bg-neutral-50/90'
        } rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {project.isPinned && (
                <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
              )}
              {isEditing ? (
                <div
                  className="flex items-center gap-1.5 w-full"
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
                    className="text-sm font-semibold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg border border-black/20 focus:outline-none focus:ring-1 focus:ring-black/40 w-full"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="p-1 rounded-md bg-neutral-900 text-white hover:bg-black transition-colors shrink-0"
                    title="Save name"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 group/title">
                  <h3 className="text-sm font-semibold text-neutral-900 truncate">
                    {project.title || 'Untitled Note'}
                  </h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTitleInput(project.title || 'Untitled Note');
                      setIsEditing(true);
                    }}
                    className="p-1 text-neutral-400 hover:text-neutral-800 rounded hover:bg-black/5 opacity-70 hover:opacity-100 transition-all shrink-0"
                    title="Rename note"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 truncate mt-1 font-handwriting-kalam text-[13px] text-neutral-600">
              {previewSnippet}
            </p>
          </div>

          <div className="flex flex-col items-end shrink-0 gap-1.5">
            <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {dateStr}
            </span>
            <div className="flex items-center gap-1">
              {/* Contextual Pin Button for desktop & mouse users */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                  onNotify(project.isPinned ? 'Unpinned' : 'Pinned to top');
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  project.isPinned
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'text-neutral-400 hover:text-neutral-800 hover:bg-black/5'
                }`}
                title={project.isPinned ? 'Unpin note' : 'Pin note to top'}
              >
                <Pin className={`w-3.5 h-3.5 ${project.isPinned ? 'fill-amber-500' : ''}`} />
              </button>

              {/* Contextual Delete Button for desktop & mouse users */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRemoved(true);
                  setTimeout(() => {
                    onDelete();
                    onNotify('Note deleted');
                  }, 150);
                }}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ml-0.5 ${
                  isActive
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <span>{isActive ? 'Active' : 'Open'}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const ProjectsDrawer: React.FC<ProjectsDrawerProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onPinProject,
  onDeleteProject,
  onRenameProject,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const dragControls = useDragControls();

  // Sort pinned items to the top, then by latest updated
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const filteredProjects = sortedProjects.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.thoughts.some((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end pointer-events-auto select-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/25 backdrop-blur-xs"
          />

          {/* Drawer Container with Spring Drag-to-Close */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            drag="x"
            dragDirectionLock
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.8 }}
            onDragEnd={(_, info) => {
              // Controllable spring drag-to-close: past 75px or velocity > 220
              if (info.offset.x > 75 || info.velocity.x > 220) {
                onClose();
              }
            }}
            className="relative z-10 w-full max-w-md h-full bg-[#FAF9F6]/95 backdrop-blur-xl border-l border-black/10 shadow-2xl flex flex-col touch-pan-y"
          >
            {/* Left Edge Grab Handle & Hit Area (Drag right to close) */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                dragControls.start(e);
              }}
              className="absolute top-0 -left-6 bottom-0 w-8 z-30 cursor-ew-resize flex items-center justify-center touch-none select-none group"
              title="Drag right to close"
            >
              <div className="w-1.5 h-16 rounded-full bg-neutral-400/60 group-hover:bg-neutral-600 transition-colors shadow-sm" />
            </div>

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
                  src="/icons/dock-middle-64.png"
                  alt="Notes & Canvases"
                  width={36}
                  height={36}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 object-contain select-none pointer-events-none shrink-0"
                  priority
                />
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 leading-tight">Notes & Canvases</h2>
                  <span className="text-[11px] text-neutral-500 font-medium">
                    {projects.length} {projects.length === 1 ? 'board' : 'boards'} stored • Pull handle to close
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onNewProject();
                    onClose();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-medium hover:bg-black transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
                  <span>New Note</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-black/5 hover:text-neutral-900 transition-colors"
                  title="Close drawer"
                >
                  <X className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="px-4 py-2.5 border-b border-black/5">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.8} />
                <input
                  type="text"
                  placeholder="Search handwritten thoughts & notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black/20"
                />
              </div>
            </div>

            {/* Cross-Platform Interaction Helper Hint */}
            <div
              onPointerDown={(e) => {
                dragControls.start(e);
              }}
              className="px-4 py-2 bg-neutral-100/70 text-[11px] text-neutral-500 flex items-center justify-between cursor-grab select-none border-b border-black/[0.04]"
            >
              <span>Desktop: Click Pin/Delete buttons</span>
              <span>Touch: Swipe to Pin / Delete</span>
            </div>

            {/* Notes List */}
            <div
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.project-card-item') || target.closest('button') || target.closest('input')) return;
                dragControls.start(e);
              }}
              className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
            >
              {filteredProjects.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-neutral-400 text-xs text-center p-4">
                  <LayoutGrid className="w-8 h-8 stroke-[1.4] text-neutral-300 mb-2" />
                  <p>No notes found.</p>
                  <button
                    type="button"
                    onClick={() => {
                      onNewProject();
                      onClose();
                    }}
                    className="mt-3 text-neutral-800 font-medium underline"
                  >
                    Create a new note
                  </button>
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <SwipeableProjectItem
                    key={project.id}
                    project={project}
                    isActive={project.id === activeProjectId}
                    onSelect={() => {
                      onSelectProject(project.id);
                      onClose();
                    }}
                    onPin={() => onPinProject(project.id)}
                    onDelete={() => onDeleteProject(project.id)}
                    onRename={(newTitle) => onRenameProject(project.id, newTitle)}
                    onNotify={onNotify}
                  />
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

