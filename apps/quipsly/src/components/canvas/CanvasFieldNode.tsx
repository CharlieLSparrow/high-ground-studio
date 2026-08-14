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
    zIndex: isDragging ? 10 : 1,
  };

  const Icon = TYPE_ICONS[field.type] || AlignLeft;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        relative group flex items-center p-3 mb-2 bg-white rounded-lg border-2 
        transition-colors cursor-pointer
        ${isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300 shadow-sm'}
        ${isDragging ? 'opacity-50' : 'opacity-100'}
      `}
      onClick={(e) => {
        e.stopPropagation();
        selectField(field.id);
      }}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="mr-3 p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing rounded"
      >
        <GripVertical size={18} />
      </div>

      <div className="flex items-center justify-center w-8 h-8 mr-4 bg-gray-100 rounded-md text-gray-500">
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-gray-900 truncate">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </h4>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {field.name} • {field.type}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          removeField(field.id);
        }}
        className={`
          p-2 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors
          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        title="Remove field"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
