"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type VisualOverview = {
  playbackUrl: string;
  navigationFrames: null | {
    columns: number;
    rows: number;
    sampleTimesSeconds: number[];
  };
};

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
      collaborationProxy: null | {
        id: string;
        playbackUrl: string;
        mimeType: string;
      };
      visualOverview: VisualOverview | null;
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
    revision: number;
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

type SourceAudition = {
  cardId: string;
  playbackUrl: string;
  startSeconds: number;
  endSeconds: number;
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

function representativeFrame(
  overview: VisualOverview | null,
  startSeconds: number,
  endSeconds: number,
) {
  const frames = overview?.navigationFrames;
  if (
    !overview ||
    !frames?.sampleTimesSeconds.length ||
    frames.columns < 1 ||
    frames.rows < 1
  ) return null;
  const midpoint = startSeconds + (endSeconds - startSeconds) / 2;
  let index = 0;
  frames.sampleTimesSeconds.forEach((sample, candidate) => {
    if (
      Math.abs(sample - midpoint) <
      Math.abs(frames.sampleTimesSeconds[index]! - midpoint)
    ) index = candidate;
  });
  const column = index % frames.columns;
  const row = Math.floor(index / frames.columns);
  return {
    sampleSeconds: frames.sampleTimesSeconds[index]!,
    style: {
      backgroundImage: `url(${overview.playbackUrl})`,
      backgroundSize: `${frames.columns * 100}% ${frames.rows * 100}%`,
      backgroundPosition: `${frames.columns === 1 ? 0 : (column / (frames.columns - 1)) * 100}% ${frames.rows === 1 ? 0 : (row / (frames.rows - 1)) * 100}%`,
    },
  };
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
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [audition, setAudition] = useState<SourceAudition | null>(null);
  const [confirmWithdrawPlacementId, setConfirmWithdrawPlacementId] = useState<string | null>(null);
  const [message, setMessage] = useState("Browse retained selects without copying their originals.");
  const auditionRef = useRef<HTMLVideoElement>(null);

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

  async function refreshEditorProjection() {
    try {
      await onPromoted();
      return "";
    } catch {
      return " The placement is saved, but the editor projection did not refresh; reload before making another edit.";
    }
  }

  const selectedBoard = workspace?.boards.find((board) => board.id === selectedBoardId) ?? null;
  useEffect(() => setSelectedCardIds([]), [selectedBoardId]);
  useEffect(() => {
    auditionRef.current?.pause();
    setAudition(null);
    setConfirmWithdrawPlacementId(null);
  }, [selectedBoardId]);
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

  const selectedSequence = useMemo(() => {
    if (!selectedBoard || !workspace) return [];
    const active = new Set(
      workspace.timelinePlacements
        .filter((placement) => placement.episodeProductionId === episode.id && placement.status === "active")
        .map((placement) => placement.cardId),
    );
    return groups
      .flatMap((group) => group.placements)
      .filter((placement) => selectedCardIds.includes(placement.cardId))
      .filter((placement) => placement.card.sourceRange && !active.has(placement.cardId));
  }, [episode.id, groups, selectedBoard, selectedCardIds, workspace]);

  const selectedDuration = selectedSequence.reduce(
    (total, placement) => total + Math.max(
      0.05,
      (placement.card.sourceRange?.endSeconds ?? 0) -
        (placement.card.sourceRange?.startSeconds ?? 0),
    ),
    0,
  );

  function toggleSelected(cardId: string) {
    setSelectedCardIds((current) => current.includes(cardId)
      ? current.filter((candidate) => candidate !== cardId)
      : [...current, cardId]);
  }

  function playAudition(next: SourceAudition) {
    if (audition?.cardId !== next.cardId) {
      auditionRef.current?.pause();
      setAudition(next);
      return;
    }
    const media = auditionRef.current;
    if (!media) return;
    media.currentTime = next.startSeconds;
    void media.play().catch(() => undefined);
  }

  function constrainAudition(event: React.SyntheticEvent<HTMLVideoElement>) {
    if (!audition) return;
    const media = event.currentTarget;
    if (media.currentTime < audition.startSeconds - 0.01) {
      media.currentTime = audition.startSeconds;
      return;
    }
    if (media.currentTime < audition.endSeconds - 0.005) return;
    media.pause();
    media.currentTime = audition.endSeconds;
  }

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
      const refreshWarning = await refreshEditorProjection();
      setMessage(`Added ${placement.card.title} to ${trackId} at ${clock(playhead)}. Its original and Story card remain unchanged.${refreshWarning}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Story card could not be added.");
    } finally {
      setPendingCardId(null);
    }
  }

  async function promoteSequence() {
    if (!selectedBoard || !workspace || !selectedSequence.length) return;
    let currentWorkspace = workspace;
    let cursor = playhead;
    const promotedIds: string[] = [];
    setPendingCardId("__sequence__");
    setMessage(`Adding ${selectedSequence.length} retained selects in board order…`);
    try {
      for (const placement of selectedSequence) {
        const projectedEpisode = currentWorkspace.episodes.find(
          (candidate) => candidate.id === episode.id,
        );
        if (!projectedEpisode) throw new Error("The Episode left the current Story projection.");
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "promote-card-to-episode",
            episodeProductionId: episode.id,
            cardId: placement.card.id,
            originBoardId: selectedBoard.id,
            originBoardPlacementId: placement.id,
            clientRequestId: requestId(),
            expectedTimelineFingerprint: projectedEpisode.timelineFingerprint,
            placementMode: "at-time",
            episodeStartSeconds: cursor,
            trackId,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status === 409) {
          const refreshWarning = promotedIds.length
            ? await refreshEditorProjection()
            : "";
          setSelectedCardIds((current) => current.filter((id) => !promotedIds.includes(id)));
          await loadWorkspace(
            `${promotedIds.length} select${promotedIds.length === 1 ? " was" : "s were"} added before another timeline change was detected. The remaining sequence was not placed; review the refreshed timeline before continuing.${refreshWarning}`,
          );
          return;
        }
        if (!response.ok) throw new Error(errorMessage(body, `Could not add ${placement.card.title}.`));
        const next = (body as { workspace?: StoryWorkspace }).workspace;
        if (!next) throw new Error("The placement succeeded without a refreshed Story projection.");
        currentWorkspace = next;
        setWorkspace(next);
        promotedIds.push(placement.card.id);
        const range = placement.card.sourceRange!;
        cursor = Math.round(
          (cursor + Math.max(0.05, range.endSeconds - range.startSeconds)) *
            1_000,
        ) / 1_000;
      }
      const refreshWarning = await refreshEditorProjection();
      setSelectedCardIds([]);
      setMessage(
        `Added ${promotedIds.length} selects to ${trackId} from ${clock(playhead)}–${clock(cursor)} in board order. Every original and Story card remains unchanged.${refreshWarning}`,
      );
    } catch (error) {
      const refreshWarning = promotedIds.length
        ? await refreshEditorProjection()
        : "";
      setSelectedCardIds((current) => current.filter((id) => !promotedIds.includes(id)));
      setMessage(
        `${promotedIds.length ? `${promotedIds.length} select${promotedIds.length === 1 ? " was" : "s were"} added. ` : ""}${error instanceof Error ? error.message : "The remaining sequence could not be added."}${refreshWarning}`,
      );
    } finally {
      setPendingCardId(null);
    }
  }

  async function revisePlacement(
    action: "reposition-timeline-placement" | "withdraw-timeline-placement",
    placement: StoryWorkspace["timelinePlacements"][number],
    cardTitle: string,
  ) {
    const projectedEpisode = workspace?.episodes.find((candidate) => candidate.id === episode.id);
    if (!projectedEpisode) {
      setMessage("This Episode is not in the current Story projection. Refresh before changing the placement.");
      return;
    }
    const pendingId = `${action}:${placement.id}`;
    setPendingCardId(pendingId);
    setMessage(action === "reposition-timeline-placement"
      ? `Moving ${cardTitle} to ${trackId} at ${clock(playhead)}…`
      : `Removing ${cardTitle} from this Episode…`);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          placementId: placement.id,
          expectedRevision: placement.revision,
          expectedTimelineFingerprint: projectedEpisode.timelineFingerprint,
          clientRequestId: requestId(),
          ...(action === "reposition-timeline-placement"
            ? { episodeStartSeconds: playhead, trackId }
            : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setConfirmWithdrawPlacementId(null);
        await loadWorkspace("The Episode timeline changed before that placement could be revised. It is refreshed now; review it before trying again.");
        return;
      }
      if (!response.ok) throw new Error(errorMessage(body, "The Episode placement could not be revised."));
      const next = (body as { workspace?: StoryWorkspace }).workspace;
      if (!next) throw new Error("The placement changed without a refreshed Story projection.");
      setWorkspace(next);
      setConfirmWithdrawPlacementId(null);
      const refreshWarning = await refreshEditorProjection();
      setMessage(action === "reposition-timeline-placement"
        ? `Moved ${cardTitle} from ${placement.trackId} at ${clock(placement.episodeStartSeconds)} to ${trackId} at ${clock(playhead)}. Its source range and original remain unchanged.${refreshWarning}`
        : `Removed ${cardTitle} from this Episode. The placement receipt, Story card, source range, and original remain retained.${refreshWarning}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Episode placement could not be revised.");
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

              {selectedSequence.length ? (
                <div className="rounded-xl border border-[#d8ad56]/50 bg-[#2a2415] p-3" aria-label="Selected Story sequence">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-[#f2ead8]">{selectedSequence.length} selected in board order</strong>
                      <p className="mt-1 font-mono text-[10px] text-[#d8c79d]">
                        {trackId} · {clock(playhead)}–{clock(playhead + selectedDuration)} · no gaps
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit || pendingCardId !== null}
                      onClick={() => void promoteSequence()}
                      className="min-h-10 rounded-lg bg-[#d8ad56] px-3 text-xs font-black text-[#172018] disabled:opacity-40"
                    >
                      {pendingCardId === "__sequence__" ? "Adding sequence…" : "Add sequence"}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-[#cabb99]">Each select receives its own reversible placement receipt. If collaboration changes the timeline, Quipsly stops before the next select and refreshes instead of guessing.</p>
                </div>
              ) : null}

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
                    const frame = source ? representativeFrame(
                      source.sourceRevision.visualOverview,
                      source.startSeconds,
                      source.endSeconds,
                    ) : null;
                    const activePlacement = workspace.timelinePlacements.find((candidate) => (
                      candidate.episodeProductionId === episode.id
                      && candidate.cardId === card.id
                      && candidate.status === "active"
                    ));
                    const collaborationProxy = source?.sourceRevision.collaborationProxy ?? null;
                    const cardAudition = source && collaborationProxy ? {
                      cardId: card.id,
                      playbackUrl: collaborationProxy.playbackUrl,
                      startSeconds: source.startSeconds,
                      endSeconds: source.endSeconds,
                    } : null;
                    const storyParams = new URLSearchParams({ board: selectedBoard.id, card: card.id });
                    if (source?.sourceSet?.id) storyParams.set("set", source.sourceSet.id);
                    else if (source?.sourceRevision.externalReference?.id) storyParams.set("external", source.sourceRevision.externalReference.id);
                    else if (source?.sourceRevision.mediaAsset?.id) storyParams.set("asset", source.sourceRevision.mediaAsset.id);
                    return (
                      <article key={placement.id} id={`episode-story-card-${card.id}`} className="rounded-xl border border-violet-800/60 bg-[#090b13] p-3">
                        {frame ? (
                          <div
                            role="img"
                            aria-label={`Representative source frame for ${card.title} at ${clock(frame.sampleSeconds)}`}
                            className="mb-3 aspect-video w-full rounded-lg border border-violet-700/50 bg-black bg-cover bg-no-repeat"
                            style={frame.style}
                          />
                        ) : null}
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
                        {audition?.cardId === card.id ? (
                          <section className="mt-3 rounded-xl border border-sky-700/60 bg-sky-950/25 p-3" aria-label={`Source audition for ${card.title}`}>
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <div>
                                <strong className="text-xs text-sky-100">Exact retained range</strong>
                                <p className="mt-1 font-mono text-[9px] text-sky-200">{clock(audition.startSeconds)}–{clock(audition.endSeconds)} · protected proxy</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  auditionRef.current?.pause();
                                  setAudition(null);
                                }}
                                className="min-h-9 rounded-lg border border-sky-700/70 px-3 text-[10px] font-black text-sky-100"
                              >
                                Close preview
                              </button>
                            </div>
                            <video
                              key={`${audition.cardId}:${audition.startSeconds}:${audition.endSeconds}`}
                              ref={auditionRef}
                              src={audition.playbackUrl}
                              controls
                              playsInline
                              preload="metadata"
                              aria-label={`${card.title} retained source range player`}
                              onLoadedMetadata={(event) => {
                                event.currentTarget.currentTime = audition.startSeconds;
                                void event.currentTarget.play().catch(() => undefined);
                              }}
                              onPlay={(event) => {
                                if (
                                  event.currentTarget.currentTime < audition.startSeconds - 0.01 ||
                                  event.currentTarget.currentTime >= audition.endSeconds - 0.005
                                ) event.currentTarget.currentTime = audition.startSeconds;
                              }}
                              onTimeUpdate={constrainAudition}
                              className="aspect-video w-full rounded-lg bg-black"
                            />
                            <p className="mt-2 text-[10px] leading-4 text-sky-100/80">Playback is constrained to the card’s immutable source-clock receipt. Scrubbing outside it returns to the retained boundary; the original remains untouched.</p>
                          </section>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {cardAudition ? (
                            <button
                              type="button"
                              onClick={() => playAudition(cardAudition)}
                              className="min-h-9 rounded-lg border border-sky-700/70 px-3 text-xs font-black text-sky-100"
                            >
                              {audition?.cardId === card.id ? "Restart exact range" : "Preview source range"}
                            </button>
                          ) : null}
                          {!activePlacement && source ? (
                            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-violet-700/70 px-3 text-xs font-black text-violet-100">
                              <input
                                type="checkbox"
                                aria-label={`Select ${card.title} for sequence`}
                                checked={selectedCardIds.includes(card.id)}
                                disabled={pendingCardId !== null}
                                onChange={() => toggleSelected(card.id)}
                                className="size-4 accent-violet-500"
                              />
                              Sequence
                            </label>
                          ) : null}
                          {activePlacement ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onCue(activePlacement.episodeStartSeconds)}
                                className="min-h-9 rounded-lg bg-violet-700 px-3 text-xs font-black text-white"
                              >
                                Cue {activePlacement.trackId} · {clock(activePlacement.episodeStartSeconds)}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  !canEdit ||
                                  pendingCardId !== null ||
                                  (activePlacement.trackId === trackId && Math.abs(activePlacement.episodeStartSeconds - playhead) < 0.0005)
                                }
                                onClick={() => void revisePlacement("reposition-timeline-placement", activePlacement, card.title)}
                                className="min-h-9 rounded-lg border border-[#d8ad56]/70 px-3 text-xs font-black text-[#f3d991] disabled:opacity-35"
                              >
                                {pendingCardId === `reposition-timeline-placement:${activePlacement.id}`
                                  ? "Moving…"
                                  : activePlacement.trackId === trackId && Math.abs(activePlacement.episodeStartSeconds - playhead) < 0.0005
                                    ? "At selected destination"
                                    : `Move to ${trackId} · ${clock(playhead)}`}
                              </button>
                              {confirmWithdrawPlacementId === activePlacement.id ? (
                                <span className="inline-flex flex-wrap gap-2 rounded-lg border border-rose-700/70 bg-rose-950/30 p-1" role="group" aria-label={`Confirm removal of ${card.title}`}>
                                  <button
                                    type="button"
                                    disabled={!canEdit || pendingCardId !== null}
                                    onClick={() => void revisePlacement("withdraw-timeline-placement", activePlacement, card.title)}
                                    className="min-h-8 rounded-md bg-rose-600 px-3 text-[10px] font-black text-white disabled:opacity-40"
                                  >
                                    {pendingCardId === `withdraw-timeline-placement:${activePlacement.id}` ? "Removing…" : "Confirm remove"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pendingCardId !== null}
                                    onClick={() => setConfirmWithdrawPlacementId(null)}
                                    className="min-h-8 rounded-md px-3 text-[10px] font-black text-rose-100 disabled:opacity-40"
                                  >
                                    Keep clip
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!canEdit || pendingCardId !== null}
                                  onClick={() => setConfirmWithdrawPlacementId(activePlacement.id)}
                                  className="min-h-9 rounded-lg border border-rose-900/80 px-3 text-xs font-black text-rose-200 disabled:opacity-40"
                                >
                                  Remove from Episode…
                                </button>
                              )}
                            </>
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
