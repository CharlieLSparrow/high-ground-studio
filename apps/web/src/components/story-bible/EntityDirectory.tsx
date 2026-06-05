"use client";

import React from "react";
import { StoryEntity } from "./types";
import { Search, Plus } from "lucide-react";

interface EntityDirectoryProps {
  entities: StoryEntity[];
  onSelectEntity: (entity: StoryEntity) => void;
}

export function EntityDirectory({ entities, onSelectEntity }: EntityDirectoryProps) {
  const [search, setSearch] = React.useState("");

  const filtered = entities.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 p-4 backdrop-blur-md bg-void/80 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Search characters, settings..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-subject focus:outline-none focus:ring-1 focus:ring-flare/50 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-white/40">
            No entities found.
          </div>
        ) : (
          filtered.map((entity) => (
            <button
              key={entity.id}
              onClick={() => onSelectEntity(entity)}
              className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-colors group flex items-center justify-between"
            >
              <div>
                <div className="text-subject font-medium text-sm">{entity.name}</div>
                <div className="text-xs text-white/40 capitalize">{entity.type.toLowerCase()}</div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="p-4 border-t border-white/5">
        <button
          // @ts-ignore
          commandfor="create-entity-modal"
          command="show-modal"
          className="w-full flex items-center justify-center gap-2 bg-flare/10 hover:bg-flare/20 text-flare-glow py-2 rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Entity
        </button>
      </div>
    </div>
  );
}
