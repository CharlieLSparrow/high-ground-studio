"use client";

import React, { useState } from "react";
import { Filter, Eye, Tag as TagIcon, Plus, Save, X, LayoutTemplate } from "lucide-react";

export type ViewType = "review" | "kanban" | "hybrid" | "list";
export type DisplayMode = "book" | "show" | "quote" | "standard";

export interface StudioViewFilters {
  tags?: string[];
  categories?: string[];
  search?: string;
}

export interface StudioViewDisplaySettings {
  mode: DisplayMode;
  showCompleted: boolean;
  groupBy?: string;
}

export interface StudioViewDefinitionDraft {
  name: string;
  type: ViewType;
  filters: StudioViewFilters;
  displaySettings: StudioViewDisplaySettings;
}

interface StudioViewBuilderProps {
  initialState?: Partial<StudioViewDefinitionDraft>;
  onSave: (view: StudioViewDefinitionDraft) => Promise<void>;
  onCancel?: () => void;
  availableTags?: { id: string; label: string }[];
}

export function StudioViewBuilder({ initialState, onSave, onCancel, availableTags = [] }: StudioViewBuilderProps) {
  const [draft, setDraft] = useState<StudioViewDefinitionDraft>({
    name: initialState?.name || "",
    type: initialState?.type || "review",
    filters: initialState?.filters || { tags: [], categories: [] },
    displaySettings: initialState?.displaySettings || { mode: "standard", showCompleted: false },
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    setDraft((prev) => {
      const tags = prev.filters.tags || [];
      return {
        ...prev,
        filters: {
          ...prev.filters,
          tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag],
        },
      };
    });
  };

  return (
    <div className="flex flex-col space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Advanced View Builder</h2>
          <p className="text-sm text-slate-400">Construct custom filters and layout settings.</p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close View Builder"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">View Name</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Needs Review, Urgent Tasks"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* View Type */}
        <div>
          <label className="mb-2 flex items-center space-x-2 text-sm font-medium text-slate-300">
            <LayoutTemplate className="h-4 w-4" />
            <span>Layout Type</span>
          </label>
          <div className="flex space-x-2">
            {(["review", "kanban", "hybrid", "list"] as ViewType[]).map((type) => (
              <button
                key={type}
                onClick={() => setDraft({ ...draft, type })}
                className={`rounded-md border px-4 py-2 text-sm capitalize transition-colors ${
                  draft.type === type
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                    : "border-slate-700 hover:bg-slate-800 text-slate-400"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <label className="mb-3 flex items-center space-x-2 text-sm font-medium text-slate-300">
            <Filter className="h-4 w-4" />
            <span>Tag Filters</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {availableTags.length === 0 ? (
              <span className="text-sm text-slate-500">No tags available in this workspace.</span>
            ) : (
              availableTags.map((tag) => {
                const isActive = draft.filters.tags?.includes(tag.label);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.label)}
                    className={`flex items-center space-x-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      isActive
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    <TagIcon className="h-3 w-3" />
                    <span>{tag.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Display Settings */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <label className="mb-3 flex items-center space-x-2 text-sm font-medium text-slate-300">
            <Eye className="h-4 w-4" />
            <span>Display Settings</span>
          </label>
          <div className="space-y-4">
            <div className="flex space-x-2">
              {(["standard", "book", "show", "quote"] as DisplayMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      displaySettings: { ...draft.displaySettings, mode },
                    })
                  }
                  className={`rounded-md border px-3 py-1.5 text-xs capitalize transition-colors ${
                    draft.displaySettings.mode === mode
                      ? "border-amber-500 bg-amber-500/20 text-amber-300"
                      : "border-slate-700 hover:bg-slate-800 text-slate-400"
                  }`}
                >
                  {mode} Mode
                </button>
              ))}
            </div>
            <label className="flex items-center space-x-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.displaySettings.showCompleted}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    displaySettings: { ...draft.displaySettings, showCompleted: e.target.checked },
                  })
                }
                className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
              />
              <span>Show completed / resolved items</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !draft.name.trim()}
          className="flex items-center space-x-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving..." : "Save View"}</span>
        </button>
      </div>
    </div>
  );
}
