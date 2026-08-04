"use client";

import { SyncDeck } from "./SyncDeck";
import { ChangeEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Player } from "@remotion/player";
import { VisualTimeline } from "./VisualTimeline";
import { InteractiveTimeline } from "./timeline/InteractiveTimeline";
import { MediaAssetPicker } from "./MediaAssetPicker";
import { ExportQueueModule } from "./ExportQueueModule";
import {
  makeTrackId,
  normalizeTrackId,
  normalizeTrackIdForKind,
  TRACK_PREFIX_VIDEO,
  TRACK_PREFIX_AUDIO,
  DEFAULT_AUDIO_TRACK,
  DEFAULT_VIDEO_TRACK,
  deactivatedTimelineIntervals,
  sanitizeTimelineRangeEdit,
  useTimelineState,
  isAudioTrackId,
  isVideoTrackId,
  trackKindFromTrackId,
} from "./useTimelineState";
import { RemotionComposition } from "./RemotionComposition";
import { KeyframeControls } from "./KeyframeControls";
import { VideoSegmentDesk } from "./VideoSegmentDesk";
import { AudioMasteryAudition, type AudioMasteryMeasurement, type AudioSignalDiagnosisSummary } from "./AudioMasteryAudition";
import { AudioTreatmentAudition } from "./AudioTreatmentAudition";
import { AutomatedEditEvidenceMap, type AutomatedEditBoundProof } from "./AutomatedEditEvidenceMap";
import { StudioTranscriptReviewDesk } from "./StudioTranscriptReviewDesk";
import { sourceBoundSpectralEditMarkers } from "@/components/audio/spectral-evidence-overlay";
import { SourceSyncEvidenceMap } from "./SourceSyncEvidenceMap";
import type { EpisodeArtifact } from "../episode-production/episodeArtifact";
import { EPISODE_ARTIFACT_CURRENT_VERSION } from "../episode-production/episodeArtifact";
import type { TimelineClip, TimelineRangeEdit, TimelineState, TranscriptBlock } from "./useTimelineState";
import type { CameraCutAssemblyHold, CameraSwitchDecision, SpeakerCameraMapping } from "@high-ground/quipsly-domain";
import { assembleSpeakerCameraCut, cameraClipAtTime, canonicalSpeakerKey } from "@high-ground/quipsly-domain";
import { DEFAULT_PROJECT_SLUG as DEFAULT_EDITOR_PROJECT_SLUG } from "@/lib/studio/project-registry";
import { episodeRoomCaptureAlignment } from "@/lib/episode-room/episode-room-source-alignment";
import { reviewedSourceAlignment } from "@/lib/episode-production/reviewed-source-alignment";
import { parseAudioSignalEvidence } from "@/lib/transcript-evidence";
import { projectSharedWatchTimeline } from "@/lib/episode-production/shared-watch-timeline";
import type { RecordingSessionEvent } from "@high-ground/quipsly-domain/recording";
import type { AudioMasteryPlaybackReviewEvidence } from "@high-ground/quipsly-media-processing";
import {
  captureGroupEditorFocusPlan,
  normalizeCaptureGroupFocusId,
} from "./captureGroupEditorFocus";
import {
  AI_EDIT_PROPOSAL_SET_KIND,
  AI_EDIT_PROPOSAL_SET_VERSION,
  canonicalAiEditTranscript,
  isAiEditSignalVisualization,
  type AiEditProposal,
  type AiEditProposalSet,
  type AiEditReviewCandidate,
  type AiEditSignalVisualization,
} from "@/lib/editor/ai-edit-proposal-contract";
import type {
  EditReviewAction,
  EditReviewSubjectKind,
  EpisodeEditReviewReceipt,
} from "@/lib/editor/edit-review-contract";

const EPISODE_ARTIFACT_PAYLOAD_VERSION = EPISODE_ARTIFACT_CURRENT_VERSION;
type TimelineSaveState = "idle" | "queued" | "saving" | "saved" | "error" | "fallback" | "conflict";
type TimelineHydrationSource = "loading" | "saved timeline" | "recording room" | "transcript payload" | "shared watch" | "empty episode" | "error";

type AiEditSuggestion = AiEditProposal;

type EpisodeProductionState = {
  ok: boolean;
  mode: "database" | "fallback" | "conflict";
  id: string;
  projectSlug: string;
  slug: string;
  title: string;
  boundaryLabel: string;
  status: string;
  message?: string;
  actorEmail?: string | null;
  accessRole?: string | null;
  accessSource?: string | null;
  accessCode?: string | null;
  recordingRoomJson?: unknown;
  timelineJson?: unknown;
  transcriptJson?: unknown;
  productionJson?: unknown;
  editReviewReceipt?: EpisodeEditReviewReceipt | null;
  updatedAt?: string;
  boundaryStartBlockId?: string;
};

type EpisodeCollaborationState = {
  ok: boolean;
  projectSlug: string;
  episodeSlug: string;
  productionId: string;
  title: string;
  role: string | null;
  updatedAt: string;
  timelineFingerprint: string;
  timelineClipCount: number;
  activeCollaborators: Array<{
    email: string;
    name: string;
    app: string;
    route: string;
    editing: boolean;
    lastSeenAt: string;
  }>;
  editLease: {
    email: string;
    name: string;
    acquiredAt: string;
    expiresAt: string;
    app: string;
  } | null;
  assetManifest?: {
    totalAssets: number;
    timelineClipCount: number;
    assets: Array<{
      assetId: string;
      clipId?: string | null;
      name: string;
      kind: "audio" | "video" | "unknown";
      role?: string | null;
      sourceUrl?: string | null;
      playbackUrl?: string | null;
      gcsUri?: string | null;
      durationSeconds?: number | null;
      trackId?: string | null;
      status: "ready" | "needs-download" | "missing-source" | "held";
    }>;
  };
  recommendedPollSeconds?: number;
  guidance?: {
    editSync?: string;
    assets?: string;
    conflicts?: string;
  };
};

type ImportedMediaAsset = {
  id: string;
  sourceId: string;
  projectSlug: string;
  episodeSlug: string;
  originalName: string;
  contentType: string;
  size: number;
  kind: "audio" | "video" | "unknown";
  is360?: boolean;
  originalFormat?: string;
  sha256?: string;
  bucketName?: string;
  objectName?: string;
  gcsUri: string;
  playbackUrl: string;
  importedAt: string;
  source?: string;
  importRole?: string;
  sync?: {
    status?: string;
    anchorTimelineSeconds?: number;
    targetClipId?: string;
    note?: string;
    source?: string;
    syncedAt?: string;
    suggestedTrackId?: string;
    suggestedRole?: string;
    suggestionConfidence?: number;
    suggestionReason?: string;
    suggestionAppliedAt?: string;
    suggestionSource?: string;
    recordingAssetId?: string;
    recordingSync?: Record<string, unknown>;
    alignment?: Record<string, unknown>;
    alignmentReview?: Record<string, unknown>;
  };
  proxy?: {
    status?: string;
    proxyUrl?: string;
    proxyAssetId?: string;
    sourceId?: string;
    variantId?: string;
    jobId?: string;
    profile?: string;
    completedAt?: string;
    sourceOriginalPreserved?: boolean;
    immutableObjectEvidence?: Record<string, unknown>;
    note?: string;
  };
};

type EpisodeCollaborationProxyClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  proxyUrl: string | null;
  proxyAssetId: string | null;
  proxySourceId: string | null;
  variantId: string | null;
  outputEvidence: Record<string, unknown> | null;
  error: string | null;
  updatedAt: string | null;
  originalRemainsSourceTruth: true;
};

type AudioMasteryClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  profileId: "apple-podcasts-dialogue-v1" | "ebu-r128-broadcast-v1" | null;
  sourceMeasurement: AudioMasteryMeasurement | null;
  signalDiagnosis: AudioSignalDiagnosisSummary | null;
  proposal: null | {
    action: "no-change" | "render-loudness-master";
    assessment: { integratedStatus: string; truePeakStatus: string; integratedDeltaLu: number; passes: boolean };
    profile: { id: string; label: string; integratedLufs: number; maximumTruePeakDbtp: number; renderTruePeakDbtp: number };
  };
  derivative: null | {
    playbackUrl: string | null;
    verification: { integratedStatus: string; truePeakStatus: string; integratedDeltaLu: number; passes: boolean };
    measured: AudioMasteryMeasurement;
  };
  review: {
    latest: null | { id: string; jobId: string; decision: "approved" | "rejected"; note: string | null; reviewedAt: string; actorEmail: string };
    approvalCount: number;
    rejectionCount: number;
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: { originalRemainsSourceTruth: true; outputIsUnpromotedPreview: true; explicitApprovalStillRequired: true };
};

type AudioSignalProfileClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  media: null | { container: string; codec: string; sampleRate: number; channelCount: number; durationSeconds: number };
  audioSignal: Record<string, unknown> | null;
  analyzer: null | { algorithm: "quipsly-audio-signal-window-v1"; completeDecode: true; maximumWindows: 1_200 };
  error: string | null;
  updatedAt: string | null;
  boundaries: { originalRemainsSourceTruth: true; analysisDoesNotChangeMedia: true; observationsRequireHumanInterpretation: true };
};

type StudioSourceTranscriptClientStatus = {
  jobId: string | null;
  transcriptJobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  provider: string | null;
  language: string | null;
  authorization: null | {
    kind: "participant-consent-confirmed" | "licensed-or-permitted-source";
    importRole: string;
    acceptedAt: string;
    acceptedByEmail: string;
  };
  coverage: null | {
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
    confidenceWordCount: number;
    speakerLabeledWordCount: number;
    transcriptStartSeconds: number;
    transcriptEndSeconds: number;
    correctionCount: number;
    playbackVerificationCount: number;
  };
  segmentPreview: {
    count: number;
    total: number;
    truncated: boolean;
  };
  segments: Array<{
    id: string;
    ordinal: number;
    startSeconds: number;
    endSeconds: number;
    speakerLabel: string | null;
    text: string;
    confidence: number | null;
  }>;
  capabilities: null | {
    segmentTiming: "provider";
    wordTiming: "provider";
    wordConfidence: "provider";
    segmentConfidence: "unavailable";
    speakerDiarization: "unavailable";
    alternatives: "unavailable";
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    confidenceIsNotMeasuredAccuracy: true;
    correctionsRequirePlaybackReview: true;
    createsNoTasksGoalsOrEdits: true;
  };
};

type AudioTreatmentClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  profileId: "dc-rumble-correction-v1" | null;
  sourceMeasurement: AudioMasteryMeasurement | null;
  sourceDiagnosis: AudioSignalDiagnosisSummary | null;
  proposal: null | {
    trigger: { kind: "dc-offset"; maximumAbsoluteDcOffset: number; thresholdAmplitude: 0.01; affectedChannels: number[] };
    treatment: { frequencyHz: number; poles: number; widthType: string; width: number };
  };
  verification: null | { maximumAbsoluteDcBefore: number; maximumAbsoluteDcAfter: number; relativeReduction: number; durationDeltaSeconds: number; completeOutputDecode: true; passes: true };
  derivative: null | { playbackUrl: string | null; durationSeconds: number; measured: AudioMasteryMeasurement; diagnosis: AudioSignalDiagnosisSummary };
  error: string | null;
  updatedAt: string | null;
  boundaries: { originalRemainsSourceTruth: true; outputIsUnpromotedExperiment: true; outputIsNotAMasteredDeliveryFile: true; explicitApprovalStillRequired: true };
};

type EpisodeMediaTruth = {
  ok: boolean;
  error?: string;
  summary?: {
    importedMediaCount?: number;
    videoCount?: number;
    audioCount?: number;
    sourceRecordingCount?: number;
    proxyReadyCount?: number;
    proxyNeededCount?: number;
    completedTranscriptJobCount?: number;
    attachedAssetCount?: number;
  };
  episode?: {
    found?: boolean;
    title?: string;
    status?: string;
    updatedAt?: string;
  };
  importedMedia?: Array<{
    id?: string | null;
    originalName?: string;
    kind?: string | null;
    importRole?: string | null;
    syncStatus?: string | null;
    proxyStatus?: string | null;
    proxyReadiness?: {
      ready: boolean;
      needed: boolean;
      status: "ready" | "needed" | "unknown";
      source: "media-asset" | "import-metadata" | "unknown";
    };
    recordingAssetId?: string | null;
    sessionContext?: {
      roomId: string;
      projectSlug: string;
      canonicalTagSource?: string | null;
      tagSnapshot?: Array<{ id: string; label: string; slug: string; category: string }>;
    } | null;
    safeNextAction?: string;
    asset?: {
      readiness?: {
        hasProxy?: boolean;
        needsProxy?: boolean;
        hasThumbnail?: boolean;
        sourceSafe?: boolean;
      };
    } | null;
    recording?: {
      status?: string;
      readiness?: {
        verified?: boolean;
        promotedToStudioMedia?: boolean;
        completedTranscriptCount?: number;
        needsTranscript?: boolean;
      };
    } | null;
  }>;
  recordingEvidence?: Array<{
    id: string;
    status?: string;
    kind?: string;
    fileName?: string | null;
    readiness?: {
      verified?: boolean;
      promotedToStudioMedia?: boolean;
      completedTranscriptCount?: number;
      needsTranscript?: boolean;
    };
  }>;
  safeNextActions?: string[];
  boundaries?: {
    sideEffectFree?: boolean;
    noOriginalMutation?: boolean;
    noExternalMutation?: boolean;
    inventoryOnly?: boolean;
    sourceTruth?: string;
    editorRule?: string;
  };
};

type PremiereDraftEdit = {
  id: string;
  projectSlug: string;
  episodeSlug: string;
  primarySequenceName: string;
  stagedAt: string;
  timelineClipCount: number;
  matchedTimelineClipCount: number;
  deactivatedSourceRangeCount: number;
  readyMediaCount: number;
  heldMediaCount: number;
  warnings: string[];
  timelineClips: TimelineClip[];
  deactivatedSourceRanges: PremiereDraftDeactivatedRange[];
  assetMatches: Array<{
    id: string;
    displayName: string;
    kind: string;
    status: string;
    registeredAssetId: string;
  }>;
};

type PremiereDraftDeactivatedRange = {
  id: string;
  assetId: string;
  premiereAssetId: string;
  kind: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  matchStatus: string;
  confidence: string;
  reason: string;
};

type TimelineBackupRecord = {
  id: string;
  createdAt: string;
  source: string;
  draftEditId: string;
  restoredFromBackupId: string;
  timelineClipCount: number;
};

type EpisodeImportLane = {
  id: "phone-audio" | "camera-video" | "reference-clip";
  title: string;
  description: string;
  accept: string;
  buttonLabel: string;
  tone: string;
};

type AiIngestRecommendation = {
  assetId: string;
  role: string;
  confidence: number;
  suggestedTrackId: string;
  suggestedSyncStatus: string;
  suggestedAction: string;
  reason: string;
  suggestedAnchorTimelineSeconds?: number;
};

type AiIngestReport = {
  source?: string;
  generatedAt?: string;
  summary: string;
  recommendations: AiIngestRecommendation[];
  batchPlan: Array<{ title: string; detail: string }>;
  warnings: string[];
};

type TranscriptAssistReport = {
  id: string;
  source: string;
  generatedAt: string;
  assetId: string;
  sourceId?: string;
  originalName: string;
  contentType: string;
  kind: "audio" | "video" | "unknown";
  inspectedRawMedia: boolean;
  summary: string;
  transcriptText: string;
  transcriptBlocks: Array<{
    startSeconds: number;
    endSeconds: number;
    speaker: string;
    text: string;
    confidence: number;
  }>;
  suggestedUse: string;
  warnings: string[];
};

type MediaAnalysisJobType = "transcript" | "file-triage" | "sync-suggestion" | "proxy-needed";
type MediaAnalysisJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

type MediaAnalysisJob = {
  id: string;
  assetId: string;
  type: MediaAnalysisJobType;
  status: MediaAnalysisJobStatus;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
  result: Record<string, unknown>;
};

type SyncHistorySnapshot = {
  id?: string;
  type: string;
  assetId?: string;
  targetClipId?: string;
  label?: string;
  createdAt?: string;
  beforeSync?: unknown;
  afterSync?: unknown;
  beforeClip?: {
    id?: string;
    assetId?: string;
    name?: string;
  };
  afterClip?: {
    id?: string;
    assetId?: string;
    name?: string;
  };
};

type EditorCoPilotStatus = "queued" | "running" | "success" | "error" | "rolled-back";

type EditorCoPilotRevertKind = "undo-sync" | "delete-timeline-clip" | "restore-spine" | "restore-clip-source" | "restore-sync-status" | "none";

type EditorCoPilotRevertPayload = {
  kind: EditorCoPilotRevertKind;
  assetId?: string;
  clipId?: string;
  clip?: TimelineClip | null;
  clipSourceAssetId?: string;
  previousSyncStatus?: "ready-to-sync" | "held";
  previousSyncAnchorTimelineSeconds?: number | null;
  previousSyncTargetClipId?: string | null;
  spineAudioAssetId?: string | null;
  spineAudioClipId?: string | null;
  spineAudioSource?: string | null;
  spineAudioLabel?: string | null;
};

type EditorCoPilotLogEntry = {
  id: string;
  at: string;
  command: string;
  result: string;
  changeSummary?: string;
  status: EditorCoPilotStatus;
  reversible: boolean;
  revert: EditorCoPilotRevertPayload;
};

type EditorCoPilotMessageRole = "user" | "agent" | "system";

type EditorCoPilotMessage = {
  id: string;
  at: string;
  role: EditorCoPilotMessageRole;
  text: string;
  command?: string;
  logId?: string;
};

type EditorCoPilotParse = {
  commandText: string;
  parsed: ParsedEditorCommand;
};

const EDITOR_CO_PILOT_MAX_LOG = 24;
const EDITOR_CO_PILOT_MAX_MESSAGES = 48;

type ParsedEditorCommandType = "help" | "source-url" | "add-to-timeline" | "attach-to-selected" | "set-sync-status"
  | "set-spine-audio" | "undo-last-change" | "save-timeline" | "refresh-state" | "organize" | "apply-suggestion"
  | "transcript-assist" | "queue-job" | "set-playhead" | "n/a";

type ParsedEditorCommand = {
  type: ParsedEditorCommandType;
  command: string;
  assetRef?: string;
  status?: "ready-to-sync" | "synced" | "held";
  jobType?: MediaAnalysisJobType;
  sourceUrl?: string;
  sourceTitle?: string;
  playheadSeconds?: number;
};

const EDITOR_CO_PILOT_COMMANDS: string[] = [
  "help",
  "set playhead to 42",
  "import source https://www.youtube.com/watch?v=...",
  "add <asset> to timeline",
  "attach <asset> to selected clip",
  "set spine <asset>",
  "mark <asset> as synced|held|ready",
  "organize",
  "save timeline",
  "undo last sync change",
  "transcript assist <asset>",
  "apply suggestion <asset>",
  "queue sync-suggestion for <asset>",
];

const EDITOR_CO_PILOT_STATUS_TONE: Record<EditorCoPilotStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  "rolled-back": "border-amber-200 bg-amber-50 text-amber-800",
};

const EDITOR_CO_PILOT_MESSAGE_TONE: Record<EditorCoPilotMessageRole, string> = {
  user: "bg-indigo-100 text-indigo-900 border-indigo-200",
  agent: "bg-emerald-100 text-emerald-900 border-emerald-200",
  system: "bg-violet-100 text-violet-900 border-violet-200",
};

const EDITOR_CO_PILOT_REVERT_LABEL: Record<EditorCoPilotRevertKind, string> = {
  "undo-sync": "Undo last sync change",
  "delete-timeline-clip": "Remove added clip",
  "restore-sync-status": "Restore prior sync status",
  "restore-spine": "Restore previous spine",
  "restore-clip-source": "Restore clip source",
  none: "No rollback",
};

function formatEditorCoPilotTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

type MediaSourceHealthStatus = "ok" | "warning" | "error" | "unchecked" | "checking";
type MediaSourceHealthKind = "audio" | "video" | "unknown";

type MediaSourceHealth = {
  id: string;
  label: string;
  sourceUrl: string;
  status: MediaSourceHealthStatus;
  reachable: boolean;
  playable: boolean;
  previewUsable: boolean;
  renderUsable: boolean;
  kind: MediaSourceHealthKind;
  expectedKind: MediaSourceHealthKind;
  detectedKind: MediaSourceHealthKind;
  contentType: string;
  size: number;
  statusCode?: number;
  method?: string;
  note: string;
};

type MediaHealthProbeItem = {
  id: string;
  label: string;
  sourceUrl: string;
  expectedKind: MediaSourceHealthKind;
  contentType?: string;
  size?: number;
};

type EpisodeSpineAudio = {
  assetId?: string;
  clipId?: string;
  source?: string;
  label: string;
  setAt?: string;
};

const INITIAL_VIDEO_TRACK_B = makeTrackId(TRACK_PREFIX_VIDEO, 2);

const EMPTY_TIMELINE_STATE: TimelineState = {
  clips: [],
  transcript: [],
};

const RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS = 8;
const RECORDER_SEGMENT_MIN_DURATION_SECONDS = 0.2;
type SessionTrackKind = "audio" | "video";

type SegmentTimelineRange = {
  sourceStart: number;
  sourceEnd: number;
  duration: number;
};

type RecordingSessionTrack = {
  id: string;
  name?: string;
  type?: SessionTrackKind;
  trackId?: string;
  sourceId?: string;
  sourceUrl?: string;
  size?: number;
  durationMs?: number;
  kind?: SessionTrackKind;
  recordedStartAt?: string;
  recordedEndAt?: string;
  recordedSessionStartMs?: number;
  recordedSessionEndMs?: number;
};

type RecordingSessionPackage = {
  projectSlug?: string;
  episodeSlug?: string;
  episodeLabel?: string;
  roomName?: string;
  durationMs?: number;
  events?: RecordingSessionEvent[];
  clips?: Array<{ id?: string; title?: string; url?: string; segments?: Array<{ id?: string; start?: string; end?: string; note?: string }> }>;
  tracks?: RecordingSessionTrack[];
  script?: string;
};

function makeId(prefix = "timeline") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function coerceArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function coerceOptionalString(value: unknown, fallback?: string) {
  return typeof value === "string" ? value : fallback ?? "";
}

function normalizeImportedMediaAssets(value: unknown): ImportedMediaAsset[] {
  const record = asObject(value);
  const importedMedia = coerceArray<Record<string, unknown>>(record?.importedMedia);

  return importedMedia
    .map<ImportedMediaAsset | null>((asset) => {
      const sourceId = coerceString(asset.sourceId);
      const playbackUrl = coerceString(asset.playbackUrl);
      const id = coerceString(asset.id, sourceId || makeId("import"));
      const kind = asset.kind === "audio" || asset.kind === "video" || asset.kind === "unknown" ? asset.kind : "unknown";
      if (!sourceId || !playbackUrl) return null;

      return {
        id,
        sourceId,
        projectSlug: coerceString(asset.projectSlug, DEFAULT_EDITOR_PROJECT_SLUG),
        episodeSlug: coerceString(asset.episodeSlug, "current-episode"),
        originalName: coerceString(asset.originalName, "Imported media"),
        contentType: coerceString(asset.contentType, "application/octet-stream"),
        size: typeof asset.size === "number" && Number.isFinite(asset.size) ? asset.size : 0,
        kind,
        is360: Boolean(asset.is360),
        originalFormat: coerceString(asset.originalFormat),
        bucketName: coerceString(asset.bucketName),
        objectName: coerceString(asset.objectName),
        gcsUri: coerceString(asset.gcsUri),
        playbackUrl,
        importedAt: coerceString(asset.importedAt, new Date().toISOString()),
        source: coerceString(asset.source),
        importRole: coerceString(asset.importRole || asObject(asset.sync)?.suggestedRole),
        sync: (asObject(asset.sync) ?? undefined) as ImportedMediaAsset["sync"],
        proxy: (asObject(asset.proxy) ?? undefined) as ImportedMediaAsset["proxy"],
      } satisfies ImportedMediaAsset;
    })
    .filter((asset): asset is ImportedMediaAsset => asset !== null);
}

function patchImportedMediaProxy(
  value: unknown,
  asset: Pick<ImportedMediaAsset, "id" | "sourceId">,
  patch: Record<string, unknown>,
) {
  const root = asObject(value);
  if (!root) return value;
  let matched = false;
  const importedMedia = coerceArray<Record<string, unknown>>(root.importedMedia).map((entry) => {
    if (entry.id !== asset.id && entry.sourceId !== asset.sourceId) return entry;
    matched = true;
    return {
      ...entry,
      proxy: {
        ...(asObject(entry.proxy) ?? {}),
        ...patch,
      },
    };
  });
  return matched ? { ...root, importedMedia } : value;
}

function draftNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePremiereDraftEdits(value: unknown): PremiereDraftEdit[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.premiereDraftEdits)
    .map((draft) => {
      const summary = asObject(draft.summary) ?? {};
      const assetMatches = coerceArray<Record<string, unknown>>(draft.assetMatches)
        .map((match) => ({
          id: coerceString(match.id || match.premiereAssetId, makeId("premiere-match")),
          displayName: coerceString(match.displayName, "Premiere media"),
          kind: coerceString(match.kind, "unknown"),
          status: coerceString(match.status, "unknown"),
          registeredAssetId: coerceString(match.registeredAssetId),
        }));
      const timelineClips = coerceArray<Record<string, unknown>>(draft.timelineClips);
      const deactivatedSourceRanges = coerceArray<Record<string, unknown>>(draft.deactivatedSourceRanges);
      const normalizedDeactivatedSourceRanges = deactivatedSourceRanges.map((range) => {
        const sourceStart = draftNumber(range.sourceStart, 0);
        const sourceEnd = draftNumber(range.sourceEnd, sourceStart + draftNumber(range.duration, 0.05));
        const duration = Math.max(0.05, draftNumber(range.duration, sourceEnd - sourceStart));

        return {
          id: coerceString(range.id, makeId("premiere-cut-range")),
          assetId: coerceString(range.assetId),
          premiereAssetId: coerceString(range.premiereAssetId || range.assetId),
          kind: coerceString(range.kind, "unknown"),
          sourceStart,
          sourceEnd: Math.max(sourceStart + duration, sourceEnd),
          duration,
          matchStatus: coerceString(range.matchStatus, Boolean(range.assetMatched) ? "matched" : "unknown"),
          confidence: coerceString(range.confidence),
          reason: coerceString(range.reason),
        } satisfies PremiereDraftDeactivatedRange;
      });
      const warnings = coerceArray<unknown>(draft.warnings)
        .map((warning) => coerceString(warning))
        .filter(Boolean);
      const id = coerceString(draft.id, makeId("premiere-draft"));

      return {
        id,
        projectSlug: coerceString(draft.projectSlug, DEFAULT_EDITOR_PROJECT_SLUG),
        episodeSlug: coerceString(draft.episodeSlug, "current-episode"),
        primarySequenceName: coerceString(draft.primarySequenceName, "Premiere sequence"),
        stagedAt: coerceString(draft.stagedAt || draft.generatedAt),
        timelineClipCount: draftNumber(summary.timelineClipCount, timelineClips.length),
        matchedTimelineClipCount: draftNumber(summary.matchedTimelineClipCount, timelineClips.filter((clip) => coerceString(clip.matchStatus) === "matched" || Boolean(clip.assetMatched)).length),
        deactivatedSourceRangeCount: draftNumber(summary.deactivatedSourceRangeCount, deactivatedSourceRanges.length),
        readyMediaCount: draftNumber(summary.readyMediaCount),
        heldMediaCount: draftNumber(summary.heldMediaCount, assetMatches.filter((match) => match.status === "held").length),
        warnings,
        timelineClips: timelineClips.map(normalizeTimelineClip).filter((clip): clip is TimelineClip => Boolean(clip)),
        deactivatedSourceRanges: normalizedDeactivatedSourceRanges,
        assetMatches,
      } satisfies PremiereDraftEdit;
    })
    .sort((a, b) => b.stagedAt.localeCompare(a.stagedAt));
}

function normalizeTimelineBackups(value: unknown): TimelineBackupRecord[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.timelineBackups)
    .map((backup) => {
      const timelineJson = asObject(backup.timelineJson);
      const timelineClips = coerceArray(timelineJson?.timelineClips);
      const productionTimelineClips = coerceArray(backup.productionTimelineClips);
      return {
        id: coerceString(backup.id, makeId("timeline-backup")),
        createdAt: coerceString(backup.createdAt),
        source: coerceString(backup.source, "timeline-backup"),
        draftEditId: coerceString(backup.draftEditId),
        restoredFromBackupId: coerceString(backup.restoredFromBackupId),
        timelineClipCount: draftNumber(backup.timelineClipCount, timelineClips.length || productionTimelineClips.length),
      } satisfies TimelineBackupRecord;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function normalizeAiIngestReport(value: unknown): AiIngestReport | null {
  const record = asObject(value);
  const report = asObject(record?.aiIngestReport);
  if (!report) return null;

  const summary = coerceString(report.summary);
  if (!summary) return null;

  return {
    source: coerceString(report.source),
    generatedAt: coerceString(report.generatedAt),
    summary,
    recommendations: coerceArray<Record<string, unknown>>(report.recommendations).map((recommendation) => ({
      assetId: coerceString(recommendation.assetId),
      role: coerceString(recommendation.role, "unknown"),
      confidence: typeof recommendation.confidence === "number" && Number.isFinite(recommendation.confidence)
        ? recommendation.confidence
        : 0,
      suggestedTrackId: coerceString(recommendation.suggestedTrackId, "V3"),
      suggestedSyncStatus: coerceString(recommendation.suggestedSyncStatus, "ready-to-sync"),
      suggestedAction: coerceString(recommendation.suggestedAction),
      reason: coerceString(recommendation.reason),
      suggestedAnchorTimelineSeconds: coerceOptionalNumber(recommendation.suggestedAnchorTimelineSeconds),
    })).filter((recommendation) => recommendation.assetId),
    batchPlan: coerceArray<Record<string, unknown>>(report.batchPlan).map((step) => ({
      title: coerceString(step.title, "Next step"),
      detail: coerceString(step.detail),
    })).filter((step) => step.detail),
    warnings: coerceArray<unknown>(report.warnings)
      .map((warning) => coerceString(warning))
      .filter(Boolean),
  };
}

function normalizeTranscriptAssistReports(value: unknown): TranscriptAssistReport[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.transcriptAssistReports)
    .map((report) => {
      const kind: TranscriptAssistReport["kind"] = report.kind === "audio" || report.kind === "video" || report.kind === "unknown" ? report.kind : "unknown";
      return {
        id: coerceString(report.id, makeId("transcript-assist")),
        source: coerceString(report.source, "unknown"),
        generatedAt: coerceString(report.generatedAt),
        assetId: coerceString(report.assetId),
        sourceId: coerceString(report.sourceId),
        originalName: coerceString(report.originalName, "Imported media"),
        contentType: coerceString(report.contentType),
        kind,
        inspectedRawMedia: Boolean(report.inspectedRawMedia),
        summary: coerceString(report.summary),
        transcriptText: coerceString(report.transcriptText),
        transcriptBlocks: coerceArray<Record<string, unknown>>(report.transcriptBlocks).map((block) => ({
          startSeconds: coerceNumber(block.startSeconds, 0),
          endSeconds: coerceNumber(block.endSeconds, 0),
          speaker: coerceString(block.speaker, "Unknown"),
          text: coerceString(block.text),
          confidence: coerceNumber(block.confidence, 0),
        })).filter((block) => block.text),
        suggestedUse: coerceString(report.suggestedUse),
        warnings: coerceArray<unknown>(report.warnings).map((warning) => coerceString(warning)).filter(Boolean),
      };
    })
    .filter((report) => report.assetId && (report.summary || report.transcriptText || report.suggestedUse));
}

function normalizeMediaAnalysisJobType(value: unknown): MediaAnalysisJobType {
  const raw = coerceString(value);
  if (raw === "transcript" || raw === "file-triage" || raw === "sync-suggestion" || raw === "proxy-needed") return raw;
  return "file-triage";
}

function normalizeMediaAnalysisJobStatus(value: unknown): MediaAnalysisJobStatus {
  const raw = coerceString(value);
  if (raw === "queued" || raw === "running" || raw === "completed" || raw === "failed" || raw === "canceled") return raw;
  return "queued";
}

function normalizeMediaAnalysisJobs(value: unknown): MediaAnalysisJob[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.mediaAnalysisJobs)
    .map((job) => ({
      id: coerceString(job.id, makeId("media-job")),
      assetId: coerceString(job.assetId),
      type: normalizeMediaAnalysisJobType(job.type),
      status: normalizeMediaAnalysisJobStatus(job.status),
      startedAt: coerceString(job.startedAt),
      completedAt: coerceString(job.completedAt) || null,
      error: coerceString(job.error) || null,
      result: asObject(job.result) ?? {},
    }))
    .filter((job) => job.assetId);
}

function mediaAnalysisJobTone(status: MediaAnalysisJobStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (status === "running") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "canceled") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function mediaAnalysisJobLabel(type: MediaAnalysisJobType) {
  if (type === "transcript") return "Transcript";
  if (type === "file-triage") return "File triage";
  if (type === "sync-suggestion") return "Sync suggestion";
  return "Proxy needed";
}

function normalizeSyncHistory(value: unknown): SyncHistorySnapshot[] {
  const record = asObject(value);
  return coerceArray<Record<string, unknown>>(record?.syncHistory).map((snapshot) => ({
    id: coerceString(snapshot.id),
    type: coerceString(snapshot.type),
    assetId: coerceString(snapshot.assetId),
    targetClipId: coerceString(snapshot.targetClipId),
    label: coerceString(snapshot.label),
    createdAt: coerceString(snapshot.createdAt),
    beforeSync: snapshot.beforeSync,
    afterSync: snapshot.afterSync,
    beforeClip: asObject(snapshot.beforeClip) as SyncHistorySnapshot["beforeClip"],
    afterClip: asObject(snapshot.afterClip) as SyncHistorySnapshot["afterClip"],
  })).filter((snapshot) => snapshot.type);
}

function normalizeEpisodeSpineAudio(value: unknown): EpisodeSpineAudio | null {
  const record = asObject(value);
  if (!record) return null;
  const assetId = coerceString(record.spineAudioAssetId);
  const clipId = coerceString(record.spineAudioClipId);
  if (!assetId && !clipId) return null;

  return {
    assetId: assetId || undefined,
    clipId: clipId || undefined,
    source: coerceString(record.spineAudioSource) || undefined,
    label: coerceString(record.spineAudioLabel, assetId || clipId || "Spine audio"),
    setAt: coerceString(record.spineAudioSetAt) || undefined,
  };
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function importedAssetTrackId(asset: ImportedMediaAsset) {
  const suggestedTrackId = normalizeSuggestedTrackId(asset.sync?.suggestedTrackId);
  if (suggestedTrackId) return suggestedTrackId;
  return asset.kind === "audio" ? DEFAULT_AUDIO_TRACK : INITIAL_VIDEO_TRACK_B;
}

function importedAssetKind(asset: ImportedMediaAsset): "audio" | "video" {
  if (asset.kind === "audio" || asset.contentType.startsWith("audio/")) return "audio";
  return "video";
}

function cleanImportedClipName(asset: ImportedMediaAsset) {
  const role = humanizeSlug(asset.importRole || asset.sync?.suggestedRole || asset.kind || "media");
  const baseName = (asset.originalName || "Imported media")
    .replace(/\.[a-z0-9]{2,6}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanBaseName = baseName || "Imported media";
  return `${role}: ${cleanBaseName}`.slice(0, 90);
}

function trackSortValue(trackId: string) {
  const match = /^([VA])(\d+)(?:\.(\d+))?$/i.exec(trackId);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[2]) + (match[3] ? Number(`0.${match[3]}`) : 0);
}

function sortedUniqueTrackIds(trackIds: string[], kind: "audio" | "video") {
  const prefix = kind === "audio" ? TRACK_PREFIX_AUDIO : TRACK_PREFIX_VIDEO;
  return Array.from(new Set(trackIds))
    .filter((trackId) => trackId.toUpperCase().startsWith(prefix))
    .sort((a, b) => trackSortValue(a) - trackSortValue(b));
}

function nextTrackIdForKind(existingTrackIds: string[], kind: "audio" | "video") {
  const prefix = kind === "audio" ? TRACK_PREFIX_AUDIO : TRACK_PREFIX_VIDEO;
  const usedIndexes = existingTrackIds
    .map((trackId) => new RegExp(`^${prefix}(\\d+)`, "i").exec(trackId)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter(Number.isFinite);
  return makeTrackId(prefix, Math.max(0, ...usedIndexes) + 1);
}

function clipOverlapsRange(clip: TimelineClip, startIn: number, duration: number) {
  const clipStart = clip.startIn;
  const clipEnd = clip.startIn + Math.max(clip.duration, 0.05);
  const rangeEnd = startIn + Math.max(duration, 0.05);
  return clipStart < rangeEnd && clipEnd > startIn;
}

function smartImportedAssetPlacement(asset: ImportedMediaAsset, clips: TimelineClip[], playheadSeconds: number) {
  const kind = importedAssetKind(asset);
  const startIn = roundSeconds(Math.max(0, playheadSeconds));
  const duration = 30;
  const suggestedTrackId = normalizeSuggestedTrackId(asset.sync?.suggestedTrackId);
  const existingCompatibleTrackIds = sortedUniqueTrackIds(
    clips
      .filter((clip) => clip.kind === kind || trackKindFromTrackId(clip.trackId) === kind)
      .map((clip) => clip.trackId),
    kind,
  );
  const defaultTrackId = kind === "audio" ? DEFAULT_AUDIO_TRACK : INITIAL_VIDEO_TRACK_B;
  const candidateTrackIds = sortedUniqueTrackIds(
    [
      ...(suggestedTrackId ? [suggestedTrackId] : []),
      defaultTrackId,
      ...existingCompatibleTrackIds,
    ],
    kind,
  );
  const openTrackId = candidateTrackIds.find((trackId) =>
    !clips.some((clip) => clip.trackId === trackId && clipOverlapsRange(clip, startIn, duration))
  );
  const trackId = openTrackId ?? nextTrackIdForKind([...candidateTrackIds, ...clips.map((clip) => clip.trackId)], kind);

  return {
    kind,
    trackId,
    startIn,
    duration,
    name: cleanImportedClipName(asset),
    avoidedOverlap: trackId !== suggestedTrackId && trackId !== defaultTrackId,
  };
}

function importedAssetColor(asset: ImportedMediaAsset) {
  if (asset.kind === "audio") return "#d97706";
  if (asset.kind === "video") return "#7c3aed";
  return "#64748b";
}

function importedAssetTimelinePercent(asset: ImportedMediaAsset, totalDuration: number) {
  const anchor = asset.sync?.anchorTimelineSeconds;
  if (typeof anchor !== "number" || !Number.isFinite(anchor) || totalDuration <= 0) return null;
  return Math.max(0, Math.min(100, (anchor / totalDuration) * 100));
}

function importedAssetAudioSignal(asset: ImportedMediaAsset | null, durableProfile?: AudioSignalProfileClientStatus | null, maximumWaveformPoints = 360) {
  const durableEvidence = parseAudioSignalEvidence(durableProfile?.audioSignal, { maximumWaveformPoints });
  if (durableEvidence) return durableEvidence;
  const recordingSync = asObject(asset?.sync?.recordingSync);
  const sourceProfile = asObject(recordingSync?.reportedSourceProfile);
  return parseAudioSignalEvidence(sourceProfile?.audioSignal, { maximumWaveformPoints });
}

function importedAssetDurationSeconds(asset: ImportedMediaAsset | null, durableProfile?: AudioSignalProfileClientStatus | null) {
  if (durableProfile?.media?.durationSeconds && durableProfile.media.durationSeconds > 0) return durableProfile.media.durationSeconds;
  const recordingSync = asObject(asset?.sync?.recordingSync);
  const duration = Number(recordingSync?.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) return duration;
  return importedAssetAudioSignal(asset, durableProfile)?.durationSeconds ?? null;
}

function importedAssetSyncLabel(asset: ImportedMediaAsset) {
  const status = asset.sync?.status ?? "ready-to-sync";
  if (status === "synced") {
    return reviewedSourceAlignment(asset)
      ? "Reviewed placement"
      : "Legacy sync";
  }
  if (status === "held") return "Held";
  return "Safe to test";
}

function importedAssetSyncTone(asset: ImportedMediaAsset) {
  const status = asset.sync?.status ?? "ready-to-sync";
  if (status === "synced") {
    return reviewedSourceAlignment(asset)
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status === "held") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function importedAssetConfidenceStatus(asset: ImportedMediaAsset, health: MediaSourceHealth | null | undefined) {
  const syncStatus = asset.sync?.status ?? "ready-to-sync";

  if (syncStatus === "held") {
    return {
      label: "Held",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      meaning: "This file is saved, but intentionally parked for later.",
      next: "Ignore it for now. Unpark it only when you actually need it.",
    };
  }

  if (health?.status === "error") {
    return {
      label: "Broken source",
      tone: "border-red-200 bg-red-50 text-red-900",
      meaning: "Quipsly cannot confidently read this file right now.",
      next: "Relink it, replace it, or park it so it stops blocking the edit.",
    };
  }

  if (syncStatus === "synced") {
    const review = reviewedSourceAlignment(asset);
    return {
      label: review ? "Reviewed placement" : "Legacy sync",
      tone: review
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-200 bg-amber-50 text-amber-900",
      meaning: review
        ? "A named editor approved this reversible placement after waveform and later-take drift review."
        : "This older file says synced, but it has no complete reviewer or evidence receipt.",
      next: review
        ? "Keep editing; reopen Guided sync if new evidence changes the placement."
        : "Run Guided sync once to replace the legacy flag with a reviewed placement receipt.",
    };
  }

  if (health?.status === "warning" || (health && !health.renderUsable)) {
    return {
      label: "Needs review",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      meaning: "This is usable for checking the edit, but it may need a cleaner source before export.",
      next: "Preview it, then relink or replace it before final render if needed.",
    };
  }

  if (!health || health.status === "checking" || health.previewUsable || health.status === "ok") {
    return {
      label: "Safe to test",
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      meaning: "Nothing here should stop you from trying it in the edit.",
      next: "Add it to the timeline or use Guided sync to create a reviewed placement receipt.",
    };
  }

  return {
    label: "Needs review",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    meaning: "This file is saved, but Quipsly needs a human check before trusting it.",
    next: "Preview it once. If it feels wrong, park it or replace it.",
  };
}

function importedAssetRoleLabel(asset: ImportedMediaAsset) {
  const role = coerceString(asset.importRole || asset.sync?.suggestedRole, "").trim();
  if (role === "spine-audio") return "Spine audio";
  if (role === "audio-source") return "Audio source";
  if (role === "phone-audio") return "Phone audio";
  if (role === "camera-video") return "Camera video";
  if (role === "reference-clip") return "Reference clip";
  if (role === "source-clip") return "YouTube/source";
  if (role) return humanizeSlug(role);
  if (asset.kind === "audio") return "Audio";
  if (asset.kind === "video") return "Video";
  return "Episode media";
}

function importedAssetRecordingAssetId(asset: ImportedMediaAsset | null) {
  if (!asset) return null;
  const recordingSync = asset.sync?.recordingSync ?? {};
  const value =
    asset.sync?.recordingAssetId
    ?? recordingSync.recordingAssetId;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

const EPISODE_IMPORT_LANES: EpisodeImportLane[] = [
  {
    id: "phone-audio",
    title: "Phone audio",
    description: "Clean host/guest recording, voice memos, Riverside backup, or call audio.",
    accept: "audio/*,.mp3,.m4a,.wav,.aac,.ogg,.webm",
    buttonLabel: "Import phone audio",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  {
    id: "camera-video",
    title: "Camera video",
    description: "Main camera, iPhone video, Insta360 export, screen recording, or A-roll.",
    accept: "video/*,.mp4,.mov,.m4v,.webm,.mkv",
    buttonLabel: "Import camera video",
    tone: "border-sky-200 bg-sky-50 text-sky-950",
  },
  {
    id: "reference-clip",
    title: "Reference clips",
    description: "Local clips to watch, quote, react to, compare, or use as B-roll/source reference.",
    accept: "video/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav,.aac",
    buttonLabel: "Import reference clip",
    tone: "border-amber-200 bg-amber-50 text-amber-950",
  },
];

const SYNC_STATUS_GUIDE = [
  {
    label: "Safe to test",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
    meaning: "Nothing here should stop you from trying the file in the edit.",
  },
  {
    label: "Needs review",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    meaning: "Usable for checking, but verify or replace before trusting final export.",
  },
  {
    label: "Synced",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    meaning: "A reviewer compared opening and later events and accepted a reversible placement.",
  },
  {
    label: "Held",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    meaning: "Saved and parked. It does not need attention right now.",
  },
  {
    label: "Broken source",
    tone: "border-red-200 bg-red-50 text-red-900",
    meaning: "Quipsly cannot confidently read this file. Relink, replace, or park it.",
  },
];

function SyncStatusGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-[#e8dcc4] bg-white p-3 text-[11px] font-bold leading-5 text-[#5d4528] ${compact ? "mt-2" : "mt-3"}`}>
      <div className="font-black uppercase tracking-[0.16em] text-[#9a641e]">Status guide</div>
      <div className={`mt-2 grid gap-2 ${compact ? "" : "md:grid-cols-2"}`}>
        {SYNC_STATUS_GUIDE.map((status) => (
          <div key={status.label} className={`rounded-md border px-2 py-2 ${status.tone}`}>
            <div className="font-black">{status.label}</div>
            <div className="mt-1 text-[10px] opacity-85">{status.meaning}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSuggestedTrackId(value: unknown) {
  const raw = coerceString(value, "").trim().toUpperCase();
  if (/^[VA]\d+(?:\.\d+)?$/.test(raw)) return raw;
  return "";
}

function normalizeSuggestedSyncStatus(value: unknown): "ready-to-sync" | "held" {
  const raw = coerceString(value, "").trim();
  return raw === "held" ? "held" : "ready-to-sync";
}

function recommendationApplySummary(recommendation: AiIngestRecommendation) {
  const status = normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus);
  const trackId = normalizeSuggestedTrackId(recommendation.suggestedTrackId);
  return [
    `status: ${status}`,
    trackId ? `suggested track: ${trackId}` : "no safe track suggestion",
  ].join(" / ");
}

function coerceNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

function parseTrackKindFromSource(assetId: string): "audio" | "video" {
  const lower = assetId.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  return "video";
}

function looksLikeEpisodePayload(value: unknown) {
  const record = asObject(value);
  if (!record) return false;

  return (
    "projectSlug" in record ||
    "episodeSlug" in record ||
    "timelineClips" in record ||
    "clips" in record ||
    "transcript" in record ||
    "blocks" in record ||
    "events" in record ||
    "roomName" in record
  );
}

function normalizeEpisodePayload(payload: unknown): Record<string, unknown> | null {
  const record = asObject(payload);
  if (!record) return null;

  const wrappedPayload = asObject(record.payload);
  if (looksLikeEpisodePayload(wrappedPayload)) return wrappedPayload;

  const dataPayload = asObject(record.data);
  if (looksLikeEpisodePayload(dataPayload)) return dataPayload;

  const roomPayload = asObject(record.room);
  if (looksLikeEpisodePayload(roomPayload)) return roomPayload;

  const rootFallbacks = asObject(record.recordingRoom);
  if (looksLikeEpisodePayload(rootFallbacks)) return rootFallbacks;

  const wrappedEpisodePayload = asObject(record.episodePayload);
  if (looksLikeEpisodePayload(wrappedEpisodePayload)) return wrappedEpisodePayload;

  if (typeof record.payloadVersion === "number") return record;
  if (typeof record.version === "number") return record;
  if (typeof record.version === "string") return record;

  return record;
}

function normalizeTrackIdFallback(value: unknown, fallbackIndex: number, kind: SessionTrackKind = "audio") {
  return normalizeTrackIdForKind(value, kind, fallbackIndex);
}

function inferTrackKindFromTrackId(raw: unknown) {
  const safe = coerceString(raw, "").toUpperCase().trim();
  if (safe.startsWith("V")) return "video" as const;
  if (safe.startsWith("A")) return "audio" as const;
  return undefined;
}

function inferTrackKindFromType(rawType: string) {
  const normalized = (rawType || "").toLowerCase();
  if (normalized.includes("video")) return "video" as SessionTrackKind;
  if (normalized.includes("audio")) return "audio" as SessionTrackKind;
  return undefined;
}

function inferTrackKindFromValue(track: { type?: string | undefined; trackId?: string | undefined; sourceUrl?: string | undefined; }): SessionTrackKind {
  const explicitKind = inferTrackKindFromType(track.type || "");
  if (explicitKind) return explicitKind;

  const byTrackId = inferTrackKindFromTrackId(track.trackId);
  if (byTrackId) return byTrackId;

  const sourceUrl = coerceOptionalString(track.sourceUrl, "").toLowerCase();
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(sourceUrl)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(sourceUrl)) return "audio";
  return "audio";
}

function inferTrackKindFromSourceUrl(sourceUrl: string, fallback: SessionTrackKind = "video"): SessionTrackKind {
  const lower = sourceUrl.trim().toLowerCase();
  if (!lower) return fallback;
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  if (lower.includes(".youtube.com") || lower.includes("youtu.be")) return "video";
  return fallback;
}

function sanitizeTrackSource(value: unknown) {
  const raw = coerceString(value, "").trim();
  if (!raw || raw.startsWith("blob:")) return "";
  return raw;
}

function sanitizeSessionTrackDurationSeconds(raw: unknown, fallback = 0) {
  const ms = coerceNumber(raw, fallback * 1000);
  const seconds = ms <= 0 ? 0 : ms / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.max(0.05, seconds);
}

function normalizeSegmentTime(value: unknown, fallback: number) {
  const raw = (coerceOptionalString(value) ?? String(fallback)).trim();
  if (!raw || raw.toLowerCase() === "open") return Math.max(0, fallback);

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : Math.max(0, fallback);
  }

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return Math.max(0, fallback);
  return Math.max(0, parts.reduce((total, part) => total * 60 + part, 0));
}

function sanitizeSegmentRange(rawSegment?: { start?: string; end?: string }): SegmentTimelineRange {
  const start = normalizeSegmentTime(rawSegment?.start, 0);
  const parsedEnd = normalizeSegmentTime(rawSegment?.end, Number.NaN);
  const end = Number.isFinite(parsedEnd) && parsedEnd > start
    ? parsedEnd
    : start + RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS;

  const sourceStart = Number(start.toFixed(3));
  const sourceEnd = Number(Math.max(sourceStart + RECORDER_SEGMENT_MIN_DURATION_SECONDS, end).toFixed(3));
  const duration = Number(Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, sourceEnd - sourceStart).toFixed(3));

  return { sourceStart, sourceEnd, duration };
}

function sanitizeLegacyAssetId(value: unknown, fallback = "") {
  const raw = coerceString(value, "").trim();
  if (!raw || raw === "youtube-clip") return fallback;
  return raw;
}

function normalizeTimelineClip(raw: unknown): TimelineClip | null {
  if (!raw || typeof raw !== "object") return null;
  const record = asObject(raw);
  if (!record) return null;

  const sourceStart = Math.max(0, coerceNumber(record.sourceStart, 0));
  const sourceEnd = Math.max(sourceStart, coerceNumber(record.sourceEnd, sourceStart + coerceNumber(record.duration, RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS)));
  const duration = coerceNumber(record.duration, RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS);
  const explicitSourceId = sanitizeLegacyAssetId(record.assetId as unknown);
  if (!record.id && !explicitSourceId && !record.name) return null;
  const explicitTrackKind = inferTrackKindFromType(coerceOptionalString(record.type as unknown));
  const inferredTrackKind = explicitTrackKind
    ?? trackKindFromTrackId((record as { trackId?: unknown }).trackId as string)
    ?? parseTrackKindFromSource(coerceString(record.assetId));
  const resolvedTrackKind = explicitTrackKind ?? inferredTrackKind;
  const safeTrackId = normalizeTrackId(
    (record as { trackId?: unknown }).trackId,
    DEFAULT_VIDEO_TRACK,
    resolvedTrackKind,
  );
  const safeDuration = Math.max(0.05, duration);
  const safeSourceStart = Math.max(0, sourceStart);
  const safeSourceDuration = Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, safeDuration);

  const recordingSync = asObject(record.recordingSync);
  const episodeRoomSessionId = coerceString(recordingSync?.episodeRoomSessionId);
  const watchSegmentId = coerceString(recordingSync?.watchSegmentId);
  const startReceiptId = coerceString(recordingSync?.startReceiptId);
  const endReceiptId = coerceString(recordingSync?.endReceiptId);
  const watchedAt = coerceString(recordingSync?.watchedAt);
  const hasRecordingSync = Boolean(
    episodeRoomSessionId
    && watchSegmentId
    && startReceiptId
    && endReceiptId
    && watchedAt
  );

  return {
    id: coerceString(record.id, makeId("clip")),
    assetId: explicitSourceId || "unknown-asset",
    trackId: safeTrackId,
    startIn: Math.max(0, coerceNumber(record.startIn, 0)),
    duration: safeSourceDuration,
    kind: resolvedTrackKind,
    sourceStart: safeSourceStart,
    sourceEnd: roundSeconds(Math.max(safeSourceStart, sourceEnd)),
    name: coerceString(record.name, "Clip"),
    color: coerceString(record.color, "#2563eb"),
    generatedFrom: coerceOptionalString(record.generatedFrom),
    ...(hasRecordingSync ? {
      recordingSync: {
        episodeRoomSessionId,
        watchSegmentId,
        startReceiptId,
        endReceiptId,
        watchedAt,
        ...(coerceString(recordingSync?.recordingRoomId)
          ? { recordingRoomId: coerceString(recordingSync?.recordingRoomId) }
          : {}),
        ...(coerceString(recordingSync?.recordingStartedAt)
          ? { recordingStartedAt: coerceString(recordingSync?.recordingStartedAt) }
          : {}),
      },
    } : {}),
  };
}

function normalizeTranscriptBlock(raw: unknown): TranscriptBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const record = asObject(raw);
  if (!record) return null;

  const text = coerceString(record.text);
  const id = coerceString(record.id, makeId("block"));
  if (!text.trim()) return null;

  return {
    id,
    time: Math.max(0, coerceNumber(record.time, 0)),
    duration: Math.max(0.1, coerceNumber(record.duration, 0)),
    text,
    deleted: coerceBoolean(record.deleted, false),
    alert: typeof record.alert === "string" ? record.alert : null,
    speaker: coerceOptionalString(record.speaker ?? record.speakerLabel, undefined) ?? null,
    deactivated: coerceBoolean(record.deactivated, false),
  };
}

function normalizePaperEditSnapshots(raw: unknown): TimelineState["paperEditSnapshots"] {
  const record = asObject(raw);
  if (!record) return undefined;

  const entries: Array<[string, NonNullable<TimelineState["paperEditSnapshots"]>[string]]> = [];

  Object.entries(record).forEach(([blockId, snapshot]) => {
    const snapshotRecord = asObject(snapshot);
    if (!snapshotRecord) return;
    const clips = coerceArray(snapshotRecord.clips)
      .map(normalizeTimelineClip)
      .filter((clip): clip is TimelineClip => Boolean(clip));
    const transcript = coerceArray(snapshotRecord.transcript)
      .map(normalizeTranscriptBlock)
      .filter((block): block is TranscriptBlock => Boolean(block));
    if (!clips.length && !transcript.length) return;
    entries.push([
      blockId,
      {
        clips,
        transcript,
        createdAt: coerceOptionalString(snapshotRecord.createdAt, undefined),
        label: coerceOptionalString(snapshotRecord.label, undefined),
      },
    ]);
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeRecordingSessionPackage(raw: unknown): RecordingSessionPackage | null {
  const record = asObject(raw);
  if (!record) return null;

  const events = coerceArray<unknown>(record.events ?? record.eventLog);
  const clips = coerceArray<unknown>(record.clips ?? (record as { recordingClips?: unknown }).recordingClips);
  const trackRecords = coerceArray<unknown>(record.tracks ?? (record as { recordingTracks?: unknown }).recordingTracks);
  const episodeLabel = coerceOptionalString(record.episodeLabel) || coerceOptionalString(record.boundaryLabel);
  const roomName = coerceOptionalString(record.roomName) || coerceOptionalString((record as { name?: unknown }).name);
  const script = coerceOptionalString(record.script) || coerceOptionalString((record as { text?: unknown }).text);
  const durationMs = coerceNumber(record.durationMs, coerceNumber(record.duration, 0));
  const projectSlug = coerceOptionalString(record.projectSlug) || coerceOptionalString((record as { project?: unknown }).project);
  const episodeSlug = coerceOptionalString(record.episodeSlug) || coerceOptionalString((record as { episode?: unknown }).episode);

  return {
    projectSlug,
    episodeSlug,
    episodeLabel,
    roomName,
    durationMs,
    script: script,
    tracks: trackRecords.map((track, index) => {
      const trackRecord = asObject(track);
      const id = coerceOptionalString(trackRecord?.id, makeId("track"));
      if (!trackRecord) {
        return {
          id,
          kind: "audio",
        };
      }
      const inferredTrackKind = inferTrackKindFromValue({
        type: coerceOptionalString(trackRecord.type),
        trackId: coerceOptionalString(trackRecord.trackId),
      });
      return {
        id,
        name: coerceOptionalString(trackRecord.name),
        size: coerceNumber(trackRecord.size, 0),
        type: inferredTrackKind,
        trackId: normalizeTrackIdFallback(trackRecord.trackId, index + 1, inferredTrackKind),
        sourceId: coerceOptionalString(trackRecord.sourceId),
        sourceUrl: sanitizeTrackSource(trackRecord.sourceUrl),
        durationMs: coerceNumber(trackRecord.durationMs, 0),
        kind: inferredTrackKind,
        recordedStartAt: coerceOptionalString(trackRecord.recordedStartAt, undefined),
        recordedEndAt: coerceOptionalString(trackRecord.recordedEndAt, undefined),
        recordedSessionStartMs: coerceOptionalNumber(trackRecord.recordedSessionStartMs),
        recordedSessionEndMs: coerceOptionalNumber(trackRecord.recordedSessionEndMs),
      } satisfies RecordingSessionTrack;
    }),
    events: events.map((event) => {
      const eventRecord = asObject(event);
      if (!eventRecord) {
        return {
          id: makeId("event"),
          kind: "note",
          label: "Event",
          atMs: 0,
        } satisfies RecordingSessionEvent;
      }
      const clipPlayback = asObject(eventRecord.clipPlayback);
      const eventKind = coerceOptionalString(eventRecord.kind);
      const normalizedKind = ["session", "marker", "clip", "retake", "note"].includes(eventKind)
        ? eventKind as RecordingSessionEvent["kind"]
        : "note";
      const playbackSourceUrl = sanitizeTrackSource(clipPlayback?.sourceUrl);
      const playbackStartSeconds = coerceOptionalNumber(clipPlayback?.sourceStartSeconds);
      const playbackEndSeconds = coerceOptionalNumber(clipPlayback?.sourceEndSeconds);
      const normalizedClipPlayback = clipPlayback
        && coerceOptionalString(clipPlayback.clipId)
        && coerceOptionalString(clipPlayback.segmentId)
        && playbackSourceUrl
        && playbackStartSeconds !== undefined
        && playbackEndSeconds !== undefined
        && playbackEndSeconds > playbackStartSeconds
          ? {
              clipId: coerceOptionalString(clipPlayback.clipId),
              segmentId: coerceOptionalString(clipPlayback.segmentId),
              sourceUrl: playbackSourceUrl,
              sourceStartSeconds: playbackStartSeconds,
              sourceEndSeconds: playbackEndSeconds,
            }
          : undefined;
      return {
        id: coerceOptionalString(eventRecord.id, makeId("event")),
        kind: normalizedKind,
        label: coerceOptionalString(eventRecord.label, "Event"),
        atMs: coerceNumber(eventRecord.atMs, 0),
        note: coerceOptionalString(eventRecord.note) || undefined,
        clipPlayback: normalizedClipPlayback,
        createdAt: coerceOptionalString(eventRecord.createdAt) || undefined,
      } satisfies RecordingSessionEvent;
    }),
    clips: clips.map((clip) => {
      const clipRecord = asObject(clip);
      if (!clipRecord) return {};
      return {
        id: coerceOptionalString(clipRecord.id),
        title: coerceOptionalString(clipRecord.title),
        url: coerceOptionalString(clipRecord.url),
        segments: coerceArray<unknown>(clipRecord.segments).map((segment) => {
          const segmentRecord = asObject(segment);
          if (!segmentRecord) return {};
          return {
            id: coerceOptionalString(segmentRecord.id),
            start: coerceOptionalString(segmentRecord.start),
            end: coerceOptionalString(segmentRecord.end),
            note: coerceOptionalString(segmentRecord.note),
          };
        }),
      };
    }),
  };
}

function resolveSessionTrackSource(track: RecordingSessionTrack) {
  if (track.sourceId) {
    return `/api/ingest/media/${track.sourceId}`;
  }

  if (track.sourceUrl) {
    return track.sourceUrl;
  }

  return "";
}

function inferSessionTrackKind(track: RecordingSessionTrack): SessionTrackKind {
  if (track.kind) return track.kind;

  return isVideoTrackId(track.trackId) ? "video" : "audio";
}

function trackDurationSeconds(track: RecordingSessionTrack, fallbackSeconds: number) {
  const sessionStartMs = Number(track.recordedSessionStartMs);
  const sessionEndMs = Number(track.recordedSessionEndMs);
  if (Number.isFinite(sessionStartMs) && Number.isFinite(sessionEndMs) && sessionEndMs >= sessionStartMs) {
    return sanitizeSessionTrackDurationSeconds(sessionEndMs - sessionStartMs, fallbackSeconds);
  }

  const startMs = track.recordedStartAt ? Date.parse(track.recordedStartAt) : Number.NaN;
  const endMs = track.recordedEndAt ? Date.parse(track.recordedEndAt) : Number.NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return sanitizeSessionTrackDurationSeconds(endMs - startMs, fallbackSeconds);
  }
  return sanitizeSessionTrackDurationSeconds(track.durationMs, fallbackSeconds);
}

function makeTrackIndexBase(track: RecordingSessionTrack, index: number) {
  return normalizeTrackIdFallback(track.trackId, index + 1, inferSessionTrackKind(track));
}

function buildSessionTrackClips(session: RecordingSessionPackage): TimelineClip[] {
  if (!session.tracks?.length) return [];

  const fallbackBaseSeconds = Math.max(
    RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS,
    (session.durationMs ?? 0) / 1000 / 2,
  );

  let endToEndCursor = 0;
  const tracksBySource = [...session.tracks]
    .map((track, index) => {
      const source = resolveSessionTrackSource(track);
      if (!source) return null;
      const explicitTrackId = coerceOptionalString(track.trackId);
      const sourceKind = inferSessionTrackKind(track);
      const trackId = explicitTrackId && explicitTrackId !== "null" ? normalizeTrackIdFallback(explicitTrackId, index + 1, sourceKind) : makeTrackIndexBase(track, index);
      const duration = trackDurationSeconds(track, fallbackBaseSeconds);
      const rawStartMs = track.recordedStartAt ? Date.parse(track.recordedStartAt) : Number.NaN;
      const rawSessionStartMs = Number(track.recordedSessionStartMs);
      const rawSessionEndMs = Number(track.recordedSessionEndMs);
      return {
        index,
        track,
        source,
        sourceKind,
        trackId,
        duration,
        sessionStartSeconds: Number.isFinite(rawSessionStartMs) ? Math.max(0, rawSessionStartMs / 1000) : null,
        sessionEndSeconds: Number.isFinite(rawSessionEndMs) ? Math.max(0, rawSessionEndMs / 1000) : null,
        startSortMs: Number.isFinite(rawStartMs) ? rawStartMs : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((entry): entry is { index: number; track: RecordingSessionTrack; source: string; sourceKind: SessionTrackKind; trackId: string; duration: number; sessionStartSeconds: number | null; sessionEndSeconds: number | null; startSortMs: number; } =>
      entry !== null && (entry.sourceKind === "audio" || entry.sourceKind === "video") && entry.duration > 0)
    .sort((a, b) => {
      if (a.startSortMs !== b.startSortMs) return a.startSortMs - b.startSortMs;
      return a.index - b.index;
    })
    .map((track, index) => {
      const source = sanitizeTrackSource(track.source);
      const duration = track.duration;
      const startIn = roundSeconds(track.sessionStartSeconds ?? endToEndCursor);
      const endIn = track.sessionEndSeconds !== null && track.sessionEndSeconds >= startIn
        ? track.sessionEndSeconds
        : startIn + duration;
      endToEndCursor = Math.max(endToEndCursor, roundSeconds(endIn));
      const sourceKind = track.sourceKind;
      const trackId = track.trackId;
      const trackRecord = track.track;
      const sanitizedSource = source.trim();

      return {
        id: `track-${trackRecord.id}-${index}`,
        assetId: sanitizedSource,
        kind: sourceKind,
        trackId,
        name: trackRecord.name || `Track ${trackId}`,
        color: sourceKind === "audio" ? "#047857" : "#2563eb",
        startIn,
        sourceStart: 0,
        sourceEnd: roundSeconds(duration),
        duration,
      } as TimelineClip;
    });

  return tracksBySource;
}

function extractTimelineFromPayload(payload: unknown): TimelineState | null {
  const record = normalizeEpisodePayload(payload);
  if (!record) return null;
  const recordedProjectSlug = coerceOptionalString(record.projectSlug);
  const recordedEpisodeSlug = coerceOptionalString(record.episodeSlug);
  const isLegacyRecordedContract = recordedProjectSlug === undefined && recordedEpisodeSlug === undefined
    && typeof record.savedAt !== "string"
    && typeof record.source === "undefined"
    && typeof record.timelineClips === "undefined";

  const artifactClips = coerceArray(record.timelineClips);
  const legacyClips = coerceArray(record.clips);
  const nestedTimeline = asObject((record as Record<string, unknown>).timeline);
  const nestedTimelineClips = coerceArray(nestedTimeline?.timelineClips);
  const rawClips = artifactClips.length ? artifactClips : nestedTimelineClips.length ? nestedTimelineClips : legacyClips;
  const hasTimelinePayloadShape = "timelineClips" in record || Boolean(nestedTimeline && "timelineClips" in nestedTimeline) || legacyClips.some((clip) => {
    const recordClip = asObject(clip);
    return !!(recordClip && ("assetId" in recordClip || "duration" in recordClip || "sourceStart" in recordClip));
  });

  if (hasTimelinePayloadShape) {
    const clips = rawClips.map(normalizeTimelineClip).filter((clip): clip is TimelineClip => Boolean(clip));
    const nestedTranscript = asObject((record as Record<string, unknown>).timeline)?.transcript;
    const nestedPaperEditSnapshots = asObject((record as Record<string, unknown>).timeline)?.paperEditSnapshots;
    const nestedDeactivatedRanges = asObject((record as Record<string, unknown>).timeline)?.deactivatedRanges;
    const nestedSpeakerCameraMappings = asObject((record as Record<string, unknown>).timeline)?.speakerCameraMappings;
    const nestedCameraSwitchDecisions = asObject((record as Record<string, unknown>).timeline)?.cameraSwitchDecisions;
    const nestedData = asObject((record as Record<string, unknown>).data);
    const transcriptSource = Array.isArray(record.transcript)
      ? record.transcript
      : Array.isArray(nestedTranscript)
        ? nestedTranscript
        : Array.isArray(record.blocks)
          ? record.blocks
          : [];
    const transcript = transcriptSource.map(normalizeTranscriptBlock).filter((block): block is TranscriptBlock => Boolean(block));
    const deactivatedRanges = coerceArray(record.deactivatedRanges ?? nestedDeactivatedRanges ?? nestedData?.deactivatedRanges)
      .map((range) => sanitizeTimelineRangeEdit(range as TimelineRangeEdit))
      .filter((range): range is TimelineRangeEdit => Boolean(range));

    return {
      clips,
      transcript,
      deactivatedRanges,
      paperEditSnapshots: normalizePaperEditSnapshots(record.paperEditSnapshots ?? nestedPaperEditSnapshots ?? nestedData?.paperEditSnapshots),
      speakerCameraMappings: coerceArray(record.speakerCameraMappings ?? nestedSpeakerCameraMappings ?? nestedData?.speakerCameraMappings) as SpeakerCameraMapping[],
      cameraSwitchDecisions: coerceArray(record.cameraSwitchDecisions ?? nestedCameraSwitchDecisions ?? nestedData?.cameraSwitchDecisions) as CameraSwitchDecision[],
    };
  }

  const recordingVersion = coerceOptionalString(record.version).toLocaleLowerCase();
  const isRecordingSessionPayload = recordingVersion.startsWith("quipsly-recording-room.") || isLegacyRecordedContract
    || ("clips" in record && "events" in record && "roomName" in record && "durationMs" in record)
    || ("clips" in record && "tracks" in record && (record as Record<string, unknown>).projectSlug !== undefined);

  if (isRecordingSessionPayload) {
    const recordingSession = normalizeRecordingSessionPackage(record);
    if (recordingSession) {
      return sessionPackageToTimeline(recordingSession);
    }
  }

  const nestedTranscript = asObject((record as Record<string, unknown>).timeline)?.transcript;
  const transcriptSource = Array.isArray(record.transcript)
    ? record.transcript
    : Array.isArray(nestedTranscript)
      ? nestedTranscript
      : Array.isArray(record.blocks)
        ? record.blocks
        : [];
  const transcript = transcriptSource.map(normalizeTranscriptBlock).filter((block): block is TranscriptBlock => Boolean(block));
  if (!transcript.length) return null;

  return {
    clips: [],
    transcript,
    paperEditSnapshots: normalizePaperEditSnapshots(record.paperEditSnapshots),
  };
}

function parseTimeToSeconds(value: string, fallback = 0) {
  return normalizeSegmentTime(value, fallback);
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatSyncClock(seconds: number) {
  const totalMilliseconds = Math.max(
    0,
    Math.round((Number.isFinite(seconds) ? seconds : 0) * 1_000),
  );
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const remainingMilliseconds = totalMilliseconds % 60_000;
  const remainingSeconds = Math.floor(remainingMilliseconds / 1_000);
  const milliseconds = remainingMilliseconds % 1_000;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isYouTubeAsset(value: string) {
  return /youtube\.com|youtu\.be/i.test(value);
}

function isMissingProductionSource(clip: TimelineClip) {
  const assetId = sanitizeTrackSource(clip.assetId);
  return !assetId
    || assetId === "unknown-asset"
    || assetId.startsWith("missing-")
    || assetId === "recording-clip-event";
}

function describeClipSource(clip: TimelineClip) {
  const assetId = sanitizeTrackSource(clip.assetId);
  if (!assetId) return "Missing source";
  if (assetId.startsWith("/api/ingest/media/")) return "Vault media";
  if (assetId.startsWith("http://") || assetId.startsWith("https://")) {
    return isYouTubeAsset(assetId) ? "YouTube preview" : "Remote media";
  }
  if (assetId.startsWith("gcs://")) return "GCS media";
  if (assetId.startsWith("missing-") || assetId === "recording-clip-event") return "Placeholder";
  return "Timeline asset";
}

function isRenderableVideoSource(source: string) {
  if (!source || isYouTubeAsset(source)) return false;
  return source.startsWith("http://")
    || source.startsWith("https://")
    || source.startsWith("/api/ingest/media/");
}

function isVisualTimelineClip(clip: TimelineClip) {
  return clip.kind === "video" || isVideoTrackId(clip.trackId);
}

function clipContainsTime(clip: TimelineClip, time: number) {
  return time >= clip.startIn && time < clip.startIn + Math.max(clip.duration, 0.05);
}

function clipSourceTimeAt(clip: TimelineClip, timelineTime: number) {
  const offset = Math.max(0, timelineTime - clip.startIn);
  const sourceOut = clip.sourceEnd ?? clip.sourceStart + clip.duration;
  return Math.max(0, Math.min(sourceOut, clip.sourceStart + offset));
}

function sourceLabelForClip(clip: TimelineClip, assets: ImportedMediaAsset[]) {
  const asset = selectedClipLinkedAsset(clip, assets);
  return asset?.originalName || clip.name || "Video feed";
}

function hasVerifiedCollaborationProxy(asset: ImportedMediaAsset) {
  return asset.proxy?.status === "ready"
    && Boolean(asset.proxy.proxyAssetId)
    && Boolean(asset.proxy.sourceId)
    && Boolean(asset.proxy.variantId)
    && Boolean(asset.proxy.proxyUrl)
    && asset.proxy.proxyUrl !== asset.playbackUrl
    && asset.proxy.sourceOriginalPreserved === true
    && Boolean(asset.proxy.immutableObjectEvidence);
}

function sourceUrlForClip(clip: TimelineClip, assets: ImportedMediaAsset[]) {
  const asset = selectedClipLinkedAsset(clip, assets);
  const collaborationPreview = asset && hasVerifiedCollaborationProxy(asset)
    ? asset.proxy?.proxyUrl || ""
    : "";
  return sanitizeTrackSource(collaborationPreview || asset?.playbackUrl || asset?.gcsUri || clip.assetId);
}

function videoTrackOrderValue(trackId: string) {
  const match = /^V(\d+)(?:\.(\d+))?$/i.exec(trackId);
  if (!match) return 0;
  return Number(match[1]) + (match[2] ? Number(`0.${match[2]}`) : 0);
}

function programClipAtTime(timeline: TimelineState, time: number) {
  const assembledCamera = cameraClipAtTime(timeline, time);
  if (assembledCamera) return assembledCamera;
  return timeline.clips
    .filter((clip) => isVisualTimelineClip(clip) && !clip.deactivated && clipContainsTime(clip, time))
    .sort((a, b) => {
      const trackDelta = videoTrackOrderValue(b.trackId) - videoTrackOrderValue(a.trackId);
      if (trackDelta) return trackDelta;
      return b.startIn - a.startIn;
    })[0] ?? null;
}

function SpeakerCameraCutDesk({
  timeline,
  holds,
  message,
  evidenceReady,
  busy,
  onMapSpeaker,
  onAnalyzeEvidence,
  onAssemble,
  onProofWatchDecision,
  onRemoveDecision,
  proofWatchedDecisionIds,
}: {
  timeline: TimelineState;
  holds: CameraCutAssemblyHold[];
  message: string;
  evidenceReady: boolean;
  busy: boolean;
  onMapSpeaker: (speakerKey: string, speakerLabel: string, clipId: string) => void;
  onAnalyzeEvidence: () => void;
  onAssemble: () => void;
  onProofWatchDecision: (decision: CameraSwitchDecision) => void;
  onRemoveDecision: (decision: CameraSwitchDecision) => void;
  proofWatchedDecisionIds: Set<string>;
}) {
  const speakers = Array.from(
    timeline.transcript.reduce((map, block) => {
      const speakerKey = canonicalSpeakerKey(block.speaker);
      if (!speakerKey) return map;
      const current = map.get(speakerKey);
      map.set(speakerKey, {
        speakerKey,
        speakerLabel: block.speaker?.trim() || speakerKey,
        blockCount: (current?.blockCount ?? 0) + 1,
      });
      return map;
    }, new Map<string, { speakerKey: string; speakerLabel: string; blockCount: number }>()),
  ).map(([, value]) => value).sort((left, right) => left.speakerLabel.localeCompare(right.speakerLabel));
  const videoClips = timeline.clips
    .filter((clip) => isVisualTimelineClip(clip) && !clip.deactivated)
    .sort((left, right) => trackSortValue(left.trackId) - trackSortValue(right.trackId));
  const mappings = timeline.speakerCameraMappings ?? [];
  const decisions = [...(timeline.cameraSwitchDecisions ?? [])]
    .sort((left, right) => left.startSeconds - right.startSeconds);

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-100 px-5 py-4">
        <div className="max-w-3xl">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700">Automated speaker cut</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">Tell Quipsly which camera belongs to each voice</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Quipsly uses canonical transcript timing to assemble a reversible camera draft. Short interjections, overlaps, unmapped voices, and uncovered source ranges hold the existing shot instead of creating a guess or flash cut.
          </p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-right">
          <div className="text-2xl font-black text-violet-950">{decisions.length}</div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">draft camera ranges</div>
        </div>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Camera map</div>
          <div className="mt-3 space-y-3">
            {speakers.length ? speakers.map((speaker) => {
              const mapping = mappings.find((candidate) => candidate.speakerKey === speaker.speakerKey);
              return (
                <label key={speaker.speakerKey} className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-900">{speaker.speakerLabel}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">{speaker.blockCount} transcript blocks</span>
                  </span>
                  <select
                    aria-label={`Camera for ${speaker.speakerLabel}`}
                    value={mapping?.targetClipId ?? ""}
                    onChange={(event) => onMapSpeaker(speaker.speakerKey, speaker.speakerLabel, event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-violet-400"
                  >
                    <option value="">No camera mapped</option>
                    {videoClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.trackId} · {clip.name}</option>)}
                  </select>
                </label>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm font-bold leading-6 text-slate-500">
                Speaker labels are not available yet. Correct or evaluate the transcript first; Quipsly will not infer a person from an unlabeled voice.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Assembly ledger</div>
            <div className="flex flex-wrap gap-2">
              {!evidenceReady && (
                <button type="button" onClick={onAnalyzeEvidence} disabled={busy || !speakers.length || !mappings.length} className="rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-800 disabled:cursor-not-allowed disabled:opacity-45">
                  {busy ? "Analyzing…" : "Bind current evidence"}
                </button>
              )}
              <button type="button" onClick={onAssemble} disabled={busy || !evidenceReady || !mappings.length || !videoClips.length} className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-violet-600 disabled:cursor-not-allowed disabled:bg-slate-300">
                Assemble speaker cut
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold leading-5 text-slate-600">
            <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${evidenceReady ? "bg-emerald-500" : "bg-amber-500"}`} />
            {evidenceReady
              ? "The current transcript and timeline match a durable edit-evidence set. Assembly can write a receipt-backed local draft."
              : "Map cameras, then bind the current transcript and timeline. A mapping change intentionally makes older analysis stale."}
          </div>
          {message && <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold leading-5 text-violet-950">{message}</div>}
          {holds.length > 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">{holds.length} deliberate shot holds</div>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs font-semibold text-amber-950">
                {holds.map((hold, index) => <div key={`${hold.reason}-${hold.startSeconds}-${index}`}>{formatClock(hold.startSeconds)}–{formatClock(hold.endSeconds)} · {hold.speakerLabel} · {hold.reason.replaceAll("-", " ")}</div>)}
              </div>
            </div>
          )}
          <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
            {decisions.length ? decisions.map((decision) => {
              const clip = videoClips.find((candidate) => candidate.id === decision.targetClipId);
              const proofWatched = proofWatchedDecisionIds.has(decision.id);
              return (
                <div key={decision.id} className={`rounded-2xl border bg-white p-3 ${proofWatched ? "border-emerald-300" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-900"><span>{formatClock(decision.startSeconds)}–{formatClock(decision.startSeconds + decision.durationSeconds)} · {decision.speakerLabel}</span>{proofWatched ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">Proof watched</span> : null}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{clip?.trackId ?? "missing source"} · {clip?.name ?? decision.targetClipId} · {decision.status} · {decision.evidence.transcriptBlockIds.length} evidence blocks</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <button type="button" onClick={() => onProofWatchDecision(decision)} className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-800 hover:bg-sky-100">{proofWatched ? "Watch again" : "Proof-watch cut"}</button>
                      <button type="button" onClick={() => onRemoveDecision(decision)} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-50">Restore prior angle</button>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">Plays the assembled edit with 1.5 seconds of context and records a review receipt. It does not approve, save, render, or publish.</p>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm font-bold leading-6 text-slate-500">No assembled camera draft yet. Existing track priority remains the edit-monitor fallback.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function isTimelineGapDeactivated(timeline: TimelineState, time: number) {
  return deactivatedTimelineIntervals(timeline).some((range) => (
    time >= range.startSeconds && time < range.endSeconds
  ));
}

function nextPlaybackTimeForMode(time: number, step: number, totalDuration: number, timeline: TimelineState) {
  const requested = Math.min(totalDuration, time + step);
  if (timeline.editorMode === "play-all") return requested;

  const sortedDeactivated = deactivatedTimelineIntervals(timeline);

  for (const block of sortedDeactivated) {
    const blockStart = block.startSeconds;
    const blockEnd = block.endSeconds;
    if (requested >= blockStart && requested < blockEnd) {
      return Math.min(totalDuration, blockEnd);
    }
    if (time < blockStart && requested >= blockStart) {
      return Math.min(totalDuration, blockEnd);
    }
  }

  return requested;
}

function SyncedVideoMonitor({
  source,
  sourceTime,
  isActive,
  isPlaying,
  label,
  className = "",
}: {
  source: string;
  sourceTime: number;
  isActive: boolean;
  isPlaying: boolean;
  label: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isRenderableVideoSource(source)) return;

    const safeTime = Math.max(0, sourceTime);
    if (Number.isFinite(safeTime) && Math.abs(video.currentTime - safeTime) > 0.35) {
      try {
        video.currentTime = safeTime;
      } catch {
        // Some remote sources do not allow immediate seeks until metadata is ready.
      }
    }

    if (isPlaying && isActive) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [isActive, isPlaying, source, sourceTime]);

  if (!isRenderableVideoSource(source)) {
    return (
      <div className={`flex h-full min-h-[150px] items-center justify-center rounded-xl border border-white/10 bg-[#111827] p-4 text-center text-xs font-bold leading-5 text-white/70 ${className}`}>
        <div>
          <div className="text-white">{label}</div>
          <div className="mt-2 text-white/55">
            {source && isYouTubeAsset(source)
              ? "YouTube preview is timestamp-driven here; use the source clip loop or import a renderable copy for frame-accurate playback."
              : "No renderable video source attached yet."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={source}
      muted
      playsInline
      preload="metadata"
      className={`h-full min-h-[150px] w-full rounded-xl bg-black object-contain ${className}`}
      controls={!isPlaying}
    />
  );
}

function EpisodeMonitorDeck({
  timelineState,
  importedMediaAssets,
  currentTime,
  totalDuration,
  isPlaying,
  selectedClipId,
  onSelectClip,
  onSeek,
  onStartPlayback,
  onPause,
}: {
  timelineState: TimelineState;
  importedMediaAssets: ImportedMediaAsset[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onSeek: (time: number) => void;
  onStartPlayback: (mode: "play-all" | "play-edit") => void;
  onPause: () => void;
}) {
  const videoClips = timelineState.clips
    .filter(isVisualTimelineClip)
    .sort((a, b) => trackSortValue(a.trackId) - trackSortValue(b.trackId) || a.startIn - b.startIn);
  const programClip = programClipAtTime(timelineState, currentTime);
  const activeCameraDecision = timelineState.cameraSwitchDecisions
    ?.find((decision) => currentTime >= decision.startSeconds && currentTime < decision.startSeconds + decision.durationSeconds) ?? null;
  const programSource = programClip ? sourceUrlForClip(programClip, importedMediaAssets) : "";
  const programSourceTime = programClip ? clipSourceTimeAt(programClip, currentTime) : 0;
  const mode = timelineState.editorMode === "play-all" ? "play-all" : "play-edit";
  const currentGapIsDeactivated = isTimelineGapDeactivated(timelineState, currentTime);

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-[#d8b777] bg-[#17120d] shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#241a10] px-4 py-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Multicam source + edit monitors</div>
          <div className="mt-1 text-sm font-bold text-amber-50">
            Review every feed, then adjust the edit by moving clip boundaries instead of destructively cutting source.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onStartPlayback("play-all")}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors ${
              mode === "play-all" && isPlaying ? "bg-amber-500 text-[#241a10]" : "border border-amber-400/40 bg-white/5 text-amber-100 hover:bg-white/10"
            }`}
          >
            Play all source time
          </button>
          <button
            type="button"
            onClick={() => onStartPlayback("play-edit")}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors ${
              mode === "play-edit" && isPlaying ? "bg-emerald-400 text-[#0e2418]" : "border border-emerald-300/40 bg-white/5 text-emerald-100 hover:bg-white/10"
            }`}
          >
            Play active edit
          </button>
          <button
            type="button"
            onClick={onPause}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/80 hover:bg-white/10"
          >
            Pause
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 2xl:grid-cols-[1.05fr_1.4fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Source feeds</div>
              <div className="mt-1 text-xs font-bold text-white/65">
                Every video feed at the shared playhead. Speed is currently normal 1x unless a future speed-ramp says otherwise.
              </div>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] font-black text-white/65">
              {videoClips.length} feeds
            </span>
          </div>
          <div className="mt-3 grid max-h-[470px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 2xl:grid-cols-1">
            {videoClips.length ? videoClips.map((clip) => {
              const source = sourceUrlForClip(clip, importedMediaAssets);
              const active = clipContainsTime(clip, currentTime);
              const sourceTime = clipSourceTimeAt(clip, currentTime);
              const label = sourceLabelForClip(clip, importedMediaAssets);
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => {
                    onSelectClip(clip.id);
                    if (!active) onSeek(clip.startIn);
                  }}
                  className={`group rounded-2xl border p-2 text-left transition-all ${
                    selectedClipId === clip.id
                      ? "border-amber-300 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.35)]"
                      : active
                        ? "border-emerald-300/60 bg-emerald-300/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="aspect-video overflow-hidden rounded-xl bg-black">
                    <SyncedVideoMonitor
                      source={source}
                      sourceTime={sourceTime}
                      isActive={active}
                      isPlaying={isPlaying}
                      label={label}
                    />
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black text-white">{label}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                        {clip.trackId} / source {formatClock(sourceTime)} / speed 1x
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
                      active ? "bg-emerald-300 text-emerald-950" : "bg-white/10 text-white/60"
                    }`}>
                      {active ? "at playhead" : "cue"}
                    </span>
                  </div>
                </button>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm font-bold leading-6 text-white/55">
                No video feeds yet. Import camera video or add a source clip to the timeline.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Edit monitor</div>
              <div className="mt-1 text-xs font-bold text-white/65">
                {mode === "play-edit"
                  ? "Playing the active cut and skipping deactivated transcript gaps."
                  : "Playing continuous source time, including material marked inactive."}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
              <span className={`rounded-full px-2 py-1 ${mode === "play-edit" ? "bg-emerald-300 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>
                {mode === "play-edit" ? "Active edit" : "All source"}
              </span>
              {currentGapIsDeactivated && (
                <span className="rounded-full bg-purple-300 px-2 py-1 text-purple-950">inactive gap</span>
              )}
            </div>
          </div>
          <div className="mt-3 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            {programClip ? (
              <SyncedVideoMonitor
                source={programSource}
                sourceTime={programSourceTime}
                isActive
                isPlaying={isPlaying}
                label={sourceLabelForClip(programClip, importedMediaAssets)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <div className="text-lg font-black text-white">No active visual at {formatClock(currentTime)}</div>
                  <div className="mt-2 text-sm font-bold leading-6 text-white/55">
                    This is either a real gap, an audio-only section, or a deactivated stretch waiting to be skipped in Play Edit.
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <input
              type="range"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.05}
              value={Math.min(currentTime, totalDuration)}
              onChange={(event) => {
                onPause();
                onSeek(Number(event.target.value));
              }}
              className="w-full accent-emerald-300"
            />
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm font-black text-white">
              {formatClock(currentTime)} / {formatClock(totalDuration)}
            </div>
          </div>
          {programClip && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs font-bold leading-5 text-white/65">
              Showing <span className="text-white">{programClip.name}</span> from <span className="font-mono text-emerald-200">{programClip.trackId}</span>.
              {activeCameraDecision
                ? <> The speaker-cut draft selected this angle for <span className="text-violet-200">{activeCameraDecision.speakerLabel}</span>; the decision is reversible timeline metadata.</>
                : <> Select a source feed or adjust the selected clip boundaries below to change what the edit shows.</>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function inferHealthKindFromClip(clip: TimelineClip): MediaSourceHealthKind {
  if (clip.kind === "audio" || isAudioTrackId(clip.trackId)) return "audio";
  if (clip.kind === "video" || isVideoTrackId(clip.trackId)) return "video";
  return inferTrackKindFromSourceUrl(clip.assetId, "video");
}

function healthKindFromImportedAsset(asset: ImportedMediaAsset): MediaSourceHealthKind {
  if (asset.kind === "audio" || asset.contentType.startsWith("audio/")) return "audio";
  if (asset.kind === "video" || asset.contentType.startsWith("video/")) return "video";
  return "unknown";
}

function healthStatusStyles(status: MediaSourceHealthStatus) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "error") return "border-red-200 bg-red-50 text-red-800";
  if (status === "checking") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function healthStatusLabel(status: MediaSourceHealthStatus) {
  if (status === "ok") return "Healthy";
  if (status === "warning") return "Needs attention";
  if (status === "error") return "Broken";
  if (status === "checking") return "Checking";
  return "Unchecked";
}

function healthSafetyTitle(health: MediaSourceHealth | null | undefined, missing = false) {
  if (missing) return "Source unavailable";
  if (!health) return "Checking safety";
  if (health.status === "checking") return "Checking safety";
  if (health.status === "error") return "Source unavailable";
  if (health.renderUsable) return "Safe for export";
  if (health.previewUsable) return "Safe to edit";
  if (health.reachable) return "Needs review";
  return "Unknown safety";
}

function healthNextAction(health: MediaSourceHealth | null | undefined, missing = false) {
  if (missing) return "The file is unreachable or missing. Your timeline is safe, but this clip won't play until replaced.";
  if (!health || health.status === "checking") return "Keep working. Quipsly is checking this source in the background.";
  if (health.renderUsable) return "You can edit and export with this source.";
  if (health.previewUsable) return "You can keep editing. Before final export, replace this with a renderable file.";
  if (health.reachable) return "The file responds, but Quipsly cannot use it confidently yet. Your timeline is safe, but replace it before exporting.";
  return "Relink or replace this file. Your edits are safe, but it needs attention before export.";
}

function assetSyncTargetSummary(asset: ImportedMediaAsset, selectedClip: TimelineClip | null, spine: EpisodeSpineAudio | null) {
  if (spine?.assetId === asset.id || spine?.assetId === asset.sourceId) return "Synced to: episode spine audio";
  if (asset.sync?.targetClipId) return `Synced to clip: ${asset.sync.targetClipId.slice(0, 8)}`;
  if (typeof asset.sync?.anchorTimelineSeconds === "number") return `Lined up at: ${formatClock(asset.sync.anchorTimelineSeconds)}`;
  if (selectedClip) return `Selected clip ready: ${selectedClip.name}`;
  return "Not attached to a timeline clip yet";
}

function assetNextAction(asset: ImportedMediaAsset, health: MediaSourceHealth | null, spine: EpisodeSpineAudio | null) {
  if (asset.sync?.status === "held") return "Parked for later. It will not demand attention until you unpark it.";
  if ((asset.kind === "audio" || asset.contentType.startsWith("audio/")) && !spine?.assetId && !spine?.clipId) {
    return "If this is the main recording, make it the spine audio first.";
  }
  if (health?.status === "error") return "Relink/replace it or park it so the edit stays calm.";
  if (!asset.sync?.targetClipId && typeof asset.sync?.anchorTimelineSeconds !== "number") return "Add it to the timeline, attach it to the selected clip, or line it up at the playhead.";
  if (asset.sync?.status === "synced") return "This file is marked lined up. Keep editing or save the timeline.";
  return "If it looks right at the current playhead, mark it lined up.";
}

function mediaHealthFallback(item: MediaHealthProbeItem, status: MediaSourceHealthStatus, note: string): MediaSourceHealth {
  return {
    id: item.id,
    label: item.label,
    sourceUrl: item.sourceUrl,
    status,
    reachable: false,
    playable: false,
    previewUsable: false,
    renderUsable: false,
    kind: item.expectedKind,
    expectedKind: item.expectedKind,
    detectedKind: "unknown",
    contentType: item.contentType ?? "application/octet-stream",
    size: item.size ?? 0,
    note,
  };
}

function mediaHealthSummary(results: MediaSourceHealth[]) {
  const checked = results.filter((item) => item.status !== "unchecked" && item.status !== "checking");
  const checking = results.filter((item) => item.status === "checking").length;
  const healthy = checked.filter((item) => item.status === "ok").length;
  const warnings = checked.filter((item) => item.status === "warning").length;
  const broken = checked.filter((item) => item.status === "error").length;
  const previewUsable = checked.filter((item) => item.previewUsable).length;
  const renderUsable = checked.filter((item) => item.renderUsable).length;

  return {
    total: results.length,
    checked: checked.length,
    checking,
    healthy,
    warnings,
    broken,
    previewUsable,
    renderUsable,
  };
}

function selectedClipLinkedAsset(clip: TimelineClip | null, assets: ImportedMediaAsset[]) {
  if (!clip?.assetId) return null;
  const source = sanitizeTrackSource(clip.assetId);
  return assets.find((asset) =>
    asset.id === source
    || asset.sourceId === source
    || asset.playbackUrl === source
    || asset.gcsUri === source
  ) ?? null;
}

function editorReadinessTone(readinessLevel: string) {
  if (readinessLevel === "render") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (readinessLevel === "preview") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function editorReadinessButtonTone(kind: "primary" | "safe" | "warning" | "neutral") {
  if (kind === "primary") return "border-[#3d3122] bg-[#3d3122] text-white hover:bg-[#59442d]";
  if (kind === "safe") return "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
  if (kind === "warning") return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
  return "border-[#e8dcc4] bg-white text-[#5d4528] hover:bg-[#fffaf0]";
}

function eventDuration(event: RecordingSessionEvent) {
  const match = (event.label ?? "").match(/(\d+(?::\d+){0,2}(?:\.\d+)?)\s*-\s*(\d+(?::\d+){0,2}(?:\.\d+)?|open)/i);
  if (!match || match[2] === "open") return 8;
  const start = parseTimeToSeconds(match[1]);
  const end = parseTimeToSeconds(match[2], start + 8);
  return end > start ? end - start : 8;
}

function buildTrackAllocator(existingTrackIds: string[]) {
  const used = new Set(existingTrackIds.map((id) => coerceString(id, "").trim().toUpperCase()));
  const highestIndexByKind = {
    audio: 0,
    video: 0,
  };

  used.forEach((trackId) => {
    const match = /^([VA])(\d+)(?:\.\d+)?$/.exec(trackId);
    if (!match) return;
    const kind = match[1] === TRACK_PREFIX_VIDEO ? "video" : "audio";
    const index = Number.parseInt(match[2], 10);
    if (Number.isFinite(index)) {
      highestIndexByKind[kind] = Math.max(highestIndexByKind[kind], index);
    }
  });

  const next = (kind: SessionTrackKind) => {
    const prefix = kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO;
    let index = highestIndexByKind[kind] + 1;
    while (used.has(`${prefix}${index}`)) {
      index += 1;
    }
    const trackId = `${prefix}${index}`;
    used.add(trackId);
    highestIndexByKind[kind] = index;
    return trackId;
  };

  return { next };
}

function sanitizeSegmentSource(raw: unknown, fallback = "") {
  return sanitizeLegacyAssetId(raw, fallback);
}

function legacyClipPlaybackRange(event: RecordingSessionEvent, clip: NonNullable<RecordingSessionPackage["clips"]>[number]) {
  const title = coerceOptionalString(clip.title, "clip");
  const label = coerceOptionalString(event.label);
  if (!label.toLocaleLowerCase().startsWith(`played ${title} `.toLocaleLowerCase())) return null;
  const rangeMatch = label.match(/(\d+(?::\d+){0,2}(?:\.\d+)?)\s*-\s*(\d+(?::\d+){0,2}(?:\.\d+)?|open)\s*$/i);
  if (!rangeMatch) return null;
  const sourceStart = parseTimeToSeconds(rangeMatch[1]);
  const sourceEnd = rangeMatch[2].toLocaleLowerCase() === "open"
    ? sourceStart + RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS
    : parseTimeToSeconds(rangeMatch[2], sourceStart + RECORDER_SEGMENT_DEFAULT_DURATION_SECONDS);
  if (sourceEnd <= sourceStart) return null;
  const segment = clip.segments?.find((candidate) => {
    const range = sanitizeSegmentRange(candidate);
    return Math.abs(range.sourceStart - sourceStart) < 0.01 && Math.abs(range.sourceEnd - sourceEnd) < 0.01;
  });
  return {
    clipId: coerceOptionalString(clip.id, "legacy-clip"),
    segmentId: coerceOptionalString(segment?.id, "legacy-segment"),
    sourceUrl: sanitizeSegmentSource(clip.url, ""),
    sourceStartSeconds: sourceStart,
    sourceEndSeconds: sourceEnd,
  };
}

function buildSegmentTrackClips(session: RecordingSessionPackage, trackAllocator: { next: (kind: SessionTrackKind) => string }) {
  const usedTrackIds = new Map<string, string>();
  const cueDefinitions = [...(session.clips ?? [])];
  const playbackEvents = [...(session.events ?? [])]
    .filter((event) => event.kind === "clip")
    .sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));

  return playbackEvents.flatMap((event, eventIndex) => {
    const structured = event.clipPlayback;
    const legacy = structured?.sourceUrl
      ? null
      : cueDefinitions.map((clip) => legacyClipPlaybackRange(event, clip)).find(Boolean) ?? null;
    const playback = structured?.sourceUrl ? structured : legacy;
    const sourceUrl = sanitizeSegmentSource(playback?.sourceUrl, "");
    const sourceStart = Math.max(0, coerceNumber(playback?.sourceStartSeconds, 0));
    const sourceEnd = Math.max(sourceStart, coerceNumber(playback?.sourceEndSeconds, sourceStart));
    if (!playback || !sourceUrl || sourceEnd <= sourceStart) return [];
    const segmentKind = inferTrackKindFromSourceUrl(sourceUrl, "video");
    const cacheKey = `${segmentKind}::${sourceUrl}`;

    const trackId = usedTrackIds.get(cacheKey)
      || trackAllocator.next(segmentKind);
    usedTrackIds.set(cacheKey, trackId);
    const timelineStart = Math.max(0, coerceNumber(event.atMs, 0) / 1000);
    const duration = Math.max(RECORDER_SEGMENT_MIN_DURATION_SECONDS, sourceEnd - sourceStart);
    const cue = cueDefinitions.find((clip) => clip.id === playback.clipId);
    const segment = cue?.segments?.find((candidate) => candidate.id === playback.segmentId);

    return [{
      id: `clip-playback-${coerceOptionalString(event.id, String(eventIndex))}`,
      assetId: sourceUrl,
      trackId,
      startIn: roundSeconds(timelineStart),
      sourceStart: roundSeconds(sourceStart),
      sourceEnd: roundSeconds(sourceEnd),
      kind: segmentKind,
      name: `${cue?.title || event.label || "Watched clip"}${segment?.note ? ` — ${segment.note}` : ""} (${formatClock(sourceStart)}-${formatClock(sourceEnd)})`,
      color: segmentKind === "video" ? "#7c3aed" : "#a855f7",
      duration: roundSeconds(duration),
    } satisfies TimelineClip];
  });
}

function sessionPackageToTimeline(session: RecordingSessionPackage): TimelineState {
  const events = [...(session.events ?? [])].sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
  const sessionTrackClips = buildSessionTrackClips(session);
  const sessionTrackTimelineEnd = sessionTrackClips.reduce((cursor, clip) => Math.max(cursor, clip.startIn + clip.duration), 0);
  const duration = Math.max(
    30,
    sessionTrackTimelineEnd,
    (session.durationMs ?? 0) / 1000,
    ...events.map((event) => ((event.atMs ?? 0) / 1000) + 10),
  );
  const usedTrackIds = sessionTrackClips.map((clip) => coerceString(clip.trackId, ""));
  const trackAllocator = buildTrackAllocator(usedTrackIds);
  const segmentClips = buildSegmentTrackClips(session, trackAllocator);

  const clips: TimelineClip[] = [...sessionTrackClips, ...segmentClips];

  const markerEvents = events.filter((event) => event.kind !== "session");
  const transcript: TranscriptBlock[] = markerEvents.length
    ? markerEvents.map((event, index) => ({
        id: `event-${event.id ?? index}`,
        time: (event.atMs ?? 0) / 1000,
        duration: event.kind === "clip" ? eventDuration(event) : 4,
        text: `[${event.kind ?? "marker"}] ${event.label ?? "Untitled event"}${event.note ? ` - ${event.note}` : ""}`,
        deleted: false,
        alert: event.kind === "retake" ? "Retake" : event.kind === "clip" ? "Clip Cue" : null,
      }))
    : session.script?.trim()
      ? [{
          id: "session-script",
          time: 0,
          duration,
          text: session.script.slice(0, 260),
          deleted: false,
          alert: null,
        }]
      : [];

  return {
    clips: clips.sort((a, b) => a.startIn - b.startIn),
    transcript,
  };
}

async function postEpisodeProduction(payload: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<EpisodeProductionState> {
  const response = await fetch("/api/episode-production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok && data?.mode !== "conflict") {
    throw new Error(data?.message || data?.error || `Episode production returned ${response.status}`);
  }
  return data as EpisodeProductionState;
}

async function fetchEpisodeCollaborationState(
  projectSlug: string,
  episodeSlug: string,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeCollaborationState | null> {
  const params = new URLSearchParams({ projectSlug, episodeSlug });
  const response = await fetch(`/api/episode-production/collaboration?${params.toString()}`, {
    method: "GET",
    signal: options.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) return null;
  return data as EpisodeCollaborationState;
}

async function sendEpisodeCollaborationHeartbeat(
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeCollaborationState | null> {
  const response = await fetch("/api/episode-production/collaboration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) return null;
  return data as EpisodeCollaborationState;
}

function transcriptWordTimings(block: TranscriptBlock) {
  const tokens = block.text.match(/\S+|\s+/g) ?? [block.text];
  const wordCount = Math.max(1, tokens.filter((token) => token.trim()).length);
  const secondsPerWord = block.duration / wordCount;
  let spokenWordIndex = 0;

  return tokens.map((token, index) => {
    const isSpace = !token.trim();
    if (isSpace) {
      return {
        id: `${block.id}-space-${index}`,
        text: token,
        start: block.time,
        end: block.time,
      };
    }

    const start = block.time + spokenWordIndex * secondsPerWord;
    const end = start + secondsPerWord;
    spokenWordIndex += 1;

    return {
      id: `${block.id}-word-${index}`,
      text: token,
      start,
      end,
    };
  });
}

function buildEpisodeArtifactPayload(
  timeline: TimelineState,
  projectSlug: string,
  episodeSlug: string,
  generatedFrom: string,
  savedAt: string,
): EpisodeArtifact {
  const contentFingerprint = timelineContentFingerprint(timeline);
  return {
    payloadVersion: EPISODE_ARTIFACT_PAYLOAD_VERSION,
    projectSlug,
    episodeSlug,
    source: "quipsly-editor",
    timelineClips: timeline.clips.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      trackId: clip.trackId,
      startIn: roundSeconds(clip.startIn),
      duration: roundSeconds(Math.max(clip.duration, 0.05)),
      sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
      sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart + 0.05, clip.sourceStart)),
      name: clip.name,
      color: clip.color,
      kind: clip.kind,
      generatedFrom: clip.generatedFrom,
      recordingSync: clip.recordingSync,
    })),
    transcript: timeline.transcript.map((block) => ({
      id: block.id,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      text: block.text,
      deleted: Boolean(block.deleted),
      alert: block.alert ?? null,
      speaker: block.speaker ?? null,
      deactivated: Boolean(block.deactivated),
    })),
    deactivatedRanges: (timeline.deactivatedRanges ?? []).map((range) => ({
      ...range,
      startSeconds: roundSeconds(range.startSeconds),
      durationSeconds: roundSeconds(Math.max(range.durationSeconds, 0.05)),
    })),
    speakerCameraMappings: timeline.speakerCameraMappings,
    cameraSwitchDecisions: timeline.cameraSwitchDecisions,
    paperEditSnapshots: timeline.paperEditSnapshots,
    contentFingerprint,
    generatedFrom,
    savedAt,
    generatedAt: savedAt,
  };
}

function timelineContentFingerprint(timeline: TimelineState): string {
  const sortedClips = [...timeline.clips]
    .map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      trackId: clip.trackId,
      startIn: roundSeconds(clip.startIn),
      duration: roundSeconds(Math.max(clip.duration, 0.05)),
      sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
      sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart)),
      name: clip.name,
      color: clip.color,
      kind: clip.kind,
      generatedFrom: clip.generatedFrom,
      recordingSync: clip.recordingSync,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedTranscript = [...timeline.transcript]
    .map((block) => ({
      id: block.id,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      text: block.text,
      deleted: Boolean(block.deleted),
      alert: block.alert ?? null,
      speaker: block.speaker ?? null,
      deactivated: Boolean(block.deactivated),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const sortedSnapshots = Object.entries(timeline.paperEditSnapshots ?? {})
    .map(([blockId, snapshot]) => ({
      blockId,
      clips: snapshot.clips
        .map((clip) => ({
          id: clip.id,
          assetId: clip.assetId,
          trackId: clip.trackId,
          startIn: roundSeconds(clip.startIn),
          duration: roundSeconds(Math.max(clip.duration, 0.05)),
          sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
          sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart)),
          name: clip.name,
          color: clip.color,
          kind: clip.kind,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      transcript: snapshot.transcript
        .map((block) => ({
          id: block.id,
          time: roundSeconds(Math.max(block.time, 0)),
          duration: roundSeconds(Math.max(block.duration, 0.05)),
          text: block.text,
          deleted: Boolean(block.deleted),
          alert: block.alert ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.blockId.localeCompare(b.blockId));
  const sortedDeactivatedRanges = [...(timeline.deactivatedRanges ?? [])]
    .map((range) => ({
      ...range,
      startSeconds: roundSeconds(range.startSeconds),
      durationSeconds: roundSeconds(Math.max(range.durationSeconds, 0.05)),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
  const sortedSpeakerCameraMappings = [...(timeline.speakerCameraMappings ?? [])]
    .map((mapping) => ({ ...mapping }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const sortedCameraSwitchDecisions = [...(timeline.cameraSwitchDecisions ?? [])]
    .map((decision) => ({
      ...decision,
      startSeconds: roundSeconds(decision.startSeconds),
      durationSeconds: roundSeconds(Math.max(decision.durationSeconds, 0.05)),
      evidence: {
        ...decision.evidence,
        transcriptBlockIds: [...decision.evidence.transcriptBlockIds].sort(),
      },
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));

  return JSON.stringify({
    clips: sortedClips,
    transcript: sortedTranscript,
    deactivatedRanges: sortedDeactivatedRanges,
    speakerCameraMappings: sortedSpeakerCameraMappings,
    cameraSwitchDecisions: sortedCameraSwitchDecisions,
    paperEditSnapshots: sortedSnapshots,
  });
}

async function browserSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function splitAssetRef(raw: string) {
  const trim = raw.trim();
  if (!trim) return "";
  return trim.replace(/^["'`]/, "").replace(/["'`]$/, "").trim();
}

function findAssetByReference(ref: string, assets: ImportedMediaAsset[]) {
  const candidate = splitAssetRef(ref);
  if (!candidate) return null;
  const normalized = candidate.toLowerCase();
  const directMatch = assets.find((asset) =>
    asset.id === candidate || asset.sourceId === candidate || asset.playbackUrl === candidate || asset.gcsUri === candidate
  );
  if (directMatch) return directMatch;

  const slugMatch = assets.find((asset) => {
    const lowerName = asset.originalName.toLowerCase();
    return lowerName === normalized || lowerName.includes(normalized) || normalized.includes(lowerName);
  });
  return slugMatch ?? null;
}

function parseCoPilotCommand(input: string): EditorCoPilotParse {
  const commandText = input.trim();
  if (!commandText) {
    return {
      commandText,
      parsed: { type: "n/a", command: input },
    };
  }

  const lower = commandText.toLowerCase();
  const sourceUrl = /^(?:import|register|add)\s+(?:a\s+)?(?:source|clip|url)\s+(.+)$/i;
  const urlMatch = commandText.match(/https?:\/\/\S+/);

  if (/^\s*(help|\?|commands?)\s*$/i.test(lower)) {
    return { commandText, parsed: { type: "help", command: commandText } };
  }

  if (/\bundo\b.*\b(sync|change|action|last)\b/i.test(lower)) {
    return { commandText, parsed: { type: "undo-last-change", command: commandText } };
  }

  if (/\bsave\b.*\btimeline\b/i.test(lower) || /^\s*save(ed)?\s*$/i.test(lower)) {
    return { commandText, parsed: { type: "save-timeline", command: commandText } };
  }

  if (/\b(refresh|reload|reopen|re-hydrate|reopen)\b/i.test(lower)) {
    return { commandText, parsed: { type: "refresh-state", command: commandText } };
  }

  if (/\borgani(z|s)e\b/i.test(lower)) {
    return { commandText, parsed: { type: "organize", command: commandText } };
  }

  const sourceMatch = commandText.match(sourceUrl);
  if (sourceMatch) {
    const nextRef = splitAssetRef(sourceMatch[1]);
    return {
      commandText,
      parsed: {
        type: "source-url",
        command: commandText,
        sourceUrl: nextRef,
        sourceTitle: `Imported from co-pilot`,
      },
    };
  }

  const addMatch = commandText.match(/^(?:add|place|append)\s+(.+?)\s+(?:to|onto|onto the)\s+(?:timeline|the\s+timeline)$/i);
  if (addMatch) {
    return {
      commandText,
      parsed: {
        type: "add-to-timeline",
        command: commandText,
        assetRef: splitAssetRef(addMatch[1]),
      },
    };
  }

  const attachMatch = commandText.match(/^(?:attach|link|connect|use)\s+(.+?)\s+(?:to|onto|on)\s+(?:the\s+)?selected\s+clip/i);
  if (attachMatch) {
    return {
      commandText,
      parsed: {
        type: "attach-to-selected",
        command: commandText,
        assetRef: splitAssetRef(attachMatch[1]),
      },
    };
  }

  const spineMatch = commandText.match(/^(?:set|make)\s+(.+?)\s+(?:as|the|to\s+the)?\s*(?:spine|episode\s+spine|main|main\s+audio)$/i);
  if (spineMatch) {
    return {
      commandText,
      parsed: {
        type: "set-spine-audio",
        command: commandText,
        assetRef: splitAssetRef(spineMatch[1]),
      },
    };
  }

  const markMatch = commandText.match(/^(?:mark|set|line|lined|flag)\s+(.+?)\s+(?:as\s+)?(synced|ready-to-sync|ready to sync|safe|held|parked)$/i);
  if (markMatch) {
    const status = markMatch[2].toLowerCase();
    return {
      commandText,
      parsed: {
        type: "set-sync-status",
        command: commandText,
        assetRef: splitAssetRef(markMatch[1]),
        status: status === "safe"
          ? "ready-to-sync"
          : status === "parked"
            ? "held"
            : status === "held" || status === "synced"
              ? status
              : "ready-to-sync",
      },
    };
  }

  const playheadMatch = commandText.match(/^(?:set|move|jump)\s+(?:playhead|time|cursor)\s+to\s+(\d+(?:\.\d+)?)$/i);
  if (playheadMatch) {
    const value = Number(playheadMatch[1]);
    return {
      commandText,
      parsed: {
        type: "set-playhead",
        command: commandText,
        playheadSeconds: Number.isFinite(value) ? value : 0,
      },
    };
  }

  const transcriptMatch = commandText.match(/^(?:transcript|assist)\s+(.+)$/i);
  if (transcriptMatch) {
    return {
      commandText,
      parsed: {
        type: "transcript-assist",
        command: commandText,
        assetRef: splitAssetRef(transcriptMatch[1]),
      },
    };
  }

  const queueMatch = commandText.match(/^(?:queue|enqueue)\s+(\w+(?:-\w+)?)\s+for\s+(.+)$/i);
  if (queueMatch) {
    const rawJob = queueMatch[1].toLowerCase();
    return {
      commandText,
      parsed: {
        type: "queue-job",
        command: commandText,
        assetRef: splitAssetRef(queueMatch[2]),
        jobType: normalizeMediaAnalysisJobType(rawJob),
      },
    };
  }

  const suggestionMatch = commandText.match(/^(?:apply|accept)\s+(?:suggestion|ai)\s+(?:for|to)\s+(.+)$/i);
  if (suggestionMatch) {
    return {
      commandText,
      parsed: { type: "apply-suggestion", command: commandText, assetRef: splitAssetRef(suggestionMatch[1]) },
    };
  }

  if (urlMatch && /https?:\/\/\S+/.test(commandText)) {
    return {
      commandText,
      parsed: {
        type: "source-url",
        command: commandText,
        sourceUrl: urlMatch[0],
      },
    };
  }

  return {
    commandText,
    parsed: {
      type: "n/a",
      command: commandText,
    },
  };
}

function AudioMasteryLoudnessGraph({ measurement }: {
  measurement: NonNullable<AudioMasteryClientStatus["sourceMeasurement"]>;
}) {
  const width = 720;
  const height = 100;
  const points = measurement.series.filter((point) => point.shortTermLufs !== null || point.momentaryLufs !== null);
  const durationMs = Math.max(measurement.durationSeconds * 1_000, points.at(-1)?.timeMs ?? 1);
  const y = (lufs: number) => Math.max(2, Math.min(height - 2, ((0 - Math.max(-60, Math.min(0, lufs))) / 60) * height));
  const x = (timeMs: number) => Math.max(0, Math.min(width, (timeMs / durationMs) * width));
  const pathFor = (key: "shortTermLufs" | "momentaryLufs") => points
    .filter((point) => point[key] !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.timeMs).toFixed(1)},${y(point[key] as number).toFixed(1)}`)
    .join(" ");
  const shortTermPath = pathFor("shortTermLufs");
  const momentaryPath = pathFor("momentaryLufs");
  return (
    <figure className="rounded-md border border-fuchsia-200 bg-[#1d1630] p-2" aria-label="Source loudness over time">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" role="img" aria-labelledby="audio-mastery-chart-title audio-mastery-chart-description">
        <title id="audio-mastery-chart-title">Source loudness over time</title>
        <desc id="audio-mastery-chart-description">Momentary and short-term LUFS from a complete source decode. The dashed line marks the minus sixteen LUFS podcast target.</desc>
        {[-48, -32, -16].map((level) => (
          <g key={level}>
            <line x1="0" x2={width} y1={y(level)} y2={y(level)} stroke={level === -16 ? "#f0abfc" : "#4c3d64"} strokeWidth={level === -16 ? 1.5 : 1} strokeDasharray={level === -16 ? "7 5" : "2 6"} />
            <text x="6" y={y(level) - 4} fill={level === -16 ? "#f5d0fe" : "#a99abb"} fontSize="10" fontWeight="700">{level} LUFS</text>
          </g>
        ))}
        {momentaryPath && <path d={momentaryPath} fill="none" stroke="#818cf8" strokeWidth="1.3" opacity="0.75" />}
        {shortTermPath && <path d={shortTermPath} fill="none" stroke="#f0abfc" strokeWidth="2.3" />}
      </svg>
      <figcaption className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[8px] font-bold uppercase tracking-[0.08em] text-fuchsia-100">
        <span><span className="mr-1 inline-block h-0.5 w-2 bg-fuchsia-300 align-middle" />Short-term · 3 s</span>
        <span><span className="mr-1 inline-block h-0.5 w-2 bg-indigo-400 align-middle" />Momentary · 400 ms</span>
        <span className="col-span-2">1 s display bins · complete source decode</span>
      </figcaption>
    </figure>
  );
}

function CloudEditorContent() {
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<"timeline" | "transcript" | "reframe" | "segmenter">("timeline");
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [productionState, setProductionState] = useState<EpisodeProductionState | null>(null);
  const [productionEntryError, setProductionEntryError] = useState<string | null>(null);
  const [collaborationState, setCollaborationState] = useState<EpisodeCollaborationState | null>(null);
  const [remoteTimelineNotice, setRemoteTimelineNotice] = useState<string | null>(null);
  const [isImportingMedia, setIsImportingMedia] = useState(false);
  const [isAiOrganizingMedia, setIsAiOrganizingMedia] = useState(false);
  const [isAdvancedToolsVisible, setIsAdvancedToolsVisible] = useState(false);
  const [applyingAiSuggestionIds, setApplyingAiSuggestionIds] = useState<Set<string>>(() => new Set());
  const [transcriptAssistingAssetIds, setTranscriptAssistingAssetIds] = useState<Set<string>>(() => new Set());
  const [queueingMediaJobKeys, setQueueingMediaJobKeys] = useState<Set<string>>(() => new Set());
  const [collaborationProxyStatusByAsset, setCollaborationProxyStatusByAsset] = useState<Record<string, EpisodeCollaborationProxyClientStatus>>({});
  const [audioMasteryStatusByAsset, setAudioMasteryStatusByAsset] = useState<Record<string, AudioMasteryClientStatus>>({});
  const [audioSignalProfileStatusByAsset, setAudioSignalProfileStatusByAsset] = useState<Record<string, AudioSignalProfileClientStatus>>({});
  const [sourceTranscriptStatusByAsset, setSourceTranscriptStatusByAsset] = useState<Record<string, StudioSourceTranscriptClientStatus>>({});
  const [audioTreatmentStatusByAsset, setAudioTreatmentStatusByAsset] = useState<Record<string, AudioTreatmentClientStatus>>({});
  const [mediaImportStatus, setMediaImportStatus] = useState<string | null>(null);
  const [promotingPremiereDraftId, setPromotingPremiereDraftId] = useState<string | null>(null);
  const [restoringTimelineBackupId, setRestoringTimelineBackupId] = useState<string | null>(null);
  const [editorCoPilotInput, setEditorCoPilotInput] = useState("");
  const [editorCoPilotLog, setEditorCoPilotLog] = useState<EditorCoPilotLogEntry[]>([]);
  const [editorCoPilotMessages, setEditorCoPilotMessages] = useState<EditorCoPilotMessage[]>([]);
  const [isEditorCoPilotBusy, setIsEditorCoPilotBusy] = useState(false);
  const [sourceClipUrl, setSourceClipUrl] = useState("");
  const [sourceClipTitle, setSourceClipTitle] = useState("");
  const [sourceClipImportStatus, setSourceClipImportStatus] = useState<"idle" | "importing">("idle");
  const [mediaHealthById, setMediaHealthById] = useState<Record<string, MediaSourceHealth>>({});
  const [mediaHealthCheckedAt, setMediaHealthCheckedAt] = useState<string | null>(null);
  const [isCheckingMediaHealth, setIsCheckingMediaHealth] = useState(false);
  const [syncWizardSpineAssetId, setSyncWizardSpineAssetId] = useState("");
  const [syncWizardTargetAssetId, setSyncWizardTargetAssetId] = useState("");
  const [syncWizardAnchorSeconds, setSyncWizardAnchorSeconds] = useState(0);
  const [syncWizardPreviousAnchorSeconds, setSyncWizardPreviousAnchorSeconds] = useState<number | null>(null);
  const [syncPreviewState, setSyncPreviewState] = useState<"idle" | "ready" | "playing" | "paused" | "error">("idle");
  const [syncPreviewMessage, setSyncPreviewMessage] = useState("Pick a spine and target, then preview the current anchor.");
  const [syncReviewWaveformConfirmed, setSyncReviewWaveformConfirmed] = useState(false);
  const [syncReviewDriftConfirmed, setSyncReviewDriftConfirmed] = useState(false);
  const [syncReviewHumanApproved, setSyncReviewHumanApproved] = useState(false);
  const [syncReviewIntervalSeconds, setSyncReviewIntervalSeconds] = useState("");
  const [syncReviewResidualMilliseconds, setSyncReviewResidualMilliseconds] = useState("");
  const [syncReviewNotes, setSyncReviewNotes] = useState("");
  const [isSavingAlignmentReview, setIsSavingAlignmentReview] = useState(false);
  const [timelineSaveState, setTimelineSaveState] = useState<TimelineSaveState>("idle");
  const [timelineLastSavedAt, setTimelineLastSavedAt] = useState<string | null>(null);
  const [timelineHydrationSource, setTimelineHydrationSource] = useState<TimelineHydrationSource>("loading");
  const [timelineReloadToken, setTimelineReloadToken] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isTimelineHydrated, setIsTimelineHydrated] = useState(false);
  const hasHydratedProductionTimeline = useRef(false);
  const timelineHydrationRequestRef = useRef(0);
  const timelineAutosaveRequestRef = useRef(0);
  const timelineSaveStateRef = useRef<TimelineSaveState>("idle");
  const timelineAutosaveAbortRef = useRef<AbortController | null>(null);
  const timelineAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineSavedFingerprintRef = useRef("");
  const timelineRouteRef = useRef("");
  const captureGroupFocusAppliedRef = useRef("");
  const audioSignalProfileAutoStartedRef = useRef<Set<string>>(new Set());
  const syncPreviewSpineRef = useRef<HTMLAudioElement | null>(null);
  const syncPreviewTargetRef = useRef<HTMLMediaElement | null>(null);
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? searchParams.get("projectId");
  const episodeSlug = searchParams.get("episode") ?? searchParams.get("boundary") ?? "current-episode";
  const requestedCaptureGroupId = normalizeCaptureGroupFocusId(
    searchParams.get("captureGroup"),
  );
  const resolvedProjectSlug = projectId ?? DEFAULT_EDITOR_PROJECT_SLUG;
  const episodeLabel = humanizeSlug(episodeSlug);
  const [realEditingMode, setRealEditingMode] = useState(false);
  const [isAddAtPlayheadPickerOpen, setIsAddAtPlayheadPickerOpen] = useState(false);
  const [isReplaceSourcePickerOpen, setIsReplaceSourcePickerOpen] = useState(false);
  const [isExportQueueOpen, setIsExportQueueOpen] = useState(false);

  // The new NLE timeline reducer
  const {
    state: timelineState,
    canUndo,
    canRedo,
    undo,
    redo,
    replaceTimeline,
    addClip,
    toggleDeleteBlock,
    splitClipAt,
    trimClip,
    updateClipSource,
    deleteClip,
    deleteClipAndCloseGap,
    duplicateClip,
    nudgeClip,
    moveClipTo,
    moveClipToTrack,
    renameClip,
    updateClipVolume,
    snapClipToPrevious,
    snapClipToNext,
    updateClipTiming,
    compactTrackFromClip,
    pushTrackOverlapsFromClip,
    addLoopClip,
    deleteLoopClip,
    setEditorMode,
    updateClipTransforms,
    addClipKeyframe,
    addDeactivatedRange,
    removeDeactivatedRange,
    setSpeakerCameraMapping,
    removeSpeakerCameraMapping,
    setCameraSwitchDecisions,
    removeCameraSwitchDecision,
  } = useTimelineState(EMPTY_TIMELINE_STATE);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const timelineFingerprint = useMemo(() => timelineContentFingerprint(timelineState), [timelineState]);
  const routeToken = useMemo(() => `${resolvedProjectSlug}::${episodeSlug}`, [resolvedProjectSlug, episodeSlug]);
  const [isAiAutoEditing, setIsAiAutoEditing] = useState(false);
  const [isAiDisclosureOpen, setIsAiDisclosureOpen] = useState(false);
  const [aiEditSuggestions, setAiEditSuggestions] = useState<AiEditSuggestion[]>([]);
  const [aiEditReviewCandidates, setAiEditReviewCandidates] = useState<AiEditReviewCandidate[]>([]);
  const [aiEditProposalSetId, setAiEditProposalSetId] = useState<string | null>(null);
  const [aiEditProposalBinding, setAiEditProposalBinding] = useState<AiEditProposalSet["binding"] | null>(null);
  const [aiEditGenerator, setAiEditGenerator] = useState<AiEditProposalSet["provider"] | null>(null);
  const [aiEditSignalResolution, setAiEditSignalResolution] = useState<{
    status: "available" | "unavailable" | "ambiguous" | "held";
    reason: string;
    boundMediaAssetKind: "capture-recording" | "studio-media" | null;
    boundMediaAssetId: string | null;
  } | null>(null);
  const [aiEditSignalVisualization, setAiEditSignalVisualization] = useState<AiEditSignalVisualization | null>(null);
  const [aiProofWatchEndSeconds, setAiProofWatchEndSeconds] = useState<number | null>(null);
  const [aiEditMessage, setAiEditMessage] = useState("");
  const [editReviewReceipts, setEditReviewReceipts] = useState<EpisodeEditReviewReceipt[]>([]);
  const [editReviewLedgerStatus, setEditReviewLedgerStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editReviewLedgerNotice, setEditReviewLedgerNotice] = useState("");
  const [cameraCutMessage, setCameraCutMessage] = useState("");
  const [cameraCutHolds, setCameraCutHolds] = useState<CameraCutAssemblyHold[]>([]);
  const [cameraEvidenceReady, setCameraEvidenceReady] = useState(false);
  const [isAssemblingCameraCut, setIsAssemblingCameraCut] = useState(false);
  const pendingEditReviewReceiptIdsRef = useRef<string[]>([]);

  const handleTimelineUndo = useCallback(() => {
    undo();
    setIsPreviewPlaying(false);
    setAiProofWatchEndSeconds(null);
    setAiEditMessage("Timeline undo completed. Review the restored editable timeline; source media was never changed.");
  }, [undo]);

  const handleTimelineRedo = useCallback(() => {
    redo();
    setIsPreviewPlaying(false);
    setAiProofWatchEndSeconds(null);
    setAiEditMessage("Timeline redo completed. Review the editable timeline before saving or rendering; source media was never changed.");
  }, [redo]);

  const loadEditReviewLedger = useCallback(async (signal?: AbortSignal) => {
    setEditReviewLedgerStatus("loading");
    try {
      const params = new URLSearchParams({ projectSlug: resolvedProjectSlug, episodeSlug });
      const response = await fetch(`/api/editor/edit-review?${params.toString()}`, { cache: "no-store", signal });
      const payload = await response.json() as { ok?: boolean; receipts?: EpisodeEditReviewReceipt[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The review ledger could not be loaded.");
      if (signal?.aborted) return false;
      setEditReviewReceipts(Array.isArray(payload.receipts) ? payload.receipts : []);
      setEditReviewLedgerStatus("ready");
      setEditReviewLedgerNotice("");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      setEditReviewLedgerStatus("error");
      setEditReviewLedgerNotice(error instanceof Error ? error.message : "The review ledger could not be loaded.");
      return false;
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const requestEditAnalysis = async (analysisMode: "deterministic" | "provider") => {
    if (!timelineState.transcript?.length) return;
    try {
      setIsAiDisclosureOpen(false);
      setIsAiAutoEditing(true);
      setAiEditMessage("");
      const timelineFingerprintSha256 = await browserSha256(timelineFingerprint);
      const res = await fetch("/api/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptBlocks: timelineState.transcript,
          providerDisclosureAccepted: analysisMode === "provider",
          analysisMode,
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          timelineFingerprintSha256,
          selectedMediaAssetId: persistedSpineAudio?.assetId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiEditSuggestions([]);
        setAiEditReviewCandidates([]);
        setAiEditProposalSetId(null);
        setAiEditProposalBinding(null);
        setAiEditGenerator(null);
        setAiEditSignalResolution(null);
        setAiEditSignalVisualization(null);
        setAiEditMessage(data.error || "Edit suggestions are unavailable. The timeline is unchanged.");
        return;
      }
      const proposalSet = data.proposalSet as AiEditProposalSet | undefined;
      if (
        !proposalSet
        || proposalSet.kind !== AI_EDIT_PROPOSAL_SET_KIND
        || proposalSet.version !== AI_EDIT_PROPOSAL_SET_VERSION
        || !Array.isArray(proposalSet.proposals)
      ) {
        setAiEditSuggestions([]);
        setAiEditReviewCandidates([]);
        setAiEditProposalSetId(null);
        setAiEditProposalBinding(null);
        setAiEditGenerator(null);
        setAiEditSignalResolution(null);
        setAiEditSignalVisualization(null);
        setAiEditMessage("The provider response did not include a valid source-bound proposal set. The timeline is unchanged.");
        return;
      }
      const suggestions = proposalSet.proposals;
      const reviewCandidates = Array.isArray(proposalSet.reviewCandidates) ? proposalSet.reviewCandidates : [];
      setAiEditSuggestions(suggestions);
      setAiEditReviewCandidates(reviewCandidates);
      setAiEditProposalSetId(proposalSet.proposalSetId);
      setAiEditProposalBinding(proposalSet.binding);
      setAiEditGenerator(proposalSet.provider);
      const signalResolution = data.signalEvidence && typeof data.signalEvidence === "object"
        ? data.signalEvidence as Record<string, unknown>
        : null;
      const signalStatus = signalResolution?.status;
      setAiEditSignalResolution(
        analysisMode === "deterministic"
        && signalResolution
        && (signalStatus === "available" || signalStatus === "unavailable" || signalStatus === "ambiguous" || signalStatus === "held")
          ? {
            status: signalStatus,
            reason: typeof signalResolution.reason === "string" ? signalResolution.reason : "Decoded signal status is unavailable.",
            boundMediaAssetKind: signalResolution.boundMediaAssetKind === "capture-recording" || signalResolution.boundMediaAssetKind === "studio-media" ? signalResolution.boundMediaAssetKind : null,
            boundMediaAssetId: typeof signalResolution.boundMediaAssetId === "string" ? signalResolution.boundMediaAssetId : null,
          }
          : null,
      );
      setAiEditSignalVisualization(
        isAiEditSignalVisualization(data.signalVisualization)
          ? data.signalVisualization
          : null,
      );
      const itemCount = suggestions.length + reviewCandidates.length;
      setAiEditMessage(itemCount
        ? `${suggestions.length} reversible proposal${suggestions.length === 1 ? "" : "s"} and ${reviewCandidates.length} review candidate${reviewCandidates.length === 1 ? "" : "s"} ready. Nothing has been applied.`
        : "No edit evidence was found. The timeline is unchanged.");
      void loadEditReviewLedger();
    } catch (e) {
      console.error(e);
      setAiEditSuggestions([]);
      setAiEditReviewCandidates([]);
      setAiEditProposalSetId(null);
      setAiEditProposalBinding(null);
      setAiEditGenerator(null);
      setAiEditSignalResolution(null);
      setAiEditSignalVisualization(null);
      setAiEditMessage("Edit suggestions could not be loaded. The timeline is unchanged.");
    } finally {
      setIsAiAutoEditing(false);
    }
  };

  const handleAiAutoEdit = () => requestEditAnalysis("provider");
  const handleDeterministicEditAnalysis = () => requestEditAnalysis("deterministic");

  useEffect(() => {
    if (!productionState || productionState.mode !== "database") return;
    const controller = new AbortController();
    void loadEditReviewLedger(controller.signal);
    return () => controller.abort();
  }, [loadEditReviewLedger, productionState?.id, productionState?.mode, routeToken]);

  const recordEditReviewAction = useCallback(async (input: {
    action: EditReviewAction;
    subjectId: string;
    subjectKind: EditReviewSubjectKind;
    sourceRange: { startSeconds: number; endSeconds: number };
    proposalSetId?: string | null;
    proposalTimelineFingerprintSha256?: string | null;
    evidence?: Record<string, unknown>;
  }) => {
    const proposalSetId = input.proposalSetId ?? aiEditProposalSetId;
    const proposalTimelineFingerprintSha256 = input.proposalTimelineFingerprintSha256 ?? aiEditProposalBinding?.timelineFingerprintSha256;
    if (!proposalSetId || !proposalTimelineFingerprintSha256) {
      setEditReviewLedgerNotice("This legacy decision has no durable proposal-set binding. The local action remains reversible, but no new review receipt was claimed.");
      return null;
    }
    try {
      const currentTimelineFingerprintSha256 = await browserSha256(timelineFingerprint);
      const response = await fetch("/api/editor/edit-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          clientRequestId: crypto.randomUUID(),
          proposalSetId,
          action: input.action,
          subjectId: input.subjectId,
          subjectKind: input.subjectKind,
          sourceRange: input.sourceRange,
          proposalTimelineFingerprintSha256,
          timelineFingerprintBeforeSha256: currentTimelineFingerprintSha256,
          evidence: input.evidence ?? {},
          occurredAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json() as { ok?: boolean; receipt?: EpisodeEditReviewReceipt; error?: string };
      if (!response.ok || !payload.ok || !payload.receipt) throw new Error(payload.error || "The review action was not durably recorded.");
      setEditReviewReceipts((current) => [payload.receipt!, ...current.filter((receipt) => receipt.id !== payload.receipt!.id)]);
      if (payload.receipt.scope === "LOCAL_DRAFT") {
        pendingEditReviewReceiptIdsRef.current = Array.from(new Set([...pendingEditReviewReceiptIdsRef.current, payload.receipt.id]));
      }
      setEditReviewLedgerStatus("ready");
      setEditReviewLedgerNotice("");
      return payload.receipt;
    } catch (error) {
      setEditReviewLedgerStatus("error");
      setEditReviewLedgerNotice(error instanceof Error ? error.message : "The review action was not durably recorded.");
      return null;
    }
  }, [aiEditProposalBinding?.timelineFingerprintSha256, aiEditProposalSetId, episodeSlug, resolvedProjectSlug, timelineFingerprint]);

  const aiEditBindingIsCurrent = useCallback(async () => {
    if (
      !aiEditProposalBinding
      || aiEditProposalBinding.projectSlug !== resolvedProjectSlug
      || aiEditProposalBinding.episodeSlug !== episodeSlug
      || aiEditProposalBinding.blockCount !== timelineState.transcript.length
    ) return false;
    const [currentTimelineSha256, currentTranscriptSha256] = await Promise.all([
      browserSha256(timelineFingerprint),
      browserSha256(canonicalAiEditTranscript(timelineState.transcript)),
    ]);
    return currentTimelineSha256 === aiEditProposalBinding.timelineFingerprintSha256
      && currentTranscriptSha256 === aiEditProposalBinding.transcriptSha256;
  }, [aiEditProposalBinding, episodeSlug, resolvedProjectSlug, timelineFingerprint, timelineState.transcript]);

  useEffect(() => {
    let cancelled = false;
    if (
      !aiEditProposalBinding
      || aiEditProposalBinding.projectSlug !== resolvedProjectSlug
      || aiEditProposalBinding.episodeSlug !== episodeSlug
      || aiEditProposalBinding.blockCount !== timelineState.transcript.length
    ) {
      setCameraEvidenceReady(false);
      return;
    }
    setCameraEvidenceReady(false);
    void Promise.all([
      browserSha256(timelineFingerprint),
      browserSha256(canonicalAiEditTranscript(timelineState.transcript)),
    ]).then(([timelineSha256, transcriptSha256]) => {
      if (!cancelled) setCameraEvidenceReady(
        timelineSha256 === aiEditProposalBinding.timelineFingerprintSha256
        && transcriptSha256 === aiEditProposalBinding.transcriptSha256,
      );
    });
    return () => { cancelled = true; };
  }, [aiEditProposalBinding, episodeSlug, resolvedProjectSlug, timelineFingerprint, timelineState.transcript]);

  const mapSpeakerToCamera = useCallback((speakerKey: string, speakerLabel: string, clipId: string) => {
    const existing = (timelineState.speakerCameraMappings ?? []).find((mapping) => mapping.speakerKey === speakerKey);
    if (!clipId) {
      if (existing) removeSpeakerCameraMapping(existing.id);
      setCameraCutHolds([]);
      setCameraCutMessage(`${speakerLabel} no longer has a camera mapping. The prior assembled cut was cleared; source media was unchanged.`);
      return;
    }
    const clip = timelineState.clips.find((candidate) => candidate.id === clipId && isVisualTimelineClip(candidate));
    if (!clip) {
      setCameraCutMessage("That camera source is no longer on the timeline, so the mapping was not changed.");
      return;
    }
    setSpeakerCameraMapping({
      id: existing?.id ?? `speaker-camera:${encodeURIComponent(speakerKey)}`,
      speakerKey,
      speakerLabel,
      targetClipId: clip.id,
      targetAssetId: clip.assetId,
      source: "manual",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    setCameraCutHolds([]);
    setCameraCutMessage(`${speakerLabel} is mapped to ${clip.trackId} · ${clip.name}. Bind fresh evidence before assembling because camera identity is part of the edit decision.`);
  }, [removeSpeakerCameraMapping, setSpeakerCameraMapping, timelineState.clips, timelineState.speakerCameraMappings]);

  const assembleMappedSpeakerCut = useCallback(async () => {
    setIsAssemblingCameraCut(true);
    try {
      if (!await aiEditBindingIsCurrent() || !aiEditProposalSetId || !aiEditProposalBinding) {
        setCameraEvidenceReady(false);
        setCameraCutMessage("The transcript, camera map, or timeline changed. Bind current deterministic evidence before assembling a new cut.");
        return;
      }
      const createdAt = new Date().toISOString();
      const result = assembleSpeakerCameraCut({
        timeline: timelineState,
        createdAt,
        proposalSetId: aiEditProposalSetId,
        proposalTimelineFingerprintSha256: aiEditProposalBinding.timelineFingerprintSha256,
      });
      setCameraCutHolds(result.holds);
      if (!result.decisions.length) {
        setCameraCutMessage(`No safe camera switch ranges were assembled. Quipsly held ${result.holds.length} range${result.holds.length === 1 ? "" : "s"} rather than guessing.`);
        return;
      }
      const receipt = await recordEditReviewAction({
        action: "APPLIED_TO_DRAFT",
        subjectId: aiEditProposalSetId,
        subjectKind: "proposal-set",
        sourceRange: { startSeconds: aiEditProposalBinding.startSeconds, endSeconds: aiEditProposalBinding.endSeconds },
        evidence: {
          editKind: "deterministic-speaker-camera-cut",
          decisionIds: result.decisions.map((decision) => decision.id),
          mappingIds: Array.from(new Set(result.decisions.map((decision) => decision.mappingId))),
          heldRanges: result.holds.map((hold) => ({ reason: hold.reason, startSeconds: hold.startSeconds, endSeconds: hold.endSeconds })),
          sourceMediaUnchanged: true,
        },
      });
      if (!receipt) {
        setCameraCutMessage("The camera draft was not applied because its durable review receipt could not be saved.");
        return;
      }
      setCameraSwitchDecisions(result.decisions);
      setEditorMode("play-edit");
      setIsPreviewPlaying(false);
      setCameraCutMessage(`Assembled ${result.decisions.length} receipt-backed camera range${result.decisions.length === 1 ? "" : "s"} and deliberately held ${result.holds.length}. Review the edit monitor, then save the timeline. Source files remain untouched.`);
    } finally {
      setIsAssemblingCameraCut(false);
    }
  }, [aiEditBindingIsCurrent, aiEditProposalBinding, aiEditProposalSetId, recordEditReviewAction, setCameraSwitchDecisions, setEditorMode, timelineState]);

  const restoreCameraSwitchDecision = useCallback(async (decision: CameraSwitchDecision) => {
    const proposalSetId = decision.evidence.proposalSetId;
    const proposalTimelineFingerprintSha256 = decision.evidence.proposalTimelineFingerprintSha256;
    if (proposalSetId && proposalTimelineFingerprintSha256) {
      const receipt = await recordEditReviewAction({
        action: "RESTORED_TO_DRAFT",
        subjectId: decision.id,
        subjectKind: "camera-switch",
        sourceRange: { startSeconds: decision.startSeconds, endSeconds: decision.startSeconds + decision.durationSeconds },
        proposalSetId,
        proposalTimelineFingerprintSha256,
        evidence: { editKind: "deterministic-speaker-camera-cut", targetClipId: decision.targetClipId, sourceMediaUnchanged: true },
      });
      if (!receipt) {
        setCameraCutMessage("The camera range was not restored because its durable review receipt could not be saved.");
        return;
      }
    }
    removeCameraSwitchDecision(decision.id);
    setCameraCutMessage(`Restored the prior track-priority angle at ${formatClock(decision.startSeconds)}. The camera source and transcript were unchanged.`);
  }, [recordEditReviewAction, removeCameraSwitchDecision]);

  const proofWatchCameraSwitchDecision = useCallback(async (decision: CameraSwitchDecision) => {
    const currentTimelineDuration = Math.max(
      1,
      timelineState.clips.reduce((maximum, clip) => Math.max(maximum, clip.startIn + clip.duration), 0),
      timelineState.transcript.reduce((maximum, block) => Math.max(maximum, block.time + block.duration), 0),
    );
    const start = Math.max(0, decision.startSeconds - 1.5);
    const end = Math.min(currentTimelineDuration, decision.startSeconds + decision.durationSeconds + 1.5);
    setEditorMode("play-edit");
    setCurrentTime(start);
    setAiProofWatchEndSeconds(Math.max(start + 0.1, end));
    setIsPreviewPlaying(true);
    setCameraCutMessage(`Proof-watching the assembled camera decision from ${formatClock(start)} to ${formatClock(end)}. The decision remains a reversible draft while its review receipt is saved.`);
    const receipt = await recordEditReviewAction({
      action: "PROOF_WATCHED",
      subjectId: decision.id,
      subjectKind: "camera-switch",
      sourceRange: {
        startSeconds: decision.startSeconds,
        endSeconds: decision.startSeconds + decision.durationSeconds,
      },
      proposalSetId: decision.evidence.proposalSetId,
      proposalTimelineFingerprintSha256: decision.evidence.proposalTimelineFingerprintSha256,
      evidence: {
        editKind: "deterministic-speaker-camera-cut",
        targetClipId: decision.targetClipId,
        targetAssetId: decision.targetAssetId,
        mappingId: decision.mappingId,
        transcriptBlockIds: decision.evidence.transcriptBlockIds,
        playbackMode: "assembled-edit",
        contextBeforeSeconds: decision.startSeconds - start,
        contextAfterSeconds: end - (decision.startSeconds + decision.durationSeconds),
        sourceMediaUnchanged: true,
      },
    });
    setCameraCutMessage(`Proof-watching the assembled camera decision from ${formatClock(start)} to ${formatClock(end)}. The decision remains a reversible draft.${receipt ? " Review receipt saved." : " Playback started, but the receipt failure remains visibly flagged."}`);
  }, [recordEditReviewAction, setEditorMode, timelineState.clips, timelineState.transcript]);

  const dismissAiEditSuggestion = async (index: number) => {
    const edit = aiEditSuggestions[index];
    if (edit) {
      await recordEditReviewAction({
        action: "DISMISSED",
        subjectId: edit.proposalId,
        subjectKind: "proposal",
        sourceRange: edit.sourceRange,
        evidence: { proposalType: edit.type, confidence: edit.confidence },
      });
    }
    setAiEditSuggestions((current) => {
      const next = current.filter((_, candidateIndex) => candidateIndex !== index);
      return next;
    });
  };

  const dismissAiEditReviewCandidate = async (index: number) => {
    const candidate = aiEditReviewCandidates[index];
    if (candidate) {
      await recordEditReviewAction({
        action: "DISMISSED",
        subjectId: candidate.candidateId,
        subjectKind: "candidate",
        sourceRange: candidate.sourceRange,
        evidence: { candidateKind: candidate.kind, confidence: candidate.confidence },
      });
    }
    setAiEditReviewCandidates((current) => {
      const next = current.filter((_, candidateIndex) => candidateIndex !== index);
      return next;
    });
  };

  const dismissAllAiEditEvidence = async () => {
    const items = [
      ...aiEditSuggestions.map((item) => ({ id: item.proposalId, kind: "proposal" as const, range: item.sourceRange, evidence: { itemKind: item.type } })),
      ...aiEditReviewCandidates.map((item) => ({ id: item.candidateId, kind: "candidate" as const, range: item.sourceRange, evidence: { itemKind: item.kind } })),
    ];
    await Promise.all(items.map((item) => recordEditReviewAction({
      action: "DISMISSED",
      subjectId: item.id,
      subjectKind: item.kind,
      sourceRange: item.range,
      evidence: { ...item.evidence, bulkDismiss: true },
    })));
    setAiEditSuggestions([]);
    setAiEditReviewCandidates([]);
  };

  const proofWatchAiEditSuggestion = async (
    edit: AiEditSuggestion | AiEditReviewCandidate,
    reviewMode: "watch" | "listen" = "watch",
    boundProof?: AutomatedEditBoundProof,
  ) => {
    if (!await aiEditBindingIsCurrent()) {
      setAiEditMessage("This edit analysis is stale because the transcript or timeline changed. Request a fresh analysis before reviewing or applying it.");
      return;
    }
    const subjectId = "proposalId" in edit ? edit.proposalId : edit.candidateId;
    const receipt = await recordEditReviewAction({
      action: reviewMode === "listen" ? "PROOF_LISTENED" : "PROOF_WATCHED",
      subjectId,
      subjectKind: "proposalId" in edit ? "proposal" : "candidate",
      sourceRange: edit.sourceRange,
      evidence: {
        reviewMode,
        confidence: edit.confidence,
        itemKind: "proposalId" in edit ? edit.type : edit.kind,
        ...(boundProof ? {
          protectedPlayback: true,
          mediaAssetKind: boundProof.mediaAssetKind,
          mediaAssetId: boundProof.mediaAssetId,
          protectedPlaybackSourceId: boundProof.sourceId,
          sourceSha256: boundProof.sourceSha256,
          signalProfileSha256: boundProof.signalProfileSha256,
          playbackPositionSeconds: boundProof.playbackPositionSeconds,
        } : {}),
      },
    });
    if (boundProof) {
      setEditorMode("play-all");
      setIsPreviewPlaying(false);
      setAiProofWatchEndSeconds(null);
      setCurrentTime(boundProof.playbackPositionSeconds);
      setAiEditMessage(`Proof-listened through the exact protected ${boundProof.mediaAssetKind === "studio-media" ? "Studio media" : "Capture recording"} at ${formatClock(boundProof.playbackPositionSeconds)}.${receipt ? " Review receipt saved." : " Playback was operated, but the durable receipt failed and is visibly flagged."}`);
      return;
    }
    const start = Math.max(0, edit.sourceRange.startSeconds - 1.5);
    const end = Math.min(totalDuration, edit.sourceRange.endSeconds + 1.5);
    setEditorMode("play-all");
    setCurrentTime(start);
    setAiProofWatchEndSeconds(Math.max(start + 0.1, end));
    setIsPreviewPlaying(true);
    setAiEditMessage(`${reviewMode === "listen" ? "Proof-listening to" : "Proof-watching"} untouched source from ${formatClock(start)} to ${formatClock(end)}. Nothing has been applied.${receipt ? " Review receipt saved." : " Playback is available, but the durable receipt failed and is visibly flagged."}`);
  };

  const applyAiEditSuggestion = async (edit: AiEditSuggestion, index: number) => {
    if (!await aiEditBindingIsCurrent()) {
      setAiEditMessage("This proposal is stale because the transcript or timeline changed. Request a fresh analysis before applying it.");
      return;
    }
    if (edit.type === "deactivate") {
      const blockId = edit.blockId;
      if (!blockId) {
        setAiEditMessage("That transcript proposal is incomplete, so it was not applied.");
        return;
      }
      const block = timelineState.transcript.find((candidate) => candidate.id === blockId);
      if (!block) {
        setAiEditMessage("That transcript block is no longer present, so the proposal was not applied.");
        return;
      }
      const receipt = await recordEditReviewAction({
        action: "APPLIED_TO_DRAFT",
        subjectId: edit.proposalId,
        subjectKind: "proposal",
        sourceRange: edit.sourceRange,
        evidence: { proposalType: edit.type, confidence: edit.confidence },
      });
      if (!receipt) {
        setAiEditMessage("The transcript cut was not applied because its durable draft-action receipt could not be saved.");
        return;
      }
      if (!block.deactivated) toggleDeleteBlock(blockId);
      setAiEditSuggestions((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
      setAiEditMessage("Transcript cut applied to the editable timeline. Review playback before saving or rendering.");
      return;
    }

    if (edit.type === "deactivate_range") {
      const signal = edit.evidence.audioSignal;
      const boundSignal = aiEditProposalBinding?.signalEvidence;
      const startSeconds = edit.sourceRange.startSeconds;
      const endSeconds = edit.sourceRange.endSeconds;
      if (
        !signal
        || signal.classification !== "measured-low-energy"
        || !boundSignal
        || signal.mediaAssetKind !== boundSignal.mediaAssetKind
        || signal.mediaAssetId !== boundSignal.mediaAssetId
        || signal.sourceSha256 !== boundSignal.sourceSha256
        || signal.storageGeneration !== boundSignal.storageGeneration
        || signal.signalProfileSha256 !== boundSignal.signalProfileSha256
        || signal.measuredStartSeconds > startSeconds
        || signal.measuredEndSeconds < endSeconds
        || endSeconds - startSeconds < 0.05
      ) {
        setAiEditMessage("That range proposal is missing current immutable low-energy evidence, so it was not applied.");
        return;
      }
      const overlapsExistingDecision = deactivatedTimelineIntervals(timelineState).some((range) => (
        startSeconds < range.endSeconds && endSeconds > range.startSeconds
      ));
      if (overlapsExistingDecision) {
        setAiEditMessage("That range already overlaps a deactivated edit decision. Nothing new was applied.");
        return;
      }
      const receipt = await recordEditReviewAction({
        action: "APPLIED_TO_DRAFT",
        subjectId: edit.proposalId,
        subjectKind: "proposal",
        sourceRange: edit.sourceRange,
        evidence: {
          proposalType: edit.type,
          confidence: edit.confidence,
          signalProfileSha256: signal.signalProfileSha256,
          sourceSha256: signal.sourceSha256,
        },
      });
      if (!receipt) {
        setAiEditMessage("The measured range was not applied because its durable draft-action receipt could not be saved.");
        return;
      }
      addDeactivatedRange({
        id: `ai-range-${edit.proposalId}`,
        startSeconds,
        durationSeconds: endSeconds - startSeconds,
        reason: edit.rationale,
        source: "deterministic-signal",
        confidence: edit.confidence,
        proposalId: edit.proposalId,
        proposalSetId: aiEditProposalSetId ?? undefined,
        proposalTimelineFingerprintSha256: aiEditProposalBinding?.timelineFingerprintSha256,
        createdAt: new Date().toISOString(),
        aiSuggested: true,
        sourceEvidence: {
          mediaAssetKind: signal.mediaAssetKind,
          mediaAssetId: signal.mediaAssetId,
          sourceSha256: signal.sourceSha256,
          storageGeneration: signal.storageGeneration,
          signalProfileSha256: signal.signalProfileSha256,
          classification: "measured-low-energy",
          coverageFraction: signal.coverageFraction,
          maximumRmsDbfs: signal.maximumRmsDbfs,
          nearSilenceDbfs: signal.nearSilenceDbfs,
        },
      });
      setAiEditSuggestions((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
      setAiEditMessage("Measured low-energy range skipped in the editable timeline. Review active-edit playback before saving or rendering; source media is unchanged.");
      return;
    }

    const videoClip = timelineState.clips.find((clip) => isVideoTrackId(clip.trackId));
    if (!videoClip) {
      setAiEditMessage("No video clip is available for that reframe, so the proposal was not applied.");
      return;
    }
    if (edit.timeOffset === undefined || edit.x === undefined || edit.y === undefined || edit.scale === undefined) {
      setAiEditMessage("That reframe proposal is incomplete, so it was not applied.");
      return;
    }
    const receipt = await recordEditReviewAction({
      action: "APPLIED_TO_DRAFT",
      subjectId: edit.proposalId,
      subjectKind: "proposal",
      sourceRange: edit.sourceRange,
      evidence: { proposalType: edit.type, confidence: edit.confidence },
    });
    if (!receipt) {
      setAiEditMessage("The reframe was not applied because its durable draft-action receipt could not be saved.");
      return;
    }
    addClipKeyframe(videoClip.id, {
      id: `kf-${crypto.randomUUID()}`,
      timeOffset: edit.timeOffset,
      x: edit.x,
      y: edit.y,
      scale: edit.scale,
      easing: "ease-in-out",
      aiSuggested: true,
    });
    setAiEditSuggestions((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
    setAiEditMessage("Reframe keyframe applied to the editable timeline. Review playback before saving or rendering.");
  };

  const setTimelineSaveStateSafe = (next: TimelineSaveState) => {
    timelineSaveStateRef.current = next;
    setTimelineSaveState(next);
  };

  useEffect(() => {
    setEditorCoPilotMessages([{
      id: makeId("copilot-msg"),
      at: new Date().toISOString(),
      role: "system",
      text: "Editor co-pilot online. I can run editor actions and keep a rollback log for each successful change.",
    }]);
  }, []);

  useEffect(() => {
    setProductionState(null);
    setProductionEntryError(null);
    hasHydratedProductionTimeline.current = false;
    setIsTimelineHydrated(false);
    timelineSavedFingerprintRef.current = "";
    timelineSaveStateRef.current = "idle";
    setTimelineSaveState("idle");
    setTimelineLastSavedAt(null);
    setTimelineHydrationSource("loading");
    setSelectedClipId(null);
    setAiEditSuggestions([]);
    setAiEditReviewCandidates([]);
    setAiEditProposalSetId(null);
    setAiEditProposalBinding(null);
    setEditReviewReceipts([]);
    setEditReviewLedgerStatus("idle");
    setEditReviewLedgerNotice("");
    pendingEditReviewReceiptIdsRef.current = [];
    timelineRouteRef.current = routeToken;
    timelineAutosaveAbortRef.current?.abort();
    if (timelineAutosaveTimerRef.current) {
      clearTimeout(timelineAutosaveTimerRef.current);
      timelineAutosaveTimerRef.current = null;
    }
  }, [episodeSlug, resolvedProjectSlug, routeToken]);

  useEffect(() => {
    if (realEditingMode && viewMode !== "timeline") {
      setViewMode("timeline");
    }
  }, [realEditingMode, viewMode]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedChanges = timelineFingerprint !== timelineSavedFingerprintRef.current;
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes to your timeline. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [timelineFingerprint]);

  useEffect(() => {
    const requestId = ++timelineHydrationRequestRef.current;
    const controller = new AbortController();
    const activeRoute = routeToken;

    postEpisodeProduction(
      {
        action: "ensure",
        projectSlug: resolvedProjectSlug,
        episodeSlug,
        title: episodeLabel,
        boundaryLabel: episodeLabel,
        productionJson: {
          surface: "editor",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
        },
      },
      { signal: controller.signal },
    ).then((state) => {
      if (controller.signal.aborted) return;
      if (requestId !== timelineHydrationRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;

      setProductionState(state);
      setProductionEntryError(null);
      if (state.mode !== "database" && (state.status === "auth-required" || state.status === "access-denied")) {
        setTimelineSaveStateSafe("error");
        setTimelineHydrationSource("error");
        setSessionSummary(state.message || "This Nest editor is private.");
        return;
      }
      if (state.mode === "database") {
        setTimelineSaveStateSafe("idle");
      } else {
        setTimelineSaveStateSafe("fallback");
      }

      if (hasHydratedProductionTimeline.current) return;

      const persistedPayloads: Array<{ label: TimelineHydrationSource; payload: unknown }> = [
        { label: "saved timeline", payload: state.timelineJson },
        { label: "recording room", payload: state.recordingRoomJson },
        { label: "transcript payload", payload: state.transcriptJson },
      ];
      const persistedTimelineEntry = persistedPayloads
        .map((candidate) => ({ label: candidate.label, timeline: extractTimelineFromPayload(candidate.payload) }))
        .find((candidate) => Boolean(candidate.timeline)) as { label: TimelineHydrationSource; timeline: TimelineState } | undefined;

      if (persistedTimelineEntry) {
        const sharedWatchProjection = projectSharedWatchTimeline(
          persistedTimelineEntry.timeline,
          state.productionJson,
        );
        const persistedTimeline = sharedWatchProjection.timeline;
        replaceTimeline(persistedTimeline);
        hasHydratedProductionTimeline.current = true;
        setIsTimelineHydrated(true);
        const persistedRecord = asObject(state.timelineJson);
        timelineSavedFingerprintRef.current = coerceString(
          persistedRecord?.contentFingerprint,
          timelineContentFingerprint(persistedTimelineEntry.timeline),
        );
        const persistedSavedAt = coerceString(persistedRecord?.savedAt);
        setTimelineLastSavedAt(persistedSavedAt || null);
        setTimelineHydrationSource(persistedTimelineEntry.label);
        setSessionSummary(
          sharedWatchProjection.derivativeCount
            ? `Loaded ${state.title} from ${persistedTimelineEntry.label} with ${sharedWatchProjection.derivativeCount} Shared Watch ${sharedWatchProjection.derivativeCount === 1 ? "span" : "spans"}`
            : `Loaded ${state.title} from ${persistedTimelineEntry.label}`,
        );
        setViewMode("timeline");
      } else {
        const sharedWatchProjection = projectSharedWatchTimeline(
          EMPTY_TIMELINE_STATE,
          state.productionJson,
        );
        replaceTimeline(sharedWatchProjection.timeline);
        timelineSavedFingerprintRef.current = timelineContentFingerprint(sharedWatchProjection.timeline);
        setTimelineLastSavedAt(null);
        setTimelineHydrationSource(sharedWatchProjection.derivativeCount ? "shared watch" : "empty episode");
        setSessionSummary(
          sharedWatchProjection.derivativeCount
            ? `Loaded ${sharedWatchProjection.derivativeCount} receipt-backed Shared Watch ${sharedWatchProjection.derivativeCount === 1 ? "span" : "spans"} for ${state.title}`
            : `${state.title} has no saved timeline or playable recording media yet.`,
        );
      }
      setIsTimelineHydrated(true);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== timelineHydrationRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;
      console.warn("Could not hydrate episode timeline production state.", error);
      setProductionEntryError(error instanceof Error ? error.message : "The protected editor could not be opened.");
      setTimelineSaveStateSafe("error");
      setTimelineHydrationSource("error");
      setSessionSummary("Failed to hydrate timeline from server.");
      replaceTimeline(EMPTY_TIMELINE_STATE);
      setIsTimelineHydrated(true);
    });

    return () => {
      controller.abort();
    };
  }, [episodeLabel, episodeSlug, resolvedProjectSlug, routeToken, timelineReloadToken]);

  useEffect(() => {
    const handleSyncDeckTimelineSave = (event: Event) => {
      const detail = (event as CustomEvent<{ timelineJson?: unknown; state?: EpisodeProductionState }>).detail;
      const nextTimeline = extractTimelineFromPayload(detail?.timelineJson ?? detail?.state?.timelineJson);
      if (!nextTimeline) return;

      replaceTimeline(nextTimeline);
      timelineSavedFingerprintRef.current = timelineContentFingerprint(nextTimeline);
      setProductionState(detail?.state ?? null);
      setTimelineLastSavedAt(new Date().toISOString());
      setTimelineSaveStateSafe("saved");
      setSessionSummary("Sync Deck cut added to timeline");
      setIsTimelineHydrated(true);
      setViewMode("timeline");
    };

    window.addEventListener("quipsly:timeline-json-saved", handleSyncDeckTimelineSave);
    return () => window.removeEventListener("quipsly:timeline-json-saved", handleSyncDeckTimelineSave);
  }, [replaceTimeline]);

  const buildTimelineArtifact = useCallback((generatedFrom: string, savedAt: string): EpisodeArtifact => {
    return buildEpisodeArtifactPayload(timelineState, resolvedProjectSlug, episodeSlug, generatedFrom, savedAt);
  }, [resolvedProjectSlug, episodeSlug, timelineState]);

  const saveTimelineEpisodeProduction = useCallback(async (mode: "manual" | "auto") => {
    if (!productionState) {
      setTimelineSaveStateSafe("error");
      return;
    }

    if (productionState.mode !== "database") {
      setTimelineSaveStateSafe("conflict");
      return;
    }

    const requestId = ++timelineAutosaveRequestRef.current;
    const activeRoute = routeToken;
    const capturedFingerprint = timelineFingerprint;
    const capturedPendingReceiptIds = [...pendingEditReviewReceiptIdsRef.current];
    const editReviewSaveRequestId = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    const episodeArtifact = buildTimelineArtifact(
      mode === "manual" ? "editor-save-manual" : "editor-autosave",
      savedAt,
    );
    const controller = new AbortController();

    timelineAutosaveAbortRef.current?.abort();
    timelineAutosaveAbortRef.current = controller;
    setTimelineSaveStateSafe("saving");

    try {
      const [timelineFingerprintBeforeSha256, timelineFingerprintAfterSha256] = await Promise.all([
        browserSha256(timelineSavedFingerprintRef.current || capturedFingerprint),
        browserSha256(capturedFingerprint),
      ]);
      const state = await postEpisodeProduction(
        {
          action: "save-timeline",
          productionId: productionState.id,
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          timelineJson: episodeArtifact,
          transcriptJson: episodeArtifact,
          expectedTimelineFingerprint: timelineSavedFingerprintRef.current || undefined,
          editReviewSaveRequestId,
          editReviewReceiptIds: capturedPendingReceiptIds,
          editReviewSaveMode: mode,
          timelineFingerprintBeforeSha256,
          timelineFingerprintAfterSha256,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;
      if (requestId !== timelineAutosaveRequestRef.current) return;
      if (activeRoute !== timelineRouteRef.current) return;
      if (capturedFingerprint !== timelineFingerprint) return;

      setProductionState(state);
      if (state.mode === "database") {
        timelineSavedFingerprintRef.current = capturedFingerprint;
        setTimelineLastSavedAt(savedAt);
        setTimelineSaveStateSafe("saved");
        setRemoteTimelineNotice(null);
        if (state.editReviewReceipt) {
          setEditReviewReceipts((current) => [state.editReviewReceipt!, ...current.filter((receipt) => receipt.id !== state.editReviewReceipt!.id)]);
          const persisted = new Set(capturedPendingReceiptIds);
          pendingEditReviewReceiptIdsRef.current = pendingEditReviewReceiptIdsRef.current.filter((id) => !persisted.has(id));
          setEditReviewLedgerStatus("ready");
          setEditReviewLedgerNotice("");
        }
      } else if (state.mode === "conflict") {
        setTimelineSaveStateSafe("conflict");
        setRemoteTimelineNotice("Nest has a newer timeline. Refresh before continuing, or save again after you decide what to keep.");
        console.warn("Conflict detected. Server timeline has diverged.");
      } else {
        setTimelineSaveStateSafe("conflict");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== timelineAutosaveRequestRef.current) return;
      console.warn("Could not save timeline state.", error);
      setTimelineSaveStateSafe("error");
    }
  }, [
    buildTimelineArtifact,
    episodeSlug,
    productionState,
    resolvedProjectSlug,
    routeToken,
    timelineFingerprint,
  ]);

  const handleSaveEpisodeTimeline = async () => {
    await saveTimelineEpisodeProduction("manual");
  };

  const handleRefreshProductionState = () => {
    const hasUnsavedLocalChanges = timelineFingerprint !== timelineSavedFingerprintRef.current;
    if (
      hasUnsavedLocalChanges
      && !window.confirm("Reload this episode from the database? Unsaved local timeline changes will be replaced.")
    ) {
      return;
    }

    hasHydratedProductionTimeline.current = false;
    setIsTimelineHydrated(false);
    setTimelineHydrationSource("loading");
    setSessionSummary("Refreshing episode production state...");
    setRemoteTimelineNotice(null);
    setTimelineReloadToken((token) => token + 1);
  };

  useEffect(() => {
    if (!isTimelineHydrated || !hasHydratedProductionTimeline.current) return;
    const productionJsonSize = productionState?.productionJson
      ? JSON.stringify(productionState.productionJson).length
      : 0;
    if (timelineState.clips.length === 0 && productionJsonSize > 50) {
      console.error("Hydration safety lock prevented empty timeline from overwriting cloud state.");
      return;
    }
    if (!productionState) {
      setTimelineSaveStateSafe("idle");
      return;
    }
    if (productionState.mode !== "database") {
      setTimelineSaveStateSafe("fallback");
      return;
    }
    if (timelineFingerprint === timelineSavedFingerprintRef.current) {
      if (["saving", "queued"].includes(timelineSaveStateRef.current)) {
        setTimelineSaveStateSafe("saved");
      } else if (timelineLastSavedAt) {
        setTimelineSaveStateSafe("saved");
      } else {
        setTimelineSaveStateSafe("idle");
      }
      return;
    }

    if (timelineAutosaveTimerRef.current) {
      clearTimeout(timelineAutosaveTimerRef.current);
      timelineAutosaveTimerRef.current = null;
    }

    setTimelineSaveStateSafe("queued");

    const activeRoute = routeToken;
    timelineAutosaveTimerRef.current = setTimeout(() => {
      void saveTimelineEpisodeProduction("auto");
    }, 900);

    return () => {
      if (timelineAutosaveTimerRef.current && activeRoute === timelineRouteRef.current) {
        clearTimeout(timelineAutosaveTimerRef.current);
      }
      timelineAutosaveTimerRef.current = null;
      timelineAutosaveAbortRef.current?.abort();
    };
  }, [isTimelineHydrated, productionState, timelineFingerprint, saveTimelineEpisodeProduction, timelineLastSavedAt, routeToken]);

  useEffect(() => {
    if (!isTimelineHydrated || !productionState || productionState.mode !== "database") return;
    const controller = new AbortController();

    const sendHeartbeat = async () => {
      try {
        const hasUnsavedLocalChanges = timelineFingerprint !== timelineSavedFingerprintRef.current;
        const state = await sendEpisodeCollaborationHeartbeat(
          {
            action: "heartbeat",
            projectSlug: resolvedProjectSlug,
            episodeSlug,
            app: "web-editor",
            route: "editor",
            editing: hasUnsavedLocalChanges,
          },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setCollaborationState(state);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Could not update episode collaboration presence.", error);
      }
    };

    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [episodeSlug, isTimelineHydrated, productionState, resolvedProjectSlug, routeToken, timelineFingerprint]);

  useEffect(() => {
    if (!isTimelineHydrated || !productionState || productionState.mode !== "database") return;
    const controller = new AbortController();

    const pollRemoteTimeline = async () => {
      try {
        const state = await fetchEpisodeCollaborationState(resolvedProjectSlug, episodeSlug, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!state) return;
        setCollaborationState(state);

        if (!state.timelineFingerprint || state.timelineFingerprint === timelineSavedFingerprintRef.current) return;

        const hasUnsavedLocalChanges = timelineFingerprint !== timelineSavedFingerprintRef.current;
        if (
          hasUnsavedLocalChanges
          || timelineSaveStateRef.current === "saving"
          || timelineSaveStateRef.current === "queued"
        ) {
          const collaborator = state.activeCollaborators.find((person) => person.editing) ?? state.activeCollaborators[0];
          setRemoteTimelineNotice(
            `${collaborator?.name ?? "A collaborator"} has a newer Nest timeline. Your local cut is untouched; save or refresh when ready.`,
          );
          return;
        }

        setRemoteTimelineNotice("A newer Nest timeline was found. Pulling it into this editor.");
        hasHydratedProductionTimeline.current = false;
        setIsTimelineHydrated(false);
        setTimelineHydrationSource("loading");
        setSessionSummary("Pulling collaborator timeline from Nest...");
        setTimelineReloadToken((token) => token + 1);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Could not poll episode collaboration state.", error);
      }
    };

    const intervalMs = Math.max(3, collaborationState?.recommendedPollSeconds ?? 4) * 1000;
    const interval = window.setInterval(pollRemoteTimeline, intervalMs);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [
    collaborationState?.recommendedPollSeconds,
    episodeSlug,
    isTimelineHydrated,
    productionState,
    resolvedProjectSlug,
    routeToken,
    timelineFingerprint,
  ]);

  const selectedClip = useMemo(() => {
    return timelineState.clips.find((clip) => clip.id === selectedClipId) ?? timelineState.clips[0] ?? null;
  }, [selectedClipId, timelineState.clips]);

  const importedMediaAssets = useMemo(() => {
    return normalizeImportedMediaAssets(productionState?.productionJson);
  }, [productionState?.productionJson]);
  const captureGroupFocus = useMemo(
    () => captureGroupEditorFocusPlan(
      importedMediaAssets,
      requestedCaptureGroupId,
    ),
    [importedMediaAssets, requestedCaptureGroupId],
  );
  const [episodeMediaTruth, setEpisodeMediaTruth] = useState<EpisodeMediaTruth | null>(null);
  const [episodeMediaTruthStatus, setEpisodeMediaTruthStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [episodeMediaTruthError, setEpisodeMediaTruthError] = useState<string | null>(null);
  const [episodeMediaTruthRefreshToken, setEpisodeMediaTruthRefreshToken] = useState(0);

  useEffect(() => {
    if (!productionState || productionState.mode !== "database" || !resolvedProjectSlug || !episodeSlug) {
      setEpisodeMediaTruth(null);
      setEpisodeMediaTruthStatus("idle");
      setEpisodeMediaTruthError(null);
      return;
    }

    const controller = new AbortController();
    setEpisodeMediaTruthStatus("loading");
    setEpisodeMediaTruthError(null);

    const loadEpisodeMediaTruth = async () => {
      try {
        const params = new URLSearchParams({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
        });
        const response = await fetch(`/api/media-vault/episode-inventory?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as EpisodeMediaTruth | null;
        if (controller.signal.aborted) return;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `Episode media truth returned ${response.status}.`);
        }

        setEpisodeMediaTruth(payload);
        setEpisodeMediaTruthStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEpisodeMediaTruth(null);
        setEpisodeMediaTruthStatus("error");
        setEpisodeMediaTruthError(error instanceof Error ? error.message : "Could not load episode media truth.");
      }
    };

    void loadEpisodeMediaTruth();
    return () => controller.abort();
  }, [episodeMediaTruthRefreshToken, episodeSlug, productionState, resolvedProjectSlug, routeToken]);

  const premiereDraftEdits = useMemo(() => {
    return normalizePremiereDraftEdits(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const premiereRestorePreviewClips = useMemo(() => {
    return timelineState.clips.filter((clip) =>
      clip.id.startsWith("premiere-restore-preview-") || clip.name.startsWith("Restore preview -")
    );
  }, [timelineState.clips]);

  const selectedClipIsPremiereRestorePreview = Boolean(
    selectedClip
    && (selectedClip.id.startsWith("premiere-restore-preview-") || selectedClip.name.startsWith("Restore preview -"))
  );

  const timelineBackups = useMemo(() => {
    return normalizeTimelineBackups(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const aiIngestReport = useMemo(() => {
    return normalizeAiIngestReport(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const transcriptAssistReports = useMemo(() => {
    return normalizeTranscriptAssistReports(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const transcriptAssistReportsByAsset = useMemo(() => {
    const map = new Map<string, TranscriptAssistReport>();
    transcriptAssistReports.forEach((report) => {
      if (!map.has(report.assetId)) map.set(report.assetId, report);
      if (report.sourceId && !map.has(report.sourceId)) map.set(report.sourceId, report);
    });
    return map;
  }, [transcriptAssistReports]);

  const mediaAnalysisJobs = useMemo(() => {
    return normalizeMediaAnalysisJobs(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const mediaAnalysisJobsByAsset = useMemo(() => {
    const map = new Map<string, MediaAnalysisJob[]>();
    mediaAnalysisJobs.forEach((job) => {
      const jobs = map.get(job.assetId) ?? [];
      jobs.push(job);
      map.set(job.assetId, jobs);
    });
    return map;
  }, [mediaAnalysisJobs]);

  const aiIngestRecommendationsByAsset = useMemo(() => {
    const recommendations = new Map<string, AiIngestRecommendation>();
    aiIngestReport?.recommendations.forEach((recommendation) => {
      recommendations.set(recommendation.assetId, recommendation);
    });
    return recommendations;
  }, [aiIngestReport]);

  const syncHistory = useMemo(() => {
    return normalizeSyncHistory(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const latestSyncSnapshot = syncHistory[0] ?? null;

  const importedAudioAssets = useMemo(() => {
    return importedMediaAssets.filter((asset) => asset.kind === "audio" || asset.contentType.startsWith("audio/"));
  }, [importedMediaAssets]);

  const persistedSpineAudio = useMemo(() => {
    return normalizeEpisodeSpineAudio(productionState?.productionJson);
  }, [productionState?.productionJson]);

  const timelineAudioClips = useMemo(() => {
    return timelineState.clips.filter((clip) => clip.kind === "audio" || isAudioTrackId(clip.trackId));
  }, [timelineState.clips]);

  const syncWizardSpineAsset = useMemo(() => {
    return importedMediaAssets.find((asset) => asset.id === syncWizardSpineAssetId || asset.sourceId === syncWizardSpineAssetId) ?? null;
  }, [importedMediaAssets, syncWizardSpineAssetId]);

  const persistedSpineImportedAsset = useMemo(() => {
    if (!persistedSpineAudio?.assetId) return null;
    return importedMediaAssets.find((asset) =>
      asset.id === persistedSpineAudio.assetId || asset.sourceId === persistedSpineAudio.assetId
    ) ?? null;
  }, [importedMediaAssets, persistedSpineAudio?.assetId]);

  const persistedSpineTimelineClip = useMemo(() => {
    if (!persistedSpineAudio?.clipId) return null;
    return timelineState.clips.find((clip) => clip.id === persistedSpineAudio.clipId) ?? null;
  }, [persistedSpineAudio?.clipId, timelineState.clips]);

  const activeSpineAudioLabel = persistedSpineImportedAsset?.originalName
    ?? persistedSpineTimelineClip?.name
    ?? persistedSpineAudio?.label
    ?? syncWizardSpineAsset?.originalName
    ?? "No spine audio set";

  const syncWizardTargetAsset = useMemo(() => {
    return importedMediaAssets.find((asset) => asset.id === syncWizardTargetAssetId || asset.sourceId === syncWizardTargetAssetId) ?? null;
  }, [importedMediaAssets, syncWizardTargetAssetId]);

  const syncWizardCaptureAlignment = useMemo(
    () => episodeRoomCaptureAlignment(syncWizardTargetAsset),
    [syncWizardTargetAsset],
  );

  const syncWizardSavedReview = useMemo(
    () => reviewedSourceAlignment(syncWizardTargetAsset),
    [syncWizardTargetAsset],
  );
  const syncWizardSpineSignalProfile = syncWizardSpineAsset
    ? audioSignalProfileStatusByAsset[syncWizardSpineAsset.id] ?? audioSignalProfileStatusByAsset[syncWizardSpineAsset.sourceId] ?? null
    : null;
  const syncWizardTargetSignalProfile = syncWizardTargetAsset
    ? audioSignalProfileStatusByAsset[syncWizardTargetAsset.id] ?? audioSignalProfileStatusByAsset[syncWizardTargetAsset.sourceId] ?? null
    : null;
  const syncWizardSpineSignal = useMemo(
    () => importedAssetAudioSignal(syncWizardSpineAsset, syncWizardSpineSignalProfile),
    [syncWizardSpineAsset, syncWizardSpineSignalProfile],
  );
  const syncWizardTargetSignal = useMemo(
    () => importedAssetAudioSignal(syncWizardTargetAsset, syncWizardTargetSignalProfile),
    [syncWizardTargetAsset, syncWizardTargetSignalProfile],
  );
  const syncWizardTargetDurationSeconds = useMemo(
    () => importedAssetDurationSeconds(syncWizardTargetAsset, syncWizardTargetSignalProfile),
    [syncWizardTargetAsset, syncWizardTargetSignalProfile],
  );

  const clockProposalMatchesSpine =
    Boolean(syncWizardCaptureAlignment?.baselineRecordingAssetId)
    && syncWizardCaptureAlignment?.baselineRecordingAssetId
      === importedAssetRecordingAssetId(syncWizardSpineAsset);
  const canUseClockProposal =
    syncWizardCaptureAlignment?.status === "proposal-ready"
    && clockProposalMatchesSpine
    && syncWizardCaptureAlignment.estimatedOffsetMilliseconds !== null
    && syncWizardCaptureAlignment.estimatedOffsetMilliseconds >= 0;

  const parsedSyncReviewIntervalSeconds = Number(syncReviewIntervalSeconds);
  const parsedSyncReviewResidualMilliseconds = Number(
    syncReviewResidualMilliseconds,
  );
  const syncReviewObservedPartsPerMillion =
    Number.isFinite(parsedSyncReviewIntervalSeconds)
    && parsedSyncReviewIntervalSeconds > 0
    && Number.isFinite(parsedSyncReviewResidualMilliseconds)
      ? parsedSyncReviewResidualMilliseconds
        * 1_000
        / parsedSyncReviewIntervalSeconds
      : null;
  const syncEvidenceObservationIntervalSeconds = syncWizardSavedReview?.driftReview.observationIntervalSeconds
    ?? (syncReviewIntervalSeconds.trim() && Number.isFinite(parsedSyncReviewIntervalSeconds) && parsedSyncReviewIntervalSeconds > 0
      ? parsedSyncReviewIntervalSeconds
      : null);
  const syncEvidenceResidualMilliseconds = syncWizardSavedReview?.driftReview.residualDriftMilliseconds
    ?? (syncReviewResidualMilliseconds.trim() && Number.isFinite(parsedSyncReviewResidualMilliseconds)
      ? parsedSyncReviewResidualMilliseconds
      : null);
  const syncReviewEvidenceComplete =
    syncReviewWaveformConfirmed
    && syncReviewDriftConfirmed
    && syncReviewHumanApproved
    && Boolean(syncReviewIntervalSeconds.trim())
    && Boolean(syncReviewResidualMilliseconds.trim())
    && Number.isFinite(parsedSyncReviewIntervalSeconds)
    && parsedSyncReviewIntervalSeconds > 0
    && Number.isFinite(parsedSyncReviewResidualMilliseconds);

  const syncWizardTargetOptions = useMemo(() => {
    const focusedIds = new Set(captureGroupFocus?.assetIds ?? []);
    return importedMediaAssets
      .filter((asset) => asset.id !== syncWizardSpineAsset?.id)
      .sort((left, right) => (
        Number(focusedIds.has(right.id)) - Number(focusedIds.has(left.id))
      ));
  }, [captureGroupFocus?.assetIds, importedMediaAssets, syncWizardSpineAsset]);

  const mediaHealthProbeItems = useMemo(() => {
    const items = new Map<string, MediaHealthProbeItem>();

    importedMediaAssets.forEach((asset) => {
      const sourceUrl = sanitizeTrackSource(asset.playbackUrl || asset.gcsUri);
      if (!sourceUrl) return;
      items.set(`asset:${asset.id}`, {
        id: `asset:${asset.id}`,
        label: asset.originalName,
        sourceUrl,
        expectedKind: healthKindFromImportedAsset(asset),
        contentType: asset.contentType,
        size: asset.size,
      });
    });

    timelineState.clips.forEach((clip) => {
      const sourceUrl = sourceUrlForClip(clip, importedMediaAssets);
      if (!sourceUrl || isMissingProductionSource(clip)) return;
      items.set(`clip:${clip.id}`, {
        id: `clip:${clip.id}`,
        label: `${clip.trackId} ${clip.name}`,
        sourceUrl,
        expectedKind: inferHealthKindFromClip(clip),
      });
    });

    return Array.from(items.values());
  }, [importedMediaAssets, timelineState.clips]);

  const mediaHealthProbeSignature = useMemo(() => {
    return JSON.stringify(mediaHealthProbeItems.map((item) => [
      item.id,
      item.sourceUrl,
      item.expectedKind,
      item.contentType ?? "",
      item.size ?? 0,
    ]));
  }, [mediaHealthProbeItems]);

  const refreshMediaHealth = useCallback(async () => {
    if (!mediaHealthProbeItems.length) {
      setMediaHealthById({});
      setMediaHealthCheckedAt(null);
      setIsCheckingMediaHealth(false);
      return;
    }

    setIsCheckingMediaHealth(true);
    setMediaHealthById((previous) => {
      const next: Record<string, MediaSourceHealth> = {};
      mediaHealthProbeItems.forEach((item) => {
        next[item.id] = previous[item.id]
          ? { ...previous[item.id], status: "checking" }
          : mediaHealthFallback(item, "checking", "Waiting for lightweight source probe.");
      });
      return next;
    });

    try {
      const response = await fetch("/api/episode-production/media-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: resolvedProjectSlug, items: mediaHealthProbeItems }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Media health check failed with HTTP ${response.status}`);
      }

      const results = coerceArray<MediaSourceHealth>(payload.results);
      setMediaHealthById(Object.fromEntries(results.map((result) => [result.id, result])));
      setMediaHealthCheckedAt(coerceString(payload.checkedAt, new Date().toISOString()));
    } catch (error) {
      console.warn("Could not check media source health.", error);
      setMediaHealthById((previous) => Object.fromEntries(
        mediaHealthProbeItems.map((item) => {
          const prev = previous[item.id];
          const hasValidPrev = prev && prev.status !== "checking" && prev.status !== "error";
          return [
            item.id,
            hasValidPrev ? prev : mediaHealthFallback(item, "error", error instanceof Error ? error.message : "Media health check failed."),
          ];
        }),
      ));
      setMediaHealthCheckedAt(new Date().toISOString());
    } finally {
      setIsCheckingMediaHealth(false);
    }
  }, [mediaHealthProbeItems, resolvedProjectSlug]);

  useEffect(() => {
    void refreshMediaHealth();
  }, [mediaHealthProbeSignature]);

  const importedAssetHealth = useCallback((asset: ImportedMediaAsset) => {
    return mediaHealthById[`asset:${asset.id}`] ?? null;
  }, [mediaHealthById]);

  const timelineClipHealth = useCallback((clip: TimelineClip) => {
    return mediaHealthById[`clip:${clip.id}`] ?? null;
  }, [mediaHealthById]);

  const mediaHealthResults = useMemo(() => Object.values(mediaHealthById), [mediaHealthById]);
  const mediaHealthStats = useMemo(() => mediaHealthSummary(mediaHealthResults), [mediaHealthResults]);

  useEffect(() => {
    if (!captureGroupFocus?.matched) return;
    const signature = [
      routeToken,
      captureGroupFocus.requestedCaptureGroupId,
      captureGroupFocus.spineAssetId ?? "",
      captureGroupFocus.targetAssetId ?? "",
      ...captureGroupFocus.assetIds,
    ].join("::");
    if (captureGroupFocusAppliedRef.current === signature) return;
    captureGroupFocusAppliedRef.current = signature;
    if (captureGroupFocus.spineAssetId) {
      setSyncWizardSpineAssetId(captureGroupFocus.spineAssetId);
    }
    if (captureGroupFocus.targetAssetId) {
      setSyncWizardTargetAssetId(captureGroupFocus.targetAssetId);
    }
    setMediaImportStatus(captureGroupFocus.message);
  }, [captureGroupFocus, routeToken]);

  useEffect(() => {
    if (captureGroupFocus?.matched) return;
    if (persistedSpineAudio?.assetId && syncWizardSpineAssetId !== persistedSpineAudio.assetId) {
      setSyncWizardSpineAssetId(persistedSpineAudio.assetId);
      return;
    }
    if (!syncWizardSpineAssetId && importedAudioAssets[0]) {
      setSyncWizardSpineAssetId(importedAudioAssets[0].id);
    }
  }, [
    captureGroupFocus?.matched,
    importedAudioAssets,
    persistedSpineAudio?.assetId,
    syncWizardSpineAssetId,
  ]);

  useEffect(() => {
    if (captureGroupFocus?.matched) return;
    if (!syncWizardTargetAssetId && importedMediaAssets.length > 0) {
      const firstTarget = importedMediaAssets.find((asset) => asset.kind === "video") ?? importedMediaAssets.find((asset) => asset.id !== syncWizardSpineAssetId) ?? importedMediaAssets[0];
      if (firstTarget) setSyncWizardTargetAssetId(firstTarget.id);
    }
  }, [
    captureGroupFocus?.matched,
    importedMediaAssets,
    syncWizardSpineAssetId,
    syncWizardTargetAssetId,
  ]);

  useEffect(() => {
    setSyncReviewWaveformConfirmed(false);
    setSyncReviewDriftConfirmed(false);
    setSyncReviewHumanApproved(false);
    setSyncReviewIntervalSeconds("");
    setSyncReviewResidualMilliseconds("");
    setSyncReviewNotes("");
  }, [syncWizardSpineAssetId, syncWizardTargetAssetId]);

  useEffect(() => {
    let canceled = false;
    const signalAssets = importedMediaAssets.filter((asset) => asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/"));
    if (!signalAssets.length) return () => { canceled = true; };
    void Promise.all(signalAssets.map(async (asset) => {
      const query = new URLSearchParams({ projectSlug: resolvedProjectSlug, assetId: asset.id });
      const response = await fetch(`/api/media-vault/audio-signal-profile?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<AudioSignalProfileClientStatus>) | null;
      return response.ok && payload?.ok && payload.status ? { asset, status: payload as { ok: true } & AudioSignalProfileClientStatus } : null;
    })).then((rows) => {
      if (canceled) return;
      setAudioSignalProfileStatusByAsset((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row) continue;
          next[row.asset.id] = row.status;
          next[row.asset.sourceId] = row.status;
        }
        return next;
      });
    }).catch((error) => { if (!canceled) console.warn("Could not hydrate audio signal profile status.", error); });
    return () => { canceled = true; };
  }, [importedMediaAssets, resolvedProjectSlug]);

  useEffect(() => {
    let canceled = false;
    const transcriptAssets = importedMediaAssets.filter((asset) => asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/"));
    if (!transcriptAssets.length) return () => { canceled = true; };
    void Promise.all(transcriptAssets.map(async (asset) => {
      const query = new URLSearchParams({ projectSlug: resolvedProjectSlug, episodeSlug, assetId: asset.id });
      const response = await fetch(`/api/media-vault/source-transcript?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<StudioSourceTranscriptClientStatus>) | null;
      return response.ok && payload?.ok && payload.status ? { asset, status: payload as { ok: true } & StudioSourceTranscriptClientStatus } : null;
    })).then((rows) => {
      if (canceled) return;
      setSourceTranscriptStatusByAsset((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row) continue;
          next[row.asset.id] = row.status;
          next[row.asset.sourceId] = row.status;
        }
        return next;
      });
    }).catch((error) => { if (!canceled) console.warn("Could not hydrate source transcript status.", error); });
    return () => { canceled = true; };
  }, [episodeSlug, importedMediaAssets, resolvedProjectSlug]);

  useEffect(() => {
    let canceled = false;
    const masteryAssets = importedMediaAssets.filter((asset) =>
      asset.kind === "audio"
      || asset.kind === "video"
      || asset.contentType.startsWith("audio/")
      || asset.contentType.startsWith("video/"),
    );
    if (!masteryAssets.length) return () => { canceled = true; };
    void Promise.all(masteryAssets.map(async (asset) => {
      const query = new URLSearchParams({ projectSlug: resolvedProjectSlug, assetId: asset.id });
      const response = await fetch(`/api/media-vault/audio-mastery?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<AudioMasteryClientStatus>) | null;
      return response.ok && payload?.ok && payload.status
        ? { asset, status: payload as { ok: true } & AudioMasteryClientStatus }
        : null;
    })).then((rows) => {
      if (canceled) return;
      setAudioMasteryStatusByAsset((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row) continue;
          next[row.asset.id] = row.status;
          next[row.asset.sourceId] = row.status;
        }
        return next;
      });
    }).catch((error) => {
      if (!canceled) console.warn("Could not hydrate audio mastery status.", error);
    });
    return () => { canceled = true; };
  }, [importedMediaAssets, resolvedProjectSlug]);

  useEffect(() => {
    let canceled = false;
    const treatmentAssets = importedMediaAssets.filter((asset) => asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/"));
    if (!treatmentAssets.length) return () => { canceled = true; };
    void Promise.all(treatmentAssets.map(async (asset) => {
      const query = new URLSearchParams({ projectSlug: resolvedProjectSlug, assetId: asset.id });
      const response = await fetch(`/api/media-vault/audio-treatment?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<AudioTreatmentClientStatus>) | null;
      return response.ok && payload?.ok && payload.status ? { asset, status: payload as { ok: true } & AudioTreatmentClientStatus } : null;
    })).then((rows) => {
      if (canceled) return;
      setAudioTreatmentStatusByAsset((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row) continue;
          next[row.asset.id] = row.status;
          next[row.asset.sourceId] = row.status;
        }
        return next;
      });
    }).catch((error) => { if (!canceled) console.warn("Could not hydrate audio treatment status.", error); });
    return () => { canceled = true; };
  }, [importedMediaAssets, resolvedProjectSlug]);

  const handleSessionImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const raw = await file.text();
    const payload = parseJson(raw);
    if (!payload) return;

    const normalizedPayload = normalizeEpisodePayload(payload) ?? payload;
    const session = normalizeRecordingSessionPackage(normalizedPayload);
    if (!session) return;

    replaceTimeline(sessionPackageToTimeline(session));
    setSessionSummary(`${session.roomName ?? file.name}: ${(session.events ?? []).length} events, ${(session.tracks ?? []).length} tracks`);
    setViewMode("timeline");
    event.target.value = "";
  };

  const handleMediaImport = async (event: ChangeEvent<HTMLInputElement>, importRole = "episode-media") => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setIsImportingMedia(true);
    const roleLabel = humanizeSlug(importRole);
    setMediaImportStatus(`Importing ${files.length} ${roleLabel.toLowerCase()} file${files.length === 1 ? "" : "s"} to ${episodeLabel}...`);

    try {
      let importedCount = 0;
      let latestProductionJson = productionState?.productionJson;
      let latestUpdatedAt = productionState?.updatedAt;

      for (const file of files) {
        setMediaImportStatus(`Importing ${file.name} (${importedCount + 1}/${files.length})...`);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectSlug", resolvedProjectSlug);
        formData.append("episodeSlug", episodeSlug);
        formData.append("anchorTime", String(roundSeconds(currentTime)));
        formData.append("importRole", importRole);
        if (selectedClip?.id) formData.append("selectedClipId", selectedClip.id);

        const response = await fetch("/api/episode-production/import-media", {
          method: "POST",
          body: formData,
        });

        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || `Import failed with HTTP ${response.status}`);
        }

        importedCount += 1;
        latestProductionJson = payload.productionJson ?? latestProductionJson;
        latestUpdatedAt = payload.updatedAt ?? latestUpdatedAt;
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: latestProductionJson ?? previous.productionJson,
          updatedAt: latestUpdatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`Imported ${importedCount} ${roleLabel.toLowerCase()} file${importedCount === 1 ? "" : "s"}; ready to sync at ${formatClock(currentTime)}.`);
    } catch (error) {
      console.warn("Could not import media into episode production.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Media import failed.");
    } finally {
      setIsImportingMedia(false);
      event.target.value = "";
    }
  };

  const registerSourceClipUrl = useCallback(async (input: { sourceUrl: string; sourceTitle?: string }) => {
    const sourceUrl = input.sourceUrl.trim();
    const sourceTitle = input.sourceTitle?.trim();
    if (!sourceUrl) {
      setMediaImportStatus("Paste a YouTube/source URL first.");
      return;
    }

    setSourceClipImportStatus("importing");
    setMediaImportStatus(`Registering source clip for ${episodeLabel}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          sourceUrl,
          originalName: sourceTitle || sourceClipTitle.trim() || sourceUrl,
          importRole: "source-clip",
          anchorTime: roundSeconds(currentTime),
          selectedClipId: selectedClip?.id,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Source import failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      if (input.sourceUrl === sourceClipUrl) {
        setSourceClipUrl("");
        setSourceClipTitle("");
      }
      setMediaImportStatus(`Registered source clip; ready to sync at ${formatClock(currentTime)}.`);
    } catch (error) {
      console.warn("Could not register source clip.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Source clip import failed.");
    } finally {
      setSourceClipImportStatus("idle");
    }
  }, [currentTime, episodeLabel, episodeSlug, resolvedProjectSlug, selectedClip?.id, sourceClipTitle]);

  const handleSourceClipUrlImport = useCallback(async () => {
    await registerSourceClipUrl({ sourceUrl: sourceClipUrl, sourceTitle: sourceClipTitle });
    setSourceClipUrl("");
    setSourceClipTitle("");
  }, [registerSourceClipUrl, sourceClipUrl, sourceClipTitle]);

  const setEpisodeSpineAudio = useCallback(async (
    input: { asset?: ImportedMediaAsset; clip?: TimelineClip },
  ) => {
    const asset = input.asset;
    const clip = input.clip;
    if (!asset && !clip) {
      setMediaImportStatus("Choose an imported audio file or timeline audio clip first.");
      return;
    }

    const label = asset?.originalName ?? clip?.name ?? "Spine audio";
    const source = asset?.playbackUrl ?? clip?.assetId ?? "";

    if (persistedSpineAudio && (persistedSpineAudio.assetId || persistedSpineAudio.clipId)) {
      if ((asset && persistedSpineAudio.assetId !== (asset.id || asset.sourceId)) ||
          (clip && persistedSpineAudio.clipId !== clip.id)) {
        if (!window.confirm("This episode already has an audio spine. Changing it may misalign existing clips. Are you sure you want to replace the spine?")) {
          setMediaImportStatus("");
          return;
        }
      }
    }

    setMediaImportStatus(`Setting spine audio: ${label}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-spine-audio",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          spineAudioAssetId: asset?.id ?? asset?.sourceId,
          spineAudioClipId: clip?.id,
          spineAudioSource: source,
          spineAudioLabel: label,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Spine update failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      if (asset) setSyncWizardSpineAssetId(asset.id);
      setMediaImportStatus(`Spine audio set: ${label}.`);
    } catch (error) {
      console.warn("Could not set spine audio.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not set spine audio.");
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const promotePremiereDraftEdit = useCallback(async (draft: PremiereDraftEdit) => {
    const confirmed = window.confirm(
      `Promote this Premiere draft edit for ${draft.episodeSlug}?\n\n` +
      `WHAT WILL CHANGE:\n` +
      `The active Quipsly timeline will be completely replaced by the ${draft.timelineClipCount} clips from this Premiere draft.\n` +
      (premiereRestorePreviewClips.length > 0 ? `\nPREVIEW CLIPS INCLUDED:\n${premiereRestorePreviewClips.length} local restore preview clips currently on your timeline will be saved into the promoted timeline.\n` : "") +
      `\nBACKUP & UNDO:\n` +
      `A backup of your current active timeline will be saved to history first. You can restore this backup from the Mac app if you need to undo.`
    );
    if (!confirmed) return;

    setPromotingPremiereDraftId(draft.id);
    setMediaImportStatus(`Promoting Premiere draft edit for ${draft.episodeSlug} with a timeline backup...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote-premiere-draft-edit",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          draftEditId: draft.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Premiere draft promotion failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          timelineJson: payload.timelineJson ?? previous.timelineJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);

      const promotedTimeline = extractTimelineFromPayload(payload.timelineJson);
      if (promotedTimeline) {
        replaceTimeline(promotedTimeline);
        timelineSavedFingerprintRef.current = timelineContentFingerprint(promotedTimeline);
        setTimelineLastSavedAt(payload.updatedAt ?? new Date().toISOString());
        setTimelineHydrationSource("saved timeline");
        setTimelineSaveStateSafe("saved");
        setViewMode("timeline");
      }

      setMediaImportStatus(
        `Promoted Premiere draft edit. Backup ${payload.backupId ?? "created"} preserved the previous active timeline.`
      );
    } catch (error) {
      console.warn("Could not promote Premiere draft edit.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not promote Premiere draft edit.");
    } finally {
      setPromotingPremiereDraftId(null);
    }
  }, [episodeSlug, replaceTimeline, resolvedProjectSlug]);

  const previewPremiereDraftEdit = useCallback((draft: PremiereDraftEdit) => {
    if (draft.timelineClips.length === 0) {
      setMediaImportStatus("This Premiere draft has no valid timeline clips to preview.");
      return;
    }

    const confirmed = window.confirm(
      `Preview ${draft.timelineClipCount} Premiere draft clip(s) locally?\n\nThis pauses autosave for the preview. Use Refresh DB state to return to the saved timeline, or Promote to active timeline to save it properly with a backup.`
    );
    if (!confirmed) return;

    hasHydratedProductionTimeline.current = false;
    setIsTimelineHydrated(false);
    replaceTimeline({
      clips: draft.timelineClips,
      transcript: timelineState.transcript,
      paperEditSnapshots: timelineState.paperEditSnapshots,
    });
    setSelectedClipId(draft.timelineClips[0]?.id ?? null);
    setCurrentTime(0);
    setViewMode("timeline");
    setTimelineSaveStateSafe("conflict");
    setSessionSummary(`Previewing Premiere draft ${draft.id}. Autosave is paused until refresh or promotion.`);
    setMediaImportStatus("Previewing staged Premiere draft locally. This has not been saved over the active timeline.");
  }, [replaceTimeline, timelineState.paperEditSnapshots, timelineState.transcript]);

  const clearPremiereRestorePreviews = useCallback(() => {
    if (premiereRestorePreviewClips.length === 0) {
      setMediaImportStatus("No local restore previews to clear.");
      return;
    }

    const confirmed = window.confirm(
      `Clear ${premiereRestorePreviewClips.length} local restore preview clip${premiereRestorePreviewClips.length === 1 ? "" : "s"}?\n\nThis only removes temporary preview clips from your current local timeline view. It does not delete media, Premiere draft data, or saved Nest backups.`
    );
    if (!confirmed) return;

    const previewIds = new Set(premiereRestorePreviewClips.map((clip) => clip.id));
    premiereRestorePreviewClips.forEach((clip) => deleteClip(clip.id));
    setSelectedClipId((current) => current && previewIds.has(current) ? null : current);
    setIsPreviewPlaying(false);
    setTimelineSaveStateSafe("conflict");
    setSessionSummary("Cleared local Premiere restore preview clips. Saved Nest production data was not changed.");
    setMediaImportStatus(`Cleared ${premiereRestorePreviewClips.length} local restore preview clip${premiereRestorePreviewClips.length === 1 ? "" : "s"}.`);
  }, [deleteClip, premiereRestorePreviewClips, setSelectedClipId]);

  const restoreTimelineBackup = useCallback(async (backup: TimelineBackupRecord) => {
    const confirmed = window.confirm(
      `Restore timeline backup ${backup.id}?\n\nQuipsly will create a new pre-restore backup first, then replace the active timeline with ${backup.timelineClipCount} clip(s).`
    );
    if (!confirmed) return;

    setRestoringTimelineBackupId(backup.id);
    setMediaImportStatus(`Restoring timeline backup ${backup.id}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore-timeline-backup",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          backupId: backup.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Timeline backup restore failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          timelineJson: payload.timelineJson ?? previous.timelineJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);

      const restoredTimeline = extractTimelineFromPayload(payload.timelineJson);
      if (restoredTimeline) {
        replaceTimeline(restoredTimeline);
        timelineSavedFingerprintRef.current = timelineContentFingerprint(restoredTimeline);
        setTimelineLastSavedAt(payload.updatedAt ?? new Date().toISOString());
        setTimelineHydrationSource("saved timeline");
        setTimelineSaveStateSafe("saved");
        setViewMode("timeline");
      }

      setMediaImportStatus(
        `Restored timeline backup. Pre-restore backup ${payload.preRestoreBackupId ?? "created"} preserved the timeline you just replaced.`
      );
    } catch (error) {
      console.warn("Could not restore timeline backup.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not restore timeline backup.");
    } finally {
      setRestoringTimelineBackupId(null);
    }
  }, [episodeSlug, replaceTimeline, resolvedProjectSlug]);

  const addImportedAssetToTimeline = useCallback((asset: ImportedMediaAsset) => {
    const placement = smartImportedAssetPlacement(asset, timelineState.clips, currentTime);
    const clipId = makeId("import-clip");
    const clip: TimelineClip = {
      id: clipId,
      assetId: asset.playbackUrl,
      kind: placement.kind,
      trackId: placement.trackId,
      startIn: placement.startIn,
      duration: placement.duration,
      sourceStart: 0,
      sourceEnd: placement.duration,
      name: placement.name,
      color: importedAssetColor(asset),
    };

    addClip(clip);
    setSelectedClipId(clipId);
    setMediaImportStatus(
      `Added ${placement.name} at ${formatClock(placement.startIn)} on ${placement.trackId}${
        placement.avoidedOverlap ? " to avoid an obvious overlap" : ""
      }. Manual track controls are still available on the selected clip.`
    );
    return clip;
  }, [addClip, currentTime, timelineState.clips]);

  const attachImportedAssetToSelectedClip = useCallback(async (asset: ImportedMediaAsset) => {
    if (!selectedClip) {
      setMediaImportStatus("Select a clip first, then attach imported media.");
      return;
    }

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-sync-snapshot",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          snapshot: {
            type: "attach-source",
            assetId: asset.id,
            targetClipId: selectedClip.id,
            label: `Attached ${asset.originalName} to ${selectedClip.name}`,
            beforeClip: {
              id: selectedClip.id,
              assetId: selectedClip.assetId,
              name: selectedClip.name,
            },
            afterClip: {
              id: selectedClip.id,
              assetId: asset.playbackUrl,
              name: asset.originalName,
            },
          },
        }),
      });
      const payload = await response.json();
      if (response.ok && payload?.ok) {
        setProductionState((previous) => previous
          ? {
            ...previous,
            productionJson: payload.productionJson ?? previous.productionJson,
            updatedAt: payload.updatedAt ?? previous.updatedAt,
          }
          : previous);
      }
    } catch (error) {
      console.warn("Could not record attach-source sync snapshot.", error);
    }

    updateClipSource(selectedClip.id, asset.playbackUrl, asset.originalName);
    setMediaImportStatus(`Attached ${asset.originalName} to ${selectedClip.name}.`);
  }, [episodeSlug, resolvedProjectSlug, selectedClip, updateClipSource]);

  const updateImportedAssetSyncStatus = useCallback(async (
    asset: ImportedMediaAsset,
    status: "ready-to-sync" | "held",
    options?: { anchorTimelineSeconds?: number; targetClipId?: string | null },
  ) => {
    const label = status === "held" ? "held for later sync" : "ready to sync";
    setMediaImportStatus(`Marking ${asset.originalName} ${label} at ${formatClock(currentTime)}...`);
    const anchorTimelineSeconds = options?.anchorTimelineSeconds ?? roundSeconds(currentTime);
    const targetClipId = options?.targetClipId ?? selectedClip?.id;

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          status,
          ...(anchorTimelineSeconds === undefined ? {} : { anchorTimelineSeconds }),
          ...(targetClipId === undefined ? {} : { targetClipId }),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Sync marker failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
    setMediaImportStatus(`${asset.originalName} is ${label} at ${formatClock(anchorTimelineSeconds)}.`);
    } catch (error) {
      console.warn("Could not update imported media sync marker.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not update imported media sync marker.");
    }
  }, [currentTime, episodeSlug, resolvedProjectSlug, selectedClip]);

  const nudgeSyncWizardAnchor = useCallback((deltaSeconds: number) => {
    setSyncWizardAnchorSeconds((value) => {
      setSyncWizardPreviousAnchorSeconds(value);
      return Math.max(0, roundSeconds(value + deltaSeconds));
    });
  }, []);

  const pauseSyncPreview = useCallback(() => {
    syncPreviewSpineRef.current?.pause();
    syncPreviewTargetRef.current?.pause();
    setSyncPreviewState("paused");
    setSyncPreviewMessage("Preview paused. Nudge the anchor if it felt early or late, then try again.");
  }, []);

  const resetSyncPreview = useCallback(() => {
    const spine = syncPreviewSpineRef.current;
    const target = syncPreviewTargetRef.current;
    spine?.pause();
    target?.pause();
    if (spine) spine.currentTime = Math.max(0, roundSeconds(syncWizardAnchorSeconds));
    if (target) target.currentTime = 0;
    setSyncPreviewState("ready");
    setSyncPreviewMessage(`Reset to spine ${formatSyncClock(syncWizardAnchorSeconds)} + target 00:00.000.`);
  }, [syncWizardAnchorSeconds]);

  const previewSyncFromAnchor = useCallback(async () => {
    const spine = syncPreviewSpineRef.current;
    const target = syncPreviewTargetRef.current;

    if (!syncWizardSpineAsset?.playbackUrl || !spine) {
      setSyncPreviewState("error");
      setSyncPreviewMessage("Choose an imported audio spine with a playable URL before previewing.");
      return;
    }

    if (!syncWizardTargetAsset?.playbackUrl || !target) {
      setSyncPreviewState("error");
      setSyncPreviewMessage("Choose a target media file with a playable URL before previewing.");
      return;
    }

    try {
      spine.pause();
      target.pause();
      spine.currentTime = Math.max(0, roundSeconds(syncWizardAnchorSeconds));
      target.currentTime = 0;

      const results = await Promise.allSettled([spine.play(), target.play()]);
      const rejected = results.find((result) => result.status === "rejected");

      if (rejected) {
        const reason = rejected.status === "rejected" && rejected.reason instanceof Error
          ? rejected.reason.message
          : "Browser blocked one of the media players.";
        setSyncPreviewState("error");
        setSyncPreviewMessage(`Could not auto-play both sources: ${reason}. Use the visible media controls, then nudge below.`);
        return;
      }

      setSyncPreviewState("playing");
      setSyncPreviewMessage(
        `Previewing spine at ${formatSyncClock(syncWizardAnchorSeconds)} against target at 00:00.000. If the target feels early or late, use the nudge buttons.`
      );
    } catch (error) {
      console.warn("Sync preview failed.", error);
      setSyncPreviewState("error");
      setSyncPreviewMessage(error instanceof Error ? error.message : "Sync preview failed. Use the native media controls and nudge below.");
    }
  }, [syncWizardAnchorSeconds, syncWizardSpineAsset?.playbackUrl, syncWizardTargetAsset?.playbackUrl]);

  const saveSyncWizardAlignment = useCallback(async () => {
    if (!syncWizardTargetAsset) {
      setMediaImportStatus("Pick a target media file before saving sync.");
      return;
    }
    if (!syncWizardSpineAsset) {
      setMediaImportStatus("Pick an imported audio spine before reviewing sync.");
      return;
    }
    if (!syncReviewEvidenceComplete) {
      setMediaImportStatus("Confirm the waveform, record a later drift check, and approve the reversible placement before saving.");
      return;
    }

    setIsSavingAlignmentReview(true);
    setMediaImportStatus(`Saving the reviewed placement for ${syncWizardTargetAsset.originalName} at ${formatSyncClock(syncWizardAnchorSeconds)}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve-alignment",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          expectedUpdatedAt: productionState?.updatedAt,
          assetId: syncWizardTargetAsset.id,
          spineAssetId: syncWizardSpineAsset.id,
          status: "synced",
          anchorTimelineSeconds: roundSeconds(syncWizardAnchorSeconds),
          targetClipId: selectedClip?.id,
          alignmentReview: {
            waveformCorrelationConfirmed: syncReviewWaveformConfirmed,
            driftReviewConfirmed: syncReviewDriftConfirmed,
            humanApprovalConfirmed: syncReviewHumanApproved,
            driftObservationIntervalSeconds:
              parsedSyncReviewIntervalSeconds,
            residualDriftMilliseconds:
              parsedSyncReviewResidualMilliseconds,
            notes: syncReviewNotes,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Sync save failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setCurrentTime(roundSeconds(syncWizardAnchorSeconds));
      setMediaImportStatus(`${syncWizardTargetAsset.originalName} has a reviewer-bound, reversible placement at ${formatSyncClock(syncWizardAnchorSeconds)}.`);
    } catch (error) {
      console.warn("Could not save guided sync alignment.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not save guided sync alignment.");
    } finally {
      setIsSavingAlignmentReview(false);
    }
  }, [
    episodeSlug,
    parsedSyncReviewIntervalSeconds,
    parsedSyncReviewResidualMilliseconds,
    productionState?.updatedAt,
    resolvedProjectSlug,
    selectedClip,
    syncReviewDriftConfirmed,
    syncReviewEvidenceComplete,
    syncReviewHumanApproved,
    syncReviewNotes,
    syncReviewWaveformConfirmed,
    syncWizardAnchorSeconds,
    syncWizardSpineAsset,
    syncWizardTargetAsset,
  ]);

  const undoLastSyncChange = useCallback(async () => {
    setMediaImportStatus("Undoing last sync change...");

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo-last-sync",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          expectedUpdatedAt: productionState?.updatedAt,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Undo failed with HTTP ${response.status}`);
      }

      const undoAction = payload.undoAction as SyncHistorySnapshot | undefined;
      if (undoAction?.type === "attach-source" && undoAction.beforeClip?.id) {
        updateClipSource(
          undoAction.beforeClip.id,
          undoAction.beforeClip.assetId ?? "",
          undoAction.beforeClip.name,
        );
        setSelectedClipId(undoAction.beforeClip.id);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`Undid ${undoAction?.label || undoAction?.type || "last sync change"}.`);
    } catch (error) {
      console.warn("Could not undo sync change.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not undo sync change.");
    }
  }, [
    episodeSlug,
    productionState?.updatedAt,
    resolvedProjectSlug,
    updateClipSource,
  ]);

  const refreshEpisodeProductionState = useCallback(() => {
    setMediaImportStatus("Refreshing episode production state from the database...");
    setSyncPreviewState("idle");
    setSyncPreviewMessage("DB refresh requested. Pick a spine and target, then preview the current anchor.");
    setTimelineReloadToken((token) => token + 1);
  }, []);

  const holdSyncWizardTarget = useCallback(async () => {
    if (!syncWizardTargetAsset) {
      setMediaImportStatus("Pick a target media file before holding it.");
      return;
    }
    await updateImportedAssetSyncStatus(syncWizardTargetAsset, "held");
  }, [syncWizardTargetAsset, updateImportedAssetSyncStatus]);

  const detachSourceFromSelectedClip = useCallback(async () => {
    if (!selectedClip) {
      setMediaImportStatus("Select a timeline clip before detaching a source.");
      return;
    }

    setMediaImportStatus(`Detaching source from ${selectedClip.name}...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-sync-snapshot",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          snapshot: {
            type: "attach-source",
            assetId: selectedClip.assetId,
            targetClipId: selectedClip.id,
            label: `Detached source from ${selectedClip.name}`,
            beforeClip: {
              id: selectedClip.id,
              assetId: selectedClip.assetId,
              name: selectedClip.name,
            },
            afterClip: {
              id: selectedClip.id,
              assetId: "",
              name: selectedClip.name,
            },
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Detach snapshot failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      updateClipSource(selectedClip.id, "", selectedClip.name);
      setSelectedClipId(selectedClip.id);
      setMediaImportStatus(`Detached source from ${selectedClip.name}. Undo is available.`);
    } catch (error) {
      console.warn("Could not detach source from selected clip.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not detach source from selected clip.");
    }
  }, [episodeSlug, resolvedProjectSlug, selectedClip, updateClipSource]);

  const copySyncDiagnosticJson = useCallback(async () => {
    const diagnostic = {
      copiedAt: new Date().toISOString(),
      route: {
        projectSlug: resolvedProjectSlug,
        episodeSlug,
      },
      production: {
        mode: productionState?.mode ?? "unknown",
        id: productionState?.id ?? null,
        updatedAt: productionState?.updatedAt ?? null,
      },
      syncWizard: {
        spineAssetId: syncWizardSpineAssetId || null,
        spineAssetName: syncWizardSpineAsset?.originalName ?? null,
        targetAssetId: syncWizardTargetAssetId || null,
        targetAssetName: syncWizardTargetAsset?.originalName ?? null,
        anchorSeconds: roundSeconds(syncWizardAnchorSeconds),
        previousAnchorSeconds: syncWizardPreviousAnchorSeconds,
        previewState: syncPreviewState,
        previewMessage: syncPreviewMessage,
      },
      selectedClip: selectedClip
        ? {
          id: selectedClip.id,
          name: selectedClip.name,
          assetId: selectedClip.assetId,
          trackId: selectedClip.trackId,
          startIn: selectedClip.startIn,
          duration: selectedClip.duration,
          sourceStart: selectedClip.sourceStart,
          sourceEnd: selectedClip.sourceEnd,
        }
        : null,
      latestSyncSnapshot,
      importedMediaCount: importedMediaAssets.length,
      timelineClipCount: timelineState.clips.length,
      mediaHealthStats,
    };
    const text = JSON.stringify(diagnostic, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      setMediaImportStatus("Copied sync diagnostic JSON to clipboard.");
    } catch (error) {
      console.warn("Could not copy sync diagnostic JSON.", error);
      setMediaImportStatus(text);
    }
  }, [
    episodeSlug,
    importedMediaAssets.length,
    latestSyncSnapshot,
    mediaHealthStats,
    productionState?.id,
    productionState?.mode,
    productionState?.updatedAt,
    resolvedProjectSlug,
    selectedClip,
    syncPreviewMessage,
    syncPreviewState,
    syncWizardAnchorSeconds,
    syncWizardPreviousAnchorSeconds,
    syncWizardSpineAsset?.originalName,
    syncWizardSpineAssetId,
    syncWizardTargetAsset?.originalName,
    syncWizardTargetAssetId,
    timelineState.clips.length,
  ]);

  const handleAiOrganizeMedia = useCallback(async () => {
    setIsAiOrganizingMedia(true);
    setMediaImportStatus("Asking Gemini to organize this episode media...");

    try {
      const response = await fetch("/api/episode-production/ai-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          importedMedia: importedMediaAssets,
          timelineClips: timelineState.clips,
          transcript: timelineState.transcript,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `AI organize failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      const source = payload.report?.source === "gemini" ? "Gemini" : "local fallback";
      setMediaImportStatus(`${source} organized ${payload.report?.recommendations?.length ?? 0} media recommendation(s).`);
    } catch (error) {
      console.warn("Could not run AI ingest organizer.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not run AI ingest organizer.");
    } finally {
      setIsAiOrganizingMedia(false);
    }
  }, [episodeSlug, importedMediaAssets, resolvedProjectSlug, timelineState.clips, timelineState.transcript]);

  const applyAiIngestRecommendation = useCallback(async (
    recommendation: AiIngestRecommendation,
    asset?: ImportedMediaAsset,
  ) => {
    const targetAsset = asset
      ?? importedMediaAssets.find((candidate) =>
        candidate.id === recommendation.assetId || candidate.sourceId === recommendation.assetId
      );
    if (!targetAsset) {
      setMediaImportStatus(`Could not find imported asset for ${recommendation.assetId}.`);
      return;
    }

    const status = normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus);
    const suggestedTrackId = normalizeSuggestedTrackId(recommendation.suggestedTrackId);
    const anchor = recommendation.suggestedAnchorTimelineSeconds ?? (status === "held" ? undefined : roundSeconds(currentTime));
    const applyKey = `${targetAsset.id}:${recommendation.assetId}`;

    setApplyingAiSuggestionIds((previous) => new Set(previous).add(applyKey));
    setMediaImportStatus(`Applying AI suggestion to ${targetAsset.originalName} (${recommendationApplySummary(recommendation)})...`);

    try {
      const response = await fetch("/api/episode-production/import-media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply-ai-suggestion",
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: targetAsset.id,
          status,
          ...(anchor === undefined ? {} : { anchorTimelineSeconds: anchor }),
          ...(selectedClip?.id ? { targetClipId: selectedClip.id } : {}),
          ...(suggestedTrackId ? { suggestedTrackId } : {}),
          suggestedRole: recommendation.role,
          suggestionReason: recommendation.reason,
          suggestionConfidence: recommendation.confidence,
          suggestionSource: aiIngestReport?.source ?? "ai-ingest",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Apply suggestion failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setSyncWizardTargetAssetId(targetAsset.id);
      if (targetAsset.kind === "audio" || targetAsset.contentType.startsWith("audio/")) {
        setSyncWizardSpineAssetId(targetAsset.id);
      }
      if (anchor !== undefined) {
        setSyncWizardAnchorSeconds(anchor);
      }
      setMediaImportStatus(`Applied suggestion for ${targetAsset.originalName}. No timeline clips were moved.`);
    } catch (error) {
      console.warn("Could not apply AI ingest suggestion.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not apply AI ingest suggestion.");
    } finally {
      setApplyingAiSuggestionIds((previous) => {
        const next = new Set(previous);
        next.delete(applyKey);
        return next;
      });
    }
  }, [aiIngestReport?.source, currentTime, episodeSlug, importedMediaAssets, resolvedProjectSlug, selectedClip]);

  const requestTranscriptAssist = useCallback(async (asset: ImportedMediaAsset) => {
    const assistKey = asset.id;
    setTranscriptAssistingAssetIds((previous) => new Set(previous).add(assistKey));
    setMediaImportStatus(`Asking Gemini for transcript suggestions from ${asset.originalName}...`);

    try {
      const response = await fetch("/api/episode-production/transcript-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Transcript assist failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      const report = payload.report as TranscriptAssistReport | undefined;
      const source = report?.source === "gemini-inline-media" ? "Gemini media" : "metadata fallback";
      setMediaImportStatus(`${source} saved transcript suggestions for ${asset.originalName}. Existing transcript was not replaced.`);
    } catch (error) {
      console.warn("Could not generate transcript assist.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not generate transcript assist.");
    } finally {
      setTranscriptAssistingAssetIds((previous) => {
        const next = new Set(previous);
        next.delete(assistKey);
        return next;
      });
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const operateCollaborationProxy = useCallback(async (asset: ImportedMediaAsset) => {
    const jobKey = `${asset.id}:collaboration-proxy`;
    const updateStatus = (status: EpisodeCollaborationProxyClientStatus) => {
      setCollaborationProxyStatusByAsset((previous) => ({
        ...previous,
        [asset.id]: status,
        [asset.sourceId]: status,
      }));
      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: patchImportedMediaProxy(previous.productionJson, asset, {
            status: status.status === "completed" ? "ready" : status.status,
            proxyUrl: status.proxyUrl,
            proxyAssetId: status.proxyAssetId,
            sourceId: status.proxySourceId,
            variantId: status.variantId,
            jobId: status.jobId,
            completedAt: status.status === "completed" ? status.updatedAt : undefined,
            sourceOriginalPreserved: true,
            immutableObjectEvidence: status.outputEvidence,
            note: "The collaboration proxy is for responsive review; the immutable original remains render truth.",
          }),
        }
        : previous);
    };
    const requestAction = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/episode-production/collaboration-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          sourceId: asset.sourceId,
        }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<EpisodeCollaborationProxyClientStatus>) | null;
      if (!response.ok || !payload?.ok || !payload.status) {
        throw new Error(payload?.error || `Collaboration proxy returned HTTP ${response.status}.`);
      }
      const status = payload as { ok: true } & EpisodeCollaborationProxyClientStatus;
      updateStatus(status);
      return status;
    };

    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Queueing a durable collaboration proxy for ${asset.originalName}...`);
    try {
      let status = await requestAction("queue");
      for (let attempt = 0; attempt < 150 && status.status !== "completed"; attempt += 1) {
        if (status.status === "failed" || status.status === "blocked") {
          throw new Error(status.error || `Collaboration proxy ${status.status}.`);
        }
        setMediaImportStatus(
          status.status === "output-ready"
            ? `Verifying and registering ${asset.originalName}...`
            : `Building collaboration proxy for ${asset.originalName}; the original remains untouched...`,
        );
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        status = await requestAction("reconcile");
      }
      if (status.status !== "completed" || !status.proxyUrl) {
        throw new Error("Collaboration proxy is still processing. It can be resumed safely from this card.");
      }
      setEpisodeMediaTruthRefreshToken((token) => token + 1);
      setMediaImportStatus(`Collaboration proxy ready for ${asset.originalName}. Preview uses it; exports keep the immutable original.`);
    } catch (error) {
      console.warn("Could not complete collaboration proxy.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not complete collaboration proxy.");
    } finally {
      setQueueingMediaJobKeys((previous) => {
        const next = new Set(previous);
        next.delete(jobKey);
        return next;
      });
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const operateAudioSignalProfile = useCallback(async (asset: ImportedMediaAsset, options?: { quiet?: boolean }) => {
    const jobKey = `${asset.id}:audio-signal-profile`;
    const updateStatus = (status: AudioSignalProfileClientStatus) => setAudioSignalProfileStatusByAsset((previous) => ({ ...previous, [asset.id]: status, [asset.sourceId]: status }));
    const requestAction = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/media-vault/audio-signal-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectSlug: resolvedProjectSlug, assetId: asset.id, sourceId: asset.sourceId }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioSignalProfileClientStatus>) | null;
      if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || `Audio signal profiling returned HTTP ${response.status}.`);
      const status = payload as { ok: true } & AudioSignalProfileClientStatus;
      updateStatus(status);
      return status;
    };
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    if (!options?.quiet) setMediaImportStatus(`Building complete-decode waveform evidence for ${asset.originalName}...`);
    try {
      let status = await requestAction("queue");
      for (let attempt = 0; attempt < 300 && status.status !== "completed"; attempt += 1) {
        if (status.status === "failed") throw new Error(status.error || "Audio signal profiling failed.");
        if (!options?.quiet) setMediaImportStatus(status.status === "output-ready" ? `Verifying the immutable source receipt for ${asset.originalName}...` : `Decoding ${asset.originalName} into bounded signal windows; the source remains untouched...`);
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        status = await requestAction("reconcile");
      }
      if (status.status !== "completed" || !status.audioSignal) throw new Error("Audio signal profiling is still processing. It can be resumed safely.");
      if (!options?.quiet) setMediaImportStatus(`Verified source-bound waveform ready for ${asset.originalName}. Sync and audio QA now share the same evidence.`);
    } catch (error) {
      console.warn("Could not complete audio signal profiling.", error);
      const message = error instanceof Error ? error.message : "Could not complete audio signal profiling.";
      setAudioSignalProfileStatusByAsset((previous) => {
        const existing = previous[asset.id] ?? previous[asset.sourceId];
        const failed: AudioSignalProfileClientStatus = {
          jobId: existing?.jobId ?? null,
          status: "failed",
          media: existing?.media ?? null,
          audioSignal: existing?.audioSignal ?? null,
          analyzer: existing?.analyzer ?? null,
          error: message,
          updatedAt: new Date().toISOString(),
          boundaries: { originalRemainsSourceTruth: true, analysisDoesNotChangeMedia: true, observationsRequireHumanInterpretation: true },
        };
        return { ...previous, [asset.id]: failed, [asset.sourceId]: failed };
      });
      if (!options?.quiet) setMediaImportStatus(message);
    } finally {
      setQueueingMediaJobKeys((previous) => { const next = new Set(previous); next.delete(jobKey); return next; });
    }
  }, [resolvedProjectSlug]);

  const operateSourceTranscript = useCallback(async (asset: ImportedMediaAsset) => {
    const jobKey = `${asset.id}:source-transcript`;
    const referenceRoles = new Set(["reference-clip", "b-roll", "source-clip", "youtube-source-clip"]);
    const isReference = referenceRoles.has(String(asset.importRole || "episode-media").toLowerCase());
    const authorizationKind = isReference ? "licensed-or-permitted-source" : "participant-consent-confirmed";
    const authorizationCopy = isReference
      ? `Transcribe ${asset.originalName}?\n\nConfirm that Quipsly is licensed or otherwise permitted to transcribe this reference material for episode production and review. This does not publish or edit the source.`
      : `Transcribe ${asset.originalName}?\n\nConfirm that the recorded participants consented to transcription for this episode. Quipsly will retain immutable timed provider evidence and will not create tasks, goals, edits, or publications.`;
    if (!window.confirm(authorizationCopy)) {
      setMediaImportStatus("Transcription was not queued because authorization was not confirmed.");
      return;
    }
    const updateStatus = (status: StudioSourceTranscriptClientStatus) => setSourceTranscriptStatusByAsset((previous) => ({ ...previous, [asset.id]: status, [asset.sourceId]: status }));
    const requestAction = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/media-vault/source-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          sourceId: asset.sourceId,
          ...(action === "queue" ? { authorizationKind, authorizationAccepted: true, language: "en" } : {}),
        }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<StudioSourceTranscriptClientStatus>) | null;
      if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || `Source transcription returned HTTP ${response.status}.`);
      const status = payload as { ok: true } & StudioSourceTranscriptClientStatus;
      updateStatus(status);
      return status;
    };
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Queueing immutable timed transcription for ${asset.originalName}...`);
    try {
      let status = await requestAction("queue");
      for (let attempt = 0; attempt < 900 && status.status !== "completed"; attempt += 1) {
        if (status.status === "failed") throw new Error(status.error || "Source transcription failed.");
        setMediaImportStatus(status.status === "output-ready"
          ? `Re-hashing ${asset.originalName} and registering immutable timed words...`
          : `Transcribing ${asset.originalName}; original media remains untouched...`);
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        status = await requestAction("reconcile");
      }
      if (status.status !== "completed") throw new Error("Source transcription is still processing. It can be resumed safely from this media card.");
      setEpisodeMediaTruthRefreshToken((token) => token + 1);
      setMediaImportStatus(`Canonical timed transcript ready for ${asset.originalName}. Confidence remains provider evidence, not measured accuracy.`);
    } catch (error) {
      console.warn("Could not complete source transcription.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not complete source transcription.");
    } finally {
      setQueueingMediaJobKeys((previous) => { const next = new Set(previous); next.delete(jobKey); return next; });
    }
  }, [episodeSlug, resolvedProjectSlug]);

  useEffect(() => {
    const selected = [syncWizardSpineAsset, syncWizardTargetAsset].filter((asset): asset is ImportedMediaAsset => Boolean(asset));
    for (const asset of selected) {
      const status = audioSignalProfileStatusByAsset[asset.id] ?? audioSignalProfileStatusByAsset[asset.sourceId];
      if (status?.status === "completed" || status?.status === "failed") continue;
      const key = `${resolvedProjectSlug}:${asset.id}`;
      if (audioSignalProfileAutoStartedRef.current.has(key)) continue;
      audioSignalProfileAutoStartedRef.current.add(key);
      void operateAudioSignalProfile(asset, { quiet: true });
    }
  }, [audioSignalProfileStatusByAsset, operateAudioSignalProfile, resolvedProjectSlug, syncWizardSpineAsset, syncWizardTargetAsset]);

  const operateAudioMastery = useCallback(async (asset: ImportedMediaAsset) => {
    const jobKey = `${asset.id}:audio-mastery`;
    const updateStatus = (status: AudioMasteryClientStatus) => {
      setAudioMasteryStatusByAsset((previous) => ({
        ...previous,
        [asset.id]: status,
        [asset.sourceId]: status,
      }));
    };
    const requestAction = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/media-vault/audio-mastery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          projectSlug: resolvedProjectSlug,
          assetId: asset.id,
          sourceId: asset.sourceId,
          profileId: "apple-podcasts-dialogue-v1",
        }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioMasteryClientStatus>) | null;
      if (!response.ok || !payload?.ok || !payload.status) {
        throw new Error(payload?.error || `Audio mastery returned HTTP ${response.status}.`);
      }
      const status = payload as { ok: true } & AudioMasteryClientStatus;
      updateStatus(status);
      return status;
    };
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Measuring ${asset.originalName} against the Apple podcast dialogue profile...`);
    try {
      let status = await requestAction("queue");
      for (let attempt = 0; attempt < 300 && status.status !== "completed"; attempt += 1) {
        if (status.status === "failed") throw new Error(status.error || "Audio mastery failed.");
        setMediaImportStatus(
          status.status === "output-ready"
            ? `Independently verifying and registering the mastered preview for ${asset.originalName}...`
            : `Decoding and measuring ${asset.originalName}; the original remains untouched...`,
        );
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        status = await requestAction("reconcile");
      }
      if (status.status !== "completed") throw new Error("Audio mastery is still processing. Resume it safely from this media card.");
      setEpisodeMediaTruthRefreshToken((token) => token + 1);
      setMediaImportStatus(
        status.derivative
          ? `Verified mastered preview ready for ${asset.originalName}. Explicit approval is still required before promotion.`
          : `${asset.originalName} already meets the selected loudness profile; no derivative was created.`,
      );
    } catch (error) {
      console.warn("Could not complete audio mastery.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not complete audio mastery.");
    } finally {
      setQueueingMediaJobKeys((previous) => {
        const next = new Set(previous);
        next.delete(jobKey);
        return next;
      });
    }
  }, [resolvedProjectSlug]);

  const operateAudioMasteryReview = useCallback(async (
    asset: ImportedMediaAsset,
    decision: "approved" | "rejected",
    playbackEvidence: AudioMasteryPlaybackReviewEvidence,
    note: string | null,
  ) => {
    const current = audioMasteryStatusByAsset[asset.id] ?? audioMasteryStatusByAsset[asset.sourceId];
    if (!current?.jobId) throw new Error("The verified mastering job is unavailable. Refresh before reviewing it.");
    const jobKey = `${asset.id}:audio-mastery-review`;
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    try {
      const response = await fetch("/api/media-vault/audio-mastery/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          assetId: asset.id,
          sourceId: asset.sourceId,
          jobId: current.jobId,
          clientRequestId: crypto.randomUUID(),
          decision,
          playbackEvidence,
          note,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; review?: AudioMasteryClientStatus["review"] } | null;
      if (!response.ok || !payload?.ok || !payload.review) throw new Error(payload?.error || `Mastering review returned HTTP ${response.status}.`);
      setAudioMasteryStatusByAsset((previous) => {
        const existing = previous[asset.id] ?? previous[asset.sourceId] ?? current;
        const next = { ...existing, review: payload.review! };
        return { ...previous, [asset.id]: next, [asset.sourceId]: next };
      });
      setMediaImportStatus(`${decision === "approved" ? "Approved" : "Rejected"} the verified mastering preview as heard. Promotion remains a separate operation.`);
    } finally {
      setQueueingMediaJobKeys((previous) => { const next = new Set(previous); next.delete(jobKey); return next; });
    }
  }, [audioMasteryStatusByAsset, resolvedProjectSlug]);

  const operateAudioTreatment = useCallback(async (asset: ImportedMediaAsset) => {
    const jobKey = `${asset.id}:audio-treatment`;
    const updateStatus = (status: AudioTreatmentClientStatus) => setAudioTreatmentStatusByAsset((previous) => ({ ...previous, [asset.id]: status, [asset.sourceId]: status }));
    const requestAction = async (action: "queue" | "reconcile") => {
      const response = await fetch("/api/media-vault/audio-treatment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectSlug: resolvedProjectSlug, assetId: asset.id, sourceId: asset.sourceId }),
      });
      const payload = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<AudioTreatmentClientStatus>) | null;
      if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || `Audio treatment returned HTTP ${response.status}.`);
      const status = payload as { ok: true } & AudioTreatmentClientStatus;
      updateStatus(status);
      return status;
    };
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Preparing a source-bound DC and rumble treatment experiment for ${asset.originalName}...`);
    try {
      let status = await requestAction("queue");
      for (let attempt = 0; attempt < 300 && status.status !== "completed"; attempt += 1) {
        if (status.status === "failed") throw new Error(status.error || "Audio treatment failed.");
        setMediaImportStatus(status.status === "output-ready" ? `Verifying and registering the treatment experiment for ${asset.originalName}...` : `Rendering and independently diagnosing ${asset.originalName}; the original remains untouched...`);
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        status = await requestAction("reconcile");
      }
      if (status.status !== "completed") throw new Error("Audio treatment is still processing. Resume it safely from this media card.");
      setEpisodeMediaTruthRefreshToken((token) => token + 1);
      setMediaImportStatus(`Verified treatment experiment ready for ${asset.originalName}. Listen in matched-level A/B before any approval.`);
    } catch (error) {
      console.warn("Could not complete audio treatment.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not complete audio treatment.");
    } finally {
      setQueueingMediaJobKeys((previous) => { const next = new Set(previous); next.delete(jobKey); return next; });
    }
  }, [resolvedProjectSlug]);

  const queueMediaAnalysisJob = useCallback(async (asset: ImportedMediaAsset, type: MediaAnalysisJobType) => {
    if (type === "proxy-needed") {
      await operateCollaborationProxy(asset);
      return;
    }
    if (type === "transcript") {
      await operateSourceTranscript(asset);
      return;
    }
    const jobKey = `${asset.id}:${type}`;
    setQueueingMediaJobKeys((previous) => new Set(previous).add(jobKey));
    setMediaImportStatus(`Saving ${mediaAnalysisJobLabel(type).toLowerCase()} job for ${asset.originalName}...`);

    const simpleResult =
      type === "file-triage"
        ? {
          originalName: asset.originalName,
          kind: asset.kind,
          contentType: asset.contentType,
          size: asset.size,
          importRole: asset.importRole ?? null,
          suggestedStatus: asset.kind === "unknown" ? "held" : "ready-to-sync",
        }
        : {
          currentSyncStatus: asset.sync?.status ?? "ready-to-sync",
          anchorTimelineSeconds: asset.sync?.anchorTimelineSeconds ?? null,
          suggestedTrackId: asset.sync?.suggestedTrackId ?? importedAssetTrackId(asset),
          note: "Queued for deeper sync analysis. Current result is metadata-only.",
        };

    const status: MediaAnalysisJobStatus = "completed";

    try {
      const response = await fetch("/api/episode-production/media-analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug: resolvedProjectSlug,
          episodeSlug,
          assetId: asset.id,
          type,
          status,
          result: simpleResult,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Media job failed with HTTP ${response.status}`);
      }

      setProductionState((previous) => previous
        ? {
          ...previous,
          productionJson: payload.productionJson ?? previous.productionJson,
          updatedAt: payload.updatedAt ?? previous.updatedAt,
        }
        : previous);
      setMediaImportStatus(`${mediaAnalysisJobLabel(type)} job saved for ${asset.originalName}.`);
    } catch (error) {
      console.warn("Could not save media analysis job.", error);
      setMediaImportStatus(error instanceof Error ? error.message : "Could not save media analysis job.");
    } finally {
      setQueueingMediaJobKeys((previous) => {
        const next = new Set(previous);
        next.delete(jobKey);
        return next;
      });
    }
  }, [episodeSlug, operateCollaborationProxy, operateSourceTranscript, resolvedProjectSlug]);

  const addEditorCoPilotLog = useCallback((entry: Omit<EditorCoPilotLogEntry, "id">) => {
    const id = makeId("copilot");
    setEditorCoPilotLog((previous) => [
      {
        id,
        ...entry,
      },
      ...previous,
    ].slice(0, EDITOR_CO_PILOT_MAX_LOG));
    return id;
  }, []);

  const addEditorCoPilotMessage = useCallback((entry: Omit<EditorCoPilotMessage, "id">) => {
    const id = makeId("copilot-msg");
    setEditorCoPilotMessages((previous) => [
      {
        id,
        ...entry,
      },
      ...previous,
    ].slice(0, EDITOR_CO_PILOT_MAX_MESSAGES));
    return id;
  }, []);

  const updateEditorCoPilotLog = useCallback((id: string, patch: Partial<EditorCoPilotLogEntry>) => {
    setEditorCoPilotLog((previous) => previous.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }, []);

  const runEditorCoPilotCommand = useCallback(async (commandTextOverride?: string) => {
    const commandText = (commandTextOverride ?? editorCoPilotInput).trim();
    if (!commandText || isEditorCoPilotBusy) {
      return;
    }

    setEditorCoPilotInput((current) => {
      if (!commandTextOverride) return "";
      return current;
    });

    const parsed = parseCoPilotCommand(commandText);

    addEditorCoPilotMessage({
      at: new Date().toISOString(),
      role: "user",
      command: commandText,
      text: commandText,
    });

    const logId = addEditorCoPilotLog({
      at: new Date().toISOString(),
      command: commandText,
      result: "Queued.",
      status: "queued",
      reversible: false,
      revert: { kind: "none" },
    });

    setEditorCoPilotInput("");
    setIsEditorCoPilotBusy(true);
    updateEditorCoPilotLog(logId, {
      status: "running",
      result: "Running command…",
    });

    const markFailed = (message: string) => {
      updateEditorCoPilotLog(logId, { status: "error", result: message, reversible: false });
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: message,
        logId,
      });
      setMediaImportStatus(message);
      setIsEditorCoPilotBusy(false);
      return Promise.resolve();
    };

    const markSuccess = (result: string, revert: EditorCoPilotRevertPayload, changeSummary?: string[]) => {
      const summary = (changeSummary ?? []).filter(Boolean);
      updateEditorCoPilotLog(logId, {
        status: "success",
        result,
        changeSummary: summary.length ? summary.join(" | ") : undefined,
        reversible: revert.kind !== "none",
        revert,
      });
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: summary.length ? `${result}\n${summary.join("\n")}` : result,
        logId,
      });
      setMediaImportStatus(result);
    };

    try {
      switch (parsed.parsed.type) {
      case "help": {
        const helpText = `Co-pilot commands: ${EDITOR_CO_PILOT_COMMANDS.join(" | ")}`;
        markSuccess(helpText, { kind: "none" });
        setMediaImportStatus("Co-pilot help shown.");
        break;
      }
      case "source-url": {
        if (!parsed.parsed.sourceUrl) return markFailed("No source URL detected for import.");
        await registerSourceClipUrl({
          sourceUrl: parsed.parsed.sourceUrl,
          sourceTitle: parsed.parsed.sourceTitle,
        });
        markSuccess(`Registered source: ${parsed.parsed.sourceUrl}`, { kind: "none" });
        break;
      }
      case "add-to-timeline": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to add.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const clip = addImportedAssetToTimeline(asset);
        if (!clip) return markFailed("Could not add asset to timeline.");
        markSuccess(`Added ${asset.originalName} to timeline.`, {
          kind: "delete-timeline-clip",
          clip: { ...clip },
        }, [
          `Created clip ${clip.id} (${clip.name})`,
          `Track: ${clip.trackId}`,
          `Placement: ${formatClock(clip.startIn)} → ${formatClock(clip.startIn + clip.duration)} (${formatClock(clip.duration)})`,
        ]);
        break;
      }
      case "attach-to-selected": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to attach.");
        if (!selectedClip) return markFailed("Select a timeline clip first before attaching a source.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const previousClipSource = selectedClip.assetId;
        const previousClipSourceLabel = previousClipSource
          ? findAssetByReference(previousClipSource, importedMediaAssets)?.originalName ?? "unassigned source"
          : "unassigned source";
        const previousClipName = selectedClip.name;
        await attachImportedAssetToSelectedClip(asset);
        markSuccess(`Attached ${asset.originalName} to ${selectedClip.name}.`, {
          kind: "restore-clip-source",
          clipId: selectedClip.id,
          clipSourceAssetId: previousClipSource,
          clip: {
            ...selectedClip,
            assetId: previousClipSource,
            name: previousClipName,
          },
        }, [
          `Clip: ${selectedClip.name}`,
          `Source changed from ${previousClipSourceLabel} → ${asset.originalName}`,
        ]);
        break;
      }
      case "set-sync-status": {
        if (!parsed.parsed.assetRef || !parsed.parsed.status) return markFailed("Tell me which asset to mark and what status.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        if (parsed.parsed.status === "synced") {
          setSyncWizardTargetAssetId(asset.id);
          setMediaImportStatus(`Selected ${asset.originalName} for reviewed alignment.`);
          document
            .getElementById("guided-sync-wizard")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          markSuccess(`Opened Guided sync for ${asset.originalName}. No sync claim was saved.`, { kind: "none" }, [
            "A synced claim requires waveform, later-take drift, and human approval evidence.",
          ]);
          break;
        }
        if (asset.sync?.status === "synced") {
          return markFailed("This source has a reviewed alignment. Undo that recorded sync decision before changing its status.");
        }
        const previousStatus = asset.sync?.status === "held" ? "held" : "ready-to-sync";
        const previousAnchor = asset.sync?.anchorTimelineSeconds ?? null;
        const previousTargetClipId = asset.sync?.targetClipId ?? null;
        await updateImportedAssetSyncStatus(asset, parsed.parsed.status);
        markSuccess(`Marked ${asset.originalName} as ${parsed.parsed.status}.`, {
          kind: "restore-sync-status",
          assetId: asset.id,
          previousSyncStatus: previousStatus,
          previousSyncAnchorTimelineSeconds: previousAnchor,
          previousSyncTargetClipId: previousTargetClipId,
        }, [
          `Asset: ${asset.originalName}`,
          `Status: ${previousStatus} → ${parsed.parsed.status}`,
          `Target clip: ${previousTargetClipId ?? "none"}`,
        ]);
        break;
      }
      case "set-spine-audio": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to make spine audio.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        const before = persistedSpineAudio;
        const beforeLabel = before?.assetId
          ? findAssetByReference(before.assetId, importedMediaAssets)?.originalName ?? before.label
          : before?.clipId
            ? timelineState.clips.find((candidate) => candidate.id === before.clipId)?.name ?? before.label
            : before?.label ?? "none";
        await setEpisodeSpineAudio({ asset });
        markSuccess(`Set spine audio to ${asset.originalName}.`, {
          kind: before ? "restore-spine" : "none",
          spineAudioAssetId: before?.assetId ?? null,
          spineAudioClipId: before?.clipId ?? null,
          spineAudioSource: before?.source ?? null,
          spineAudioLabel: before?.label ?? null,
        }, [
          `Spine changed: ${beforeLabel} → ${asset.originalName}`,
        ]);
        break;
      }
      case "undo-last-change": {
        await undoLastSyncChange();
        markSuccess("Undo request sent to server snapshot history.", { kind: "undo-sync" });
        break;
      }
      case "save-timeline": {
        await handleSaveEpisodeTimeline();
        markSuccess("Timeline saved.", { kind: "none" });
        break;
      }
      case "refresh-state": {
        refreshEpisodeProductionState();
        markSuccess("Production DB state requested refresh.", { kind: "none" });
        break;
      }
      case "organize": {
        await handleAiOrganizeMedia();
        markSuccess("Media organize completed.", { kind: "none" });
        break;
      }
      case "apply-suggestion": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which recommendation to apply.");
        const recommendation = aiIngestRecommendationsByAsset.get(parsed.parsed.assetRef);
        const fallbackRecommendation = aiIngestReport?.recommendations.find((candidate) =>
          candidate.assetId.toLowerCase() === parsed.parsed.assetRef?.toLowerCase()
          || candidate.assetId.toLowerCase().includes(parsed.parsed.assetRef?.toLowerCase() ?? "")
        );
        const toApply = recommendation ?? fallbackRecommendation;
        if (!toApply) {
          return markFailed(`No AI suggestion found for "${parsed.parsed.assetRef}".`);
        }
        const asset = findAssetByReference(toApply.assetId, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset for suggestion "${parsed.parsed.assetRef}".`);
        await applyAiIngestRecommendation(toApply, asset);
        markSuccess(`Applied suggestion to ${asset.originalName}.`, { kind: "none" }, [
          `Suggestion action: ${toApply.suggestedAction}`,
          `Target status: ${toApply.suggestedSyncStatus}`,
          `Target track: ${toApply.suggestedTrackId}`,
        ]);
        break;
      }
      case "transcript-assist": {
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to request transcript suggestions for.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        await requestTranscriptAssist(asset);
        markSuccess(`Generated transcript suggestions for ${asset.originalName}.`, { kind: "none" });
        break;
      }
      case "queue-job": {
        if (!parsed.parsed.jobType) return markFailed("Tell me which analysis job to queue.");
        if (!parsed.parsed.assetRef) return markFailed("Tell me which asset to queue job for.");
        const asset = findAssetByReference(parsed.parsed.assetRef, importedMediaAssets);
        if (!asset) return markFailed(`Could not find imported asset "${parsed.parsed.assetRef}".`);
        await queueMediaAnalysisJob(asset, parsed.parsed.jobType);
        markSuccess(`Queued ${mediaAnalysisJobLabel(parsed.parsed.jobType)} for ${asset.originalName}.`, { kind: "none" }, [
          `Job: ${parsed.parsed.jobType}`,
        ]);
        break;
      }
      case "set-playhead": {
        if (parsed.parsed.playheadSeconds === undefined) return markFailed("Tell me when to set the playhead.");
        setCurrentTime(parsed.parsed.playheadSeconds);
        markSuccess(`Playhead moved to ${formatClock(parsed.parsed.playheadSeconds)}.`, { kind: "none" });
        break;
      }
      case "n/a":
      default:
        markSuccess(`I didn't recognize "${commandText}". Try "help".`, { kind: "none" });
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Co-pilot command failed.";
      updateEditorCoPilotLog(logId, {
        status: "error",
        result: message,
        reversible: false,
      });
      setMediaImportStatus(message);
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: message,
        logId,
      });
    } finally {
      setIsEditorCoPilotBusy(false);
    }
  }, [
    addEditorCoPilotLog,
    applyAiIngestRecommendation,
    aiIngestRecommendationsByAsset,
    aiIngestReport?.recommendations,
    formatClock,
    handleAiOrganizeMedia,
    addImportedAssetToTimeline,
    attachImportedAssetToSelectedClip,
    mediaAnalysisJobLabel,
    requestTranscriptAssist,
    persistedSpineAudio,
    queueMediaAnalysisJob,
    registerSourceClipUrl,
    selectedClip,
    timelineState.clips,
    editorCoPilotInput,
    isEditorCoPilotBusy,
    setCurrentTime,
    setEpisodeSpineAudio,
    undoLastSyncChange,
    updateImportedAssetSyncStatus,
    importedMediaAssets,
    refreshEpisodeProductionState,
    handleSaveEpisodeTimeline,
    addEditorCoPilotMessage,
  ]);

  const revertEditorCoPilotAction = useCallback(async (entry: EditorCoPilotLogEntry) => {
    if (entry.status !== "success" || !entry.reversible) return;
    if (entry.revert.kind === "none" || entry.revert.kind === "undo-sync") return;

    const revertId = entry.id;
    const changeSummaryText = entry.changeSummary;
    updateEditorCoPilotLog(revertId, {
      status: "running",
      result: "Reverting...",
    });

    try {
      switch (entry.revert.kind) {
      case "delete-timeline-clip": {
        const clip = entry.revert.clip;
        if (!clip) {
          throw new Error("No clip snapshot is available to restore.");
        }
        const hasExisting = timelineState.clips.some((candidate) => candidate.id === clip.id);
        if (hasExisting) {
          deleteClip(clip.id);
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: `Removed "${clip.name}" from the timeline.`,
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back added timeline clip.",
            logId: revertId,
          });
          break;
        }
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: "Clip was already gone. Rollback marked complete.",
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: "Rollback complete: the added clip was already removed.",
          logId: revertId,
        });
        break;
      }
      case "restore-clip-source": {
        const clipId = entry.revert.clipId;
        if (!clipId) {
          throw new Error("No clip exists to restore source for.");
        }
        updateClipSource(clipId, entry.revert.clipSourceAssetId ?? "", entry.revert.clip?.name);
        setSelectedClipId(clipId);
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: "Restored previous clip source.",
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back clip source.",
          logId: revertId,
        });
        break;
      }
      case "restore-sync-status": {
        const assetId = entry.revert.assetId;
        if (!assetId) {
          throw new Error("No target asset found for sync rollback.");
        }
        const targetAsset = findAssetByReference(assetId, importedMediaAssets);
        if (!targetAsset) {
          throw new Error(`Could not find ${assetId} in imported assets.`);
        }
        await updateImportedAssetSyncStatus(
          targetAsset,
          entry.revert.previousSyncStatus ?? "ready-to-sync",
          {
            anchorTimelineSeconds: entry.revert.previousSyncAnchorTimelineSeconds ?? undefined,
            targetClipId: entry.revert.previousSyncTargetClipId,
          },
        );
        updateEditorCoPilotLog(revertId, {
          status: "rolled-back",
          result: "Restored previous media sync status.",
        });
        addEditorCoPilotMessage({
          at: new Date().toISOString(),
          role: "agent",
          text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : "Rolled back media sync status.",
          logId: revertId,
        });
        break;
      }
      case "restore-spine": {
        if (entry.revert.spineAudioAssetId) {
          const spineAsset = findAssetByReference(entry.revert.spineAudioAssetId, importedMediaAssets)
            ?? importedMediaAssets.find((candidate) => candidate.sourceId === entry.revert.spineAudioAssetId);
          if (!spineAsset) {
            throw new Error("Could not find prior spine asset.");
          }
          await setEpisodeSpineAudio({ asset: spineAsset });
          setSyncWizardSpineAssetId(spineAsset.id);
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: `Restored previous spine: ${spineAsset.originalName}.`,
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : `Rolled back spine to ${spineAsset.originalName}.`,
            logId: revertId,
          });
          break;
        }
        if (entry.revert.spineAudioClipId) {
          const spineClip = timelineState.clips.find((candidate) => candidate.id === entry.revert.spineAudioClipId);
          if (!spineClip) {
            throw new Error("Could not find prior spine clip.");
          }
          await setEpisodeSpineAudio({ clip: spineClip });
          updateEditorCoPilotLog(revertId, {
            status: "rolled-back",
            result: `Restored previous spine clip: ${spineClip.name}.`,
          });
          addEditorCoPilotMessage({
            at: new Date().toISOString(),
            role: "agent",
            text: changeSummaryText ? `Rolled back. ${changeSummaryText}` : `Rolled back spine to ${spineClip.name}.`,
            logId: revertId,
          });
          break;
        }
        throw new Error("No prior spine audio target found to restore.");
      }
      default:
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not rollback co-pilot action.";
      updateEditorCoPilotLog(revertId, {
        status: "error",
        result: message,
      });
      setMediaImportStatus(message);
      addEditorCoPilotMessage({
        at: new Date().toISOString(),
        role: "agent",
        text: `Rollback failed: ${message}`,
        logId: revertId,
      });
    }
  }, [
    addClip,
    deleteClip,
    setSyncWizardSpineAssetId,
    importedMediaAssets,
    timelineState.clips,
    updateClipSource,
    updateEditorCoPilotLog,
    setEpisodeSpineAudio,
    setSelectedClipId,
    setMediaImportStatus,
    updateImportedAssetSyncStatus,
    addEditorCoPilotMessage,
  ]);

  // Calculate total duration in frames (30fps)
  const totalDuration = Math.max(
    1,
    timelineState.clips.reduce((acc, clip) => Math.max(acc, clip.startIn + clip.duration), 0),
    timelineState.transcript.reduce((acc, block) => Math.max(acc, block.time + block.duration), 0),
  );
  const projectedSkippedDuration = deactivatedTimelineIntervals(timelineState)
    .reduce((total, interval) => total + interval.endSeconds - interval.startSeconds, 0);
  const renderedDurationSeconds = timelineState.editorMode === "play-all"
    ? totalDuration
    : Math.max(1 / 30, totalDuration - projectedSkippedDuration);
  const durationInFrames = Math.max(1, Math.round(renderedDurationSeconds * 30));
  const playbackMode = timelineState.editorMode === "play-all" ? "play-all" : "play-edit";
  const playbackCockpitStats = useMemo(() => {
    const sourceClips = timelineState.clips.filter(isVisualTimelineClip);
    const activeTimelineClips = timelineState.clips.filter((clip) => !clip.deactivated);
    const deactivatedTimelineClips = timelineState.clips.filter((clip) => clip.deactivated);
    const skippedTranscriptBlocks = timelineState.transcript.filter((block) => block.deleted || block.deactivated);
    const skippedIntervals = deactivatedTimelineIntervals(timelineState);
    const skippedDuration = skippedIntervals.reduce((total, interval) => total + interval.endSeconds - interval.startSeconds, 0);
    const activeEditDuration = Math.max(0, totalDuration - skippedDuration);
    const activeTranscriptBlocks = timelineState.transcript.filter((block) => !block.deleted && !block.deactivated);

    return {
      sourceClipCount: sourceClips.length,
      activeClipCount: activeTimelineClips.length,
      deactivatedClipCount: deactivatedTimelineClips.length,
      skippedTranscriptBlockCount: skippedTranscriptBlocks.length,
      skippedRangeEditCount: timelineState.deactivatedRanges?.length ?? 0,
      skippedSectionCount: skippedIntervals.length,
      skippedDuration,
      activeEditDuration,
      activeTranscriptBlocks,
    };
  }, [timelineState, totalDuration]);
  const deactivatedRangeEdits = useMemo(
    () => [...(timelineState.deactivatedRanges ?? [])].sort((left, right) => left.startSeconds - right.startSeconds),
    [timelineState.deactivatedRanges],
  );
  const proofListenPersistedRange = useCallback(async (range: TimelineRangeEdit) => {
    const start = Math.max(0, range.startSeconds - 1.5);
    const end = Math.min(totalDuration, range.startSeconds + range.durationSeconds + 1.5);
    setEditorMode("play-all");
    setCurrentTime(start);
    setAiProofWatchEndSeconds(Math.max(start + 0.1, end));
    setIsPreviewPlaying(true);
    setAiEditMessage(`Proof-listening to untouched source from ${formatClock(start)} to ${formatClock(end)}. The saved range decision remains active while its review receipt is saved.`);
    const receipt = await recordEditReviewAction({
      action: "PROOF_LISTENED",
      subjectId: range.proposalId ?? range.id,
      subjectKind: range.proposalId ? "proposal" : "range",
      sourceRange: { startSeconds: range.startSeconds, endSeconds: range.startSeconds + range.durationSeconds },
      proposalSetId: range.proposalSetId,
      proposalTimelineFingerprintSha256: range.proposalTimelineFingerprintSha256,
      evidence: { persistedRangeId: range.id, decisionSource: range.source },
    });
    setAiEditMessage(`Proof-listening to untouched source from ${formatClock(start)} to ${formatClock(end)}. The saved range decision remains active until you restore it.${receipt ? " Review receipt saved." : " This legacy or temporarily unavailable receipt is flagged separately."}`);
  }, [recordEditReviewAction, setEditorMode, totalDuration]);
  const restorePersistedRange = useCallback(async (range: TimelineRangeEdit) => {
    if (range.proposalSetId && range.proposalTimelineFingerprintSha256) {
      const receipt = await recordEditReviewAction({
        action: "RESTORED_TO_DRAFT",
        subjectId: range.proposalId ?? range.id,
        subjectKind: range.proposalId ? "proposal" : "range",
        sourceRange: { startSeconds: range.startSeconds, endSeconds: range.startSeconds + range.durationSeconds },
        proposalSetId: range.proposalSetId,
        proposalTimelineFingerprintSha256: range.proposalTimelineFingerprintSha256,
        evidence: { persistedRangeId: range.id, decisionSource: range.source },
      });
      if (!receipt) {
        setAiEditMessage("The range was not restored because its durable draft-action receipt could not be saved.");
        return;
      }
    } else {
      setEditReviewLedgerNotice("This older range predates durable proposal-set receipts. Its restore remains reversible and will become canonical only after save.");
    }
    removeDeactivatedRange(range.id);
    setAiEditMessage(`Restored ${formatClock(range.startSeconds)}–${formatClock(range.startSeconds + range.durationSeconds)} to the active edit. Source media was unchanged; save the timeline to persist this decision.`);
  }, [recordEditReviewAction, removeDeactivatedRange]);
  const startPlaybackMode = useCallback((mode: "play-all" | "play-edit") => {
    setEditorMode(mode);
    setCurrentTime((time) => time >= totalDuration - 0.05 ? 0 : time);
    setIsPreviewPlaying(true);
  }, [setEditorMode, totalDuration]);
  const pausePlayback = useCallback(() => {
    setIsPreviewPlaying(false);
  }, []);
  useEffect(() => {
    if (aiProofWatchEndSeconds === null || currentTime < aiProofWatchEndSeconds) return;
    setIsPreviewPlaying(false);
    setAiProofWatchEndSeconds(null);
    setAiEditMessage("Source proof-watch complete. The proposal is still unapplied.");
  }, [aiProofWatchEndSeconds, currentTime]);
  const seekActiveEditBoundary = useCallback((direction: "previous" | "next") => {
    const activeBlocks = playbackCockpitStats.activeTranscriptBlocks
      .map((block) => ({
        start: Math.max(0, block.time),
        end: Math.max(0, block.time + block.duration),
      }))
      .filter((block) => block.end > block.start)
      .sort((a, b) => a.start - b.start);
    const fallbackClips = timelineState.clips
      .filter((clip) => !clip.deactivated)
      .map((clip) => ({
        start: Math.max(0, clip.startIn),
        end: Math.max(0, clip.startIn + clip.duration),
      }))
      .filter((clip) => clip.end > clip.start)
      .sort((a, b) => a.start - b.start);
    const candidates = activeBlocks.length ? activeBlocks : fallbackClips;
    if (!candidates.length) {
      setCurrentTime(0);
      return;
    }

    const nextBoundary = direction === "next"
      ? candidates.find((candidate) => candidate.start > currentTime + 0.05)?.start ?? totalDuration
      : [...candidates].reverse().find((candidate) => candidate.start < currentTime - 0.05)?.start ?? 0;

    setEditorMode("play-edit");
    setIsPreviewPlaying(false);
    setCurrentTime(Math.max(0, Math.min(totalDuration, nextBoundary)));
  }, [currentTime, playbackCockpitStats.activeTranscriptBlocks, setEditorMode, timelineState.clips, totalDuration]);
  const seekSourceBoundary = useCallback((direction: "previous" | "next") => {
    const visualClipStarts = timelineState.clips
      .filter(isVisualTimelineClip)
      .map((clip) => Math.max(0, clip.startIn))
      .sort((a, b) => a - b);
    if (!visualClipStarts.length) {
      setCurrentTime(0);
      return;
    }

    const nextBoundary = direction === "next"
      ? visualClipStarts.find((start) => start > currentTime + 0.05) ?? totalDuration
      : [...visualClipStarts].reverse().find((start) => start < currentTime - 0.05) ?? 0;

    setEditorMode("play-all");
    setIsPreviewPlaying(false);
    setCurrentTime(Math.max(0, Math.min(totalDuration, nextBoundary)));
  }, [currentTime, setEditorMode, timelineState.clips, totalDuration]);
  const activeWord = useMemo(() => {
    for (const block of timelineState.transcript) {
      if (block.deleted || block.deactivated) continue;
      const word = transcriptWordTimings(block).find((candidate) => currentTime >= candidate.start && currentTime < candidate.end);
      if (word) return { ...word, block };
    }
    return null;
  }, [currentTime, timelineState.transcript]);

  const timelineSaveStatusLabel = useMemo(() => {
    if (timelineSaveState === "queued") return "Saving next...";
    if (timelineSaveState === "saving") return "Saving...";
    if (timelineSaveState === "saved") {
      return `Saved ${timelineLastSavedAt ? `@ ${new Date(timelineLastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "just now"}`;
    }
    if (timelineSaveState === "error") return "Save Error";
    if (timelineSaveState === "conflict") return "Conflict";
    if (timelineSaveState === "fallback") return "Saved Locally";
    return timelineFingerprint === timelineSavedFingerprintRef.current ? "Up to date" : "Unsaved changes";
  }, [timelineLastSavedAt, timelineSaveState, timelineFingerprint]);

  const timelineSaveStatusStyles = timelineSaveState === "saved" || (timelineSaveState === "idle" && timelineFingerprint === timelineSavedFingerprintRef.current)
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : timelineSaveState === "queued" || timelineSaveState === "saving" || (timelineSaveState === "idle" && timelineFingerprint !== timelineSavedFingerprintRef.current)
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : timelineSaveState === "error" || timelineSaveState === "conflict"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  const productionAccessLabel = useMemo(() => {
    if (!productionState) return "Checking";
    if (productionState.mode !== "database") {
      if (productionState.status === "auth-required") return "Sign-in required";
      if (productionState.status === "access-denied") return "Access denied";
      return "Local-only fallback";
    }
    return `${productionState.accessRole ?? "WRITE"} via ${productionState.accessSource ?? "Nest session"}`;
  }, [productionState]);

  const productionAccessTone = productionState?.mode === "database"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : productionState?.status === "auth-required" || productionState?.status === "access-denied"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  const productionDiagnostics = useMemo(() => {
    const clips = timelineState.clips;
    const audioClips = clips.filter((clip) => isAudioTrackId(clip.trackId) || clip.kind === "audio");
    const videoClips = clips.filter((clip) => isVideoTrackId(clip.trackId) || clip.kind === "video");
    const missingSourceClips = clips.filter(isMissingProductionSource);
    const youtubeClips = clips.filter((clip) => isYouTubeAsset(clip.assetId));
    const brokenHealthClips = clips.filter((clip) => {
      if (isMissingProductionSource(clip)) return false;
      const health = mediaHealthById[`clip:${clip.id}`];
      return health?.status === "error";
    });
    const renderBlockedHealthClips = clips.filter((clip) => {
      if (isMissingProductionSource(clip)) return false;
      const health = mediaHealthById[`clip:${clip.id}`];
      return health && !health.renderUsable;
    });
    const deletedTranscriptBlocks = timelineState.transcript.filter((block) => block.deleted);
    const paperEditSnapshotCount = Object.keys(timelineState.paperEditSnapshots ?? {}).length;
    const timelineEndSeconds = clips.reduce((max, clip) => Math.max(max, clip.startIn + clip.duration), 0);
    const clipsByTrack = new Map<string, TimelineClip[]>();
    clips.forEach((clip) => {
      const trackClips = clipsByTrack.get(clip.trackId) ?? [];
      trackClips.push(clip);
      clipsByTrack.set(clip.trackId, trackClips);
    });
    let gapCount = 0;
    let overlapCount = 0;
    clipsByTrack.forEach((trackClips) => {
      const sortedClips = [...trackClips].sort((a, b) => a.startIn - b.startIn);
      let previousEnd = 0;
      sortedClips.forEach((clip, index) => {
        if (index > 0 && clip.startIn > previousEnd + 0.05) gapCount += 1;
        if (index > 0 && clip.startIn < previousEnd - 0.05) overlapCount += 1;
        previousEnd = Math.max(previousEnd, clip.startIn + clip.duration);
      });
    });
    const sourceProblemClips = [
      ...missingSourceClips,
      ...youtubeClips.filter((clip) => !missingSourceClips.some((missingClip) => missingClip.id === clip.id)),
      ...brokenHealthClips.filter((clip) => !missingSourceClips.some((missingClip) => missingClip.id === clip.id)),
      ...renderBlockedHealthClips.filter((clip) =>
        !missingSourceClips.some((missingClip) => missingClip.id === clip.id)
        && !youtubeClips.some((youtubeClip) => youtubeClip.id === clip.id)
        && !brokenHealthClips.some((brokenClip) => brokenClip.id === clip.id)
      ),
    ];
    const readyForPreview = clips.length > 0;
    const readyForRender = readyForPreview && sourceProblemClips.length === 0 && mediaHealthStats.broken === 0;
    const readinessLevel = readyForRender ? "render" : readyForPreview ? "preview" : "empty";
    const readinessTitle = readyForRender
      ? "Render-ready"
      : readyForPreview
        ? "Preview-only"
        : "No timeline yet";
    const readinessDetail = readyForRender
      ? "Every clip has a renderable source."
      : readyForPreview
        ? "You can keep editing, but final export needs these sources fixed."
        : "Hydrate from the recorder or add synced media before editing.";

    return {
      totalClips: clips.length,
      audioClips: audioClips.length,
      videoClips: videoClips.length,
      missingSourceClips: missingSourceClips.length,
      youtubeClips: youtubeClips.length,
      brokenHealthClips: brokenHealthClips.length,
      renderBlockedHealthClips: renderBlockedHealthClips.length,
      transcriptBlocks: timelineState.transcript.length,
      deletedTranscriptBlocks: deletedTranscriptBlocks.length,
      paperEditSnapshotCount,
      timelineEndSeconds,
      gapCount,
      overlapCount,
      sourceProblemClips,
      readinessLevel,
      readinessTitle,
      readinessDetail,
      readyForPreview,
      readyForRender,
    };
  }, [mediaHealthById, mediaHealthStats.broken, timelineState]);

  const episodeSyncChecklist = useMemo(() => {
    const importedVideoAssets = importedMediaAssets.filter((asset) => asset.kind === "video" || asset.contentType.startsWith("video/"));
    const syncedAssets = importedMediaAssets.filter((asset) => asset.sync?.status === "synced");
    const readyOrSyncedAssets = importedMediaAssets.filter((asset) => ["ready-to-sync", "synced"].includes(asset.sync?.status ?? "ready-to-sync"));
    const hasSpineAudio = Boolean(persistedSpineAudio);
    const hasCameraOrVideo = importedVideoAssets.length > 0 || productionDiagnostics.videoClips > 0;
    const hasSyncedReference = syncedAssets.length > 0 || timelineState.clips.some((clip) => clip.assetId?.startsWith("/api/ingest/media/"));
    const playbackVerified = productionDiagnostics.readyForPreview && productionDiagnostics.missingSourceClips === 0;
    const timelineSaved = timelineSaveState === "saved" || timelineFingerprint === timelineSavedFingerprintRef.current;

    return [
      {
        id: "import-media",
        done: importedMediaAssets.length > 0 || productionDiagnostics.totalClips > 0,
        title: "Import media",
        detail: importedMediaAssets.length > 0
          ? `${importedMediaAssets.length} imported asset${importedMediaAssets.length === 1 ? "" : "s"} in the episode vault.`
          : productionDiagnostics.totalClips > 0
            ? "Timeline already has media clips; import raw files when ready."
            : "Import phone audio, camera video, screen recordings, or reference clips.",
      },
      {
        id: "choose-spine",
        done: hasSpineAudio,
        title: "Choose spine audio",
        detail: persistedSpineAudio
          ? `${activeSpineAudioLabel} is the episode sync spine.`
          : importedAudioAssets.length > 0
            ? "Audio is imported; designate the cleanest continuous recording as the spine."
            : productionDiagnostics.audioClips > 0
              ? "Timeline has audio; designate the spine before syncing video."
              : "Import or hydrate the cleanest episode audio first.",
      },
      {
        id: "attach-video",
        done: hasCameraOrVideo,
        title: "Attach camera/video",
        detail: hasCameraOrVideo
          ? `${importedVideoAssets.length || productionDiagnostics.videoClips} video source${(importedVideoAssets.length || productionDiagnostics.videoClips) === 1 ? "" : "s"} available for the edit.`
          : "Import camera footage, screen capture, or source clips and attach them to the timeline.",
      },
      {
        id: "sync-reference",
        done: hasSyncedReference,
        title: "Sync reference clips",
        detail: syncedAssets.length > 0
          ? `${syncedAssets.length} imported asset${syncedAssets.length === 1 ? "" : "s"} marked synced.`
          : readyOrSyncedAssets.length > 0
            ? "Use the line-up controls on an imported file, or open full lab controls only if you need the wizard."
            : "Hold unclear files, then sync the useful ones to the spine.",
      },
      {
        id: "verify-playback",
        done: playbackVerified,
        title: "Verify playback",
        detail: playbackVerified
          ? "Timeline has playable sources for preview."
          : productionDiagnostics.readyForPreview
            ? `${productionDiagnostics.missingSourceClips} missing source${productionDiagnostics.missingSourceClips === 1 ? "" : "s"} still need attention.`
            : "Add or hydrate clips before previewing playback.",
      },
      {
        id: "save-timeline",
        done: timelineSaved,
        title: "Save timeline",
        detail: timelineSaved
          ? "Timeline state is saved or unchanged."
          : `Timeline save status is ${timelineSaveStatusLabel.toLowerCase()}; let autosave finish or click save.`,
      },
    ];
  }, [
    importedAudioAssets,
    importedMediaAssets,
    persistedSpineAudio,
    productionDiagnostics,
    syncWizardSpineAsset,
    activeSpineAudioLabel,
    timelineFingerprint,
    timelineSaveState,
    timelineSaveStatusLabel,
    timelineState.clips,
  ]);

  const canSplitSelectedClip = useMemo(() => {
    if (!selectedClip) return false;
    const splitOffset = currentTime - selectedClip.startIn;
    return splitOffset > 0.1 && splitOffset < selectedClip.duration - 0.1;
  }, [currentTime, selectedClip]);

  const productionSources = useMemo(() => {
    return timelineState.clips.map((clip) => ({
      clip,
      sourceLabel: describeClipSource(clip),
      missing: isMissingProductionSource(clip),
      youtubeOnly: isYouTubeAsset(clip.assetId),
    }));
  }, [timelineState.clips]);

  useEffect(() => {
    if (!selectedClipId) return;
    if (!timelineState.clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(timelineState.clips[0]?.id ?? null);
    }
  }, [selectedClipId, timelineState.clips]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedClip) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowLeft" && event.shiftKey) {
        event.preventDefault();
        nudgeClip(selectedClip.id, -1);
        return;
      }

      if (event.key === "ArrowRight" && event.shiftKey) {
        event.preventDefault();
        nudgeClip(selectedClip.id, 1);
        return;
      }

      if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        snapClipToPrevious(selectedClip.id);
        return;
      }

      if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        snapClipToNext(selectedClip.id);
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        duplicateClip(selectedClip.id);
        return;
      }

      if (key === "m") {
        event.preventDefault();
        moveClipTo(selectedClip.id, currentTime);
        return;
      }

      if (key === "x" && canSplitSelectedClip) {
        event.preventDefault();
        splitClipAt(selectedClip.id, currentTime);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const isSpine = selectedClip.id === persistedSpineAudio?.clipId || selectedClip.assetId === persistedSpineAudio?.assetId;
        const msg = isSpine
          ? `"${selectedClip.name}" is the episode spine audio! Deleting it will break sync. Are you absolutely sure?`
          : `Delete "${selectedClip.name}" from this timeline?`;
        if (!window.confirm(msg)) return;
        deleteClip(selectedClip.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canSplitSelectedClip,
    currentTime,
    deleteClip,
    duplicateClip,
    moveClipTo,
    nudgeClip,
    selectedClip,
    snapClipToNext,
    snapClipToPrevious,
    splitClipAt,
  ]);

  useEffect(() => {
    if (!isPreviewPlaying) return;

    const interval = window.setInterval(() => {
      setCurrentTime((time) => {
        const nextTime = nextPlaybackTimeForMode(time, 0.12, totalDuration, timelineState);
        if (nextTime >= totalDuration) {
          setIsPreviewPlaying(false);
          return totalDuration;
        }
        return nextTime;
      });
    }, 120);

    return () => window.clearInterval(interval);
  }, [isPreviewPlaying, playbackMode, timelineState, totalDuration]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__QUIPSLY_EDITOR_STATE__ = {
        timelineState,
        productionState,
        importedMediaAssets,
        episodeSlug,
        resolvedProjectSlug
      };
    }
  }, [timelineState, productionState, importedMediaAssets, episodeSlug, resolvedProjectSlug]);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).webkit?.messageHandlers?.quipslyMacBridge) {
      (window as any).webkit.messageHandlers.quipslyMacBridge.postMessage({
        event: "playhead_update",
        time: currentTime
      });
    }
  }, [currentTime]);

  const timelineSaved = timelineSaveState === "saved" || timelineFingerprint === timelineSavedFingerprintRef.current;
  const selectedClipAsset = useMemo(() => {
    return selectedClipLinkedAsset(selectedClip, importedMediaAssets);
  }, [importedMediaAssets, selectedClip]);
  const selectedClipHealthForCockpit = useMemo(() => {
    return selectedClip ? timelineClipHealth(selectedClip) : null;
  }, [selectedClip, timelineClipHealth]);
  const editorNextActions = useMemo(() => {
    const actions: Array<{
      id: string;
      label: string;
      detail: string;
      tone: "primary" | "safe" | "warning" | "neutral";
      onClick?: () => void;
      disabled?: boolean;
    }> = [];

    if (!persistedSpineAudio) {
      actions.push({
        id: "choose-spine",
        label: "Choose spine audio",
        detail: importedAudioAssets.length
          ? "Make the cleanest recording the sync spine before lining up video."
          : "Import phone/call audio first, then make it the spine.",
        tone: importedAudioAssets.length ? "primary" : "warning",
        onClick: importedAudioAssets[0] ? () => void setEpisodeSpineAudio({ asset: importedAudioAssets[0] }) : undefined,
        disabled: !importedAudioAssets[0],
      });
    }

    if (productionDiagnostics.missingSourceClips > 0 || mediaHealthStats.broken > 0) {
      actions.push({
        id: "fix-source",
        label: "Fix missing media",
        detail: "Your edit is safe, but final export needs source links repaired or replaced.",
        tone: "warning",
        onClick: productionDiagnostics.sourceProblemClips[0]
          ? () => setSelectedClipId(productionDiagnostics.sourceProblemClips[0].id)
          : undefined,
      });
    }

    if (selectedClip && isMissingProductionSource(selectedClip) && importedMediaAssets.length > 0) {
      actions.push({
        id: "attach-selected",
        label: "Attach media to selected clip",
        detail: `Use the first safe import for ${selectedClip.name}; you can change it afterward.`,
        tone: "primary",
        onClick: () => void attachImportedAssetToSelectedClip(importedMediaAssets[0]),
      });
    }

    if (!timelineSaved) {
      actions.push({
        id: "save",
        label: "Save timeline",
        detail: "Autosave is usually enough, but click once before leaving a real edit.",
        tone: "safe",
        onClick: () => void handleSaveEpisodeTimeline(),
        disabled: timelineSaveState === "saving",
      });
    }

    if (!actions.length) {
      actions.push({
        id: "keep-editing",
        label: "Keep editing",
        detail: productionDiagnostics.readyForRender
          ? "This cut is render-ready. Review playback or move toward publishing."
          : "This cut is safe to preview. Continue cutting or lining up sources.",
        tone: productionDiagnostics.readyForRender ? "safe" : "neutral",
        onClick: () => setViewMode("timeline"),
      });
    }

    return actions.slice(0, 3);
  }, [
    attachImportedAssetToSelectedClip,
    handleSaveEpisodeTimeline,
    importedAudioAssets,
    importedMediaAssets,
    mediaHealthStats.broken,
    persistedSpineAudio,
    productionDiagnostics.missingSourceClips,
    productionDiagnostics.readyForRender,
    productionDiagnostics.sourceProblemClips,
    selectedClip,
    setEpisodeSpineAudio,
    timelineSaveState,
    timelineSaved,
  ]);

  const handleClaimEditFocus = useCallback(async () => {
    try {
      const state = await sendEpisodeCollaborationHeartbeat({
        action: "claim-edit-lease",
        projectSlug: resolvedProjectSlug,
        episodeSlug,
        app: "web-editor",
        route: "editor",
      });
      setCollaborationState(state);
      setRemoteTimelineNotice("Edit focus claimed. This is a soft hand-raise so collaborators know you are cutting right now.");
    } catch (error) {
      console.warn("Could not claim edit focus.", error);
      setRemoteTimelineNotice("Could not claim edit focus. Check Nest sign-in/access and try again.");
    }
  }, [episodeSlug, resolvedProjectSlug]);

  const handleReleaseEditFocus = useCallback(async () => {
    try {
      const state = await sendEpisodeCollaborationHeartbeat({
        action: "release-edit-lease",
        projectSlug: resolvedProjectSlug,
        episodeSlug,
        app: "web-editor",
        route: "editor",
      });
      setCollaborationState(state);
      setRemoteTimelineNotice("Edit focus released.");
    } catch (error) {
      console.warn("Could not release edit focus.", error);
      setRemoteTimelineNotice("Could not release edit focus. Check Nest sign-in/access and try again.");
    }
  }, [episodeSlug, resolvedProjectSlug]);

  if (!productionState) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-[#fdfaf6] px-4 py-10 text-[#3d3122]">
        <section className="w-full max-w-xl rounded-3xl border border-[#e8dcc4] bg-white p-8 text-center shadow-sm" aria-live="polite">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Protected episode editor</div>
          <h1 className="mt-3 font-serif text-3xl font-black">
            {productionEntryError ? "The editor could not be opened." : "Checking Nest access…"}
          </h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-[#6b5b45]">
            {productionEntryError
              ? "No timeline or starter content has been loaded. Retry after checking the app connection, or choose another accessible Nest."
              : "Quipsly is verifying the signed-in account before it loads any timeline, transcript, or media state."}
          </p>
          {productionEntryError ? (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setTimelineReloadToken((token) => token + 1)} className="rounded-full bg-[#3d3122] px-5 py-3 text-xs font-black uppercase tracking-wide text-white">
                Retry
              </button>
              <Link href="/projects" className="rounded-full border border-[#d9c9ad] bg-white px-5 py-3 text-xs font-black uppercase tracking-wide text-[#5d4934]">
                Choose a Nest
              </Link>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (productionState.mode !== "database" && (productionState.status === "auth-required" || productionState.status === "access-denied")) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-[#fdfaf6] px-4 py-10 text-[#3d3122]">
        <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm" role="alert">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Access protected</div>
          <h1 className="mt-3 font-serif text-3xl font-black">This Nest editor is private.</h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-[#6b5b45]">
            No timeline, transcript, media, or representative starter content was loaded for this account.
          </p>
          <Link href="/projects" className="mt-6 inline-flex rounded-full bg-[#3d3122] px-5 py-3 text-xs font-black uppercase tracking-wide text-white">
            Choose an accessible Nest
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 border-b border-[#e8dcc4] bg-[#fdfaf6] p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-xl font-black tracking-tight text-[#3d3122] sm:gap-3">
            Episode Editor {projectId && <span className="text-[#8c6b4a] font-medium text-sm">Nest: {projectId}</span>}
          </h1>
          {activeSpineAudioLabel && (
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-bold text-[#8c6b4a]">
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] uppercase tracking-widest text-indigo-800">Spine</span>
              <span className="min-w-0 truncate xl:max-w-[400px]" title={activeSpineAudioLabel}>{activeSpineAudioLabel}</span>
            </div>
          )}
        </div>
        {realEditingMode ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-900">
            Real editing session
          </div>
        ) : (
          <div className="flex w-full max-w-full overflow-x-auto rounded-lg border border-[#e8dcc4] bg-[#f8f3e6] p-1 xl:w-auto">
            <button
              onClick={() => setViewMode("timeline")}
              className={`shrink-0 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'timeline' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              TIMELINE
            </button>
            <button
              onClick={() => setViewMode("transcript")}
              className={`shrink-0 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'transcript' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              TRANSCRIPT
            </button>
            <button
              onClick={() => setViewMode("segmenter")}
              className={`shrink-0 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'segmenter' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              SEGMENT DESK
            </button>
            <button
              onClick={() => setViewMode("reframe")}
              className={`shrink-0 px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'reframe' ? 'bg-[#8c6b4a] text-white shadow-sm' : 'text-[#8c6b4a] hover:text-[#3d3122]'}`}
            >
              REMOTION PLAYER
            </button>
          </div>
        )}
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
          <button
            onClick={() => setRealEditingMode((enabled) => !enabled)}
            className={`px-4 py-1.5 text-xs font-bold shadow-sm rounded-md transition-colors ${
              realEditingMode
                ? "bg-emerald-700 text-white hover:bg-emerald-800"
                : "bg-white text-[#3d3122] border border-[#e8dcc4] hover:bg-[#fff8ec]"
            }`}
          >
            {realEditingMode ? "Real Mode On" : "Real Mode"}
          </button>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wide ${timelineSaveStatusStyles}`}>
            {timelineSaveStatusLabel}
          </span>
          <button
            onClick={() => setIsPreviewPlaying((playing) => !playing)}
            className={`px-4 py-1.5 text-xs font-bold bg-[#3d3122] hover:bg-[#59442d] text-white shadow-sm rounded-md transition-colors ${realEditingMode ? "hidden" : ""}`}
          >
            {isPreviewPlaying ? "Pause Read-Along" : "Play Read-Along"}
          </button>
          <div className="flex items-center gap-2">
            {!timelineSaved && <span className="flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" title="Unsaved changes" />}
            <button
              onClick={() => setIsAdvancedToolsVisible(!isAdvancedToolsVisible)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                isAdvancedToolsVisible ? "bg-[#3d3122] text-white" : "border border-[#e8dcc4] bg-white text-[#8c6b4a] hover:bg-[#fffaf0]"
              }`}
            >
              Advanced Tools {isAdvancedToolsVisible ? "ON" : "OFF"}
            </button>
            <div className="flex bg-white rounded-md border border-[#e8dcc4] overflow-hidden shadow-sm">
              <button
                onClick={handleTimelineUndo}
                disabled={!canUndo}
                className="px-3 py-1 text-xs font-bold text-[#3d3122] hover:bg-[#fff8ec] disabled:opacity-30 disabled:hover:bg-transparent border-r border-[#e8dcc4] transition-colors"
                title="Undo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
              </button>
              <button
                onClick={handleTimelineRedo}
                disabled={!canRedo}
                className="px-3 py-1 text-xs font-bold text-[#3d3122] hover:bg-[#fff8ec] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Redo"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
              </button>
            </div>
            <button
              onClick={handleSaveEpisodeTimeline}
              disabled={timelineSaveState === "saving"}
              className="px-4 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm rounded-md transition-colors disabled:opacity-50"
            >
              {timelineSaveState === "saving" ? "Saving..." : timelineSaveState === "saved" ? "Timeline Saved" : "Save Episode Timeline"}
            </button>
          </div>
          <button
            onClick={handleRefreshProductionState}
            disabled={!isTimelineHydrated || timelineSaveState === "saving"}
            className="px-4 py-1.5 text-xs font-bold bg-white hover:bg-[#fff8ec] text-[#3d3122] border border-[#e8dcc4] shadow-sm rounded-md transition-colors disabled:opacity-50"
          >
            Refresh DB State
          </button>
          <button
            onClick={() => setIsExportQueueOpen(true)}
            className={`px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm rounded-md transition-colors ${realEditingMode || !isAdvancedToolsVisible ? "hidden" : ""}`}
          >
            Render & Export...
          </button>
        </div>
      </header>

      {(collaborationState || remoteTimelineNotice) && (
        <section className="border-b border-[#e8dcc4] bg-[#fffaf0] px-4 py-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5f4a34]">
            {collaborationState && (
              <>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-black uppercase tracking-[0.14em] text-emerald-900">
                  {collaborationState.activeCollaborators.length || 1} collaborator{(collaborationState.activeCollaborators.length || 1) === 1 ? "" : "s"} active
                </span>
                {collaborationState.editLease ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-bold text-amber-900">
                    Edit focus: {collaborationState.editLease.name}
                  </span>
                ) : (
                  <span className="rounded-full border border-[#e8dcc4] bg-white px-3 py-1 font-bold text-[#8c6b4a]">
                    No edit focus claimed
                  </span>
                )}
                <button
                  onClick={handleClaimEditFocus}
                  className="rounded-full border border-[#e8dcc4] bg-white px-3 py-1 font-black uppercase tracking-[0.12em] text-[#3d3122] hover:bg-[#fff8ec]"
                >
                  Claim focus
                </button>
                <button
                  onClick={handleReleaseEditFocus}
                  className="rounded-full border border-[#e8dcc4] bg-white px-3 py-1 font-black uppercase tracking-[0.12em] text-[#8c6b4a] hover:bg-[#fff8ec]"
                >
                  Release
                </button>
                {collaborationState.assetManifest && (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-bold text-indigo-900">
                    {collaborationState.assetManifest.totalAssets} needed asset{collaborationState.assetManifest.totalAssets === 1 ? "" : "s"}
                  </span>
                )}
              </>
            )}
            {remoteTimelineNotice && (
              <div className="flex min-w-[280px] flex-1 items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 font-bold text-sky-950">
                <span>{remoteTimelineNotice}</span>
                <button
                  onClick={handleRefreshProductionState}
                  className="shrink-0 rounded-lg bg-sky-900 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white hover:bg-sky-800"
                >
                  Pull Nest timeline
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <ExportQueueModule
        isOpen={isExportQueueOpen}
        onClose={() => setIsExportQueueOpen(false)}
        timelineDurationSeconds={productionDiagnostics.timelineEndSeconds}
        totalClips={productionDiagnostics.totalClips}
        projectSlug={resolvedProjectSlug}
        episodeSlug={episodeSlug}
        timelineState={timelineState}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-visible lg:min-h-0 lg:flex-row lg:overflow-hidden">
        {/* Media Pool Panel */}
        <aside className="flex w-full min-w-0 shrink-0 flex-col gap-3 overflow-visible border-b border-[#e8dcc4] bg-[#f8f3e6] p-3 sm:p-4 lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <h2 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-2">
            Media Pool
          </h2>
          {realEditingMode && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-950 shadow-sm">
              <div className="font-black uppercase tracking-[0.18em]">Real editing session mode</div>
              <div className="mt-2">
                Panic-proof Episode 4 view: manuscript link, media import, spine audio, checklist, timeline, selected clip, and save state.
              </div>
              <button
                type="button"
                onClick={() => setRealEditingMode(false)}
                className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 font-black text-emerald-900 hover:bg-emerald-100"
              >
                Show full lab controls
              </button>
            </div>
          )}
          {projectId && (
            <div className="bg-amber-100 text-amber-800 border border-amber-200 px-3 py-2 rounded-lg text-xs font-bold shadow-sm">
               Scoped to tags: {projectId}
            </div>
          )}
          <div className="rounded-xl border border-[#d8b777] bg-[#fff4d8] p-3 text-xs leading-5 text-[#694615] shadow-sm">
            <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Episode Production Room</div>
            <div className="mt-1 text-sm font-black text-[#3d3122]">{episodeLabel}</div>
            <div className="mt-2">
              This editor section is scoped to the manuscript episode boundary. Audio, clips, transcript words, and publish exports should all hang off this room.
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2 font-black ${
              productionState?.mode === "database"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              {productionState?.mode === "database"
                ? `DB-backed production ${productionState.id.slice(0, 8)}`
                : productionState?.message ?? "Local-only production room until Nest sync is available"}
            </div>
            <div className={`mt-2 rounded-lg border px-3 py-2 font-bold leading-5 ${productionAccessTone}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-black">Nest access</div>
                  <div className="mt-1">{productionAccessLabel}</div>
                  {productionState?.actorEmail && (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] opacity-80">
                      {productionState.actorEmail}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-current bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                  {productionState?.mode === "database" ? "DB" : "local"}
                </span>
              </div>
              {productionState?.mode !== "database" && (
                <div className="mt-2 rounded-md border border-current/20 bg-white/60 px-2 py-1 text-[11px]">
                  Timeline edits can stay in this browser for review, but save, import, collaboration, and sync require a writable Nest session.
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-[#ead6aa] bg-white/80 p-3 text-[11px] font-bold leading-5 text-[#5d4528]">
              <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Production truth</div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <span>Access</span>
                <span className="text-right">{productionAccessLabel}</span>
                <span>Actor</span>
                <span className="truncate text-right" title={productionState?.actorEmail ?? undefined}>
                  {productionState?.actorEmail ?? "Not connected"}
                </span>
                <span>Hydrated from</span>
                <span className="text-right">{timelineHydrationSource}</span>
                <span>Timeline</span>
                <span className="text-right">{formatClock(productionDiagnostics.timelineEndSeconds)}</span>
                <span>Clips</span>
                <span className="text-right">{productionDiagnostics.totalClips} ({productionDiagnostics.videoClips}V / {productionDiagnostics.audioClips}A)</span>
                <span>Shared Watch</span>
                <span className="text-right">
                  {timelineState.clips.filter((clip) => Boolean(clip.recordingSync)).length} receipt-backed
                </span>
                <span>Transcript</span>
                <span className="text-right">{productionDiagnostics.transcriptBlocks} blocks</span>
                <span>Paper cuts</span>
                <span className="text-right">{productionDiagnostics.deletedTranscriptBlocks} active / {productionDiagnostics.paperEditSnapshotCount} undo</span>
                <span>Track gaps</span>
                <span className="text-right">{productionDiagnostics.gapCount}</span>
                <span>Track overlaps</span>
                <span className="text-right">{productionDiagnostics.overlapCount}</span>
                <span>Missing media</span>
                <span className="text-right">{productionDiagnostics.missingSourceClips}</span>
                <span>YouTube-only</span>
                <span className="text-right">{productionDiagnostics.youtubeClips}</span>
                <span>Health checked</span>
                <span className="text-right">{mediaHealthStats.checked}/{mediaHealthStats.total}</span>
                <span>Preview usable</span>
                <span className="text-right">{mediaHealthStats.previewUsable}</span>
                <span>Render usable</span>
                <span className="text-right">{mediaHealthStats.renderUsable}</span>
                <span>Broken sources</span>
                <span className="text-right">{mediaHealthStats.broken}</span>
                <span>Render state</span>
                <span className="text-right">{productionDiagnostics.readinessTitle}</span>
                <span>Spine audio</span>
                <span className={`text-right ${persistedSpineAudio ? "text-emerald-800" : "text-amber-800"}`}>
                  {activeSpineAudioLabel}
                </span>
              </div>
              <div className="mt-3 rounded-md border border-[#e8dcc4] bg-white px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-black">Media source safety</div>
                    <div className="mt-0.5 text-[10px] font-bold text-[#8c6b4a]">
                      Can we preview it? Can we export it? What needs attention?
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshMediaHealth()}
                    disabled={isCheckingMediaHealth || mediaHealthProbeItems.length === 0}
                    className="rounded-md border border-[#d8b777] bg-[#fff8ec] px-2 py-1 font-black text-[#7b4f1f] disabled:cursor-wait disabled:opacity-60"
                  >
                    {isCheckingMediaHealth ? "Checking..." : "Recheck"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                  <span className={`rounded-full border px-2 py-1 ${healthStatusStyles(mediaHealthStats.broken > 0 ? "error" : mediaHealthStats.warnings > 0 ? "warning" : mediaHealthStats.checked ? "ok" : "unchecked")}`}>
                    {mediaHealthStats.broken} broken
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                    {mediaHealthStats.healthy} healthy
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                    {mediaHealthStats.warnings} warning
                  </span>
                  {mediaHealthStats.checking > 0 && (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
                      {mediaHealthStats.checking} checking
                    </span>
                  )}
                </div>
                <div className={`mt-2 rounded-lg border px-2 py-2 font-bold leading-5 ${
                  mediaHealthStats.broken > 0
                    ? "border-red-200 bg-red-50 text-red-900"
                    : mediaHealthStats.warnings > 0
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : mediaHealthStats.checked > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                }`}>
                  {mediaHealthStats.broken > 0
                    ? "Some sources need relink or replacement before final export. You can keep editing."
                    : mediaHealthStats.warnings > 0
                      ? "Preview is usable, but final export may need cleaner sources."
                      : mediaHealthStats.checked > 0
                        ? "Sources look safe for this pass."
                        : "No media sources have been checked yet."}
                </div>
                {mediaHealthCheckedAt && (
                  <div className="mt-2 font-mono text-[10px] text-[#8c6b4a]">
                    Last checked {new Date(mediaHealthCheckedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </div>
              <div className={`mt-3 rounded-md border px-2 py-1.5 ${
                productionDiagnostics.readinessLevel === "render"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : productionDiagnostics.readinessLevel === "preview"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}>
                <div className="font-black">{productionDiagnostics.readinessTitle}</div>
                <div className="mt-1 font-bold">{productionDiagnostics.readinessDetail}</div>
              </div>
              {productionDiagnostics.sourceProblemClips.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-amber-900">
                  <div className="font-black">Fix before final export</div>
                  <ul className="mt-1 space-y-1">
                    {productionDiagnostics.sourceProblemClips.slice(0, 4).map((clip) => (
                      <li key={clip.id} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                        <span className="truncate" title={describeClipSource(clip)}>
                          {clip.trackId} {clip.name}: {describeClipSource(clip)}
                        </span>
                        <select
                          className="w-32 shrink-0 rounded border border-amber-300 bg-white px-1 py-0.5 text-[#5d4528]"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              const asset = importedMediaAssets.find(a => a.id === e.target.value);
                              if (asset) updateClipSource(clip.id, asset.playbackUrl || asset.id, asset.originalName);
                            }
                          }}
                        >
                          <option value="" disabled>Replace File...</option>
                          {importedMediaAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.originalName} ({asset.kind})
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                  {productionDiagnostics.sourceProblemClips.length > 4 && (
                    <div className="mt-1 font-bold">
                      +{productionDiagnostics.sourceProblemClips.length - 4} more source issue(s)
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[11px] leading-5 text-indigo-950 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black uppercase tracking-[0.18em] text-[#2f2a7a]">Editor co-pilot</div>
                  <div className="mt-1 text-[11px] font-bold leading-5 text-[#3d316b]">
                    Run a command to execute quick editorial actions across imported media, timeline, sync, and DB-backed state.
                  </div>
                </div>
                <div className="text-right text-[10px] font-black">
                  <div className="rounded-full border border-indigo-200 bg-white px-2 py-1 font-mono text-indigo-900">
                    {editorCoPilotLog.length} actions
                  </div>
                  <div className="mt-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-mono text-violet-900">
                    {editorCoPilotMessages.length} messages
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runEditorCoPilotCommand();
                  }}
                  className="space-y-2"
                >
                  <label className="block font-black text-[#2f2a7a]">Ask co-pilot</label>
                  <textarea
                    value={editorCoPilotInput}
                    onChange={(event) => setEditorCoPilotInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void runEditorCoPilotCommand();
                      }
                    }}
                    rows={2}
                    placeholder='Try "help" or "add quote_clip.mp3 to timeline"'
                    className="mt-1 w-full resize-y rounded-lg border border-indigo-200 bg-white p-2 font-mono text-[11px] text-[#3d3122]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isEditorCoPilotBusy}
                      className="rounded-lg border border-[#2f2a7a] bg-[#2f2a7a] px-3 py-2 font-black text-white hover:bg-[#211f57] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isEditorCoPilotBusy ? "Running..." : "Run co-pilot"}
                    </button>
                  </div>
                </form>
              </div>
              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {editorCoPilotMessages.length ? (
                  editorCoPilotMessages.map((message) => {
                    const tone = EDITOR_CO_PILOT_MESSAGE_TONE[message.role];
                    return (
                      <div key={message.id} className={`rounded-lg border p-2 ${tone}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-black">
                            {message.role === "user" ? "You" : message.role === "agent" ? "Co-pilot" : "System"} · {formatEditorCoPilotTime(message.at)}
                          </span>
                          {message.logId && (
                            <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[9px]">linked action</span>
                          )}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-[11px] leading-5 font-bold">
                          {message.text}
                        </div>
                        {message.command && (
                          <div className="mt-1 font-mono text-[10px] text-slate-700">
                            command: {message.command}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-violet-200 bg-white p-3 font-black text-[#4f4494]">
                    No co-pilot messages yet.
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EDITOR_CO_PILOT_COMMANDS.map((command) => (
                  <button
                    key={command}
                    type="button"
                    onClick={() => void runEditorCoPilotCommand(command)}
                    className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-[#2f2a7a] hover:bg-indigo-50"
                  >
                    {command}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {editorCoPilotLog.length ? (
                  editorCoPilotLog.map((entry) => {
                    const tone = EDITOR_CO_PILOT_STATUS_TONE[entry.status];
                    const canRollback = entry.reversible && entry.status === "success" && entry.revert.kind !== "none" && entry.revert.kind !== "undo-sync";
                    return (
                      <div key={entry.id} className={`rounded-lg border px-2 py-2 ${tone}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black truncate">
                            {formatEditorCoPilotTime(entry.at)} · {entry.command}
                          </div>
                          <button
                            type="button"
                            onClick={() => void revertEditorCoPilotAction(entry)}
                            disabled={!canRollback}
                            className="rounded border border-[#2f2a7a] bg-white px-2 py-1 font-black text-[10px] text-[#2f2a7a] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {canRollback ? EDITOR_CO_PILOT_REVERT_LABEL[entry.revert.kind] : "No rollback"}
                          </button>
                        </div>
                        <div className="mt-1 text-[11px] font-bold leading-5">{entry.result}</div>
                        {entry.changeSummary ? (
                          <div className="mt-1 rounded-md border border-indigo-100 bg-white px-2 py-1 text-[10px] leading-4 font-bold text-[#3c2c6d]">
                            Changes: {entry.changeSummary}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-indigo-200 bg-white p-3 font-black text-[#4f4494]">
                    No actions yet. Start with `help` or type one.
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#d8b777] bg-white p-3 text-[11px] leading-5 text-[#5d4528] shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Episode sync checklist</div>
                <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf0] px-2 py-1 font-mono text-[10px] text-[#8c6b4a]">
                  {episodeSyncChecklist.filter((item) => item.done).length}/{episodeSyncChecklist.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {episodeSyncChecklist.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-3 py-2 ${
                      item.done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black">{item.title}</span>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        item.done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}>
                        {item.done ? "Done" : "Next"}
                      </span>
                    </div>
                    <div className="mt-1 font-bold leading-5">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <Link
                href={`/create?project=${encodeURIComponent(projectId ?? DEFAULT_EDITOR_PROJECT_SLUG)}&publisher=1&boundary=${encodeURIComponent(episodeSlug)}&view=${encodeURIComponent(`${episodeSlug}-view`)}`}
                className="rounded-lg border border-[#d7bd8f] bg-white px-3 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
              >
                Open {episodeLabel} manuscript
              </Link>
              <Link
                href={`/recorder?project=${encodeURIComponent(projectId ?? DEFAULT_EDITOR_PROJECT_SLUG)}&episode=${encodeURIComponent(episodeSlug)}`}
                className="rounded-lg border border-[#d7bd8f] bg-white px-3 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
              >
                Record this episode
              </Link>
              <Link
                href="/coaching/sessions"
                className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 font-black text-white hover:bg-[#59442d]"
              >
                Prepare a session for this episode
              </Link>
            </div>
          </div>
          <Link
            href={`/recorder?project=${encodeURIComponent(projectId ?? DEFAULT_EDITOR_PROJECT_SLUG)}&episode=${encodeURIComponent(episodeSlug)}`}
            className={`bg-[#3d3122] text-white border border-[#3d3122] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#59442d] ${realEditingMode ? "hidden" : ""}`}
          >
            Open Recording Room
          </Link>
          <Link
            href="/coaching/sessions"
            className={`bg-[#7b4f1f] text-white border border-[#7b4f1f] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#9a662c] ${realEditingMode ? "hidden" : ""}`}
          >
            Prepare Session
          </Link>
          <label className={`cursor-pointer bg-white text-[#3d3122] border border-[#e8dcc4] px-3 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-[#fff8ec] ${realEditingMode ? "hidden" : ""}`}>
            Import session JSON
            <input type="file" accept="application/json,.json" onChange={handleSessionImport} className="hidden" />
          </label>
          {sessionSummary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-800">
              {sessionSummary}
            </div>
          )}
          <div className={`rounded-xl border border-[#d8b777] bg-white p-3 text-xs text-[#4a3722] shadow-sm ${realEditingMode ? "hidden" : ""}`}>
            <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Production source bin</div>
            <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black text-[#3d3122]">Media analysis jobs</div>
                  <div className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                    Lightweight job ledger saved in productionJson. Execution is simple for now; the record shape is ready for a real worker.
                  </div>
                </div>
                <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                  {mediaAnalysisJobs.length} total
                </span>
              </div>
              {mediaAnalysisJobs.length > 0 ? (
                <div className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
                  {mediaAnalysisJobs.slice(0, 8).map((job) => {
                    const asset = importedMediaAssets.find((candidate) => candidate.id === job.assetId || candidate.sourceId === job.assetId);
                    return (
                      <div key={job.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e8dcc4] bg-white px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate font-black text-[#3d3122]">{mediaAnalysisJobLabel(job.type)} - {asset?.originalName ?? job.assetId}</div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                            {job.completedAt ? `completed ${new Date(job.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `started ${job.startedAt ? new Date(job.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "unknown"}`}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${mediaAnalysisJobTone(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                  No analysis jobs yet. Queue one from an imported asset below.
                </div>
              )}
            </div>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
              {productionSources.length ? productionSources.map(({ clip, sourceLabel, missing, youtubeOnly }) => {
                const health = timelineClipHealth(clip);
                return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => setSelectedClipId(clip.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left transition-colors ${
                    selectedClip?.id === clip.id
                      ? "border-[#3d3122] bg-[#3d3122] text-white"
                      : missing || youtubeOnly
                        ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                  }`}
                >
                  <div className="truncate font-black">{clip.name}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] opacity-80">
                    <span>{clip.trackId} / {clip.kind}</span>
                    <span>{sourceLabel}</span>
                  </div>
                  <div className={`mt-2 inline-flex rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    selectedClip?.id === clip.id ? "border-white/40 bg-white/10 text-white" : healthStatusStyles(health?.status ?? (missing ? "error" : "unchecked"))
                  }`}>
                    {health ? `${healthStatusLabel(health.status)} / ${health.kind} / ${health.renderUsable ? "render" : health.previewUsable ? "preview" : "not usable"}` : missing ? "Missing source" : "Unchecked"}
                  </div>
                </button>
                );
              }) : (
                <div className="rounded-lg border border-dashed border-[#e8dcc4] bg-[#fffaf0] p-3 font-bold text-[#8c6b4a]">
                  No timeline sources yet.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[#d8b777] bg-[#fffaf0] p-3 text-xs text-[#4a3722] shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">{episodeLabel} import workflow</div>
                <p className="mt-1 leading-5 text-[#6f5336]">
                  Import phone audio, camera video, reference clips, and YouTube/source clips into this exact episode. Everything lands in the sync bench tagged as {resolvedProjectSlug} / {episodeSlug}.
                </p>
              </div>
              <div className={`flex shrink-0 flex-col gap-2 ${realEditingMode ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => void handleAiOrganizeMedia()}
                  disabled={isAiOrganizingMedia}
                  className="rounded-lg border border-[#d8b777] bg-white px-3 py-2 text-center font-black text-[#7b4f1f] shadow-sm hover:bg-[#fff8ec] disabled:cursor-wait disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                >
                  {isAiOrganizingMedia ? "Organizing..." : "Organize with Gemini"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {EPISODE_IMPORT_LANES.map((lane) => (
                <div key={lane.id} className={`rounded-xl border p-3 ${lane.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black text-[#2f261a]">{lane.title}</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">{lane.description}</p>
                    </div>
                    <label className={`shrink-0 rounded-lg border px-3 py-2 text-center font-black shadow-sm ${
                      isImportingMedia
                        ? "cursor-wait border-[#d8b777] bg-[#f3e4c7] text-[#8c6b4a]"
                        : "cursor-pointer border-[#3d3122] bg-[#3d3122] text-white hover:bg-[#59442d]"
                    }`}>
                      {isImportingMedia ? "Importing..." : lane.buttonLabel}
                      <input
                        type="file"
                        accept={lane.accept}
                        multiple
                        onChange={(event) => void handleMediaImport(event, lane.id)}
                        disabled={isImportingMedia}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ))}
              <div className={`rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-fuchsia-950 ${realEditingMode ? "hidden" : ""}`}>
                <div className="font-black text-[#2f261a]">YouTube / source clip</div>
                <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">
                  Paste a YouTube URL, article video URL, remote source, or other clip link. It appears in the same sync bench as uploaded files.
                </p>
                <div className="mt-3 grid gap-2">
                  <input
                    type="url"
                    value={sourceClipUrl}
                    onChange={(event) => setSourceClipUrl(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-lg border border-fuchsia-200 bg-white px-3 py-2 font-mono text-[11px] text-[#3d3122]"
                  />
                  <input
                    type="text"
                    value={sourceClipTitle}
                    onChange={(event) => setSourceClipTitle(event.target.value)}
                    placeholder="Optional title, e.g. Franklin quote clip"
                    className="w-full rounded-lg border border-fuchsia-200 bg-white px-3 py-2 font-bold text-[#3d3122]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSourceClipUrlImport()}
                    disabled={sourceClipImportStatus === "importing" || !sourceClipUrl.trim()}
                    className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 font-black text-white shadow-sm hover:bg-[#59442d] disabled:cursor-not-allowed disabled:border-[#d8b777] disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                  >
                    {sourceClipImportStatus === "importing" ? "Registering..." : "Add source clip"}
                  </button>
                </div>
              </div>
            </div>
            {mediaImportStatus && (
              <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 font-bold text-[#6f5336]">
                {mediaImportStatus}
              </div>
            )}
            {premiereRestorePreviewClips.length > 0 && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-indigo-950 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[#2f261a]">Local restore previews are active</div>
                    <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">
                      {premiereRestorePreviewClips.length} preserved Premiere range{premiereRestorePreviewClips.length === 1 ? "" : "s"} were added as temporary review clips. They are not promoted or saved as production decisions until you intentionally save/promote.
                    </p>
                    <div className="mt-2 grid gap-1">
                      {premiereRestorePreviewClips.slice(0, 6).map((clip) => (
                        <div key={clip.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-100 bg-white px-2 py-1.5">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-black text-[#2f261a]">{clip.name}</div>
                            <div className="mt-0.5 font-mono text-[10px] text-indigo-900/70">
                              {clip.trackId} · {formatClock(clip.startIn)}-{formatClock(clip.startIn + clip.duration)} · source {formatClock(clip.sourceStart)}-{formatClock(clip.sourceEnd ?? clip.sourceStart + clip.duration)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClipId(clip.id);
                                setCurrentTime(clip.startIn);
                                setViewMode("timeline");
                                setEditorMode("play-all");
                                setIsPreviewPlaying(false);
                                setMediaImportStatus(`Cued local restore preview: ${clip.name}.`);
                              }}
                              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-900 hover:bg-indigo-100"
                            >
                              Jump
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                deleteClip(clip.id);
                                setSelectedClipId((current) => current === clip.id ? null : current);
                                setIsPreviewPlaying(false);
                                setTimelineSaveStateSafe("conflict");
                                setMediaImportStatus(`Removed local restore preview: ${clip.name}.`);
                              }}
                              className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-900 hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      {premiereRestorePreviewClips.length > 6 && (
                        <div className="rounded-md border border-dashed border-indigo-200 bg-white px-2 py-1.5 text-[10px] font-black text-indigo-900">
                          + {premiereRestorePreviewClips.length - 6} more local restore preview{premiereRestorePreviewClips.length - 6 === 1 ? "" : "s"} on the timeline.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Save the current timeline with ${premiereRestorePreviewClips.length} local restore preview clip${premiereRestorePreviewClips.length === 1 ? "" : "s"}?\n\nThis intentionally persists your current timeline. Use this only after reviewing the restore previews you want to keep.`
                        );
                        if (!confirmed) return;
                        void handleSaveEpisodeTimeline();
                      }}
                      disabled={timelineSaveState === "saving"}
                      className="rounded-lg border border-indigo-900 bg-indigo-900 px-3 py-2 font-black text-white hover:bg-indigo-800 disabled:cursor-wait disabled:border-indigo-200 disabled:bg-indigo-100 disabled:text-indigo-500"
                    >
                      {timelineSaveState === "saving" ? "Saving..." : "Save with previews"}
                    </button>
                    <button
                      type="button"
                      onClick={clearPremiereRestorePreviews}
                      className="rounded-lg border border-indigo-300 bg-white px-3 py-2 font-black text-indigo-900 hover:bg-indigo-100"
                    >
                      Clear restore previews
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!realEditingMode && aiIngestReport && (
              <div className="mt-3 rounded-lg border border-[#d8b777] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[#3d3122]">AI ingest report</div>
                    <p className="mt-1 leading-5 text-[#6f5336]">{aiIngestReport.summary}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                    aiIngestReport.source === "gemini"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}>
                    {aiIngestReport.source === "gemini" ? "Gemini" : "Fallback"}
                  </span>
                </div>
                {aiIngestReport.batchPlan.length > 0 && (
                  <ol className="mt-3 space-y-2">
                    {aiIngestReport.batchPlan.slice(0, 3).map((step, index) => (
                      <li key={`${step.title}-${index}`} className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                        <div className="font-black text-[#3d3122]">{index + 1}. {step.title}</div>
                        <div className="mt-1 font-bold leading-5 text-[#6f5336]">{step.detail}</div>
                      </li>
                    ))}
                  </ol>
                )}
                {aiIngestReport.recommendations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="font-black uppercase tracking-[0.16em] text-[#9a641e]">Recommendations</div>
                    {aiIngestReport.recommendations.map((recommendation) => {
                      const asset = importedMediaAssets.find((candidate) =>
                        candidate.id === recommendation.assetId || candidate.sourceId === recommendation.assetId
                      );
                      const applyKey = `${asset?.id ?? recommendation.assetId}:${recommendation.assetId}`;
                      const canApply = Boolean(asset);
                      const isApplying = applyingAiSuggestionIds.has(applyKey);
                      return (
                        <div key={`${recommendation.assetId}-${recommendation.role}`} className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-black text-[#3d3122]">
                                {asset?.originalName ?? recommendation.assetId}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                                <span className="rounded-full bg-white px-2 py-1">{recommendation.role}</span>
                                <span className="rounded-full bg-white px-2 py-1">{recommendation.suggestedTrackId}</span>
                                <span className="rounded-full bg-white px-2 py-1">{normalizeSuggestedSyncStatus(recommendation.suggestedSyncStatus)}</span>
                                <span className="rounded-full bg-white px-2 py-1">{Math.round(recommendation.confidence * 100)}%</span>
                              </div>
                              <div className="mt-1 font-bold leading-5 text-[#6f5336]">{recommendation.suggestedAction}</div>
                              <div className="mt-1 text-[10px] font-bold leading-4 text-[#8c6b4a]">
                                Safe apply: updates imported-asset metadata only. It will not move timeline clips.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void applyAiIngestRecommendation(recommendation, asset)}
                              disabled={!canApply || isApplying}
                              className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                              title={canApply ? recommendationApplySummary(recommendation) : "Import record for this recommendation was not found."}
                            >
                              {isApplying ? "Applying..." : "Apply suggestion"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {aiIngestReport.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-bold leading-5 text-amber-900">
                    {aiIngestReport.warnings[0]}
                  </div>
                )}
              </div>
            )}
            {premiereDraftEdits.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#3d3122] bg-[#fffdf7] p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black uppercase tracking-[0.18em] text-[#3d3122]">Premiere draft edits</div>
                    <p className="mt-1 leading-5 text-[#6f5336]">
                      Local Mac imports can stage Premiere timelines here. Review matching first, then promote only when you want this draft to become the active Quipsly timeline.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#d8b777] bg-[#fff8ec] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7b4f1f]">
                    {premiereDraftEdits.length} staged
                  </span>
                </div>

                <div className="mt-3 grid gap-3">
                  {premiereDraftEdits.map((draft) => {
                    const matchedPercent = draft.timelineClipCount > 0
                      ? Math.round((draft.matchedTimelineClipCount / draft.timelineClipCount) * 100)
                      : 0;
                    const isPromoting = promotingPremiereDraftId === draft.id;
                    const assetNamesByPremiereId = new Map(draft.assetMatches.map((match) => [match.id, match.displayName]));
                    const preservedEditDecisionRows = [...draft.deactivatedSourceRanges]
                      .sort((left, right) => right.duration - left.duration)
                      .slice(0, 6);
                    const preservedEditDecisionDuration = draft.deactivatedSourceRanges.reduce((total, range) => total + Math.max(0, range.duration), 0);
                    const matchedPreservedDecisionCount = draft.deactivatedSourceRanges.filter((range) => range.matchStatus === "matched").length;
                    const preservedEditDecisionReport = [
                      "Quipsly preserved Premiere edit decisions",
                      "",
                      `Project: ${draft.projectSlug}`,
                      `Episode: ${draft.episodeSlug}`,
                      `Sequence: ${draft.primarySequenceName}`,
                      "",
                      "Meaning:",
                      "Premiere cut or deactivated these source ranges. Quipsly preserved them so they can become restore, shorten, extend, or leave-skipped decisions later.",
                      "",
                      `Summary: ${draft.deactivatedSourceRanges.length} preserved range(s), ${formatClock(preservedEditDecisionDuration)} skipped, ${matchedPreservedDecisionCount} matched.`,
                      "",
                      "Preserved ranges:",
                      ...draft.deactivatedSourceRanges.map((range) => {
                        const sourceName = assetNamesByPremiereId.get(range.premiereAssetId) ?? range.premiereAssetId ?? range.assetId;
                        return `- ${sourceName} [${humanizeSlug(range.matchStatus)}]: ${range.kind}, ${formatClock(range.sourceStart)}-${formatClock(range.sourceEnd)}, ${formatClock(range.duration)} skipped${range.reason ? `, reason: ${range.reason}` : range.confidence ? `, confidence: ${humanizeSlug(range.confidence)}` : ""}`;
                      }),
                    ].join("\n");
                    return (
                      <div key={draft.id} className="rounded-xl border border-[#e8dcc4] bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-black text-[#3d3122]">{draft.episodeSlug} / {draft.primarySequenceName}</div>
                            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                              {draft.stagedAt ? `Staged ${new Date(draft.stagedAt).toLocaleString()}` : "Staged draft"}
                            </div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                            draft.heldMediaCount > 0 || draft.matchedTimelineClipCount < draft.timelineClipCount
                              ? "border-amber-200 bg-amber-50 text-amber-900"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                          }`}>
                            {draft.matchedTimelineClipCount}/{draft.timelineClipCount} clips matched
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                          <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                            <div className="font-mono text-lg font-black text-[#3d3122]">{draft.timelineClipCount}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">timeline clips</div>
                          </div>
                          <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                            <div className="font-mono text-lg font-black text-[#3d3122]">{matchedPercent}%</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">asset match</div>
                          </div>
                          <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                            <div className="font-mono text-lg font-black text-[#3d3122]">{draft.deactivatedSourceRangeCount}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">cut ranges</div>
                          </div>
                          <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                            <div className="font-mono text-lg font-black text-emerald-800">{draft.readyMediaCount}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">ready media</div>
                          </div>
                          <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2">
                            <div className="font-mono text-lg font-black text-amber-900">{draft.heldMediaCount}</div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">held media</div>
                          </div>
                        </div>

                        {draft.warnings.length > 0 && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-900">
                            <div className="font-black">Before promoting</div>
                            {draft.warnings.slice(0, 3).map((warning) => (
                              <div key={warning} className="mt-1">- {warning}</div>
                            ))}
                          </div>
                        )}

                        {draft.assetMatches.length > 0 && (
                          <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] px-3 py-2">
                            <div className="font-black text-[#3d3122]">Asset match sample</div>
                            <div className="mt-2 grid gap-1">
                              {draft.assetMatches.slice(0, 5).map((match) => (
                                <div key={match.id} className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#6f5336]">
                                  <span className="truncate">{match.displayName}</span>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                                    match.status === "matched"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : match.status === "held"
                                        ? "border-amber-200 bg-amber-50 text-amber-900"
                                        : "border-slate-200 bg-slate-50 text-slate-700"
                                  }`}>
                                    {humanizeSlug(match.status)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {draft.deactivatedSourceRanges.length > 0 && (
                          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-950">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-black text-[#2f261a]">Preserved edit decisions</div>
                                <p className="mt-1 text-[11px] font-bold leading-5 opacity-80">
                                  Premiere cut these source ranges out. Quipsly keeps them visible so they can become restore, shorten, extend, or leave-skipped decisions later.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
                                <span className="rounded-full border border-indigo-200 bg-white px-2 py-1">
                                  {draft.deactivatedSourceRanges.length} range{draft.deactivatedSourceRanges.length === 1 ? "" : "s"}
                                </span>
                                <span className="rounded-full border border-indigo-200 bg-white px-2 py-1">
                                  {formatClock(preservedEditDecisionDuration)} skipped
                                </span>
                                <span className="rounded-full border border-indigo-200 bg-white px-2 py-1">
                                  {matchedPreservedDecisionCount} matched
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 grid gap-1">
                              {preservedEditDecisionRows.map((range) => {
                                const sourceName = assetNamesByPremiereId.get(range.premiereAssetId) ?? range.premiereAssetId ?? range.assetId;
                                const matched = range.matchStatus === "matched";
                                const matchingClip = draft.timelineClips.find((clip) => {
                                  const sourceOut = clip.sourceEnd ?? (clip.sourceStart + clip.duration);
                                  const sameAsset = clip.assetId === range.assetId || clip.assetId === range.premiereAssetId;
                                  return sameAsset && range.sourceStart >= clip.sourceStart - 0.05 && range.sourceStart <= sourceOut + 0.05;
                                }) ?? draft.timelineClips.find((clip) =>
                                  clip.assetId === range.assetId || clip.assetId === range.premiereAssetId
                                ) ?? null;
                                const exactSourceCue = matchingClip
                                  ? range.sourceStart >= matchingClip.sourceStart - 0.05
                                    && range.sourceStart <= (matchingClip.sourceEnd ?? (matchingClip.sourceStart + matchingClip.duration)) + 0.05
                                  : false;
                                return (
                                  <div key={range.id} className="rounded-md border border-indigo-100 bg-white px-2 py-1.5">
                                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#3d3122]">
                                      <span className="truncate">{sourceName}</span>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                                          matched
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                            : "border-amber-200 bg-amber-50 text-amber-900"
                                        }`}>
                                          {humanizeSlug(range.matchStatus)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!matchingClip) {
                                              setMediaImportStatus(`No active source clip found for preserved range from ${sourceName}. Import/relink that media before cueing it.`);
                                              return;
                                            }
                                            const sourceOffset = Math.max(0, range.sourceStart - matchingClip.sourceStart);
                                            const cueTime = Math.max(0, Math.min(totalDuration, matchingClip.startIn + sourceOffset));
                                            setSelectedClipId(matchingClip.id);
                                            setCurrentTime(cueTime);
                                            setViewMode("timeline");
                                            setEditorMode("play-all");
                                            setIsPreviewPlaying(false);
                                            setMediaImportStatus(
                                              exactSourceCue
                                                ? `Cued preserved range from ${sourceName} at source ${formatClock(range.sourceStart)}. No timeline changes made.`
                                                : `Cued nearest active use of ${sourceName}. The preserved source range is not active on the timeline yet. No timeline changes made.`
                                            );
                                          }}
                                          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-black text-[9px] text-indigo-900 hover:bg-indigo-100"
                                          title="Cue in Source Monitor (play all material, ignoring cuts)"
                                        >
                                          {exactSourceCue ? "Cue range in Source" : "Cue in Source Monitor"}
                                        </button>
                                        {matchingClip && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const restoredKind = matchingClip.kind === "audio" || range.kind === "audio" ? "audio" : "video";
                                              const previewStart = Math.max(0, totalDuration);
                                              const previewClip: TimelineClip = {
                                                id: `premiere-restore-preview-${range.id}-${Date.now()}`,
                                                assetId: matchingClip.assetId || range.assetId || range.premiereAssetId,
                                                sourceId: matchingClip.sourceId,
                                                kind: restoredKind,
                                                trackId: restoredKind === "audio" ? "A9" : "V9",
                                                startIn: previewStart,
                                                duration: Math.max(0.05, range.duration),
                                                sourceStart: Math.max(0, range.sourceStart),
                                                sourceEnd: Math.max(range.sourceStart + Math.max(0.05, range.duration), range.sourceEnd),
                                                name: `Restore preview - ${sourceName}`,
                                                color: "#4f46e5",
                                                volume: matchingClip.volume,
                                                aiSuggested: true,
                                              };

                                              addClip(previewClip);
                                              setSelectedClipId(previewClip.id);
                                              setCurrentTime(previewStart);
                                              setViewMode("timeline");
                                              setEditorMode("play-all");
                                              setIsPreviewPlaying(false);
                                              setTimelineSaveStateSafe("conflict");
                                              setSessionSummary(`Previewing preserved Premiere range from ${sourceName}. This local restore preview is not promoted yet.`);
                                              setMediaImportStatus(`Added a local restore preview for ${sourceName} at ${formatClock(previewStart)}. Review it, then save/promote intentionally if you want to keep it.`);
                                            }}
                                            className="rounded border border-indigo-300 bg-white px-2 py-0.5 font-black text-[9px] text-indigo-900 hover:bg-indigo-50"
                                            title="Add this range back to the timeline and preview it"
                                          >
                                            Preview Restore
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-indigo-900/75">
                                      <span>{range.kind}</span>
                                      <span>{formatClock(range.sourceStart)}-{formatClock(range.sourceEnd)}</span>
                                      <span>{formatClock(range.duration)} skipped</span>
                                    </div>
                                    {(range.reason || range.confidence) && (
                                      <div className="mt-1 text-[10px] font-bold leading-4 text-indigo-900/70">
                                        {range.reason || `Confidence: ${humanizeSlug(range.confidence)}`}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {draft.deactivatedSourceRanges.length > preservedEditDecisionRows.length && (
                                <div className="rounded-md border border-dashed border-indigo-200 bg-white px-2 py-1.5 text-[10px] font-black text-indigo-900">
                                  + {draft.deactivatedSourceRanges.length - preservedEditDecisionRows.length} more preserved decision{draft.deactivatedSourceRanges.length - preservedEditDecisionRows.length === 1 ? "" : "s"} in the staged draft.
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 border-t border-[#e8dcc4] pt-3">
                          <div className="mb-3 text-[11px] font-bold leading-5 text-[#6f5336]">
                            <span className="font-black text-[#3d3122]">Promotion replaces the active timeline.</span> A backup of the current timeline will be saved to history, which you can restore from the Mac app. Local preview restore clips will be included in the promoted timeline.
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => previewPremiereDraftEdit(draft)}
                            disabled={draft.timelineClips.length === 0}
                            className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-3 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7] disabled:cursor-not-allowed disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                          >
                            Preview locally
                          </button>
                          <button
                            type="button"
                            onClick={() => void promotePremiereDraftEdit(draft)}
                            disabled={isPromoting || draft.timelineClipCount === 0}
                            className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-3 py-2 font-black text-white shadow-sm hover:bg-[#59442d] disabled:cursor-wait disabled:border-[#d8b777] disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                          >
                            {isPromoting ? "Promoting with backup..." : "Promote to active timeline"}
                          </button>
                          <button
                            type="button"
                            onClick={refreshEpisodeProductionState}
                            className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-3 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                          >
                            Refresh staged drafts
                          </button>
                          {draft.deactivatedSourceRanges.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(preservedEditDecisionReport)
                                  .then(() => {
                                    setMediaImportStatus(`Copied ${draft.deactivatedSourceRanges.length} preserved Premiere edit decision(s).`);
                                  })
                                  .catch(() => {
                                    setMediaImportStatus("Could not copy preserved decisions. Browser clipboard access was blocked.");
                                  });
                              }}
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 font-black text-indigo-900 hover:bg-indigo-100"
                            >
                              Copy preserved decisions
                            </button>
                          )}
                          <span className="text-[11px] font-bold leading-5 text-[#8c6b4a]">
                            Promotion creates a timeline backup first. It does not delete the staged draft.
                          </span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            {timelineBackups.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#d8b777] bg-[#fffaf0] p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black uppercase tracking-[0.18em] text-[#3d3122]">Timeline backups</div>
                    <p className="mt-1 leading-5 text-[#6f5336]">
                      Quipsly creates these before Premiere draft promotion and backup restores. Restoring also creates a fresh pre-restore backup.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#d8b777] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7b4f1f]">
                    {timelineBackups.length} backup{timelineBackups.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  {timelineBackups.slice(0, 6).map((backup) => {
                    const isRestoring = restoringTimelineBackupId === backup.id;
                    return (
                      <div key={backup.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e8dcc4] bg-white px-3 py-2 shadow-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[11px] font-black text-[#3d3122]">{backup.id}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                            <span>{backup.timelineClipCount} clip{backup.timelineClipCount === 1 ? "" : "s"}</span>
                            <span>{humanizeSlug(backup.source)}</span>
                            {backup.draftEditId && <span>draft {backup.draftEditId}</span>}
                            {backup.restoredFromBackupId && <span>restored from {backup.restoredFromBackupId}</span>}
                            {backup.createdAt && <span>{new Date(backup.createdAt).toLocaleString()}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void restoreTimelineBackup(backup)}
                          disabled={isRestoring || backup.timelineClipCount === 0}
                          className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-3 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7] disabled:cursor-wait disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                        >
                          {isRestoring ? "Restoring..." : "Restore backup"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              id="guided-sync-wizard"
              className={`mt-3 rounded-lg border border-[#3d3122] bg-[#fffdf7] p-3 shadow-sm ${realEditingMode ? "hidden" : ""}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-black uppercase tracking-[0.18em] text-[#3d3122]">Guided sync wizard</div>
                  <p className="mt-1 leading-5 text-[#6f5336]">
                    One safe pass: choose the spine and target, inspect any clock proposal, preview two moments, then approve a reversible placement.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-800">
                    {syncHistory.length} undo point{syncHistory.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void undoLastSyncChange()}
                    disabled={!latestSyncSnapshot}
                    className="rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-black text-[#7b4f1f] shadow-sm hover:bg-[#fff8ec] disabled:cursor-not-allowed disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                    title={latestSyncSnapshot?.label || latestSyncSnapshot?.type || "No sync change to undo"}
                  >
                    Undo last sync change
                  </button>
                </div>
              </div>

              {captureGroupFocus && (
                <div
                  className={`mt-3 rounded-xl border p-3 ${
                    captureGroupFocus.matched
                      ? "border-sky-200 bg-sky-50 text-sky-950"
                      : "border-amber-300 bg-amber-50 text-amber-950"
                  }`}
                  data-testid="capture-group-editor-focus"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black">
                        {captureGroupFocus.matched
                          ? "Opened from Capture — exact take focused"
                          : "Capture handoff needs refresh"}
                      </div>
                      <p className="mt-1 text-[11px] font-bold leading-5">
                        {captureGroupFocus.message}
                      </p>
                    </div>
                    <span className="max-w-full break-all rounded-full border border-current bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                      {captureGroupFocus.requestedCaptureGroupId}
                    </span>
                  </div>
                  {captureGroupFocus.matched && (
                    <p className="mt-2 text-[11px] font-bold leading-5">
                      Quipsly selected this group&apos;s microphone master and
                      first camera source only as the starting view. It did not
                      change the episode spine, place clips, approve clock
                      offsets, or claim sample accuracy.
                    </p>
                  )}
                </div>
              )}

              <SyncStatusGuide compact />

              <div className="mt-3 grid gap-3">
                <label className="block">
                  <span className="font-black text-[#3d3122]">1. Pick spine audio</span>
                  <MediaAssetPicker
                    assets={importedAudioAssets as any}
                    selectedId={syncWizardSpineAssetId}
                    spineAssetId={persistedSpineAudio?.assetId ?? undefined}
                    onSelect={(id) => setSyncWizardSpineAssetId(id)}
                    getAssetHealthLabel={(asset) => {
                      const health = importedAssetHealth(asset as any);
                      return health ? healthStatusLabel(health.status) : "Unchecked";
                    }}
                    getAssetHealthTone={(asset) => {
                      const health = importedAssetHealth(asset as any);
                      return healthStatusStyles(health?.status ?? "unchecked");
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => syncWizardSpineAsset && void setEpisodeSpineAudio({ asset: syncWizardSpineAsset })}
                    disabled={!syncWizardSpineAsset}
                    className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    Make selected import the episode spine
                  </button>
                </label>

                {timelineAudioClips.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="font-black text-emerald-950">Timeline audio clips can also be the spine</div>
                    <div className="mt-2 grid gap-2">
                      {timelineAudioClips.slice(0, 4).map((clip) => (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => void setEpisodeSpineAudio({ clip })}
                          className={`rounded-lg border px-3 py-2 text-left font-bold ${
                            persistedSpineAudio?.clipId === clip.id
                              ? "border-emerald-400 bg-white text-emerald-900"
                              : "border-emerald-200 bg-white/70 text-emerald-900 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{clip.name}</span>
                            <span className="font-mono text-[10px]">{clip.trackId} / {formatClock(clip.startIn)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="font-black text-[#3d3122]">2. Pick target media</span>
                  <select
                    value={syncWizardTargetAssetId}
                    onChange={(event) => setSyncWizardTargetAssetId(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-bold text-[#3d3122]"
                  >
                    <option value="">No target media selected yet</option>
                    {syncWizardTargetOptions.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.originalName} ({asset.kind}, {formatBytes(asset.size)})
                      </option>
                    ))}
                  </select>
                  {syncWizardTargetAsset && (() => {
                    const targetHealth = importedAssetHealth(syncWizardTargetAsset);
                    const targetConfidence = importedAssetConfidenceStatus(syncWizardTargetAsset, targetHealth);
                    return (
                      <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${targetConfidence.tone}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black">Status: {targetConfidence.label}</div>
                            <div className="mt-1">{targetConfidence.meaning}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                            {syncWizardTargetAsset.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] opacity-80">
                          Next: {targetConfidence.next}
                        </div>
                      </div>
                    );
                  })()}
                </label>

                {syncWizardCaptureAlignment && (
                  <div
                    className={`rounded-xl border p-3 ${
                      syncWizardCaptureAlignment.status === "proposal-ready"
                        ? "border-sky-200 bg-sky-50"
                        : "border-red-200 bg-red-50"
                    }`}
                    data-testid="guided-sync-clock-proposal"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`font-black ${
                          syncWizardCaptureAlignment.status === "proposal-ready"
                            ? "text-sky-950"
                            : "text-red-950"
                        }`}>
                          Capture clock proposal — evidence, not an edit
                        </div>
                        <p className={`mt-1 text-[11px] font-bold leading-5 ${
                          syncWizardCaptureAlignment.status === "proposal-ready"
                            ? "text-sky-900"
                            : "text-red-900"
                        }`}>
                          {syncWizardCaptureAlignment.reason}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-current bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                        {syncWizardCaptureAlignment.status === "proposal-ready"
                          ? "clock proposal ready"
                          : "proposal unsafe"}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="min-w-0 rounded-lg border border-white/80 bg-white/70 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Proposed offset</div>
                        <div className="mt-1 break-words font-mono text-lg font-black text-slate-950">
                          {syncWizardCaptureAlignment.estimatedOffsetMilliseconds === null
                            ? "Unavailable"
                            : `${(syncWizardCaptureAlignment.estimatedOffsetMilliseconds / 1_000).toFixed(3)} s`}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-lg border border-white/80 bg-white/70 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Clock uncertainty</div>
                        <div className="mt-1 break-words font-mono text-lg font-black text-slate-950">
                          {syncWizardCaptureAlignment.uncertaintyMilliseconds === null
                            ? "Unknown"
                            : `±${Math.round(syncWizardCaptureAlignment.uncertaintyMilliseconds)} ms`}
                        </div>
                      </div>
                      <div className="min-w-0 rounded-lg border border-white/80 bg-white/70 p-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Projected start</div>
                        <div className="mt-1 break-words font-mono text-[11px] font-black leading-5 text-slate-950">
                          {syncWizardCaptureAlignment.estimatedServerStartedAt
                            ? new Date(syncWizardCaptureAlignment.estimatedServerStartedAt).toLocaleString()
                            : "Unavailable"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-[11px] font-bold leading-5 text-slate-700">
                      Baseline recording: <span className="break-all font-mono">{syncWizardCaptureAlignment.baselineRecordingAssetId ?? "not recorded"}</span>.
                      {" "}This proposal never claims sample accuracy and will not move anything until you explicitly use it and complete waveform and drift review.
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (syncWizardCaptureAlignment.estimatedOffsetMilliseconds === null) return;
                        setSyncWizardPreviousAnchorSeconds(syncWizardAnchorSeconds);
                        setSyncWizardAnchorSeconds(roundSeconds(
                          syncWizardCaptureAlignment.estimatedOffsetMilliseconds / 1_000,
                        ));
                      }}
                      disabled={!canUseClockProposal}
                      className="mt-3 w-full rounded-lg border border-sky-300 bg-white px-3 py-2 font-black text-sky-950 shadow-sm hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      Use clock proposal as rough anchor
                    </button>
                    {!clockProposalMatchesSpine && (
                      <p className="mt-2 text-[11px] font-bold leading-5 text-slate-700">
                        Choose the exact baseline recording above before this offset can be copied into the rough anchor.
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-[#e8dcc4] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">3. Rough timeline anchor</div>
                      <div className="mt-1 font-mono text-[11px] text-[#8c6b4a]">
                        Target starts at {formatSyncClock(syncWizardAnchorSeconds)}. Playhead is {formatSyncClock(currentTime)}.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSyncWizardPreviousAnchorSeconds(syncWizardAnchorSeconds);
                        setSyncWizardAnchorSeconds(roundSeconds(currentTime));
                      }}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-3 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                    >
                      Use playhead
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={syncWizardAnchorSeconds}
                    onChange={(event) => {
                      setSyncWizardPreviousAnchorSeconds(syncWizardAnchorSeconds);
                      setSyncWizardAnchorSeconds(Math.max(0, roundSeconds(Number(event.target.value) || 0)));
                    }}
                    className="mt-3 w-full rounded-lg border border-[#d8b777] bg-white px-3 py-2 font-mono text-[#3d3122]"
                  />
                </div>

                <div className="rounded-xl border border-[#3d3122] bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">4. Sync preview - confidence check</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                        This previews the spine at the current anchor against the selected target at its beginning. It is not final NLE playback yet; it is a quick alignment sanity check.
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                        syncPreviewState === "playing"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : syncPreviewState === "error"
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-[#e8dcc4] bg-[#fffaf0] text-[#8c6b4a]"
                      }`}
                    >
                      {syncPreviewState}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Spine starts</div>
                      <div className="mt-1 font-mono text-xl font-black text-[#3d3122]">{formatSyncClock(syncWizardAnchorSeconds)}</div>
                    </div>
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Target starts</div>
                      <div className="mt-1 font-mono text-xl font-black text-[#3d3122]">{formatSyncClock(0)}</div>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-800">Current offset</div>
                      <div className="mt-1 font-mono text-xl font-black text-sky-950">+{formatSyncClock(syncWizardAnchorSeconds)}</div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] px-3 py-2 text-[11px] font-bold leading-5 text-[#6f5336]">
                    Translation: when you click preview, the spine jumps to {formatSyncClock(syncWizardAnchorSeconds)} and the target starts at 00:00.000. If the target moment sounds late, move it earlier. If it sounds early, move it later.
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-2">
                      <div className="font-black text-[#7b4f1f]">Spine audio</div>
                      <div className="mt-1 truncate font-bold text-[#3d3122]">{syncWizardSpineAsset?.originalName ?? "No spine selected"}</div>
                      {syncWizardSpineAsset?.playbackUrl ? (
                        <audio
                          ref={syncPreviewSpineRef}
                          src={syncWizardSpineAsset.playbackUrl}
                          controls
                          preload="metadata"
                          className="mt-2 w-full"
                        />
                      ) : (
                        <div className="mt-2 rounded-lg border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                          Select an imported spine audio file to enable preview.
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-2">
                      <div className="font-black text-[#7b4f1f]">Target media</div>
                      <div className="mt-1 truncate font-bold text-[#3d3122]">{syncWizardTargetAsset?.originalName ?? "No target selected"}</div>
                      {syncWizardTargetAsset?.playbackUrl && syncWizardTargetAsset.kind === "video" && (
                        <video
                          ref={(node) => {
                            syncPreviewTargetRef.current = node;
                          }}
                          src={syncWizardTargetAsset.playbackUrl}
                          controls
                          preload="metadata"
                          muted
                          className="mt-2 max-h-44 w-full rounded-lg bg-black"
                        />
                      )}
                      {syncWizardTargetAsset?.playbackUrl && syncWizardTargetAsset.kind !== "video" && (
                        <audio
                          ref={(node) => {
                            syncPreviewTargetRef.current = node;
                          }}
                          src={syncWizardTargetAsset.playbackUrl}
                          controls
                          preload="metadata"
                          className="mt-2 w-full"
                        />
                      )}
                      {!syncWizardTargetAsset?.playbackUrl && (
                        <div className="mt-2 rounded-lg border border-dashed border-[#d8b777] bg-white px-3 py-2 text-[11px] font-bold text-[#8c6b4a]">
                          Select a target audio or video file to enable preview.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => void previewSyncFromAnchor()}
                      disabled={!syncWizardSpineAsset?.playbackUrl || !syncWizardTargetAsset?.playbackUrl}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left font-black text-emerald-950 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Preview from anchor
                    </button>
                    <button
                      type="button"
                      onClick={pauseSyncPreview}
                      disabled={syncPreviewState !== "playing"}
                      className="rounded-xl border border-[#e8dcc4] bg-[#fff8ec] px-3 py-3 text-left font-black text-[#7b4f1f] shadow-sm hover:bg-[#f3e4c7] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Pause both
                    </button>
                    <button
                      type="button"
                      onClick={resetSyncPreview}
                      disabled={!syncWizardSpineAsset?.playbackUrl && !syncWizardTargetAsset?.playbackUrl}
                      className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-3 text-left font-black text-[#3d3122] shadow-sm hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      Reset preview
                    </button>
                  </div>

                  <div className={`mt-3 rounded-lg border px-3 py-2 font-bold leading-5 ${
                    syncPreviewState === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}>
                    {syncPreviewMessage}
                  </div>
                </div>

                <div className="rounded-xl border border-[#3d3122] bg-[#fffdf7] p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-[#3d3122]">5. Move selected target until it lines up</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-[#6f5336]">
                        These buttons only move the saved sync anchor for {syncWizardTargetAsset?.originalName ?? "the selected target"}. They do not cut or move timeline clips.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                      Target anchor
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Before</div>
                      <div className="mt-1 font-mono text-2xl font-black text-[#3d3122]">
                        {formatSyncClock(syncWizardPreviousAnchorSeconds ?? syncWizardAnchorSeconds)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">After</div>
                      <div className="mt-1 font-mono text-2xl font-black text-emerald-950">
                        {formatSyncClock(syncWizardAnchorSeconds)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                      { delta: -10, label: "10 sec earlier", value: "-10s" },
                      { delta: -1, label: "1 sec earlier", value: "-1s" },
                      { delta: -0.1, label: "Tiny earlier", value: "-0.1s" },
                      { delta: 0.1, label: "Tiny later", value: "+0.1s" },
                      { delta: 1, label: "1 sec later", value: "+1s" },
                      { delta: 10, label: "10 sec later", value: "+10s" },
                    ].map((nudge) => (
                      <button
                        key={nudge.value}
                        type="button"
                        onClick={() => nudgeSyncWizardAnchor(nudge.delta)}
                        disabled={!syncWizardTargetAsset}
                        className={`min-h-20 rounded-xl border px-3 py-3 text-left shadow-sm transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 ${
                          nudge.delta < 0
                            ? "border-sky-200 bg-sky-50 text-sky-950 hover:bg-sky-100"
                            : "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
                        }`}
                      >
                        <div className="font-mono text-2xl font-black">{nudge.value}</div>
                        <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em]">{nudge.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 text-[11px] font-bold leading-5 text-[#6f5336]">
                    If the target sound happens too late, use an earlier button. If it happens too soon, use a later button. Then check a later moment before approving the placement.
                  </div>
                </div>

                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-sm" data-testid="guided-sync-review-evidence">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-black text-violet-950">6. Record the review evidence</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-violet-900">
                        “Synced” is a human-reviewed timeline decision. Originals stay untouched, and this receipt can be audited or undone.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-violet-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-violet-900">
                      {syncReviewEvidenceComplete ? "ready to approve" : "review incomplete"}
                    </span>
                  </div>

                  {syncWizardSpineAsset && syncWizardTargetAsset && (
                    <>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="durable-audio-signal-profile-status">
                        {[
                          { role: "Spine", asset: syncWizardSpineAsset, profile: syncWizardSpineSignalProfile },
                          { role: "Target", asset: syncWizardTargetAsset, profile: syncWizardTargetSignalProfile },
                        ].map(({ role, asset, profile }) => {
                          const isWorking = queueingMediaJobKeys.has(`${asset.id}:audio-signal-profile`);
                          return (
                            <div key={`${role}:${asset.id}`} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[10px] font-bold text-violet-950">
                              <div className="flex items-center justify-between gap-2">
                                <span className="uppercase tracking-[0.14em]">{role} signal receipt</span>
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono uppercase">{profile?.status ?? "checking"}</span>
                              </div>
                              <div className="mt-1 truncate text-violet-800">{asset.originalName}</div>
                              {profile?.status === "completed" && profile.audioSignal && (
                                <div className="mt-1 text-emerald-800">Complete decode · immutable source bound · max 1,200 windows</div>
                              )}
                              {profile?.status === "failed" && (
                                <div className="mt-1">
                                  <div className="text-rose-800">{profile.error || "Signal evidence failed."}</div>
                                  <button type="button" disabled={isWorking} onClick={() => void operateAudioSignalProfile(asset)} className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-black text-rose-900 disabled:opacity-50">Retry exact-source decode</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <SourceSyncEvidenceMap
                        spineLabel={syncWizardSpineAsset.originalName}
                        targetLabel={syncWizardTargetAsset.originalName}
                        targetKind={syncWizardTargetAsset.kind}
                        anchorSeconds={syncWizardAnchorSeconds}
                        observationIntervalSeconds={syncEvidenceObservationIntervalSeconds}
                        residualDriftMilliseconds={syncEvidenceResidualMilliseconds}
                        targetDurationSeconds={syncWizardTargetDurationSeconds}
                        spineSignal={syncWizardSpineSignal}
                        targetSignal={syncWizardTargetSignal}
                      />
                    </>
                  )}

                  {syncWizardSavedReview && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold leading-5 text-emerald-950">
                      <div className="font-black">Existing reviewed placement</div>
                      <div className="mt-1">
                        {syncWizardSavedReview.reviewer.name} approved {formatSyncClock(syncWizardSavedReview.placement.anchorTimelineSeconds)}
                        {" "}on {new Date(syncWizardSavedReview.reviewedAt).toLocaleString()} using {syncWizardSavedReview.sourceEvidence.strength === "sha256-pair" ? "two verified SHA-256 identities" : "stable source identities"}.
                      </div>
                      <div className="mt-1 font-mono text-[10px]">
                        residual {syncWizardSavedReview.driftReview.residualDriftMilliseconds.toFixed(3)} ms /
                        {" "}{syncWizardSavedReview.driftReview.observationIntervalSeconds.toFixed(3)} s ·
                        {" "}{syncWizardSavedReview.driftReview.observedPartsPerMillion.toFixed(3)} ppm
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid gap-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-violet-200 bg-white p-3">
                      <input
                        type="checkbox"
                        checked={syncReviewWaveformConfirmed}
                        onChange={(event) => setSyncReviewWaveformConfirmed(event.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-violet-700"
                      />
                      <span className="min-w-0">
                        <span className="block font-black text-violet-950">Opening event matches</span>
                        <span className="mt-1 block text-[11px] font-bold leading-5 text-violet-900">
                          I listened at the proposed sync point and confirmed the same word, clap, or waveform event in both sources.
                        </span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-violet-200 bg-white p-3">
                      <input
                        type="checkbox"
                        checked={syncReviewDriftConfirmed}
                        onChange={(event) => setSyncReviewDriftConfirmed(event.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-violet-700"
                      />
                      <span className="min-w-0">
                        <span className="block font-black text-violet-950">Later event compared</span>
                        <span className="mt-1 block text-[11px] font-bold leading-5 text-violet-900">
                          I compared another shared event later in the take and recorded its residual drift below.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="font-black text-violet-950">Seconds between review points</span>
                      <input
                        type="number"
                        min="0.001"
                        max="86400"
                        step="0.001"
                        inputMode="decimal"
                        value={syncReviewIntervalSeconds}
                        onChange={(event) => setSyncReviewIntervalSeconds(event.target.value)}
                        placeholder="e.g. 1800"
                        className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-violet-950"
                      />
                    </label>
                    <label className="block">
                      <span className="font-black text-violet-950">Residual drift at later point (ms)</span>
                      <input
                        type="number"
                        min="-60000"
                        max="60000"
                        step="0.001"
                        inputMode="decimal"
                        value={syncReviewResidualMilliseconds}
                        onChange={(event) => setSyncReviewResidualMilliseconds(event.target.value)}
                        placeholder="0 is valid"
                        className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-violet-950"
                      />
                    </label>
                  </div>

                  <div className="mt-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-bold leading-5 text-violet-950">
                    Observed drift: <span className="font-mono font-black">
                      {syncReviewObservedPartsPerMillion === null
                        ? "enter both measurements"
                        : `${syncReviewObservedPartsPerMillion.toFixed(3)} ppm`}
                    </span>.
                    {" "}This records evidence only; it does not silently stretch or resample media.
                  </div>

                  <label className="mt-3 block">
                    <span className="font-black text-violet-950">Review notes (optional)</span>
                    <textarea
                      value={syncReviewNotes}
                      onChange={(event) => setSyncReviewNotes(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Name the opening and later events you compared."
                      className="mt-1 w-full resize-y rounded-lg border border-violet-200 bg-white px-3 py-2 font-bold text-violet-950"
                    />
                  </label>

                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-violet-300 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={syncReviewHumanApproved}
                      onChange={(event) => setSyncReviewHumanApproved(event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-violet-700"
                    />
                    <span className="min-w-0">
                      <span className="block font-black text-violet-950">Approve this reversible placement</span>
                      <span className="mt-1 block text-[11px] font-bold leading-5 text-violet-900">
                        I approve the current anchor. Source bytes stay unchanged, and I understand this is not a sample-accuracy claim.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="rounded-xl border border-red-200 bg-red-50 p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-red-950">7. Something looks wrong</div>
                      <p className="mt-1 text-[11px] font-bold leading-5 text-red-900">
                        Recovery actions for sync panic. These avoid destructive timeline edits and keep the current episode diagnosable.
                      </p>
                    </div>
                    <span className="rounded-full border border-red-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-red-800">
                      safe recovery
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void holdSyncWizardTarget()}
                      disabled={!syncWizardTargetAsset}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Hold this file</div>
                    <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Parks {syncWizardTargetAsset?.originalName ?? "the selected target"} for later so it stops feeling urgent.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void undoLastSyncChange()}
                      disabled={!latestSyncSnapshot}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Revert last sync</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Undo: {latestSyncSnapshot?.label || latestSyncSnapshot?.type || "no sync history yet"}.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void detachSourceFromSelectedClip()}
                      disabled={!selectedClip?.assetId}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <div className="font-black text-red-950">Detach source from selected clip</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Clears the selected clip source after saving an undo point. Clip: {selectedClip?.name ?? "none selected"}.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copySyncDiagnosticJson()}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100"
                    >
                      <div className="font-black text-red-950">Copy diagnostic JSON</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Copies route, selected clip, target media, latest sync snapshot, and health summary for debugging.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={refreshEpisodeProductionState}
                      className="rounded-xl border border-red-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-red-100 md:col-span-2"
                    >
                      <div className="font-black text-red-950">Refresh DB state</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 text-red-800">
                        Reloads the episode production record from the database without changing saved media or timeline data.
                      </div>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void saveSyncWizardAlignment()}
                  disabled={
                    !syncWizardTargetAsset
                    || !syncWizardSpineAsset
                    || !syncReviewEvidenceComplete
                    || isSavingAlignmentReview
                  }
                  className="rounded-xl border border-[#3d3122] bg-[#3d3122] px-4 py-3 font-black text-white shadow-sm hover:bg-[#59442d] disabled:cursor-not-allowed disabled:border-[#d8b777] disabled:bg-[#f3e4c7] disabled:text-[#8c6b4a]"
                >
                  {isSavingAlignmentReview
                    ? "8. Saving reviewed placement..."
                    : "8. Approve reviewed placement"}
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm" data-testid="episode-media-truth-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">Episode media truth</div>
                  <div className="mt-1 font-black text-[#12382c]">Recordings, proxies, transcripts, and safe next actions</div>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-emerald-950/75">
                    Read-only Nest truth from <code className="rounded bg-white/70 px-1">/api/media-vault/episode-inventory</code>. It never uploads, promotes, transcribes, publishes, or mutates originals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEpisodeMediaTruthRefreshToken((token) => token + 1)}
                  className="rounded-full border border-emerald-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-900 shadow-sm hover:bg-emerald-100"
                >
                  Refresh truth
                </button>
              </div>

              {episodeMediaTruthStatus === "loading" ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-emerald-900">
                  Loading server media truth...
                </div>
              ) : episodeMediaTruthStatus === "error" ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-900">
                  {episodeMediaTruthError ?? "Could not load episode media truth."}
                </div>
              ) : episodeMediaTruth ? (
                <>
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    {[
                      ["Imported", episodeMediaTruth.summary?.importedMediaCount ?? 0],
                      ["Recordings", episodeMediaTruth.summary?.sourceRecordingCount ?? 0],
                      ["Proxy ready", episodeMediaTruth.summary?.proxyReadyCount ?? 0],
                      ["Need proxy", episodeMediaTruth.summary?.proxyNeededCount ?? 0],
                      ["Transcripts", episodeMediaTruth.summary?.completedTranscriptJobCount ?? 0],
                      ["Attached assets", episodeMediaTruth.summary?.attachedAssetCount ?? 0],
                      ["Video", episodeMediaTruth.summary?.videoCount ?? 0],
                      ["Audio", episodeMediaTruth.summary?.audioCount ?? 0],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                        <div className="font-mono text-xl font-black text-[#12382c]">{value}</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-lg border border-emerald-200 bg-white p-3">
                      <div className="font-black text-[#12382c]">Whole-source media</div>
                      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                        {(episodeMediaTruth.importedMedia ?? []).slice(0, 8).map((item, index) => (
                          <div key={`${item.id ?? item.originalName ?? index}`} className="rounded-lg border border-[#d9eadf] bg-[#fbfffb] p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-black text-[#12382c]">{item.originalName ?? "Unnamed media"}</div>
                                <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-900">{item.kind ?? "media"}</span>
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-900">{item.importRole ?? "role pending"}</span>
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-900">{item.syncStatus ?? "sync pending"}</span>
                                  <span className={`rounded-full px-2 py-1 ${item.proxyReadiness?.status === "needed" ? "bg-amber-100 text-amber-900" : item.proxyReadiness?.status === "ready" ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-700"}`}>
                                    {item.proxyReadiness?.status === "needed" ? "proxy needed" : item.proxyReadiness?.status === "ready" ? "proxy ready" : "proxy unknown"}
                                  </span>
                                  {item.proxyReadiness?.source && item.proxyReadiness.source !== "unknown" ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                                      {item.proxyReadiness.source === "media-asset" ? "asset truth" : "import fallback"}
                                    </span>
                                  ) : null}
                                  {item.recordingAssetId ? (
                                    <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-900">recording linked</span>
                                  ) : null}
                                  {item.sessionContext ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-900">Session context linked</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            {item.sessionContext ? (
                              <div className="mt-2 rounded-md border border-violet-100 bg-violet-50/70 px-2 py-2 text-[10px] font-bold text-violet-950">
                                <div className="flex flex-wrap items-center gap-1">
                                  <Link href={item.sessionContext.canonicalTagSource || `/sessions/${encodeURIComponent(item.sessionContext.roomId)}`} className="rounded-full border border-violet-200 bg-white px-2 py-1 font-black hover:underline">Open source Session</Link>
                                  {(item.sessionContext.tagSnapshot ?? []).map((tag) => <span key={tag.id} className="rounded-full border border-violet-200 bg-white px-2 py-1">#{tag.label}</span>)}
                                </div>
                                <p className="mt-1 text-violet-900/75">Tag labels are a handoff snapshot; the Session remains canonical.</p>
                              </div>
                            ) : null}
                            <div className="mt-2 text-[11px] font-bold leading-5 text-emerald-950/75">
                              {item.safeNextAction ?? "Review sync role and timeline use in the episode editor."}
                            </div>
                          </div>
                        ))}
                        {(episodeMediaTruth.importedMedia ?? []).length === 0 ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">
                            No whole-source media is attached to this episode yet.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-200 bg-white p-3">
                      <div className="font-black text-[#12382c]">Safe next actions</div>
                      <div className="mt-2 space-y-2">
                        {(episodeMediaTruth.safeNextActions ?? []).slice(0, 5).map((action, index) => (
                          <div key={`${action}-${index}`} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-950">
                            {action}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-lg border border-[#d9eadf] bg-[#fbfffb] px-3 py-2 text-[11px] font-bold leading-5 text-emerald-950/75">
                        {episodeMediaTruth.boundaries?.sourceTruth ?? "RecordingAsset owns capture evidence; StudioMediaAsset owns reusable media; StudioEpisodeProduction owns episode-editor meaning."}
                      </div>
                      <div className="mt-2 rounded-lg border border-[#d9eadf] bg-[#fbfffb] px-3 py-2 text-[11px] font-bold leading-5 text-emerald-950/75">
                        {episodeMediaTruth.boundaries?.editorRule ?? "Whole sources stay intact. Proxy, transcript, sync, and edit decisions are inspectable metadata."}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-emerald-900">
                  Media truth appears after a database-backed episode production room is loaded.
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-[#e8dcc4] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-[#3d3122]">Episode sync lane</div>
                <div className="font-mono text-[10px] text-[#8c6b4a]">{formatClock(0)} - {formatClock(totalDuration)}</div>
              </div>
              <div className="relative mt-3 h-8 rounded-full border border-[#e8dcc4] bg-[#fff8ec]">
                <div
                  className="absolute top-0 h-full w-px bg-[#3d3122]/50"
                  style={{ left: `${Math.max(0, Math.min(100, (currentTime / Math.max(totalDuration, 1)) * 100))}%` }}
                  title={`Playhead ${formatClock(currentTime)}`}
                />
                {importedMediaAssets.map((asset) => {
                  const percent = importedAssetTimelinePercent(asset, totalDuration);
                  if (percent === null) return null;
                  return (
                    <button
                      key={`${asset.id}-anchor`}
                      type="button"
                      onClick={() => setCurrentTime(asset.sync?.anchorTimelineSeconds ?? currentTime)}
                      className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                      style={{ left: `${percent}%`, background: importedAssetColor(asset) }}
                      title={`${asset.originalName}: ${formatClock(asset.sync?.anchorTimelineSeconds ?? 0)}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf0] px-2 py-1 text-[#8c6b4a]">{importedMediaAssets.length} imported</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                  {importedMediaAssets.filter((asset) => asset.sync?.status === "synced").length} synced
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                  {importedMediaAssets.filter((asset) => (asset.sync?.status ?? "ready-to-sync") === "ready-to-sync").length} safe to test
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                  {importedMediaAssets.filter((asset) => asset.sync?.status === "held").length} held
                </span>
              </div>
            </div>
            <SyncStatusGuide />
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {importedMediaAssets.length ? importedMediaAssets.map((asset) => {
                const aiRecommendation = aiIngestRecommendationsByAsset.get(asset.id) ?? aiIngestRecommendationsByAsset.get(asset.sourceId);
                const transcriptAssistReport = transcriptAssistReportsByAsset.get(asset.id) ?? transcriptAssistReportsByAsset.get(asset.sourceId);
                const isTranscriptAssisting = transcriptAssistingAssetIds.has(asset.id);
                const assetJobs = mediaAnalysisJobsByAsset.get(asset.id) ?? mediaAnalysisJobsByAsset.get(asset.sourceId) ?? [];
                const collaborationProxyStatus = collaborationProxyStatusByAsset[asset.id]
                  ?? collaborationProxyStatusByAsset[asset.sourceId];
                const audioMasteryStatus = audioMasteryStatusByAsset[asset.id]
                  ?? audioMasteryStatusByAsset[asset.sourceId];
                const audioTreatmentStatus = audioTreatmentStatusByAsset[asset.id]
                  ?? audioTreatmentStatusByAsset[asset.sourceId];
                const audioSignalProfileStatus = audioSignalProfileStatusByAsset[asset.id]
                  ?? audioSignalProfileStatusByAsset[asset.sourceId];
                const sourceTranscriptStatus = sourceTranscriptStatusByAsset[asset.id]
                  ?? sourceTranscriptStatusByAsset[asset.sourceId];
                const proxyStatus = collaborationProxyStatus?.status
                  ?? (hasVerifiedCollaborationProxy(asset) ? "completed" : "not-queued");
                const isCollaborationProxyWorking = queueingMediaJobKeys.has(`${asset.id}:collaboration-proxy`);
                const isAudioMasteryWorking = queueingMediaJobKeys.has(`${asset.id}:audio-mastery`);
                const isAudioMasteryReviewing = queueingMediaJobKeys.has(`${asset.id}:audio-mastery-review`);
                const isAudioTreatmentWorking = queueingMediaJobKeys.has(`${asset.id}:audio-treatment`);
                const isAudioSignalProfileWorking = queueingMediaJobKeys.has(`${asset.id}:audio-signal-profile`);
                const isSourceTranscriptWorking = queueingMediaJobKeys.has(`${asset.id}:source-transcript`);
                const hasDcTreatmentEvidence = Boolean(audioMasteryStatus?.signalDiagnosis?.channels.some((channel) => Math.abs(channel.dcOffset) >= 0.01));
                const health = importedAssetHealth(asset);
                const confidenceStatus = importedAssetConfidenceStatus(asset, health);
                const isSpineAsset = persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId;
                return (
                <div key={asset.id} className="rounded-lg border border-[#e8dcc4] bg-white p-2 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-black text-[#3d3122]">{asset.originalName}</div>
                      <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6b4a]">
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{asset.kind}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{importedAssetRoleLabel(asset)}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{formatBytes(asset.size)}</span>
                        <span className="rounded-full bg-[#f5ead6] px-2 py-1">{asset.proxy?.status ?? "proxy pending"}</span>
                        <span className={`rounded-full border px-2 py-1 ${healthStatusStyles(health?.status ?? "unchecked")}`}>
                          {health ? healthStatusLabel(health.status) : "Unchecked"}
                        </span>
                        <span className={`rounded-full border px-2 py-1 ${confidenceStatus.tone}`}>{confidenceStatus.label}</span>
                        <span className={`rounded-full border px-2 py-1 ${importedAssetSyncTone(asset)}`}>{importedAssetSyncLabel(asset)}</span>
                        {typeof asset.sync?.anchorTimelineSeconds === "number" && (
                          <span className="rounded-full bg-[#f5ead6] px-2 py-1">{formatClock(asset.sync.anchorTimelineSeconds)}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className="mt-1 h-3 w-3 rounded-full"
                      style={{ background: importedAssetColor(asset) }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${healthStatusStyles(health?.status ?? "unchecked")}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black">{healthSafetyTitle(health)}</div>
                        <div className="mt-1">{healthNextAction(health)}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                        {isSpineAsset ? "Spine" : confidenceStatus.label}
                      </span>
                    </div>
                    <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                      Status means: {confidenceStatus.meaning}
                    </div>
                    <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                      {assetSyncTargetSummary(asset, selectedClip, persistedSpineAudio)}
                    </div>
                    <div className="mt-1 text-[10px] opacity-80">
                      Next: {asset.sync?.status === "ready-to-sync" || !asset.sync?.status
                        ? confidenceStatus.next
                        : assetNextAction(asset, health, persistedSpineAudio)}
                    </div>
                  </div>
                  {health && (
                    <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-bold leading-5 ${healthStatusStyles(health.status)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{health.kind.toUpperCase()} source details</span>
                        <span className="font-mono">{health.method ?? "probe"}{health.statusCode ? ` / ${health.statusCode}` : ""}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Reachable</span>
                        <span className="text-right">{health.reachable ? "yes" : "no"}</span>
                        <span>Preview</span>
                        <span className="text-right">{health.previewUsable ? "yes" : "no"}</span>
                        <span>Render</span>
                        <span className="text-right">{health.renderUsable ? "yes" : "no"}</span>
                        <span>Type</span>
                        <span className="truncate text-right">{health.contentType}</span>
                      </div>
                      <div className="mt-1 text-[10px] opacity-80">{health.note}</div>
                    </div>
                  )}
                  {!realEditingMode && aiRecommendation && (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black">{aiRecommendation.role} / {aiRecommendation.suggestedTrackId}</span>
                        <span className="font-mono text-[10px]">{Math.round(aiRecommendation.confidence * 100)}%</span>
                      </div>
                      <div className="mt-1 font-bold leading-5">{aiRecommendation.suggestedAction}</div>
                      {aiRecommendation.reason && (
                        <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">{aiRecommendation.reason}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => void applyAiIngestRecommendation(aiRecommendation, asset)}
                        disabled={applyingAiSuggestionIds.has(`${asset.id}:${aiRecommendation.assetId}`)}
                        className="mt-2 w-full rounded-lg border border-emerald-300 bg-white px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100 disabled:cursor-wait disabled:bg-emerald-50"
                        title={recommendationApplySummary(aiRecommendation)}
                      >
                        {applyingAiSuggestionIds.has(`${asset.id}:${aiRecommendation.assetId}`) ? "Applying..." : "Apply suggestion"}
                      </button>
                    </div>
                  )}
                  {!realEditingMode && (asset.sync?.suggestedTrackId || asset.sync?.suggestedRole) && (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-5 text-sky-900">
                      <div className="font-black">Applied suggestion</div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Role</span>
                        <span className="text-right">{asset.sync.suggestedRole ?? "not set"}</span>
                        <span>Track</span>
                        <span className="text-right">{asset.sync.suggestedTrackId ?? "not set"}</span>
                        <span>Confidence</span>
                        <span className="text-right">
                          {typeof asset.sync.suggestionConfidence === "number" ? `${Math.round(asset.sync.suggestionConfidence * 100)}%` : "not set"}
                        </span>
                      </div>
                      {asset.sync.suggestionReason && (
                        <div className="mt-1 text-[10px] opacity-80">{asset.sync.suggestionReason}</div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => addImportedAssetToTimeline(asset)}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-2 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                      title="Creates a timeline clip at the current playhead on a sensible audio or video track."
                    >
                      Add to timeline here
                    </button>
                    <button
                      type="button"
                      onClick={() => void attachImportedAssetToSelectedClip(asset)}
                      className="rounded-lg border border-[#d8b777] bg-[#fff8ec] px-2 py-2 font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                      title={selectedClip ? `Use this file as the source for ${selectedClip.name}.` : "Select a timeline clip first, then attach this file to it."}
                    >
                      Attach to selected clip
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSyncWizardTargetAssetId(asset.id);
                        setMediaImportStatus(`Selected ${asset.originalName} for reviewed alignment.`);
                        document
                          .getElementById("guided-sync-wizard")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100"
                      title="Open Guided sync to review clock, waveform, drift, and the reversible placement."
                    >
                      Review alignment
                    </button>
                  </div>
                  {!realEditingMode && (asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/")) && (
                    <button
                      type="button"
                      onClick={() => void requestTranscriptAssist(asset)}
                      disabled={isTranscriptAssisting}
                      className="mt-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-2 py-2 text-left font-black text-sky-900 hover:bg-sky-100 disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      {isTranscriptAssisting ? "Generating transcript suggestions..." : "Gemini transcript assist"}
                      <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                        Saves suggestions only. It will not replace the episode transcript.
                      </div>
                    </button>
                  )}
                  {(asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/")) && (
                    <div className="mt-2 rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 px-3 py-3 text-cyan-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black">Canonical source transcript</div>
                          <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                            Immutable source clock · timed provider words · playback-review corrections
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
                          sourceTranscriptStatus?.status === "completed"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : sourceTranscriptStatus?.status === "failed"
                              ? "border-rose-200 bg-rose-50 text-rose-800"
                              : "border-cyan-200 bg-white text-cyan-900"
                        }`}>
                          {sourceTranscriptStatus?.status ?? "not queued"}
                        </span>
                      </div>
                      {sourceTranscriptStatus?.coverage && (
                        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] font-bold sm:grid-cols-4">
                          <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{sourceTranscriptStatus.coverage.segmentCount}</div><div>Timed segments</div></div>
                          <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{sourceTranscriptStatus.coverage.wordCount}</div><div>Timed words</div></div>
                          <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{sourceTranscriptStatus.coverage.speakerLabeledWordCount}</div><div>Speaker-labeled</div></div>
                          <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{sourceTranscriptStatus.coverage.playbackVerificationCount}</div><div>Playback checks</div></div>
                        </div>
                      )}
                      {sourceTranscriptStatus?.status === "completed" && (sourceTranscriptStatus.coverage?.segmentCount ?? 0) > 0 && (
                        <StudioTranscriptReviewDesk
                          projectSlug={resolvedProjectSlug}
                          episodeSlug={episodeSlug}
                          assetId={asset.id}
                          sourceId={asset.sourceId}
                          audioSignal={importedAssetAudioSignal(asset, audioSignalProfileStatus, 1_200)}
                          audioSignalStatus={audioSignalProfileStatus?.status ?? "not-queued"}
                          audioSignalError={audioSignalProfileStatus?.error ?? null}
                          isAudioSignalWorking={isAudioSignalProfileWorking}
                          onRequestAudioSignal={() => void operateAudioSignalProfile(asset)}
                          processingEvidenceMarkers={[
                            ...(audioMasteryStatus?.signalDiagnosis?.observations ?? []).map((observation, index) => ({
                              id: `mastery-source-${observation.kind}-${observation.startSeconds}-${index}`,
                              category: "mastery" as const,
                              startSeconds: observation.startSeconds,
                              endSeconds: observation.endSeconds,
                              label: `Mastery source scan · ${observation.kind.replaceAll("-", " ")}`,
                              detail: observation.detail,
                              severity: observation.severity,
                            })),
                            ...(audioTreatmentStatus?.derivative?.diagnosis.observations ?? []).map((observation, index) => ({
                              id: `treatment-output-${observation.kind}-${observation.startSeconds}-${index}`,
                              category: "treatment" as const,
                              startSeconds: observation.startSeconds,
                              endSeconds: observation.endSeconds,
                              label: `Unpromoted treatment output · ${observation.kind.replaceAll("-", " ")}`,
                              detail: observation.detail,
                              severity: observation.severity,
                            })),
                            ...sourceBoundSpectralEditMarkers({
                              currentProjectSlug: resolvedProjectSlug,
                              currentEpisodeSlug: episodeSlug,
                              currentAssetId: asset.id,
                              currentSourceId: asset.sourceId,
                              currentSourceSha256: asset.sha256 ?? null,
                              bindingIsCurrent: cameraEvidenceReady,
                              binding: aiEditProposalBinding,
                              proposals: aiEditSuggestions,
                              reviewCandidates: aiEditReviewCandidates,
                            }),
                          ]}
                          loudnessEvidence={audioMasteryStatus?.sourceMeasurement ? {
                            integratedLufs: audioMasteryStatus.sourceMeasurement.integratedLufs,
                            truePeakDbtp: audioMasteryStatus.sourceMeasurement.truePeakDbtp,
                            targetLufs: audioMasteryStatus.proposal?.profile.integratedLufs ?? null,
                            points: audioMasteryStatus.sourceMeasurement.series.map((point) => ({
                              timeSeconds: point.timeMs / 1_000,
                              momentaryLufs: point.momentaryLufs,
                              shortTermLufs: point.shortTermLufs,
                              integratedLufs: point.integratedLufs,
                              truePeakDbtp: point.truePeakDbtp,
                            })),
                          } : null}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void operateSourceTranscript(asset)}
                        disabled={isSourceTranscriptWorking || sourceTranscriptStatus?.status === "completed"}
                        className="mt-3 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-left font-black hover:bg-cyan-100 disabled:cursor-default disabled:bg-cyan-50"
                      >
                        {isSourceTranscriptWorking
                          ? "Transcribing and verifying..."
                          : sourceTranscriptStatus?.status === "completed"
                            ? "Canonical timed transcript ready"
                            : sourceTranscriptStatus?.status === "queued" || sourceTranscriptStatus?.status === "processing" || sourceTranscriptStatus?.status === "output-ready"
                              ? "Resume source transcription"
                              : sourceTranscriptStatus?.status === "failed" ? "Retry source transcription" : "Transcribe immutable source"}
                        <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                          Requires an explicit participant-consent or licensed-source receipt. It never changes media or silently creates edits, tasks, goals, or publications.
                        </div>
                      </button>
                      {sourceTranscriptStatus?.error && <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] font-bold text-rose-900">{sourceTranscriptStatus.error}</div>}
                    </div>
                  )}
                  {(asset.kind === "video" || asset.contentType.startsWith("video/")) && (
                    <button
                      type="button"
                      onClick={() => void operateCollaborationProxy(asset)}
                      disabled={isCollaborationProxyWorking || proxyStatus === "completed"}
                      className={`mt-2 w-full rounded-lg border px-3 py-2 text-left font-black disabled:cursor-default ${
                        proxyStatus === "completed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : proxyStatus === "failed" || proxyStatus === "blocked"
                            ? "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
                            : "border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100 disabled:cursor-wait"
                      }`}
                    >
                      {proxyStatus === "completed"
                        ? "Collaboration proxy ready"
                        : isCollaborationProxyWorking
                          ? "Building collaboration proxy..."
                          : proxyStatus === "failed" || proxyStatus === "blocked"
                            ? "Retry collaboration proxy"
                            : proxyStatus === "processing" || proxyStatus === "output-ready" || proxyStatus === "queued"
                              ? "Resume collaboration proxy"
                              : "Build collaboration proxy"}
                      <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                        {proxyStatus === "completed"
                          ? "Editor preview is optimized. Export and provenance continue to reference the immutable original."
                          : collaborationProxyStatus?.error
                            ? collaborationProxyStatus.error
                            : "Creates an app-owned H.264/AAC review derivative with byte and fast-start verification. The source is never overwritten."}
                      </div>
                    </button>
                  )}
                  {(asset.kind === "audio" || asset.kind === "video" || asset.contentType.startsWith("audio/") || asset.contentType.startsWith("video/")) && (
                    <div className="mt-2 rounded-lg border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-indigo-50 px-3 py-3 text-fuchsia-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black">Audio mastery</div>
                          <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                            Complete BS.1770/R128 decode · Apple dialogue target −16 LUFS · preview ceiling −1.5 dBTP
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-fuchsia-200 bg-white px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em]">
                          {audioMasteryStatus?.status ?? "not measured"}
                        </span>
                      </div>
                      {audioMasteryStatus?.sourceMeasurement && (
                        <div className="mt-3">
                          <AudioMasteryLoudnessGraph measurement={audioMasteryStatus.sourceMeasurement} />
                          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                            <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{audioMasteryStatus.sourceMeasurement.integratedLufs.toFixed(1)}</div><div>LUFS integrated</div></div>
                            <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{audioMasteryStatus.sourceMeasurement.truePeakDbtp.toFixed(1)}</div><div>dBTP true peak</div></div>
                            <div className="rounded-md bg-white px-2 py-2"><div className="font-mono text-sm font-black">{audioMasteryStatus.sourceMeasurement.loudnessRangeLu.toFixed(1)}</div><div>LU range</div></div>
                          </div>
                          {audioMasteryStatus.derivative?.playbackUrl && audioMasteryStatus.proposal && (
                            <AudioMasteryAudition
                              sourceUrl={asset.playbackUrl}
                              masteredUrl={audioMasteryStatus.derivative.playbackUrl}
                              source={audioMasteryStatus.sourceMeasurement}
                              mastered={audioMasteryStatus.derivative.measured}
                              targetLufs={audioMasteryStatus.proposal.profile.integratedLufs}
                              maximumTruePeakDbtp={audioMasteryStatus.proposal.profile.maximumTruePeakDbtp}
                              diagnosis={audioMasteryStatus.signalDiagnosis}
                              review={audioMasteryStatus.review}
                              isReviewing={isAudioMasteryReviewing}
                              onReview={(decision, evidence, note) => operateAudioMasteryReview(asset, decision, evidence, note)}
                            />
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void operateAudioMastery(asset)}
                        disabled={isAudioMasteryWorking || (audioMasteryStatus?.status === "completed" && audioMasteryStatus.signalDiagnosis !== null)}
                        className="mt-3 w-full rounded-lg border border-fuchsia-300 bg-white px-3 py-2 text-left font-black hover:bg-fuchsia-100 disabled:cursor-default disabled:bg-fuchsia-50"
                      >
                        {isAudioMasteryWorking
                          ? "Measuring and verifying..."
                          : audioMasteryStatus?.status === "completed"
                            ? audioMasteryStatus.signalDiagnosis === null
                              ? "Add decoded signal diagnosis"
                              : audioMasteryStatus.derivative ? "Verified mastering preview ready" : "Source already meets profile"
                            : audioMasteryStatus?.status === "queued" || audioMasteryStatus?.status === "processing" || audioMasteryStatus?.status === "output-ready"
                              ? "Resume audio mastery"
                              : audioMasteryStatus?.status === "failed" ? "Retry audio mastery" : "Measure and prepare mastering preview"}
                        <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">
                          Original bytes are never changed. Denoise, EQ, de-essing, silence removal, and editorial cuts are excluded from this automatic pass.
                        </div>
                      </button>
                      {(hasDcTreatmentEvidence || audioTreatmentStatus?.jobId) && (
                        <div className="mt-3 rounded-lg border border-cyan-300 bg-cyan-950 px-3 py-3 text-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-black">Evidence-led treatment</div>
                              <div className="mt-1 text-[10px] font-bold leading-4 text-cyan-100/80">Measured DC offset qualifies a reversible 20 Hz correction experiment. No denoise, compression, de-essing, silence removal, or editorial cut is included.</div>
                            </div>
                            <span className="shrink-0 rounded-full border border-cyan-700 bg-slate-950 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-cyan-100">{audioTreatmentStatus?.status ?? "proposed"}</span>
                          </div>
                          {audioTreatmentStatus?.proposal && (
                            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[10px] font-bold">
                              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-amber-200">{audioTreatmentStatus.proposal.trigger.maximumAbsoluteDcOffset.toFixed(5)}</div><div className="text-slate-400">Measured trigger</div></div>
                              <div className="rounded-md bg-slate-950 px-2 py-2"><div className="font-mono text-sm font-black text-cyan-200">{audioTreatmentStatus.proposal.treatment.frequencyHz} Hz</div><div className="text-slate-400">Two-pole correction</div></div>
                            </div>
                          )}
                          {audioTreatmentStatus?.derivative?.playbackUrl && audioTreatmentStatus.sourceMeasurement && audioTreatmentStatus.sourceDiagnosis && audioTreatmentStatus.verification && (
                            <AudioTreatmentAudition sourceUrl={asset.playbackUrl} treatedUrl={audioTreatmentStatus.derivative.playbackUrl} source={audioTreatmentStatus.sourceMeasurement} treated={audioTreatmentStatus.derivative.measured} sourceDiagnosis={audioTreatmentStatus.sourceDiagnosis} treatedDiagnosis={audioTreatmentStatus.derivative.diagnosis} verification={audioTreatmentStatus.verification} />
                          )}
                          <button
                            type="button"
                            onClick={() => void operateAudioTreatment(asset)}
                            disabled={!hasDcTreatmentEvidence || isAudioTreatmentWorking || audioTreatmentStatus?.status === "completed"}
                            className="mt-3 w-full rounded-lg border border-cyan-500 bg-cyan-200 px-3 py-2 text-left font-black text-cyan-950 hover:bg-cyan-100 disabled:cursor-default disabled:bg-cyan-950 disabled:text-cyan-300"
                          >
                            {isAudioTreatmentWorking ? "Rendering and diagnosing..." : audioTreatmentStatus?.status === "completed" ? "Verified treatment experiment ready" : audioTreatmentStatus?.status === "queued" || audioTreatmentStatus?.status === "processing" || audioTreatmentStatus?.status === "output-ready" ? "Resume treatment experiment" : audioTreatmentStatus?.status === "failed" ? "Retry treatment experiment" : "Render treatment experiment"}
                            <div className="mt-1 text-[10px] font-bold leading-4 opacity-80">Creates separate 48 kHz, 24-bit bytes and must pass independent DC, duration, channel, decode, and source-integrity checks before it can be auditioned.</div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-[#fffdf7] px-3 py-2 ${realEditingMode ? "hidden" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-black text-[#3d3122]">Media analysis jobs</div>
                      <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8c6b4a]">
                        {assetJobs.length}
                      </span>
                    </div>
                    {assetJobs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {assetJobs.slice(0, 4).map((job) => (
                          <span
                            key={job.id}
                            className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${mediaAnalysisJobTone(job.status)}`}
                            title={job.error || JSON.stringify(job.result)}
                          >
                            {mediaAnalysisJobLabel(job.type)} / {job.status}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {(["file-triage", "sync-suggestion", "transcript"] as MediaAnalysisJobType[]).map((jobType) => {
                        const jobKey = `${asset.id}:${jobType}`;
                        const isQueueing = queueingMediaJobKeys.has(jobKey);
                        return (
                          <button
                            key={jobType}
                            type="button"
                            onClick={() => void queueMediaAnalysisJob(asset, jobType)}
                            disabled={isQueueing}
                            className="rounded-md border border-[#d8b777] bg-white px-2 py-1.5 text-left text-[10px] font-black text-[#7b4f1f] hover:bg-[#fff8ec] disabled:cursor-wait disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            {isQueueing ? "Saving..." : mediaAnalysisJobLabel(jobType)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!realEditingMode && transcriptAssistReport && (
                    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold leading-5 text-sky-950">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-black">Transcript assist</div>
                        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                          transcriptAssistReport.inspectedRawMedia
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {transcriptAssistReport.inspectedRawMedia ? "media heard" : "metadata"}
                        </span>
                      </div>
                      <div className="mt-1 text-sky-900">{transcriptAssistReport.summary}</div>
                      {transcriptAssistReport.transcriptText && (
                        <div className="mt-2 max-h-24 overflow-y-auto rounded-md border border-sky-100 bg-white px-2 py-1 font-serif text-[12px] leading-5 text-[#3d3122]">
                          {transcriptAssistReport.transcriptText}
                        </div>
                      )}
                      {transcriptAssistReport.transcriptBlocks.length > 0 && (
                        <div className="mt-2 font-mono text-[10px] text-sky-800">
                          {transcriptAssistReport.transcriptBlocks.length} suggested block{transcriptAssistReport.transcriptBlocks.length === 1 ? "" : "s"}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-sky-800">{transcriptAssistReport.suggestedUse}</div>
                      {transcriptAssistReport.warnings[0] && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                          {transcriptAssistReport.warnings[0]}
                        </div>
                      )}
                    </div>
                  )}
                  {(asset.kind === "audio" || asset.contentType.startsWith("audio/")) && (
                    <button
                      type="button"
                      onClick={() => void setEpisodeSpineAudio({ asset })}
                      className={`mt-2 w-full rounded-lg border px-2 py-2 font-black ${
                        persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {persistedSpineAudio?.assetId === asset.id || persistedSpineAudio?.assetId === asset.sourceId
                        ? "This is the episode spine audio"
                        : "Make this the main spine audio"}
                    </button>
                  )}
                  {asset.sync?.status === "synced" ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-5 text-emerald-950">
                      This reviewed placement is protected. Reopen Guided sync to inspect it, or use Undo last sync change before replacing it with a rough anchor or held status.
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void updateImportedAssetSyncStatus(asset, "ready-to-sync")}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 font-black text-amber-900 hover:bg-amber-100"
                        title={`Stores the current playhead (${formatSyncClock(currentTime)}) as a rough anchor without claiming review.`}
                      >
                        Use rough playhead anchor
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateImportedAssetSyncStatus(asset, "held")}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-black text-slate-700 hover:bg-slate-100"
                        title="Park this file so it is preserved but no longer feels like the next urgent thing."
                      >
                        Park for later
                      </button>
                    </div>
                  )}
                  {!realEditingMode && (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(asset.gcsUri || asset.playbackUrl)}
                      className="mt-2 w-full rounded-lg border border-dashed border-[#d8b777] px-2 py-2 font-mono text-[10px] text-[#8c6b4a] hover:bg-[#fff8ec]"
                    >
                      Copy vault URI
                    </button>
                  )}
                </div>
                );
              }) : (
                <div className="rounded-xl border-2 border-dashed border-[#e8dcc4] bg-[#fffaf0] p-6 text-center font-bold leading-6 text-[#8c6b4a]">
                  <div className="text-lg font-black text-[#3d3122] mb-2">No episode media imported yet.</div>
                  <div>
                    Start with the least scary file: import the main phone or audio recording first.<br/>Then, make it the <strong className="text-indigo-800">spine audio</strong>. Camera video and reference clips can come later.
                  </div>
                </div>
              )}
            </div>
          </div>
          {selectedClip ? (
            <div className="rounded-xl border border-[#d8b777] bg-[#fffaf0] p-3 text-xs text-[#4a3722] shadow-sm">
              {(() => {
                const selectedHealth = timelineClipHealth(selectedClip);
                return (
                  <>
              <div className="font-black uppercase tracking-[0.18em] text-[#9a641e]">Selected clip</div>
              <div className="mt-2 font-black text-[#3d3122]">{selectedClip.name}</div>
              {selectedClipIsPremiereRestorePreview && (
                <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black">Premiere restore preview</div>
                      <div className="mt-1 text-[11px] font-bold leading-5">
                        This is a temporary recovered source range from the Premiere rescue flow. Review it, then either remove it or keep it by saving the timeline.
                      </div>
                    </div>
                    <span className="rounded-full border border-indigo-200 bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                      temporary
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 rounded-md border border-indigo-100 bg-white/80 px-2 py-1 text-[11px] font-bold leading-5 text-[#3d3122]">
                    <div className="flex justify-between gap-3">
                      <span>Timeline in</span>
                      <span className="font-mono">{formatClock(selectedClip.startIn)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Source range</span>
                      <span className="font-mono">
                        {formatClock(selectedClip.sourceStart)} - {formatClock(selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentTime(selectedClip.startIn);
                        setViewMode("timeline");
                        setEditorMode("play-all");
                        setIsPreviewPlaying(false);
                        setMediaImportStatus(`Cued temporary restore preview "${selectedClip.name}" at ${formatClock(selectedClip.startIn)}.`);
                      }}
                      className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-black text-indigo-900 hover:bg-indigo-100"
                    >
                      Cue preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const removedName = selectedClip.name;
                        deleteClip(selectedClip.id);
                        setSelectedClipId(null);
                        setIsPreviewPlaying(false);
                        setTimelineSaveStateSafe("conflict");
                        setMediaImportStatus(`Removed temporary restore preview "${removedName}". Save the timeline to keep this cleanup.`);
                      }}
                      className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black text-red-900 hover:bg-red-50"
                    >
                      Remove preview
                    </button>
                    {premiereRestorePreviewClips.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const removedCount = premiereRestorePreviewClips.length;
                          for (const clip of premiereRestorePreviewClips) deleteClip(clip.id);
                          setSelectedClipId(null);
                          setIsPreviewPlaying(false);
                          setTimelineSaveStateSafe("conflict");
                          setMediaImportStatus(`Removed ${removedCount} temporary restore previews. Save the timeline to keep this cleanup.`);
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-black text-red-900 hover:bg-red-100"
                      >
                        Remove all previews
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className={`mt-2 rounded-lg border px-3 py-2 font-bold leading-5 ${healthStatusStyles(selectedHealth?.status ?? (isMissingProductionSource(selectedClip) ? "error" : "unchecked"))}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{healthSafetyTitle(selectedHealth, isMissingProductionSource(selectedClip))}</div>
                    <div className="mt-1">{healthNextAction(selectedHealth, isMissingProductionSource(selectedClip))}</div>
                    {(isMissingProductionSource(selectedClip) || selectedHealth?.status === "error") && (
                      <div className="mt-2 relative">
                        <button
                          onClick={() => setIsReplaceSourcePickerOpen(v => !v)}
                          className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-900 hover:bg-amber-200"
                        >
                          {isReplaceSourcePickerOpen ? "Cancel" : "Replace Source Media"}
                        </button>
                        {isReplaceSourcePickerOpen && (
                          <div className="absolute top-full left-0 mt-2 w-80 z-50 shadow-xl">
                            <MediaAssetPicker
                              assets={importedMediaAssets.map(asset => {
                                const health = importedAssetHealth(asset);
                                return {
                                  id: asset.id,
                                  name: asset.originalName,
                                  kind: asset.kind,
                                  isSpine: asset.id === persistedSpineAudio?.assetId,
                                  tags: [
                                    { label: health ? healthStatusLabel(health.status) : "Unchecked", tone: healthStatusStyles(health?.status ?? "unchecked") },
                                    ...(asset.sync?.status === "synced" ? [{ label: "Synced", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" }] : []),
                                    ...(asset.sync?.status === "held" ? [{ label: "Held", tone: "border-slate-200 bg-slate-50 text-slate-700" }] : []),
                                  ]
                                };
                              })}
                              onSelect={(id) => {
                                const asset = importedMediaAssets.find(a => a.id === id);
                                if (asset) void attachImportedAssetToSelectedClip(asset);
                                setIsReplaceSourcePickerOpen(false);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                    {selectedClip.trackId}
                  </span>
                </div>
                <div className="mt-2 rounded-md border border-white/70 bg-white/60 px-2 py-1 text-[#3d3122]">
                  This clip uses: {selectedClip.assetId ? describeClipSource(selectedClip) : "no source yet"}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  className="rounded-md border border-[#d8b777] bg-[#fff8ec] px-3 py-1.5 text-xs font-black text-[#7b4f1f] hover:bg-[#f3e4c7] transition-colors self-start"
                  onClick={() => {
                    const asset = importedMediaAssets.find(a => a.id === selectedClip.assetId);
                    const url = asset?.playbackUrl || asset?.sourceId || selectedClip.assetId;
                    const isYouTube = /youtube\.com|youtu\.be/i.test(url);

                    let sourceUrl = url;
                    if (isYouTube) {
                      const match = url.match(/[?&]v=([^&]+)/);
                      if (match) sourceUrl = match[1];
                      else {
                        const shortMatch = url.match(/youtu\.be\/([^?]+)/);
                        if (shortMatch) sourceUrl = shortMatch[1];
                      }
                    }

                    addLoopClip({
                      id: `loop-${Date.now()}`,
                      sourceType: isYouTube ? "youtube-embed" : "bucket-video",
                      sourceUrl: sourceUrl,
                      startSec: selectedClip.sourceStart,
                      endSec: selectedClip.sourceEnd || (selectedClip.sourceStart + selectedClip.duration),
                      title: `${selectedClip.name} Loop`,
                      exportability: isYouTube ? "playable" : "exportable",
                      manuscriptBlockId: productionState?.boundaryStartBlockId || undefined,
                      projectSlug: resolvedProjectSlug,
                      episodeSlug: episodeSlug,
                      createdAt: new Date().toISOString()
                    });
                  }}
                >
                  Export as Loop
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 leading-5">
                <dt className="font-black text-[#8c6b4a]">Track</dt>
                <dd className="text-right font-mono">{selectedClip.trackId}</dd>
                <dt className="font-black text-[#8c6b4a]">Timeline</dt>
                <dd className="text-right font-mono">{formatClock(selectedClip.startIn)}-{formatClock(selectedClip.startIn + selectedClip.duration)}</dd>
                <dt className="font-black text-[#8c6b4a]">Source</dt>
                <dd className="text-right font-mono">{formatClock(selectedClip.sourceStart)}-{formatClock(selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration)}</dd>
                <dt className="font-black text-[#8c6b4a]">Status</dt>
                <dd className="text-right">{describeClipSource(selectedClip)}</dd>
              </dl>
              <div className="mt-2 break-all rounded-lg border border-[#e8dcc4] bg-white p-2 font-mono text-[10px] text-[#6c5638]">
                {selectedClip.assetId || "No source URL"}
              </div>
              <div className={`mt-2 rounded-lg border px-3 py-2 font-bold leading-5 ${healthStatusStyles(selectedHealth?.status ?? (isMissingProductionSource(selectedClip) ? "error" : "unchecked"))}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black">Source health</div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                    {selectedHealth ? healthStatusLabel(selectedHealth.status) : isMissingProductionSource(selectedClip) ? "Missing" : "Unchecked"}
                  </span>
                </div>
                {selectedHealth ? (
                  <>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                      <span>Detected</span>
                      <span className="text-right">{selectedHealth.kind}</span>
                      <span>Reachable</span>
                      <span className="text-right">{selectedHealth.reachable ? "yes" : "no"}</span>
                      <span>Preview usable</span>
                      <span className="text-right">{selectedHealth.previewUsable ? "yes" : "no"}</span>
                      <span>Render usable</span>
                      <span className="text-right">{selectedHealth.renderUsable ? "yes" : "no"}</span>
                    </div>
                    <div className="mt-1 text-[10px] opacity-80">{selectedHealth.note}</div>
                  </>
                ) : (
                  <div className="mt-1 text-[10px] opacity-80">
                    {isMissingProductionSource(selectedClip)
                      ? "Attach media before preview or render."
                      : "Waiting for the next lightweight source probe."}
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(selectedClip.kind === "audio" || isAudioTrackId(selectedClip.trackId)) && (
                  <button
                    type="button"
                    onClick={() => void setEpisodeSpineAudio({ clip: selectedClip })}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 font-black text-emerald-800 hover:bg-emerald-100"
                  >
                    Set as spine
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(selectedClip.assetId || "")}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Copy source link
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(JSON.stringify(selectedClip, null, 2))}
                  className={`rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] ${realEditingMode ? "hidden" : ""}`}
                >
                  Copy clip JSON
                </button>
              </div>
              <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2 ${!isAdvancedToolsVisible ? "hidden" : ""}`}>
                <div className="mb-2 font-black uppercase tracking-[0.14em] text-[#9a641e]">Exact timing</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextStart = window.prompt("Timeline start in seconds", String(selectedClip.startIn));
                      if (nextStart === null) return;
                      updateClipTiming(selectedClip.id, { startIn: Number(nextStart) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set timeline start
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDuration = window.prompt("Timeline duration in seconds", String(selectedClip.duration));
                      if (nextDuration === null) return;
                      updateClipTiming(selectedClip.id, { duration: Number(nextDuration) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set duration
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSourceStart = window.prompt("Source in-point in seconds", String(selectedClip.sourceStart));
                      if (nextSourceStart === null) return;
                      updateClipTiming(selectedClip.id, { sourceStart: Number(nextSourceStart) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set source in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sourceOut = selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration;
                      const nextSourceEnd = window.prompt("Source out-point in seconds", String(sourceOut));
                      if (nextSourceEnd === null) return;
                      updateClipTiming(selectedClip.id, { sourceEnd: Number(nextSourceEnd) });
                    }}
                    className="rounded-lg border border-[#d7bd8f] bg-[#fffaf0] px-2 py-2 font-black text-[#5d4528] hover:bg-[#fff4d8]"
                  >
                    Set source out
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextAssetId = window.prompt("Paste a renderable media URL for this clip", selectedClip.assetId);
                  if (!nextAssetId?.trim()) return;
                  updateClipSource(selectedClip.id, nextAssetId.trim());
                }}
                className={`mt-2 w-full rounded-lg border border-[#3d3122] bg-white px-2 py-2 font-black text-[#3d3122] hover:bg-[#fffaf0] ${!isAdvancedToolsVisible ? "hidden" : ""}`}
              >
                Relink or replace this clip source
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextName = window.prompt("Rename this clip", selectedClip.name);
                  if (!nextName?.trim()) return;
                  renameClip(selectedClip.id, nextName.trim());
                }}
                className={`mt-2 w-full rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] ${!isAdvancedToolsVisible ? "hidden" : ""}`}
              >
                Rename clip
              </button>

              <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-black uppercase tracking-[0.14em] text-indigo-900">Audio Workflow</div>
                  <div className="text-[10px] text-indigo-700 font-bold">Vol: {Math.round((selectedClip.volume ?? 1) * 100)}%</div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => updateClipVolume(selectedClip.id, (selectedClip.volume ?? 1) === 0 ? 1 : 0)}
                    className="rounded-lg border border-indigo-200 bg-white px-2 py-2 font-black text-indigo-900 hover:bg-indigo-100 text-[11px]"
                  >
                    {(selectedClip.volume ?? 1) === 0 ? "Unmute Clip" : "Mute Clip"}
                  </button>
                  <a
                    href={`/api/extract-audio?sourceId=${selectedClip.sourceId ?? selectedClip.assetId}`}
                    download
                    className="flex items-center justify-center rounded-lg border border-indigo-200 bg-white px-2 py-2 font-black text-indigo-900 hover:bg-indigo-100 text-[11px]"
                  >
                    Extract .WAV
                  </a>
                </div>
                <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-[#3d3122] bg-[#3d3122] px-2 py-2 font-black text-white hover:bg-[#59442d] text-[11px]">
                  Attach Clean Audio...
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("projectSlug", resolvedProjectSlug);
                      formData.append("episodeSlug", episodeSlug);
                      formData.append("importRole", "cleaned-audio");

                      try {
                        const res = await fetch("/api/episode-production/import-media", {
                          method: "POST",
                          body: formData,
                        });
                        if (!res.ok) throw new Error("Upload failed");
                        const data = await res.json();

                        // Mute original video
                        updateClipVolume(selectedClip.id, 0);

                        // Insert new audio clip
                        const newId = `cleaned-${Date.now()}`;
                        const cleanAudioClip: TimelineClip = {
                          id: newId,
                          assetId: data.importedAsset.playbackUrl || data.importedAsset.sourceId || "",
                          sourceId: data.importedAsset.sourceId || undefined,
                          kind: "audio",
                          trackId: DEFAULT_AUDIO_TRACK,
                          startIn: selectedClip.startIn,
                          duration: selectedClip.duration,
                          sourceStart: selectedClip.sourceStart,
                          sourceEnd: selectedClip.sourceEnd,
                          name: data.importedAsset.originalName || "Clean audio",
                          color: "#4f46e5",
                        };
                        addClip(cleanAudioClip);
                        moveClipToTrack(newId, DEFAULT_AUDIO_TRACK);
                        updateClipTiming(newId, {
                          startIn: selectedClip.startIn,
                          duration: selectedClip.duration,
                          sourceStart: selectedClip.sourceStart,
                          sourceEnd: selectedClip.sourceEnd
                        });

                        alert("Clean audio attached successfully!");
                      } catch (err) {
                        console.error("Failed to attach audio:", err);
                        alert("Failed to upload clean audio.");
                      }

                      // Clear input
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2 ${!isAdvancedToolsVisible ? "hidden" : ""}`}>
                <div className="mb-2 font-black uppercase tracking-[0.14em] text-[#9a641e]">Move to track</div>
                <div className="grid grid-cols-4 gap-1">
                  {["V1", "V2", "A1", "A2"].map((trackId) => (
                    <button
                      key={trackId}
                      type="button"
                      onClick={() => moveClipToTrack(selectedClip.id, trackId)}
                      className={`rounded-md border px-2 py-1.5 font-black ${
                        selectedClip.trackId === trackId
                          ? "border-[#3d3122] bg-[#3d3122] text-white"
                          : "border-[#d7bd8f] bg-[#fffaf0] text-[#5d4528] hover:bg-[#fff4d8]"
                      }`}
                    >
                      {trackId}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`mt-2 grid grid-cols-2 gap-2 ${realEditingMode ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => duplicateClip(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Duplicate clip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isSpine = selectedClip.id === persistedSpineAudio?.clipId || selectedClip.assetId === persistedSpineAudio?.assetId;
                    const msg = isSpine
                      ? `"${selectedClip.name}" is the episode spine audio! Deleting it will break sync. Are you absolutely sure?`
                      : `Delete "${selectedClip.name}" from this timeline?`;
                    if (!window.confirm(msg)) return;
                    deleteClip(selectedClip.id);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 font-black text-red-800 hover:bg-red-100"
                >
                  Delete clip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isSpine = selectedClip.id === persistedSpineAudio?.clipId || selectedClip.assetId === persistedSpineAudio?.assetId;
                    const msg = isSpine
                      ? `"${selectedClip.name}" is the episode spine audio! Deleting it will break sync. Are you absolutely sure you want to delete it and close the gap?`
                      : `Delete "${selectedClip.name}" and close the gap on ${selectedClip.trackId}?`;
                    if (!window.confirm(msg)) return;
                    deleteClipAndCloseGap(selectedClip.id);
                  }}
                  className="col-span-2 rounded-lg border border-red-200 bg-white px-2 py-2 font-black text-red-800 hover:bg-red-50"
                >
                  Delete + close gap
                </button>
                <button
                  type="button"
                  onClick={() => nudgeClip(selectedClip.id, -1)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Nudge -1s
                </button>
                <button
                  type="button"
                  onClick={() => nudgeClip(selectedClip.id, 1)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Nudge +1s
                </button>
                <button
                  type="button"
                  onClick={() => moveClipTo(selectedClip.id, currentTime)}
                  className="col-span-2 rounded-lg border border-[#3d3122] bg-[#3d3122] px-2 py-2 font-black text-white hover:bg-[#59442d]"
                >
                  Move clip to playhead
                </button>
                <button
                  type="button"
                  onClick={() => snapClipToPrevious(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Snap to previous
                </button>
                <button
                  type="button"
                  onClick={() => snapClipToNext(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Snap to next
                </button>
                <button
                  type="button"
                  onClick={() => pushTrackOverlapsFromClip(selectedClip.id)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Resolve track overlaps
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Compact all clips on ${selectedClip.trackId} to remove gaps?`)) return;
                    compactTrackFromClip(selectedClip.id);
                  }}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Compact selected track
                </button>
              </div>
              <div className={`mt-2 rounded-lg border border-[#e8dcc4] bg-white p-2 text-[10px] font-bold leading-5 text-[#6c5638] ${realEditingMode ? "hidden" : ""}`}>
                Shortcuts: <span className="font-mono">D</span> duplicate, <span className="font-mono">Delete</span> remove, <span className="font-mono">Shift+Left/Right</span> nudge, <span className="font-mono">M</span> move to playhead, <span className="font-mono">X</span> split, <span className="font-mono">[ ]</span> snap.
              </div>
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black uppercase tracking-[0.16em] text-emerald-900">AI cut boundary adjust</div>
                    <div className="mt-1 text-[11px] font-bold leading-5 text-emerald-800">
                      Keep the AI edit, then make it yours by nudging what starts, what ends, and which source frames show.
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-black text-emerald-900">
                    {formatClock(selectedClip.startIn)}-{formatClock(selectedClip.startIn + selectedClip.duration)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "start", -1)}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    Start 1s earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "start", 1)}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    Start 1s later
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "end", -1)}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    End 1s earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "end", 1)}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    End 1s later
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "start", -0.1)}
                    className="rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-2 font-black text-emerald-950 hover:bg-emerald-200"
                  >
                    Start 0.1s earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "start", 0.1)}
                    className="rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-2 font-black text-emerald-950 hover:bg-emerald-200"
                  >
                    Start 0.1s later
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "end", -0.1)}
                    className="rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-2 font-black text-emerald-950 hover:bg-emerald-200"
                  >
                    End 0.1s earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => trimClip(selectedClip.id, "end", 0.1)}
                    className="rounded-lg border border-emerald-200 bg-emerald-100 px-2 py-2 font-black text-emerald-950 hover:bg-emerald-200"
                  >
                    End 0.1s later
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateClipTiming(selectedClip.id, { sourceStart: Math.max(0, selectedClip.sourceStart - 1) })}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    Source starts earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => updateClipTiming(selectedClip.id, { sourceStart: selectedClip.sourceStart + 1 })}
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-2 font-black text-emerald-900 hover:bg-emerald-100"
                  >
                    Source starts later
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentTime(selectedClip.startIn)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Cue clip in
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTime(selectedClip.startIn + selectedClip.duration)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Cue clip out
                </button>
                <button
                  type="button"
                  onClick={() => splitClipAt(selectedClip.id, currentTime)}
                  disabled={!canSplitSelectedClip}
                  title={canSplitSelectedClip ? "Split this clip at the current playhead." : "Move the playhead inside the selected clip to split it."}
                  className="rounded-lg border border-[#3d3122] bg-[#3d3122] px-2 py-2 font-black text-white hover:bg-[#59442d] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Split at playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", currentTime - selectedClip.startIn)}
                  disabled={currentTime <= selectedClip.startIn || currentTime >= selectedClip.startIn + selectedClip.duration}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Set in to playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "end", currentTime - (selectedClip.startIn + selectedClip.duration))}
                  disabled={currentTime <= selectedClip.startIn || currentTime >= selectedClip.startIn + selectedClip.duration}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Set out to playhead
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", 0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Trim in +0.5s
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "start", -0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Extend in -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => trimClip(selectedClip.id, "end", -0.5)}
                  className="rounded-lg border border-[#d7bd8f] bg-white px-2 py-2 font-black text-[#5d4528] hover:bg-[#fffaf0]"
                >
                  Trim out -0.5s
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          ) : null}
          <div className="rounded-lg border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#5d4528]">
            Real media sources come from the recording room, call uploads, imported session JSON, or Sync Deck cuts. Demo placeholder assets are hidden from this production workflow.
          </div>
        </aside>

        {/* Main Editor Area */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-visible bg-transparent p-3 sm:p-5 lg:overflow-x-hidden lg:overflow-y-auto lg:p-8">
          <section className="mb-6 rounded-3xl border border-[#e8dcc4] bg-[#fffdf7] p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#9a641e]">Today&apos;s edit cockpit</div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#3d3122]">
                  {episodeLabel}
                </h2>
                <p className="mt-1 max-w-3xl text-sm font-bold leading-6 text-[#6f5336]">
                  One production room: manuscript boundary, imported media, spine audio, timeline clips, transcript, and publish handoff all stay tied to this Nest and episode.
                </p>
              </div>
              <div className={`min-w-[220px] rounded-2xl border px-4 py-3 ${editorReadinessTone(productionDiagnostics.readinessLevel)}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">Edit state</div>
                <div className="mt-1 text-lg font-black">{productionDiagnostics.readinessTitle}</div>
                <div className="mt-1 text-xs font-bold leading-5">{productionDiagnostics.readinessDetail}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 rounded-2xl border border-[#e8dcc4] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Production map</div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${timelineSaveStatusStyles}`}>
                    {timelineSaveStatusLabel}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl border border-[#e8dcc4] bg-[#fffaf0] p-3">
                    <div className="font-mono text-xl font-black text-[#3d3122]">{productionDiagnostics.totalClips}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Clips</div>
                  </div>
                  <div className="rounded-xl border border-[#e8dcc4] bg-[#fffaf0] p-3">
                    <div className="font-mono text-xl font-black text-[#3d3122]">{formatClock(productionDiagnostics.timelineEndSeconds)}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Runtime</div>
                  </div>
                  <div className="rounded-xl border border-[#e8dcc4] bg-[#fffaf0] p-3">
                    <div className="font-mono text-xl font-black text-[#3d3122]">{importedMediaAssets.length}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Imports</div>
                  </div>
                  <div className="rounded-xl border border-[#e8dcc4] bg-[#fffaf0] p-3">
                    <div className="font-mono text-xl font-black text-[#3d3122]">{mediaHealthStats.broken}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Broken</div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-2xl border border-[#e8dcc4] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Selected clip</div>
                  {selectedClip && (
                    <button
                      type="button"
                      onClick={() => setCurrentTime(selectedClip.startIn)}
                      className="rounded-full border border-[#d8b777] bg-[#fff8ec] px-2 py-1 text-[10px] font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                    >
                      Cue in
                    </button>
                  )}
                </div>
                {selectedClip ? (
                  <div className="mt-3">
                    <div className="truncate text-base font-black text-[#3d3122]">{selectedClip.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-black uppercase tracking-[0.12em]">
                      <span className="rounded-full border border-[#e8dcc4] bg-[#fffaf0] px-2 py-1 text-[#8c6b4a]">{selectedClip.trackId}</span>
                      <span className={`rounded-full border px-2 py-1 ${healthStatusStyles(selectedClipHealthForCockpit?.status ?? (isMissingProductionSource(selectedClip) ? "error" : "unchecked"))}`}>
                        {selectedClipHealthForCockpit ? healthStatusLabel(selectedClipHealthForCockpit.status) : isMissingProductionSource(selectedClip) ? "Missing source" : "Unchecked"}
                      </span>
                      {selectedClipAsset && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                          Linked import
                        </span>
                      )}
                      {selectedClipIsPremiereRestorePreview && (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-900">
                          Restore preview
                        </span>
                      )}
                    </div>
                    {selectedClipIsPremiereRestorePreview && (
                      <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold leading-5 text-indigo-950">
                        <div className="font-black">Temporary Premiere rescue clip</div>
                        <div className="mt-1">
                          Source {formatClock(selectedClip.sourceStart)} - {formatClock(selectedClip.sourceEnd ?? selectedClip.sourceStart + selectedClip.duration)}.
                          Review this range before saving it into the real episode edit.
                        </div>
                      </div>
                    )}
                    <div className="mt-2 break-words text-xs font-bold leading-5 text-[#6f5336]">
                      {selectedClipAsset
                        ? `Using ${selectedClipAsset.originalName}.`
                        : selectedClip.assetId
                          ? `Source: ${describeClipSource(selectedClip)}.`
                          : "No source attached yet."}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-[#e8dcc4] bg-[#fffaf0] p-4 text-sm font-bold text-[#8c6b4a]">
                    Select a timeline clip to see source, safety, and edit controls.
                  </div>
                )}
              </div>

              <div className="min-w-0 rounded-2xl border border-[#e8dcc4] bg-white p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6b4a]">Next best moves</div>
                <div className="mt-3 space-y-2">
                  {editorNextActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={action.onClick}
                      disabled={action.disabled || !action.onClick}
                      className={`w-full rounded-xl border px-3 py-2 text-left shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${editorReadinessButtonTone(action.tone)}`}
                    >
                      <div className="font-black">{action.label}</div>
                      <div className="mt-1 text-[11px] font-bold leading-5 opacity-85">{action.detail}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <SpeakerCameraCutDesk
            timeline={timelineState}
            holds={cameraCutHolds}
            message={cameraCutMessage}
            evidenceReady={cameraEvidenceReady}
            busy={isAiAutoEditing || isAssemblingCameraCut}
            onMapSpeaker={mapSpeakerToCamera}
            onAnalyzeEvidence={handleDeterministicEditAnalysis}
            onAssemble={() => void assembleMappedSpeakerCut()}
            onProofWatchDecision={(decision) => void proofWatchCameraSwitchDecision(decision)}
            onRemoveDecision={(decision) => void restoreCameraSwitchDecision(decision)}
            proofWatchedDecisionIds={new Set(editReviewReceipts.filter((receipt) => receipt.action === "PROOF_WATCHED" && receipt.subjectKind === "camera-switch" && receipt.subjectId).map((receipt) => receipt.subjectId!))}
          />

          <EpisodeMonitorDeck
            timelineState={timelineState}
            importedMediaAssets={importedMediaAssets}
            currentTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPreviewPlaying}
            selectedClipId={selectedClip?.id ?? null}
            onSelectClip={setSelectedClipId}
            onSeek={setCurrentTime}
            onStartPlayback={startPlaybackMode}
            onPause={pausePlayback}
          />

          <section className="mb-6 rounded-[1.5rem] border border-[#e8dcc4] bg-[#fffaf0] p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8c6b4a]">Playback cockpit</div>
                <h2 className="mt-1 text-xl font-black text-[#3d3122]">Review sources, then play the cut</h2>
                <p className="mt-1 text-sm font-bold leading-6 text-[#6f5a3d]">
                  Source review shows every video feed where it lives on the timeline. Active edit skips deactivated transcript gaps without deleting them, so the raw material remains recoverable.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startPlaybackMode("play-all")}
                  className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-sm transition-colors ${
                    playbackMode === "play-all"
                      ? "border-[#8c6b4a] bg-[#8c6b4a] text-white"
                      : "border-[#e8dcc4] bg-white text-[#6f5a3d] hover:border-[#8c6b4a]"
                  }`}
                >
                  Play source review
                </button>
                <button
                  type="button"
                  onClick={() => startPlaybackMode("play-edit")}
                  className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] shadow-sm transition-colors ${
                    playbackMode === "play-edit"
                      ? "border-[#8c6b4a] bg-[#8c6b4a] text-white"
                      : "border-[#e8dcc4] bg-white text-[#6f5a3d] hover:border-[#8c6b4a]"
                  }`}
                >
                  Play active edit
                </button>
                <button
                  type="button"
                  onClick={pausePlayback}
                  className="rounded-xl border border-[#e8dcc4] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#6f5a3d] shadow-sm hover:border-[#8c6b4a]"
                >
                  Pause
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Sources</div>
                <div className="mt-1 text-2xl font-black text-[#3d3122]">{playbackCockpitStats.sourceClipCount}</div>
                <div className="mt-1 text-xs font-bold text-[#7a674c]">video/source feeds visible</div>
              </div>
              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Active edit</div>
                <div className="mt-1 text-2xl font-black text-[#3d3122]">{formatClock(playbackCockpitStats.activeEditDuration)}</div>
                <div className="mt-1 text-xs font-bold text-[#7a674c]">{playbackCockpitStats.activeClipCount} active clip{playbackCockpitStats.activeClipCount === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Skipped safely</div>
                <div className="mt-1 text-2xl font-black text-[#3d3122]">{formatClock(playbackCockpitStats.skippedDuration)}</div>
                <div className="mt-1 text-xs font-bold text-[#7a674c]">{playbackCockpitStats.skippedSectionCount} deactivated section{playbackCockpitStats.skippedSectionCount === 1 ? "" : "s"} · {playbackCockpitStats.skippedRangeEditCount} exact range{playbackCockpitStats.skippedRangeEditCount === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-2xl border border-[#e8dcc4] bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Mode now</div>
                <div className="mt-1 text-2xl font-black text-[#3d3122]">{playbackMode === "play-edit" ? "Edit" : "Source"}</div>
                <div className="mt-1 text-xs font-bold text-[#7a674c]">{isPreviewPlaying ? "Playing" : "Paused"} at {formatClock(currentTime)}</div>
              </div>
            </div>

            {deactivatedRangeEdits.length > 0 && (
              <section aria-label="Exact range edit decisions" className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Decision ledger</div>
                    <h3 className="mt-1 text-base font-black text-[#3d3122]">Exact source ranges skipped in the active edit</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-[#7a674c]">These decisions persist with the episode timeline. Proof-listen against the immutable source or restore any range without touching captured media.</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-900">
                    {deactivatedRangeEdits.length} reversible
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {deactivatedRangeEdits.map((range) => (
                    <article key={range.id} className="rounded-xl border border-[#e8dcc4] bg-[#fffaf0] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-black text-[#3d3122]">{formatClock(range.startSeconds)}–{formatClock(range.startSeconds + range.durationSeconds)} · {formatClock(range.durationSeconds)} skipped</p>
                          <p className="mt-1 text-xs font-bold leading-5 text-[#6f5a3d]">{range.reason}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-[0.12em]">
                            <span className="rounded-full border border-[#e8dcc4] bg-white px-2 py-1 text-[#8c6b4a]">{range.source.replaceAll("-", " ")}</span>
                            {range.confidence && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900">{range.confidence} confidence</span>}
                            {range.sourceEvidence && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900">decoded signal bound</span>}
                          </div>
                          {range.sourceEvidence && (
                            <p className="mt-2 font-mono text-[9px] leading-4 text-[#7a674c]">
                              {(range.sourceEvidence.coverageFraction * 100).toFixed(0)}% coverage · strongest RMS {range.sourceEvidence.maximumRmsDbfs.toFixed(1)} dBFS · profile {range.sourceEvidence.signalProfileSha256.slice(0, 10)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void proofListenPersistedRange(range)}
                            className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-[10px] font-black text-sky-900 hover:bg-sky-50"
                          >
                            Proof-listen source
                          </button>
                          <button
                            type="button"
                            onClick={() => void restorePersistedRange(range)}
                            className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-950 hover:bg-amber-100"
                          >
                            Restore to edit
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => seekSourceBoundary("previous")}
                className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-black text-[#6f5a3d] shadow-sm hover:border-[#8c6b4a]"
              >
                Previous source
              </button>
              <button
                type="button"
                onClick={() => seekSourceBoundary("next")}
                className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-black text-[#6f5a3d] shadow-sm hover:border-[#8c6b4a]"
              >
                Next source
              </button>
              <button
                type="button"
                onClick={() => seekActiveEditBoundary("previous")}
                className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-black text-[#6f5a3d] shadow-sm hover:border-[#8c6b4a]"
              >
                Previous active section
              </button>
              <button
                type="button"
                onClick={() => seekActiveEditBoundary("next")}
                className="rounded-xl border border-[#e8dcc4] bg-white px-3 py-2 text-xs font-black text-[#6f5a3d] shadow-sm hover:border-[#8c6b4a]"
              >
                Next active section
              </button>
            </div>
          </section>

          <div className={`w-full flex justify-center mb-8 ${realEditingMode ? "hidden" : ""}`}>
             <div className="w-full max-w-2xl bg-black rounded-2xl border-4 border-[#e8dcc4] overflow-hidden shadow-xl ring-1 ring-black/5 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2d2d2d] bg-[#1b1b1b] px-4 py-2">
                   <div className="flex flex-wrap gap-2">
                     <button
                       onClick={() => startPlaybackMode("play-all")}
                       className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${timelineState.editorMode === "play-all" ? "bg-amber-600 text-white" : "bg-[#2d2d2d] text-gray-400 hover:text-white"}`}
                       title="Source Monitor: Play all source material, ignoring transcript cuts"
                     >
                       Source Monitor
                     </button>
                     <button
                       onClick={() => startPlaybackMode("play-edit")}
                       className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${(timelineState.editorMode === "play-edit" || !timelineState.editorMode) ? "bg-amber-600 text-white" : "bg-[#2d2d2d] text-gray-400 hover:text-white"}`}
                       title="Program Monitor: Play only the active edit, skipping deleted text"
                     >
                       Program Monitor
                     </button>
                     <button
                       type="button"
                       onClick={() => void handleDeterministicEditAnalysis()}
                       disabled={isAiAutoEditing || !timelineState.transcript?.length}
                       className="rounded-md border border-sky-700 bg-sky-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-100 transition-colors hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
                       title="Analyze transcript timing, retake markers, repetition, and explicit restart language locally without sending content to an AI provider"
                     >
                       Analyze locally
                     </button>
                   </div>
                   <button
                     onClick={() => setIsAiDisclosureOpen(true)}
                     disabled={isAiAutoEditing || !timelineState.transcript?.length}
                     className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md text-white transition-colors flex items-center gap-2 ${isAiAutoEditing ? "bg-emerald-800 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500"}`}
                     title="Review a disclosure before sending selected transcript text to the configured AI provider"
                   >
                      <span className={`w-1.5 h-1.5 bg-white rounded-full ${isAiAutoEditing ? "animate-ping" : "animate-pulse"}`}></span>
                      {isAiAutoEditing ? "Requesting..." : "Suggest edits"}
                   </button>
                </div>
                {/* REMOTION PLAYER INTEGRATION */}
                <Player
                  component={RemotionComposition}
                  inputProps={{ timeline: timelineState }}
                  durationInFrames={durationInFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: "100%", aspectRatio: "16/9" }}
                  controls
                />

                {isAiDisclosureOpen && (
                  <section role="alertdialog" aria-labelledby="ai-edit-disclosure-title" className="border-t border-[#2d2d2d] bg-[#111] p-4 text-white">
                    <h3 id="ai-edit-disclosure-title" className="text-sm font-black">Send this transcript for suggestions?</h3>
                    <p className="mt-2 text-xs leading-5 text-gray-300">
                      Quipsly will send {timelineState.transcript.length} transcript block{timelineState.transcript.length === 1 ? "" : "s"} to the configured AI provider. It will return proposals only; nothing changes until you apply one here.
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" onClick={() => setIsAiDisclosureOpen(false)} className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-bold text-gray-200 hover:border-gray-400">
                        Cancel
                      </button>
                      <button type="button" onClick={handleAiAutoEdit} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500">
                        Send for suggestions
                      </button>
                    </div>
                  </section>
                )}

                {aiEditMessage && (
                  <div role="status" className="border-t border-[#2d2d2d] bg-[#171717] px-4 py-3 text-xs leading-5 text-gray-200">
                    {aiEditMessage}
                  </div>
                )}

                {(editReviewLedgerStatus !== "idle" || editReviewReceipts.length > 0 || editReviewLedgerNotice) && (
                  <section aria-label="Durable edit review history" className="border-t border-[#2d2d2d] bg-[#131313] px-4 py-3 text-white">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-black">Durable review history</h3>
                        <p className="mt-1 text-[10px] leading-4 text-gray-400">Proof checks and draft choices append here. Only a successful timeline save changes the shared canonical cut.</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${editReviewLedgerStatus === "error" ? "border-rose-800 text-rose-300" : editReviewLedgerStatus === "loading" ? "border-amber-800 text-amber-300" : "border-emerald-800 text-emerald-300"}`}>
                        {editReviewLedgerStatus === "loading" ? "Loading" : editReviewLedgerStatus === "error" ? "Attention" : `${editReviewReceipts.length} receipts`}
                      </span>
                    </div>
                    {editReviewLedgerNotice && <p className="mt-2 rounded-lg border border-amber-900 bg-amber-950/30 px-2 py-1.5 text-[10px] font-bold leading-4 text-amber-200">{editReviewLedgerNotice}</p>}
                    {editReviewReceipts.length > 0 && (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {editReviewReceipts.slice(0, 6).map((receipt) => (
                          <div key={receipt.id} className="rounded-lg border border-[#333] bg-[#1b1b1b] px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-black uppercase tracking-wider text-sky-300">{receipt.action.replaceAll("_", " ")}</span>
                              <span className={`text-[8px] font-black uppercase tracking-wider ${receipt.scope === "CANONICAL_TIMELINE" ? "text-emerald-300" : receipt.scope === "LOCAL_DRAFT" ? "text-amber-300" : "text-gray-500"}`}>{receipt.scope.replaceAll("_", " ")}</span>
                            </div>
                            <p className="mt-1 truncate text-[9px] text-gray-400">{receipt.actorEmail} · {new Date(receipt.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                            {receipt.sourceRange && <p className="mt-1 font-mono text-[8px] text-gray-500">source {formatClock(receipt.sourceRange.startSeconds)}–{formatClock(receipt.sourceRange.endSeconds)} · {receipt.timelineFingerprintBeforeSha256.slice(0, 10)}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(aiEditSuggestions.length > 0 || aiEditReviewCandidates.length > 0) && (
                  <section aria-label="Edit evidence and proposals" className="max-h-80 overflow-y-auto border-t border-[#2d2d2d] bg-[#111] p-4 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black">Review edit evidence</h3>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {aiEditGenerator?.kind === "deterministic" ? "Local deterministic evidence" : "Disclosed AI provider proposals"} · playback remains the acceptance check.
                        </p>
                        {aiEditGenerator?.kind === "deterministic" && aiEditSignalResolution && (
                          <p className={`mt-1 text-[10px] font-bold ${aiEditSignalResolution.status === "available" ? "text-emerald-300" : aiEditSignalResolution.status === "held" ? "text-amber-300" : "text-gray-500"}`} title={aiEditSignalResolution.reason}>
                            Decoded signal: {aiEditSignalResolution.status}{aiEditSignalResolution.boundMediaAssetId ? ` · ${aiEditSignalResolution.boundMediaAssetKind?.replaceAll("-", " ")} ${aiEditSignalResolution.boundMediaAssetId.slice(0, 12)}` : ""}
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => void dismissAllAiEditEvidence()} className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:border-gray-500">
                        Dismiss all
                      </button>
                    </div>

                    <div className="mt-3">
                      <AutomatedEditEvidenceMap
                        proposals={aiEditSuggestions}
                        candidates={aiEditReviewCandidates}
                        signal={aiEditSignalVisualization}
                        sourceStartSeconds={aiEditProposalBinding?.startSeconds ?? 0}
                        sourceEndSeconds={aiEditProposalBinding?.endSeconds ?? totalDuration}
                        currentSeconds={currentTime}
                        onSelectTime={(seconds) => {
                          setEditorMode("play-all");
                          setIsPreviewPlaying(false);
                          setAiProofWatchEndSeconds(null);
                          setCurrentTime(seconds);
                          setAiEditMessage(`Selected untouched source at ${formatClock(seconds)}. Choose proof-listen or proof-watch to record a review receipt; nothing has been applied.`);
                        }}
                        onPlaybackTime={setCurrentTime}
                        onProofReview={(item, boundProof) => void proofWatchAiEditSuggestion(
                          item,
                          boundProof
                            ? "listen"
                            : (("type" in item && item.type !== "deactivate_range")
                              || ("suggestedAction" in item && item.suggestedAction === "review-camera")
                              ? "watch"
                              : "listen"),
                          boundProof,
                        )}
                      />
                    </div>

                    <div className="mt-3 space-y-2">
                      {aiEditSuggestions.map((edit, index) => {
                        const transcriptBlock = edit.type === "deactivate"
                          ? timelineState.transcript.find((block) => block.id === edit.blockId)
                          : null;
                        const label = edit.type === "deactivate"
                          ? `Proposed transcript cut at ${formatClock(transcriptBlock?.time || 0)}`
                          : edit.type === "deactivate_range"
                            ? `Proposed low-energy range skip at ${formatClock(edit.sourceRange.startSeconds)}`
                            : `Proposed 360 reframe at ${formatClock(edit.timeOffset ?? edit.sourceRange.startSeconds)}`;
                        return (
                          <article key={edit.proposalId} className="rounded-xl border border-[#333] bg-[#1b1b1b] p-3">
                            <p className="text-xs font-black text-emerald-300">{label}</p>
                            <p className="mt-1 line-clamp-3 text-xs leading-5 text-gray-300">
                              {edit.type === "deactivate"
                                ? transcriptBlock?.text || `Block ${edit.blockId} is no longer present.`
                                : edit.type === "deactivate_range"
                                  ? `Skip ${formatClock(edit.sourceRange.startSeconds)}–${formatClock(edit.sourceRange.endSeconds)} only in active-edit playback and renders.`
                                  : `Yaw ${edit.x}°, pitch ${edit.y}°, field of view ${edit.scale}°.`}
                            </p>
                            <p className="mt-2 text-[11px] leading-5 text-gray-400">{edit.rationale}</p>
                            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500">
                              {edit.confidence} confidence · source {formatClock(edit.sourceRange.startSeconds)}–{formatClock(edit.sourceRange.endSeconds)} · original unchanged
                            </p>
                            {edit.evidence.audioSignal && (
                              <div className="mt-2 rounded-lg border border-emerald-900 bg-emerald-950/30 px-2 py-1.5 text-[10px] font-bold leading-4 text-emerald-200">
                                <p>Decoded coverage {(edit.evidence.audioSignal.coverageFraction * 100).toFixed(0)}% · strongest RMS window {edit.evidence.audioSignal.maximumRmsDbfs.toFixed(1)} dBFS</p>
                                <p className="text-emerald-400">RMS is not LUFS · signal profile {edit.evidence.audioSignal.signalProfileSha256.slice(0, 10)}</p>
                                <p className="text-amber-200">Applying creates reversible timeline metadata only. It does not alter source bytes.</p>
                              </div>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button type="button" onClick={() => void dismissAiEditSuggestion(index)} className="rounded-lg border border-gray-600 px-3 py-1.5 text-[10px] font-bold text-gray-300 hover:border-gray-400">
                                Dismiss
                              </button>
                              <button
                                type="button"
                                aria-label={`${edit.evidence.audioSignal ? "Protected-source proof required" : edit.type === "deactivate_range" ? "Proof-listen source" : "Proof-watch source"} for proposal at ${formatClock(edit.sourceRange.startSeconds)}`}
                                disabled={Boolean(edit.evidence.audioSignal)}
                                onClick={() => void proofWatchAiEditSuggestion(edit, edit.type === "deactivate_range" ? "listen" : "watch")}
                                className="rounded-lg border border-sky-500 px-3 py-1.5 text-[10px] font-black text-sky-200 hover:bg-sky-950 disabled:cursor-not-allowed disabled:border-amber-800 disabled:text-amber-300"
                              >
                                {edit.evidence.audioSignal ? "Protected-source proof required" : edit.type === "deactivate_range" ? "Proof-listen source" : "Proof-watch source"}
                              </button>
                              <button type="button" onClick={() => void applyAiEditSuggestion(edit, index)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black text-white hover:bg-emerald-500">
                                Apply proposal
                              </button>
                            </div>
                          </article>
                        );
                      })}

                      {aiEditReviewCandidates.map((candidate, index) => {
                        const label = candidate.kind === "retake-marker"
                          ? "Recording retake marker"
                          : candidate.kind === "repeated-language"
                            ? "Possible repeated take"
                            : candidate.kind === "signal-corroborated-gap"
                              ? "Measured low-energy gap"
                              : candidate.kind === "transcript-gap-with-signal"
                                ? "Signal inside transcript gap"
                                : candidate.kind === "overlapping-speech"
                                  ? "Overlapping speech timing"
                                  : candidate.kind === "speaker-change"
                                    ? "Speaker transition"
                                    : "Transcript timing gap";
                        const actionLabel = candidate.suggestedAction === "review-camera"
                          ? "Review camera"
                          : candidate.suggestedAction === "review-cut"
                            ? "Listen before cut"
                            : "Listen only";
                        return (
                          <article key={candidate.candidateId} className="rounded-xl border border-sky-900 bg-sky-950/30 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-black text-sky-200">{label}</p>
                              <span className="rounded-full border border-sky-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-300">{actionLabel}</span>
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-gray-300">{candidate.rationale}</p>
                            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-gray-500">
                              {candidate.confidence} confidence · source {formatClock(candidate.sourceRange.startSeconds)}–{formatClock(candidate.sourceRange.endSeconds)} · original unchanged
                            </p>
                            {candidate.requiresSignalEvidence && (
                              <p className="mt-2 rounded-lg border border-amber-900 bg-amber-950/30 px-2 py-1.5 text-[10px] font-bold text-amber-200">
                                Timing evidence only—not confirmed silence. Decoded audio evidence is required before a cut proposal.
                              </p>
                            )}
                            {candidate.evidence.audioSignal && (
                              <div className="mt-2 rounded-lg border border-emerald-900 bg-emerald-950/30 px-2 py-1.5 text-[10px] font-bold leading-4 text-emerald-200">
                                <p>Decoded coverage {(candidate.evidence.audioSignal.coverageFraction * 100).toFixed(0)}% · strongest RMS window {candidate.evidence.audioSignal.maximumRmsDbfs.toFixed(1)} dBFS</p>
                                <p className="text-emerald-400">RMS is not LUFS · signal profile {candidate.evidence.audioSignal.signalProfileSha256.slice(0, 10)}</p>
                              </div>
                            )}
                            {candidate.kind === "signal-corroborated-gap" && (
                              <p className="mt-2 text-[10px] font-bold text-amber-200">Measured low energy—not approved silence. Listen before creating any range edit.</p>
                            )}
                            {candidate.kind === "transcript-gap-with-signal" && (
                              <p className="mt-2 text-[10px] font-bold text-rose-200">Signal is present. Check for missing words before editing this interval.</p>
                            )}
                            {candidate.kind === "speaker-change" && (
                              <p className="mt-2 text-[10px] font-bold text-violet-200">Canonical speaker timing—not an automatic camera switch.</p>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button type="button" onClick={() => void dismissAiEditReviewCandidate(index)} className="rounded-lg border border-gray-600 px-3 py-1.5 text-[10px] font-bold text-gray-300 hover:border-gray-400">
                                Dismiss
                              </button>
                              <button
                                type="button"
                                aria-label={`${candidate.evidence.audioSignal ? "Protected-source proof required" : candidate.suggestedAction === "review-camera" ? "Proof-watch source" : "Proof-listen source"} for evidence at ${formatClock(candidate.sourceRange.startSeconds)}`}
                                disabled={Boolean(candidate.evidence.audioSignal)}
                                onClick={() => void proofWatchAiEditSuggestion(candidate, candidate.suggestedAction === "review-camera" ? "watch" : "listen")}
                                className="rounded-lg border border-sky-500 px-3 py-1.5 text-[10px] font-black text-sky-200 hover:bg-sky-950 disabled:cursor-not-allowed disabled:border-amber-800 disabled:text-amber-300"
                              >
                                {candidate.evidence.audioSignal ? "Protected-source proof required" : candidate.suggestedAction === "review-camera" ? "Proof-watch source" : "Proof-listen source"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
             </div>

             {selectedClip && (
               <div className="w-full max-w-2xl">
                 <KeyframeControls
                   clip={selectedClip}
                   currentTime={currentTime}
                   onUpdateTransforms={updateClipTransforms}
                 />
               </div>
             )}
          </div>

          <div className={`mb-6 rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm ${realEditingMode ? "hidden" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#8c6b4a]">Transcript read-along</div>
                <div className="mt-1 text-sm font-bold text-[#3d3122]">
                  {formatClock(currentTime)} / {formatClock(totalDuration)}
                </div>
              </div>
              <div className="rounded-xl bg-[#f8f3e6] px-4 py-2 text-lg font-black text-[#3d3122]">
                {activeWord?.text.trim() || "Move the playhead to light up words"}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.05}
              value={Math.min(currentTime, totalDuration)}
              onChange={(event) => {
                setIsPreviewPlaying(false);
                setCurrentTime(Number(event.target.value));
              }}
              className="mt-4 w-full accent-[#8c6b4a]"
            />
          </div>

          {viewMode === "transcript" && (
            <div className="flex-1 bg-white border border-[#e8dcc4] rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-[#fdfaf6] border-b border-[#e8dcc4]">
                <h2 className="font-bold text-lg text-[#3d3122]">Paper Edit</h2>
                <p className="text-xs text-[#8c6b4a] font-medium mt-1">
                  <strong>Click a word</strong> to seek the playhead. <strong>Shift+Click a block</strong> to cut/restore it from the active edit. Quipsly skips cut text during Program Monitor playback.
                </p>
              </div>
              <div className="p-8 overflow-y-auto flex-1 space-y-6 text-xl leading-loose font-serif text-[#5e4b33]">
                {timelineState.transcript.map((block) => (
                  <span
                    key={block.id}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.stopPropagation();
                        toggleDeleteBlock(block.id);
                      }
                    }}
                    className={`
                      inline-block mr-2 px-1 transition-all rounded relative
                      ${block.deleted || block.deactivated ? 'line-through text-[#d4c1a0]' : ''}
                      ${block.deleted ? 'decoration-red-500/50 decoration-2 cursor-pointer hover:bg-red-50' : ''}
                      ${block.deactivated ? 'decoration-purple-500/50 decoration-2 decoration-dashed cursor-pointer hover:bg-purple-50' : ''}
                    `}
                    title="Shift+Click to cut/restore this block"
                  >
                    {block.alert && !block.deleted && !block.deactivated && (
                      <span className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] font-sans font-bold px-2.5 py-0.5 rounded-md shadow-sm whitespace-nowrap z-10">
                        {block.alert}
                      </span>
                    )}
                    {(block.deactivated) && (
                      <span className="absolute -top-4 left-0 text-[10px] whitespace-nowrap z-10 opacity-70">
                        ✨ AI cut
                      </span>
                    )}
                    {block.speaker && (
                      <span className="mr-1.5 inline-flex translate-y-[-0.15em] rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-sans text-[10px] font-black uppercase tracking-wide text-violet-800">
                        {block.speaker}
                      </span>
                    )}
                    {transcriptWordTimings(block).map((word) => {
                      const isActive = !block.deleted && !block.deactivated && currentTime >= word.start && currentTime < word.end;
                      return (
                        <span
                          key={word.id}
                          onClick={(e) => {
                            if (!e.shiftKey) {
                              e.stopPropagation();
                              setIsPreviewPlaying(false);
                              setCurrentTime(word.start);
                            }
                          }}
                          className={isActive ? "rounded border border-amber-300 bg-amber-100 px-1 text-amber-900 shadow-sm cursor-pointer" : "cursor-pointer hover:bg-amber-100/50 rounded px-1 transition-colors"}
                        >
                          {word.text}
                        </span>
                      );
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === "segmenter" && (
            <div className="flex-1 w-full flex flex-col mt-4 overflow-y-auto pr-2">
               <VideoSegmentDesk />
            </div>
          )}

          {viewMode === "timeline" && (
            <div className="w-full flex-1 flex flex-col justify-end mt-auto border border-[#e8dcc4] bg-white rounded-2xl overflow-hidden shadow-sm p-4 relative">

              {(timelineState.loopClips?.length ?? 0) > 0 && (
                <div className="absolute top-16 right-4 z-10 w-64 max-h-[40vh] overflow-y-auto bg-white border border-[#e8dcc4] rounded-lg shadow-lg flex flex-col p-3 gap-3">
                  <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider flex justify-between">
                    Generated Loops
                  </h3>
                  {timelineState.loopClips!.map(loop => (
                    <div key={loop.id} className="relative rounded bg-slate-50 border border-slate-200 overflow-hidden flex flex-col group">
                      <button
                        onClick={() => deleteLoopClip(loop.id)}
                        className="absolute top-1 right-1 z-20 bg-white/80 hover:bg-white rounded-full w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete loop"
                      >
                        ✕
                      </button>
                      <div className="aspect-video w-full bg-black relative">
                        {loop.sourceType === "youtube-embed" ? (
                          <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${loop.sourceUrl}?start=${Math.floor(loop.startSec)}&end=${Math.ceil(loop.endSec)}&loop=1&playlist=${loop.sourceUrl}&autoplay=1&mute=1`}
                            allow="autoplay"
                          />
                        ) : (
                          <video
                            className="w-full h-full object-cover"
                            src={loop.sourceUrl}
                            autoPlay
                            loop
                            muted
                          />
                        )}
                      </div>
                      <div className="p-2 text-[10px]">
                        <div className="font-bold text-slate-800 truncate">{loop.title}</div>
                        <div className="text-slate-500 mt-1 uppercase tracking-wider font-bold">
                          {loop.exportability === "playable" ? "Playable Loop (YouTube)" : "Exportable Loop (Bucket)"}
                        </div>
                        {loop.manuscriptBlockId && (
                          <div className="mt-1.5 flex items-center gap-1 text-emerald-600 font-bold text-[9px] uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]"></span>
                            Attached to manuscript block
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
                <h2 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">EDL Visualizer</h2>
                <div className="relative">
                  <button
                    onClick={() => setIsAddAtPlayheadPickerOpen((v) => !v)}
                    className="rounded-md border border-[#d8b777] bg-[#fff8ec] px-2 py-1 text-[10px] font-black text-[#7b4f1f] hover:bg-[#f3e4c7]"
                  >
                    {isAddAtPlayheadPickerOpen ? "Cancel" : "Add media at playhead"}
                  </button>
                  {isAddAtPlayheadPickerOpen && (
                    <div className="absolute top-full left-0 mt-2 w-80 z-50 shadow-xl">
                      <MediaAssetPicker
                        assets={importedMediaAssets as any}
                        onSelect={(id) => {
                          const asset = importedMediaAssets.find(a => a.id === id);
                          if (asset) addImportedAssetToTimeline(asset as any);
                          setIsAddAtPlayheadPickerOpen(false);
                        }}
                        getAssetHealthLabel={(asset) => {
                          const health = importedAssetHealth(asset as any);
                          return health ? healthStatusLabel(health.status) : "Unchecked";
                        }}
                        getAssetHealthTone={(asset) => {
                          const health = importedAssetHealth(asset as any);
                          return healthStatusStyles(health?.status ?? "unchecked");
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-8 flex-1 w-full">
          <SyncDeck />

	          <InteractiveTimeline
            timelineState={timelineState}
            currentTime={currentTime}
            onSeek={setCurrentTime}
            onMoveClip={moveClipTo}
            onTrimClip={trimClip}
            onSelectClip={setSelectedClipId}
            selectedClipId={selectedClip?.id}
          />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function CloudEditor() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#fdfaf6] text-sm font-bold text-[#5e4b33]">Loading editor...</div>}>
      <CloudEditorContent />
    </Suspense>
  );
}
