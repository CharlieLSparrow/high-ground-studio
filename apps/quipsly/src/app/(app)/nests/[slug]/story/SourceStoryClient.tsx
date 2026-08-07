"use client";

import Link from "next/link";
import {
  Archive,
  AudioWaveform,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowRight,
  Check,
  CircleAlert,
  Clapperboard,
  Clock3,
  Eye,
  FileVideo2,
  Film,
  FolderOpen,
  Grid2X2,
  LayoutGrid,
  List,
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
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Tags,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SpatialExecutorProbe,
  SpatialExecutorReadiness,
} from "@high-ground/quipsly-media-processing";

import {
  storyCardPurposes,
  storyCardStatuses,
  type StoryReframeKeyframe,
} from "@/lib/source-story-contract";
import {
  buildSourceLibraryItems,
  filterSourceLibraryItems,
  groupSourceLibraryItems,
  sourceLibraryStats,
  type SourceLibraryCollection,
  type SourceLibraryGroupMode,
  type SourceLibraryMediaFilter,
  type SourceLibrarySortMode,
} from "@/lib/source-library-projection";

import { GoogleDriveSourcePicker } from "./GoogleDriveSourcePicker";
import {
  EquirectangularVideoViewer,
  type SpatialView,
} from "./EquirectangularVideoViewer";

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
  createdAt: string;
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
    sourceSet: null | {
      id: string;
      kind: string;
      captureKey: string;
      displayName: string;
      identitySha256: string;
      completeness: string;
    };
    sourceRevision: {
      id: string;
      revisionKey: string;
      identitySha256: string;
      contentSha256: string | null;
      sizeBytes: string | null;
      durationSeconds: number | null;
      sourceState: string;
      verifiedAt: string | null;
      mediaAsset: null | {
        id: string;
        filename: string;
        url: string;
        mimeType: string | null;
        duration: number | null;
        thumbnailUrl: string | null;
      };
      externalReference: null | {
        id: string;
        provider: string;
        fileName: string;
        mimeType: string | null;
        accessState: string;
        capabilityState: string;
        lastVerifiedAt: string | null;
      };
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
    document: null | {
      id: string;
      stableId: string;
      title: string;
      updatedAt: string;
      blockCount: number;
    };
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
  sourceInventoryWindow: {
    externalSources: { loaded: number; total: number };
    sourceSets: { loaded: number; total: number };
    windowLimit: number;
    complete: boolean;
  };
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
    sourceUnit?: null | {
      id: string;
      kind: string;
      title: string;
      capturedAt: string | Date | null;
      metadataJson: unknown;
    };
    provider: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: string | null;
    headRevisionKey: string | null;
    providerCreatedAt: string | null;
    providerModifiedAt: string | null;
    createdAt: string;
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
      memberRole:
        | "browse-proxy"
        | "primary-original"
        | "secondary-original"
        | null;
      verifiedAt: string | null;
      durationSeconds: number | null;
      widthPixels: number | null;
      heightPixels: number | null;
      framesPerSecond: number | null;
      collaborationProxy: MediaDerivative | null;
      exactReplica: null | {
        id: string;
        contentSha256: string;
        sizeBytes: string;
        mimeType: string;
        createdAt: string;
      };
      materializationJob: null | {
        id: string;
        status: string;
        failureCode: string | null;
        transferredBytes: number | null;
        totalBytes: number | null;
        updatedAt: string;
      };
      proxyJob: null | {
        id: string;
        status: string;
        failureCode: string | null;
        updatedAt: string;
      };
      visualOverview: MediaDerivative | null;
      visualOverviewJob: null | {
        id: string;
        status: string;
        failureCode: string | null;
        updatedAt: string;
      };
      audioNavigation: SourceAudioNavigationStatus | null;
    };
  }>;
  cards: SourceStoryCard[];
  boards: SourceStoryBoard[];
  sourceCollections: SourceCollection[];
};

type SourceCollection = {
  schema: "quipsly-source-collection-v1";
  id: string;
  projectId: string;
  ownerUserId: string;
  scope: "personal" | "project";
  slug: string;
  title: string;
  description: string;
  color: string | null;
  revision: number;
  archivedAt: string | null;
  canEdit: boolean;
  updatedAt: string;
  items: Array<{
    id: string;
    targetKey: string;
    sortOrder: number;
    note: string;
  }>;
};

type SourcePageInfo = {
  limit: number;
  returned: number;
  complete: boolean;
  nextCursor: string | null;
  totals: {
    sourceSets: number;
    externalSources: number;
    assets: number;
    all: number;
  };
};

type SourceLibraryPagePayload = {
  ok?: boolean;
  error?: string;
  page?: {
    sourceSets: MediaSourceSet[];
    externalSources: SourceStoryWorkspace["externalSources"];
    assets: Asset[];
    pageInfo: SourcePageInfo;
  };
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
    mediaProjection: string;
    projectionMetadata: unknown;
    externalReference: null | {
      id: string;
      fileName: string;
      provider: string;
    };
    collaborationProxy: MediaDerivative | null;
    spatialStitchMaster: MediaDerivative | null;
    visualOverview: MediaDerivative | null;
    visualOverviewJob: null | {
      id: string;
      status: string;
      failureCode: string | null;
      updatedAt: string;
    };
    audioNavigation: SourceAudioNavigationStatus | null;
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
      externalReference: null | {
        id: string;
        provider: string;
        fileName: string;
        mimeType: string | null;
        accessState: string;
      };
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
  navigationFrames: null | {
    columns: number;
    rows: number;
    sampleTimesSeconds: number[];
  };
};

type SourceAudioNavigationStatus = {
  id: string;
  status: string;
  failureCode: string | null;
  error: string | null;
  updatedAt: string;
  profile: string;
  evidence: null | {
    durationSeconds: number;
    sampleRate: number;
    channelCount: number;
    rmsDbfs: number;
    samplePeakDbfs: number;
    clippedFrameFraction: number;
    nearSilentFrameFraction: number;
    stereoBalanceDb: number | null;
    signalStatus: "signal-present" | "attention" | "near-digital-silence";
    waveform: Array<{
      startSeconds: number;
      durationSeconds: number;
      rmsDbfs: number;
      samplePeakDbfs: number;
      clippedFrameCount: number;
    }>;
    observations: Array<{
      kind: string;
      severity: string;
      startSeconds: number;
      endSeconds: number;
      detail: string;
    }>;
    frequencyBands: Array<{
      id: string;
      label: string;
      minimumHz: number;
      maximumHz: number;
    }>;
    overallBandRmsDbfs: number[];
    source: {
      sourceRevisionId: string;
      inputDerivativeId: string;
      inputGeneration: string;
    };
    boundaries: {
      originalRemainsSourceTruth: true;
      inputDerivativeRemainsUnchanged: true;
      analysisDoesNotChangeMedia: true;
      observationsRequireHumanInterpretation: true;
    };
  };
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
  mediaProjection: string;
  sourceRevisionId?: string;
  externalReferenceId?: string;
  sourceSetId?: string;
};

type GoogleDriveConformPlan = {
  schema: "quipsly-google-drive-source-conform-plan-v1";
  sourceUnit: {
    id: string;
    title: string;
    captureKey: string | null;
  };
  status:
    | "render-ready"
    | "held"
    | "ready-to-bind"
    | "preparing"
    | "needs-preparation";
  holds: string[];
  storage: {
    totalBytes: string;
    originalBytes: string;
    cachedBytes: string;
    remainingBytes: string;
    shortfallBytes: string;
    executor: {
      status: "measured" | "unavailable";
      safeAvailableBytes: string | null;
      availableBytes: string | null;
      reserveBytes: string | null;
      measuredAt: string | null;
      localPathWithheld: true;
    };
  };
  members: Array<{
    referenceId: string;
    sourceRevisionId: string;
    name: string;
    role: "browse-proxy" | "primary-original" | "secondary-original";
    channel: string | null;
    sizeBytes: string;
    durationSeconds: number | null;
    sourceState: string;
    exactReplicaReady: boolean;
    materializationJob: null | {
      id: string;
      status: string;
      failureCode: string | null;
      transferredBytes: number | null;
      totalBytes: number | null;
      updatedAt: string;
    };
  }>;
  sourceSet: null | {
    id: string;
    identitySha256: string;
    completeness: string;
  };
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  currentRevision?: number | null;
  workspace?: SourceStoryWorkspace;
  operation?: { document?: { id?: string } } | GoogleDriveConformPlan;
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

function dbfsPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    2,
    Math.min(100, ((Math.max(-72, Math.min(0, value)) + 72) / 72) * 100),
  );
}

function SourceNavigationRail({
  visualOverview,
  audioNavigation,
  durationSeconds,
  playbackSeconds,
  canWrite,
  pending,
  sourceRevisionId,
  sourceLabel,
  onSeek,
  onRequestAudio,
}: {
  visualOverview: MediaDerivative | null;
  audioNavigation: SourceAudioNavigationStatus | null;
  durationSeconds: number;
  playbackSeconds: number;
  canWrite: boolean;
  pending: boolean;
  sourceRevisionId: string | null;
  sourceLabel: string;
  onSeek: (seconds: number) => void;
  onRequestAudio: (
    sourceRevisionId: string,
    label: string,
    retryFailed?: boolean,
  ) => void;
}) {
  const frames = visualOverview?.navigationFrames;
  const evidence = audioNavigation?.evidence;
  const effectiveDuration = evidence?.durationSeconds ?? durationSeconds;
  const waveform = evidence?.waveform ?? [];
  const current = Math.max(
    0,
    Math.min(effectiveDuration || 0, playbackSeconds),
  );
  return (
    <section
      className="rounded-3xl border border-[#34302c] bg-[#201e1b] p-4 text-[#fffaf0] shadow-lg"
      aria-labelledby="source-navigation-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8bd91]">
            Source-clock navigation
          </p>
          <h2
            id="source-navigation-heading"
            className="mt-1 font-serif text-xl font-black"
          >
            See it. Hear it. Mark it.
          </h2>
        </div>
        <p className="max-w-md text-xs font-semibold leading-5 text-[#d8ccb8]">
          Every frame and waveform window is derived from one verified proxy
          generation. Clicking here only moves the playhead; I and O create the
          retained decision.
        </p>
      </div>

      {frames && visualOverview ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#e1c697]">
              Visual filmstrip · {frames.sampleTimesSeconds.length} source-time
              samples
            </p>
            <p className="font-mono text-[10px] font-bold text-[#d8ccb8]">
              {formatClock(current)} / {formatClock(effectiveDuration)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {frames.sampleTimesSeconds.map((sampleSeconds, index) => {
              const column = index % frames.columns;
              const row = Math.floor(index / frames.columns);
              const x =
                frames.columns === 1
                  ? 0
                  : (column / (frames.columns - 1)) * 100;
              const y = frames.rows === 1 ? 0 : (row / (frames.rows - 1)) * 100;
              const active =
                Math.abs(current - sampleSeconds) <=
                Math.max(
                  0.1,
                  effectiveDuration / frames.sampleTimesSeconds.length / 2,
                );
              return (
                <button
                  key={`${sampleSeconds}:${index}`}
                  type="button"
                  onClick={() => onSeek(sampleSeconds)}
                  aria-label={`Seek to visual sample at ${formatClock(sampleSeconds)}`}
                  aria-current={active ? "true" : undefined}
                  className={`group relative aspect-video min-h-11 overflow-hidden rounded-xl border-2 bg-black outline-none transition focus-visible:ring-4 focus-visible:ring-sky-300 ${active ? "border-sky-300" : "border-white/15 hover:border-white/60"}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-no-repeat"
                    style={{
                      backgroundImage: `url(${visualOverview.playbackUrl})`,
                      backgroundSize: `${frames.columns * 100}% ${frames.rows * 100}%`,
                      backgroundPosition: `${x}% ${y}%`,
                    }}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-1 text-center font-mono text-[9px] font-black text-white">
                    {formatClock(sampleSeconds)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        {!audioNavigation && sourceRevisionId ? (
          <button
            type="button"
            disabled={!canWrite || pending}
            onClick={() => onRequestAudio(sourceRevisionId, sourceLabel)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-sky-300/50 bg-sky-200/10 px-4 text-xs font-black text-sky-100 disabled:opacity-45"
          >
            <AudioWaveform size={17} aria-hidden="true" />
            Decode waveform and audio shape
          </button>
        ) : audioNavigation &&
          ["queued", "processing"].includes(audioNavigation.status) ? (
          <p
            role="status"
            className="flex min-h-12 items-center justify-center gap-2 text-xs font-black text-sky-100"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {audioNavigation.status === "processing"
              ? "Decoding every audio frame…"
              : "Waveform decode queued…"}
          </p>
        ) : audioNavigation?.status === "failed" && sourceRevisionId ? (
          <button
            type="button"
            disabled={!canWrite || pending}
            onClick={() => onRequestAudio(sourceRevisionId, sourceLabel, true)}
            className="min-h-12 w-full rounded-xl border border-rose-300 bg-rose-100/10 px-4 text-xs font-black text-rose-100 disabled:opacity-45"
          >
            Retry audio evidence ·{" "}
            {audioNavigation.failureCode ?? "integrity or worker failure"}
          </button>
        ) : evidence ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-black">
                <AudioWaveform
                  size={16}
                  className="text-sky-300"
                  aria-hidden="true"
                />
                Complete-decode waveform ·{" "}
                {evidence.sampleRate.toLocaleString()} Hz ·{" "}
                {evidence.channelCount} channel
                {evidence.channelCount === 1 ? "" : "s"}
              </p>
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${evidence.signalStatus === "signal-present" ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : "border-amber-300/50 bg-amber-300/10 text-amber-100"}`}
              >
                {evidence.signalStatus.replaceAll("-", " ")}
              </span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                onSeek(
                  ((event.clientX - bounds.left) / Math.max(1, bounds.width)) *
                    effectiveDuration,
                );
              }}
              aria-label={`Waveform for ${sourceLabel}. Click to seek. Current position ${formatClock(current)}.`}
              className="relative mt-3 flex h-28 min-h-11 w-full items-end gap-px overflow-hidden rounded-xl border border-white/10 bg-black/50 px-2 pb-2 pt-3 outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.9)]"
                style={{
                  left: `${effectiveDuration > 0 ? (current / effectiveDuration) * 100 : 0}%`,
                }}
              />
              {waveform.map((point, index) => (
                <span
                  key={`${point.startSeconds}:${index}`}
                  aria-hidden="true"
                  className={`min-w-0 flex-1 rounded-t-sm ${point.clippedFrameCount > 0 ? "bg-rose-400" : point.rmsDbfs <= -60 ? "bg-zinc-600" : "bg-sky-300"}`}
                  style={{ height: `${dbfsPercent(point.rmsDbfs)}%` }}
                />
              ))}
            </button>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#e1c697]">
              Exact playhead · {formatClock(current)}
              <input
                type="range"
                min={0}
                max={Math.max(0.01, effectiveDuration)}
                step={0.01}
                value={current}
                onChange={(event) => onSeek(Number(event.target.value))}
                className="mt-2 block min-h-11 w-full accent-sky-300"
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] font-bold">
                <span className="block uppercase text-[#d8bd91]">Average</span>
                <span className="mt-1 block font-mono text-sm text-white">
                  {evidence.rmsDbfs.toFixed(1)} dBFS
                </span>
              </p>
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] font-bold">
                <span className="block uppercase text-[#d8bd91]">
                  Sample peak
                </span>
                <span className="mt-1 block font-mono text-sm text-white">
                  {evidence.samplePeakDbfs.toFixed(1)} dBFS
                </span>
              </p>
              <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] font-bold">
                <span className="block uppercase text-[#d8bd91]">
                  Stereo balance
                </span>
                <span className="mt-1 block font-mono text-sm text-white">
                  {evidence.stereoBalanceDb === null
                    ? "Mono"
                    : `${evidence.stereoBalanceDb.toFixed(1)} dB`}
                </span>
              </p>
            </div>
            {evidence.frequencyBands.length ? (
              <div
                className="mt-3"
                aria-label="Broad frequency energy overview"
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-[#e1c697]">
                  Audio shape · measured, not an EQ decision
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {evidence.frequencyBands.map((band, index) => (
                    <div
                      key={band.id}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-center"
                    >
                      <div
                        aria-hidden="true"
                        className="mx-auto flex h-12 w-3 items-end overflow-hidden rounded-full bg-black/40"
                      >
                        <span
                          className="w-full rounded-full bg-violet-300"
                          style={{
                            height: `${dbfsPercent(evidence.overallBandRmsDbfs[index] ?? -72)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[9px] font-black text-[#f0dfc1]">
                        {band.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {evidence.observations.length ? (
              <div className="mt-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-200">
                  Measured attention points · human interpretation required
                </p>
                <ul className="mt-2 space-y-2">
                  {evidence.observations.map((observation, index) => (
                    <li
                      key={`${observation.kind}:${observation.startSeconds}:${index}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSeek(observation.startSeconds)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-200/10 px-3 text-left text-[10px] font-bold text-amber-50"
                      >
                        <span>{observation.detail}</span>
                        <span className="shrink-0 font-mono">
                          {formatClock(observation.startSeconds)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black text-[#d8ccb8]">
        <span className="rounded-full border border-white/10 px-3 py-2">
          Space / K · play-pause
        </span>
        <span className="rounded-full border border-white/10 px-3 py-2">
          <SkipBack size={12} className="mr-1 inline" aria-hidden="true" />← 1s
          · J 5s
        </span>
        <span className="rounded-full border border-white/10 px-3 py-2">
          <SkipForward size={12} className="mr-1 inline" aria-hidden="true" />→
          1s · L 5s
        </span>
        <span className="rounded-full border border-white/10 px-3 py-2">
          I / O · mark range
        </span>
      </div>
    </section>
  );
}

function sourceStateLabel(value: string) {
  if (value === "checksum-bound") return "Checksum-bound source";
  if (value === "identity-unverified")
    return "Registered identity · exact bytes still need verification";
  return value.replaceAll("-", " ");
}

function boardGroupLabel(value: string) {
  if (value === "unassigned") return "Unassigned story beat";
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function boardKeyFromLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

function reconcileWorkspaceInventory(
  current: SourceStoryWorkspace,
  next: SourceStoryWorkspace,
): SourceStoryWorkspace {
  return {
    ...next,
    sourceSets: mergeById(current.sourceSets, next.sourceSets),
    externalSources: mergeById(current.externalSources, next.externalSources),
  };
}

function sourceHref(
  projectSlug: string,
  source: { kind: "asset" | "external" | "source-set"; id: string } | null,
  boardId: string | null,
) {
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
  initialSourcePageInfo,
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
  initialSourcePageInfo: SourcePageInfo;
  spatialRenderReadiness: SpatialRenderReadinessReport;
  initialAssetId: string | null;
  initialExternalReferenceId: string | null;
  initialSourceSetId: string | null;
  initialBoardId: string | null;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const pendingPlaybackRef = useRef<{
    sourceKey: string;
    startSeconds: number;
    endSeconds: number;
  } | null>(null);
  const playbackBoundaryRef = useRef<number | null>(null);
  const sourceSearchSequenceRef = useRef(0);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [sourceAssets, setSourceAssets] = useState(initialAssets);
  const [sourcePageInfo, setSourcePageInfo] = useState(initialSourcePageInfo);
  const [sourceAllTotal] = useState(initialSourcePageInfo.totals.all);
  const [sourceServerQuery, setSourceServerQuery] = useState("");
  const [sourcePagePending, setSourcePagePending] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(initialAssetId);
  const [selectedExternalReferenceId, setSelectedExternalReferenceId] =
    useState<string | null>(initialExternalReferenceId);
  const [selectedSourceSetId, setSelectedSourceSetId] = useState<string | null>(
    initialSourceSetId,
  );
  const [selectedBoardId, setSelectedBoardId] = useState(initialBoardId);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceCollection, setSourceCollection] = useState<
    SourceLibraryCollection | `collection:${string}`
  >("all");
  const [sourceMediaFilter, setSourceMediaFilter] =
    useState<SourceLibraryMediaFilter>("all");
  const [sourceGroupMode, setSourceGroupMode] =
    useState<SourceLibraryGroupMode>("capture-day");
  const [sourceSortMode, setSourceSortMode] =
    useState<SourceLibrarySortMode>("newest");
  const [sourceViewMode, setSourceViewMode] = useState<"grid" | "list">("grid");
  const [sourceVisibleLimit, setSourceVisibleLimit] = useState(60);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionScope, setCollectionScope] = useState<
    "personal" | "project"
  >("personal");
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [notes, setNotes] = useState("");
  const [purpose, setPurpose] = useState("select");
  const [groupKey, setGroupKey] = useState("unassigned");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [preserve360, setPreserve360] = useState(Boolean(initialSourceSetId));
  const [spatialView, setSpatialView] = useState<SpatialView>({
    panDegrees: 0,
    tiltDegrees: 0,
    fieldOfViewDegrees: 75,
  });
  const [reframeKeyframes, setReframeKeyframes] = useState<
    StoryReframeKeyframe[]
  >([]);
  const [reframeAspectRatio, setReframeAspectRatio] = useState<
    "16:9" | "9:16" | "1:1" | "4:5"
  >("16:9");
  const [boardTitle, setBoardTitle] = useState("Main story");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardEpisodeId, setBoardEpisodeId] = useState("");
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionSynopsis, setSectionSynopsis] = useState("");
  const [boardView, setBoardView] = useState<"cards" | "outline">("cards");
  const [pending, setPending] = useState(false);
  const [conformPending, setConformPending] = useState(false);
  const [conformSourceUnitId, setConformSourceUnitId] = useState<string | null>(
    null,
  );
  const [conformPlan, setConformPlan] = useState<GoogleDriveConformPlan | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset =
    sourceAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedExternalSource =
    workspace.externalSources.find(
      (source) => source.id === selectedExternalReferenceId,
    ) ?? null;
  const selectedSourceSet =
    workspace.sourceSets.find(
      (sourceSet) => sourceSet.id === selectedSourceSetId,
    ) ?? null;
  const selectedExternalProxy =
    selectedExternalSource?.latestSourceRevision?.collaborationProxy ?? null;
  const selectedSourceSetProxy =
    selectedSourceSet?.sourceClockRevision.collaborationProxy ?? null;
  const selectedVisualOverview =
    selectedSourceSet?.sourceClockRevision.visualOverview ??
    selectedExternalSource?.latestSourceRevision?.visualOverview ??
    null;
  const selectedAudioNavigation =
    selectedSourceSet?.sourceClockRevision.audioNavigation ??
    selectedExternalSource?.latestSourceRevision?.audioNavigation ??
    null;
  const selectedViewerSource: ViewerSource | null =
    selectedSourceSet &&
    selectedSourceSetProxy &&
    selectedSourceSet.sourceClockRevision.externalReference
      ? {
          key: `source-set:${selectedSourceSet.id}`,
          kind: "source-set",
          id: selectedSourceSet.id,
          filename: selectedSourceSet.displayName,
          url: selectedSourceSetProxy.playbackUrl,
          mimeType: selectedSourceSetProxy.mimeType,
          duration:
            selectedSourceSetProxy.durationSeconds ??
            selectedSourceSet.sourceClockRevision.durationSeconds,
          thumbnailUrl:
            selectedSourceSet.sourceClockRevision.visualOverview?.playbackUrl ??
            null,
          is360: selectedSourceSet.kind === "insta360-360",
          mediaProjection:
            selectedSourceSet.sourceClockRevision.mediaProjection,
          sourceRevisionId: selectedSourceSet.sourceClockRevision.id,
          externalReferenceId:
            selectedSourceSet.sourceClockRevision.externalReference.id,
          sourceSetId: selectedSourceSet.id,
        }
      : selectedExternalSource && selectedExternalProxy
        ? {
            key: `external:${selectedExternalSource.id}`,
            kind: "external",
            id: selectedExternalSource.id,
            filename: selectedExternalSource.fileName,
            url: selectedExternalProxy.playbackUrl,
            mimeType: selectedExternalProxy.mimeType,
            duration: selectedExternalProxy.durationSeconds,
            thumbnailUrl:
              selectedExternalSource.latestSourceRevision?.visualOverview
                ?.playbackUrl ?? null,
            is360: false,
            mediaProjection: "flat",
            sourceRevisionId: selectedExternalSource.latestSourceRevision?.id,
            externalReferenceId: selectedExternalSource.id,
          }
        : selectedAsset
          ? {
              key: `asset:${selectedAsset.id}`,
              kind: "asset",
              id: selectedAsset.id,
              filename: selectedAsset.filename,
              url: selectedAsset.url,
              mimeType: selectedAsset.mimeType,
              duration: selectedAsset.duration,
              thumbnailUrl: selectedAsset.thumbnailUrl,
              is360: false,
              mediaProjection: "flat",
            }
          : null;
  const selectedBoard =
    workspace.boards.find((board) => board.id === selectedBoardId) ??
    workspace.boards[0] ??
    null;
  const sourceLibraryItems = useMemo(
    () =>
      buildSourceLibraryItems({
        assets: sourceAssets,
        externalSources: workspace.externalSources,
        sourceSets: workspace.sourceSets,
        cards: workspace.cards,
        boards: workspace.boards,
      }),
    [
      sourceAssets,
      workspace.boards,
      workspace.cards,
      workspace.externalSources,
      workspace.sourceSets,
    ],
  );
  const sourceStats = useMemo(
    () => sourceLibraryStats(sourceLibraryItems),
    [sourceLibraryItems],
  );
  const filteredSourceLibraryItems = useMemo(() => {
    const customCollection = sourceCollection.startsWith("collection:")
      ? (workspace.sourceCollections.find(
          (collection) => `collection:${collection.id}` === sourceCollection,
        ) ?? null)
      : null;
    const allowedKeys = customCollection
      ? new Set(customCollection.items.map((item) => item.targetKey))
      : null;
    return filterSourceLibraryItems(sourceLibraryItems, {
      collection: customCollection
        ? "all"
        : (sourceCollection as SourceLibraryCollection),
      mediaFilter: sourceMediaFilter,
      query: sourceQuery,
      sort: sourceSortMode,
    }).filter((item) => !allowedKeys || allowedKeys.has(item.key));
  }, [
    sourceCollection,
    sourceLibraryItems,
    sourceMediaFilter,
    sourceQuery,
    sourceSortMode,
    workspace.sourceCollections,
  ]);
  const visibleSourceLibraryItems = useMemo(
    () => filteredSourceLibraryItems.slice(0, sourceVisibleLimit),
    [filteredSourceLibraryItems, sourceVisibleLimit],
  );
  const sourceLibraryGroups = useMemo(
    () => groupSourceLibraryItems(visibleSourceLibraryItems, sourceGroupMode),
    [sourceGroupMode, visibleSourceLibraryItems],
  );
  const selectedBoardCardIds = useMemo(
    () =>
      new Set(
        selectedBoard?.placements.map((placement) => placement.cardId) ?? [],
      ),
    [selectedBoard],
  );
  const cardsAvailableForBoard = workspace.cards.filter(
    (card) => !selectedBoardCardIds.has(card.id),
  );
  const boardGroups = useMemo(() => {
    if (!selectedBoard) return [];
    const groups = new Map(
      selectedBoard.sections.map((section) => [
        section.key,
        { section, placements: [] as SourceStoryBoardPlacement[] },
      ]),
    );
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
      .sort(
        (left, right) =>
          left.section.sortOrder - right.section.sortOrder ||
          left.section.title.localeCompare(right.section.title),
      );
  }, [selectedBoard]);
  const boardGroupKeys = useMemo(
    () => boardGroups.map((group) => group.groupKey),
    [boardGroups],
  );
  const spatialStatus = spatialRenderReadiness.readiness.status;

  useEffect(() => {
    if (!selectedBoardId && workspace.boards[0])
      setSelectedBoardId(workspace.boards[0].id);
  }, [selectedBoardId, workspace.boards]);

  useEffect(() => {
    setSourceVisibleLimit(60);
  }, [
    sourceCollection,
    sourceGroupMode,
    sourceMediaFilter,
    sourceQuery,
    sourceSortMode,
  ]);

  useEffect(() => {
    const query = sourceQuery.trim().replace(/\s+/g, " ").slice(0, 160);
    if (query === sourceServerQuery) return;
    const sequence = sourceSearchSequenceRef.current + 1;
    sourceSearchSequenceRef.current = sequence;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSourcePagePending(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "60" });
        if (query) params.set("query", query);
        const response = await fetch(
          `/api/nests/${encodeURIComponent(project.slug)}/source-story/sources?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as SourceLibraryPagePayload;
        if (!response.ok || !payload.page)
          throw new Error(
            payload.error || "The source-library search could not be loaded.",
          );
        if (sourceSearchSequenceRef.current !== sequence) return;
        setSourceAssets((current) =>
          mergeById(
            payload.page!.assets,
            current.filter((asset) => asset.id === selectedAssetId),
          ),
        );
        setWorkspace((current) => ({
          ...current,
          sourceSets: mergeById(
            payload.page!.sourceSets,
            current.sourceSets.filter(
              (sourceSet) => sourceSet.id === selectedSourceSetId,
            ),
          ),
          externalSources: mergeById(
            payload.page!.externalSources,
            current.externalSources.filter(
              (source) => source.id === selectedExternalReferenceId,
            ),
          ),
        }));
        setSourcePageInfo(payload.page.pageInfo);
        setSourceServerQuery(query);
        setSourceVisibleLimit(60);
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setError(
          searchError instanceof Error
            ? searchError.message
            : "The source-library search could not be loaded.",
        );
      } finally {
        if (sourceSearchSequenceRef.current === sequence)
          setSourcePagePending(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    project.slug,
    selectedAssetId,
    selectedExternalReferenceId,
    selectedSourceSetId,
    sourceQuery,
    sourceServerQuery,
  ]);

  useEffect(() => {
    const pendingPlayback = pendingPlaybackRef.current;
    const media = mediaRef.current;
    if (
      !pendingPlayback ||
      pendingPlayback.sourceKey !== selectedViewerSource?.key ||
      !media
    )
      return;
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
    const waiting =
      workspace.externalSources.some(
        (source) =>
          ["queued", "processing"].includes(
            source.latestSourceRevision?.proxyJob?.status ?? "",
          ) ||
          ["queued", "processing"].includes(
            source.latestSourceRevision?.materializationJob?.status ?? "",
          ) ||
          ["queued", "processing"].includes(
            source.latestSourceRevision?.visualOverviewJob?.status ?? "",
          ) ||
          ["queued", "processing"].includes(
            source.latestSourceRevision?.audioNavigation?.status ?? "",
          ),
      ) ||
      workspace.sourceSets.some(
        (sourceSet) =>
          ["queued", "processing"].includes(
            sourceSet.sourceClockRevision.visualOverviewJob?.status ?? "",
          ) ||
          ["queued", "processing"].includes(
            sourceSet.sourceClockRevision.audioNavigation?.status ?? "",
          ),
      );
    if (!waiting) return;
    const timer = window.setInterval(() => {
      void refreshWorkspace().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [workspace.externalSources, workspace.sourceSets]);

  useEffect(() => {
    const waiting = workspace.spatialRenderJobs.some((job) =>
      ["queued", "processing"].includes(job.status),
    );
    if (!waiting) return;
    const timer = window.setInterval(() => {
      void refreshWorkspace().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [workspace.spatialRenderJobs]);

  useEffect(() => {
    if (pending) return;
    const ready = workspace.spatialRenderJobs.find(
      (job) => job.status === "output-ready",
    );
    if (!ready) return;
    void mutate(
      { action: "register-spatial-reframe", jobId: ready.id },
      "Verified and attached the finished spatial render to its exact Episode placement.",
    );
  }, [pending, workspace.spatialRenderJobs]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLAnchorElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (event.key.toLowerCase() === "i") {
        if (mediaRef.current) setInPoint(mediaRef.current.currentTime);
        event.preventDefault();
      }
      if (event.key.toLowerCase() === "o") {
        if (mediaRef.current) setOutPoint(mediaRef.current.currentTime);
        event.preventDefault();
      }
      if (event.key === " " || event.key.toLowerCase() === "k") {
        const media = mediaRef.current;
        if (media) {
          if (media.paused) void media.play().catch(() => undefined);
          else media.pause();
          event.preventDefault();
        }
      }
      const key = event.key.toLowerCase();
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        key === "j" ||
        key === "l"
      ) {
        const media = mediaRef.current;
        if (media) {
          const backward = event.key === "ArrowLeft" || key === "j";
          const distance = event.shiftKey || key === "j" || key === "l" ? 5 : 1;
          const next = Math.max(
            0,
            Math.min(
              Number.isFinite(media.duration)
                ? media.duration
                : Number.MAX_SAFE_INTEGER,
              media.currentTime + (backward ? -distance : distance),
            ),
          );
          media.currentTime = next;
          setPlaybackSeconds(next);
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function refreshWorkspace() {
    const response = await fetch(
      `/api/nests/${encodeURIComponent(project.slug)}/source-story`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as ApiPayload;
    if (!response.ok || !payload.workspace)
      throw new Error(
        payload.error || "The shared story workspace could not be refreshed.",
      );
    setWorkspace((current) =>
      reconcileWorkspaceInventory(current, payload.workspace!),
    );
    return payload.workspace;
  }

  async function loadMoreSources() {
    if (
      sourcePagePending ||
      sourcePageInfo.complete ||
      !sourcePageInfo.nextCursor
    )
      return;
    setSourcePagePending(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cursor: sourcePageInfo.nextCursor,
        limit: "60",
      });
      if (sourceServerQuery) params.set("query", sourceServerQuery);
      const response = await fetch(
        `/api/nests/${encodeURIComponent(project.slug)}/source-story/sources?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as SourceLibraryPagePayload;
      if (!response.ok || !payload.page)
        throw new Error(
          payload.error || "The next source-library page could not be loaded.",
        );
      setSourceAssets((current) => mergeById(current, payload.page!.assets));
      setWorkspace((current) => ({
        ...current,
        sourceSets: mergeById(current.sourceSets, payload.page!.sourceSets),
        externalSources: mergeById(
          current.externalSources,
          payload.page!.externalSources,
        ),
      }));
      setSourcePageInfo(payload.page.pageInfo);
      setSourceVisibleLimit((current) =>
        Math.max(
          current,
          sourceLibraryItems.length + payload.page!.pageInfo.returned,
        ),
      );
    } catch (pageError) {
      setError(
        pageError instanceof Error
          ? pageError.message
          : "The next source-library page could not be loaded.",
      );
    } finally {
      setSourcePagePending(false);
    }
  }

  async function createCollection() {
    if (!collectionTitle.trim()) return;
    const next = await mutate(
      {
        action: "create-source-collection",
        clientRequestId: crypto.randomUUID(),
        title: collectionTitle,
        description: collectionDescription,
        scope: collectionScope,
      },
      collectionScope === "personal"
        ? `Created your ${collectionTitle.trim()} source collection.`
        : `Created ${collectionTitle.trim()} for everyone in this Nest.`,
    );
    if (next) {
      const created = next.sourceCollections.find(
        (collection) => collection.title === collectionTitle.trim(),
      );
      if (created) setSourceCollection(`collection:${created.id}`);
      setCollectionTitle("");
      setCollectionDescription("");
    }
  }

  async function toggleSourceCollection(
    collection: SourceCollection,
    item: {
      kind: "source-set" | "external" | "asset";
      id: string;
      key: string;
    },
  ) {
    const filed = collection.items.some(
      (candidate) => candidate.targetKey === item.key,
    );
    await mutate(
      {
        action: filed
          ? "remove-source-from-collection"
          : "add-source-to-collection",
        collectionId: collection.id,
        expectedRevision: collection.revision,
        clientRequestId: crypto.randomUUID(),
        sourceKind: item.kind,
        sourceId: item.id,
      },
      filed
        ? `Removed this source from ${collection.title}. The source and its story uses remain unchanged.`
        : `Filed this source in ${collection.title} without copying its media.`,
    );
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(project.slug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.workspace) {
        if (response.status === 409) await refreshWorkspace();
        throw new Error(
          payload.error || "The story operation could not be saved.",
        );
      }
      setWorkspace((current) =>
        reconcileWorkspaceInventory(current, payload.workspace!),
      );
      setMessage(successMessage);
      return payload.workspace;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The story operation could not be saved.",
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  function chooseAsset(
    assetId: string,
    pendingPlayback: {
      sourceKey: string;
      startSeconds: number;
      endSeconds: number;
    } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(assetId);
    setSelectedExternalReferenceId(null);
    setSelectedSourceSetId(null);
    setInPoint(null);
    setOutPoint(null);
    setPlaybackSeconds(0);
    setMessage(null);
    setError(null);
    window.history.replaceState(
      null,
      "",
      sourceHref(
        project.slug,
        { kind: "asset", id: assetId },
        selectedBoard?.id ?? null,
      ),
    );
  }

  function chooseExternalSource(
    referenceId: string,
    pendingPlayback: {
      sourceKey: string;
      startSeconds: number;
      endSeconds: number;
    } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(null);
    setSelectedExternalReferenceId(referenceId);
    setSelectedSourceSetId(null);
    setInPoint(null);
    setOutPoint(null);
    setPlaybackSeconds(0);
    setMessage(null);
    setError(null);
    window.history.replaceState(
      null,
      "",
      sourceHref(
        project.slug,
        { kind: "external", id: referenceId },
        selectedBoard?.id ?? null,
      ),
    );
  }

  function chooseSourceSet(
    sourceSetId: string,
    pendingPlayback: {
      sourceKey: string;
      startSeconds: number;
      endSeconds: number;
    } | null = null,
  ) {
    pendingPlaybackRef.current = pendingPlayback;
    playbackBoundaryRef.current = null;
    mediaRef.current?.pause();
    setSelectedAssetId(null);
    setSelectedExternalReferenceId(null);
    setSelectedSourceSetId(sourceSetId);
    setInPoint(null);
    setOutPoint(null);
    setPlaybackSeconds(0);
    setPreserve360(true);
    setReframeKeyframes([]);
    setSpatialView({ panDegrees: 0, tiltDegrees: 0, fieldOfViewDegrees: 75 });
    setMessage(null);
    setError(null);
    window.history.replaceState(
      null,
      "",
      sourceHref(
        project.slug,
        { kind: "source-set", id: sourceSetId },
        selectedBoard?.id ?? null,
      ),
    );
  }

  function playSourceRange(
    source: { kind: "asset" | "external" | "source-set"; id: string },
    startSeconds: number,
    endSeconds: number,
  ) {
    const sourceKey = `${source.kind}:${source.id}`;
    const playback = { sourceKey, startSeconds, endSeconds };
    if (selectedViewerSource?.key !== sourceKey || !mediaRef.current) {
      if (source.kind === "asset") chooseAsset(source.id, playback);
      else if (source.kind === "external")
        chooseExternalSource(source.id, playback);
      else chooseSourceSet(source.id, playback);
      return;
    }
    playbackBoundaryRef.current = endSeconds;
    mediaRef.current.currentTime = startSeconds;
    void mediaRef.current.play().catch(() => {
      playbackBoundaryRef.current = null;
    });
  }

  function stopAtSourceRangeBoundary(
    event: React.SyntheticEvent<HTMLMediaElement>,
  ) {
    setPlaybackSeconds(event.currentTarget.currentTime);
    const boundary = playbackBoundaryRef.current;
    if (boundary === null || event.currentTarget.currentTime < boundary - 0.005)
      return;
    event.currentTarget.pause();
    event.currentTarget.currentTime = boundary;
    playbackBoundaryRef.current = null;
  }

  async function createBoard() {
    const next = await mutate(
      {
        action: "create-board",
        clientRequestId: crypto.randomUUID(),
        title: boardTitle,
        description: boardDescription,
        episodeProductionId: boardEpisodeId || null,
        kind: boardEpisodeId ? "episode" : "story",
      },
      "Created a revisioned story board. No source media changed.",
    );
    if (next?.boards[0]) setSelectedBoardId(next.boards[0].id);
  }

  async function createCard() {
    if (!selectedViewerSource || inPoint === null || outPoint === null) return;
    const board =
      workspace.boards.find((candidate) => candidate.id === selectedBoardId) ??
      null;
    const next = await mutate(
      {
        action: "create-card",
        clientRequestId: crypto.randomUUID(),
        mediaAssetId:
          selectedViewerSource.kind === "asset"
            ? selectedViewerSource.id
            : null,
        sourceRevisionId:
          selectedViewerSource.kind !== "asset"
            ? (selectedViewerSource.sourceRevisionId ?? null)
            : null,
        sourceSetId:
          selectedViewerSource.kind === "source-set"
            ? (selectedViewerSource.sourceSetId ?? null)
            : null,
        externalReferenceId:
          selectedViewerSource.kind !== "asset"
            ? (selectedViewerSource.externalReferenceId ?? null)
            : null,
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
        reframeRecipe:
          preserve360 || selectedViewerSource.is360
            ? {
                schema: "quipsly-360-reframe-v1",
                projection: "equirectangular",
                aspectRatio: reframeAspectRatio,
                stabilization: "source",
                horizonLock: true,
                keyframes: reframeKeyframes,
              }
            : null,
      },
      board
        ? `Saved the source-backed card to ${board.title}.`
        : "Saved an unfiled source-backed card.",
    );
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
    if (
      !media ||
      inPoint === null ||
      outPoint === null ||
      media.currentTime < inPoint ||
      media.currentTime > outPoint
    ) {
      setError(
        "Set an in and out point, then place the playhead inside that range before saving a camera view.",
      );
      return;
    }
    const next: StoryReframeKeyframe = {
      sourceSeconds: Math.round(media.currentTime * 1_000_000) / 1_000_000,
      panDegrees: Math.round(spatialView.panDegrees * 1000) / 1000,
      tiltDegrees: Math.round(spatialView.tiltDegrees * 1000) / 1000,
      rollDegrees: 0,
      fieldOfViewDegrees:
        Math.round(spatialView.fieldOfViewDegrees * 1000) / 1000,
      interpolation: "ease",
    };
    setReframeKeyframes((current) =>
      [
        ...current.filter(
          (keyframe) =>
            Math.abs(keyframe.sourceSeconds - next.sourceSeconds) > 0.0005,
        ),
        next,
      ].sort((left, right) => left.sourceSeconds - right.sourceSeconds),
    );
    setPreserve360(true);
    setError(null);
    setMessage(
      `Saved a non-destructive camera view at ${formatClock(next.sourceSeconds)}. The source remains full 360°.`,
    );
  }

  async function requestProxy(
    source: SourceStoryWorkspace["externalSources"][number],
    retryFailed = false,
  ) {
    if (!source.latestSourceRevision) return;
    const needsDriveMaterialization =
      source.provider === "google-drive" &&
      source.latestSourceRevision.memberRole === "browse-proxy" &&
      !source.latestSourceRevision.exactReplica;
    await mutate(
      {
        action: needsDriveMaterialization
          ? "prepare-google-drive-source"
          : "request-external-proxy",
        referenceId: source.id,
        sourceRevisionId: source.latestSourceRevision.id,
        clientRequestId: crypto.randomUUID(),
        retryFailed,
      },
      retryFailed
        ? needsDriveMaterialization
          ? `Retrying the exact Drive LRV transfer for ${source.fileName}.`
          : `Retrying the verified proxy for ${source.fileName}.`
        : needsDriveMaterialization
          ? "Preparing the exact Drive LRV, then Quipsly will build its lightweight collaboration proxy."
          : `Queued a verified proxy for ${source.fileName}.`,
    );
  }

  async function inspectOrPrepareDriveConform(
    sourceUnitId: string,
    options: {
      prepare?: boolean;
      expectedRemainingBytes?: string;
      retryFailed?: boolean;
    } = {},
  ) {
    setConformPending(true);
    setError(null);
    setMessage(null);
    setConformSourceUnitId(sourceUnitId);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(project.slug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: options.prepare
              ? "prepare-google-drive-source-conform"
              : "plan-google-drive-source-conform",
            sourceUnitId,
            clientRequestId: options.prepare ? crypto.randomUUID() : undefined,
            expectedRemainingBytes: options.expectedRemainingBytes,
            retryFailed: options.retryFailed === true,
          }),
        },
      );
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.operation) {
        throw new Error(
          payload.error || "Final render preflight could not be refreshed.",
        );
      }
      const plan = payload.operation as GoogleDriveConformPlan;
      if (plan.schema !== "quipsly-google-drive-source-conform-plan-v1") {
        throw new Error("Final render preflight returned an invalid receipt.");
      }
      setConformPlan(plan);
      if (payload.workspace) {
        setWorkspace((current) =>
          reconcileWorkspaceInventory(current, payload.workspace!),
        );
      }
      setMessage(
        plan.status === "render-ready"
          ? "This camera package is exact, complete, and ready for the editor."
          : options.prepare
            ? "Exact camera files are queued for this Mac. You can leave and return; verified progress is retained."
            : "Final render preflight refreshed without downloading media.",
      );
    } catch (conformError) {
      setError(
        conformError instanceof Error
          ? conformError.message
          : "Final render preflight could not be refreshed.",
      );
    } finally {
      setConformPending(false);
    }
  }

  async function requestVisualOverview(
    sourceRevisionId: string,
    label: string,
    retryFailed = false,
  ) {
    await mutate(
      {
        action: "request-source-visual-overview",
        sourceRevisionId,
        clientRequestId: crypto.randomUUID(),
        retryFailed,
      },
      retryFailed
        ? `Retrying the checksum-bound contact sheet for ${label}.`
        : `Queued a checksum-bound contact sheet for ${label}.`,
    );
  }

  async function requestAudioNavigation(
    sourceRevisionId: string,
    label: string,
    retryFailed = false,
  ) {
    await mutate(
      {
        action: "request-source-audio-navigation",
        sourceRevisionId,
        clientRequestId: crypto.randomUUID(),
        retryFailed,
      },
      retryFailed
        ? `Retrying the complete-decode waveform for ${label}.`
        : `Queued complete-decode waveform and frequency evidence for ${label}.`,
    );
  }

  function seekSelectedSource(seconds: number) {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(seconds)) return;
    const duration = Number.isFinite(media.duration)
      ? media.duration
      : (selectedViewerSource?.duration ?? seconds);
    const next = Math.max(0, Math.min(duration, seconds));
    playbackBoundaryRef.current = null;
    media.currentTime = next;
    setPlaybackSeconds(next);
  }

  async function moveCard(cardId: string, direction: -1 | 1) {
    if (!selectedBoard) return;
    const current = selectedBoard.placements.map(
      ({ cardId: currentCardId, groupKey: currentGroupKey, laneKey }) => ({
        cardId: currentCardId,
        groupKey: currentGroupKey,
        laneKey,
      }),
    );
    const index = current.findIndex((placement) => placement.cardId === cardId);
    if (index < 0) return;
    const groupKey = current[index]?.groupKey;
    const siblingIndexes = current.flatMap((placement, placementIndex) =>
      placement.groupKey === groupKey ? [placementIndex] : [],
    );
    const siblingIndex = siblingIndexes.indexOf(index);
    const target = siblingIndexes[siblingIndex + direction];
    if (target === undefined) return;
    [current[index], current[target]] = [current[target], current[index]];
    await arrangeBoard(current, "Saved the shared board order.");
  }

  async function arrangeBoard(
    placements: Array<{ cardId: string; groupKey: string; laneKey: string }>,
    successMessage: string,
  ) {
    if (!selectedBoard) return null;
    return mutate(
      {
        action: "arrange-board",
        boardId: selectedBoard.id,
        expectedRevision: selectedBoard.revision,
        placements,
        clientRequestId: crypto.randomUUID(),
      },
      successMessage,
    );
  }

  async function createSection() {
    if (!selectedBoard || !sectionTitle.trim()) return;
    const next = await mutate(
      {
        action: "create-board-section",
        boardId: selectedBoard.id,
        expectedBoardRevision: selectedBoard.revision,
        clientRequestId: crypto.randomUUID(),
        title: sectionTitle,
        synopsis: sectionSynopsis,
      },
      `Added ${sectionTitle.trim()} to the shared binder without changing any source media.`,
    );
    if (next) {
      setSectionTitle("");
      setSectionSynopsis("");
    }
  }

  async function updateSection(
    section: SourceStoryBoard["sections"][number],
    next: { title: string; synopsis: string },
  ) {
    if (!selectedBoard) return;
    await mutate(
      {
        action: "update-board-section",
        boardId: selectedBoard.id,
        sectionId: section.id,
        expectedRevision: section.revision,
        clientRequestId: crypto.randomUUID(),
        title: next.title,
        synopsis: next.synopsis,
      },
      `Updated ${next.title.trim()} while preserving its cards, writing, and durable binder identity.`,
    );
  }

  async function moveSection(sectionId: string, direction: -1 | 1) {
    if (!selectedBoard) return;
    const orderedSectionIds = boardGroups.map((group) => group.section.id);
    const index = orderedSectionIds.indexOf(sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedSectionIds.length) return;
    [orderedSectionIds[index], orderedSectionIds[target]] = [
      orderedSectionIds[target],
      orderedSectionIds[index],
    ];
    await mutate(
      {
        action: "arrange-board-sections",
        boardId: selectedBoard.id,
        expectedBoardRevision: selectedBoard.revision,
        clientRequestId: crypto.randomUUID(),
        orderedSectionIds,
      },
      "Saved the shared binder order. Card order inside every section stayed intact.",
    );
  }

  async function archiveSection(section: SourceStoryBoard["sections"][number]) {
    if (!selectedBoard) return;
    await mutate(
      {
        action: "archive-board-section",
        boardId: selectedBoard.id,
        sectionId: section.id,
        expectedBoardRevision: selectedBoard.revision,
        expectedSectionRevision: section.revision,
        clientRequestId: crypto.randomUUID(),
      },
      `Archived ${section.title}. Its writing, receipts, and history remain retained.`,
    );
  }

  async function changeCardPlacement(
    cardId: string,
    next: { groupKey: string; laneKey: string },
  ) {
    if (!selectedBoard) return;
    const placements = selectedBoard.placements.map((placement) =>
      placement.cardId === cardId
        ? { cardId: placement.cardId, ...next }
        : {
            cardId: placement.cardId,
            groupKey: placement.groupKey,
            laneKey: placement.laneKey,
          },
    );
    await arrangeBoard(
      placements,
      `Moved the card to ${boardGroupLabel(next.groupKey)} · ${boardGroupLabel(next.laneKey)} without changing its source or writing.`,
    );
  }

  async function unfileCard(cardId: string) {
    if (!selectedBoard) return;
    const placements = selectedBoard.placements
      .filter((placement) => placement.cardId !== cardId)
      .map((placement) => ({
        cardId: placement.cardId,
        groupKey: placement.groupKey,
        laneKey: placement.laneKey,
      }));
    await arrangeBoard(
      placements,
      "Removed the card from this board. The card, source range, tags, revisions, and Episode placements remain intact.",
    );
  }

  async function fileCard(
    cardId: string,
    placement: { groupKey: string; laneKey: string },
  ) {
    if (!selectedBoard) return;
    const placements = [
      ...selectedBoard.placements.map((current) => ({
        cardId: current.cardId,
        groupKey: current.groupKey,
        laneKey: current.laneKey,
      })),
      { cardId, ...placement },
    ];
    await arrangeBoard(
      placements,
      `Filed the source card in ${selectedBoard.title} without copying or changing it.`,
    );
  }

  async function openSectionWriting(
    section: SourceStoryBoard["sections"][number],
  ) {
    if (!selectedBoard) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/nests/${encodeURIComponent(project.slug)}/source-story`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "open-section-writing",
            boardId: selectedBoard.id,
            sectionKey: section.key,
            expectedRevision: section.revision,
            clientRequestId: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.workspace)
        throw new Error(
          payload.error || "The section writing page could not be opened.",
        );
      setWorkspace((current) =>
        reconcileWorkspaceInventory(current, payload.workspace!),
      );
      const documentId =
        payload.operation && "document" in payload.operation
          ? payload.operation.document?.id
          : undefined;
      if (!documentId)
        throw new Error(
          "The section writing page was saved, but its document identity was not returned.",
        );
      window.location.assign(
        storyWritingHref(
          project.slug,
          selectedBoard.id,
          section.key,
          documentId,
        ),
      );
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "The section writing page could not be opened.",
      );
      setPending(false);
    }
  }

  const canMarkRange = Boolean(
    selectedViewerSource &&
    /^(video|audio)\//.test(selectedViewerSource.mimeType ?? ""),
  );
  const rangeReady =
    inPoint !== null &&
    outPoint !== null &&
    outPoint > inPoint &&
    title.trim().length > 0;

  function cardPlayback(card: SourceStoryCard) {
    const range = card.sourceRange;
    if (!range) return null;
    if (range.sourceRevision.mediaAsset)
      return { kind: "asset" as const, id: range.sourceRevision.mediaAsset.id };
    if (range.sourceSet)
      return { kind: "source-set" as const, id: range.sourceSet.id };
    if (
      range.sourceRevision.externalReference &&
      range.sourceRevision.collaborationProxy
    ) {
      return {
        kind: "external" as const,
        id: range.sourceRevision.externalReference.id,
      };
    }
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f7f2e9] text-[#352a20]">
      <header className="border-b border-[#ddccb0] bg-[#fffdf8] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/nests/${encodeURIComponent(project.slug)}?view=media`}
              aria-label={`Return to ${project.name} media`}
              className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[#ddccb0] bg-white text-[#684f32] hover:border-[#9f794c]"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a653d]">
                {project.name} · Source to story
              </p>
              <h1 className="truncate font-serif text-2xl font-black md:text-3xl">
                Find the moment. Build the story.
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Originals remain unchanged
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
              {workspace.cards.length} cards
            </span>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-teal-900">
              {workspace.externalSources.length} vault source
              {workspace.externalSources.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-fuchsia-900">
              {workspace.sourceSets.length} camera set
              {workspace.sourceSets.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">
              {workspace.boards.length} boards
            </span>
            <span
              className={`rounded-full border px-3 py-2 ${spatialStatus === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : spatialStatus === "manual-stitch-handoff" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-rose-200 bg-rose-50 text-rose-950"}`}
            >
              360 render ·{" "}
              {spatialStatus === "ready"
                ? "automatic"
                : spatialStatus === "manual-stitch-handoff"
                  ? "Studio handoff"
                  : "blocked"}
            </span>
          </div>
        </div>
      </header>

      <section
        className="border-b border-[#ddccb0] bg-[#fffaf0] px-4 py-3 md:px-6"
        aria-label="Spatial render readiness"
      >
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
          <div className="flex min-w-0 gap-3">
            {spatialStatus === "ready" ? (
              <Check
                className="mt-0.5 shrink-0 text-emerald-700"
                size={18}
                aria-hidden="true"
              />
            ) : (
              <Rotate3d
                className="mt-0.5 shrink-0 text-amber-700"
                size={18}
                aria-hidden="true"
              />
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a653d]">
                Exact-source 360 render
              </p>
              <p className="mt-1 text-sm font-black text-[#3d3122]">
                {spatialStatus === "ready"
                  ? "Official stitch and Quipsly reframe engines are ready."
                  : spatialStatus === "manual-stitch-handoff"
                    ? "Quipsly can reframe automatically after one reviewed Insta360 Studio master export."
                    : "The saved 360 edit remains safe, but a render engine needs attention."}
              </p>
              <p className="mt-1 max-w-4xl text-xs font-semibold leading-5 text-[#765f40]">
                {spatialRenderReadiness.readiness.nextAction} The LRV browse
                proxy is never accepted as final render media.
              </p>
            </div>
          </div>
          <details className="max-w-xl text-xs font-semibold text-[#684f32]">
            <summary className="cursor-pointer min-h-11 rounded-xl border border-[#ddccb0] px-3 py-3 text-[10px] font-black uppercase tracking-wide">
              Engine details
            </summary>
            <div className="mt-2 rounded-xl bg-[#f7f2e9] p-3 leading-5">
              <p>
                Insta360 Studio:{" "}
                {spatialRenderReadiness.probe.insta360Studio.available
                  ? (spatialRenderReadiness.probe.insta360Studio.version ??
                    "installed")
                  : "not installed"}
              </p>
              <p>
                Official automatic MediaSDK adapter:{" "}
                {spatialRenderReadiness.readiness.automaticStitchReady
                  ? "ready"
                  : "not ready on this executor"}
              </p>
              <p>
                Quipsly FFmpeg v360 reframe:{" "}
                {spatialRenderReadiness.readiness.automaticReframeReady
                  ? (spatialRenderReadiness.probe.ffmpeg.version ?? "ready")
                  : "not ready"}
              </p>
              {spatialRenderReadiness.readiness.blockers.length ? (
                <ul className="mt-2 list-disc pl-5">
                  {spatialRenderReadiness.readiness.blockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </div>
      </section>

      {message || error ? (
        <div
          className={`mx-auto mt-3 flex max-w-[1800px] items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${error ? "border-rose-200 bg-rose-50 text-rose-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}
          role={error ? "alert" : "status"}
        >
          {error ? (
            <CircleAlert size={18} aria-hidden="true" />
          ) : (
            <Check size={18} aria-hidden="true" />
          )}
          <span>{error ?? message}</span>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1880px] gap-4 p-3 md:p-5 xl:grid-cols-[380px_minmax(480px,1fr)_440px]">
        <aside
          className="min-h-[420px] rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm"
          aria-label="Source bin"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FolderOpen
                  size={18}
                  className="text-[#8a653d]"
                  aria-hidden="true"
                />
                <h2 className="font-serif text-xl font-black">Source bin</h2>
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#765f40]">
                Browse packages, find exact moments, and organize them without
                moving or changing originals.
              </p>
            </div>
            <div
              className="flex shrink-0 rounded-xl border border-[#d9c7a5] bg-white p-1"
              aria-label="Source bin view"
            >
              <button
                type="button"
                aria-label="Thumbnail view"
                aria-pressed={sourceViewMode === "grid"}
                onClick={() => setSourceViewMode("grid")}
                className={`grid min-h-11 min-w-11 place-items-center rounded-lg ${sourceViewMode === "grid" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}
              >
                <Grid2X2 size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={sourceViewMode === "list"}
                onClick={() => setSourceViewMode("list")}
                className={`grid min-h-11 min-w-11 place-items-center rounded-lg ${sourceViewMode === "list" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}
              >
                <List size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-[#d9c7a5] bg-[#f7f2e9] p-1"
            aria-label="Source collections"
          >
            {(
              [
                ["working", "Working", sourceStats.working],
                ["all", "All", sourceStats.total],
                ["attention", "Attention", sourceStats.attention],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sourceCollection === value}
                onClick={() => setSourceCollection(value)}
                className={`min-h-12 rounded-xl px-2 text-[10px] font-black uppercase tracking-wide ${sourceCollection === value ? "bg-white text-[#3e2f21] shadow-sm" : "text-[#765f40]"}`}
              >
                <span className="block text-sm">{count}</span>
                {label}
              </button>
            ))}
          </div>
          {workspace.sourceCollections.length ? (
            <div
              className="mt-2 flex gap-2 overflow-x-auto pb-1"
              aria-label="Saved source collections"
            >
              {workspace.sourceCollections.map((collection) => {
                const value = `collection:${collection.id}` as const;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    aria-pressed={sourceCollection === value}
                    onClick={() => setSourceCollection(value)}
                    className={`min-h-11 shrink-0 rounded-xl border px-3 text-left text-[10px] font-black ${sourceCollection === value ? "border-violet-300 bg-violet-50 text-violet-950" : "border-[#dfd0b7] bg-white text-[#684f32]"}`}
                  >
                    <span className="block max-w-36 truncate">
                      {collection.title}
                    </span>
                    <span className="text-[8px] uppercase tracking-wide opacity-70">
                      {collection.items.length} source
                      {collection.items.length === 1 ? "" : "s"} ·{" "}
                      {collection.scope === "personal" ? "Mine" : "Nest"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {canWrite ? (
            <details className="mt-2 rounded-xl border border-dashed border-[#cdb993] bg-white px-3 py-2">
              <summary className="cursor-pointer min-h-11 py-3 text-[10px] font-black uppercase tracking-wide text-[#76522c]">
                <Plus size={14} className="mr-1 inline" aria-hidden="true" />
                New source collection
              </summary>
              <div className="grid gap-2 pb-2">
                <input
                  value={collectionTitle}
                  onChange={(event) => setCollectionTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Selects for cold open"
                  className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-bold"
                />
                <textarea
                  value={collectionDescription}
                  onChange={(event) =>
                    setCollectionDescription(event.target.value)
                  }
                  maxLength={2000}
                  rows={2}
                  placeholder="What belongs here?"
                  className="rounded-xl border border-[#d9c7a5] p-3 text-xs font-semibold"
                />
                <label className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                  Visibility
                  <select
                    value={collectionScope}
                    onChange={(event) =>
                      setCollectionScope(
                        event.target.value as "personal" | "project",
                      )
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold normal-case"
                  >
                    <option value="personal">Only me</option>
                    <option value="project">Everyone in this Nest</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={pending || !collectionTitle.trim()}
                  onClick={() => void createCollection()}
                  className="min-h-11 rounded-xl bg-violet-900 px-3 text-xs font-black text-white disabled:opacity-40"
                >
                  Create collection
                </button>
              </div>
            </details>
          ) : null}

          <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-[#e2d2b6] bg-white p-3 text-center">
            <div>
              <p className="text-lg font-black text-emerald-800">
                {sourceStats.browseReady}
              </p>
              <p className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Browse ready
              </p>
            </div>
            <div>
              <p className="text-lg font-black text-violet-800">
                {sourceStats.renderReady}
              </p>
              <p className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Render ready
              </p>
            </div>
            <div>
              <p className="text-lg font-black text-sky-800">
                {sourceStats.selects}
              </p>
              <p className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Exact selects
              </p>
            </div>
          </div>

          <GoogleDriveSourcePicker
            projectSlug={project.slug}
            canWrite={canWrite}
            onAttached={refreshWorkspace}
          />
          <label className="relative mt-4 block">
            <span className="sr-only">Search the complete source library</span>
            <Search
              size={16}
              className="absolute left-3 top-3.5 text-[#927b5b]"
              aria-hidden="true"
            />
            <input
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
              placeholder={`Search all ${sourceAllTotal.toLocaleString()} sources…`}
              className="min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white pl-9 pr-10 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
            />
            {sourcePagePending && sourceQuery.trim() !== sourceServerQuery ? (
              <Loader2
                size={15}
                className="absolute right-3 top-3.5 animate-spin text-sky-800"
                aria-label="Searching complete source library"
              />
            ) : null}
          </label>
          <details className="mt-2 rounded-xl border border-[#e2d2b6] bg-white px-3 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-[10px] font-black uppercase tracking-wide text-[#76522c]">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Group, filter, and sort
            </summary>
            <div className="grid gap-3 pb-2 pt-1 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <label className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Media
                <select
                  value={sourceMediaFilter}
                  onChange={(event) =>
                    setSourceMediaFilter(
                      event.target.value as SourceLibraryMediaFilter,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold text-[#3e2f21]"
                >
                  <option value="all">All media</option>
                  <option value="360">360° packages</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="image">Images</option>
                  <option value="browse-ready">Browse ready</option>
                  <option value="render-ready">Render ready</option>
                </select>
              </label>
              <label className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Group
                <select
                  value={sourceGroupMode}
                  onChange={(event) =>
                    setSourceGroupMode(
                      event.target.value as SourceLibraryGroupMode,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold text-[#3e2f21]"
                >
                  <option value="capture-day">Capture day</option>
                  <option value="source-type">Source type</option>
                  <option value="provider">Location</option>
                </select>
              </label>
              <label className="text-[9px] font-black uppercase tracking-wide text-[#806a4d]">
                Sort
                <select
                  value={sourceSortMode}
                  onChange={(event) =>
                    setSourceSortMode(
                      event.target.value as SourceLibrarySortMode,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold text-[#3e2f21]"
                >
                  <option value="newest">Newest</option>
                  <option value="name">Name</option>
                  <option value="selects">Most selects</option>
                </select>
              </label>
            </div>
          </details>

          <p className="mt-3 text-[10px] font-bold text-[#806a4d]">
            Showing {visibleSourceLibraryItems.length.toLocaleString()} of{" "}
            {filteredSourceLibraryItems.length.toLocaleString()} loaded matches
            ·{" "}
            {sourceServerQuery
              ? `${sourcePageInfo.totals.all.toLocaleString()} matches across ${sourceAllTotal.toLocaleString()} sources`
              : `${sourcePageInfo.totals.all.toLocaleString()} canonical sources`}
            . A camera package stays one item even when final rendering needs
            several files.
          </p>
          {!sourcePageInfo.complete ? (
            <p
              role="status"
              className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[10px] font-bold leading-4 text-sky-950"
            >
              The library is cursor-paged:{" "}
              {sourceLibraryItems.length.toLocaleString()} of{" "}
              {sourcePageInfo.totals.all.toLocaleString()} sources are loaded.
              Loading more resumes each package, vault, and Quipsly-media stream
              from its exact stable identity.
            </p>
          ) : null}
          <div className="mt-3 max-h-[72vh] space-y-4 overflow-y-auto pr-1">
            {sourceLibraryGroups.map((group) => (
              <section
                key={group.key}
                aria-labelledby={`source-group-${group.key}`}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[#e2d2b6] bg-[#fffdf8]/95 py-2 backdrop-blur">
                  <h3
                    id={`source-group-${group.key}`}
                    className="text-[10px] font-black uppercase tracking-[0.16em] text-[#76522c]"
                  >
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-[#efe4d2] px-2 py-1 text-[9px] font-black text-[#76522c]">
                    {group.items.length}
                  </span>
                </div>
                <div
                  className={
                    sourceViewMode === "grid"
                      ? "mt-2 grid grid-cols-2 gap-2"
                      : "mt-2 space-y-2"
                  }
                >
                  {group.items.map((item) => {
                    const sourceSet =
                      item.kind === "source-set"
                        ? (workspace.sourceSets.find(
                            (candidate) => candidate.id === item.id,
                          ) ?? null)
                        : null;
                    const externalSource =
                      item.kind === "external"
                        ? (workspace.externalSources.find(
                            (candidate) => candidate.id === item.id,
                          ) ?? null)
                        : null;
                    const externalPackageMembers = externalSource?.sourceUnit
                      ? workspace.externalSources.filter(
                          (candidate) =>
                            candidate.sourceUnit?.id ===
                            externalSource.sourceUnit?.id,
                        )
                      : [];
                    const asset =
                      item.kind === "asset"
                        ? (sourceAssets.find(
                            (candidate) => candidate.id === item.id,
                          ) ?? null)
                        : null;
                    const selected =
                      item.kind === "source-set"
                        ? item.id === selectedSourceSet?.id
                        : item.kind === "external"
                          ? item.id === selectedExternalSource?.id
                          : item.id === selectedAsset?.id;
                    const healthTone =
                      item.health === "render-ready"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : item.health === "browse-ready"
                          ? "border-sky-200 bg-sky-50 text-sky-950"
                          : "border-amber-200 bg-amber-50 text-amber-950";
                    const open = () =>
                      item.kind === "source-set"
                        ? chooseSourceSet(item.id)
                        : item.kind === "external"
                          ? chooseExternalSource(item.id)
                          : chooseAsset(item.id);
                    const job = externalSource?.latestSourceRevision?.proxyJob;
                    const materializationJob =
                      externalSource?.latestSourceRevision?.materializationJob;
                    const driveConformPlan =
                      externalSource?.sourceUnit?.id === conformSourceUnitId
                        ? conformPlan
                        : null;
                    const visualRevision =
                      sourceSet?.sourceClockRevision ??
                      externalSource?.latestSourceRevision ??
                      null;
                    const visualOverview =
                      visualRevision?.visualOverview ?? null;
                    const visualJob = visualRevision?.visualOverviewJob ?? null;
                    const visualInputReady = Boolean(
                      visualRevision?.collaborationProxy,
                    );
                    return (
                      <article
                        key={item.key}
                        style={{
                          contentVisibility: "auto",
                          containIntrinsicSize:
                            sourceViewMode === "grid" ? "220px" : "150px",
                        }}
                        className={`min-w-0 rounded-2xl border p-2 transition ${selected ? "border-[#60492f] bg-[#f2e4cb] shadow-sm" : "border-[#e6d9c2] bg-white hover:border-[#bd9d68]"}`}
                      >
                        <button
                          type="button"
                          onClick={open}
                          aria-pressed={selected}
                          className="w-full text-left outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
                        >
                          <span
                            className={`relative grid w-full place-items-center overflow-hidden rounded-xl bg-[#e9dfcf] text-[#795a35] ${sourceViewMode === "grid" ? "aspect-video" : "h-16"}`}
                          >
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : item.mimeFamily === "360" ? (
                              <Rotate3d
                                size={sourceViewMode === "grid" ? 30 : 23}
                                aria-hidden="true"
                              />
                            ) : item.mimeFamily === "audio" ? (
                              <Film
                                size={sourceViewMode === "grid" ? 30 : 23}
                                aria-hidden="true"
                              />
                            ) : (
                              <FileVideo2
                                size={sourceViewMode === "grid" ? 30 : 23}
                                aria-hidden="true"
                              />
                            )}
                            {item.mimeFamily === "360" ? (
                              <span className="absolute left-2 top-2 rounded-full bg-fuchsia-950/90 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-white">
                                360° package
                              </span>
                            ) : null}
                            {item.isWorking ? (
                              <span className="absolute bottom-2 right-2 rounded-full bg-sky-950/90 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-white">
                                Working
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-2 line-clamp-2 block text-xs font-black leading-4">
                            {item.name}
                          </span>
                          <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-[#806a4d]">
                            {item.provider.replaceAll("-", " ")} ·{" "}
                            {formatClock(item.durationSeconds)}
                          </span>
                          <span
                            className={`mt-2 block rounded-lg border px-2 py-1.5 text-[9px] font-black leading-4 ${healthTone}`}
                          >
                            {item.healthLabel}
                          </span>
                          {item.selectCount ? (
                            <span className="mt-2 flex flex-wrap gap-1 text-[9px] font-black text-[#76522c]">
                              <span className="rounded-full bg-sky-50 px-2 py-1">
                                {item.selectCount} select
                                {item.selectCount === 1 ? "" : "s"}
                              </span>
                              <span className="rounded-full bg-violet-50 px-2 py-1">
                                {item.boardCount} board
                                {item.boardCount === 1 ? "" : "s"}
                              </span>
                              {item.selectedCount ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1">
                                  {item.selectedCount} chosen
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {sourceViewMode === "list" ? (
                            <span className="mt-2 block text-[9px] font-semibold text-[#806a4d]">
                              {formatBytes(item.sizeBytes)} ·{" "}
                              {new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }).format(new Date(item.timestamp))}
                            </span>
                          ) : null}
                        </button>
                        {sourceSet && selected ? (
                          <details className="mt-2 rounded-xl border border-fuchsia-200 bg-white/70 px-2 py-2 text-[9px]">
                            <summary className="cursor-pointer min-h-11 py-3 font-black uppercase tracking-wide text-fuchsia-950">
                              Package health · {sourceSet.members.length} files
                            </summary>
                            <ul className="space-y-1 text-[#765f40]">
                              {sourceSet.members.map((member) => (
                                <li key={member.id} className="break-all">
                                  <span className="font-black text-fuchsia-950">
                                    {member.role.replaceAll("-", " ")}
                                  </span>{" "}
                                  ·{" "}
                                  {member.sourceRevision.externalReference
                                    ?.fileName ?? member.sourceRevision.id}
                                  {member.requiredForRender
                                    ? " · final required"
                                    : " · browse"}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 font-mono text-[8px] text-[#806a4d]">
                              Package {sourceSet.identitySha256.slice(0, 16)}…
                            </p>
                          </details>
                        ) : null}
                        {externalSource &&
                        selected &&
                        externalPackageMembers.length > 1 ? (
                          <details className="mt-2 rounded-xl border border-cyan-200 bg-white/75 px-2 py-2 text-[9px]">
                            <summary className="cursor-pointer min-h-11 py-3 font-black uppercase tracking-wide text-cyan-950">
                              Camera segment · {externalPackageMembers.length}{" "}
                              Drive files
                            </summary>
                            <ul className="space-y-2 text-[#765f40]">
                              {externalPackageMembers.map((member) => {
                                const role =
                                  member.latestSourceRevision?.memberRole;
                                return (
                                  <li
                                    key={member.id}
                                    className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-2"
                                  >
                                    <span className="block font-black text-cyan-950">
                                      {role === "browse-proxy"
                                        ? "LRV browse companion"
                                        : role === "secondary-original"
                                          ? "Secondary INSV original"
                                          : "INSV original"}
                                    </span>
                                    <span className="mt-1 block break-all">
                                      {member.fileName}
                                    </span>
                                    <span className="mt-1 block font-mono text-[8px]">
                                      {formatBytes(member.sizeBytes)} ·{" "}
                                      {member.accessState === "available"
                                        ? role === "browse-proxy" &&
                                          member.latestSourceRevision
                                            ?.exactReplica
                                          ? "verified local browse copy"
                                          : "verified in Drive"
                                        : "access needs repair"}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-2 font-semibold leading-4 text-cyan-950">
                              Quipsly works from the LRV here. INSV originals
                              stay in Drive until final conform or export.
                            </p>
                            {driveConformPlan ? (
                              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-violet-950">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-black uppercase tracking-wide">
                                    Final render preflight
                                  </p>
                                  <span className="rounded-full bg-white px-2 py-1 font-black">
                                    {driveConformPlan.status.replaceAll(
                                      "-",
                                      " ",
                                    )}
                                  </span>
                                </div>
                                <dl className="mt-2 grid grid-cols-2 gap-2">
                                  <div className="rounded-lg bg-white p-2">
                                    <dt className="font-bold text-violet-700">
                                      Still to copy
                                    </dt>
                                    <dd className="mt-1 text-xs font-black">
                                      {formatBytes(
                                        driveConformPlan.storage.remainingBytes,
                                      )}
                                    </dd>
                                  </div>
                                  <div className="rounded-lg bg-white p-2">
                                    <dt className="font-bold text-violet-700">
                                      Exact on this Mac
                                    </dt>
                                    <dd className="mt-1 text-xs font-black">
                                      {formatBytes(
                                        driveConformPlan.storage.cachedBytes,
                                      )}
                                    </dd>
                                  </div>
                                </dl>
                                <p className="mt-2 rounded-lg border border-violet-200 bg-white p-2 font-semibold leading-4">
                                  {driveConformPlan.storage.executor.status ===
                                  "measured"
                                    ? `${formatBytes(
                                        driveConformPlan.storage.executor
                                          .safeAvailableBytes,
                                      )} safely available on the active Mac after its ${formatBytes(
                                        driveConformPlan.storage.executor
                                          .reserveBytes,
                                      )} reserve.`
                                    : "No fresh Mac storage reading is available yet. The worker will still refuse any transfer that would cross its safety reserve."}
                                </p>
                                {driveConformPlan.holds.length ? (
                                  <ul className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 font-semibold text-amber-950">
                                    {driveConformPlan.holds.map((hold) => (
                                      <li key={hold}>
                                        • {hold}
                                        {hold ===
                                          "This Mac does not have enough safe storage for the complete exact package." &&
                                        driveConformPlan.storage
                                          .shortfallBytes !== "0"
                                          ? ` Free ${formatBytes(
                                              driveConformPlan.storage
                                                .shortfallBytes,
                                            )} or choose another execution Mac.`
                                          : ""}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                <ul className="mt-2 space-y-1">
                                  {driveConformPlan.members.map((member) => {
                                    const job = member.materializationJob;
                                    const percent =
                                      job?.transferredBytes !== null &&
                                      job?.totalBytes
                                        ? Math.min(
                                            100,
                                            Math.round(
                                              (job.transferredBytes /
                                                job.totalBytes) *
                                                100,
                                            ),
                                          )
                                        : null;
                                    return (
                                      <li
                                        key={member.sourceRevisionId}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-white p-2"
                                      >
                                        <span className="min-w-0">
                                          <span className="block truncate font-black">
                                            {member.role.replaceAll("-", " ")}
                                          </span>
                                          <span className="block truncate font-mono text-[8px] text-violet-700">
                                            {member.name} ·{" "}
                                            {formatBytes(member.sizeBytes)}
                                          </span>
                                        </span>
                                        <span className="shrink-0 font-black">
                                          {member.exactReplicaReady
                                            ? "Exact ✓"
                                            : percent !== null
                                              ? `${percent}%`
                                              : job?.status === "failed"
                                                ? "Needs retry"
                                                : job
                                                  ? job.status
                                                  : "In Drive"}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                                {driveConformPlan.status === "render-ready" &&
                                driveConformPlan.sourceSet ? (
                                  <button
                                    type="button"
                                    disabled={pending || conformPending}
                                    onClick={() =>
                                      chooseSourceSet(
                                        driveConformPlan.sourceSet!.id,
                                      )
                                    }
                                    className="mt-3 min-h-11 w-full rounded-xl bg-emerald-900 px-3 font-black text-white disabled:opacity-45"
                                  >
                                    Open render-ready package
                                  </button>
                                ) : driveConformPlan.status === "held" ? (
                                  <button
                                    type="button"
                                    disabled={conformPending}
                                    onClick={() =>
                                      void inspectOrPrepareDriveConform(
                                        externalSource.sourceUnit!.id,
                                      )
                                    }
                                    className="mt-3 min-h-11 w-full rounded-xl border border-violet-300 bg-white px-3 font-black disabled:opacity-45"
                                  >
                                    Refresh preflight
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={
                                      pending || conformPending || !canWrite
                                    }
                                    onClick={() =>
                                      void inspectOrPrepareDriveConform(
                                        externalSource.sourceUnit!.id,
                                        {
                                          prepare: true,
                                          expectedRemainingBytes:
                                            driveConformPlan.storage
                                              .remainingBytes,
                                          retryFailed: true,
                                        },
                                      )
                                    }
                                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-950 px-3 font-black text-white disabled:opacity-45"
                                  >
                                    {conformPending ? (
                                      <Loader2
                                        size={14}
                                        className="animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <FolderOpen
                                        size={14}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {driveConformPlan.storage.remainingBytes ===
                                    "0"
                                      ? "Finalize exact camera package"
                                      : `Prepare ${formatBytes(
                                          driveConformPlan.storage
                                            .remainingBytes,
                                        )} on this Mac`}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={conformPending || !canWrite}
                                onClick={() =>
                                  void inspectOrPrepareDriveConform(
                                    externalSource.sourceUnit!.id,
                                  )
                                }
                                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 font-black text-violet-950 disabled:opacity-45"
                              >
                                {conformPending ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <FolderOpen size={14} aria-hidden="true" />
                                )}
                                Check final render storage
                              </button>
                            )}
                          </details>
                        ) : null}
                        {sourceSet?.sourceClockRevision.collaborationProxy ? (
                          <button
                            type="button"
                            onClick={open}
                            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-900 px-2 text-[10px] font-black text-white"
                          >
                            <Eye size={14} aria-hidden="true" />
                            Look around
                          </button>
                        ) : null}
                        {selected && workspace.sourceCollections.length ? (
                          <details className="mt-2 rounded-xl border border-violet-200 bg-white/80 px-2 py-1">
                            <summary className="cursor-pointer min-h-11 py-3 text-[9px] font-black uppercase tracking-wide text-violet-950">
                              File in collections…
                            </summary>
                            <div className="space-y-1 pb-2">
                              {workspace.sourceCollections.map((collection) => {
                                const filed = collection.items.some(
                                  (candidate) =>
                                    candidate.targetKey === item.key,
                                );
                                return (
                                  <button
                                    key={collection.id}
                                    type="button"
                                    disabled={
                                      pending ||
                                      !canWrite ||
                                      !collection.canEdit
                                    }
                                    onClick={() =>
                                      void toggleSourceCollection(
                                        collection,
                                        item,
                                      )
                                    }
                                    className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-[10px] font-black disabled:opacity-45 ${filed ? "border-violet-300 bg-violet-50 text-violet-950" : "border-[#dfd0b7] bg-white text-[#684f32]"}`}
                                  >
                                    <span>{collection.title}</span>
                                    <span>{filed ? "Filed" : "Add"}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}
                        {externalSource &&
                        !externalSource.latestSourceRevision
                          ?.collaborationProxy ? (
                          materializationJob &&
                          ["queued", "processing"].includes(
                            materializationJob.status,
                          ) ? (
                            <p
                              role="status"
                              className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200 bg-white px-2 text-[9px] font-black text-cyan-950"
                            >
                              <Loader2
                                size={13}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                              {materializationJob.status === "processing"
                                ? materializationJob.transferredBytes !==
                                    null && materializationJob.totalBytes
                                  ? `Verifying LRV · ${Math.min(100, Math.round((materializationJob.transferredBytes / materializationJob.totalBytes) * 100))}%`
                                  : "Downloading and verifying LRV…"
                                : "LRV transfer queued…"}
                            </p>
                          ) : materializationJob?.status === "failed" ? (
                            <button
                              type="button"
                              disabled={pending || !canWrite}
                              onClick={() =>
                                void requestProxy(externalSource, true)
                              }
                              className="mt-2 min-h-11 w-full rounded-xl border border-rose-300 bg-white px-2 text-[9px] font-black text-rose-950 disabled:opacity-45"
                            >
                              Retry Drive LRV ·{" "}
                              {materializationJob.failureCode ??
                                "transfer failure"}
                            </button>
                          ) : job &&
                            ["queued", "processing"].includes(job.status) ? (
                            <p
                              role="status"
                              className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-white px-2 text-[9px] font-black text-sky-950"
                            >
                              <Loader2
                                size={13}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                              {job.status === "processing"
                                ? "Building proxy…"
                                : "Proxy queued…"}
                            </p>
                          ) : job?.status === "failed" ? (
                            <button
                              type="button"
                              disabled={pending || !canWrite}
                              onClick={() =>
                                void requestProxy(externalSource, true)
                              }
                              className="mt-2 min-h-11 w-full rounded-xl border border-rose-300 bg-white px-2 text-[9px] font-black text-rose-950 disabled:opacity-45"
                            >
                              Retry proxy ·{" "}
                              {job.failureCode ?? "worker failure"}
                            </button>
                          ) : externalSource.provider === "local-file-vault" ||
                            (externalSource.provider === "google-drive" &&
                              externalSource.latestSourceRevision
                                ?.exactReplica) ? (
                            <button
                              type="button"
                              disabled={
                                pending ||
                                !canWrite ||
                                !externalSource.latestSourceRevision
                              }
                              onClick={() => void requestProxy(externalSource)}
                              className="mt-2 min-h-11 w-full rounded-xl bg-teal-900 px-2 text-[9px] font-black text-white disabled:opacity-45"
                            >
                              {externalSource.provider === "google-drive"
                                ? "Build from verified LRV"
                                : "Create browse proxy"}
                            </button>
                          ) : externalSource.provider === "google-drive" &&
                            externalSource.latestSourceRevision?.memberRole ===
                              "browse-proxy" ? (
                            <button
                              type="button"
                              disabled={
                                pending ||
                                !canWrite ||
                                !externalSource.latestSourceRevision
                              }
                              onClick={() => void requestProxy(externalSource)}
                              className="mt-2 min-h-11 w-full rounded-xl bg-cyan-950 px-2 text-[9px] font-black text-white disabled:opacity-45"
                            >
                              Prepare 360 browse copy
                            </button>
                          ) : (
                            <p className="mt-2 text-[9px] font-semibold leading-4 text-[#765f40]">
                              Attached without copying. Proxy work waits for
                              approved provider execution.
                            </p>
                          )
                        ) : null}
                        {externalSource?.provider === "google-drive" &&
                        !externalSource.latestSourceRevision
                          ?.collaborationProxy ? (
                          <p className="mt-2 text-[8px] font-semibold leading-4 text-[#765f40]">
                            {externalSource.latestSourceRevision?.memberRole ===
                            "browse-proxy"
                              ? "Only this segment's LRV is cached and verified. Full-resolution INSV originals stay in Drive until conform or export."
                              : "This full-resolution original stays in Drive until conform or export; use its paired LRV to browse and organize the segment."}
                          </p>
                        ) : null}
                        {visualRevision &&
                        visualInputReady &&
                        !visualOverview ? (
                          visualJob &&
                          ["queued", "processing"].includes(
                            visualJob.status,
                          ) ? (
                            <p
                              role="status"
                              className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-white px-2 text-[9px] font-black text-violet-950"
                            >
                              <Loader2
                                size={13}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                              {visualJob.status === "processing"
                                ? "Building visual map…"
                                : "Visual map queued…"}
                            </p>
                          ) : visualJob?.status === "failed" ? (
                            <button
                              type="button"
                              disabled={pending || !canWrite}
                              onClick={() =>
                                void requestVisualOverview(
                                  visualRevision.id,
                                  item.name,
                                  true,
                                )
                              }
                              className="mt-2 min-h-11 w-full rounded-xl border border-rose-300 bg-white px-2 text-[9px] font-black text-rose-950 disabled:opacity-45"
                            >
                              Retry visual map ·{" "}
                              {visualJob.failureCode ?? "worker failure"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={pending || !canWrite}
                              onClick={() =>
                                void requestVisualOverview(
                                  visualRevision.id,
                                  item.name,
                                )
                              }
                              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-2 text-[9px] font-black text-violet-950 disabled:opacity-45"
                            >
                              <Grid2X2 size={13} aria-hidden="true" />
                              Build 8-frame visual map
                            </button>
                          )
                        ) : null}
                        {visualOverview ? (
                          <p className="mt-2 flex min-h-8 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[8px] font-black uppercase tracking-wide text-violet-950">
                            <Check size={12} aria-hidden="true" />
                            Checksum-bound 8-frame map
                          </p>
                        ) : null}
                        {asset && sourceViewMode === "list" ? (
                          <p className="mt-2 text-[9px] font-semibold text-[#765f40]">
                            {asset.resolution ?? "Resolution not retained"}
                            {asset.fps ? ` · ${asset.fps.toFixed(2)} fps` : ""}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {!filteredSourceLibraryItems.length ? (
              <p className="rounded-2xl border border-dashed border-[#d9c7a5] p-5 text-sm font-semibold text-[#765f40]">
                Nothing matches this collection and filter. Try All sources or
                clear the search.
              </p>
            ) : null}
            {visibleSourceLibraryItems.length <
            filteredSourceLibraryItems.length ? (
              <button
                type="button"
                onClick={() => setSourceVisibleLimit((current) => current + 60)}
                className="min-h-12 w-full rounded-xl border border-[#9f794c] bg-white px-4 text-xs font-black uppercase tracking-wide text-[#60492f]"
              >
                Show 60 more
              </button>
            ) : null}
            {!sourcePageInfo.complete ? (
              <button
                type="button"
                disabled={sourcePagePending}
                onClick={() => void loadMoreSources()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
              >
                {sourcePagePending ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <FolderOpen size={16} aria-hidden="true" />
                )}
                Load next{" "}
                {Math.max(
                  0,
                  Math.min(
                    60,
                    sourcePageInfo.totals.all - sourceLibraryItems.length,
                  ),
                ).toLocaleString()}{" "}
                {sourceServerQuery ? "matches" : "canonical sources"}
              </button>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Source viewer">
          <div className="overflow-hidden rounded-3xl border border-[#29231d] bg-[#171513] shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8bd91]">
                  {selectedViewerSource?.is360
                    ? selectedViewerSource.mediaProjection === "equirectangular"
                      ? "Spatial 360° viewer"
                      : "360° camera preview · unstitched"
                    : "Viewer"}
                </p>
                <h2 className="truncate font-serif text-xl font-black">
                  {selectedViewerSource?.filename ??
                    selectedSourceSet?.displayName ??
                    selectedExternalSource?.fileName ??
                    "Choose a source"}
                </h2>
              </div>
              {selectedViewerSource || selectedExternalSource ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide">
                  {selectedViewerSource?.mimeType ??
                    selectedExternalSource?.mimeType ??
                    "Unknown media"}
                </span>
              ) : null}
            </div>
            <div className="grid min-h-[360px] place-items-center bg-black md:min-h-[500px]">
              {!selectedViewerSource ? (
                <p className="px-6 text-center font-semibold text-zinc-400">
                  {selectedExternalSource || selectedSourceSet
                    ? "This source is safely attached. Create its lightweight collaboration proxy to scrub and mark ranges without editing the original."
                    : "Attach or choose project media to begin."}
                </p>
              ) : selectedViewerSource.is360 &&
                selectedViewerSource.mediaProjection === "equirectangular" ? (
                <EquirectangularVideoViewer
                  key={selectedViewerSource.key}
                  ref={(node) => {
                    mediaRef.current = node;
                  }}
                  src={selectedViewerSource.url}
                  title={selectedViewerSource.filename}
                  onViewChange={setSpatialView}
                  onTimeUpdate={stopAtSourceRangeBoundary}
                  onEnded={() => {
                    playbackBoundaryRef.current = null;
                  }}
                />
              ) : selectedViewerSource.mimeType?.startsWith("video/") ? (
                <video
                  key={selectedViewerSource.key}
                  ref={(node) => {
                    mediaRef.current = node;
                  }}
                  src={selectedViewerSource.url}
                  poster={selectedViewerSource.thumbnailUrl ?? undefined}
                  controls
                  preload="metadata"
                  onTimeUpdate={stopAtSourceRangeBoundary}
                  onEnded={() => {
                    playbackBoundaryRef.current = null;
                  }}
                  className="max-h-[70vh] w-full"
                />
              ) : selectedViewerSource.mimeType?.startsWith("audio/") ? (
                <div className="w-full max-w-3xl px-6">
                  <div className="mb-8 grid place-items-center">
                    <Film
                      size={64}
                      className="text-[#d8bd91]"
                      aria-hidden="true"
                    />
                  </div>
                  <audio
                    key={selectedViewerSource.key}
                    ref={(node) => {
                      mediaRef.current = node;
                    }}
                    src={selectedViewerSource.url}
                    controls
                    preload="metadata"
                    onTimeUpdate={stopAtSourceRangeBoundary}
                    onEnded={() => {
                      playbackBoundaryRef.current = null;
                    }}
                    className="w-full"
                  />
                </div>
              ) : selectedViewerSource.mimeType?.startsWith("image/") ? (
                <img
                  src={selectedViewerSource.url}
                  alt={selectedViewerSource.filename}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              ) : (
                <p className="px-6 text-center font-semibold text-zinc-400">
                  This source can be organized, but range playback is not
                  available for its media type.
                </p>
              )}
            </div>
          </div>

          {selectedViewerSource?.sourceRevisionId ? (
            <SourceNavigationRail
              visualOverview={selectedVisualOverview}
              audioNavigation={selectedAudioNavigation}
              durationSeconds={selectedViewerSource.duration ?? 0}
              playbackSeconds={playbackSeconds}
              canWrite={canWrite}
              pending={pending}
              sourceRevisionId={selectedViewerSource.sourceRevisionId}
              sourceLabel={selectedViewerSource.filename}
              onSeek={seekSelectedSource}
              onRequestAudio={(sourceRevisionId, label, retryFailed) => {
                void requestAudioNavigation(
                  sourceRevisionId,
                  label,
                  retryFailed,
                );
              }}
            />
          ) : null}

          <div className="rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">
                  Immutable source range
                </p>
                <h2 className="mt-1 font-serif text-2xl font-black">
                  Mark the useful moment
                </h2>
              </div>
              <p className="max-w-md text-xs font-semibold leading-5 text-[#765f40]">
                I and O set source-clock boundaries. The card can move later
                without changing this range.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!canWrite || !canMarkRange}
                onClick={() =>
                  mediaRef.current && setInPoint(mediaRef.current.currentTime)
                }
                className="min-h-16 rounded-2xl border border-sky-200 bg-sky-50 px-4 text-left disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="text-[10px] font-black uppercase tracking-wide text-sky-800">
                  In point · I
                </span>
                <span className="mt-1 block font-mono text-xl font-black">
                  {formatClock(inPoint)}
                </span>
              </button>
              <button
                type="button"
                disabled={!canWrite || !canMarkRange}
                onClick={() =>
                  mediaRef.current && setOutPoint(mediaRef.current.currentTime)
                }
                className="min-h-16 rounded-2xl border border-orange-200 bg-orange-50 px-4 text-left disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="text-[10px] font-black uppercase tracking-wide text-orange-800">
                  Out point · O
                </span>
                <span className="mt-1 block font-mono text-xl font-black">
                  {formatClock(outPoint)}
                </span>
              </button>
            </div>
            {inPoint !== null && outPoint !== null ? (
              <p
                className={`mt-3 text-xs font-black ${outPoint > inPoint ? "text-emerald-800" : "text-rose-800"}`}
              >
                {outPoint > inPoint
                  ? `${(outPoint - inPoint).toFixed(2)} seconds selected`
                  : "The out point must be after the in point."}
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center gap-2">
              <Clapperboard
                size={19}
                className="text-[#8a653d]"
                aria-hidden="true"
              />
              <h2 className="font-serif text-2xl font-black">Write the card</h2>
            </div>
            {!canWrite ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
                Viewer access preserves playback and board reading. An Owner or
                Editor can create or revise cards.
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                <label>
                  <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                    Card title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={200}
                    placeholder="What happens in this moment?"
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
                  />
                </label>
                <label>
                  <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                    Synopsis
                  </span>
                  <textarea
                    value={synopsis}
                    onChange={(event) => setSynopsis(event.target.value)}
                    maxLength={10000}
                    rows={3}
                    placeholder="The concise Scrivener-style card summary…"
                    className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6 outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                      Story purpose
                    </span>
                    <select
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"
                    >
                      {storyCardPurposes.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("-", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                      Section / beat
                    </span>
                    <input
                      value={groupKey}
                      onChange={(event) => setGroupKey(event.target.value)}
                      maxLength={60}
                      placeholder="Cold open, Act 1…"
                      className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold"
                    />
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                      Board
                    </span>
                    <select
                      value={selectedBoard?.id ?? ""}
                      onChange={(event) =>
                        setSelectedBoardId(event.target.value || null)
                      }
                      className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"
                    >
                      <option value="">Unfiled card</option>
                      {workspace.boards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.title} · r{board.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                    Working notes
                  </span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={50000}
                    rows={3}
                    placeholder="Writing, edit, camera, research, or collaboration notes…"
                    className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6"
                  />
                </label>
                {tags.length ? (
                  <fieldset>
                    <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-[#76522c]">
                      <Tags size={14} aria-hidden="true" />
                      Project tags
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tags.map((tag) => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setSelectedTagIds((current) =>
                                active
                                  ? current.filter((id) => id !== tag.id)
                                  : [...current, tag.id],
                              )
                            }
                            className={`min-h-11 rounded-full border px-3 text-xs font-black ${active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-950"}`}
                          >
                            #{tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
                {selectedViewerSource?.is360 &&
                selectedViewerSource.mediaProjection === "equirectangular" ? (
                  <section
                    className="rounded-2xl border border-violet-200 bg-violet-50 p-4"
                    aria-label="Non-destructive 360 reframing"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-black text-violet-950">
                          <Rotate3d size={18} aria-hidden="true" />
                          Non-destructive camera direction
                        </p>
                        <p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-violet-900">
                          Look around above, pause on a useful composition, then
                          save that view. Quipsly stores camera instructions
                          against source time; the complete sphere and every
                          original remain unchanged.
                        </p>
                      </div>
                      <label className="text-[10px] font-black uppercase tracking-wide text-violet-900">
                        Output frame
                        <select
                          value={reframeAspectRatio}
                          onChange={(event) =>
                            setReframeAspectRatio(
                              event.target.value as typeof reframeAspectRatio,
                            )
                          }
                          className="mt-1 min-h-11 rounded-xl border border-violet-200 bg-white px-3 text-xs font-black"
                        >
                          <option value="16:9">16:9 landscape</option>
                          <option value="9:16">9:16 vertical</option>
                          <option value="1:1">1:1 square</option>
                          <option value="4:5">4:5 portrait</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={inPoint === null || outPoint === null}
                        onClick={captureReframeKeyframe}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-900 px-4 text-xs font-black text-white disabled:opacity-45"
                      >
                        <Video size={15} aria-hidden="true" />
                        Save current view at playhead
                      </button>
                      <span className="rounded-full border border-violet-200 bg-white px-3 py-2 font-mono text-[10px] font-bold text-violet-950">
                        pan {spatialView.panDegrees.toFixed(1)}° · tilt{" "}
                        {spatialView.tiltDegrees.toFixed(1)}° · FOV{" "}
                        {spatialView.fieldOfViewDegrees.toFixed(0)}°
                      </span>
                    </div>
                    {reframeKeyframes.length ? (
                      <ol className="mt-3 grid gap-2">
                        {reframeKeyframes.map((keyframe, index) => (
                          <li
                            key={`${keyframe.sourceSeconds}:${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2"
                          >
                            <span className="text-xs font-black text-violet-950">
                              {formatClock(keyframe.sourceSeconds)} · pan{" "}
                              {keyframe.panDegrees.toFixed(1)}° · tilt{" "}
                              {keyframe.tiltDegrees.toFixed(1)}° · FOV{" "}
                              {keyframe.fieldOfViewDegrees.toFixed(0)}°
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setReframeKeyframes((current) =>
                                  current.filter(
                                    (_, candidate) => candidate !== index,
                                  ),
                                )
                              }
                              className="min-h-11 rounded-full border border-rose-200 px-3 text-[10px] font-black uppercase tracking-wide text-rose-900"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-xs font-semibold text-violet-900">
                        No camera views saved yet. The range will still preserve
                        the complete 360° sphere.
                      </p>
                    )}
                  </section>
                ) : selectedViewerSource?.is360 ? (
                  <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-violet-950">
                      <Rotate3d size={18} aria-hidden="true" />
                      Unstitched 360° camera preview
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-violet-900">
                      This lightweight camera file shows both fisheye lenses so
                      you can review timing and mark the exact source range now.
                      Quipsly preserves the complete 360° package, but camera
                      direction stays unset until a reviewed stitched master is
                      available.
                    </p>
                  </section>
                ) : (
                  <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-3">
                    <input
                      type="checkbox"
                      checked={preserve360}
                      onChange={(event) => setPreserve360(event.target.checked)}
                      className="h-5 w-5"
                    />
                    <Rotate3d
                      size={18}
                      className="text-violet-800"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-black text-violet-950">
                        This file is an equirectangular 360° source
                      </span>
                      <span className="block text-xs font-semibold text-violet-900">
                        Use only when the source is a complete sphere. Quipsly
                        will preserve an explicit non-destructive reframe
                        recipe.
                      </span>
                    </span>
                  </label>
                )}
                <button
                  type="button"
                  disabled={!rangeReady || pending || !selectedViewerSource}
                  onClick={() => void createCard()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {pending ? (
                    <Loader2
                      className="animate-spin"
                      size={18}
                      aria-hidden="true"
                    />
                  ) : (
                    <Save size={18} aria-hidden="true" />
                  )}
                  Save source-backed card
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-4" aria-label="Story board">
          <section className="rounded-3xl border border-[#ddccb0] bg-[#fffdf8] p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <LayoutGrid
                size={19}
                className="text-[#8a653d]"
                aria-hidden="true"
              />
              <h2 className="font-serif text-2xl font-black">Story board</h2>
            </div>
            {workspace.boards.length ? (
              <div className="mt-3">
                <label className="text-xs font-black uppercase tracking-wide text-[#76522c]">
                  Active board
                  <select
                    value={selectedBoard?.id ?? ""}
                    onChange={(event) => {
                      setSelectedBoardId(event.target.value);
                      const source = selectedViewerSource
                        ? {
                            kind: selectedViewerSource.kind,
                            id: selectedViewerSource.id,
                          }
                        : null;
                      window.history.replaceState(
                        null,
                        "",
                        sourceHref(project.slug, source, event.target.value),
                      );
                    }}
                    className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"
                  >
                    {workspace.boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.title} · revision {board.revision}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedBoard?.description ? (
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#765f40]">
                    {selectedBoard.description}
                  </p>
                ) : null}
              </div>
            ) : null}
            {canWrite ? (
              <details
                className="mt-3 rounded-2xl border border-dashed border-[#cdb993] bg-white p-3"
                open={!workspace.boards.length}
              >
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">
                  <Plus size={14} className="mr-1 inline" aria-hidden="true" />
                  Create a board deliberately
                </summary>
                <div className="mt-3 grid gap-3">
                  <input
                    value={boardTitle}
                    onChange={(event) => setBoardTitle(event.target.value)}
                    maxLength={200}
                    placeholder="Board title"
                    className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold"
                  />
                  <textarea
                    value={boardDescription}
                    onChange={(event) =>
                      setBoardDescription(event.target.value)
                    }
                    maxLength={10000}
                    rows={2}
                    placeholder="What story or output is this board shaping?"
                    className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold"
                  />
                  <select
                    value={boardEpisodeId}
                    onChange={(event) => setBoardEpisodeId(event.target.value)}
                    className="min-h-11 rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-semibold"
                  >
                    <option value="">General project board</option>
                    {episodes.map((episode) => (
                      <option key={episode.id} value={episode.id}>
                        {episode.title} · {episode.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending || !boardTitle.trim()}
                    onClick={() => void createBoard()}
                    className="min-h-11 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
                  >
                    Create revisioned board
                  </button>
                </div>
              </details>
            ) : null}
          </section>

          {selectedBoard ? (
            <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">
                    Shared arrangement · r{selectedBoard.revision}
                  </p>
                  <h2 className="font-serif text-xl font-black">
                    {selectedBoard.placements.length} placed card
                    {selectedBoard.placements.length === 1 ? "" : "s"} ·{" "}
                    {boardGroups.length} section
                    {boardGroups.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <div
                  className="flex rounded-xl border border-[#d9c7a5] bg-[#fffaf0] p-1"
                  aria-label="Board view"
                >
                  <button
                    type="button"
                    aria-pressed={boardView === "cards"}
                    onClick={() => setBoardView("cards")}
                    className={`min-h-11 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${boardView === "cards" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}
                  >
                    Cards
                  </button>
                  <button
                    type="button"
                    aria-pressed={boardView === "outline"}
                    onClick={() => setBoardView("outline")}
                    className={`min-h-11 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide ${boardView === "outline" ? "bg-[#3e2f21] text-white" : "text-[#76522c]"}`}
                  >
                    Outline
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
                Sections and lanes belong to this board placement. Moving or
                unfiling a card never changes its writing, exact source range,
                use on another board, or Episode placement.
              </p>
              {canWrite ? (
                <details className="mt-3 rounded-2xl border border-dashed border-[#cdb993] bg-[#fffaf0] p-3">
                  <summary className="cursor-pointer min-h-11 py-3 text-xs font-black uppercase tracking-wide text-[#76522c]">
                    <ListPlus
                      size={15}
                      className="mr-1 inline"
                      aria-hidden="true"
                    />
                    Add an empty section or story beat
                  </summary>
                  <div className="grid gap-3">
                    <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
                      Section title
                      <input
                        value={sectionTitle}
                        onChange={(event) =>
                          setSectionTitle(event.target.value)
                        }
                        maxLength={200}
                        placeholder="Cold open, discovery, payoff…"
                        className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-sm font-bold"
                      />
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
                      What this section needs to do
                      <textarea
                        value={sectionSynopsis}
                        onChange={(event) =>
                          setSectionSynopsis(event.target.value)
                        }
                        maxLength={10000}
                        rows={3}
                        placeholder="A concise editorial brief that stays beside the cards and writing."
                        className="mt-1 w-full rounded-xl border border-[#d9c7a5] bg-white p-3 text-sm font-semibold leading-6"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={pending || !sectionTitle.trim()}
                      onClick={() => void createSection()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"
                    >
                      <Plus size={15} aria-hidden="true" />
                      Add durable section
                    </button>
                  </div>
                </details>
              ) : null}
              <div className="mt-4 space-y-4">
                {boardView === "outline"
                  ? boardGroups.map((group, sectionIndex) => (
                      <section
                        key={group.groupKey}
                        className="rounded-2xl border border-[#d9c7a5] bg-[#fffaf0] p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-serif text-lg font-black">
                              {group.section.title}
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">
                              {group.placements.length} card
                              {group.placements.length === 1 ? "" : "s"} ·{" "}
                              {formatClock(
                                group.placements.reduce(
                                  (total, placement) =>
                                    total +
                                    Math.max(
                                      0,
                                      (placement.card.sourceRange?.endSeconds ??
                                        0) -
                                        (placement.card.sourceRange
                                          ?.startSeconds ?? 0),
                                    ),
                                  0,
                                ),
                              )}
                            </p>
                            {group.section.synopsis ? (
                              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[#715f48]">
                                {group.section.synopsis}
                              </p>
                            ) : null}
                          </div>
                          {canWrite ? (
                            <SectionBinderControls
                              projectSlug={project.slug}
                              boardId={selectedBoard.id}
                              section={group.section}
                              sectionIndex={sectionIndex}
                              sectionCount={boardGroups.length}
                              cardCount={group.placements.length}
                              pending={pending}
                              onOpenWriting={() =>
                                openSectionWriting(group.section)
                              }
                              onMove={(direction) =>
                                moveSection(group.section.id, direction)
                              }
                              onUpdate={(next) =>
                                updateSection(group.section, next)
                              }
                              onArchive={() => archiveSection(group.section)}
                            />
                          ) : null}
                        </div>
                        <ol className="mt-2 space-y-2">
                          {group.placements.map((placement, groupIndex) => {
                            const index = selectedBoard.placements.findIndex(
                              (candidate) => candidate.id === placement.id,
                            );
                            return (
                              <li
                                key={placement.id}
                                className="rounded-xl border border-[#e2d2b6] bg-white p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">
                                      {index + 1}.{" "}
                                      {boardGroupLabel(placement.laneKey)} ·{" "}
                                      {placement.card.purpose.replaceAll(
                                        "-",
                                        " ",
                                      )}
                                    </p>
                                    <p className="mt-1 font-black">
                                      {placement.card.title}
                                    </p>
                                    {placement.card.synopsis ? (
                                      <p className="mt-1 text-xs font-semibold leading-5 text-[#715f48]">
                                        {placement.card.synopsis}
                                      </p>
                                    ) : null}
                                  </div>
                                  {canWrite ? (
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        disabled={pending || groupIndex === 0}
                                        onClick={() =>
                                          void moveCard(placement.cardId, -1)
                                        }
                                        aria-label={`Move ${placement.card.title} earlier in ${group.section.title}`}
                                        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] disabled:opacity-35"
                                      >
                                        <ArrowUp size={16} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          pending ||
                                          groupIndex ===
                                            group.placements.length - 1
                                        }
                                        onClick={() =>
                                          void moveCard(placement.cardId, 1)
                                        }
                                        aria-label={`Move ${placement.card.title} later in ${group.section.title}`}
                                        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] disabled:opacity-35"
                                      >
                                        <ArrowDown
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </section>
                    ))
                  : boardGroups.map((group, sectionIndex) => (
                      <section
                        key={group.groupKey}
                        className="rounded-2xl border border-[#d9c7a5] bg-[#fffdf8] p-3"
                        aria-labelledby={`story-section-${group.groupKey}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#eadfc9] pb-2">
                          <div>
                            <h3
                              id={`story-section-${group.groupKey}`}
                              className="font-serif text-lg font-black"
                            >
                              {group.section.title}
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-wide text-[#806a4d]">
                              {group.placements.length} card
                              {group.placements.length === 1 ? "" : "s"}
                            </p>
                            {group.section.synopsis ? (
                              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-[#715f48]">
                                {group.section.synopsis}
                              </p>
                            ) : null}
                          </div>
                          {canWrite ? (
                            <SectionBinderControls
                              projectSlug={project.slug}
                              boardId={selectedBoard.id}
                              section={group.section}
                              sectionIndex={sectionIndex}
                              sectionCount={boardGroups.length}
                              cardCount={group.placements.length}
                              pending={pending}
                              onOpenWriting={() =>
                                openSectionWriting(group.section)
                              }
                              onMove={(direction) =>
                                moveSection(group.section.id, direction)
                              }
                              onUpdate={(next) =>
                                updateSection(group.section, next)
                              }
                              onArchive={() => archiveSection(group.section)}
                            />
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-3">
                          {group.placements.map((placement, groupIndex) => {
                            const index = selectedBoard.placements.findIndex(
                              (candidate) => candidate.id === placement.id,
                            );
                            return (
                              <article
                                key={placement.id}
                                className="rounded-2xl border border-[#e2d2b6] bg-[#fffaf0] p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-wide text-[#987443]">
                                      {index + 1} ·{" "}
                                      {boardGroupLabel(placement.laneKey)} ·{" "}
                                      {placement.card.purpose.replaceAll(
                                        "-",
                                        " ",
                                      )}
                                    </p>
                                    <h4 className="mt-1 font-serif text-lg font-black leading-snug">
                                      {placement.card.title}
                                    </h4>
                                  </div>
                                  {canWrite ? (
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        disabled={pending || groupIndex === 0}
                                        onClick={() =>
                                          void moveCard(placement.cardId, -1)
                                        }
                                        aria-label={`Move ${placement.card.title} earlier in ${boardGroupLabel(group.groupKey)}`}
                                        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"
                                      >
                                        <ArrowUp size={16} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          pending ||
                                          groupIndex ===
                                            group.placements.length - 1
                                        }
                                        onClick={() =>
                                          void moveCard(placement.cardId, 1)
                                        }
                                        aria-label={`Move ${placement.card.title} later in ${boardGroupLabel(group.groupKey)}`}
                                        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"
                                      >
                                        <ArrowDown
                                          size={16}
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                                {placement.card.synopsis ? (
                                  <p className="mt-2 text-sm font-semibold leading-6 text-[#715f48]">
                                    {placement.card.synopsis}
                                  </p>
                                ) : null}
                                {placement.card.sourceRange ? (
                                  <button
                                    type="button"
                                    disabled={!cardPlayback(placement.card)}
                                    onClick={() => {
                                      const range = placement.card.sourceRange;
                                      const source = cardPlayback(
                                        placement.card,
                                      );
                                      if (source && range)
                                        playSourceRange(
                                          source,
                                          range.startSeconds,
                                          range.endSeconds,
                                        );
                                    }}
                                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-950 disabled:cursor-not-allowed disabled:opacity-45"
                                  >
                                    <Play size={14} aria-hidden="true" />
                                    {formatClock(
                                      placement.card.sourceRange.startSeconds,
                                    )}
                                    –
                                    {formatClock(
                                      placement.card.sourceRange.endSeconds,
                                    )}
                                  </button>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {placement.card.tags.map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-bold text-sky-900"
                                    >
                                      #{tag.label}
                                    </span>
                                  ))}
                                  <span className="rounded-full border border-[#ded0b7] bg-white px-2 py-1 text-[10px] font-bold text-[#765f40]">
                                    {placement.card.status.replaceAll("-", " ")}
                                  </span>
                                  {placement.card.sourceRange?.reframeRecipe ? (
                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-900">
                                      360 recipe
                                    </span>
                                  ) : null}
                                </div>
                                {placement.card.sourceRange ? (
                                  <p className="mt-3 text-[10px] font-bold leading-4 text-[#806a4d]">
                                    {sourceStateLabel(
                                      placement.card.sourceRange.sourceRevision
                                        .sourceState,
                                    )}{" "}
                                    · selector{" "}
                                    {placement.card.sourceRange.selectorSha256.slice(
                                      0,
                                      10,
                                    )}
                                    …
                                  </p>
                                ) : null}
                                {canWrite ? (
                                  <BoardPlacementEditor
                                    placement={placement}
                                    groupKeys={boardGroupKeys}
                                    pending={pending}
                                    onSave={(next) =>
                                      changeCardPlacement(
                                        placement.cardId,
                                        next,
                                      )
                                    }
                                    onUnfile={() =>
                                      unfileCard(placement.cardId)
                                    }
                                  />
                                ) : null}
                                {canWrite ? (
                                  <SourceRepairEditor
                                    card={placement.card}
                                    assets={sourceAssets}
                                    selectedAsset={selectedAsset}
                                    viewerInPoint={inPoint}
                                    viewerOutPoint={outPoint}
                                    pending={pending}
                                    mutate={mutate}
                                  />
                                ) : null}
                                {canWrite ? (
                                  <TimelinePromotionEditor
                                    card={placement.card}
                                    board={selectedBoard}
                                    boardPlacementId={placement.id}
                                    workspace={workspace}
                                    pending={pending}
                                    mutate={mutate}
                                    projectSlug={project.slug}
                                  />
                                ) : null}
                                {canWrite ? (
                                  <StoryCardEditor
                                    card={placement.card}
                                    tags={tags}
                                    pending={pending}
                                    mutate={mutate}
                                  />
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                {!selectedBoard.placements.length ? (
                  <div className="rounded-2xl border border-dashed border-[#d9c7a5] p-6 text-center">
                    <Clapperboard
                      className="mx-auto text-[#9a7b55]"
                      aria-hidden="true"
                    />
                    <p className="mt-3 font-serif text-xl font-black">
                      This board is ready for its first real select.
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#765f40]">
                      Mark an exact source range, write the card, and save it to
                      this board.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {selectedBoard && cardsAvailableForBoard.length ? (
            <section className="rounded-3xl border border-[#ddccb0] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">
                Available source cards
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
                A card can appear on more than one board. Filing it here reuses
                the same identity and exact source receipt.
              </p>
              <div className="mt-3 space-y-2">
                {cardsAvailableForBoard.map((card) => (
                  <article
                    key={card.id}
                    className="rounded-xl border border-[#e2d2b6] p-3"
                  >
                    <p className="font-black">{card.title}</p>
                    {card.sourceRange ? (
                      <button
                        type="button"
                        disabled={!cardPlayback(card)}
                        onClick={() => {
                          const range = card.sourceRange;
                          const source = cardPlayback(card);
                          if (source && range)
                            playSourceRange(
                              source,
                              range.startSeconds,
                              range.endSeconds,
                            );
                        }}
                        className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-black text-sky-900 disabled:opacity-45"
                      >
                        <Clock3 size={14} aria-hidden="true" />
                        {formatClock(card.sourceRange.startSeconds)}–
                        {formatClock(card.sourceRange.endSeconds)}
                      </button>
                    ) : null}
                    {canWrite ? (
                      <FileCardEditor
                        card={card}
                        groupKeys={boardGroupKeys}
                        pending={pending}
                        onFile={(next) => fileCard(card.id, next)}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

const storyBoardLanes = [
  "story",
  "b-roll",
  "evidence",
  "audio",
  "graphics",
] as const;

function storyWritingHref(
  projectSlug: string,
  boardId: string,
  sectionKey: string,
  documentId: string,
) {
  const query = new URLSearchParams({
    project: projectSlug,
    document: documentId,
    storyBoard: boardId,
    storySection: sectionKey,
  });
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
      <Link
        href={storyWritingHref(
          projectSlug,
          boardId,
          section.key,
          section.document.id,
        )}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950"
      >
        <NotebookPen size={15} aria-hidden="true" /> Open writing ·{" "}
        {section.document.blockCount} block
        {section.document.blockCount === 1 ? "" : "s"}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void onCreate()}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950 disabled:opacity-40"
    >
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
  const dirty =
    title.trim() !== section.title || synopsis.trim() !== section.synopsis;

  return (
    <div className="flex max-w-full flex-wrap items-start justify-end gap-2">
      <SectionWritingControl
        projectSlug={projectSlug}
        boardId={boardId}
        section={section}
        pending={pending}
        onCreate={onOpenWriting}
      />
      <div className="flex gap-1" aria-label={`Order ${section.title}`}>
        <button
          type="button"
          disabled={pending || sectionIndex === 0}
          onClick={() => void onMove(-1)}
          aria-label={`Move ${section.title} earlier in the binder`}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={pending || sectionIndex === sectionCount - 1}
          onClick={() => void onMove(1)}
          aria-label={`Move ${section.title} later in the binder`}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#d9c7a5] bg-white disabled:opacity-35"
        >
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      </div>
      <details className="w-full rounded-xl border border-[#ded0b7] bg-white p-3 sm:max-w-md">
        <summary className="cursor-pointer min-h-11 py-3 text-[10px] font-black uppercase tracking-wide text-[#76522c]">
          <Pencil size={14} className="mr-1 inline" aria-hidden="true" />
          Section details and lifecycle
        </summary>
        <div className="grid gap-3">
          <p className="text-xs font-semibold leading-5 text-[#765f40]">
            The durable section owns its editorial brief and writing link. Its
            stable key stays unchanged so cards and document context never break
            when the visible title changes.
          </p>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-sm font-bold"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Editorial brief
            <textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              maxLength={10000}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold leading-6"
            />
          </label>
          <button
            type="button"
            disabled={pending || !dirty || !title.trim()}
            onClick={() => void onUpdate({ title, synopsis })}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-40"
          >
            <Save size={15} aria-hidden="true" />
            Save section details
          </button>
          <div className="border-t border-[#eadfc9] pt-3">
            <button
              type="button"
              disabled={pending || cardCount > 0}
              onClick={() => void onArchive()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black uppercase tracking-wide text-rose-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Archive size={15} aria-hidden="true" />
              Archive empty section
            </button>
            <p className="mt-2 text-[10px] font-bold leading-4 text-[#806a4d]">
              {cardCount > 0
                ? `Move or unfile ${cardCount} card${cardCount === 1 ? "" : "s"} first.`
                : section.document
                  ? "The linked writing document and its revision history remain retained."
                  : "Archiving removes the section from this binder view but retains its operation history."}
            </p>
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
  const dirty =
    boardKeyFromLabel(groupKey) !== placement.groupKey ||
    laneKey !== placement.laneKey;
  const lanes = storyBoardLanes.includes(
    laneKey as (typeof storyBoardLanes)[number],
  )
    ? storyBoardLanes
    : [laneKey, ...storyBoardLanes];
  return (
    <details className="mt-3 rounded-xl border border-[#ded0b7] bg-white p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">
        Board position · {boardGroupLabel(placement.groupKey)} /{" "}
        {boardGroupLabel(placement.laneKey)}
      </summary>
      <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
        This changes only this board’s composition. The source-backed card
        remains available everywhere else.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
          Section / beat
          <input
            list={listId}
            value={groupKey}
            onChange={(event) => setGroupKey(event.target.value)}
            maxLength={60}
            className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 text-xs font-bold"
          />
          <datalist id={listId}>
            {groupKeys.map((key) => (
              <option key={key} value={boardGroupLabel(key)} />
            ))}
          </datalist>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
          Lane
          <select
            value={laneKey}
            onChange={(event) => setLaneKey(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold"
          >
            {lanes.map((lane) => (
              <option key={lane} value={lane}>
                {boardGroupLabel(lane)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={pending || !dirty || !groupKey.trim()}
          onClick={() => void onSave({ groupKey, laneKey })}
          className="min-h-11 rounded-xl bg-[#3e2f21] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
        >
          Save board position
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void onUnfile()}
          className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wide text-rose-950 disabled:opacity-40"
        >
          Unfile from this board
        </button>
      </div>
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
  const [groupKey, setGroupKey] = useState(
    boardGroupLabel(groupKeys[0] ?? "unassigned"),
  );
  const [laneKey, setLaneKey] = useState("story");
  const listId = `available-story-groups-${card.id}`;
  return (
    <details className="mt-2 rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] p-2">
      <summary className="cursor-pointer min-h-11 py-3 text-[10px] font-black uppercase tracking-wide text-[#76522c]">
        File on active board…
      </summary>
      <div className="grid gap-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
          Section / beat
          <input
            list={listId}
            value={groupKey}
            onChange={(event) => setGroupKey(event.target.value)}
            maxLength={60}
            className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold"
          />
          <datalist id={listId}>
            {groupKeys.map((key) => (
              <option key={key} value={boardGroupLabel(key)} />
            ))}
          </datalist>
        </label>
        <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
          Lane
          <select
            value={laneKey}
            onChange={(event) => setLaneKey(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold"
          >
            {storyBoardLanes.map((lane) => (
              <option key={lane} value={lane}>
                {boardGroupLabel(lane)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !groupKey.trim()}
          onClick={() => void onFile({ groupKey, laneKey })}
          className="min-h-11 rounded-xl bg-[#3e2f21] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40"
        >
          File the existing card
        </button>
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
  mutate: (
    body: Record<string, unknown>,
    message: string,
  ) => Promise<SourceStoryWorkspace | null>;
  projectSlug: string;
}) {
  const preferredEpisodeId =
    board.episodeProductionId &&
    workspace.episodes.some(
      (episode) => episode.id === board.episodeProductionId,
    )
      ? board.episodeProductionId
      : (workspace.episodes[0]?.id ?? "");
  const [episodeId, setEpisodeId] = useState(preferredEpisodeId);
  const [placementMode, setPlacementMode] = useState<"append" | "at-time">(
    "append",
  );
  const [episodeStartSeconds, setEpisodeStartSeconds] = useState(0);
  const [trackId, setTrackId] = useState("V1");

  useEffect(() => {
    if (!workspace.episodes.some((episode) => episode.id === episodeId))
      setEpisodeId(preferredEpisodeId);
  }, [episodeId, preferredEpisodeId, workspace.episodes]);

  const episode =
    workspace.episodes.find((candidate) => candidate.id === episodeId) ?? null;
  const placements = workspace.timelinePlacements.filter(
    (placement) => placement.cardId === card.id,
  );
  const activePlacements = placements.filter(
    (placement) => placement.status === "active",
  );
  const canPromote = Boolean(
    card.sourceRange &&
    episode &&
    /^V[1-9][0-9]?$/.test(trackId) &&
    (placementMode === "append" ||
      (Number.isFinite(episodeStartSeconds) && episodeStartSeconds >= 0)),
  );

  return (
    <details className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-violet-950">
        Episode timeline ·{" "}
        {activePlacements.length
          ? `${activePlacements.length} active placement${activePlacements.length === 1 ? "" : "s"}`
          : "not placed"}
      </summary>
      <p className="mt-2 text-xs font-semibold leading-5 text-violet-900">
        Promotion creates one normal, editable Episode clip while retaining this
        exact card, source-clock range, checksum, camera package, and 360 view
        recipe. It never renders or publishes.
      </p>
      {workspace.episodes.length ? (
        <div className="mt-3 grid gap-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">
            Episode
            <select
              value={episodeId}
              onChange={(event) => setEpisodeId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold"
            >
              {workspace.episodes.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title} ·{" "}
                  {formatClock(candidate.timelineDurationSeconds)} ·{" "}
                  {candidate.clipCount} clips
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">
              Placement
              <select
                value={placementMode}
                onChange={(event) =>
                  setPlacementMode(event.target.value as "append" | "at-time")
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold"
              >
                <option value="append">Append to Episode</option>
                <option value="at-time">Place at exact time</option>
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">
              Episode time
              <input
                type="number"
                min="0"
                step="0.001"
                disabled={placementMode === "append"}
                value={
                  placementMode === "append"
                    ? (episode?.timelineDurationSeconds ?? 0)
                    : episodeStartSeconds
                }
                onChange={(event) =>
                  setEpisodeStartSeconds(Number(event.target.value))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-mono text-xs font-bold disabled:bg-violet-100"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-violet-950">
              Video track
              <input
                value={trackId}
                onChange={(event) =>
                  setTrackId(event.target.value.toUpperCase())
                }
                maxLength={3}
                className="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 font-mono text-xs font-bold"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={pending || !canPromote}
            onClick={() =>
              episode &&
              void mutate(
                {
                  action: "promote-card-to-episode",
                  cardId: card.id,
                  originBoardId: board.id,
                  originBoardPlacementId: boardPlacementId,
                  episodeProductionId: episode.id,
                  expectedTimelineFingerprint: episode.timelineFingerprint,
                  placementMode,
                  episodeStartSeconds:
                    placementMode === "at-time" ? episodeStartSeconds : null,
                  trackId,
                  clientRequestId: crypto.randomUUID(),
                },
                `Placed ${card.title} in ${episode.title} with a reversible source receipt.`,
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-900 px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
          >
            <ArrowRight size={15} aria-hidden="true" />
            Place in Episode timeline
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-950">
          Create an Episode production before promoting Story cards.
        </p>
      )}
      {placements.length ? (
        <ol className="mt-4 grid gap-2">
          {placements.map((placement) => {
            const target = workspace.episodes.find(
              (candidate) => candidate.id === placement.episodeProductionId,
            );
            const sourceSet = card.sourceRange?.sourceSet
              ? (workspace.sourceSets.find(
                  (candidate) =>
                    candidate.id === card.sourceRange?.sourceSet?.id,
                ) ?? null)
              : null;
            return (
              <li
                key={placement.id}
                className="rounded-xl border border-violet-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-violet-950">
                      {target?.title ?? "Episode"} · {placement.trackId} at{" "}
                      {formatClock(placement.episodeStartSeconds)}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                      {placement.status} · receipt r{placement.revision} ·{" "}
                      {placement.createdByEmail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {target ? (
                      <Link
                        href={`/editor?project=${encodeURIComponent(projectSlug)}&episode=${encodeURIComponent(target.slug)}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 px-3 text-[10px] font-black uppercase tracking-wide text-violet-950"
                      >
                        <Clapperboard size={14} aria-hidden="true" />
                        Open editor
                      </Link>
                    ) : null}
                    {placement.status === "active" && target ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          void mutate(
                            {
                              action: "withdraw-timeline-placement",
                              placementId: placement.id,
                              expectedRevision: placement.revision,
                              expectedTimelineFingerprint:
                                target.timelineFingerprint,
                              clientRequestId: crypto.randomUUID(),
                            },
                            `Withdrew ${card.title} from ${target.title}; the card and immutable source remain intact.`,
                          )
                        }
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-wide text-rose-950 disabled:opacity-45"
                      >
                        <Undo2 size={14} aria-hidden="true" />
                        Withdraw clip
                      </button>
                    ) : null}
                  </div>
                </div>
                {placement.status === "active" &&
                card.sourceRange?.reframeRecipe ? (
                  <div className="mt-3 border-t border-violet-100 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-950">
                      Reversible 360° renders
                    </p>
                    {sourceSet?.sourceClockRevision.spatialStitchMaster ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <SpatialRenderControl
                          label="720p review proof"
                          profile="spatial-proof-720p24"
                          placementId={placement.id}
                          jobs={workspace.spatialRenderJobs}
                          pending={pending}
                          mutate={mutate}
                        />
                        <SpatialRenderControl
                          label="4K edit source"
                          profile="spatial-flat-4k24"
                          placementId={placement.id}
                          jobs={workspace.spatialRenderJobs}
                          pending={pending}
                          mutate={mutate}
                        />
                      </div>
                    ) : (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] font-bold text-amber-950">
                        A reviewed 5.7K stitch master is required. Browsing and
                        cards remain available from the lightweight proxy.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </details>
  );
}

function SpatialRenderControl({
  label,
  profile,
  placementId,
  jobs,
  pending,
  mutate,
}: {
  label: string;
  profile: "spatial-proof-720p24" | "spatial-flat-4k24";
  placementId: string;
  jobs: SourceStoryWorkspace["spatialRenderJobs"];
  pending: boolean;
  mutate: (
    body: Record<string, unknown>,
    message: string,
  ) => Promise<SourceStoryWorkspace | null>;
}) {
  const job =
    jobs.find(
      (candidate) =>
        candidate.timelinePlacementId === placementId &&
        candidate.profile === profile,
    ) ?? null;
  if (job?.status === "completed" && job.derivative)
    return (
      <a
        href={job.derivative.playbackUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-950"
      >
        <Play size={14} aria-hidden="true" />
        Play {label}
      </a>
    );
  if (job?.status === "output-ready")
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          void mutate(
            { action: "register-spatial-reframe", jobId: job.id },
            `Verified and attached the ${label} to this exact Episode placement.`,
          )
        }
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-950 disabled:opacity-45"
      >
        <Check size={14} aria-hidden="true" />
        Attach finished {label}
      </button>
    );
  if (job && ["queued", "processing"].includes(job.status))
    return (
      <p
        role="status"
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[10px] font-black uppercase tracking-wide text-sky-950"
      >
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        {job.status} · {label}
      </p>
    );
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        void mutate(
          {
            action: "queue-spatial-reframe",
            timelinePlacementId: placementId,
            profile,
            clientRequestId: crypto.randomUUID(),
          },
          `${label} queued from the reviewed 5.7K master; the spatial recipe stays editable.`,
        )
      }
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 text-[10px] font-black uppercase tracking-wide text-fuchsia-950 disabled:opacity-45"
    >
      <Film size={14} aria-hidden="true" />
      {job?.status === "failed" ? `Retry ${label}` : `Render ${label}`}
    </button>
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
  mutate: (
    body: Record<string, unknown>,
    message: string,
  ) => Promise<SourceStoryWorkspace | null>;
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
  const exactCurrentSelection =
    assetId === currentAsset.id &&
    startSeconds === range.startSeconds &&
    endSeconds === range.endSeconds;
  const canSubmit = Boolean(
    assetId &&
    reason.trim() &&
    Number.isFinite(startSeconds) &&
    Number.isFinite(endSeconds) &&
    endSeconds - startSeconds >= 0.05,
  );
  const rebind = (
    input: {
      replacementMediaAssetId: string;
      startSeconds: number;
      endSeconds: number;
      reason: string;
      preserveRecipe: boolean;
    },
    message: string,
  ) =>
    mutate(
      {
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
      },
      message,
    );

  return (
    <div className="mt-3">
      {range.sourceRevision.sourceState === "identity-unverified" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void rebind(
              {
                replacementMediaAssetId: currentAsset.id,
                startSeconds: range.startSeconds,
                endSeconds: range.endSeconds,
                reason: "Rebind after exact-source verification policy update.",
                preserveRecipe: true,
              },
              `Rechecked ${card.title} against the exact registered source and preserved its prior source receipt.`,
            )
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-950 disabled:opacity-45"
        >
          <Link2 size={15} aria-hidden="true" />
          Re-check exact registered source
        </button>
      ) : null}
      <details className="mt-2 rounded-xl border border-dashed border-[#d4c09e] bg-white p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">
          Replace or relink source…
        </summary>
        <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">
          This creates a new immutable source range and one card revision. It
          keeps the card’s writing, tags, board position, and every prior source
          receipt.
        </p>
        <div className="mt-3 grid gap-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Replacement registered source
            <select
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-3 text-xs font-bold"
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </select>
          </label>
          {selectedAsset &&
          viewerInPoint !== null &&
          viewerOutPoint !== null &&
          viewerOutPoint > viewerInPoint ? (
            <button
              type="button"
              onClick={() => {
                setAssetId(selectedAsset.id);
                setStartSeconds(viewerInPoint);
                setEndSeconds(viewerOutPoint);
              }}
              className="min-h-11 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-950"
            >
              Load current viewer range · {formatClock(viewerInPoint)}–
              {formatClock(viewerOutPoint)}
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
              Source in
              <input
                type="number"
                min="0"
                step="0.001"
                value={startSeconds}
                onChange={(event) =>
                  setStartSeconds(Number(event.target.value))
                }
                className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 font-mono text-xs font-bold"
              />
            </label>
            <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
              Source out
              <input
                type="number"
                min="0"
                step="0.001"
                value={endSeconds}
                onChange={(event) => setEndSeconds(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] px-3 font-mono text-xs font-bold"
              />
            </label>
          </div>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Why is the source changing?
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Corrected file, exact bytes verified, relinked storage, revised select…"
              className="mt-1 w-full rounded-xl border border-[#d9c7a5] p-3 text-xs font-semibold normal-case tracking-normal"
            />
          </label>
          <button
            type="button"
            disabled={pending || !canSubmit}
            onClick={() =>
              void rebind(
                {
                  replacementMediaAssetId: assetId,
                  startSeconds,
                  endSeconds,
                  reason,
                  preserveRecipe: exactCurrentSelection,
                },
                `Rebound ${card.title} to a new immutable source range as revision ${card.revision + 1}.`,
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
          >
            <Link2 size={15} aria-hidden="true" />
            Create source rebind revision
          </button>
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
  mutate: (
    body: Record<string, unknown>,
    message: string,
  ) => Promise<SourceStoryWorkspace | null>;
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
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#76522c]">
        Edit card · revision {card.revision}
      </summary>
      <div className="mt-3 grid gap-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          aria-label="Card title"
          className="min-h-11 rounded-xl border border-[#d9c7a5] px-3 text-sm font-semibold"
        />
        <textarea
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          maxLength={10000}
          rows={2}
          aria-label="Card synopsis"
          className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold"
        />
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={50000}
          rows={2}
          aria-label="Card notes"
          className="rounded-xl border border-[#d9c7a5] p-3 text-sm font-semibold"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Purpose
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold"
            >
              {storyCardPurposes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-wide text-[#76522c]">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-[#d9c7a5] bg-white px-2 text-xs font-bold"
            >
              {storyCardStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        {tags.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const active = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setTagIds((current) =>
                      active
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id],
                    )
                  }
                  className={`min-h-11 rounded-full border px-3 text-[10px] font-bold ${active ? "border-sky-700 bg-sky-700 text-white" : "border-sky-200 bg-sky-50 text-sky-950"}`}
                >
                  #{tag.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={() =>
            void mutate(
              {
                action: "update-card",
                cardId: card.id,
                expectedRevision: card.revision,
                clientRequestId: crypto.randomUUID(),
                title,
                synopsis,
                notes,
                purpose,
                status,
                tagIds,
              },
              `Saved ${title} as card revision ${card.revision + 1}.`,
            )
          }
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#3e2f21] px-4 text-xs font-black uppercase tracking-wide text-white disabled:opacity-45"
        >
          <Save size={15} aria-hidden="true" />
          Save revision
        </button>
      </div>
    </details>
  );
}
