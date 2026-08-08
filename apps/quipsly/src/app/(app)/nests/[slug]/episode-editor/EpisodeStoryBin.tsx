"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type StoryCard = {
  id: string;
  title: string;
  synopsis: string;
  purpose: string;
  revision: number;
  sourceRange: null | {
    startSeconds: number;
    endSeconds: number;
    reframeRecipe: unknown;
    sourceSet: null | { id: string; displayName: string; completeness: string };
    sourceRevision: {
      mediaAsset: null | { id: string; filename: string };
      externalReference: null | {
        id: string;
        provider: string;
        fileName: string;
        accessState: string;
        capabilityState: string;
      };
      collaborationProxy: null | { id: string };
      sourceState: string;
      verifiedAt: string | null;
    };
  };
};

type StoryBoard = {
  id: string;
  title: string;
  sections: Array<{ id: string; key: string; title: string; sortOrder: number }>;
  placements: Array<{
    id: string;
    cardId: string;
    groupKey: string;
    sortOrder: number;
    card: StoryCard;
  }>;
};

type StoryWorkspace = {
  episodes: Array<{ id: string; timelineFingerprint: string }>;
  timelinePlacements: Array<{
    id: string;
    episodeProductionId: string;
    cardId: string;
    originBoardId: string | null;
    originBoardPlacementId: string | null;
    trackId: string;
    episodeStartSeconds: number;
    durationSeconds: number;
    status: string;
  }>;
  boards: StoryBoard[];
};

type EpisodeStoryBinProps = {
  projectSlug: string;
  episode: { id: string; title: string };
  canEdit: boolean;
  playhead: number;
  onCue: (seconds: number) => void;
  onPromoted: () => Promise<void> | void;
};

function clock(value: number) {
  const seconds = Math.max(0, value);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function errorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function recipeKeyframes(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const recipe = value as { keyframes?: unknown; aspectRatio?: unknown };
  if (!Array.isArray(recipe.keyframes)) return null;
  return {
    count: recipe.keyframes.length,
    aspectRatio: typeof recipe.aspectRatio === "string" ? recipe.aspectRatio : "framed",
  };
}

function requestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `story-placement-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function EpisodeStoryBin({
  projectSlug,
  episode,
  canEdit,
  playhead,
  onCue,
  onPromoted,
}: EpisodeStoryBinProps) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<StoryWorkspace | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [trackId, setTrackId] = useState("V3");
  const [loading, setLoading] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);
  const [message, setMessage] = useState("Browse retained selects without copying their originals.");

  const endpoint = `/api/nests/${encodeURIComponent(projectSlug)}/source-story`;

  async function loadWorkspace(reason?: string) {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(body, "The Story library could not be opened."));
      const next = (body as { workspace?: StoryWorkspace }).workspace;
      if (!next) throw new Error("The Story library response did not include a workspace.");
      setWorkspace(next);
      setSelectedBoardId((current) => (
        current && next.boards.some((board) => board.id === current)
          ? current
          : next.boards.find((board) => board.placements.length)?.id ?? next.boards[0]?.id ?? ""
      ));
      if (reason) setMessage(reason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Story library could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !workspace && !loading) await loadWorkspace();
  }

  const selectedBoard = workspace?.boards.find((board) => board.id === selectedBoardId) ?? null;
  const groups = useMemo(() => {
    if (!selectedBoard) return [];
    const sectionKeys = new Set(selectedBoard.sections.map((section) => section.key));
    const sectionGroups = selectedBoard.sections
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        key: section.key,
        title: section.title,
        placements: selectedBoard.placements
          .filter((placement) => placement.groupKey === section.key)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      }));
    const unsectioned = selectedBoard.placements
      .filter((placement) => !sectionKeys.has(placement.groupKey))
      .sort((left, right) => left.sortOrder - right.sortOrder);
    return unsectioned.length
      ? [...sectionGroups, { key: "__unsectioned", title: "Other selects", placements: unsectioned }]
      : sectionGroups;
  }, [selectedBoard]);

  async function promote(board: StoryBoard, placement: StoryBoard["placements"][number]) {
    const projectedEpisode = workspace?.episodes.find((candidate) => candidate.id === episode.id);
    if (!projectedEpisode) {
      setMessage("This Episode is not in the current Story projection. Refresh the bin before placing a card.");
      return;
    }
    setPendingCardId(placement.card.id);
    setMessage(`Adding ${placement.card.title} at ${clock(playhead)}…`);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote-card-to-episode",
          episodeProductionId: episode.id,
          cardId: placement.card.id,
          originBoardId: board.id,
          originBoardPlacementId: placement.id,
          clientRequestId: requestId(),
          expectedTimelineFingerprint: projectedEpisode.timelineFingerprint,
          placementMode: "at-time",
          episodeStartSeconds: playhead,
          trackId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await loadWorkspace("The Episode timeline changed while this bin was open. It is refreshed now; review the playhead and add again.");
        return;
      }
      if (!response.ok) throw new Error(errorMessage(body, "The Story card could not be added."));
      const next = (body as { workspace?: StoryWorkspace }).workspace;
      if (next) setWorkspace(next);
      await onPromoted();
      setMessage(`Added ${placement.card.title} to ${trackId} at ${clock(playhead)}. Its original and Story card remain unchanged.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Story card could not be added.");
    } finally {
      setPendingCardId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-700/50 bg-[#11131d] p-4" aria-labelledby="episode-story-bin-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-300">Story source bin</p>
          <h2 id="episode-story-bin-heading" className="mt-1 font-serif text-xl">Build from retained selects</h2>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => void toggleOpen()}
          className="min-h-9 rounded-lg border border-violet-500/60 px-3 text-xs font-black text-violet-100"
        >
          {open ? "Close" : "Browse"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#a9a6b9]">{message}</p>

      {open ? (
        <div className="mt-3 space-y-3">
          {loading && !workspace ? <p role="status" className="rounded-xl bg-violet-950/50 p-3 text-xs text-violet-100">Opening the retained Story library…</p> : null}
          {workspace ? (
            <>
              <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-violet-200">
                  Board
                  <select
                    aria-label="Story board"
                    value={selectedBoardId}
                    onChange={(event) => setSelectedBoardId(event.target.value)}
                    className="min-h-10 rounded-lg border border-violet-700/60 bg-[#080a10] px-2 text-xs font-bold normal-case tracking-normal text-white"
                  >
                    {workspace.boards.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-violet-200">
                  Track
                  <select
                    aria-label="Destination video track"
                    value={trackId}
                    onChange={(event) => setTrackId(event.target.value)}
                    className="min-h-10 rounded-lg border border-violet-700/60 bg-[#080a10] px-2 font-mono text-xs font-bold text-white"
                  >
                    {Array.from({ length: 9 }, (_, index) => <option key={index} value={`V${index + 1}`}>V{index + 1}</option>)}
                  </select>
                </label>
              </div>

              {selectedBoard && !selectedBoard.placements.length ? (
                <p className="rounded-xl border border-dashed border-violet-700/60 p-3 text-xs text-[#a9a6b9]">This board has no retained cards yet.</p>
              ) : null}

              {selectedBoard ? groups.map((group) => (
                group.placements.length ? <div key={group.key} className="space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">{group.title}</h3>
                  {group.placements.map((placement) => {
                    const card = placement.card;
                    const source = card.sourceRange;
                    const recipe = recipeKeyframes(source?.reframeRecipe);
                    const activePlacement = workspace.timelinePlacements.find((candidate) => (
                      candidate.episodeProductionId === episode.id
                      && candidate.cardId === card.id
                      && candidate.status === "active"
                    ));
                    const storyParams = new URLSearchParams({ board: selectedBoard.id, card: card.id });
                    if (source?.sourceSet?.id) storyParams.set("set", source.sourceSet.id);
                    else if (source?.sourceRevision.externalReference?.id) storyParams.set("external", source.sourceRevision.externalReference.id);
                    else if (source?.sourceRevision.mediaAsset?.id) storyParams.set("asset", source.sourceRevision.mediaAsset.id);
                    return (
                      <article key={placement.id} id={`episode-story-card-${card.id}`} className="rounded-xl border border-violet-800/60 bg-[#090b13] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm text-[#f2ead8]">{card.title}</strong>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#aaa8b5]">{card.synopsis || "No synopsis yet."}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-violet-950 px-2 py-1 font-mono text-[9px] text-violet-200">r{card.revision}</span>
                        </div>
                        {source ? (
                          <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-black uppercase tracking-wide text-violet-200">
                            <span className="rounded bg-violet-950/70 px-2 py-1">{clock(source.startSeconds)}–{clock(source.endSeconds)}</span>
                            <span className="rounded bg-violet-950/70 px-2 py-1">{source.sourceRevision.collaborationProxy ? "proxy ready" : source.sourceRevision.sourceState}</span>
                            {recipe ? <span className="rounded bg-violet-950/70 px-2 py-1">360° {recipe.aspectRatio} · {recipe.count} keyframe{recipe.count === 1 ? "" : "s"}</span> : null}
                          </div>
                        ) : <p className="mt-2 text-[10px] font-bold text-amber-200">No exact source range is attached.</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {activePlacement ? (
                            <button
                              type="button"
                              onClick={() => onCue(activePlacement.episodeStartSeconds)}
                              className="min-h-9 rounded-lg bg-violet-700 px-3 text-xs font-black text-white"
                            >
                              Cue {activePlacement.trackId} · {clock(activePlacement.episodeStartSeconds)}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canEdit || !source || pendingCardId !== null}
                              onClick={() => void promote(selectedBoard, placement)}
                              className="min-h-9 rounded-lg bg-[#d8ad56] px-3 text-xs font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {pendingCardId === card.id ? "Adding…" : `Add at ${clock(playhead)}`}
                            </button>
                          )}
                          <Link
                            href={`/nests/${encodeURIComponent(projectSlug)}/story?${storyParams.toString()}#story-card-${encodeURIComponent(card.id)}`}
                            className="inline-flex min-h-9 items-center rounded-lg border border-violet-700/70 px-3 text-xs font-black text-violet-200"
                          >
                            Open Story card
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div> : null
              )) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
