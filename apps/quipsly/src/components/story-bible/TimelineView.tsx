"use client";

import React, { useMemo } from "react";
import { StoryEntity } from "./types";
import { Clock, MapPin, Eye, Sparkles, ArrowUp, ArrowDown, Pin, Loader2 } from "lucide-react";

interface TimelineViewProps {
  entities: StoryEntity[];
  onSelectEntity: (entity: StoryEntity) => void;
  visibleBlocks?: any[];
  onEntityUpdated?: () => void;
}

export function TimelineView({ entities, onSelectEntity, visibleBlocks, onEntityUpdated }: TimelineViewProps) {
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  // Filter and sort beats. If they have attributes.order, sort by that, else by createdAt.
  const beats = useMemo(() => {
    return entities
      .filter((e) => e.type === "BEAT" || e.type === "TIMELINE_EVENT")
      .sort((a, b) => {
        const orderA = a.attributes?.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.attributes?.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [entities]);

  const handleBeatClick = (beat: StoryEntity) => {
    // If the beat has mentions or a blockId, we can dispatch a preview event.
    const mention = beat.mentions?.[0];
    if (mention?.snippet) {
      window.dispatchEvent(
        new CustomEvent("quipsly:source-overlay-preview", {
          detail: { selector: { kind: "text-quote", sourceDocumentId: "current-document", exactText: mention.snippet } },
        })
      );
    } else if (beat.attributes?.blockId) {
       window.dispatchEvent(
        new CustomEvent("quipsly:source-overlay-preview", {
          detail: { selector: { kind: "block", sourceDocumentId: "current-document", blockId: beat.attributes.blockId } },
        })
      );
    }
    onSelectEntity(beat);
  };

  const handleReorder = async (e: React.MouseEvent, beat: StoryEntity, index: number, direction: "UP" | "DOWN") => {
    e.stopPropagation();
    if (processingId) return;

    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= beats.length) return;

    const targetBeat = beats[targetIndex];

    setProcessingId(`reorder-${beat.id}`);
    try {
      // Swap their orders. If order is undefined, we use their current index
      const newOrderForBeat = targetBeat.attributes?.order ?? targetIndex;
      const newOrderForTarget = beat.attributes?.order ?? index;

      await Promise.all([
        fetch(`/api/story-bible/entities/${beat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: { ...beat.attributes, order: newOrderForBeat } }),
        }),
        fetch(`/api/story-bible/entities/${targetBeat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: { ...targetBeat.attributes, order: newOrderForTarget } }),
        })
      ]);

      onEntityUpdated?.();
    } catch (err) {
      console.error("Failed to reorder", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMapToBlock = async (e: React.MouseEvent, beat: StoryEntity) => {
    e.stopPropagation();
    if (processingId) return;

    const blockId = visibleBlocks?.[0]?.id;
    if (!blockId) return;

    setProcessingId(`map-${beat.id}`);
    try {
      await fetch(`/api/story-bible/entities/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributes: { ...beat.attributes, blockId } }),
      });
      onEntityUpdated?.();
    } catch (err) {
      console.error("Failed to map block", err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="sticky top-0 z-20 p-4 backdrop-blur-xl bg-void/80 border-b border-white/5 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-black text-subject flex items-center gap-2 uppercase tracking-widest">
            <Clock className="h-4 w-4 text-flare-glow" aria-hidden="true" />
            Structural Timeline
          </h2>
          <p className="text-[11px] text-white/40 mt-1 uppercase tracking-wider font-medium">
            Narrative arcs & beats mapped to the manuscript
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {beats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-4 opacity-40">
            <div className="relative">
              <div className="absolute inset-0 bg-flare blur-xl rounded-full opacity-20" />
              <MapPin className="h-10 w-10 text-white relative z-10" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-white text-center">
              No Structural Beats<br />
              <span className="text-[9px] text-white/50">Create a Beat entity to map the timeline</span>
            </p>
          </div>
        ) : (
          <div className="relative ml-2 border-l-2 border-white/10 pl-6 space-y-6 pb-8">
            {beats.map((beat, index) => {
              const hasMentions = beat.mentions && beat.mentions.length > 0;
              const hasBlock = !!beat.attributes?.blockId;
              const isMapped = hasMentions || hasBlock;

              return (
                <div key={beat.id} className="relative group">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 transition-all ${
                    isMapped
                      ? "bg-flare border-flare-glow shadow-[0_0_10px_rgba(255,165,0,0.5)] scale-110"
                      : "bg-void border-white/30 group-hover:border-white/60"
                  }`} />

                  {/* Card */}
                  <button
                    onClick={() => handleBeatClick(beat)}
                    className="w-full text-left bg-gradient-to-br from-white/[0.03] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] border border-white/5 hover:border-white/20 transition-all rounded-2xl p-4 group-hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-flare/50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-flare transition-colors flex items-center gap-1.5">
                          Beat {index + 1}
                          {isMapped && <Sparkles className="h-3 w-3 text-flare-glow" />}
                        </span>
                        <h3 className="text-sm font-bold text-subject/90">{beat.name}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Interactive Actions (Hidden until hover) */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/40 rounded-lg border border-white/10 p-0.5">
                          <button
                            disabled={index === 0 || processingId !== null}
                            onClick={(e) => handleReorder(e, beat, index, "UP")}
                            className="p-1 hover:bg-white/10 rounded-md text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                            title="Move Up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            disabled={index === beats.length - 1 || processingId !== null}
                            onClick={(e) => handleReorder(e, beat, index, "DOWN")}
                            className="p-1 hover:bg-white/10 rounded-md text-white/50 hover:text-white disabled:opacity-30 transition-colors"
                            title="Move Down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>

                          {!isMapped && visibleBlocks?.[0] && (
                            <button
                              disabled={processingId !== null}
                              onClick={(e) => handleMapToBlock(e, beat)}
                              className="p-1 ml-1 hover:bg-flare/20 rounded-md text-flare/70 hover:text-flare-glow disabled:opacity-30 transition-colors flex items-center gap-1"
                              title="Pin to visible manuscript section"
                            >
                              {processingId === `map-${beat.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pin className="h-3 w-3" />}
                            </button>
                          )}
                        </div>

                        {/* Status Badges */}
                        {isMapped ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-flare bg-flare/10 px-2 py-0.5 rounded-full border border-flare/20">
                            <MapPin className="h-3 w-3" />
                            Mapped
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                            Unmapped
                          </span>
                        )}
                      </div>
                    </div>

                    {beat.attributes?.notes && (
                      <p className="text-xs text-white/50 line-clamp-2 leading-relaxed mb-3">
                        {String(beat.attributes.notes)}
                      </p>
                    )}

                    {hasMentions && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30 pt-2 border-t border-white/5">
                        <Eye className="h-3 w-3" />
                        {beat.mentions?.length} Mention(s)
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
