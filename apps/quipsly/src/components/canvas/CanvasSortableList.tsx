import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CanvasFieldNode } from './CanvasFieldNode';
import { useCanvasFormStore } from './useCanvasFormStore';

export const CanvasSortableList: React.FC = () => {
  const { fields, selectField } = useCanvasFormStore();

  return (
    <div 
      className="flex-1 overflow-y-auto p-6 bg-gray-50 min-h-[500px]"
      onClick={() => selectField(null)}
    >
      <div className="max-w-2xl mx-auto">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
            <p>Your form is empty.</p>
            <p className="text-sm mt-1">Add fields from the toolbar on the left.</p>
          </div>
        ) : (
          <SortableContext 
            items={fields.map(f => f.id)} 
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 pb-24">
              {fields.map((field) => (
                <CanvasFieldNode key={field.id} field={field} />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
};
