"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CircleAlert,
  Cloud,
  Clapperboard,
  Clock3,
  FileVideo2,
  Film,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Link2,
  Play,
  Plus,
  Rotate3d,
  Save,
  Search,
  Tags,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { storyCardPurposes, storyCardStatuses } from "@/lib/source-story-contract";

import { GoogleDriveSourcePicker } from "./GoogleDriveSourcePicker";

type Asset = {
  id: string;
  filename: string;
  url: string;
  mimeType: string | null;
  sizeBytes: string | null;
  duration: number | null;
  resolution: string | null;
  fps: number | null;
  thumbnailUrl: string | null;
  isProxy: boolean;
  updatedAt: string;
  _count: { clips: number; variants: number };
};

type Tag = { id: string; label: string; slug: string; category: string };
type Episode = { id: string; slug: string; title: string; status: string };

type SourceStoryCard = {
  id: string;
  stableId: string;
  title: string;
  synopsis: string;
  notes: string;
  purpose: string;
  status: string;
  visibility: string;
  revision: number;
  updatedAt: string;
  tags: Array<{ id: string; label: string; slug: string }>;
  sourceRange: null | {
    id: string;
    startSeconds: number;
    endSeconds: number;
    selectorSha256: string;
    reframeRecipe: unknown;
    sourceRevision: {
      id: string;
      revisionKey: string;
      identitySha256: string;
      contentSha256: string | null;
      sizeBytes: string | null;
      durationSeconds: number | null;
      sourceState: string;
      verifiedAt: string | null;
      mediaAsset: null | { id: string; filename: string; url: string; mimeType: string | null; duration: number | null; thumbnailUrl: string | null };
      externalReference: null | { id: string; provider: string; fileName: string; mimeType: string | null; accessState: string; capabilityState: string; lastVerifiedAt: string | null };
    };
  };
};

type SourceStoryBoard = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: string;
  layout: string;
  revision: number;
  episodeProductionId: string | null;
  updatedAt: string;
  placements: Array<{
    id: string;
    cardId: string;
    groupKey: string;
    laneKey: string;
    sortOrder: number;
    card: SourceStoryCard;
  }>;
};

type SourceStoryWorkspace = {
  schema: "quipsly-source-story-v1";
  externalSources: Array<{
    id: string;
    provider: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: string | null;
    headRevisionKey: string | null;
    providerCreatedAt: string | null;
    providerModifiedAt: string | null;
    accessState: string;
    capabilityState: string;
    lastVerifiedAt: string | null;
    revision: number;
    latestSourceRevision: null | {
      id: string;
      revisionKey: string;
      identitySha256: string;
      contentSha256: string | null;
      sizeBytes: string | null;
      sourceState: string;
      verifiedAt: string | null;
    };
  }>;
  cards: SourceStoryCard[];
  boards: SourceStoryBoard[];
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  currentRevision?: number | null;
  workspace?: SourceStoryWorkspace;
};

function formatClock(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "--:--.--";
  const seconds = Math.max(0, value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const body = `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
  return hours ? `${hours}:${body}` : body;
}

function formatBytes(value: string | null) {
  const bytes = value ? Number(value) : Number.NaN;
  if (!Number.isFinite(bytes) || bytes < 0) return "Size not verified";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024).toLocaleString()} KB`;
}

function sourceStateLabel(value: string) {
  if (value === "checksum-bound") return "Checksum-bound source";
  if (value === "identity-unverified") return "Registered identity · exact bytes still need verification";
  return value.replaceAll("-", " ");
}

function externalSourceHealth(accessState: string, capabilityState: string) {
  if (accessState === "available" && capabilityState === "downloadable") return { label: "Ready for verified proxy/execution", tone: "border-emerald-200 bg-emerald-50 text-emerald-950" };
  if (capabilityState === "metadata-only") return { label: "Metadata only · proxy and render held", tone: "border-amber-200 bg-amber-50 text-amber-950" };
  if (capabilityState === "needs-reauth" || accessState === "revoked") return { label: "Reconnect source access", tone: "border-rose-200 bg-rose-50 text-rose-950" };
  return { label: `${accessState.replaceAll("-", " ")} · ${capabilityState.replaceAll("-", " ")}`, tone: "border-zinc-200 bg-zinc-50 text-zinc-800" };
}

function boardGroupLabel(value: string) {
  if (value === "unassigned") return "Unassigned story beat";
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceHref(projectSlug: string, assetId: string, boardId: string | null) {
  const params = new URLSearchParams({ asset: assetId });
  if (boardId) params.set("board", boardId);
  return `/nests/${encodeURIComponent(projectSlug)}/story?${params.toString()}`;
}

export function SourceStoryClient({
  project,
  canWrite,
  initialAssets,
  tags,
  episodes,
  initialWorkspace,
  initialAssetId,
  initialBoardId,
}: {
  project: { id: string; slug: string; name: string };
  canWrite: boolean;
  initialAssets: Asset[];
  tags: Tag[];
  episodes: Episode[];
  initialWorkspace: SourceStoryWorkspace;
  initialAssetId: string | null;
  initialBoardId: string | null;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const pendingPlaybackRef = useRef<{ assetId: string; startSeconds: number; endSeconds: number } | null>(null);
  const playbackBoundaryRef = useRef<number | null>(null);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [selectedBoardId, setSelectedBoardId] = useState(initialBoardId);
  const [sourceQuery, setSourceQuery] = useState("");
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [notes, setNotes] = useState("");
  const [purpose, setPurpose] = useState("select");
  const [groupKey, setGroupKey] = useState("unassigned");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [preserve360, setPreserve360] = useState(false);
  const [boardTitle, setBoardTitle] = useState("Main story");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardEpisodeId, setBoardEpisodeId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = initialAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedBoard = workspace.boards.find((board) => board.id === selectedBoardId) ?? workspace.boards[0] ?? null;
  const filteredAssets = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    return query
      ? initialAssets.filter((asset) => `${asset.filename} ${asset.mimeType ?? ""} ${asset.resolution ?? ""}`.toLowerCase().includes(query))
      : initialAssets;
  }, [initialAssets, sourceQuery]);
  const filteredExternalSources = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    return query
      ? workspace.externalSources.filter((source) => `${source.fileName} ${source.provider} ${source.mimeType ?? ""}`.toLowerCase().includes(query))
      : workspace.externalSources;
  }, [sourceQuery, workspace.externalSources]);
  const placedIds = useMemo(() => new Set(workspace.boards.flatMap((board) => board.placements.map((placement) => placement.cardId))), [workspace.boards]);
  const unplacedCards = workspace.cards.filter((card) => !placedIds.has(card.id));

  useEffect(() => {
    if (!selectedBoardId && workspace.boards[0]) setSelectedBoardId(workspace.boards[0].id);
  }, [selectedBoardId, workspace.boards]);

  useEffect(() => {
    const pendingPlayback = pendingPlaybackRef.current;
    const media = mediaRef.current;
    if (!pendingPlayback || pendingPlayback.assetId !== selectedAssetId || !media) return;
    pendingPlaybackRef.current = null;
    let cancelled = false;
    const begin = () => {
      if (cancelled) return;
      playbackBoundaryRef.current = pendingPlayback.endSeconds;
      media.currentTime = pendingPlayback.startSeconds;
      void media.play().catch(() => {
        playbackBoundaryRef.current = null;
      });
    };
    if (media.readyState >= 1) begin();
    else media.addEventListener("loadedmetadata", begin, { once: true });
    return () => {
      cancelled = true;
      media.removeEventListener("loadedmetadata", begin);
    };
  }, [selectedAssetId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "i") {
        if (mediaRef.current) setInPoint(mediaRef.current.currentTime);
        event.preventDefault();
      }
      if (event.key.toLowerCase() === "o") {
        if (mediaRef.current) setOutPoint(mediaRef.current.currentTime);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function refreshWorkspace() {
    const response = await fetch(`/api/nests/${encodeURIComponent(project.slug)}/source-story`, { cache: "no-store" });
    const payload = await response.json() as ApiPayload;
    if (!response.ok || !payload.workspace) throw new Error(payload.error || "The shared story workspace could not be refreshed.");
    setWorkspace(payload.workspace);
    return payload.workspace;
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/nests/${encodeURIComponent(project.slug)}/source-story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.workspace) {
        if (response.status === 409) await refreshWorkspace();
        throw new Error(payload.error || "The story operation could not be saved.");
      }
      setWorkspace(payload.workspace);
      setMessage(successMessage);
      return payload.workspace;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The story operation could not be saved.");
      return null;
    } finally {
      setPending(false);
    }
  }

  function chooseAsset(
    assetId: string,
    pendingPlayback: { assetId: string; startSeconds: number; endSeconds: number } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(assetId);
    setInPoint(null);
    setOutPoint(null);
    setMessage(null);
    setError(null);
    window.history.replaceState(null, "", sourceHref(project.slug, assetId, selectedBoard?.id ?? null));
  }

  function playSourceRange(assetId: string, startSeconds: number, endSeconds: number) {
    const playback = { assetId, startSeconds, endSeconds };
    if (selectedAssetId !== assetId || !mediaRef.current) {
      chooseAsset(assetId, playback);
      return;
    }
    playbackBoundaryRef.current = endSeconds;
    mediaRef.current.currentTime = startSeconds;
    void mediaRef.current.play().catch(() => {
      playbackBoundaryRef.current = null;
    });
  }

  function stopAtSourceRangeBoundary(event: React.SyntheticEvent<HTMLMediaElement>) {
    const boundary = playbackBoundaryRef.current;
    if (boundary === null || event.currentTarget.currentTime < boundary - 0.005) return;
    event.currentTarget.pause();
    event.currentTarget.currentTime = boundary;
    playbackBoundaryRef.current = null;
  }

  async function createBoard() {
    const next = await mutate({
      action: "create-board",
      clientRequestId: crypto.randomUUID(),
      title: boardTitle,
      description: boardDescription,
      episodeProductionId: boardEpisodeId || null,
      kind: boardEpisodeId ? "episode" : "story",
    }, "Created a revisioned story board. No source media changed.");
    if (next?.boards[0]) setSelectedBoardId(next.boards[0].id);
  }

  async function createCard() {
    if (!selectedAsset || inPoint === null || outPoint === null) return;
    const board = workspace.boards.find((candidate) => candidate.id === selectedBoardId) ?? null;
    const next = await mutate({
      action: "create-card",
      clientRequestId: crypto.randomUUID(),
      mediaAssetId: selectedAsset.id,
      boardId: board?.id ?? null,
      expectedBoardRevision: board?.revision ?? null,
      title,
      synopsis,
      notes,
      purpose,
      startSeconds: inPoint,
      endSeconds: outPoint,
      groupKey,
      laneKey: "story",
      tagIds: selectedTagIds,
      reframeRecipe: preserve360 ? {
        schema: "quipsly-360-reframe-v1",
        projection: "equirectangular",
        aspectRatio: "16:9",
        stabilization: "source",
        horizonLock: true,
        keyframes: [],
      } : null,
    }, board ? `Saved the source-backed card to ${board.title}.` : "Saved an unfiled source-backed card.");
    if (next) {
      setTitle("");
      setSynopsis("");
      setNotes("");
      setInPoint(null);
      setOutPoint(null);
      setSelectedTagIds([]);
      setPreserve360(false);
    }
  }

  async function moveCard(cardId: string, direction: -1 | 1) {
    if (!selectedBoard) return;
    const current = selectedBoard.placements.map((placement) => placement.cardId);
    const index = current.indexOf(cardId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    await mutate({
      action: "reorder-board",
      boardId: selectedBoard.id,
      expectedRevision: selectedBoard.revision,
      orderedCardIds: current,
      clientRequestId: crypto.randomUUID(),
    }, "Saved the shared board order.");
  }

  const canMarkRange = Boolean(selectedAsset && /^(video|audio)\//.test(selectedAsset.mimeType ?? ""));
  const rangeReady = inPoint !== null && outPoint !== null && outPoint > inPoint && title.trim().length > 0;

  return (
    <main className="min-h-screen bg-[#f7f2e9] text-[#352a20]">
      <header className="border-b border-[#ddccb0] bg-[#fffdf8] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/nests/${encodeURIComponent(project.slug)}?view=media`} aria-label={`Return to ${project.name} media`} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[#ddccb0] bg-white text-[#684f32] hover:border-[#9f794c]"><ArrowLeft size={18} aria-hidden="true" /></Link>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a653d]">{project.name} · Source to story</p>
              <h1 className="truncate font-serif text-2xl font-black md:text-3xl">Find the moment. Build the story.</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">Originals remain unchanged</span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">{workspace.cards.length} cards</span>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-teal-900">{workspace.externalSources.length} vault source{workspace.externalSources.length === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">{workspace.boards.length} boards</span>
          </div>
        </div>
      </header>

      {(message || error) ? (
        <div className={`mx-auto mt-3 flex max-w-[1800px] items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-rose-200 bg-rose-50 text-rose-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`} role={error ? "alert" : "status"}>
          {error ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          <span>{error ?? message}</span>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1800px] gap-4 p-3 md:p-5 xl:grid-cols-[300px_minmax(480px,1fr)_440px]">
        <aside className="min-h-[420px] rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm" aria-label="Source library">
          <div className="flex items-center gap-2"><FolderOpen size={18} className="text-[#8a653d]" aria-hidden="true" /><h2 className="font-serif text-xl font-black">Source library</h2></div>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">Registered project media. Browsing does not copy, proxy, transcribe, or render anything.</p>
          <GoogleDriveSourcePicker projectSlug={project.slug} canWrite={canWrite} onAttached={refreshWorkspace} />
          <label className="relative mt-4 block"><span className="sr-only">Search source media</span><Search size={16} className="absolute left-3 top-3.5 text-[#927b5b]" aria-hidden="true" /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Search media…" className="min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white pl-9 pr-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sky-100" /></label>
          <div className="mt-3 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
            {filteredExternalSources.length ? <div className="pb-1"><p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#76522c]"><Cloud size={13} aria-hidden="true" />Connected vault</p>{filteredExternalSources.map((source) => { const health = externalSourceHealth(source.accessState, source.capabilityState); return <article key={source.id} className="mb-2 rounded-2xl border border-teal-200 bg-teal-50/60 p-3"><p className="line-clamp-2 text-sm font-black leading-5">{source.fileName}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-teal-900">{source.provider.replaceAll("-", " ")} · reference r{source.revision}</p><div className="mt-2 flex flex-wrap gap-1"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${health.tone}`}>{health.label}</span><span className="rounded-full border border-teal-200 bg-white px-2 py-1 text-[10px] font-bold text-teal-900">{formatBytes(source.sizeBytes)}</span></div><p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">{source.latestSourceRevision ? `${sourceStateLabel(source.latestSourceRevision.sourceState)} · ${source.latestSourceRevision.revisionKey}` : "No immutable provider revision retained yet."}</p><p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">External originals are not played directly here. Quipsly needs a verified collaboration proxy before range marking.</p></article>; })}</div> : null}
            {filteredAssets.map((asset) => {
              const selected = asset.id === selectedAsset?.id;
              return (
                <button key={asset.id} type="button" onClick={() => chooseAsset(asset.id)} aria-pressed={selected} className={`w-full rounded-2xl border p-3 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-sky-100 ${selected ? "border-[#60492f] bg-[#f2e4cb]" : "border-[#e6d9c2] bg-white hover:border-[#bd9d68]"}`}>
                  <span className="flex gap-3">
                    <span className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#e9dfcf] text-[#795a35]">
                      {asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <FileVideo2 size={22} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0"><span className="line-clamp-2 block text-sm font-black leading-5">{asset.filename}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-[#806a4d]">{asset.isProxy ? "Proxy" : "Registered source"} · {formatClock(asset.duration)}</span></span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1 text-[10px] font-bold text-[#806a4d]"><span>{formatBytes(asset.sizeBytes)}</span>{asset.resolution ? <span>· {asset.resolution}</span> : null}{asset.fps ? <span>· {asset.fps.toFixed(2)} fps</span> : null}</span>
                </button>
              );
            })}
            {!filteredAssets.length && !filteredExternalSources.length ? <p className="rounded-2xl border border-dashed border-[#d9c7a5] p-5 text-sm font-semibold text-[#765f40]">No attached source matches this search.</p> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Source viewer">
          <div className="overflow-hidden rounded-3xl border border-[#29231d] bg-[#171513] shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8bd91]">Viewer</p><h2 className="truncate font-serif text-xl font-black">{selectedAsset?.filename ?? "Choose a source"}</h2></div>
              {selectedAsset ? <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide">{selectedAsset.mimeType ?? "Unknown media"}</span> : null}
            </div>
            <div className="grid min-h-[360px] place-items-center bg-black md:min-h-[500px]">
              {!selectedAsset ? <p className="px-6 text-center font-semibold text-zinc-400">Attach or choose project media to begin.</p> : selectedAsset.mimeType?.startsWith("video/") ? (
                <video key={selectedAsset.id} ref={(node) => { mediaRef.current = node; }} src={selectedAsset.url} poster={selectedAsset.thumbnailUrl ?? undefined} controls preload="metadata" onTimeUpdate={stopAtSourceRangeBoundary} onEnded={() => { playbackBoundaryRef.current = null; }} className="max-h-[70vh] w-full" />
              ) : selectedAsset.mimeType?.startsWith("audio/") ? (
                <div className="w-full max-w-3xl px-6"><div className="mb-8 grid place-items-center"><Film size={64} className="text-[#d8bd91]" aria-hidden="true" /></div><audio key={selectedAsset.id} ref={(node) => { mediaRef.current = node; }} src={selectedAsset.url} controls preload="metadata" onTimeUpdate={stopAtSourceRangeBoundary} onEnded={() => { playbackBoundaryRef.current = null; }} className="w-full" /></div>
              ) : selectedAsset.mimeType?.startsWith("image/") ? (
                <img src={selectedAsset.url} alt={selectedAsset.filename} className="max-h-[70vh] max-w-full object-contain" />
              ) : <p className="px-6 text-center font-semibold text-zinc-400">This source can be organized, but range playback is not available for its media type.</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Immutable source range</p><h2 className="mt-1 font-serif text-2xl font-black">Mark the useful moment</h2></div>
              <p className="max-w-md text-xs font-semibold leading-5 text-[#765f40]">I and O set source-clock boundaries. The card can move later without changing this range.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={!canWrite || !canMarkRange} onClick={() => mediaRef.current && setInPoint(mediaRef.current.currentTime)} className="min-h-16 rounded-2xl border border-sky-200 bg-sky-50 px-4 text-left disabled:cursor-not-allowed disabled:opacity-45"><span className="text-[10px] font-black uppercase tracking-wide text-sky-800">In point · I</span><span className="mt-1 block font-mono text-xl font-black">{formatClock(inPoint)}</span></button>
              <button type="button" disabled={!canWrite || !canMarkRange} onClick={() => mediaRef.current && setOutPoint(mediaRef.current.currentTime)} className="min-h-16 rounded-2xl border border-orange-200 bg-orange-50 px-4 text-left disabled:cursor-not-allowed disabled:opacity-45"><span className="text-[10px] font-black uppercase tracking-wide text-orange-800">Out point · O</span><span className="mt-1 block font-mono text-xl font-black">{formatClock(outPoint)}</span></button>
            </div>
            {inPoint !== null && outPoint !== null ? <p className={`mt-3 text-xs font-black ${outPoint > inPoint ? "text-emerald-800" : "text-rose-800"}`}>{outPoint > inPoint ? `${(outPoint - inPoint).toFixed(2)} seconds selected` : "The out point must be after the in point."}</p> : null}
          </div>

          <div className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center gap-2"><Clapperboard size={19} className="text-[#8a653d]" aria-hidden="true" /><h2 className="font-serif text-2xl font-black">Write the card</h2></div>
            {!canWrite ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">Viewer access preserves playback and board reading. An Owner or Editor can create or revise cards.</p> : (
              <div className="mt-4 grid gap-4">
                <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Card title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="What happens in this moment?" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sky-100" /></label>
                <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Synopsis</span><textarea value={synopsis} onChange={(event) => setSynopsis(event.target.value)} maxLength={10000} rows={3} placeholder="The concise Scrivener-style card summary…" className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6 outline-none focus-visible:ring-4 focus-visible:ring-sky-100" /></label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Story purpose</span><select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold">{storyCardPurposes.map((value) => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
                  <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Section / beat</span><input value={groupKey} onChange={(event) => setGroupKey(event.target.value)} maxLength={60} placeholder="Cold open, Act 1…" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold" /></label>
                  <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Board</span><select value={selectedBoard?.id ?? ""} onChange={(event) => setSelectedBoardId(event.target.value || null)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"><option value="">Unfiled card</option>{workspace.boards.map((board) => <option key={board.id} value={board.id}>{board.title} · r{board.revision}</option>)}</select></label>
                </div>
                <label><span className="text-xs font-black uppercase tracking-wide text-[#76522c]">Working notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={50000} rows={3} placeholder="Writing, edit, camera, research, or collaboration notes…" className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6" /></label>
                {tags.length ? <fieldset><legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-[#76522c]"><Tags size={14} aria-hidden="true" />Project tags</legend><div className="mt-2 flex flex-wrap gap-2">{tags.map((tag) => { const active = selectedTagIds.includes(tag.id); return <button key={tag.id} type="button" aria-pressed={active} onClick={() => setSelectedTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`min-h-11 rounded-full border px-3 text-xs font-black ${active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-950"}`}>#{tag.label}</button>; })}</div></fieldset> : null}
                <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3"><input type="checkbox" checked={preserve360} onChange={(event) => setPreserve360(event.target.checked)} className="h-5 w-5" /><Rotate3d size={18} className="text-violet-800" aria-hidden="true" /><span><span className="block text-sm font-black text-violet-950">This range uses 360° source intent</span><span className="block text-xs font-semibold text-violet-900">Preserve the full sphere and an empty, non-destructive reframe recipe. View keyframes come later; this does not claim a reframed render exists.</span></span></label>
                <button type="button" disabled={!rangeReady || pending || !selectedAsset} onClick={() => void createCard()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{pending ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}Save source-backed card</button>
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-4" aria-label="Story board">
          <section className="rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm">
            <div className="flex items-center gap-2"><LayoutGrid size={19} className="text-[#8a653d]" aria-hidden="true" /><h2 className="font-serif text-2xl font-black">Story board</h2></div>
            {workspace.boards.length ? <div className="mt-3"><label className="text-xs font-black uppercase tracking-wide text-[#76522c]">Active board<select value={selectedBoard?.id ?? ""} onChange={(event) => { setSelectedBoardId(event.target.value); if (selectedAsset) window.history.replaceState(null, "", sourceHref(project.slug, selectedAsset.id, event.target.value)); }} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold">{workspace.boards.map((board) => <option key={board.id} value={board.id}>{board.title} · revision {board.revision}</option>)}</select></label>{selectedBoard?.description ? <p className="mt-3 text-sm font-semibold leading-6 text-[#765f40]">{selectedBoard.description}</p> : null}</div> : null}
            {canWrite ? <details className="mt-3 rounded-2xl border border-dashed border-[#cdb993] bg-white p-3" open={!workspace.boards.length}><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]"><Plus size={14} className="mr-1 inline" aria-hidden="true" />Create a board deliberately</summary><div className="mt-3 grid gap-3"><input value={boardTitle} onChange={(event) => setBoardTitle(event.target.value)} maxLength={200} placeholder="Board title" className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold" /><textarea value={boardDescription} onChange={(event) => setBoardDescription(event.target.value)} maxLength={10000} rows={2} placeholder="What story or output is this board shaping?" className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold" /><select value={boardEpisodeId} onChange={(event) => setBoardEpisodeId(event.target.value)} className="min-h-11 rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-semibold"><option value="">General project board</option>{episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title} · {episode.status}</option>)}</select><button type="button" disabled={pending || !boardTitle.trim()} onClick={() => void createBoard()} className="min-h-11 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45">Create revisioned board</button></div></details> : null}
          </section>

          {selectedBoard ? (
            <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Shared arrangement · r{selectedBoard.revision}</p><h2 className="font-serif text-xl font-black">{selectedBoard.placements.length} placed card{selectedBoard.placements.length === 1 ? "" : "s"}</h2></div><span className="text-[10px] font-bold uppercase tracking-wide text-[#806a4d]">Up/down is keyboard-safe ordering</span></div>
              <div className="mt-4 space-y-3">
                {selectedBoard.placements.map((placement, index) => (
                  <article key={placement.id} className="rounded-2xl border border-[#e2d2b6] bg-[#fffaf0] p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">{boardGroupLabel(placement.groupKey)} · {placement.card.purpose.replaceAll("-", " ")}</p><h3 className="mt-1 font-serif text-lg font-black leading-snug">{placement.card.title}</h3></div>{canWrite ? <div className="flex shrink-0 gap-1"><button type="button" disabled={pending || index === 0} onClick={() => void moveCard(placement.cardId, -1)} aria-label={`Move ${placement.card.title} earlier`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowUp size={16} aria-hidden="true" /></button><button type="button" disabled={pending || index === selectedBoard.placements.length - 1} onClick={() => void moveCard(placement.cardId, 1)} aria-label={`Move ${placement.card.title} later`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowDown size={16} aria-hidden="true" /></button></div> : null}</div>
                    {placement.card.synopsis ? <p className="mt-2 text-sm font-semibold leading-6 text-[#715f48]">{placement.card.synopsis}</p> : null}
                    {placement.card.sourceRange ? <button type="button" onClick={() => { const range = placement.card.sourceRange; const asset = range?.sourceRevision.mediaAsset; if (asset && range) playSourceRange(asset.id, range.startSeconds, range.endSeconds); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-950"><Play size={14} aria-hidden="true" />{formatClock(placement.card.sourceRange.startSeconds)}–{formatClock(placement.card.sourceRange.endSeconds)}</button> : null}
                    <div className="mt-3 flex flex-wrap gap-1">{placement.card.tags.map((tag) => <span key={tag.id} className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-bold text-sky-900">#{tag.label}</span>)}<span className="rounded-full border border-[#ded0b7] bg-white px-2 py-1 text-[10px] font-bold text-[#765f40]">{placement.card.status.replaceAll("-", " ")}</span>{placement.card.sourceRange?.reframeRecipe ? <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-900">360 recipe</span> : null}</div>
                    {placement.card.sourceRange ? <p className="mt-3 text-[10px] font-bold leading-4 text-[#806a4d]">{sourceStateLabel(placement.card.sourceRange.sourceRevision.sourceState)} · selector {placement.card.sourceRange.selectorSha256.slice(0, 10)}…</p> : null}
                    {canWrite ? <SourceRepairEditor card={placement.card} assets={initialAssets} selectedAsset={selectedAsset} viewerInPoint={inPoint} viewerOutPoint={outPoint} pending={pending} mutate={mutate} /> : null}
                    {canWrite ? <StoryCardEditor card={placement.card} tags={tags} pending={pending} mutate={mutate} /> : null}
                  </article>
                ))}
                {!selectedBoard.placements.length ? <div className="rounded-2xl border border-dashed border-[#d9c7a5] p-6 text-center"><Clapperboard className="mx-auto text-[#9a7b55]" aria-hidden="true" /><p className="mt-3 font-serif text-xl font-black">This board is ready for its first real select.</p><p className="mt-2 text-sm font-semibold text-[#765f40]">Mark an exact source range, write the card, and save it to this board.</p></div> : null}
              </div>
            </section>
          ) : null}

          {unplacedCards.length ? <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Unfiled source cards</p><div className="mt-3 space-y-2">{unplacedCards.map((card) => <article key={card.id} className="rounded-xl border border-[#e2d2b6] p-3"><p className="font-black">{card.title}</p>{card.sourceRange ? <button type="button" onClick={() => { const range = card.sourceRange; const asset = range?.sourceRevision.mediaAsset; if (asset && range) playSourceRange(asset.id, range.startSeconds, range.endSeconds); }} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-black text-sky-900"><Clock3 size={14} aria-hidden="true" />{formatClock(card.sourceRange.startSeconds)}–{formatClock(card.sourceRange.endSeconds)}</button> : null}</article>)}</div></section> : null}
        </aside>
      </div>
    </main>
  );
}

function SourceRepairEditor({
  card,
  assets,
  selectedAsset,
  viewerInPoint,
  viewerOutPoint,
  pending,
  mutate,
}: {
  card: SourceStoryCard;
  assets: Asset[];
  selectedAsset: Asset | null;
  viewerInPoint: number | null;
  viewerOutPoint: number | null;
  pending: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<SourceStoryWorkspace | null>;
}) {
  const range = card.sourceRange;
  const currentAsset = range?.sourceRevision.mediaAsset ?? null;
  const [assetId, setAssetId] = useState(currentAsset?.id ?? "");
  const [startSeconds, setStartSeconds] = useState(range?.startSeconds ?? 0);
  const [endSeconds, setEndSeconds] = useState(range?.endSeconds ?? 0);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setAssetId(currentAsset?.id ?? "");
    setStartSeconds(range?.startSeconds ?? 0);
    setEndSeconds(range?.endSeconds ?? 0);
    setReason("");
  }, [card.revision, currentAsset?.id, range?.endSeconds, range?.startSeconds]);

  if (!range || !currentAsset) return null;
  const exactCurrentSelection = assetId === currentAsset.id
    && startSeconds === range.startSeconds
    && endSeconds === range.endSeconds;
  const canSubmit = Boolean(assetId && reason.trim() && Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds - startSeconds >= 0.05);
  const rebind = (input: { replacementMediaAssetId: string; startSeconds: number; endSeconds: number; reason: string; preserveRecipe: boolean }, message: string) => mutate({
    action: "rebind-card-source",
    cardId: card.id,
    expectedRevision: card.revision,
    expectedSourceRangeId: range.id,
    replacementMediaAssetId: input.replacementMediaAssetId,
    clientRequestId: crypto.randomUUID(),
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    reason: input.reason,
    reframeRecipe: input.preserveRecipe ? range.reframeRecipe : null,
  }, message);

  return (
    <div className="mt-3">
      {range.sourceRevision.sourceState === "identity-unverified" ? (
        <button type="button" disabled={pending} onClick={() => void rebind({ replacementMediaAssetId: currentAsset.id, startSeconds: range.startSeconds, endSeconds: range.endSeconds, reason: "Rebind after exact-source verification policy update.", preserveRecipe: true }, `Rechecked ${card.title} against the exact registered source and preserved its prior source receipt.`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-950 disabled:opacity-45"><Link2 size={15} aria-hidden="true" />Re-check exact registered source</button>
      ) : null}
      <details className="mt-2 rounded-xl border border-dashed border-[#d4c09e] bg-white p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">Replace or relink source…</summary>
        <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">This creates a new immutable source range and one card revision. It keeps the card’s writing, tags, board position, and every prior source receipt.</p>
        <div className="mt-3 grid gap-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Replacement registered source<select value={assetId} onChange={(event) => setAssetId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold">{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
          {selectedAsset && viewerInPoint !== null && viewerOutPoint !== null && viewerOutPoint > viewerInPoint ? <button type="button" onClick={() => { setAssetId(selectedAsset.id); setStartSeconds(viewerInPoint); setEndSeconds(viewerOutPoint); }} className="min-h-11 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-950">Load current viewer range · {formatClock(viewerInPoint)}–{formatClock(viewerOutPoint)}</button> : null}
          <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Source in<input type="number" min="0" step="0.001" value={startSeconds} onChange={(event) => setStartSeconds(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 font-mono text-xs font-bold" /></label><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Source out<input type="number" min="0" step="0.001" value={endSeconds} onChange={(event) => setEndSeconds(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 font-mono text-xs font-bold" /></label></div>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Why is the source changing?<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={2} placeholder="Corrected file, exact bytes verified, relinked storage, revised select…" className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-xs font-semibold normal-case tracking-normal" /></label>
          <button type="button" disabled={pending || !canSubmit} onClick={() => void rebind({ replacementMediaAssetId: assetId, startSeconds, endSeconds, reason, preserveRecipe: exactCurrentSelection }, `Rebound ${card.title} to a new immutable source range as revision ${card.revision + 1}.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"><Link2 size={15} aria-hidden="true" />Create source rebind revision</button>
        </div>
      </details>
    </div>
  );
}

function StoryCardEditor({
  card,
  tags,
  pending,
  mutate,
}: {
  card: SourceStoryCard;
  tags: Tag[];
  pending: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<SourceStoryWorkspace | null>;
}) {
  const [title, setTitle] = useState(card.title);
  const [synopsis, setSynopsis] = useState(card.synopsis);
  const [notes, setNotes] = useState(card.notes);
  const [purpose, setPurpose] = useState(card.purpose);
  const [status, setStatus] = useState(card.status);
  const [tagIds, setTagIds] = useState(card.tags.map((tag) => tag.id));

  useEffect(() => {
    setTitle(card.title);
    setSynopsis(card.synopsis);
    setNotes(card.notes);
    setPurpose(card.purpose);
    setStatus(card.status);
    setTagIds(card.tags.map((tag) => tag.id));
  }, [card]);

  return (
    <details className="mt-3 rounded-xl border border-[#ded0b7] bg-white p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">Edit card · revision {card.revision}</summary>
      <div className="mt-3 grid gap-3">
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} aria-label="Card title" className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold" />
        <textarea value={synopsis} onChange={(event) => setSynopsis(event.target.value)} maxLength={10000} rows={2} aria-label="Card synopsis" className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold" />
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={50000} rows={2} aria-label="Card notes" className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold" />
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold">{storyCardPurposes.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold">{storyCardStatuses.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        {tags.length ? <div className="flex flex-wrap gap-1">{tags.map((tag) => { const active = tagIds.includes(tag.id); return <button key={tag.id} type="button" aria-pressed={active} onClick={() => setTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`min-h-11 rounded-full border px-3 text-[10px] font-bold ${active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-950"}`}>#{tag.label}</button>; })}</div> : null}
        <button type="button" disabled={pending || !title.trim()} onClick={() => void mutate({ action: "update-card", cardId: card.id, expectedRevision: card.revision, clientRequestId: crypto.randomUUID(), title, synopsis, notes, purpose, status, tagIds }, `Saved ${title} as card revision ${card.revision + 1}.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"><Save size={15} aria-hidden="true" />Save revision</button>
      </div>
    </details>
  );
}
