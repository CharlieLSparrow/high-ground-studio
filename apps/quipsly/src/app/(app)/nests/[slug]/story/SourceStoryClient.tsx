"use client";

import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  Clapperboard,
  Clock3,
  FileVideo2,
  Film,
  FolderOpen,
  LayoutGrid,
  ListPlus,
  Loader2,
  Link2,
  NotebookPen,
  Play,
  Plus,
  Pencil,
  Rotate3d,
  Video,
  Save,
  Search,
  Tags,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpatialExecutorProbe, SpatialExecutorReadiness } from "@high-ground/quipsly-media-processing";

import { storyCardPurposes, storyCardStatuses, type StoryReframeKeyframe } from "@/lib/source-story-contract";

import { GoogleDriveSourcePicker } from "./GoogleDriveSourcePicker";
import { EquirectangularVideoViewer, type SpatialView } from "./EquirectangularVideoViewer";

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
    sourceSet: null | { id: string; kind: string; captureKey: string; displayName: string; identitySha256: string; completeness: string };
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
      collaborationProxy: MediaDerivative | null;
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
  sections: Array<{
    id: string;
    key: string;
    title: string;
    synopsis: string;
    sortOrder: number;
    revision: number;
    updatedAt: string;
    document: null | { id: string; stableId: string; title: string; updatedAt: string; blockCount: number };
  }>;
  placements: Array<{
    id: string;
    cardId: string;
    groupKey: string;
    laneKey: string;
    sortOrder: number;
    card: SourceStoryCard;
  }>;
};

type SourceStoryBoardPlacement = SourceStoryBoard["placements"][number];

type SourceStoryWorkspace = {
  schema: "quipsly-source-story-v1";
  episodes: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string;
    timelineFingerprint: string;
    timelineDurationSeconds: number;
    clipCount: number;
  }>;
  timelinePlacements: Array<{
    id: string;
    episodeProductionId: string;
    cardId: string;
    sourceRangeId: string;
    originBoardId: string | null;
    originBoardPlacementId: string | null;
    clipId: string;
    trackId: string;
    episodeStartSeconds: number;
    durationSeconds: number;
    status: string;
    revision: number;
    timelineFingerprintBeforeSha256: string;
    timelineFingerprintAfterSha256: string;
    createdByEmail: string;
    withdrawnAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  spatialRenderJobs: Array<{
    id: string;
    status: string;
    timelinePlacementId: string;
    timelineFingerprintSha256: string;
    profile: string;
    error: string | null;
    requestedByEmail: string | null;
    createdAt: string;
    updatedAt: string;
    derivative: MediaDerivative | null;
  }>;
  sourceSets: MediaSourceSet[];
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
      durationSeconds: number | null;
      widthPixels: number | null;
      heightPixels: number | null;
      framesPerSecond: number | null;
      collaborationProxy: MediaDerivative | null;
      proxyJob: null | { id: string; status: string; failureCode: string | null; updatedAt: string };
    };
  }>;
  cards: SourceStoryCard[];
  boards: SourceStoryBoard[];
};

type MediaSourceSet = {
  id: string;
  kind: string;
  captureKey: string;
  displayName: string;
  identitySha256: string;
  completeness: string;
  createdAt: string;
  sourceClockRevision: {
    id: string;
    durationSeconds: number | null;
    widthPixels: number | null;
    heightPixels: number | null;
    framesPerSecond: number | null;
    externalReference: null | { id: string; fileName: string; provider: string };
    collaborationProxy: MediaDerivative | null;
    spatialStitchMaster: MediaDerivative | null;
  };
  members: Array<{
    id: string;
    role: string;
    ordinal: number;
    requiredForRender: boolean;
    memberIdentitySha256: string;
    sourceRevision: {
      id: string;
      contentSha256: string | null;
      sizeBytes: string | null;
      durationSeconds: number | null;
      sourceState: string;
      externalReference: null | { id: string; provider: string; fileName: string; mimeType: string | null; accessState: string };
    };
  }>;
};

type MediaDerivative = {
  id: string;
  kind: string;
  profile: string;
  sizeBytes: string;
  mimeType: string;
  durationSeconds: number | null;
  widthPixels: number | null;
  heightPixels: number | null;
  framesPerSecond: number | null;
  createdAt: string;
  playbackUrl: string;
};

type ViewerSource = {
  key: string;
  kind: "asset" | "external" | "source-set";
  id: string;
  filename: string;
  url: string;
  mimeType: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  is360: boolean;
  sourceRevisionId?: string;
  externalReferenceId?: string;
  sourceSetId?: string;
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  currentRevision?: number | null;
  workspace?: SourceStoryWorkspace;
  operation?: { document?: { id?: string } };
};

type SpatialRenderReadinessReport = {
  checkedAt: string;
  probe: SpatialExecutorProbe;
  readiness: SpatialExecutorReadiness;
  executorContract: {
    stitch: "insta360-mediasdk-v3";
    reframe: "ffmpeg-v360-frame-commanded-v1";
    automaticSdkPlatforms: ["linux-x64", "windows-x64"];
  };
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
  if (accessState === "available" && capabilityState === "downloadable") return { label: "Source access verified", tone: "border-emerald-200 bg-emerald-50 text-emerald-950" };
  if (capabilityState === "metadata-only") return { label: "Metadata only · proxy and render held", tone: "border-amber-200 bg-amber-50 text-amber-950" };
  if (capabilityState === "needs-reauth" || accessState === "revoked") return { label: "Reconnect source access", tone: "border-rose-200 bg-rose-50 text-rose-950" };
  return { label: `${accessState.replaceAll("-", " ")} · ${capabilityState.replaceAll("-", " ")}`, tone: "border-zinc-200 bg-zinc-50 text-zinc-800" };
}

function boardGroupLabel(value: string) {
  if (value === "unassigned") return "Unassigned story beat";
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function boardKeyFromLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function sourceHref(projectSlug: string, source: { kind: "asset" | "external" | "source-set"; id: string } | null, boardId: string | null) {
  const params = new URLSearchParams();
  if (source?.kind === "asset") params.set("asset", source.id);
  if (source?.kind === "external") params.set("external", source.id);
  if (source?.kind === "source-set") params.set("set", source.id);
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
  spatialRenderReadiness,
  initialAssetId,
  initialExternalReferenceId,
  initialSourceSetId,
  initialBoardId,
}: {
  project: { id: string; slug: string; name: string };
  canWrite: boolean;
  initialAssets: Asset[];
  tags: Tag[];
  episodes: Episode[];
  initialWorkspace: SourceStoryWorkspace;
  spatialRenderReadiness: SpatialRenderReadinessReport;
  initialAssetId: string | null;
  initialExternalReferenceId: string | null;
  initialSourceSetId: string | null;
  initialBoardId: string | null;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const pendingPlaybackRef = useRef<{ sourceKey: string; startSeconds: number; endSeconds: number } | null>(null);
  const playbackBoundaryRef = useRef<number | null>(null);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [selectedExternalReferenceId, setSelectedExternalReferenceId] = useState<string | null>(initialExternalReferenceId);
  const [selectedSourceSetId, setSelectedSourceSetId] = useState<string | null>(initialSourceSetId);
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
  const [preserve360, setPreserve360] = useState(Boolean(initialSourceSetId));
  const [spatialView, setSpatialView] = useState<SpatialView>({ panDegrees: 0, tiltDegrees: 0, fieldOfViewDegrees: 75 });
  const [reframeKeyframes, setReframeKeyframes] = useState<StoryReframeKeyframe[]>([]);
  const [reframeAspectRatio, setReframeAspectRatio] = useState<"16:9" | "9:16" | "1:1" | "4:5">("16:9");
  const [boardTitle, setBoardTitle] = useState("Main story");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardEpisodeId, setBoardEpisodeId] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionSynopsis, setSectionSynopsis] = useState("");
  const [boardView, setBoardView] = useState<"cards" | "outline">("cards");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = initialAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedExternalSource = workspace.externalSources.find((source) => source.id === selectedExternalReferenceId) ?? null;
  const selectedSourceSet = workspace.sourceSets.find((sourceSet) => sourceSet.id === selectedSourceSetId) ?? null;
  const selectedExternalProxy = selectedExternalSource?.latestSourceRevision?.collaborationProxy ?? null;
  const selectedSourceSetProxy = selectedSourceSet?.sourceClockRevision.collaborationProxy ?? null;
  const selectedViewerSource: ViewerSource | null = selectedSourceSet && selectedSourceSetProxy && selectedSourceSet.sourceClockRevision.externalReference ? {
    key: `source-set:${selectedSourceSet.id}`,
    kind: "source-set",
    id: selectedSourceSet.id,
    filename: selectedSourceSet.displayName,
    url: selectedSourceSetProxy.playbackUrl,
    mimeType: selectedSourceSetProxy.mimeType,
    duration: selectedSourceSetProxy.durationSeconds ?? selectedSourceSet.sourceClockRevision.durationSeconds,
    thumbnailUrl: null,
    is360: selectedSourceSet.kind === "insta360-360",
    sourceRevisionId: selectedSourceSet.sourceClockRevision.id,
    externalReferenceId: selectedSourceSet.sourceClockRevision.externalReference.id,
    sourceSetId: selectedSourceSet.id,
  } : selectedExternalSource && selectedExternalProxy ? {
    key: `external:${selectedExternalSource.id}`,
    kind: "external",
    id: selectedExternalSource.id,
    filename: selectedExternalSource.fileName,
    url: selectedExternalProxy.playbackUrl,
    mimeType: selectedExternalProxy.mimeType,
    duration: selectedExternalProxy.durationSeconds,
    thumbnailUrl: null,
    is360: false,
    sourceRevisionId: selectedExternalSource.latestSourceRevision?.id,
    externalReferenceId: selectedExternalSource.id,
  } : selectedAsset ? {
    key: `asset:${selectedAsset.id}`,
    kind: "asset",
    id: selectedAsset.id,
    filename: selectedAsset.filename,
    url: selectedAsset.url,
    mimeType: selectedAsset.mimeType,
    duration: selectedAsset.duration,
    thumbnailUrl: selectedAsset.thumbnailUrl,
    is360: false,
  } : null;
  const selectedBoard = workspace.boards.find((board) => board.id === selectedBoardId) ?? workspace.boards[0] ?? null;
  const filteredAssets = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    return query
      ? initialAssets.filter((asset) => `${asset.filename} ${asset.mimeType ?? ""} ${asset.resolution ?? ""}`.toLowerCase().includes(query))
      : initialAssets;
  }, [initialAssets, sourceQuery]);
  const packagedRevisionIds = useMemo(() => new Set(
    workspace.sourceSets.flatMap((sourceSet) => sourceSet.members.map((member) => member.sourceRevision.id)),
  ), [workspace.sourceSets]);
  const filteredExternalSources = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    const standaloneSources = workspace.externalSources.filter((source) => !source.latestSourceRevision || !packagedRevisionIds.has(source.latestSourceRevision.id));
    return query
      ? standaloneSources.filter((source) => `${source.fileName} ${source.provider} ${source.mimeType ?? ""}`.toLowerCase().includes(query))
      : standaloneSources;
  }, [packagedRevisionIds, sourceQuery, workspace.externalSources]);
  const filteredSourceSets = useMemo(() => {
    const query = sourceQuery.trim().toLowerCase();
    return query
      ? workspace.sourceSets.filter((sourceSet) => `${sourceSet.displayName} ${sourceSet.captureKey} ${sourceSet.kind} ${sourceSet.members.map((member) => member.sourceRevision.externalReference?.fileName ?? "").join(" ")}`.toLowerCase().includes(query))
      : workspace.sourceSets;
  }, [sourceQuery, workspace.sourceSets]);
  const selectedBoardCardIds = useMemo(() => new Set(selectedBoard?.placements.map((placement) => placement.cardId) ?? []), [selectedBoard]);
  const cardsAvailableForBoard = workspace.cards.filter((card) => !selectedBoardCardIds.has(card.id));
  const boardGroups = useMemo(() => {
    if (!selectedBoard) return [];
    const groups = new Map(selectedBoard.sections.map((section) => [section.key, { section, placements: [] as SourceStoryBoardPlacement[] }]));
    for (const placement of selectedBoard.placements) {
      const group = groups.get(placement.groupKey) ?? {
        section: {
          id: `legacy-${placement.groupKey}`,
          key: placement.groupKey,
          title: boardGroupLabel(placement.groupKey),
          synopsis: "",
          sortOrder: placement.sortOrder,
          revision: 1,
          updatedAt: selectedBoard.updatedAt,
          document: null,
        },
        placements: [],
      };
      group.placements.push(placement);
      groups.set(placement.groupKey, group);
    }
    return [...groups.entries()]
      .map(([groupKey, group]) => ({ groupKey, ...group }))
      .sort((left, right) => left.section.sortOrder - right.section.sortOrder || left.section.title.localeCompare(right.section.title));
  }, [selectedBoard]);
  const boardGroupKeys = useMemo(() => boardGroups.map((group) => group.groupKey), [boardGroups]);
  const spatialStatus = spatialRenderReadiness.readiness.status;

  useEffect(() => {
    if (!selectedBoardId && workspace.boards[0]) setSelectedBoardId(workspace.boards[0].id);
  }, [selectedBoardId, workspace.boards]);

  useEffect(() => {
    const pendingPlayback = pendingPlaybackRef.current;
    const media = mediaRef.current;
    if (!pendingPlayback || pendingPlayback.sourceKey !== selectedViewerSource?.key || !media) return;
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
  }, [selectedViewerSource?.key]);

  useEffect(() => {
    const waiting = workspace.externalSources.some((source) => ["queued", "processing"].includes(source.latestSourceRevision?.proxyJob?.status ?? ""));
    if (!waiting) return;
    const timer = window.setInterval(() => { void refreshWorkspace().catch(() => undefined); }, 2_000);
    return () => window.clearInterval(timer);
  }, [workspace.externalSources]);

  useEffect(() => {
    const waiting = workspace.spatialRenderJobs.some((job) => ["queued", "processing"].includes(job.status));
    if (!waiting) return;
    const timer = window.setInterval(() => { void refreshWorkspace().catch(() => undefined); }, 2_000);
    return () => window.clearInterval(timer);
  }, [workspace.spatialRenderJobs]);

  useEffect(() => {
    if (pending) return;
    const ready = workspace.spatialRenderJobs.find((job) => job.status === "output-ready");
    if (!ready) return;
    void mutate({ action: "register-spatial-reframe", jobId: ready.id }, "Verified and attached the finished spatial render to its exact Episode placement.");
  }, [pending, workspace.spatialRenderJobs]);

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
    pendingPlayback: { sourceKey: string; startSeconds: number; endSeconds: number } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(assetId);
    setSelectedExternalReferenceId(null);
    setSelectedSourceSetId(null);
    setInPoint(null);
    setOutPoint(null);
    setMessage(null);
    setError(null);
    window.history.replaceState(null, "", sourceHref(project.slug, { kind: "asset", id: assetId }, selectedBoard?.id ?? null));
  }

  function chooseExternalSource(
    referenceId: string,
    pendingPlayback: { sourceKey: string; startSeconds: number; endSeconds: number } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(null);
    setSelectedExternalReferenceId(referenceId);
    setSelectedSourceSetId(null);
    setInPoint(null);
    setOutPoint(null);
    setMessage(null);
    setError(null);
    window.history.replaceState(null, "", sourceHref(project.slug, { kind: "external", id: referenceId }, selectedBoard?.id ?? null));
  }

  function chooseSourceSet(
    sourceSetId: string,
    pendingPlayback: { sourceKey: string; startSeconds: number; endSeconds: number } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(null);
    setSelectedExternalReferenceId(null);
    setSelectedSourceSetId(sourceSetId);
    setInPoint(null);
    setOutPoint(null);
    setPreserve360(true);
    setReframeKeyframes([]);
    setSpatialView({ panDegrees: 0, tiltDegrees: 0, fieldOfViewDegrees: 75 });
    setMessage(null);
    setError(null);
    window.history.replaceState(null, "", sourceHref(project.slug, { kind: "source-set", id: sourceSetId }, selectedBoard?.id ?? null));
  }

  function playSourceRange(source: { kind: "asset" | "external" | "source-set"; id: string }, startSeconds: number, endSeconds: number) {
    const sourceKey = `${source.kind}:${source.id}`;
    const playback = { sourceKey, startSeconds, endSeconds };
    if (selectedViewerSource?.key !== sourceKey || !mediaRef.current) {
      if (source.kind === "asset") chooseAsset(source.id, playback);
      else if (source.kind === "external") chooseExternalSource(source.id, playback);
      else chooseSourceSet(source.id, playback);
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
    if (!selectedViewerSource || inPoint === null || outPoint === null) return;
    const board = workspace.boards.find((candidate) => candidate.id === selectedBoardId) ?? null;
    const next = await mutate({
      action: "create-card",
      clientRequestId: crypto.randomUUID(),
      mediaAssetId: selectedViewerSource.kind === "asset" ? selectedViewerSource.id : null,
      sourceRevisionId: selectedViewerSource.kind !== "asset" ? selectedViewerSource.sourceRevisionId ?? null : null,
      sourceSetId: selectedViewerSource.kind === "source-set" ? selectedViewerSource.sourceSetId ?? null : null,
      externalReferenceId: selectedViewerSource.kind !== "asset" ? selectedViewerSource.externalReferenceId ?? null : null,
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
        aspectRatio: reframeAspectRatio,
        stabilization: "source",
        horizonLock: true,
        keyframes: reframeKeyframes,
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
      setReframeKeyframes([]);
    }
  }

  function captureReframeKeyframe() {
    const media = mediaRef.current;
    if (!media || inPoint === null || outPoint === null || media.currentTime < inPoint || media.currentTime > outPoint) {
      setError("Set an in and out point, then place the playhead inside that range before saving a camera view.");
      return;
    }
    const next: StoryReframeKeyframe = {
      sourceSeconds: Math.round(media.currentTime * 1_000_000) / 1_000_000,
      panDegrees: Math.round(spatialView.panDegrees * 1000) / 1000,
      tiltDegrees: Math.round(spatialView.tiltDegrees * 1000) / 1000,
      rollDegrees: 0,
      fieldOfViewDegrees: Math.round(spatialView.fieldOfViewDegrees * 1000) / 1000,
      interpolation: "ease",
    };
    setReframeKeyframes((current) => [...current.filter((keyframe) => Math.abs(keyframe.sourceSeconds - next.sourceSeconds) > 0.0005), next]
      .sort((left, right) => left.sourceSeconds - right.sourceSeconds));
    setPreserve360(true);
    setError(null);
    setMessage(`Saved a non-destructive camera view at ${formatClock(next.sourceSeconds)}. The source remains full 360°.`);
  }

  async function requestProxy(source: SourceStoryWorkspace["externalSources"][number], retryFailed = false) {
    if (!source.latestSourceRevision) return;
    await mutate({
      action: "request-external-proxy",
      referenceId: source.id,
      sourceRevisionId: source.latestSourceRevision.id,
      clientRequestId: crypto.randomUUID(),
      retryFailed,
    }, retryFailed ? `Retrying the verified proxy for ${source.fileName}.` : `Queued a verified proxy for ${source.fileName}.`);
  }

  async function moveCard(cardId: string, direction: -1 | 1) {
    if (!selectedBoard) return;
    const current = selectedBoard.placements.map(({ cardId: currentCardId, groupKey: currentGroupKey, laneKey }) => ({ cardId: currentCardId, groupKey: currentGroupKey, laneKey }));
    const index = current.findIndex((placement) => placement.cardId === cardId);
    if (index < 0) return;
    const groupKey = current[index]?.groupKey;
    const siblingIndexes = current.flatMap((placement, placementIndex) => placement.groupKey === groupKey ? [placementIndex] : []);
    const siblingIndex = siblingIndexes.indexOf(index);
    const target = siblingIndexes[siblingIndex + direction];
    if (target === undefined) return;
    [current[index], current[target]] = [current[target], current[index]];
    await arrangeBoard(current, "Saved the shared board order.");
  }

  async function arrangeBoard(placements: Array<{ cardId: string; groupKey: string; laneKey: string }>, successMessage: string) {
    if (!selectedBoard) return null;
    return mutate({
      action: "arrange-board",
      boardId: selectedBoard.id,
      expectedRevision: selectedBoard.revision,
      placements,
      clientRequestId: crypto.randomUUID(),
    }, successMessage);
  }

  async function createSection() {
    if (!selectedBoard || !sectionTitle.trim()) return;
    const next = await mutate({
      action: "create-board-section",
      boardId: selectedBoard.id,
      expectedBoardRevision: selectedBoard.revision,
      clientRequestId: crypto.randomUUID(),
      title: sectionTitle,
      synopsis: sectionSynopsis,
    }, `Added ${sectionTitle.trim()} to the shared binder without changing any source media.`);
    if (next) {
      setSectionTitle("");
      setSectionSynopsis("");
    }
  }

  async function updateSection(section: SourceStoryBoard["sections"][number], next: { title: string; synopsis: string }) {
    if (!selectedBoard) return;
    await mutate({
      action: "update-board-section",
      boardId: selectedBoard.id,
      sectionId: section.id,
      expectedRevision: section.revision,
      clientRequestId: crypto.randomUUID(),
      title: next.title,
      synopsis: next.synopsis,
    }, `Updated ${next.title.trim()} while preserving its cards, writing, and durable binder identity.`);
  }

  async function moveSection(sectionId: string, direction: -1 | 1) {
    if (!selectedBoard) return;
    const orderedSectionIds = boardGroups.map((group) => group.section.id);
    const index = orderedSectionIds.indexOf(sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedSectionIds.length) return;
    [orderedSectionIds[index], orderedSectionIds[target]] = [orderedSectionIds[target], orderedSectionIds[index]];
    await mutate({
      action: "arrange-board-sections",
      boardId: selectedBoard.id,
      expectedBoardRevision: selectedBoard.revision,
      clientRequestId: crypto.randomUUID(),
      orderedSectionIds,
    }, "Saved the shared binder order. Card order inside every section stayed intact.");
  }

  async function archiveSection(section: SourceStoryBoard["sections"][number]) {
    if (!selectedBoard) return;
    await mutate({
      action: "archive-board-section",
      boardId: selectedBoard.id,
      sectionId: section.id,
      expectedBoardRevision: selectedBoard.revision,
      expectedSectionRevision: section.revision,
      clientRequestId: crypto.randomUUID(),
    }, `Archived ${section.title}. Its writing, receipts, and history remain retained.`);
  }

  async function changeCardPlacement(cardId: string, next: { groupKey: string; laneKey: string }) {
    if (!selectedBoard) return;
    const placements = selectedBoard.placements.map((placement) => placement.cardId === cardId
      ? { cardId: placement.cardId, ...next }
      : { cardId: placement.cardId, groupKey: placement.groupKey, laneKey: placement.laneKey });
    await arrangeBoard(placements, `Moved the card to ${boardGroupLabel(next.groupKey)} · ${boardGroupLabel(next.laneKey)} without changing its source or writing.`);
  }

  async function unfileCard(cardId: string) {
    if (!selectedBoard) return;
    const placements = selectedBoard.placements
      .filter((placement) => placement.cardId !== cardId)
      .map((placement) => ({ cardId: placement.cardId, groupKey: placement.groupKey, laneKey: placement.laneKey }));
    await arrangeBoard(placements, "Removed the card from this board. The card, source range, tags, revisions, and Episode placements remain intact.");
  }

  async function fileCard(cardId: string, placement: { groupKey: string; laneKey: string }) {
    if (!selectedBoard) return;
    const placements = [
      ...selectedBoard.placements.map((current) => ({ cardId: current.cardId, groupKey: current.groupKey, laneKey: current.laneKey })),
      { cardId, ...placement },
    ];
    await arrangeBoard(placements, `Filed the source card in ${selectedBoard.title} without copying or changing it.`);
  }

  async function openSectionWriting(section: SourceStoryBoard["sections"][number]) {
    if (!selectedBoard) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/nests/${encodeURIComponent(project.slug)}/source-story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open-section-writing",
          boardId: selectedBoard.id,
          sectionKey: section.key,
          expectedRevision: section.revision,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.workspace) throw new Error(payload.error || "The section writing page could not be opened.");
      setWorkspace(payload.workspace);
      const documentId = payload.operation?.document?.id;
      if (!documentId) throw new Error("The section writing page was saved, but its document identity was not returned.");
      window.location.assign(storyWritingHref(project.slug, selectedBoard.id, section.key, documentId));
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The section writing page could not be opened.");
      setPending(false);
    }
  }

  const canMarkRange = Boolean(selectedViewerSource && /^(video|audio)\//.test(selectedViewerSource.mimeType ?? ""));
  const rangeReady = inPoint !== null && outPoint !== null && outPoint > inPoint && title.trim().length > 0;

  function cardPlayback(card: SourceStoryCard) {
    const range = card.sourceRange;
    if (!range) return null;
    if (range.sourceRevision.mediaAsset) return { kind: "asset" as const, id: range.sourceRevision.mediaAsset.id };
    if (range.sourceSet) return { kind: "source-set" as const, id: range.sourceSet.id };
    if (range.sourceRevision.externalReference && range.sourceRevision.collaborationProxy) {
      return { kind: "external" as const, id: range.sourceRevision.externalReference.id };
    }
    return null;
  }

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
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-fuchsia-900">{workspace.sourceSets.length} camera set{workspace.sourceSets.length === 1 ? "" : "s"}</span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">{workspace.boards.length} boards</span>
            <span className={`rounded-full border px-3 py-2 ${spatialStatus === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : spatialStatus === "manual-stitch-handoff" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}>360 render · {spatialStatus === "ready" ? "automatic" : spatialStatus === "manual-stitch-handoff" ? "Studio handoff" : "blocked"}</span>
          </div>
        </div>
      </header>

      <section className="border-b border-[#ddccb0] bg-[#fffaf0] px-4 py-3 md:px-6" aria-label="Spatial render readiness">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
          <div className="flex min-w-0 gap-3">
            {spatialStatus === "ready" ? <Check className="mt-0.5 shrink-0 text-emerald-700" size={18} aria-hidden="true" /> : <Rotate3d className="mt-0.5 shrink-0 text-amber-700" size={18} aria-hidden="true" />}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a653d]">Exact-source 360 render</p>
              <p className="mt-1 text-sm font-black text-[#3d3122]">{spatialStatus === "ready" ? "Official stitch and Quipsly reframe engines are ready." : spatialStatus === "manual-stitch-handoff" ? "Quipsly can reframe automatically after one reviewed Insta360 Studio master export." : "The saved 360 edit remains safe, but a render engine needs attention."}</p>
              <p className="mt-1 max-w-4xl text-xs font-semibold leading-5 text-[#765f40]">{spatialRenderReadiness.readiness.nextAction} The LRV browse proxy is never accepted as final render media.</p>
            </div>
          </div>
          <details className="max-w-xl text-xs font-semibold text-[#684f32]">
            <summary className="cursor-pointer min-h-11 rounded-xl border border-[#ddccb0] px-3 py-3 text-[10px] font-black uppercase tracking-wide">Engine details</summary>
            <div className="mt-2 rounded-xl bg-[#f7f2e9] p-3 leading-5">
              <p>Insta360 Studio: {spatialRenderReadiness.probe.insta360Studio.available ? spatialRenderReadiness.probe.insta360Studio.version ?? "installed" : "not installed"}</p>
              <p>Official automatic MediaSDK adapter: {spatialRenderReadiness.readiness.automaticStitchReady ? "ready" : "not ready on this executor"}</p>
              <p>Quipsly FFmpeg v360 reframe: {spatialRenderReadiness.readiness.automaticReframeReady ? spatialRenderReadiness.probe.ffmpeg.version ?? "ready" : "not ready"}</p>
              {spatialRenderReadiness.readiness.blockers.length ? <ul className="mt-2 list-disc pl-5">{spatialRenderReadiness.readiness.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul> : null}
            </div>
          </details>
        </div>
      </section>

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
            {filteredSourceSets.length ? <div className="pb-1"><p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-900"><Rotate3d size={13} aria-hidden="true" />360° camera sets</p>{filteredSourceSets.map((sourceSet) => { const selected = sourceSet.id === selectedSourceSet?.id; const proxy = sourceSet.sourceClockRevision.collaborationProxy; const stitchMaster = sourceSet.sourceClockRevision.spatialStitchMaster; const originalCount = sourceSet.members.filter((member) => member.role.includes("original")).length; return <article key={sourceSet.id} className={`mb-2 rounded-2xl border p-3 ${selected ? "border-fuchsia-800 bg-fuchsia-100" : "border-fuchsia-200 bg-fuchsia-50/60"}`}><button type="button" disabled={!proxy} onClick={() => chooseSourceSet(sourceSet.id)} aria-pressed={selected} className="w-full text-left disabled:cursor-not-allowed"><p className="line-clamp-2 text-sm font-black leading-5">{sourceSet.displayName}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-fuchsia-900">{sourceSet.kind.replaceAll("-", " ")} · {sourceSet.completeness}</p><div className="mt-2 flex flex-wrap gap-1"><span className="rounded-full border border-fuchsia-200 bg-white px-2 py-1 text-[10px] font-black text-fuchsia-950">{originalCount} exact original{originalCount === 1 ? "" : "s"}</span><span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-950">{proxy ? `Spatial browse ready · ${formatClock(proxy.durationSeconds)}` : "Browse proxy required"}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${stitchMaster ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{stitchMaster ? `5.7K render master verified · ${formatClock(stitchMaster.durationSeconds)}` : "5.7K render master not registered"}</span></div><p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">Set {sourceSet.identitySha256.slice(0, 10)}… · clocked by {sourceSet.sourceClockRevision.externalReference?.fileName ?? "retained source"}</p></button><details className="mt-2 rounded-xl border border-fuchsia-200 bg-white/70 px-3 py-2 text-[10px]"><summary className="cursor-pointer font-black uppercase tracking-wide text-fuchsia-950">Package contents · {sourceSet.members.length}</summary><ul className="mt-2 space-y-1 text-[#765f40]">{sourceSet.members.map((member) => <li key={member.id} className="break-all"><span className="font-black text-fuchsia-950">{member.role.replaceAll("-", " ")}</span> · {member.sourceRevision.externalReference?.fileName ?? member.sourceRevision.id}{member.requiredForRender ? " · render required" : " · browse only"}</li>)}</ul></details>{proxy ? <button type="button" onClick={() => chooseSourceSet(sourceSet.id)} className="mt-2 min-h-11 w-full rounded-xl bg-fuchsia-900 px-3 text-xs font-black text-white">Look around and mark selects</button> : null}</article>; })}</div> : null}
            {filteredExternalSources.length ? <div className="pb-1"><p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#76522c]"><Cloud size={13} aria-hidden="true" />Connected vault</p>{filteredExternalSources.map((source) => { const health = externalSourceHealth(source.accessState, source.capabilityState); const revision = source.latestSourceRevision; const proxy = revision?.collaborationProxy; const job = revision?.proxyJob; const selected = source.id === selectedExternalSource?.id; return <article key={source.id} className={`mb-2 rounded-2xl border p-3 ${selected ? "border-teal-800 bg-teal-100" : "border-teal-200 bg-teal-50/60"}`}><button type="button" onClick={() => chooseExternalSource(source.id)} aria-pressed={selected} className="w-full text-left"><p className="line-clamp-2 text-sm font-black leading-5">{source.fileName}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-teal-900">{source.provider.replaceAll("-", " ")} · reference r{source.revision}</p><div className="mt-2 flex flex-wrap gap-1"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${health.tone}`}>{health.label}</span><span className="rounded-full border border-teal-200 bg-white px-2 py-1 text-[10px] font-bold text-teal-900">{formatBytes(source.sizeBytes)}</span>{proxy ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-950">Proxy ready · {formatClock(proxy.durationSeconds)}</span> : null}</div><p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">{revision ? `${sourceStateLabel(revision.sourceState)} · ${revision.revisionKey}` : "No immutable provider revision retained yet."}</p></button>{proxy ? <button type="button" onClick={() => chooseExternalSource(source.id)} className="mt-2 min-h-11 w-full rounded-xl bg-teal-900 px-3 text-xs font-black text-white">Open verified proxy</button> : job && ["queued", "processing"].includes(job.status) ? <p role="status" className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-black text-sky-950"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{job.status === "processing" ? "Generating verified proxy…" : "Proxy queued on this Mac…"}</p> : job?.status === "failed" ? <button type="button" disabled={pending || !canWrite} onClick={() => void requestProxy(source, true)} className="mt-2 min-h-11 w-full rounded-xl border border-rose-300 bg-white px-3 text-xs font-black text-rose-950 disabled:opacity-45">Retry proxy · {job.failureCode ?? "worker failure"}</button> : source.provider === "local-file-vault" ? <button type="button" disabled={pending || !canWrite || !revision} onClick={() => void requestProxy(source)} className="mt-2 min-h-11 w-full rounded-xl bg-teal-900 px-3 text-xs font-black text-white disabled:opacity-45">Create lightweight proxy</button> : <p className="mt-2 text-[10px] font-semibold leading-4 text-[#765f40]">The source is attached. Drive proxy execution activates with the approved cloud connection; Quipsly will not pull the original before then.</p>}</article>; })}</div> : null}
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
            {!filteredAssets.length && !filteredExternalSources.length && !filteredSourceSets.length ? <p className="rounded-2xl border border-dashed border-[#d9c7a5] p-5 text-sm font-semibold text-[#765f40]">No attached source matches this search.</p> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Source viewer">
          <div className="overflow-hidden rounded-3xl border border-[#29231d] bg-[#171513] shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8bd91]">{selectedViewerSource?.is360 ? "Spatial 360° viewer" : "Viewer"}</p><h2 className="truncate font-serif text-xl font-black">{selectedViewerSource?.filename ?? selectedSourceSet?.displayName ?? selectedExternalSource?.fileName ?? "Choose a source"}</h2></div>
              {(selectedViewerSource || selectedExternalSource) ? <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide">{selectedViewerSource?.mimeType ?? selectedExternalSource?.mimeType ?? "Unknown media"}</span> : null}
            </div>
            <div className="grid min-h-[360px] place-items-center bg-black md:min-h-[500px]">
              {!selectedViewerSource ? <p className="px-6 text-center font-semibold text-zinc-400">{selectedExternalSource || selectedSourceSet ? "This source is safely attached. Create its lightweight collaboration proxy to scrub and mark ranges without editing the original." : "Attach or choose project media to begin."}</p> : selectedViewerSource.is360 ? (
                <EquirectangularVideoViewer key={selectedViewerSource.key} ref={(node) => { mediaRef.current = node; }} src={selectedViewerSource.url} title={selectedViewerSource.filename} onViewChange={setSpatialView} onTimeUpdate={stopAtSourceRangeBoundary} onEnded={() => { playbackBoundaryRef.current = null; }} />
              ) : selectedViewerSource.mimeType?.startsWith("video/") ? (
                <video key={selectedViewerSource.key} ref={(node) => { mediaRef.current = node; }} src={selectedViewerSource.url} poster={selectedViewerSource.thumbnailUrl ?? undefined} controls preload="metadata" onTimeUpdate={stopAtSourceRangeBoundary} onEnded={() => { playbackBoundaryRef.current = null; }} className="max-h-[70vh] w-full" />
              ) : selectedViewerSource.mimeType?.startsWith("audio/") ? (
                <div className="w-full max-w-3xl px-6"><div className="mb-8 grid place-items-center"><Film size={64} className="text-[#d8bd91]" aria-hidden="true" /></div><audio key={selectedViewerSource.key} ref={(node) => { mediaRef.current = node; }} src={selectedViewerSource.url} controls preload="metadata" onTimeUpdate={stopAtSourceRangeBoundary} onEnded={() => { playbackBoundaryRef.current = null; }} className="w-full" /></div>
              ) : selectedViewerSource.mimeType?.startsWith("image/") ? (
                <img src={selectedViewerSource.url} alt={selectedViewerSource.filename} className="max-h-[70vh] max-w-full object-contain" />
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
                {selectedViewerSource?.is360 ? <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4" aria-label="Non-destructive 360 reframing"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-black text-violet-950"><Rotate3d size={18} aria-hidden="true" />Non-destructive camera direction</p><p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-violet-900">Look around above, pause on a useful composition, then save that view. Quipsly stores camera instructions against source time; the complete sphere and every original remain unchanged.</p></div><label className="text-[10px] font-black uppercase tracking-wide text-violet-900">Output frame<select value={reframeAspectRatio} onChange={(event) => setReframeAspectRatio(event.target.value as typeof reframeAspectRatio)} className="mt-1 min-h-11 rounded-xl border border-violet-200 bg-white px-3 text-xs font-black"><option value="16:9">16:9 landscape</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option><option value="4:5">4:5 portrait</option></select></label></div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={inPoint === null || outPoint === null} onClick={captureReframeKeyframe} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-900 px-4 text-xs font-black text-white disabled:opacity-45"><Video size={15} aria-hidden="true" />Save current view at playhead</button><span className="rounded-full border border-violet-200 bg-white px-3 py-2 font-mono text-[10px] font-bold text-violet-950">pan {spatialView.panDegrees.toFixed(1)}° · tilt {spatialView.tiltDegrees.toFixed(1)}° · FOV {spatialView.fieldOfViewDegrees.toFixed(0)}°</span></div>{reframeKeyframes.length ? <ol className="mt-3 grid gap-2">{reframeKeyframes.map((keyframe, index) => <li key={`${keyframe.sourceSeconds}:${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2"><span className="text-xs font-black text-violet-950">{formatClock(keyframe.sourceSeconds)} · pan {keyframe.panDegrees.toFixed(1)}° · tilt {keyframe.tiltDegrees.toFixed(1)}° · FOV {keyframe.fieldOfViewDegrees.toFixed(0)}°</span><button type="button" onClick={() => setReframeKeyframes((current) => current.filter((_, candidate) => candidate !== index))} className="min-h-11 rounded-full border border-rose-200 px-3 text-[10px] font-black uppercase tracking-wide text-rose-900">Remove</button></li>)}</ol> : <p className="mt-3 text-xs font-semibold text-violet-900">No camera views saved yet. The range will still preserve the complete 360° sphere.</p>}</section> : <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3"><input type="checkbox" checked={preserve360} onChange={(event) => setPreserve360(event.target.checked)} className="h-5 w-5" /><Rotate3d size={18} className="text-violet-800" aria-hidden="true" /><span><span className="block text-sm font-black text-violet-950">This file is an equirectangular 360° source</span><span className="block text-xs font-semibold text-violet-900">Use only when the source is a complete sphere. Quipsly will preserve an explicit non-destructive reframe recipe.</span></span></label>}
                <button type="button" disabled={!rangeReady || pending || !selectedViewerSource} onClick={() => void createCard()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{pending ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}Save source-backed card</button>
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-4" aria-label="Story board">
          <section className="rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm">
            <div className="flex items-center gap-2"><LayoutGrid size={19} className="text-[#8a653d]" aria-hidden="true" /><h2 className="font-serif text-2xl font-black">Story board</h2></div>
            {workspace.boards.length ? <div className="mt-3"><label className="text-xs font-black uppercase tracking-wide text-[#76522c]">Active board<select value={selectedBoard?.id ?? ""} onChange={(event) => { setSelectedBoardId(event.target.value); const source = selectedViewerSource ? { kind: selectedViewerSource.kind, id: selectedViewerSource.id } : null; window.history.replaceState(null, "", sourceHref(project.slug, source, event.target.value)); }} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold">{workspace.boards.map((board) => <option key={board.id} value={board.id}>{board.title} · revision {board.revision}</option>)}</select></label>{selectedBoard?.description ? <p className="mt-3 text-sm font-semibold leading-6 text-[#765f40]">{selectedBoard.description}</p> : null}</div> : null}
            {canWrite ? <details className="mt-3 rounded-2xl border border-dashed border-[#cdb993] bg-white p-3" open={!workspace.boards.length}><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]"><Plus size={14} className="mr-1 inline" aria-hidden="true" />Create a board deliberately</summary><div className="mt-3 grid gap-3"><input value={boardTitle} onChange={(event) => setBoardTitle(event.target.value)} maxLength={200} placeholder="Board title" className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold" /><textarea value={boardDescription} onChange={(event) => setBoardDescription(event.target.value)} maxLength={10000} rows={2} placeholder="What story or output is this board shaping?" className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold" /><select value={boardEpisodeId} onChange={(event) => setBoardEpisodeId(event.target.value)} className="min-h-11 rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-semibold"><option value="">General project board</option>{episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title} · {episode.status}</option>)}</select><button type="button" disabled={pending || !boardTitle.trim()} onClick={() => void createBoard()} className="min-h-11 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45">Create revisioned board</button></div></details> : null}
          </section>

          {selectedBoard ? (
            <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Shared arrangement · r{selectedBoard.revision}</p><h2 className="font-serif text-xl font-black">{selectedBoard.placements.length} placed card{selectedBoard.placements.length === 1 ? "" : "s"} · {boardGroups.length} section{boardGroups.length === 1 ? "" : "s"}</h2></div><div className="flex rounded-xl border border-[#d9c7a5] bg-[#fffaf0] p-1" aria-label="Board view"><button type="button" aria-pressed={boardView === "cards"} onClick={() => setBoardView("cards")} className={`min-h-11 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${boardView === "cards" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}>Cards</button><button type="button" aria-pressed={boardView === "outline"} onClick={() => setBoardView("outline")} className={`min-h-11 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${boardView === "outline" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}>Outline</button></div></div>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">Sections and lanes belong to this board placement. Moving or unfiling a card never changes its writing, exact source range, use on another board, or Episode placement.</p>
              {canWrite ? <details className="mt-3 rounded-2xl border border-dashed border-[#cdb993] bg-[#fffaf0] p-3"><summary className="cursor-pointer min-h-11 py-3 text-xs font-black uppercase tracking-wide text-[#76522c]"><ListPlus size={15} className="mr-1 inline" aria-hidden="true" />Add an empty section or story beat</summary><div className="grid gap-3"><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Section title<input value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} maxLength={200} placeholder="Cold open, discovery, payoff…" className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold" /></label><label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">What this section needs to do<textarea value={sectionSynopsis} onChange={(event) => setSectionSynopsis(event.target.value)} maxLength={10000} rows={3} placeholder="A concise editorial brief that stays beside the cards and writing." className="mt-1 w-full rounded-xl border border-[#d9c7a5] bg-white p-3 text-sm font-semibold leading-6" /></label><button type="button" disabled={pending || !sectionTitle.trim()} onClick={() => void createSection()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"><Plus size={15} aria-hidden="true" />Add durable section</button></div></details> : null}
              <div className="mt-4 space-y-4">
                {boardView === "outline" ? boardGroups.map((group, sectionIndex) => <section key={group.groupKey} className="rounded-2xl border border-[#d9c7a5] bg-[#fffaf0] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-serif text-lg font-black">{group.section.title}</h3><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{group.placements.length} card{group.placements.length === 1 ? "" : "s"} · {formatClock(group.placements.reduce((total, placement) => total + Math.max(0, (placement.card.sourceRange?.endSeconds ?? 0) - (placement.card.sourceRange?.startSeconds ?? 0)), 0))}</p>{group.section.synopsis ? <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[#715f48]">{group.section.synopsis}</p> : null}</div>{canWrite ? <SectionBinderControls projectSlug={project.slug} boardId={selectedBoard.id} section={group.section} sectionIndex={sectionIndex} sectionCount={boardGroups.length} cardCount={group.placements.length} pending={pending} onOpenWriting={() => openSectionWriting(group.section)} onMove={(direction) => moveSection(group.section.id, direction)} onUpdate={(next) => updateSection(group.section, next)} onArchive={() => archiveSection(group.section)} /> : null}</div><ol className="mt-2 space-y-2">{group.placements.map((placement, groupIndex) => { const index = selectedBoard.placements.findIndex((candidate) => candidate.id === placement.id); return <li key={placement.id} className="rounded-xl border border-[#e2d2b6] bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">{index + 1}. {boardGroupLabel(placement.laneKey)} · {placement.card.purpose.replaceAll("-", " ")}</p><p className="mt-1 font-black">{placement.card.title}</p>{placement.card.synopsis ? <p className="mt-1 text-xs font-semibold leading-5 text-[#715f48]">{placement.card.synopsis}</p> : null}</div>{canWrite ? <div className="flex shrink-0 gap-1"><button type="button" disabled={pending || groupIndex === 0} onClick={() => void moveCard(placement.cardId, -1)} aria-label={`Move ${placement.card.title} earlier in ${group.section.title}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] disabled:opacity-35"><ArrowUp size={16} aria-hidden="true" /></button><button type="button" disabled={pending || groupIndex === group.placements.length - 1} onClick={() => void moveCard(placement.cardId, 1)} aria-label={`Move ${placement.card.title} later in ${group.section.title}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] disabled:opacity-35"><ArrowDown size={16} aria-hidden="true" /></button></div> : null}</div></li>; })}</ol></section>) : boardGroups.map((group, sectionIndex) => (
                  <section key={group.groupKey} className="rounded-2xl border border-[#d9c7a5] bg-[#fffdf8] p-3" aria-labelledby={`story-section-${group.groupKey}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#eadfc9] pb-2"><div><h3 id={`story-section-${group.groupKey}`} className="font-serif text-lg font-black">{group.section.title}</h3><p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">{group.placements.length} card{group.placements.length === 1 ? "" : "s"}</p>{group.section.synopsis ? <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[#715f48]">{group.section.synopsis}</p> : null}</div>{canWrite ? <SectionBinderControls projectSlug={project.slug} boardId={selectedBoard.id} section={group.section} sectionIndex={sectionIndex} sectionCount={boardGroups.length} cardCount={group.placements.length} pending={pending} onOpenWriting={() => openSectionWriting(group.section)} onMove={(direction) => moveSection(group.section.id, direction)} onUpdate={(next) => updateSection(group.section, next)} onArchive={() => archiveSection(group.section)} /> : null}</div>
                    <div className="mt-3 space-y-3">{group.placements.map((placement, groupIndex) => { const index = selectedBoard.placements.findIndex((candidate) => candidate.id === placement.id); return (
                      <article key={placement.id} className="rounded-2xl border border-[#e2d2b6] bg-[#fffaf0] p-4">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">{index + 1} · {boardGroupLabel(placement.laneKey)} · {placement.card.purpose.replaceAll("-", " ")}</p><h4 className="mt-1 font-serif text-lg font-black leading-snug">{placement.card.title}</h4></div>{canWrite ? <div className="flex shrink-0 gap-1"><button type="button" disabled={pending || groupIndex === 0} onClick={() => void moveCard(placement.cardId, -1)} aria-label={`Move ${placement.card.title} earlier in ${boardGroupLabel(group.groupKey)}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowUp size={16} aria-hidden="true" /></button><button type="button" disabled={pending || groupIndex === group.placements.length - 1} onClick={() => void moveCard(placement.cardId, 1)} aria-label={`Move ${placement.card.title} later in ${boardGroupLabel(group.groupKey)}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowDown size={16} aria-hidden="true" /></button></div> : null}</div>
                        {placement.card.synopsis ? <p className="mt-2 text-sm font-semibold leading-6 text-[#715f48]">{placement.card.synopsis}</p> : null}
                        {placement.card.sourceRange ? <button type="button" disabled={!cardPlayback(placement.card)} onClick={() => { const range = placement.card.sourceRange; const source = cardPlayback(placement.card); if (source && range) playSourceRange(source, range.startSeconds, range.endSeconds); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-950 disabled:cursor-not-allowed disabled:opacity-45"><Play size={14} aria-hidden="true" />{formatClock(placement.card.sourceRange.startSeconds)}–{formatClock(placement.card.sourceRange.endSeconds)}</button> : null}
                        <div className="mt-3 flex flex-wrap gap-1">{placement.card.tags.map((tag) => <span key={tag.id} className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-bold text-sky-900">#{tag.label}</span>)}<span className="rounded-full border border-[#ded0b7] bg-white px-2 py-1 text-[10px] font-bold text-[#765f40]">{placement.card.status.replaceAll("-", " ")}</span>{placement.card.sourceRange?.reframeRecipe ? <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-900">360 recipe</span> : null}</div>
                        {placement.card.sourceRange ? <p className="mt-3 text-[10px] font-bold leading-4 text-[#806a4d]">{sourceStateLabel(placement.card.sourceRange.sourceRevision.sourceState)} · selector {placement.card.sourceRange.selectorSha256.slice(0, 10)}…</p> : null}
                        {canWrite ? <BoardPlacementEditor placement={placement} groupKeys={boardGroupKeys} pending={pending} onSave={(next) => changeCardPlacement(placement.cardId, next)} onUnfile={() => unfileCard(placement.cardId)} /> : null}
                        {canWrite ? <SourceRepairEditor card={placement.card} assets={initialAssets} selectedAsset={selectedAsset} viewerInPoint={inPoint} viewerOutPoint={outPoint} pending={pending} mutate={mutate} /> : null}
                        {canWrite ? <TimelinePromotionEditor card={placement.card} board={selectedBoard} boardPlacementId={placement.id} workspace={workspace} pending={pending} mutate={mutate} projectSlug={project.slug} /> : null}
                        {canWrite ? <StoryCardEditor card={placement.card} tags={tags} pending={pending} mutate={mutate} /> : null}
                      </article>
                    ); })}</div>
                  </section>
                ))}
                {!selectedBoard.placements.length ? <div className="rounded-2xl border border-dashed border-[#d9c7a5] p-6 text-center"><Clapperboard className="mx-auto text-[#9a7b55]" aria-hidden="true" /><p className="mt-3 font-serif text-xl font-black">This board is ready for its first real select.</p><p className="mt-2 text-sm font-semibold text-[#765f40]">Mark an exact source range, write the card, and save it to this board.</p></div> : null}
              </div>
            </section>
          ) : null}

          {selectedBoard && cardsAvailableForBoard.length ? <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Available source cards</p><p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">A card can appear on more than one board. Filing it here reuses the same identity and exact source receipt.</p><div className="mt-3 space-y-2">{cardsAvailableForBoard.map((card) => <article key={card.id} className="rounded-xl border border-[#e2d2b6] p-3"><p className="font-black">{card.title}</p>{card.sourceRange ? <button type="button" disabled={!cardPlayback(card)} onClick={() => { const range = card.sourceRange; const source = cardPlayback(card); if (source && range) playSourceRange(source, range.startSeconds, range.endSeconds); }} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-black text-sky-900 disabled:opacity-45"><Clock3 size={14} aria-hidden="true" />{formatClock(card.sourceRange.startSeconds)}–{formatClock(card.sourceRange.endSeconds)}</button> : null}{canWrite ? <FileCardEditor card={card} groupKeys={boardGroupKeys} pending={pending} onFile={(next) => fileCard(card.id, next)} /> : null}</article>)}</div></section> : null}
        </aside>
      </div>
    </main>
  );
}

const storyBoardLanes = ["story", "b-roll", "evidence", "audio", "graphics"] as const;

function storyWritingHref(projectSlug: string, boardId: string, sectionKey: string, documentId: string) {
  const query = new URLSearchParams({ project: projectSlug, document: documentId, storyBoard: boardId, storySection: sectionKey });
  return `/create?${query.toString()}`;
}

function SectionWritingControl({
  projectSlug,
  boardId,
  section,
  pending,
  onCreate,
}: {
  projectSlug: string;
  boardId: string;
  section: SourceStoryBoard["sections"][number];
  pending: boolean;
  onCreate: () => Promise<void>;
}) {
  if (section.document) {
    return (
      <Link href={storyWritingHref(projectSlug, boardId, section.key, section.document.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950">
        <NotebookPen size={15} aria-hidden="true" /> Open writing · {section.document.blockCount} block{section.document.blockCount === 1 ? "" : "s"}
      </Link>
    );
  }
  return (
    <button type="button" disabled={pending} onClick={() => void onCreate()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950 disabled:opacity-40">
      <NotebookPen size={15} aria-hidden="true" /> Start section writing
    </button>
  );
}

function SectionBinderControls({
  projectSlug,
  boardId,
  section,
  sectionIndex,
  sectionCount,
  cardCount,
  pending,
  onOpenWriting,
  onMove,
  onUpdate,
  onArchive,
}: {
  projectSlug: string;
  boardId: string;
  section: SourceStoryBoard["sections"][number];
  sectionIndex: number;
  sectionCount: number;
  cardCount: number;
  pending: boolean;
  onOpenWriting: () => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onUpdate: (next: { title: string; synopsis: string }) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [title, setTitle] = useState(section.title);
  const [synopsis, setSynopsis] = useState(section.synopsis);
  useEffect(() => {
    setTitle(section.title);
    setSynopsis(section.synopsis);
  }, [section.revision, section.synopsis, section.title]);
  const dirty = title.trim() !== section.title || synopsis.trim() !== section.synopsis;

  return (
    <div className="flex max-w-full flex-wrap items-start justify-end gap-2">
      <SectionWritingControl projectSlug={projectSlug} boardId={boardId} section={section} pending={pending} onCreate={onOpenWriting} />
      <div className="flex gap-1" aria-label={`Order ${section.title}`}>
        <button type="button" disabled={pending || sectionIndex === 0} onClick={() => void onMove(-1)} aria-label={`Move ${section.title} earlier in the binder`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" disabled={pending || sectionIndex === sectionCount - 1} onClick={() => void onMove(1)} aria-label={`Move ${section.title} later in the binder`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"><ArrowDown size={16} aria-hidden="true" /></button>
      </div>
      <details className="w-full rounded-xl border border-[#ded0b7] bg-white p-3 sm:max-w-md">
        <summary className="cursor-pointer min-h-11 py-3 text-[10px] font-black uppercase tracking-wide text-[#76522c]"><Pencil size={14} className="mr-1 inline" aria-hidden="true" />Section details and lifecycle</summary>
        <div className="grid gap-3">
          <p className="text-xs font-semibold leading-5 text-[#765f40]">The durable section owns its editorial brief and writing link. Its stable key stays unchanged so cards and document context never break when the visible title changes.</p>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-bold" /></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Editorial brief<textarea value={synopsis} onChange={(event) => setSynopsis(event.target.value)} maxLength={10000} rows={3} className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6" /></label>
          <button type="button" disabled={pending || !dirty || !title.trim()} onClick={() => void onUpdate({ title, synopsis })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"><Save size={15} aria-hidden="true" />Save section details</button>
          <div className="border-t border-[#eadfc9] pt-3">
            <button type="button" disabled={pending || cardCount > 0} onClick={() => void onArchive()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black uppercase tracking-wide text-rose-950 disabled:cursor-not-allowed disabled:opacity-40"><Archive size={15} aria-hidden="true" />Archive empty section</button>
            <p className="mt-2 text-[10px] font-bold leading-4 text-[#806a4d]">{cardCount > 0 ? `Move or unfile ${cardCount} card${cardCount === 1 ? "" : "s"} first.` : section.document ? "The linked writing document and its revision history remain retained." : "Archiving removes the section from this binder view but retains its operation history."}</p>
          </div>
        </div>
      </details>
    </div>
  );
}

function BoardPlacementEditor({
  placement,
  groupKeys,
  pending,
  onSave,
  onUnfile,
}: {
  placement: SourceStoryBoardPlacement;
  groupKeys: string[];
  pending: boolean;
  onSave: (next: { groupKey: string; laneKey: string }) => Promise<void>;
  onUnfile: () => Promise<void>;
}) {
  const [groupKey, setGroupKey] = useState(boardGroupLabel(placement.groupKey));
  const [laneKey, setLaneKey] = useState(placement.laneKey);
  useEffect(() => {
    setGroupKey(boardGroupLabel(placement.groupKey));
    setLaneKey(placement.laneKey);
  }, [placement.groupKey, placement.laneKey]);
  const listId = `story-groups-${placement.id}`;
  const dirty = boardKeyFromLabel(groupKey) !== placement.groupKey || laneKey !== placement.laneKey;
  const lanes = storyBoardLanes.includes(laneKey as (typeof storyBoardLanes)[number])
    ? storyBoardLanes
    : [laneKey, ...storyBoardLanes];
  return (
    <details className="mt-3 rounded-xl border border-[#ded0b7] bg-white p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">Board position · {boardGroupLabel(placement.groupKey)} / {boardGroupLabel(placement.laneKey)}</summary>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">This changes only this board’s composition. The source-backed card remains available everywhere else.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Section / beat<input list={listId} value={groupKey} onChange={(event) => setGroupKey(event.target.value)} maxLength={60} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-xs font-bold" /><datalist id={listId}>{groupKeys.map((key) => <option key={key} value={boardGroupLabel(key)} />)}</datalist></label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Lane<select value={laneKey} onChange={(event) => setLaneKey(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold">{lanes.map((lane) => <option key={lane} value={lane}>{boardGroupLabel(lane)}</option>)}</select></label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={pending || !dirty || !groupKey.trim()} onClick={() => void onSave({ groupKey, laneKey })} className="min-h-11 rounded-xl bg-[#3e2f21] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">Save board position</button><button type="button" disabled={pending} onClick={() => void onUnfile()} className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wide text-rose-950 disabled:opacity-40">Unfile from this board</button></div>
    </details>
  );
}

function FileCardEditor({
  card,
  groupKeys,
  pending,
  onFile,
}: {
  card: SourceStoryCard;
  groupKeys: string[];
  pending: boolean;
  onFile: (next: { groupKey: string; laneKey: string }) => Promise<void>;
}) {
  const [groupKey, setGroupKey] = useState(boardGroupLabel(groupKeys[0] ?? "unassigned"));
  const [laneKey, setLaneKey] = useState("story");
  const listId = `available-story-groups-${card.id}`;
  return (
    <details className="mt-2 rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] p-2">
      <summary className="cursor-pointer min-h-11 py-3 text-[10px] font-black uppercase tracking-wide text-[#76522c]">File on active board…</summary>
      <div className="grid gap-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Section / beat<input list={listId} value={groupKey} onChange={(event) => setGroupKey(event.target.value)} maxLength={60} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold" /><datalist id={listId}>{groupKeys.map((key) => <option key={key} value={boardGroupLabel(key)} />)}</datalist></label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">Lane<select value={laneKey} onChange={(event) => setLaneKey(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold">{storyBoardLanes.map((lane) => <option key={lane} value={lane}>{boardGroupLabel(lane)}</option>)}</select></label>
        <button type="button" disabled={pending || !groupKey.trim()} onClick={() => void onFile({ groupKey, laneKey })} className="min-h-11 rounded-xl bg-[#3e2f21] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">File the existing card</button>
      </div>
    </details>
  );
}

function TimelinePromotionEditor({
  card,
  board,
  boardPlacementId,
  workspace,
  pending,
  mutate,
  projectSlug,
}: {
  card: SourceStoryCard;
  board: SourceStoryBoard;
  boardPlacementId: string;
  workspace: SourceStoryWorkspace;
  pending: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<SourceStoryWorkspace | null>;
  projectSlug: string;
}) {
  const preferredEpisodeId = board.episodeProductionId && workspace.episodes.some((episode) => episode.id === board.episodeProductionId)
    ? board.episodeProductionId
    : workspace.episodes[0]?.id ?? "";
  const [episodeId, setEpisodeId] = useState(preferredEpisodeId);
  const [placementMode, setPlacementMode] = useState<"append" | "at-time">("append");
  const [episodeStartSeconds, setEpisodeStartSeconds] = useState(0);
  const [trackId, setTrackId] = useState("V1");

  useEffect(() => {
    if (!workspace.episodes.some((episode) => episode.id === episodeId)) setEpisodeId(preferredEpisodeId);
  }, [episodeId, preferredEpisodeId, workspace.episodes]);

  const episode = workspace.episodes.find((candidate) => candidate.id === episodeId) ?? null;
  const placements = workspace.timelinePlacements.filter((placement) => placement.cardId === card.id);
  const activePlacements = placements.filter((placement) => placement.status === "active");
  const canPromote = Boolean(card.sourceRange && episode && /^V[1-9][0-9]?$/.test(trackId) && (placementMode === "append" || (Number.isFinite(episodeStartSeconds) && episodeStartSeconds >= 0)));

  return (
    <details className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-violet-950">Episode timeline · {activePlacements.length ? `${activePlacements.length} active placement${activePlacements.length === 1 ? "" : "s"}` : "not placed"}</summary>
      <p className="mt-2 text-xs font-semibold leading-5 text-violet-900">Promotion creates one normal, editable Episode clip while retaining this exact card, source-clock range, checksum, camera package, and 360 view recipe. It never renders or publishes.</p>
      {workspace.episodes.length ? (
        <div className="mt-3 grid gap-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">Episode<select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold">{workspace.episodes.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} · {formatClock(candidate.timelineDurationSeconds)} · {candidate.clipCount} clips</option>)}</select></label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">Placement<select value={placementMode} onChange={(event) => setPlacementMode(event.target.value as "append" | "at-time")} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold"><option value="append">Append to Episode</option><option value="at-time">Place at exact time</option></select></label>
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">Episode time<input type="number" min="0" step="0.001" disabled={placementMode === "append"} value={placementMode === "append" ? episode?.timelineDurationSeconds ?? 0 : episodeStartSeconds} onChange={(event) => setEpisodeStartSeconds(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-mono text-xs font-bold disabled:bg-violet-100" /></label>
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">Video track<input value={trackId} onChange={(event) => setTrackId(event.target.value.toUpperCase())} maxLength={3} className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-mono text-xs font-bold" /></label>
          </div>
          <button type="button" disabled={pending || !canPromote} onClick={() => episode && void mutate({ action: "promote-card-to-episode", cardId: card.id, originBoardId: board.id, originBoardPlacementId: boardPlacementId, episodeProductionId: episode.id, expectedTimelineFingerprint: episode.timelineFingerprint, placementMode, episodeStartSeconds: placementMode === "at-time" ? episodeStartSeconds : null, trackId, clientRequestId: crypto.randomUUID() }, `Placed ${card.title} in ${episode.title} with a reversible source receipt.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-900 px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"><ArrowRight size={15} aria-hidden="true" />Place in Episode timeline</button>
        </div>
      ) : <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">Create an Episode production before promoting Story cards.</p>}
      {placements.length ? <ol className="mt-4 grid gap-2">{placements.map((placement) => {
        const target = workspace.episodes.find((candidate) => candidate.id === placement.episodeProductionId);
        const sourceSet = card.sourceRange?.sourceSet ? workspace.sourceSets.find((candidate) => candidate.id === card.sourceRange?.sourceSet?.id) ?? null : null;
        return <li key={placement.id} className="rounded-xl border border-violet-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-violet-950">{target?.title ?? "Episode"} · {placement.trackId} at {formatClock(placement.episodeStartSeconds)}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">{placement.status} · receipt r{placement.revision} · {placement.createdByEmail}</p></div><div className="flex flex-wrap gap-2">{target ? <Link href={`/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(target.slug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950"><Clapperboard size={14} aria-hidden="true" />Open editor</Link> : null}{placement.status === "active" && target ? <button type="button" disabled={pending} onClick={() => void mutate({ action: "withdraw-timeline-placement", placementId: placement.id, expectedRevision: placement.revision, expectedTimelineFingerprint: target.timelineFingerprint, clientRequestId: crypto.randomUUID() }, `Withdrew ${card.title} from ${target.title}; the card and immutable source remain intact.`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wide text-rose-950 disabled:opacity-45"><Undo2 size={14} aria-hidden="true" />Withdraw clip</button> : null}</div></div>{placement.status === "active" && card.sourceRange?.reframeRecipe ? <div className="mt-3 border-t border-violet-100 pt-3"><p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-950">Reversible 360° renders</p>{sourceSet?.sourceClockRevision.spatialStitchMaster ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><SpatialRenderControl label="720p review proof" profile="spatial-proof-720p24" placementId={placement.id} jobs={workspace.spatialRenderJobs} pending={pending} mutate={mutate} /><SpatialRenderControl label="4K edit source" profile="spatial-flat-4k24" placementId={placement.id} jobs={workspace.spatialRenderJobs} pending={pending} mutate={mutate} /></div> : <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-950">A reviewed 5.7K stitch master is required. Browsing and cards remain available from the lightweight proxy.</p>}</div> : null}</li>;
      })}</ol> : null}
    </details>
  );
}

function SpatialRenderControl({ label, profile, placementId, jobs, pending, mutate }: { label: string; profile: "spatial-proof-720p24" | "spatial-flat-4k24"; placementId: string; jobs: SourceStoryWorkspace["spatialRenderJobs"]; pending: boolean; mutate: (body: Record<string, unknown>, message: string) => Promise<SourceStoryWorkspace | null> }) {
  const job = jobs.find((candidate) => candidate.timelinePlacementId === placementId && candidate.profile === profile) ?? null;
  if (job?.status === "completed" && job.derivative) return <a href={job.derivative.playbackUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-950"><Play size={14} aria-hidden="true" />Play {label}</a>;
  if (job?.status === "output-ready") return <button type="button" disabled={pending} onClick={() => void mutate({ action: "register-spatial-reframe", jobId: job.id }, `Verified and attached the ${label} to this exact Episode placement.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-950 disabled:opacity-45"><Check size={14} aria-hidden="true" />Attach finished {label}</button>;
  if (job && ["queued", "processing"].includes(job.status)) return <p role="status" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-wide text-sky-950"><Loader2 size={14} className="animate-spin" aria-hidden="true" />{job.status} · {label}</p>;
  return <button type="button" disabled={pending} onClick={() => void mutate({ action: "queue-spatial-reframe", timelinePlacementId: placementId, profile, clientRequestId: crypto.randomUUID() }, `${label} queued from the reviewed 5.7K master; the spatial recipe stays editable.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 text-[10px] font-black uppercase tracking-wide text-fuchsia-950 disabled:opacity-45"><Film size={14} aria-hidden="true" />{job?.status === "failed" ? `Retry ${label}` : `Render ${label}`}</button>;
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
