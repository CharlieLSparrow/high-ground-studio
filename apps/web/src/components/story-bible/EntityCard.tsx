"use client";

import React from "react";
import { StoryEntity } from "./types";
import { ArrowLeft, Edit3, Type, Info, FileText } from "lucide-react";

interface EntityCardProps {
  entity: StoryEntity;
  onBack: () => void;
}

export function EntityCard({ entity, onBack }: EntityCardProps) {
  return (
    <div className="flex flex-col h-full bg-void animate-in slide-in-from-right-4 duration-300">
      <div className="sticky top-0 z-10 p-4 backdrop-blur-md bg-void/80 border-b border-white/5 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-medium text-subject">Entity Details</div>
        <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white">
          <Edit3 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="text-xs text-flare-glow tracking-wider uppercase font-semibold mb-1">
            {entity.type}
          </div>
          <h2 className="text-2xl font-bold text-subject">{entity.name}</h2>
          {entity.aliases.length > 0 && (
            <div className="flex items-center gap-2 mt-2 text-sm text-white/50">
              <Type className="h-4 w-4" />
              <span>{entity.aliases.join(", ")}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-subject flex items-center gap-2">
            <Info className="h-4 w-4 text-white/40" /> Attributes
          </h3>
          <div className="bg-white/5 rounded-lg p-3 space-y-2 border border-white/5">
            {Object.entries(entity.attributes || {}).map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-white/50 capitalize">{key}</span>
                <span className="text-subject font-medium">{String(value)}</span>
              </div>
            ))}
            {Object.keys(entity.attributes || {}).length === 0 && (
              <div className="text-xs text-white/40 italic">No attributes defined.</div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-subject flex items-center gap-2">
            <FileText className="h-4 w-4 text-white/40" /> Mentions ({entity.mentions?.length || 0})
          </h3>
          <div className="space-y-2">
            {entity.mentions?.map((m) => (
              <div key={m.id} className="bg-white/5 hover:bg-white/10 transition-colors cursor-pointer rounded-lg p-3 border border-white/5">
                <div className="text-sm text-subject/80 line-clamp-3">
                  "{m.snippet}"
                </div>
                <div className="text-xs text-flare/80 mt-2">
                  View in document &rarr;
                </div>
              </div>
            ))}
            {(!entity.mentions || entity.mentions.length === 0) && (
              <div className="text-xs text-white/40 italic">Not mentioned in manuscript yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
