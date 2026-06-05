"use client";

import { useState, useOptimistic, useTransition } from "react";
import { StoryboardFrameType, FrameCard } from "./FrameCard";
import { FrameInspector } from "./FrameInspector";
import { ArtistAssistantChat } from "./ArtistAssistantChat";
import { Plus, Loader2 } from "lucide-react";
import { addStoryboardFrame, reorderFrames } from "../actions";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

export function StoryboardCanvas({ 
  storyboardId, 
  initialFrames 
}: { 
  storyboardId: string;
  initialFrames: StoryboardFrameType[];
}) {
  const [frames, setFrames] = useState<StoryboardFrameType[]>(initialFrames);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Optimistic UI updates so drag-and-drop feels instantaneous
  const [optimisticFrames, setOptimisticFrames] = useOptimistic(
    frames,
    (state, newFrames: StoryboardFrameType[]) => newFrames
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Require 5px movement before dragging starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = optimisticFrames.findIndex((f) => f.id === active.id);
      const newIndex = optimisticFrames.findIndex((f) => f.id === over.id);

      const reorderedFrames = arrayMove(optimisticFrames, oldIndex, newIndex);
      
      // Update local sort order visually
      reorderedFrames.forEach((f, i) => {
        f.sortOrder = i;
      });

      // Optimistically update the UI immediately
      startTransition(() => {
        setOptimisticFrames(reorderedFrames);
      });
      
      // Update actual React state for when optimistic wears off
      setFrames(reorderedFrames);

      // Fire server action in background
      try {
        const res = await reorderFrames(storyboardId, reorderedFrames.map(f => f.id));
        if (!res.success) {
          // Handle server error, revert optimistic state
          console.error(res.error);
          setFrames(frames); // Revert
        }
      } catch (e) {
        console.error("Failed to reorder", e);
        setFrames(frames); // Revert
      }
    }
  };

  const handleAddBlankFrame = async () => {
    startTransition(async () => {
      try {
        const res = await addStoryboardFrame(storyboardId, {
          action: "",
          cameraInfo: "Static",
          frameNumber: `F${optimisticFrames.length + 1}`
        });
        
        if (res.success && res.data) {
          // @ts-ignore
          setFrames([...frames, res.data]);
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const selectedFrame = optimisticFrames.find(f => f.id === selectedFrameId);

  return (
    <div className="flex flex-1 overflow-hidden bg-zinc-100 dark:bg-zinc-950/50">
      <div className="flex-1 overflow-y-auto p-8 relative">
        
        {optimisticFrames.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-2xl flex items-center justify-center mb-6">
              <Plus size={32} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Blank Canvas</h2>
            <p className="text-zinc-500 mb-8">
              Start mapping out your visual sequence. You can add blank frames manually, or open The Artist assistant to generate a shot list from your manuscript.
            </p>
            <button 
              onClick={handleAddBlankFrame}
              disabled={isPending}
              className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 px-6 py-3 rounded-xl font-medium hover:border-orange-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {isPending ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
              Add First Frame
            </button>
          </div>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={optimisticFrames.map(f => f.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 pb-24">
                {optimisticFrames.map((frame) => (
                  <FrameCard 
                    key={frame.id}
                    frame={frame}
                    isSelected={selectedFrameId === frame.id}
                    onSelect={() => setSelectedFrameId(frame.id)}
                  />
                ))}
                
                <button 
                  onClick={handleAddBlankFrame}
                  disabled={isPending}
                  aria-label="Add new blank frame"
                  className="min-h-[300px] border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-400 hover:text-orange-500 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/50 flex items-center justify-center transition-colors">
                    {isPending ? <Loader2 className="animate-spin" size={24} /> : <Plus size={24} />}
                  </div>
                  <span className="font-medium">Add Frame</span>
                </button>
              </div>
            </SortableContext>
          </DndContext>
        )}

      </div>

      {selectedFrame && (
        <FrameInspector 
          frame={selectedFrame}
          onClose={() => setSelectedFrameId(null)}
          onUpdate={(updated) => {
            setFrames(frames.map(f => f.id === updated.id ? updated : f));
          }}
          onDelete={(id) => {
            setFrames(frames.filter(f => f.id !== id));
            setSelectedFrameId(null);
          }}
        />
      )}

      <ArtistAssistantChat 
        storyboardId={storyboardId}
        onFramesAdded={(newFrames) => setFrames([...frames, ...newFrames])}
      />
    </div>
  );
}
