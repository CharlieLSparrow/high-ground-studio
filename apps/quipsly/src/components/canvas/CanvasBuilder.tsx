import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useCanvasFormStore } from './useCanvasFormStore';
import { CanvasSortableList } from './CanvasSortableList';
import { CanvasFieldProperties } from './CanvasFieldProperties';
import { AlignLeft, Hash, CheckSquare, List, CheckSquare as CheckSquareMulti } from 'lucide-react';
import { CanvasFormFieldType } from '@prisma/client';
import { CanvasFieldNodeOverlay } from './CanvasFieldNodeOverlay';

export const CanvasBuilder: React.FC = () => {
  const { fields, reorderFields, addField } = useCanvasFormStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      reorderFields(oldIndex, newIndex);
    }
  };

  const activeField = fields.find(f => f.id === activeId);

  const TOOLBAR_ITEMS: { type: CanvasFormFieldType; label: string; icon: any }[] = [
    { type: 'TEXT', label: 'Text Input', icon: AlignLeft },
    { type: 'NUMBER', label: 'Number', icon: Hash },
    { type: 'BOOLEAN', label: 'Checkbox', icon: CheckSquare },
    { type: 'SELECT', label: 'Dropdown', icon: List },
    { type: 'MULTI_SELECT', label: 'Multi-Select', icon: CheckSquareMulti },
  ];

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      
      {/* Toolbar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Canvas+</h2>
          <p className="text-xs text-slate-500 font-medium tracking-wide">FORM BUILDER</p>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Add Fields</h3>
          <div className="space-y-2">
            {TOOLBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  onClick={() => addField(item.type)}
                  className="w-full flex items-center p-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-sm transition-all duration-200 text-left group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-md bg-slate-100 text-slate-500 mr-3 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700 transition-colors">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Sortable Canvas */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <CanvasSortableList />
        
        <DragOverlay dropAnimation={dropAnimation}>
          {activeField ? <CanvasFieldNodeOverlay field={activeField} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Properties Panel */}
      <CanvasFieldProperties />
      
    </div>
  );
};
