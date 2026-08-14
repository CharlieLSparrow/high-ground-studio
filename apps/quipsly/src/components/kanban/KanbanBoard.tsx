"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { updateGoalStage } from "@/app/actions/kanban-actions";
import { KanbanColumn } from "./KanbanColumn";

export interface KanbanBoardProps {
  projectId: string;
  stages: { id: string; name: string; hexColor: string; order: number }[];
  initialGoals: any[]; // Goal data from Prisma
}

export function KanbanBoard({ projectId, stages, initialGoals }: KanbanBoardProps) {
  const [goals, setGoals] = useState(initialGoals);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const goalId = active.id as string;
    const newStageId = over.id as string; // The column ID

    // Find the goal and its current stage
    const goal = goals.find((g) => g.id === goalId);
    if (!goal || goal.stageId === newStageId) return;

    // Optimistically update UI
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, stageId: newStageId } : g))
    );

    // Persist to database via Server Action
    startTransition(async () => {
      try {
        await updateGoalStage(projectId, goalId, newStageId);
      } catch (e) {
        console.error("Failed to update goal stage", e);
        // In a real app we'd rollback the optimistic update here
      }
    });
  };

  return (
    <div className="flex h-full w-full overflow-x-auto p-6 space-x-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={stages.map(s => s.id)} strategy={horizontalListSortingStrategy}>
          {stages.map((stage) => {
            const stageGoals = goals.filter((g) => g.stageId === stage.id);
            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                goals={stageGoals}
                isPending={isPending}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </div>
  );
}
