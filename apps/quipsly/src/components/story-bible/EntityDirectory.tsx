"use client";

import React, { useMemo } from "react";
import { StoryEntity } from "./types";
import { Search, Plus, User, MapPin, Film, Layers, Clock, Link2 } from "lucide-react";

interface EntityDirectoryProps {
  entities: StoryEntity[];
  onSelectEntity: (entity: StoryEntity) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  CHARACTER: <User className="h-4 w-4" />,
  SETTING: <MapPin className="h-4 w-4" />,
  SCENE: <Film className="h-4 w-4" />,
  THEME_MOTIF: <Layers className="h-4 w-4" />,
  TIMELINE_EVENT: <Clock className="h-4 w-4" />,
  RELATIONSHIP: <Link2 className="h-4 w-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  CHARACTER: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  SETTING: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  SCENE: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  THEME_MOTIF: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  TIMELINE_EVENT: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  RELATIONSHIP: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
};

export function EntityDirectory({ entities, onSelectEntity }: EntityDirectoryProps) {
  const [search, setSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState<string | "ALL">("ALL");

  const filtered = useMemo(() => {
    return entities.filter((e) => {
      const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.aliases.some(a => a.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === "ALL" || e.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [entities, search, filterType]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: entities.length };
    entities.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [entities]);

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="sticky top-0 z-20 p-4 backdrop-blur-xl bg-void/80 border-b border-white/5 space-y-3">
        <div className="relative group">
          <div className="absolute inset-0 bg-flare/20 blur-md rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40 group-focus-within:text-flare transition-colors z-10" />
          <input
            type="text"
            placeholder="Search the bible..."
            className="relative w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-subject focus:outline-none focus:ring-1 focus:ring-flare/50 transition-all placeholder:text-white/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {/* Type Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button 
            onClick={() => setFilterType("ALL")}
            className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${filterType === "ALL" ? "bg-white/20 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}
          >
            All <span className="opacity-50 ml-1">{typeCounts["ALL"] || 0}</span>
          </button>
          {Object.entries(TYPE_ICONS).map(([type, icon]) => {
            const count = typeCounts[type] || 0;
            if (count === 0 && filterType !== type) return null;
            return (
              <button 
                key={type}
                onClick={() => setFilterType(type)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all ${filterType === type ? "bg-flare/20 text-flare border border-flare/30" : "bg-white/5 text-white/50 hover:bg-white/10 border border-transparent"}`}
              >
                {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-3 w-3" })}
                {type.replace("_", " ")}
                <span className="opacity-50">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3 opacity-50">
            <Search className="h-8 w-8 text-white/40" />
            <div className="text-sm text-white/60">No entities found.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((entity) => {
              const colorClass = TYPE_COLORS[entity.type] || "text-white/60 bg-white/5 border-white/10";
              const Icon = TYPE_ICONS[entity.type] || <Search className="h-4 w-4" />;
              return (
                <button
                  key={entity.id}
                  onClick={() => onSelectEntity(entity)}
                  className="group relative flex flex-col items-start p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] hover:border-white/[0.15] hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-300 text-left overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 w-full h-1 opacity-50 group-hover:opacity-100 transition-opacity ${colorClass.split(" ")[1]}`} />
                  <div className={`mb-2 p-1.5 rounded-md ${colorClass} shrink-0 shadow-inner`}>
                    {Icon}
                  </div>
                  <div className="text-sm font-bold text-subject line-clamp-1 w-full">{entity.name}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{entity.type.replace("_", " ")}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 bg-void/90 backdrop-blur-md">
        <button
          // @ts-ignore
          commandfor="create-entity-modal"
          command="show-modal"
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-flare/20 to-flare-glow/20 hover:from-flare/30 hover:to-flare-glow/30 border border-flare/30 text-flare-glow py-2.5 rounded-lg transition-all duration-300 text-sm font-bold tracking-wide uppercase hover:shadow-[0_0_15px_rgba(255,165,0,0.2)]"
        >
          <Plus className="h-4 w-4" />
          Create Entity
        </button>
      </div>
    </div>
  );
}
