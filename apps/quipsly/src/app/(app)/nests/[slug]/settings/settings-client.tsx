"use client";

import React, { useState } from "react";
import { Plus, Trash2, Edit2, List, Hash } from "lucide-react";
import {
  createWorkflowStageAction,
  updateWorkflowStageAction,
  deleteWorkflowStageAction,
  createTagAction,
  deleteTagAction,
} from "./actions";
import { StudioTagCategory, StudioTagUICategory } from "@prisma/client";

interface WorkflowStage {
  id: string;
  name: string;
  hexColor: string;
  order: number;
}

interface Tag {
  id: string;
  label: string;
  hexColor: string | null;
  category: StudioTagCategory;
  uiCategory?: StudioTagUICategory | null;
}

export function SettingsClient({
  project,
  initialStages,
  initialTags,
}: {
  project: { id: string; name: string };
  initialStages: WorkflowStage[];
  initialTags: Tag[];
}) {
  const [activeTab, setActiveTab] = useState<"stages" | "tags">("stages");

  // Stages State
  const [stages, setStages] = useState(initialStages);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<WorkflowStage | null>(null);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState("");
  const [stageOrder, setStageOrder] = useState(0);

  // Tags State
  const [tags, setTags] = useState(initialTags);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#10B981");
  const [tagCategory, setTagCategory] = useState<StudioTagCategory>("meaning");
  const [tagUiCategory, setTagUiCategory] = useState<StudioTagUICategory>("NOTE");

  const [isDeleteStageModalOpen, setIsDeleteStageModalOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<string | null>(null);
  const [fallbackStageId, setFallbackStageId] = useState<string>("");

  const openNewStageModal = () => {
    setEditingStage(null);
    setStageName("");
    setStageColor("bg-slate-200");
    setStageOrder(stages.length);
    setIsStageModalOpen(true);
  };

  const openEditStageModal = (stage: WorkflowStage) => {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageColor(stage.hexColor);
    setStageOrder(stage.order);
    setIsStageModalOpen(true);
  };

  const openDeleteStageModal = (id: string) => {
    setStageToDelete(id);
    const otherStages = stages.filter((s) => s.id !== id);
    setFallbackStageId(otherStages.length > 0 ? otherStages[0].id : "");
    setIsDeleteStageModalOpen(true);
  };

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName) return;

    if (editingStage) {
      const res = await updateWorkflowStageAction(project.id, editingStage.id, stageName, stageColor, stageOrder);
      if (res.ok) {
        setStages(stages.map((s) => (s.id === editingStage.id ? res.stage : s)).sort((a, b) => a.order - b.order));
        setIsStageModalOpen(false);
      }
    } else {
      const res = await createWorkflowStageAction(project.id, stageName, stageColor, stageOrder);
      if (res.ok) {
        setStages([...stages, res.stage].sort((a, b) => a.order - b.order));
        setIsStageModalOpen(false);
      }
    }
  };

  const handleConfirmDeleteStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageToDelete) return;
    const res = await deleteWorkflowStageAction(project.id, stageToDelete, fallbackStageId || null);
    if (res.ok) {
      setStages(stages.filter((s) => s.id !== stageToDelete));
      setIsDeleteStageModalOpen(false);
      setStageToDelete(null);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName) return;
    const res = await createTagAction(project.id, tagName, tagColor, tagCategory, tagUiCategory);
    if (res.ok) {
      setTags([...tags, res.tag]);
      setIsTagModalOpen(false);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("Delete this Tag?")) return;
    const res = await deleteTagAction(project.id, id);
    if (res.ok) setTags(tags.filter((t) => t.id !== id));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside className="col-span-1 flex flex-col gap-2 bg-[#032321]/50 border border-studio-line rounded-2xl p-4 h-fit">
        <button
          onClick={() => setActiveTab("stages")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "stages"
              ? "bg-studio-tag text-[#032321] shadow-sm"
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <List size={16} />
          Kanban Stages
        </button>
        <button
          onClick={() => setActiveTab("tags")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "tags"
              ? "bg-studio-tag text-[#032321] shadow-sm"
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <Hash size={16} />
          Custom Tags
        </button>
      </aside>

      <section className="col-span-1 lg:col-span-3 flex flex-col gap-6">
        {activeTab === "stages" && (
          <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel animate-in fade-in">
            <div className="flex justify-between items-center border-b border-studio-line pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-studio-ink">Kanban Stages</h3>
                <p className="text-xs text-studio-muted mt-0.5">Manage columns for your board.</p>
              </div>
              <button
                onClick={openNewStageModal}
                className="px-3 py-2 bg-studio-tag text-[#032321] hover:bg-studio-tag/90 rounded-xl font-black text-xs transition-all flex items-center gap-1.5"
              >
                <Plus size={14} /> New Stage
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {stages.map((stage) => (
                <div key={stage.id} className="flex justify-between items-center p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${stage.hexColor}`} />
                    <span className="font-bold text-sm text-studio-ink">{stage.name}</span>
                    <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded text-studio-dim">Order: {stage.order}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditStageModal(stage)}
                      className="p-1.5 rounded-lg text-studio-dim hover:text-studio-ink hover:bg-[#062d2a]"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => openDeleteStageModal(stage.id)}
                      className="p-1.5 rounded-lg text-studio-dim hover:text-rose-400 hover:bg-rose-400/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {stages.length === 0 && <p className="text-sm text-studio-muted italic">No stages configured.</p>}
            </div>
          </div>
        )}

        {activeTab === "tags" && (
          <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel animate-in fade-in">
            <div className="flex justify-between items-center border-b border-studio-line pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-studio-ink">Custom Tags</h3>
                <p className="text-xs text-studio-muted mt-0.5">Manage #tags for chat and editor.</p>
              </div>
              <button
                onClick={() => {
                  setTagName("");
                  setIsTagModalOpen(true);
                }}
                className="px-3 py-2 bg-studio-tag text-[#032321] hover:bg-studio-tag/90 rounded-xl font-black text-xs transition-all flex items-center gap-1.5"
              >
                <Plus size={14} /> New Tag
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2 p-2 bg-[#062d2a]/30 border border-studio-line rounded-lg">
                  <span
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset"
                    style={{ color: tag.hexColor || "#10b981", borderColor: tag.hexColor || "#10b981" }}
                  >
                    #{tag.label}
                  </span>
                  <button onClick={() => handleDeleteTag(tag.id)} className="text-studio-dim hover:text-rose-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {tags.length === 0 && <p className="text-sm text-studio-muted italic">No tags configured.</p>}
            </div>
          </div>
        )}
      </section>

      {/* Delete Stage Modal */}
      {isDeleteStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleConfirmDeleteStage} className="bg-[#032321] border border-studio-line rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-studio-ink mb-4">Delete Stage</h3>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-studio-muted">
                This stage might contain active tasks. Please select a fallback stage to move them to.
              </p>
              <select
                value={fallbackStageId}
                onChange={(e) => setFallbackStageId(e.target.value)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              >
                <option value="">-- No Fallback (Delete Tasks' State) --</option>
                {stages.filter((s) => s.id !== stageToDelete).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsDeleteStageModalOpen(false)} className="px-4 py-2 text-studio-dim text-sm font-bold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-rose-500 text-white rounded-xl text-sm font-bold">Confirm Delete</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Stage Modal */}
      {isStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSaveStage} className="bg-[#032321] border border-studio-line rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-studio-ink mb-4">{editingStage ? "Edit Stage" : "New Stage"}</h3>
            <div className="flex flex-col gap-4">
              <input
                autoFocus
                placeholder="Stage Name"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              />
              <input
                placeholder="Tailwind Color Class (e.g., bg-emerald-500)"
                value={stageColor}
                onChange={(e) => setStageColor(e.target.value)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              />
              <input
                type="number"
                placeholder="Order"
                value={stageOrder}
                onChange={(e) => setStageOrder(parseInt(e.target.value) || 0)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsStageModalOpen(false)} className="px-4 py-2 text-studio-dim text-sm font-bold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-studio-tag text-[#032321] rounded-xl text-sm font-bold">Save</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Tag Modal */}
      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleCreateTag} className="bg-[#032321] border border-studio-line rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-studio-ink mb-4">New Tag</h3>
            <div className="flex flex-col gap-4">
              <input
                autoFocus
                placeholder="Tag Name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              />
              <input
                type="color"
                value={tagColor}
                onChange={(e) => setTagColor(e.target.value)}
                className="bg-[#062d2a] border border-studio-line rounded-xl h-12 w-full outline-none"
              />
              <select
                value={tagUiCategory}
                onChange={(e) => setTagUiCategory(e.target.value as StudioTagUICategory)}
                className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-sm text-studio-ink outline-none"
              >
                <option value="NOTE">Note</option>
                <option value="TASK">Task</option>
                <option value="IDEA">Idea</option>
                <option value="DECISION">Decision</option>
                <option value="ASSET">Asset</option>
              </select>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsTagModalOpen(false)} className="px-4 py-2 text-studio-dim text-sm font-bold">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-studio-tag text-[#032321] rounded-xl text-sm font-bold">Save</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
