import React from 'react';
import { GripVertical, Trash2, AlignLeft, Hash, CheckSquare, List } from 'lucide-react';
import { CanvasFieldLocal } from './useCanvasFormStore';

interface CanvasFieldNodeOverlayProps {
  field: CanvasFieldLocal;
}

const TYPE_ICONS = {
  TEXT: AlignLeft,
  NUMBER: Hash,
  BOOLEAN: CheckSquare,
  SELECT: List,
  MULTI_SELECT: CheckSquare,
};

export const CanvasFieldNodeOverlay: React.FC<CanvasFieldNodeOverlayProps> = ({ field }) => {
  const Icon = TYPE_ICONS[field.type] || AlignLeft;

  return (
    <div
      className="relative flex items-center p-3 mb-2 bg-white rounded-lg border-2 border-blue-500 shadow-xl scale-105 rotate-1 cursor-grabbing"
    >
      <div className="mr-3 p-1 text-slate-400 cursor-grabbing rounded">
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
        className="p-2 text-slate-400 opacity-0 rounded-md"
        disabled
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
