import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useCanvasFormStore } from './useCanvasFormStore';
import { CanvasSortableList } from './CanvasSortableList';
import { CanvasFieldProperties } from './CanvasFieldProperties';
import { AlignLeft, Hash, CheckSquare, List, CheckSquare as CheckSquareMulti } from 'lucide-react';
import { CanvasFormFieldType } from '@prisma/client';

export const CanvasBuilder: React.FC = () => {
  const { fields, reorderFields, addField } = useCanvasFormStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      reorderFields(oldIndex, newIndex);
    }
  };

  const TOOLBAR_ITEMS: { type: CanvasFormFieldType; label: string; icon: any }[] = [
    { type: 'TEXT', label: 'Text Input', icon: AlignLeft },
    { type: 'NUMBER', label: 'Number', icon: Hash },
    { type: 'BOOLEAN', label: 'Checkbox', icon: CheckSquare },
    { type: 'SELECT', label: 'Dropdown', icon: List },
    { type: 'MULTI_SELECT', label: 'Multi-Select', icon: CheckSquareMulti },
  ];

  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden font-sans">
      
      {/* Toolbar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Canvas+</h2>
          <p className="text-xs text-gray-500">Form Builder</p>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Fields</h3>
          <div className="space-y-2">
            {TOOLBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  onClick={() => addField(item.type)}
                  className="w-full flex items-center p-2 rounded-md border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors text-left group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded bg-gray-50 text-gray-500 mr-3 group-hover:bg-white group-hover:text-blue-600">
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{item.label}</span>
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
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <CanvasSortableList />
      </DndContext>

      {/* Properties Panel */}
      <CanvasFieldProperties />
      
    </div>
  );
};
