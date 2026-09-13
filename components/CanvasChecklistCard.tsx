'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  CanvasChecklistItem,
  CanvasChecklistEntry,
  Viewport,
} from '@/types/canvas';
import {
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  GripHorizontal,
  ListTodo,
  X,
} from 'lucide-react';

interface CanvasChecklistCardProps {
  checklist: CanvasChecklistItem;
  viewport: Viewport;
  onUpdate: (updated: CanvasChecklistItem) => void;
  onDelete: (id: string) => void;
  onDragStart: (checklistId: string, clientX: number, clientY: number) => void;
}

export const CanvasChecklistCard: React.FC<CanvasChecklistCardProps> = ({
  checklist,
  viewport,
  onUpdate,
  onDelete,
  onDragStart,
}) => {
  const [newItemText, setNewItemText] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [titleInput, setTitleInput] = useState<string>(checklist.title || 'Checklist');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const screenLeft = viewport.x + checklist.x * viewport.zoom;
  const screenTop = viewport.y + checklist.y * viewport.zoom;
  const screenWidth = Math.max(260, (checklist.width || 300) * viewport.zoom);

  const totalItems = checklist.items.length;
  const completedItems = checklist.items.filter((i) => i.completed).length;

  const handleToggleItem = useCallback((itemId: string) => {
    const updatedItems = checklist.items.map((i) =>
      i.id === itemId ? { ...i, completed: !i.completed } : i
    );
    onUpdate({
      ...checklist,
      items: updatedItems,
      updatedAt: Date.now(),
    });
  }, [checklist, onUpdate]);

  const handleAddItem = useCallback(() => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const newEntry: CanvasChecklistEntry = {
      id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: trimmed,
      completed: false,
    };
    onUpdate({
      ...checklist,
      items: [...checklist.items, newEntry],
      updatedAt: Date.now(),
    });
    setNewItemText('');
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [newItemText, checklist, onUpdate]);

  const handleDeleteItem = useCallback((itemId: string) => {
    onUpdate({
      ...checklist,
      items: checklist.items.filter((i) => i.id !== itemId),
      updatedAt: Date.now(),
    });
  }, [checklist, onUpdate]);

  const handleUpdateItemText = useCallback((itemId: string, newText: string) => {
    onUpdate({
      ...checklist,
      items: checklist.items.map((i) =>
        i.id === itemId ? { ...i, text: newText } : i
      ),
      updatedAt: Date.now(),
    });
  }, [checklist, onUpdate]);

  const handleSaveTitle = useCallback(() => {
    setIsEditingTitle(false);
    onUpdate({
      ...checklist,
      title: titleInput.trim() || 'Checklist',
      updatedAt: Date.now(),
    });
  }, [titleInput, checklist, onUpdate]);

  const toggleHideCompleted = useCallback(() => {
    onUpdate({
      ...checklist,
      hideCompleted: !checklist.hideCompleted,
      updatedAt: Date.now(),
    });
  }, [checklist, onUpdate]);

  const visibleItems = checklist.hideCompleted
    ? checklist.items.filter((i) => !i.completed)
    : checklist.items;

  return (
    <div
      id={`checklist-card-${checklist.id}`}
      style={{
        position: 'absolute',
        left: screenLeft,
        top: screenTop,
        width: screenWidth,
        zIndex: 26,
      }}
      className="bg-[#18181B] text-neutral-100 rounded-2xl shadow-xl border border-neutral-700/80 p-3 select-none flex flex-col gap-2.5 transition-shadow hover:shadow-2xl"
      onPointerDown={(e) => {
        // Stop propagating to canvas so clicking anywhere on the checklist card does not create canvas texts
        e.stopPropagation();
      }}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-neutral-800">
        {/* Drag Handle & Title */}
        <div
          className="flex items-center gap-2 cursor-grab active:cursor-grabbing flex-1 min-w-0"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(checklist.id, e.clientX, e.clientY);
          }}
          title="Drag to reposition checklist"
        >
          <GripHorizontal className="w-4 h-4 text-neutral-400 shrink-0" />
          <ListTodo className="w-4 h-4 text-neutral-300 shrink-0" />

          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
              }}
              autoFocus
              className="bg-neutral-800 text-white text-xs font-semibold px-1.5 py-0.5 rounded outline-none border border-neutral-600 w-full"
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              className="text-xs font-semibold text-white truncate cursor-text hover:underline"
              title="Double-click to rename title"
            >
              {checklist.title || 'Checklist'}
            </span>
          )}
        </div>

        {/* Action controls: Progress, Hide Completed Toggle, Delete */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Progress pill */}
          {totalItems > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
              {completedItems}/{totalItems}
            </span>
          )}

          {/* Hide / Show Completed Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleHideCompleted();
            }}
            className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              checklist.hideCompleted
                ? 'bg-neutral-700 text-amber-300'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
            title={
              checklist.hideCompleted
                ? 'Completed items hidden (tap to show)'
                : 'Hide completed items'
            }
          >
            {checklist.hideCompleted ? (
              <>
                <EyeOff className="w-3 h-3" />
                <span className="hidden sm:inline">Hidden</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline">Hide</span>
              </>
            )}
          </button>

          {/* Delete List */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(checklist.id);
            }}
            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
            title="Delete checklist"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Checklist Items List */}
      <div className="flex flex-col gap-1 max-h-[380px] overflow-y-auto pr-0.5 scrollbar-thin">
        {visibleItems.length === 0 && totalItems > 0 && checklist.hideCompleted && (
          <div className="text-[11px] text-neutral-400 italic text-center py-2 bg-neutral-900/50 rounded-lg">
            All {completedItems} completed items are hidden
            <button
              onClick={toggleHideCompleted}
              className="ml-1.5 text-amber-400 underline font-medium not-italic"
            >
              Show all
            </button>
          </div>
        )}

        {visibleItems.length === 0 && totalItems === 0 && (
          <div className="text-[11px] text-neutral-400 italic text-center py-2">
            No items yet. Add your first task below!
          </div>
        )}

        {visibleItems.map((item) => (
          <div
            key={item.id}
            className="group flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-neutral-800/60 transition-colors"
          >
            {/* Custom Interactive Checkbox */}
            <button
              onClick={() => handleToggleItem(item.id)}
              className={`w-4 h-4 rounded-sm flex items-center justify-center transition-all shrink-0 ${
                item.completed
                  ? 'bg-emerald-500 text-black shadow-xs ring-1 ring-emerald-400'
                  : 'border-2 border-neutral-500 hover:border-white bg-neutral-900'
              }`}
              title={item.completed ? 'Mark as incomplete' : 'Tick to complete and cross'}
            >
              {item.completed && <Check className="w-3 h-3 stroke-[3]" />}
            </button>

            {/* Item Text: Crossed out if completed, editable on click */}
            <div className="flex-1 min-w-0">
              {editingItemId === item.id ? (
                <input
                  type="text"
                  defaultValue={item.text}
                  onBlur={(e) => {
                    handleUpdateItemText(item.id, e.target.value);
                    setEditingItemId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateItemText(item.id, e.currentTarget.value);
                      setEditingItemId(null);
                    }
                  }}
                  autoFocus
                  className="w-full bg-neutral-900 text-white text-xs px-1.5 py-0.5 rounded outline-none border border-neutral-600"
                />
              ) : (
                <span
                  onClick={() => setEditingItemId(item.id)}
                  className={`text-xs block truncate cursor-text transition-all ${
                    item.completed
                      ? 'line-through text-neutral-400 decoration-neutral-500'
                      : 'text-neutral-200 hover:text-white'
                  }`}
                  title="Click to edit task"
                >
                  {item.text}
                </span>
              )}
            </div>

            {/* Remove item button */}
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400 hover:bg-red-950/30 rounded transition-all"
              title="Remove item"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Hidden count badge when completed items are hidden */}
      {checklist.hideCompleted && completedItems > 0 && visibleItems.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-neutral-400 px-1 pt-1 border-t border-neutral-800/80">
          <span>{completedItems} completed item{completedItems > 1 ? 's' : ''} hidden</span>
          <button
            onClick={toggleHideCompleted}
            className="text-neutral-300 hover:text-white hover:underline"
          >
            Show
          </button>
        </div>
      )}

      {/* Add new item input row */}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-neutral-800">
        <input
          ref={inputRef}
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddItem();
            }
          }}
          placeholder="Add task... (Press Enter)"
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
        />
        <button
          onClick={handleAddItem}
          disabled={!newItemText.trim()}
          className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0"
          title="Add task"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
};
