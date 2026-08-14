import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CanvasFieldNode } from './CanvasFieldNode';
import { useCanvasFormStore } from './useCanvasFormStore';

export const CanvasSortableList: React.FC = () => {
  const { fields, selectField } = useCanvasFormStore();

  return (
    <div 
      className="flex-1 overflow-y-auto p-6 bg-slate-50 min-h-[500px]"
      onClick={() => selectField(null)}
    >
      <div className="max-w-2xl mx-auto">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 bg-white shadow-sm">
            <p className="font-medium text-slate-700">Your form is empty.</p>
            <p className="text-sm mt-1 text-slate-400">Drag or click fields from the toolbar to start.</p>
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
