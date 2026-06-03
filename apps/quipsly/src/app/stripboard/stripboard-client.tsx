'use client';

import React, { useState, useTransition, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Calendar, Film } from 'lucide-react';
import { addShootDay, updateStripOrder } from './actions';

type StripItem = {
  id: string;
  type: 'scene' | 'day';
  stripOrder: number;
  // Scene specifics
  sceneNumber?: string;
  title?: string | null;
  location?: string | null;
  timeOfDay?: string | null;
  shootDayId?: string | null;
  // Day specifics
  dayNumber?: number;
  date?: Date | null;
};

function SortableStrip({ item }: { item: StripItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as any,
  };

  if (item.type === 'day') {
    return (
      <div ref={setNodeRef} style={style} className="w-full my-4">
        <div className={`flex items-center w-full bg-black dark:bg-zinc-800 text-white p-2 rounded shadow-md ${isDragging ? 'opacity-50' : 'opacity-100'}`}>
          <div {...attributes} {...listeners} className="cursor-grab mr-3 pl-2 py-2 hover:text-zinc-300 touch-none">
            <GripVertical size={16} />
          </div>
          <Calendar size={16} className="mr-3" />
          <div className="font-bold tracking-wider uppercase text-sm">
            Shoot Day {item.dayNumber}
          </div>
          {item.date && (
            <div className="ml-auto text-xs font-medium opacity-70">
              {new Date(item.date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Scene Strip Coloring Logic (Standard Industry)
  // EXT Day = Yellow, INT Day = White, EXT Night = Green, INT Night = Blue
  const isExt = item.location?.toLowerCase().includes('ext');
  const isNight = item.timeOfDay?.toLowerCase().includes('night');
  
  let bgColorClass = "bg-white text-zinc-900 border-zinc-300"; // INT DAY (Default)
  if (isExt && !isNight) bgColorClass = "bg-yellow-100 text-yellow-900 border-yellow-300"; // EXT DAY
  if (isExt && isNight) bgColorClass = "bg-emerald-100 text-emerald-900 border-emerald-300"; // EXT NIGHT
  if (!isExt && isNight) bgColorClass = "bg-blue-100 text-blue-900 border-blue-300"; // INT NIGHT

  return (
    <div ref={setNodeRef} style={style} className="w-full my-1">
      <div className={`flex items-center w-full border ${bgColorClass} p-2 rounded shadow-sm ${isDragging ? 'opacity-50 scale-[1.02]' : 'opacity-100'}`}>
        <div {...attributes} {...listeners} className="cursor-grab mr-3 pl-2 py-2 hover:opacity-70 touch-none">
          <GripVertical size={16} />
        </div>
        
        <div className="flex-shrink-0 w-16 font-bold text-center border-r border-current border-opacity-20 pr-4">
          {item.sceneNumber}
        </div>
        
        <div className="flex-1 px-4 truncate font-medium">
          {item.title || 'Untitled Scene'}
        </div>
        
        <div className="flex-shrink-0 w-32 uppercase text-xs font-bold text-right border-l border-current border-opacity-20 pl-4 opacity-80">
          {item.location || 'UNKNOWN'}
        </div>
        
        <div className="flex-shrink-0 w-24 uppercase text-xs font-bold text-right opacity-80">
          {item.timeOfDay || 'UNKNOWN'}
        </div>
      </div>
    </div>
  );
}

export function StripboardClient({ projectId, initialScenes, initialShootDays }: { projectId: string, initialScenes: any[], initialShootDays: any[] }) {
  const [isPending, startTransition] = useTransition();
  
  // Combine into single array sorted by their global orders
  const [items, setItems] = useState<StripItem[]>(() => {
    const combined: StripItem[] = [
      ...initialScenes.map(s => ({ ...s, type: 'scene', id: `scene-${s.id}` })),
      ...initialShootDays.map(d => ({ ...d, type: 'day', id: `day-${d.id}`, stripOrder: d.sortOrder }))
    ];
    
    return combined.sort((a, b) => a.stripOrder - b.stripOrder);
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      
      // Calculate active Shoot Day based on dividers
      let currentShootDayId: string | null = null;
      const updatedItems = newItems.map((item, index) => {
        if (item.type === 'day') {
          currentShootDayId = item.id.replace('day-', '');
        }
        
        return {
          ...item,
          stripOrder: index,
          shootDayId: item.type === 'scene' ? currentShootDayId : null
        };
      });

      setItems(updatedItems);

      // Save to DB
      startTransition(() => {
        updateStripOrder(updatedItems.map(item => ({
          id: item.type === 'scene' ? item.id.replace('scene-', '') : item.id.replace('day-', ''),
          type: item.type,
          shootDayId: item.shootDayId,
          stripOrder: item.stripOrder
        })));
      });
    }
  };

  const handleAddShootDay = () => {
    startTransition(() => {
      addShootDay(projectId);
    });
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
          <Film size={20} />
          Active Board
        </h2>
        
        <button
          onClick={handleAddShootDay}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          <Plus size={16} />
          {isPending ? 'Adding...' : 'Add Shoot Day'}
        </button>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-inner min-h-[500px]">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500">
            <Film size={48} className="mb-4 opacity-20" />
            <p>No scenes found. Go back to your script to create scenes.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {items.map((item) => (
                  <SortableStrip key={item.id} item={item} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
      
      <div className="mt-8 flex gap-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 justify-center">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-white border border-zinc-300"></div> Int Day</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-300 border border-yellow-400"></div> Ext Day</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-300 border border-blue-400"></div> Int Night</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-300 border border-emerald-400"></div> Ext Night</div>
      </div>
    </div>
  );
}
