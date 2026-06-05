"use client";

import { GripVertical, Image as ImageIcon, Camera, MoreHorizontal } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface StoryboardFrameType {
  id: string;
  frameNumber: string;
  sortOrder: number;
  imageUrl: string | null;
  action: string;
  dialogue: string | null;
  cameraInfo: string;
  shotSize: string | null;
  lens: string | null;
  estimatedDuration: number | null;
  vfxNotes: string | null;
}

/**
 * A rich, interactive storyboard frame component supporting inline editing,
 * drag-and-drop reordering via dnd-kit, and optimistic UI updates.
 *
 * @param frame - The storyboard frame data object.
 * @param isSelected - Whether this frame is currently selected in the UI.
 * @param onSelect - Callback fired when the frame is clicked or its inspector opened.
 */
export interface FrameCardProps {
  frame: StoryboardFrameType;
  isSelected: boolean;
  onSelect: (frame: StoryboardFrameType) => void;
}

export function FrameCard({
  frame,
  isSelected,
  onSelect,
}: FrameCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableIsDragging,
  } = useSortable({ id: frame.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: sortableIsDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`
        group relative flex flex-col bg-white dark:bg-zinc-900 rounded-xl overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-orange-500
        ${isSelected ? 'ring-2 ring-orange-500 shadow-md shadow-orange-500/20' : 'border border-zinc-200 dark:border-zinc-800 hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-sm'}
        ${sortableIsDragging ? 'opacity-50 ring-2 ring-orange-500' : 'opacity-100'}
      `}
    >
      {/* Drag Handle & Header */}
      <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800">
        <button 
          {...attributes} 
          {...listeners}
          aria-label={`Drag to reorder frame ${frame.frameNumber}`}
          className="flex items-center gap-1 text-zinc-400 cursor-grab hover:text-zinc-600 dark:hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded px-1"
        >
          <GripVertical size={14} />
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{frame.frameNumber}</span>
        </button>
        <div className="flex items-center gap-2">
          {frame.estimatedDuration && (
            <span className="text-[10px] font-medium bg-zinc-200 dark:bg-zinc-800 px-1.5 rounded text-zinc-600 dark:text-zinc-400">
              {frame.estimatedDuration}s
            </span>
          )}
          <button 
            onClick={(e) => { e.stopPropagation(); onSelect(frame); }}
            aria-label={`Open inspector for frame ${frame.frameNumber}`}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded p-0.5"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Image / Canvas Area */}
      <div 
        onClick={() => onSelect(frame)}
        className="relative aspect-video bg-zinc-100 dark:bg-zinc-950/50 flex flex-col items-center justify-center border-b border-zinc-100 dark:border-zinc-800 overflow-hidden cursor-pointer"
      >
        {frame.imageUrl ? (
          <img src={frame.imageUrl} alt={frame.action} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-300 dark:text-zinc-700">
            <ImageIcon size={32} strokeWidth={1} />
            <span className="text-xs font-medium uppercase tracking-widest">{frame.shotSize || "No Shot Size"}</span>
          </div>
        )}
      </div>

      {/* Metadata & Action */}
      <div 
        onClick={() => onSelect(frame)}
        className="p-3 flex-1 flex flex-col gap-2 cursor-pointer"
      >
        <div className="flex items-start gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
          <Camera size={12} className="shrink-0 mt-0.5" />
          <span>{frame.cameraInfo || "Static"}</span>
        </div>

        <p className="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-3 leading-snug">
          {frame.action || <span className="text-zinc-400 italic">No action described.</span>}
        </p>

        {frame.dialogue && (
          <div className="mt-auto pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 italic line-clamp-2">
              "{frame.dialogue}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
