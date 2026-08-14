import { create } from 'zustand';
import { CanvasFormFieldType } from '@prisma/client';

export interface CanvasFieldLocal {
  id: string; // Ephemeral ID for the UI
  name: string;
  label: string;
  type: CanvasFormFieldType;
  required: boolean;
  options: string[]; // Simplification for UI handling
}

interface CanvasFormState {
  fields: CanvasFieldLocal[];
  selectedFieldId: string | null;
  addField: (type: CanvasFormFieldType) => void;
  updateField: (id: string, partial: Partial<CanvasFieldLocal>) => void;
  removeField: (id: string) => void;
  reorderFields: (oldIndex: number, newIndex: number) => void;
  selectField: (id: string | null) => void;
}

export const useCanvasFormStore = create<CanvasFormState>((set, get) => ({
  fields: [],
  selectedFieldId: null,

  addField: (type) => {
    const newId = `field_${Math.random().toString(36).substr(2, 9)}`;
    const newField: CanvasFieldLocal = {
      id: newId,
      name: `field_${get().fields.length + 1}`,
      label: `New ${type} Field`,
      type,
      required: false,
      options: type === 'SELECT' || type === 'MULTI_SELECT' ? ['Option 1'] : [],
    };

    set((state) => ({
      fields: [...state.fields, newField],
      selectedFieldId: newId, // Auto-select new field
    }));
  },

  updateField: (id, partial) => {
    set((state) => ({
      fields: state.fields.map((f) => (f.id === id ? { ...f, ...partial } : f)),
    }));
  },

  removeField: (id) => {
    set((state) => ({
      fields: state.fields.filter((f) => f.id !== id),
      selectedFieldId: state.selectedFieldId === id ? null : state.selectedFieldId,
    }));
  },

  reorderFields: (oldIndex, newIndex) => {
    set((state) => {
      const newFields = [...state.fields];
      const [movedItem] = newFields.splice(oldIndex, 1);
      newFields.splice(newIndex, 0, movedItem);
      return { fields: newFields };
    });
  },

  selectField: (id) => {
    set({ selectedFieldId: id });
  },
}));
