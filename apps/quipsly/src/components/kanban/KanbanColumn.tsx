"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  stage: { id: string; name: string; hexColor: string; order: number };
  goals: any[];
  isPending: boolean;
}

export function KanbanColumn({ stage, goals, isPending }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Use react-virtual for rendering massive columns (1000+ items)
  const virtualizer = useVirtualizer({
    count: goals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120, // Estimated height of a Kanban card
    overscan: 5,
  });

  const borderColor = stage.hexColor || '#e2e8f0';
  const bgColor = isOver ? `${borderColor}10` : 'transparent';

  return (
    <div className="flex flex-col flex-shrink-0 w-80 h-full max-h-full bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Column Header */}
      <div 
        className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900"
        style={{ borderTop: `4px solid ${borderColor}` }}
      >
        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{stage.name}</h3>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          {goals.length}
        </span>
      </div>

      {/* Column Body - Droppable Area with Virtualization */}
      <div 
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-3 transition-colors relative"
        style={{ backgroundColor: bgColor, opacity: isPending ? 0.7 : 1 }}
      >
        <div 
          ref={scrollRef} 
          className="h-full overflow-y-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <SortableContext items={goals.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const goal = goals[virtualItem.index];
                return (
                  <div
                    key={goal.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingBottom: '12px'
                    }}
                  >
                    <KanbanCard goal={goal} stageColor={stage.hexColor} />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        </div>
      </div>
    </div>
  );
}
