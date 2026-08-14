import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, AlignLeft, Hash, CheckSquare, List } from 'lucide-react';
import { CanvasFieldLocal, useCanvasFormStore } from './useCanvasFormStore';

interface CanvasFieldNodeProps {
  field: CanvasFieldLocal;
}

const TYPE_ICONS = {
  TEXT: AlignLeft,
  NUMBER: Hash,
  BOOLEAN: CheckSquare,
  SELECT: List,
  MULTI_SELECT: CheckSquare,
};

export const CanvasFieldNode: React.FC<CanvasFieldNodeProps> = ({ field }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const { selectedFieldId, selectField, removeField } = useCanvasFormStore();
  
  const isSelected = selectedFieldId === field.id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 0 : 1,
  };

  const Icon = TYPE_ICONS[field.type] || AlignLeft;

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="h-[74px] mb-2 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg opacity-50"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative group flex items-center p-3 mb-2 bg-white rounded-lg border-2 
        transition-all duration-200 cursor-pointer
        ${isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-100 ring-offset-1' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'}
      `}
      onClick={(e) => {
        e.stopPropagation();
        selectField(field.id);
      }}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="mr-3 p-1 text-slate-300 hover:text-slate-500 hover:bg-slate-50 cursor-grab active:cursor-grabbing rounded transition-colors"
      >
        <GripVertical size={18} />
      </div>

      <div className="flex items-center justify-center w-8 h-8 mr-4 bg-slate-100 rounded-md text-slate-500">
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-slate-900 truncate">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </h4>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {field.name} • {field.type}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          removeField(field.id);
        }}
        className={`
          p-2 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors
          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        title="Remove field"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
