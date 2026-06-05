"use client";

import React, { useState } from "react";
import { StoryEntityType } from "./types";
import { X, Loader2 } from "lucide-react";

interface CreateEntityModalProps {
  projectId: string;
  onCreated: () => void;
}

export function CreateEntityModal({ projectId, onCreated }: CreateEntityModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<StoryEntityType>("CHARACTER");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/story-bible/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type, name }),
      });
      
      if (res.ok) {
        setName("");
        setType("CHARACTER");
        onCreated();
        // Close modal manually via form submission
        const dialog = document.getElementById("create-entity-modal") as HTMLDialogElement;
        if (dialog) dialog.close();
      }
    } catch (error) {
      console.error("Failed to create entity", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog 
      id="create-entity-modal" 
      className="bg-void border border-white/10 rounded-xl p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm max-w-md w-full mx-auto my-auto top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 m-0 fixed"
    >
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-subject">New Entity</h2>
        <button
          // @ts-ignore
          commandfor="create-entity-modal"
          command="close"
          className="text-white/40 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Entity Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-subject focus:outline-none focus:ring-1 focus:ring-flare/50 transition-all"
            placeholder="e.g. Elara Vance"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as StoryEntityType)}
            className="w-full bg-void border border-white/10 rounded-lg px-3 py-2 text-subject focus:outline-none focus:ring-1 focus:ring-flare/50 transition-all appearance-none"
          >
            <option value="CHARACTER">Character</option>
            <option value="SETTING">Setting</option>
            <option value="SCENE">Scene</option>
            <option value="THEME_MOTIF">Theme / Motif</option>
          </select>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            // @ts-ignore
            commandfor="create-entity-modal"
            command="close"
            className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="px-4 py-2 bg-flare hover:bg-flare-glow text-void font-medium text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Entity
          </button>
        </div>
      </form>
    </dialog>
  );
}
