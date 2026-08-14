import React from 'react';
import { useCanvasFormStore } from './useCanvasFormStore';
import { Plus, X } from 'lucide-react';

export const CanvasFieldProperties: React.FC = () => {
  const { fields, selectedFieldId, updateField } = useCanvasFormStore();

  const field = fields.find((f) => f.id === selectedFieldId);

  if (!field) {
    return (
      <div className="w-80 border-l border-gray-200 bg-white p-6 text-gray-500 text-sm">
        Select a field on the canvas to edit its properties.
      </div>
    );
  }

  const isSelectType = field.type === 'SELECT' || field.type === 'MULTI_SELECT';

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Field Properties</h3>
        <p className="text-xs text-gray-500">Editing {field.id}</p>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Field Name (Internal)</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={field.name}
            onChange={(e) => updateField(field.id, { name: e.target.value })}
            placeholder="e.g. first_name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Label (Public)</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={field.label}
            onChange={(e) => updateField(field.id, { label: e.target.value })}
            placeholder="e.g. First Name"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id={`req-${field.id}`}
            className="h-4 w-4 text-blue-600 rounded border-gray-300"
            checked={field.required}
            onChange={(e) => updateField(field.id, { required: e.target.checked })}
          />
          <label htmlFor={`req-${field.id}`} className="ml-2 text-sm text-gray-700">
            Required field
          </label>
        </div>

        {isSelectType && (
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-700 mb-2">Options</label>
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
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      const newOpts = field.options.filter((_, idx) => idx !== i);
                      updateField(field.id, { options: newOpts });
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  updateField(field.id, { options: [...field.options, `Option ${field.options.length + 1}`] });
                }}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700 mt-2"
              >
                <Plus size={14} className="mr-1" /> Add Option
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
