"use client";

import React, { useState, useEffect } from "react";
import { StoryEntity } from "./types";
import { ArrowLeft, Save, FileText, Share2, Eye, Tag } from "lucide-react";
import { createTextQuoteSelector } from "@high-ground/quipsly-domain/source-aware";

interface EntityCardProps {
  entity: StoryEntity;
  onBack: () => void;
}

export function EntityCard({ entity: initialEntity, onBack }: EntityCardProps) {
  const [entity, setEntity] = useState(initialEntity);
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "NOTES">("OVERVIEW");
  const [notes, setNotes] = useState(initialEntity.attributes?.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setEntity(initialEntity);
    setNotes(initialEntity.attributes?.notes || "");
  }, [initialEntity]);

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/story-bible/entities/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributes: {
            ...entity.attributes,
            notes,
          }
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntity(data.entity);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.error("Failed to save notes", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMentionHover = (snippet: string) => {
    const selector = createTextQuoteSelector("current-document", snippet);
    window.dispatchEvent(new CustomEvent("quipsly:source-overlay-preview", { detail: { selector } }));
    window.dispatchEvent(new CustomEvent("quipsly:highlight-mention", { detail: { snippet } }));
  };

  const handleMentionLeave = () => {
    window.dispatchEvent(new CustomEvent("quipsly:clear-highlight"));
  };

  return (
    <div className="flex flex-col h-full bg-void animate-in slide-in-from-right-4 duration-300">
      <div className="sticky top-0 z-20 pt-4 px-4 pb-0 backdrop-blur-xl bg-void/90 border-b border-white/5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md transition-colors text-white/50 hover:text-white hover:bg-white/5 text-xs font-bold uppercase tracking-wider"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex gap-2">
            <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/50 hover:text-white">
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-flare-glow tracking-widest uppercase font-black mb-1.5">
            {entity.type.replace("_", " ")}
          </div>
          <h2 className="text-3xl font-black text-subject tracking-tight">{entity.name}</h2>
          {entity.aliases.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {entity.aliases.map((alias, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/60">
                  <Tag className="h-3 w-3" /> {alias}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4 border-b border-white/10">
          <button
            onClick={() => setActiveTab("OVERVIEW")}
            className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "OVERVIEW" ? "border-flare text-flare" : "border-transparent text-white/40 hover:text-white/80"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("NOTES")}
            className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1 ${
              activeTab === "NOTES" ? "border-flare text-flare" : "border-transparent text-white/40 hover:text-white/80"
            }`}
          >
            Living Notes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative">
        {activeTab === "OVERVIEW" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(entity.attributes || {})
                .filter(([k]) => k !== "notes" && k !== "sourceExcerpt")
                .map(([key, value]) => (
                <div key={key} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/40">{key}</span>
                  <span className="text-sm font-medium text-subject/90 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
            {Object.keys(entity.attributes || {}).filter(k => k !== "notes" && k !== "sourceExcerpt").length === 0 && (
              <div className="text-xs text-white/30 italic text-center p-4 border border-white/5 border-dashed rounded-xl">
                No semantic attributes extracted yet.
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
                <Eye className="h-4 w-4 text-white/40" /> Manuscript Mentions ({entity.mentions?.length || 0})
              </h3>
              <div className="space-y-2">
                {entity.mentions?.map((m) => (
                  <div
                    key={m.id}
                    onMouseEnter={() => handleMentionHover(m.snippet)}
                    onMouseLeave={handleMentionLeave}
                    className="group bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:from-flare/10 hover:to-transparent transition-all cursor-pointer rounded-xl p-3 border border-white/5 hover:border-flare/30"
                  >
                    <div className="text-sm text-subject/80 leading-relaxed italic border-l-2 border-white/20 pl-3 group-hover:border-flare/50 transition-colors">
                      "{m.snippet}"
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-flare/0 group-hover:text-flare/80 transition-colors mt-2 text-right">
                      Hovering highlights manuscript
                    </div>
                  </div>
                ))}
                {(!entity.mentions || entity.mentions.length === 0) && (
                  <div className="text-xs text-white/30 italic text-center p-4 border border-white/5 border-dashed rounded-xl">
                    Not mentioned in the active manuscript yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "NOTES" && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
            <div className="flex-1 bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden focus-within:border-flare/50 transition-colors flex flex-col">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write private notes, arc plans, or observations about this entity..."
                className="flex-1 w-full bg-transparent p-4 text-sm text-subject/90 resize-none focus:outline-none placeholder:text-white/20"
              />
              <div className="p-2 border-t border-white/5 bg-black/20 flex justify-end">
                <button
                  onClick={handleSaveNotes}
                  disabled={isSaving || notes === entity.attributes?.notes}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:hover:bg-white/10 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {isSaving ? "Saving..." : saveSuccess ? "Saved!" : <><Save className="h-3.5 w-3.5" /> Save Notes</>}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-white/40 text-center mt-3">
              Notes are walled off and invisible to the main AI unless explicitly requested.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
