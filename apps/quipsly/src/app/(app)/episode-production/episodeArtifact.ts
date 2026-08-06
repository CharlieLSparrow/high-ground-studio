import { normalizeCameraAssemblyPolicy } from "@high-ground/quipsly-domain";
import type {
  CameraAssemblyPolicy,
  CameraSwitchDecision,
  CaptureTakeMaterializationReceipt,
  CaptureTakeSourceBinding,
  SpeakerCameraMapping,
  TimelineClip,
  TimelineRangeEdit,
  TimelineState,
} from "@high-ground/quipsly-domain";

export type EpisodeArtifactTimelineClip = {
  id: string;
  assetId: string;
  sourceId?: string;
  trackId: string;
  startIn: number;
  duration: number;
  sourceStart: number;
  sourceEnd?: number;
  name: string;
  color: string;
  kind?: "audio" | "video";
  generatedFrom?: string;
  recordingSync?: Record<string, unknown>;
  captureTakeSource?: CaptureTakeSourceBinding;
  takeOrder?: number;
  segmentOrder?: number;
};

export type EpisodeArtifactTranscript = {
  id: string;
  time: number;
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
  speaker?: string | null;
  speakerParticipantId?: string | null;
  speakerUserId?: string | null;
  sourceTranscriptJobId?: string;
  sourceSegmentId?: string;
  sourceRecordingAssetId?: string;
  sourceStartSeconds?: number;
  sourceEndSeconds?: number;
  reviewStatus?: "provider" | "human-reviewed";
  acceptedReviewId?: string | null;
  deactivated?: boolean;
};

export type EpisodeArtifactPaperEditSnapshot = {
  clips: EpisodeArtifactTimelineClip[];
  transcript: EpisodeArtifactTranscript[];
  createdAt?: string;
  label?: string;
};

export type EpisodeImportedMediaAsset = {
  id: string;
  sourceId: string;
  projectSlug: string;
  episodeSlug: string;
  originalName: string;
  contentType: string;
  size: number;
  kind: "audio" | "video" | "unknown";
  bucketName: string;
  objectName: string;
  gcsUri: string;
  playbackUrl: string;
  importedAt: string;
  source: "editor-import" | "recorder-upload" | "field-kit" | (string & {});
  importRole?: string;
  metadata?: {
    recordingSync?: {
      recordedStartAt?: string;
      recordedEndAt?: string;
      deviceLabel?: string;
      sourceDeviceClockNotes?: string;
      segmentOrder?: number;
      takeOrder?: number;
      sourceFileCreatedAt?: string;
      sourceFileModifiedAt?: string;
      durationSeconds?: number;
      importJobId?: string;
      queuedAt?: string;
      fingerprint?: string;
      homeNestSlug?: string;
      [key: string]: unknown;
    };
    localImport?: Record<string, unknown>;
    [key: string]: unknown;
  };
  sync: {
    status: "ready-to-sync" | "synced" | "held";
    anchorTimelineSeconds?: number;
    targetClipId?: string;
    suggestedRole?: string;
    suggestedTrackId?: string;
    suggestionReason?: string;
    suggestionConfidence?: number;
    suggestionAppliedAt?: string;
    suggestionSource?: string;
    note?: string;
    source?: string;
    syncedAt?: string;
    recordingSegments?: import("@high-ground/quipsly-domain/recording").RecordingSegment[];
    recordingSync?: Record<string, unknown>;
  };
  proxy: {
    status: "not-queued" | "queued" | "ready" | "not-required" | "failed" | "external-preview";
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

import { DEFAULT_PROJECT_SLUG } from "@/lib/studio/project-registry";

export const EPISODE_ARTIFACT_CURRENT_VERSION = 5;
export const EPISODE_ARTIFACT_PREVIOUS_VERSION = 4;
export const EPISODE_ARTIFACT_LEGACY_VERSION = 1;
export const EPISODE_PRODUCTION_CURRENT_VERSION = 1;
export const EPISODE_AUDIO_TAKE_STACK_SOURCE = "quipsly-audio-take-stack-v1";
export const EPISODE_MAC_TIMELINE_ATTACH_SOURCE = "quipsly-mac-import-attach-v1";

export type EpisodeArtifactSource = "quipsly-editor" | "quipsly-recorder" | "editor-import" | "api-import" | (string & {});

export type EpisodeArtifactPayload = {
  payloadVersion: number;
  projectSlug: string;
  episodeSlug: string;
  source: EpisodeArtifactSource;
  timelineClips: EpisodeArtifactTimelineClip[];
  transcript: EpisodeArtifactTranscript[];
  deactivatedRanges?: TimelineRangeEdit[];
  paperEditSnapshots?: Record<string, EpisodeArtifactPaperEditSnapshot>;
  speakerCameraMappings?: SpeakerCameraMapping[];
  cameraAssemblyPolicy?: CameraAssemblyPolicy;
  cameraSwitchDecisions?: CameraSwitchDecision[];
  captureTakeMaterializations?: CaptureTakeMaterializationReceipt[];
  importedMedia?: EpisodeImportedMediaAsset[];
  contentFingerprint?: string;
  generatedFrom: string;
  savedAt: string;
  generatedAt?: string;
};

export type EpisodeProductionJsonPayload = {
  episodeProductionPayloadVersion: number;
  projectSlug: string;
  episodeSlug: string;
  importedMedia?: EpisodeImportedMediaAsset[];
  timelineClips?: EpisodeArtifactTimelineClip[];
  audioTakeStack?: Record<string, unknown>;
  audioTakeStackTrackId?: string;
  spineAudioAssetId?: string | null;
  spineAudioClipId?: string | null;
  spineAudioSource?: string | null;
  spineAudioLabel?: string | null;
  source?: string;
  [key: string]: unknown;
};

export type EpisodeArtifactLegacyInput = {
  payloadVersion?: number;
  // old key variants from early recorder/editor saves
  project?: string;
  episode?: string;
  timeline?: { timelineClips?: EpisodeArtifactTimelineClip[]; transcript?: EpisodeArtifactTranscript[]; deactivatedRanges?: TimelineRangeEdit[]; speakerCameraMappings?: SpeakerCameraMapping[]; cameraAssemblyPolicy?: CameraAssemblyPolicy; cameraSwitchDecisions?: CameraSwitchDecision[]; captureTakeMaterializations?: CaptureTakeMaterializationReceipt[] };
  room?: {
    project?: string;
    episode?: string;
    tracks?: unknown[];
  };
  version?: string;
  data?: {
    timelineClips?: EpisodeArtifactTimelineClip[];
    transcript?: EpisodeArtifactTranscript[];
    deactivatedRanges?: TimelineRangeEdit[];
    speakerCameraMappings?: SpeakerCameraMapping[];
    cameraAssemblyPolicy?: CameraAssemblyPolicy;
    cameraSwitchDecisions?: CameraSwitchDecision[];
    captureTakeMaterializations?: CaptureTakeMaterializationReceipt[];
  };
  savedAt?: string;
  [key: string]: unknown;
};

export type EpisodeArtifactShape = EpisodeArtifactPayload | EpisodeArtifactLegacyInput;

function normalizeStringRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown, fallback?: string) {
  return typeof value === "string" ? value : fallback;
}

function roundSeconds(value: number) {
  return Number(value.toFixed(3));
}

function stableCaptureTakeMaterializations(timeline: TimelineState) {
  return [...(timeline.captureTakeMaterializations ?? [])]
    .map((receipt) => ({
      ...receipt,
      sourceBindings: [...receipt.sourceBindings]
        .map((binding) => ({ ...binding }))
        .sort((left, right) => left.recordingAssetId.localeCompare(right.recordingAssetId)),
      transcriptBinding: receipt.transcriptBinding
        ? {
            ...receipt.transcriptBinding,
            blockIds: [...receipt.transcriptBinding.blockIds].sort(),
          }
        : null,
      speakerCameraMappingIds: [...receipt.speakerCameraMappingIds].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function episodeTimelineContentFingerprint(timeline: TimelineState): string {
  const clips = [...timeline.clips]
    .map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      sourceId: clip.sourceId,
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
      captureTakeSource: clip.captureTakeSource,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const transcript = [...timeline.transcript]
    .map((block) => ({
      ...block,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      speaker: block.speaker ?? null,
      speakerParticipantId: block.speakerParticipantId ?? null,
      speakerUserId: block.speakerUserId ?? null,
      sourceStartSeconds: block.sourceStartSeconds === undefined ? undefined : roundSeconds(block.sourceStartSeconds),
      sourceEndSeconds: block.sourceEndSeconds === undefined ? undefined : roundSeconds(block.sourceEndSeconds),
      deleted: Boolean(block.deleted),
      deactivated: Boolean(block.deactivated),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const deactivatedRanges = [...(timeline.deactivatedRanges ?? [])]
    .map((range) => ({
      ...range,
      startSeconds: roundSeconds(range.startSeconds),
      durationSeconds: roundSeconds(Math.max(range.durationSeconds, 0.05)),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
  const speakerCameraMappings = [...(timeline.speakerCameraMappings ?? [])]
    .map((mapping) => ({ ...mapping }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const cameraAssemblyPolicy = normalizeCameraAssemblyPolicy(timeline.cameraAssemblyPolicy);
  const cameraSwitchDecisions = [...(timeline.cameraSwitchDecisions ?? [])]
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
  const paperEditSnapshots = Object.entries(timeline.paperEditSnapshots ?? {})
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
        .sort((left, right) => left.id.localeCompare(right.id)),
      transcript: snapshot.transcript
        .map((block) => ({
          id: block.id,
          time: roundSeconds(Math.max(block.time, 0)),
          duration: roundSeconds(Math.max(block.duration, 0.05)),
          text: block.text,
          deleted: Boolean(block.deleted),
          alert: block.alert ?? null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.blockId.localeCompare(right.blockId));

  return JSON.stringify({
    clips,
    transcript,
    deactivatedRanges,
    speakerCameraMappings,
    cameraAssemblyPolicy,
    cameraSwitchDecisions,
    captureTakeMaterializations: stableCaptureTakeMaterializations(timeline),
    paperEditSnapshots,
  });
}

export function buildEpisodeArtifactPayload(input: {
  timeline: TimelineState;
  projectSlug: string;
  episodeSlug: string;
  generatedFrom: string;
  savedAt: string;
  source?: EpisodeArtifactSource;
}): EpisodeArtifact {
  const { timeline } = input;
  return {
    payloadVersion: EPISODE_ARTIFACT_CURRENT_VERSION,
    projectSlug: input.projectSlug,
    episodeSlug: input.episodeSlug,
    source: input.source ?? "quipsly-editor",
    timelineClips: timeline.clips.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      sourceId: clip.sourceId,
      trackId: clip.trackId,
      startIn: roundSeconds(clip.startIn),
      duration: roundSeconds(Math.max(clip.duration, 0.05)),
      sourceStart: roundSeconds(Math.max(clip.sourceStart, 0)),
      sourceEnd: roundSeconds(Math.max(clip.sourceEnd ?? (clip.sourceStart + clip.duration), clip.sourceStart + 0.05, clip.sourceStart)),
      name: clip.name,
      color: clip.color,
      kind: clip.kind,
      generatedFrom: clip.generatedFrom,
      recordingSync: clip.recordingSync as Record<string, unknown> | undefined,
      captureTakeSource: clip.captureTakeSource,
    })),
    transcript: timeline.transcript.map((block) => ({
      id: block.id,
      time: roundSeconds(Math.max(block.time, 0)),
      duration: roundSeconds(Math.max(block.duration, 0.05)),
      text: block.text,
      deleted: Boolean(block.deleted),
      alert: block.alert ?? null,
      speaker: block.speaker ?? null,
      speakerParticipantId: block.speakerParticipantId ?? null,
      speakerUserId: block.speakerUserId ?? null,
      sourceTranscriptJobId: block.sourceTranscriptJobId,
      sourceSegmentId: block.sourceSegmentId,
      sourceRecordingAssetId: block.sourceRecordingAssetId,
      sourceStartSeconds: block.sourceStartSeconds,
      sourceEndSeconds: block.sourceEndSeconds,
      reviewStatus: block.reviewStatus,
      acceptedReviewId: block.acceptedReviewId ?? null,
      deactivated: Boolean(block.deactivated),
    })),
    deactivatedRanges: (timeline.deactivatedRanges ?? []).map((range) => ({
      ...range,
      startSeconds: roundSeconds(range.startSeconds),
      durationSeconds: roundSeconds(Math.max(range.durationSeconds, 0.05)),
    })),
    speakerCameraMappings: timeline.speakerCameraMappings,
    cameraAssemblyPolicy: normalizeCameraAssemblyPolicy(timeline.cameraAssemblyPolicy),
    cameraSwitchDecisions: timeline.cameraSwitchDecisions,
    captureTakeMaterializations: timeline.captureTakeMaterializations,
    paperEditSnapshots: timeline.paperEditSnapshots,
    contentFingerprint: episodeTimelineContentFingerprint(timeline),
    generatedFrom: input.generatedFrom,
    savedAt: input.savedAt,
    generatedAt: input.savedAt,
  };
}

export function getEpisodePayloadVersion(value: EpisodeArtifactShape): number {
  const record = normalizeStringRecord(value);
  if (!record) return EPISODE_ARTIFACT_LEGACY_VERSION;

  const raw = record.payloadVersion;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (record.version === "quipsly-recording-room.v1" || record.version === "quipsly-timeline.v1") {
    return 1;
  }
  return EPISODE_ARTIFACT_LEGACY_VERSION;
}

export function normalizeEpisodeArtifact(value: unknown): EpisodeArtifactPayload | null {
  const record = normalizeStringRecord(value);
  if (!record) return null;

  const payloadVersion = getEpisodePayloadVersion(record);
  const nestedTimeline = normalizeStringRecord(record.timeline);
  const nestedData = normalizeStringRecord(record.data);

  const timelineClips = Array.isArray(record.timelineClips) ? record.timelineClips : Array.isArray(nestedTimeline?.timelineClips) ? nestedTimeline?.timelineClips : Array.isArray(nestedData?.timelineClips) ? nestedData?.timelineClips : [];
  const transcript = Array.isArray(record.transcript) ? record.transcript : Array.isArray(nestedTimeline?.transcript) ? nestedTimeline?.transcript : Array.isArray(nestedData?.transcript) ? nestedData?.transcript : [];
  const deactivatedRanges = Array.isArray(record.deactivatedRanges) ? record.deactivatedRanges : Array.isArray(nestedTimeline?.deactivatedRanges) ? nestedTimeline?.deactivatedRanges : Array.isArray(nestedData?.deactivatedRanges) ? nestedData?.deactivatedRanges : [];
  const speakerCameraMappings = Array.isArray(record.speakerCameraMappings) ? record.speakerCameraMappings : Array.isArray(nestedTimeline?.speakerCameraMappings) ? nestedTimeline?.speakerCameraMappings : Array.isArray(nestedData?.speakerCameraMappings) ? nestedData?.speakerCameraMappings : [];
  const cameraAssemblyPolicy = normalizeStringRecord(record.cameraAssemblyPolicy) ?? normalizeStringRecord(nestedTimeline?.cameraAssemblyPolicy) ?? normalizeStringRecord(nestedData?.cameraAssemblyPolicy);
  const cameraSwitchDecisions = Array.isArray(record.cameraSwitchDecisions) ? record.cameraSwitchDecisions : Array.isArray(nestedTimeline?.cameraSwitchDecisions) ? nestedTimeline?.cameraSwitchDecisions : Array.isArray(nestedData?.cameraSwitchDecisions) ? nestedData?.cameraSwitchDecisions : [];
  const captureTakeMaterializations = Array.isArray(record.captureTakeMaterializations) ? record.captureTakeMaterializations : Array.isArray(nestedTimeline?.captureTakeMaterializations) ? nestedTimeline?.captureTakeMaterializations : Array.isArray(nestedData?.captureTakeMaterializations) ? nestedData?.captureTakeMaterializations : [];

  if (!Array.isArray(timelineClips) || !Array.isArray(transcript)) return null;

  return {
    payloadVersion,
    projectSlug: toString(record.projectSlug, toString(record.project, "")) || DEFAULT_PROJECT_SLUG,
    episodeSlug: toString(record.episodeSlug, toString(record.episode, "current-episode")),
    source: toString(record.source, "unknown"),
    timelineClips,
    transcript,
    deactivatedRanges: deactivatedRanges as TimelineRangeEdit[],
    speakerCameraMappings: speakerCameraMappings as SpeakerCameraMapping[],
    cameraAssemblyPolicy: cameraAssemblyPolicy as CameraAssemblyPolicy | undefined,
    cameraSwitchDecisions: cameraSwitchDecisions as CameraSwitchDecision[],
    captureTakeMaterializations: captureTakeMaterializations as CaptureTakeMaterializationReceipt[],
    paperEditSnapshots: normalizeStringRecord(record.paperEditSnapshots) as Record<string, EpisodeArtifactPaperEditSnapshot> | undefined,
    importedMedia: Array.isArray(record.importedMedia) ? record.importedMedia as EpisodeImportedMediaAsset[] : undefined,
    contentFingerprint: toString(record.contentFingerprint, undefined),
    generatedFrom: toString(record.generatedFrom, "migration"),
    savedAt: toString(record.savedAt, new Date().toISOString()),
    generatedAt: toString(record.generatedAt, undefined),
  } as EpisodeArtifactPayload;
}

export function timelineStateFromEpisodeArtifact(value: unknown): TimelineState {
  const artifact = normalizeEpisodeArtifact(value);
  if (!artifact) return { clips: [], transcript: [] };
  const timelineClip = (clip: EpisodeArtifactTimelineClip): TimelineClip => ({
    ...clip,
    kind: clip.kind ?? (clip.trackId.toUpperCase().startsWith("A") ? "audio" : "video"),
    transforms: [],
  } as TimelineClip);
  const paperEditSnapshots = artifact.paperEditSnapshots
    ? Object.fromEntries(Object.entries(artifact.paperEditSnapshots).map(([blockId, snapshot]) => [
        blockId,
        {
          ...snapshot,
          clips: snapshot.clips.map(timelineClip),
          transcript: snapshot.transcript.map((block) => ({ ...block })),
        },
      ]))
    : undefined;
  return {
    clips: artifact.timelineClips.map(timelineClip),
    transcript: artifact.transcript.map((block) => ({ ...block })),
    deactivatedRanges: artifact.deactivatedRanges ?? [],
    paperEditSnapshots,
    speakerCameraMappings: artifact.speakerCameraMappings ?? [],
    cameraAssemblyPolicy: artifact.cameraAssemblyPolicy,
    cameraSwitchDecisions: artifact.cameraSwitchDecisions ?? [],
    captureTakeMaterializations: artifact.captureTakeMaterializations ?? [],
  };
}

export type EpisodeArtifactVersionedTimelinePayload = EpisodeArtifactPayload & {
  payloadVersion: number;
};

export type EpisodeArtifact = EpisodeArtifactVersionedTimelinePayload;

export type EpisodeArtifactLegacyShape = {
  // previous payloadVersion
  payloadVersion: number;
  // common migration keys used by legacy saves
  project?: string;
  episode?: string;
  timelineClips?: EpisodeArtifactTimelineClip[];
  clips?: EpisodeArtifactTimelineClip[];
  transcript?: EpisodeArtifactTranscript[];
  deactivatedRanges?: TimelineRangeEdit[];
  speakerCameraMappings?: SpeakerCameraMapping[];
  cameraAssemblyPolicy?: CameraAssemblyPolicy;
  cameraSwitchDecisions?: CameraSwitchDecision[];
  captureTakeMaterializations?: CaptureTakeMaterializationReceipt[];
  blocks?: EpisodeArtifactTranscript[];
  source?: string;
  generatedFrom?: string;
  savedAt?: string;
  generatedAt?: string;
};
