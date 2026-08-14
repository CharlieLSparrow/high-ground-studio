import React from 'react';
import { useCanvasFormStore } from './useCanvasFormStore';
import { Plus, X, Settings2 } from 'lucide-react';

export const CanvasFieldProperties: React.FC = () => {
  const { fields, selectedFieldId, updateField } = useCanvasFormStore();

  const field = fields.find((f) => f.id === selectedFieldId);

  return (
    <div 
      className={`
        border-l border-slate-200 bg-white flex flex-col h-full overflow-y-auto
        transition-all duration-300 ease-in-out
        ${field ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden border-l-0'}
      `}
    >
      {field && (
        <div className="w-80">
          <div className="p-4 border-b border-slate-100 flex items-center">
            <div className="mr-3 p-1.5 bg-slate-100 rounded-md text-slate-500">
              <Settings2 size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Properties</h3>
              <p className="text-xs text-slate-400">Editing {field.label}</p>
            </div>
          </div>

          <div className="p-5 space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Field Name (Internal)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                value={field.name}
                onChange={(e) => updateField(field.id, { name: e.target.value })}
                placeholder="e.g. first_name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Label (Public)</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder="e.g. First Name"
              />
            </div>

            <label className="flex items-center p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                checked={field.required}
                onChange={(e) => updateField(field.id, { required: e.target.checked })}
              />
              <span className="ml-3 text-sm font-medium text-slate-700">
                Required field
              </span>
            </label>

            {(field.type === 'SELECT' || field.type === 'MULTI_SELECT') && (
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Options</label>
                <div className="space-y-2">
                  {field.options.map((opt, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...field.options];
                          newOpts[i] = e.target.value;
                          updateField(field.id, { options: newOpts });
                        }}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      />
                      <button
                        onClick={() => {
                          const newOpts = field.options.filter((_, idx) => idx !== i);
                          updateField(field.id, { options: newOpts });
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      updateField(field.id, { options: [...field.options, `Option ${field.options.length + 1}`] });
                    }}
                    className="flex items-center w-full justify-center p-2 text-sm font-medium text-blue-600 border border-dashed border-blue-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors mt-3"
                  >
                    <Plus size={14} className="mr-2" /> Add Option
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
