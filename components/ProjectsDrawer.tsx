'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  X,
  Plus,
  Pin,
  Trash2,
  Search,
  LayoutGrid,
  Clock,
  Sparkles,
  ChevronRight,
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
  onNotify: (message: string) => void;
}

interface SwipeableProjectItemProps {
  project: ProjectNote;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
  onNotify: (msg: string) => void;
}

const SwipeableProjectItem: React.FC<SwipeableProjectItemProps> = ({
  project,
  isActive,
  onSelect,
  onPin,
  onDelete,
  onNotify,
}) => {
  const x = useMotionValue(0);
  const [isRemoved, setIsRemoved] = useState(false);

  // Background icon opacities and scales based on drag position
  // Dragging right (> 0) reveals Delete
  // Dragging left (< 0) reveals Pin
  const deleteOpacity = useTransform(x, [20, 80], [0, 1]);
  const deleteScale = useTransform(x, [20, 90], [0.7, 1.1]);

  const pinOpacity = useTransform(x, [-20, -80], [0, 1]);
  const pinScale = useTransform(x, [-20, -90], [0.7, 1.1]);

  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const threshold = 130; // Halfway swipe threshold

    if (offset > threshold || velocity > 400) {
      // Swipe Right -> Delete
      setIsRemoved(true);
      setTimeout(() => {
        onDelete();
        onNotify('deleted');
      }, 200);
    } else if (offset < -threshold || velocity < -400) {
      // Swipe Left -> Pin/Unpin
      onPin();
      onNotify(project.isPinned ? 'unpinned' : 'pinned');
    }
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
    <div className="relative overflow-hidden rounded-2xl my-1.5 select-none touch-pan-y">
      {/* Background action layers underneath */}
      {/* Delete (Right reveal) */}
      <motion.div
        style={{ opacity: deleteOpacity }}
        className="absolute inset-y-0 left-0 w-24 bg-red-600 flex items-center justify-start pl-6 text-white rounded-l-2xl z-0"
      >
        <motion.div style={{ scale: deleteScale }} className="flex items-center gap-1">
          <Trash2 className="w-5 h-5 stroke-[2]" />
        </motion.div>
      </motion.div>

      {/* Pin (Left reveal) */}
      <motion.div
        style={{ opacity: pinOpacity }}
        className="absolute inset-y-0 right-0 w-24 bg-amber-500 flex items-center justify-end pr-6 text-white rounded-r-2xl z-0"
      >
        <motion.div style={{ scale: pinScale }} className="flex items-center gap-1">
          <Pin className={`w-5 h-5 stroke-[2] ${project.isPinned ? 'fill-white' : ''}`} />
        </motion.div>
      </motion.div>

      {/* Foreground Swipeable Card */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -180, right: 180 }}
        dragElastic={0.2}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
        onDragEnd={handleDragEnd}
        onTap={onSelect}
        onClick={onSelect}
        className={`relative z-10 px-4 py-3.5 bg-white/95 backdrop-blur-sm border transition-colors cursor-pointer active:cursor-grabbing ${
          isActive
            ? 'border-black/30 bg-[#FAF9F6] shadow-sm'
            : 'border-black/5 hover:bg-neutral-50/90'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {project.isPinned && (
                <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
              )}
              <h3 className="text-sm font-semibold text-neutral-900 truncate">
                {project.title || 'Untitled Note'}
              </h3>
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
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
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

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
            className="fixed inset-0 bg-black/20 backdrop-blur-xs"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative z-10 w-full max-w-md h-full bg-[#FAF9F6]/95 backdrop-blur-xl border-l border-black/10 shadow-2xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-black/5 flex items-center justify-between">
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
                    {projects.length} {projects.length === 1 ? 'board' : 'boards'} stored
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
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
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:bg-black/5 hover:text-neutral-900 transition-colors"
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

            {/* Gesture Helper Hint */}
            <div className="px-4 py-2 bg-neutral-100/60 text-[11px] text-neutral-500 flex items-center justify-between">
              <span>Swipe right to <b>delete</b></span>
              <span>Swipe left to <b>pin</b></span>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {filteredProjects.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-neutral-400 text-xs text-center p-4">
                  <LayoutGrid className="w-8 h-8 stroke-[1.4] text-neutral-300 mb-2" />
                  <p>No notes found.</p>
                  <button
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
