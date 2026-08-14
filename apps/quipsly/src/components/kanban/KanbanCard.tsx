"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare } from "lucide-react";
import Link from "next/link";

interface KanbanCardProps {
  goal: any; // Prisma Goal type
  stageColor: string;
}

export function KanbanCard({ goal, stageColor }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasThreadLink = goal.sourceJson?.origin === "HybridStream" && goal.sourceJson?.threadId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group bg-white dark:bg-zinc-950 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 p-3 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
      aria-label={`Kanban card: ${goal.title}`}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-1" 
        style={{ backgroundColor: stageColor }} 
      />

      <div className="flex items-start gap-2 pl-2">
        <div 
          className="mt-0.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2 leading-tight">
            {goal.title}
          </p>
          
          <div className="flex items-center justify-between mt-3">
            {/* "From Chat" Anchor Link */}
            {hasThreadLink && (
              <Link 
                href={`/nests/${goal.projectId}/chat?threadId=${goal.sourceJson.threadId}&messageId=${goal.sourceJson.messageId}`}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-sm"
              >
                <MessageSquare className="w-3 h-3" />
                From Chat
              </Link>
            )}
            
            {!hasThreadLink && <div />}

            {/* Owner or other metadata could go here */}
            {goal.ownerUserId && (
              <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-bold">
                {/* Fallback to first letter of title if user not populated */}
                {goal.title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
