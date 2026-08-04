import { useReducer } from "react";
import { resolveTrackCollisions } from "./timeline/timelineMath";

export const TRACK_PREFIX_VIDEO = "V" as const;
export const TRACK_PREFIX_AUDIO = "A" as const;

export const DEFAULT_VIDEO_TRACK = `${TRACK_PREFIX_VIDEO}1`;
export const DEFAULT_AUDIO_TRACK = `${TRACK_PREFIX_AUDIO}1`;
import { canonicalSpeakerKey } from "@high-ground/quipsly-domain";
import type { CameraSwitchDecision, SpeakerCameraMapping, TimelineTrackKind, TransformKeyframe, TimelineClip, TranscriptBlock, TimelineRangeEdit, PaperEditSnapshot, LoopClip, TimelineState } from "@high-ground/quipsly-domain";
export type { CameraSwitchDecision, SpeakerCameraMapping, TimelineTrackKind, TransformKeyframe, TimelineClip, TranscriptBlock, TimelineRangeEdit, PaperEditSnapshot, LoopClip, TimelineState };

type TrackPrefix = typeof TRACK_PREFIX_VIDEO | typeof TRACK_PREFIX_AUDIO;

const TRACK_ID_PATTERN = /^[VA]\d+(?:\.\d+)?$/i;
const LEGACY_NUMERIC_TRACK_PATTERN = /^\d+(?:\.\d+)?$/;
const MIN_TIMELINE_CLIP_SECONDS = 0.05;

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDuration(value: number) {
  return Math.max(MIN_TIMELINE_CLIP_SECONDS, value);
}

function overlapsInterval(clipStart: number, clipEnd: number, blockStart: number, blockEnd: number) {
  return clipStart < blockEnd && clipEnd > blockStart;
}

function sanitizeTimelineClip(clip: TimelineClip, fallbackTrackId: string): TimelineClip {
  const safeTrackKind = trackKindFromTrackId(fallbackTrackId);
  const safeTrackId = normalizeTrackId(clip.trackId, fallbackTrackId, safeTrackKind);
  const explicitKind = clip.kind === "audio" || clip.kind === "video" ? clip.kind : undefined;
  const safeKind = explicitKind ?? trackKindFromTrackId(safeTrackId);
  const safeStartIn = Math.max(0, toFiniteNumber(clip.startIn, 0));
  const safeDuration = clampDuration(toFiniteNumber(clip.duration, MIN_TIMELINE_CLIP_SECONDS));
  const safeSourceStart = Math.max(0, toFiniteNumber(clip.sourceStart, 0));
  const explicitSourceEnd = toFiniteNumber(clip.sourceEnd, safeSourceStart + safeDuration);
  const safeSourceEnd = Math.max(safeSourceStart, explicitSourceEnd);

  return {
    ...clip,
    id: clip.id || `clip-${Math.floor(Math.random() * 1_000_000)}`,
    trackId: safeTrackId,
    startIn: safeStartIn,
    duration: safeDuration,
    sourceStart: safeSourceStart,
    sourceEnd: safeSourceEnd,
    kind: safeKind,
    name: (clip.name ?? "").trim() || "Clip",
    color: clip.color || "#2563eb",
    assetId: clip.assetId || "",
    sourceId: typeof clip.sourceId === "string" ? clip.sourceId : undefined,
    volume: Math.max(0, Math.min(2, toFiniteNumber(clip.volume, 1))),
    deactivated: Boolean(clip.deactivated),
    aiSuggested: Boolean(clip.aiSuggested),
    transforms: Array.isArray(clip.transforms) ? clip.transforms : [],
  };
}

function sanitizeTranscriptBlock(block: TranscriptBlock) {
  return {
    ...block,
    id: block.id || `block-${Math.floor(Math.random() * 1_000_000)}`,
    time: Math.max(0, toFiniteNumber(block.time, 0)),
    duration: Math.max(0.1, toFiniteNumber(block.duration, 1)),
    text: (block.text ?? "").trim(),
    deleted: Boolean(block.deleted),
    alert: block.alert ?? null,
    speaker: typeof block.speaker === "string" ? block.speaker.trim() || null : null,
    aiSuggested: Boolean(block.aiSuggested),
    deactivated: Boolean(block.deactivated),
  } satisfies TranscriptBlock;
}

export function sanitizeTimelineRangeEdit(range: TimelineRangeEdit): TimelineRangeEdit | null {
  const rawStartSeconds = toFiniteNumber(range.startSeconds, -1);
  const durationSeconds = toFiniteNumber(range.durationSeconds, -1);
  const id = typeof range.id === "string" ? range.id.trim() : "";
  const reason = typeof range.reason === "string" ? range.reason.trim() : "";
  if (!id || !reason || rawStartSeconds < 0 || durationSeconds < MIN_TIMELINE_CLIP_SECONDS) return null;
  const source = range.source === "deterministic-signal" || range.source === "imported-edit"
    ? range.source
    : "manual";
  const evidence = range.sourceEvidence;
  const legacyEvidence = evidence && typeof evidence === "object"
    ? evidence as unknown as Record<string, unknown>
    : {};
  const legacyRecordingAssetId = typeof legacyEvidence.recordingAssetId === "string"
    ? legacyEvidence.recordingAssetId
    : "";
  const mediaAssetKind = evidence?.mediaAssetKind === "capture-recording" || evidence?.mediaAssetKind === "studio-media"
    ? evidence.mediaAssetKind
    : legacyRecordingAssetId ? "capture-recording" : null;
  const mediaAssetId = typeof evidence?.mediaAssetId === "string"
    ? evidence.mediaAssetId
    : legacyRecordingAssetId;
  return {
    id,
    startSeconds: rawStartSeconds,
    durationSeconds,
    reason,
    source,
    confidence: range.confidence === "low" || range.confidence === "medium" || range.confidence === "high"
      ? range.confidence
      : undefined,
    proposalId: typeof range.proposalId === "string" ? range.proposalId.trim() || undefined : undefined,
    proposalSetId: typeof range.proposalSetId === "string" ? range.proposalSetId.trim() || undefined : undefined,
    proposalTimelineFingerprintSha256: typeof range.proposalTimelineFingerprintSha256 === "string" ? range.proposalTimelineFingerprintSha256.trim() || undefined : undefined,
    createdAt: typeof range.createdAt === "string" ? range.createdAt : undefined,
    aiSuggested: Boolean(range.aiSuggested),
    sourceEvidence: evidence
      && mediaAssetKind
      && mediaAssetId
      && typeof evidence.sourceSha256 === "string"
      && typeof evidence.signalProfileSha256 === "string"
      && evidence.classification === "measured-low-energy"
      ? {
        mediaAssetKind,
        mediaAssetId,
        sourceSha256: evidence.sourceSha256,
        storageGeneration: typeof evidence.storageGeneration === "string" ? evidence.storageGeneration : null,
        signalProfileSha256: evidence.signalProfileSha256,
        classification: "measured-low-energy",
        coverageFraction: Math.max(0, Math.min(1, toFiniteNumber(evidence.coverageFraction, 0))),
        maximumRmsDbfs: toFiniteNumber(evidence.maximumRmsDbfs, -160),
        nearSilenceDbfs: toFiniteNumber(evidence.nearSilenceDbfs, -72),
      }
      : undefined,
  };
}

export type DeactivatedTimelineInterval = {
  startSeconds: number;
  endSeconds: number;
  ids: string[];
};

export function deactivatedTimelineIntervals(state: TimelineState): DeactivatedTimelineInterval[] {
  const intervals = [
    ...state.transcript
      .filter((block) => block.deleted || block.deactivated)
      .map((block) => ({
        startSeconds: Math.max(0, block.time),
        endSeconds: Math.max(0, block.time + block.duration),
        id: `transcript:${block.id}`,
      })),
    ...(state.deactivatedRanges ?? []).map((range) => ({
      startSeconds: Math.max(0, range.startSeconds),
      endSeconds: Math.max(0, range.startSeconds + range.durationSeconds),
      id: `range:${range.id}`,
    })),
  ]
    .filter((range) => range.endSeconds - range.startSeconds >= MIN_TIMELINE_CLIP_SECONDS)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);

  const merged: DeactivatedTimelineInterval[] = [];
  for (const interval of intervals) {
    const prior = merged[merged.length - 1];
    if (prior && interval.startSeconds <= prior.endSeconds + 0.001) {
      prior.endSeconds = Math.max(prior.endSeconds, interval.endSeconds);
      prior.ids.push(interval.id);
    } else {
      merged.push({ startSeconds: interval.startSeconds, endSeconds: interval.endSeconds, ids: [interval.id] });
    }
  }
  return merged;
}

function makeSplitTimelineId(clipId: string, suffix: string) {
  return `${clipId}_${suffix}`;
}

export function trackKindFromTrackId(value: unknown): TimelineTrackKind {
  return isVideoTrackId(value) ? "video" : "audio";
}

export function normalizeTrackIdForKind(value: unknown, kind: TimelineTrackKind, fallbackIndex = 1) {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!raw) {
    return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${Math.max(1, Math.floor(fallbackIndex))}`;
  }

  const normalized = raw.toUpperCase();
  if (TRACK_ID_PATTERN.test(normalized)) return normalized;
  if (LEGACY_NUMERIC_TRACK_PATTERN.test(normalized)) {
    return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${normalized}`;
  }

  return `${kind === "video" ? TRACK_PREFIX_VIDEO : TRACK_PREFIX_AUDIO}${Math.max(1, Math.floor(fallbackIndex))}`;
}

export function makeTrackId(prefix: TrackPrefix, index: number, suffix?: number | string) {
  const safeIndex = Number.isFinite(index) ? Math.max(1, Math.floor(index)) : 1;
  const base = `${prefix}${safeIndex}`;
  if (suffix === undefined) return base;
  const safeSuffix = String(suffix).trim();
  return safeSuffix ? `${base}.${safeSuffix}` : base;
}

export function normalizeTrackId(value: unknown, fallback = DEFAULT_VIDEO_TRACK, kind: TimelineTrackKind = "video") {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!raw) return fallback;

  const normalized = raw.toUpperCase();
  if (TRACK_ID_PATTERN.test(normalized)) return normalized;
  if (LEGACY_NUMERIC_TRACK_PATTERN.test(normalized)) return normalizeTrackIdForKind(normalized, kind);

  return fallback;
}

export function isVideoTrackId(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.toUpperCase().startsWith(TRACK_PREFIX_VIDEO);
}

export function isAudioTrackId(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.toUpperCase().startsWith(TRACK_PREFIX_AUDIO);
}

// Types exported from @high-ground/quipsly-domain above

function sanitizePaperEditSnapshots(value: TimelineState["paperEditSnapshots"]) {
  const snapshots = value && typeof value === "object" ? value : {};
  const entries: Array<[string, PaperEditSnapshot]> = [];

  Object.entries(snapshots).forEach(([blockId, snapshot]) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const clips = Array.isArray(snapshot.clips)
      ? snapshot.clips.map((clip) => sanitizeTimelineClip(clip, DEFAULT_VIDEO_TRACK))
      : [];
    const transcript = Array.isArray(snapshot.transcript)
      ? snapshot.transcript.map(sanitizeTranscriptBlock)
      : [];
    if (!clips.length && !transcript.length) return;
    entries.push([
      blockId,
      {
        clips,
        transcript,
        createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : undefined,
        label: typeof snapshot.label === "string" ? snapshot.label : undefined,
      },
    ]);
  });

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sanitizeLoopClip(loop: any): LoopClip {
  return {
    ...loop,
    id: loop.id || `loop-${Math.floor(Math.random() * 1_000_000)}`,
    sourceType: loop.sourceType === "youtube-embed" ? "youtube-embed" : "bucket-video",
    sourceUrl: (typeof loop.sourceUrl === "string" ? loop.sourceUrl : "").trim(),
    startSec: Math.max(0, toFiniteNumber(loop.startSec, 0)),
    endSec: Math.max(0, toFiniteNumber(loop.endSec, 0)),
    title: (typeof loop.title === "string" ? loop.title : "").trim() || "Untitled Loop",
    exportability: loop.exportability === "exportable" ? "exportable" : "playable",
    manuscriptBlockId: loop.manuscriptBlockId ? String(loop.manuscriptBlockId) : undefined,
    projectSlug: loop.projectSlug ? String(loop.projectSlug) : undefined,
    episodeSlug: loop.episodeSlug ? String(loop.episodeSlug) : undefined,
    createdAt: loop.createdAt ? String(loop.createdAt) : undefined,
  };
}

function sanitizeSpeakerCameraMapping(value: SpeakerCameraMapping): SpeakerCameraMapping | null {
  const speakerLabel = typeof value.speakerLabel === "string" ? value.speakerLabel.trim() : "";
  const speakerKey = canonicalSpeakerKey(value.speakerKey || speakerLabel);
  const targetClipId = typeof value.targetClipId === "string" ? value.targetClipId.trim() : "";
  const targetAssetId = typeof value.targetAssetId === "string" ? value.targetAssetId.trim() : "";
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id || !speakerKey || !speakerLabel || !targetClipId) return null;
  return {
    id,
    speakerKey,
    speakerLabel,
    targetClipId,
    targetAssetId,
    source: value.source === "imported" ? "imported" : "manual",
    createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : new Date(0).toISOString(),
  };
}

function sanitizeCameraSwitchDecision(value: CameraSwitchDecision): CameraSwitchDecision | null {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const speakerLabel = typeof value.speakerLabel === "string" ? value.speakerLabel.trim() : "";
  const speakerKey = canonicalSpeakerKey(value.speakerKey || speakerLabel);
  const targetClipId = typeof value.targetClipId === "string" ? value.targetClipId.trim() : "";
  const mappingId = typeof value.mappingId === "string" ? value.mappingId.trim() : "";
  const startSeconds = toFiniteNumber(value.startSeconds, -1);
  const durationSeconds = toFiniteNumber(value.durationSeconds, -1);
  if (!id || !speakerKey || !speakerLabel || !targetClipId || !mappingId || startSeconds < 0 || durationSeconds < MIN_TIMELINE_CLIP_SECONDS) return null;
  const evidence = value.evidence && typeof value.evidence === "object" ? value.evidence : { transcriptBlockIds: [] };
  return {
    id,
    startSeconds,
    durationSeconds,
    speakerKey,
    speakerLabel,
    targetClipId,
    targetAssetId: typeof value.targetAssetId === "string" ? value.targetAssetId.trim() : "",
    mappingId,
    source: value.source === "manual" || value.source === "imported-edit" ? value.source : "deterministic-speaker",
    status: value.status === "approved" ? "approved" : "draft",
    createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : new Date(0).toISOString(),
    evidence: {
      transcriptBlockIds: Array.isArray(evidence.transcriptBlockIds)
        ? evidence.transcriptBlockIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        : [],
      proposalSetId: typeof evidence.proposalSetId === "string" ? evidence.proposalSetId.trim() || undefined : undefined,
      proposalTimelineFingerprintSha256: typeof evidence.proposalTimelineFingerprintSha256 === "string" ? evidence.proposalTimelineFingerprintSha256.trim() || undefined : undefined,
    },
  };
}

function sanitizeTimelineState(nextState: TimelineState | null | undefined): TimelineState {
  if (!nextState || typeof nextState !== "object") {
    return { clips: [], transcript: [], deactivatedRanges: [], loopClips: [], editorMode: "play-edit" };
  }
  const paperEditSnapshots = sanitizePaperEditSnapshots(nextState.paperEditSnapshots);
  const rawClips = Array.isArray(nextState.clips) ? nextState.clips : [];
  const rawTranscript = Array.isArray(nextState.transcript) ? nextState.transcript : [];
  const rawLoopClips = Array.isArray(nextState.loopClips) ? nextState.loopClips : [];
  const rawDeactivatedRanges = Array.isArray(nextState.deactivatedRanges) ? nextState.deactivatedRanges : [];
  const rawSpeakerCameraMappings = Array.isArray(nextState.speakerCameraMappings) ? nextState.speakerCameraMappings : [];
  const rawCameraSwitchDecisions = Array.isArray(nextState.cameraSwitchDecisions) ? nextState.cameraSwitchDecisions : [];
  const editorMode: "play-all" | "play-edit" = nextState.editorMode === "play-all" ? "play-all" : "play-edit";

  const sanitized = {
    clips: rawClips.map((clip) => sanitizeTimelineClip(clip, DEFAULT_VIDEO_TRACK)),
    transcript: rawTranscript.map(sanitizeTranscriptBlock),
    deactivatedRanges: rawDeactivatedRanges
      .map(sanitizeTimelineRangeEdit)
      .filter((range): range is TimelineRangeEdit => Boolean(range)),
    loopClips: rawLoopClips.map(sanitizeLoopClip),
    speakerCameraMappings: rawSpeakerCameraMappings
      .map(sanitizeSpeakerCameraMapping)
      .filter((mapping): mapping is SpeakerCameraMapping => Boolean(mapping)),
    cameraSwitchDecisions: rawCameraSwitchDecisions
      .map(sanitizeCameraSwitchDecision)
      .filter((decision): decision is CameraSwitchDecision => Boolean(decision))
      .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)),
    editorMode,
  };

  return paperEditSnapshots ? { ...sanitized, paperEditSnapshots } : sanitized;
}

type Action =
  | { type: "INIT"; payload: TimelineState }
  | { type: "REPLACE"; payload: TimelineState }
  | { type: "ADD_CLIP"; payload: { clip: TimelineClip } }
  | { type: "TOGGLE_DELETE_BLOCK"; payload: { blockId: string } }
  | { type: "ADD_DEACTIVATED_RANGE"; payload: { range: TimelineRangeEdit } }
  | { type: "REMOVE_DEACTIVATED_RANGE"; payload: { rangeId: string } }
  | { type: "SPLIT_CLIP_AT"; payload: { clipId: string; time: number } }
  | { type: "TRIM_CLIP"; payload: { clipId: string; edge: "start" | "end"; deltaSeconds: number } }
  | { type: "UPDATE_CLIP_SOURCE"; payload: { clipId: string; assetId: string; name?: string } }
  | { type: "DELETE_CLIP"; payload: { clipId: string } }
  | { type: "DELETE_CLIP_AND_CLOSE_GAP"; payload: { clipId: string } }
  | { type: "DUPLICATE_CLIP"; payload: { clipId: string } }
  | { type: "NUDGE_CLIP"; payload: { clipId: string; deltaSeconds: number } }
  | { type: "MOVE_CLIP_TO"; payload: { clipId: string; startIn: number } }
  | { type: "MOVE_CLIP_TO_TRACK"; payload: { clipId: string; trackId: string } }
  | { type: "RENAME_CLIP"; payload: { clipId: string; name: string } }
  | { type: "UPDATE_CLIP_TRANSFORMS"; payload: { clipId: string; transforms: TransformKeyframe[] } }
  | { type: "UPDATE_CLIP_VOLUME"; payload: { clipId: string; volume: number } }
  | { type: "ADD_CLIP_KEYFRAME"; payload: { clipId: string; keyframe: TransformKeyframe } }
  | { type: "SNAP_CLIP_TO_PREVIOUS"; payload: { clipId: string } }
  | { type: "SNAP_CLIP_TO_NEXT"; payload: { clipId: string } }
  | { type: "UPDATE_CLIP_TIMING"; payload: { clipId: string; startIn?: number; duration?: number; sourceStart?: number; sourceEnd?: number } }
  | { type: "COMPACT_TRACK_FROM_CLIP"; payload: { clipId: string } }
  | { type: "PUSH_TRACK_OVERLAPS_FROM_CLIP"; payload: { clipId: string } }
  | { type: "ADD_LOOP_CLIP"; payload: { loop: LoopClip } }
  | { type: "DELETE_LOOP_CLIP"; payload: { loopId: string } }
  | { type: "SET_SPEAKER_CAMERA_MAPPING"; payload: { mapping: SpeakerCameraMapping } }
  | { type: "REMOVE_SPEAKER_CAMERA_MAPPING"; payload: { mappingId: string } }
  | { type: "SET_CAMERA_SWITCH_DECISIONS"; payload: { decisions: CameraSwitchDecision[] } }
  | { type: "REMOVE_CAMERA_SWITCH_DECISION"; payload: { decisionId: string } }
  | { type: "TOGGLE_EDITOR_MODE"; payload?: never }
  | { type: "SET_EDITOR_MODE"; payload: { mode: "play-all" | "play-edit" } };

type TimelineHistoryState = {
  past: TimelineState[];
  present: TimelineState;
  future: TimelineState[];
};

type HistoryAction =
  | { type: "UNDO" }
  | { type: "REDO" }
  | Action;

function timelineReducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case "INIT":
      return sanitizeTimelineState(action.payload);

    case "REPLACE":
      return sanitizeTimelineState(action.payload);

    case "TOGGLE_EDITOR_MODE":
      return {
        ...state,
        editorMode: state.editorMode === "play-all" ? "play-edit" : "play-all"
      };

    case "SET_EDITOR_MODE":
      return {
        ...state,
        editorMode: action.payload.mode,
      };

    case "ADD_CLIP":
      return sanitizeTimelineState({
        ...state,
        clips: [...state.clips, action.payload.clip].sort((a, b) => a.startIn - b.startIn),
      });

    case "TOGGLE_DELETE_BLOCK": {
      const blockId = action.payload.blockId;
      const blockIndex = state.transcript.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return state;

      const block = state.transcript[blockIndex];
      const isDeleting = !block.deactivated;

      const newTranscript = [...state.transcript];
      newTranscript[blockIndex] = {
        ...block,
        deactivated: isDeleting,
        deleted: isDeleting // Keep deleted synced for legacy components
      };

      // Mark the corresponding portion of the clip as deactivated?
      // Actually, we'll let RemotionComposition handle the skipping dynamically based on the transcript's deactivated flag.

      const snapshots = state.paperEditSnapshots ?? {};

      return {
        ...state,
        transcript: newTranscript,
        paperEditSnapshots: {
          ...snapshots,
          [blockId]: snapshots[blockId] ?? {
            clips: state.clips,
            transcript: state.transcript,
            createdAt: new Date().toISOString(),
            label: block.text.slice(0, 120),
          },
        },
      };
    }
    case "ADD_DEACTIVATED_RANGE": {
      const range = sanitizeTimelineRangeEdit(action.payload.range);
      if (!range) return state;
      const existing = state.deactivatedRanges ?? [];
      if (existing.some((candidate) => candidate.id === range.id)) return state;
      const rangeEnd = range.startSeconds + range.durationSeconds;
      if (existing.some((candidate) => {
        const candidateEnd = candidate.startSeconds + candidate.durationSeconds;
        return range.startSeconds < candidateEnd && rangeEnd > candidate.startSeconds;
      })) return state;
      return {
        ...state,
        deactivatedRanges: [...existing, range].sort((left, right) => left.startSeconds - right.startSeconds),
      };
    }
    case "REMOVE_DEACTIVATED_RANGE": {
      const existing = state.deactivatedRanges ?? [];
      if (!existing.some((range) => range.id === action.payload.rangeId)) return state;
      return {
        ...state,
        deactivatedRanges: existing.filter((range) => range.id !== action.payload.rangeId),
      };
    }
    case "SPLIT_CLIP_AT": {
      const splitTime = toFiniteNumber(action.payload.time, -1);
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const clipStart = Math.max(0, clip.startIn);
      const clipEnd = clipStart + Math.max(MIN_TIMELINE_CLIP_SECONDS, clip.duration);
      if (splitTime <= clipStart + MIN_TIMELINE_CLIP_SECONDS || splitTime >= clipEnd - MIN_TIMELINE_CLIP_SECONDS) {
        return state;
      }

      const leftDuration = clampDuration(splitTime - clipStart);
      const rightDuration = clampDuration(clipEnd - splitTime);
      const rightSourceStart = clip.sourceStart + leftDuration;
      const leftClip = {
        ...clip,
        duration: leftDuration,
        sourceEnd: Math.max(clip.sourceStart + leftDuration, clip.sourceStart + MIN_TIMELINE_CLIP_SECONDS),
      };
      const rightClip = {
        ...clip,
        id: makeSplitTimelineId(clip.id, `split-${Math.round(splitTime * 1000)}`),
        startIn: splitTime,
        duration: rightDuration,
        sourceStart: rightSourceStart,
        sourceEnd: Math.max(rightSourceStart + rightDuration, rightSourceStart + MIN_TIMELINE_CLIP_SECONDS),
        name: `${clip.name} / split`,
      };

      return {
        ...state,
        clips: state.clips
          .flatMap((candidate) => candidate.id === clip.id ? [leftClip, rightClip] : [candidate])
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "TRIM_CLIP": {
      const updatedClips = state.clips.map((clip) => {
        if (clip.id !== action.payload.clipId) return clip;

        const delta = toFiniteNumber(action.payload.deltaSeconds, 0);
        if (!delta) return clip;

        if (action.payload.edge === "start") {
          const clipEnd = clip.startIn + clip.duration;
          const requestedStart = clip.startIn + delta;
          const nextStart = Math.max(0, Math.min(requestedStart, clipEnd - MIN_TIMELINE_CLIP_SECONDS));
          const appliedDelta = nextStart - clip.startIn;
          const nextSourceStart = Math.max(0, clip.sourceStart + appliedDelta);
          return {
            ...clip,
            startIn: nextStart,
            sourceStart: nextSourceStart,
            duration: clampDuration(clipEnd - nextStart),
          };
        }

        const nextDuration = clampDuration(clip.duration + delta);
        return {
          ...clip,
          duration: nextDuration,
          sourceEnd: Math.max(clip.sourceStart + nextDuration, clip.sourceStart + MIN_TIMELINE_CLIP_SECONDS),
        };
      }).sort((a, b) => a.startIn - b.startIn);

      return {
        ...state,
        clips: resolveTrackCollisions(action.payload.clipId, updatedClips as any) as any,
      };
    }
    case "UPDATE_CLIP_SOURCE": {
      const nextAssetId = action.payload.assetId.trim();

      return {
        ...state,
        clips: state.clips.map((clip) => {
          if (clip.id !== action.payload.clipId) return clip;

          const nextName = action.payload.name?.trim();
          return {
            ...clip,
            assetId: nextAssetId,
            name: nextName || clip.name,
          };
        }),
      };
    }
    case "DELETE_CLIP": {
      return {
        ...state,
        clips: state.clips.filter((clip) => clip.id !== action.payload.clipId),
      };
    }
    case "DELETE_CLIP_AND_CLOSE_GAP": {
      const deletedClip = state.clips.find((clip) => clip.id === action.payload.clipId);
      if (!deletedClip) return state;

      const deletedStart = deletedClip.startIn;
      const deletedEnd = deletedStart + deletedClip.duration;

      return {
        ...state,
        clips: state.clips
          .filter((clip) => clip.id !== action.payload.clipId)
          .map((clip) => {
            if (clip.trackId !== deletedClip.trackId || clip.startIn < deletedEnd) return clip;
            return { ...clip, startIn: Math.max(0, clip.startIn - deletedClip.duration) };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "DUPLICATE_CLIP": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const duplicate = sanitizeTimelineClip(
        {
          ...clip,
          id: makeSplitTimelineId(clip.id, `copy-${Date.now()}`),
          startIn: clip.startIn + clip.duration,
          name: `${clip.name} / copy`,
        },
        clip.trackId
      );

      return {
        ...state,
        clips: [...state.clips, duplicate].sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "NUDGE_CLIP": {
      const delta = toFiniteNumber(action.payload.deltaSeconds, 0);
      if (!delta) return state;

      return {
        ...state,
        clips: state.clips
          .map((clip) =>
            clip.id === action.payload.clipId
              ? { ...clip, startIn: Math.max(0, clip.startIn + delta) }
              : clip
          )
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "MOVE_CLIP_TO": {
      const startIn = Math.max(0, toFiniteNumber(action.payload.startIn, 0));

      const updatedClips = state.clips
        .map((clip) =>
          clip.id === action.payload.clipId
            ? { ...clip, startIn }
            : clip
        )
        .sort((a, b) => a.startIn - b.startIn);

      return {
        ...state,
        clips: resolveTrackCollisions(action.payload.clipId, updatedClips as any) as any,
      };
    }
    case "MOVE_CLIP_TO_TRACK": {
      return {
        ...state,
        clips: state.clips
          .map((clip) => {
            if (clip.id !== action.payload.clipId) return clip;
            const nextTrackId = normalizeTrackId(action.payload.trackId, clip.trackId, clip.kind);
            return {
              ...clip,
              trackId: nextTrackId,
              kind: trackKindFromTrackId(nextTrackId),
            };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "RENAME_CLIP": {
      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.payload.clipId
            ? { ...clip, name: action.payload.name }
            : clip
        ),
      };
    }
    case "UPDATE_CLIP_TRANSFORMS": {
      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.payload.clipId
            ? { ...clip, transforms: action.payload.transforms }
            : clip
        ),
      };
    }
    case "UPDATE_CLIP_VOLUME": {
      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.payload.clipId ? { ...clip, volume: action.payload.volume } : clip
        ),
      };
    }
    case "ADD_CLIP_KEYFRAME": {
      return {
        ...state,
        clips: state.clips.map((clip) => {
          if (clip.id !== action.payload.clipId) return clip;
          const newTransforms = [...(clip.transforms || []), action.payload.keyframe];
          newTransforms.sort((a, b) => a.timeOffset - b.timeOffset);
          return { ...clip, transforms: newTransforms };
        }),
      };
    }
    case "SNAP_CLIP_TO_PREVIOUS": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const previousClip = state.clips
        .filter((candidate) => candidate.id !== clip.id && candidate.trackId === clip.trackId)
        .filter((candidate) => candidate.startIn + candidate.duration <= clip.startIn + 0.05)
        .sort((a, b) => (b.startIn + b.duration) - (a.startIn + a.duration))[0];
      const nextStart = previousClip ? previousClip.startIn + previousClip.duration : 0;

      return {
        ...state,
        clips: state.clips
          .map((candidate) => candidate.id === clip.id ? { ...candidate, startIn: nextStart } : candidate)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "SNAP_CLIP_TO_NEXT": {
      const clip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!clip) return state;

      const nextClip = state.clips
        .filter((candidate) => candidate.id !== clip.id && candidate.trackId === clip.trackId)
        .filter((candidate) => candidate.startIn >= clip.startIn + clip.duration - 0.05)
        .sort((a, b) => a.startIn - b.startIn)[0];
      if (!nextClip) return state;

      return {
        ...state,
        clips: state.clips
          .map((candidate) =>
            candidate.id === clip.id
              ? { ...candidate, startIn: Math.max(0, nextClip.startIn - candidate.duration) }
              : candidate
          )
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "UPDATE_CLIP_TIMING": {
      return {
        ...state,
        clips: state.clips
          .map((clip) => {
            if (clip.id !== action.payload.clipId) return clip;

            const startIn = action.payload.startIn === undefined
              ? clip.startIn
              : Math.max(0, toFiniteNumber(action.payload.startIn, clip.startIn));
            const duration = action.payload.duration === undefined
              ? clip.duration
              : clampDuration(toFiniteNumber(action.payload.duration, clip.duration));
            const sourceStart = action.payload.sourceStart === undefined
              ? clip.sourceStart
              : Math.max(0, toFiniteNumber(action.payload.sourceStart, clip.sourceStart));
            const sourceEnd = action.payload.sourceEnd === undefined
              ? sourceStart + duration
              : Math.max(sourceStart + MIN_TIMELINE_CLIP_SECONDS, toFiniteNumber(action.payload.sourceEnd, sourceStart + duration));

            return {
              ...clip,
              startIn,
              duration,
              sourceStart,
              sourceEnd,
            };
          })
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "COMPACT_TRACK_FROM_CLIP": {
      const selectedClip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!selectedClip) return state;

      let cursor = 0;
      const selectedTrackClips = state.clips
        .filter((clip) => clip.trackId === selectedClip.trackId)
        .sort((a, b) => a.startIn - b.startIn)
        .map((clip) => {
          const nextClip = { ...clip, startIn: cursor };
          cursor += clip.duration;
          return nextClip;
        });
      const byId = new Map(selectedTrackClips.map((clip) => [clip.id, clip]));

      return {
        ...state,
        clips: state.clips
          .map((clip) => byId.get(clip.id) ?? clip)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "PUSH_TRACK_OVERLAPS_FROM_CLIP": {
      const selectedClip = state.clips.find((candidate) => candidate.id === action.payload.clipId);
      if (!selectedClip) return state;

      let cursor = 0;
      const selectedTrackClips = state.clips
        .filter((clip) => clip.trackId === selectedClip.trackId)
        .sort((a, b) => a.startIn - b.startIn)
        .map((clip) => {
          const startIn = Math.max(clip.startIn, cursor);
          const nextClip = { ...clip, startIn };
          cursor = startIn + clip.duration;
          return nextClip;
        });
      const byId = new Map(selectedTrackClips.map((clip) => [clip.id, clip]));

      return {
        ...state,
        clips: state.clips
          .map((clip) => byId.get(clip.id) ?? clip)
          .sort((a, b) => a.startIn - b.startIn),
      };
    }
    case "ADD_LOOP_CLIP": {
      const loopClips = state.loopClips ?? [];
      return {
        ...state,
        loopClips: [...loopClips, sanitizeLoopClip(action.payload.loop)],
      };
    }
    case "DELETE_LOOP_CLIP": {
      return {
        ...state,
        loopClips: (state.loopClips ?? []).filter((l) => l.id !== action.payload.loopId),
      };
    }
    case "SET_SPEAKER_CAMERA_MAPPING": {
      const mapping = sanitizeSpeakerCameraMapping(action.payload.mapping);
      if (!mapping) return state;
      const existing = state.speakerCameraMappings ?? [];
      return {
        ...state,
        speakerCameraMappings: [
          ...existing.filter((candidate) => candidate.id !== mapping.id && candidate.speakerKey !== mapping.speakerKey),
          mapping,
        ].sort((left, right) => left.speakerLabel.localeCompare(right.speakerLabel)),
        cameraSwitchDecisions: [],
      };
    }
    case "REMOVE_SPEAKER_CAMERA_MAPPING": {
      const mappings = state.speakerCameraMappings ?? [];
      if (!mappings.some((mapping) => mapping.id === action.payload.mappingId)) return state;
      return {
        ...state,
        speakerCameraMappings: mappings.filter((mapping) => mapping.id !== action.payload.mappingId),
        cameraSwitchDecisions: (state.cameraSwitchDecisions ?? []).filter((decision) => decision.mappingId !== action.payload.mappingId),
      };
    }
    case "SET_CAMERA_SWITCH_DECISIONS":
      return sanitizeTimelineState({ ...state, cameraSwitchDecisions: action.payload.decisions });
    case "REMOVE_CAMERA_SWITCH_DECISION":
      return {
        ...state,
        cameraSwitchDecisions: (state.cameraSwitchDecisions ?? []).filter((decision) => decision.id !== action.payload.decisionId),
      };
    default:
      return state;
  }
}

function timelineHistoryReducer(history: TimelineHistoryState, action: HistoryAction): TimelineHistoryState {
  if (action.type === "UNDO") {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [history.present, ...history.future],
    };
  }

  if (action.type === "REDO") {
    if (history.future.length === 0) return history;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    return {
      past: [...history.past, history.present],
      present: next,
      future: newFuture,
    };
  }

  const nextPresent = timelineReducer(history.present, action);

  if (nextPresent === history.present) {
    return history;
  }

  // Cap history at 50 states to prevent memory leaks in the browser
  const newPast = [...history.past, history.present].slice(-50);

  return {
    past: newPast,
    present: nextPresent,
    future: [],
  };
}

export function useTimelineState(initialState: TimelineState) {
  const [history, dispatch] = useReducer(timelineHistoryReducer, {
    past: [],
    present: sanitizeTimelineState(initialState),
    future: [],
  });

  return {
    state: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
    replaceTimeline: (nextState: TimelineState) =>
      dispatch({ type: "REPLACE", payload: nextState }),
    addClip: (clip: TimelineClip) =>
      dispatch({ type: "ADD_CLIP", payload: { clip } }),
    toggleDeleteBlock: (blockId: string) =>
      dispatch({ type: "TOGGLE_DELETE_BLOCK", payload: { blockId } }),
    addDeactivatedRange: (range: TimelineRangeEdit) =>
      dispatch({ type: "ADD_DEACTIVATED_RANGE", payload: { range } }),
    removeDeactivatedRange: (rangeId: string) =>
      dispatch({ type: "REMOVE_DEACTIVATED_RANGE", payload: { rangeId } }),
    splitClipAt: (clipId: string, time: number) =>
      dispatch({ type: "SPLIT_CLIP_AT", payload: { clipId, time } }),
    trimClip: (clipId: string, edge: "start" | "end", deltaSeconds: number) =>
      dispatch({ type: "TRIM_CLIP", payload: { clipId, edge, deltaSeconds } }),
    updateClipSource: (clipId: string, assetId: string, name?: string) =>
      dispatch({ type: "UPDATE_CLIP_SOURCE", payload: { clipId, assetId, name } }),
    deleteClip: (clipId: string) =>
      dispatch({ type: "DELETE_CLIP", payload: { clipId } }),
    deleteClipAndCloseGap: (clipId: string) =>
      dispatch({ type: "DELETE_CLIP_AND_CLOSE_GAP", payload: { clipId } }),
    duplicateClip: (clipId: string) =>
      dispatch({ type: "DUPLICATE_CLIP", payload: { clipId } }),
    nudgeClip: (clipId: string, deltaSeconds: number) =>
      dispatch({ type: "NUDGE_CLIP", payload: { clipId, deltaSeconds } }),
    moveClipTo: (clipId: string, startIn: number) =>
      dispatch({ type: "MOVE_CLIP_TO", payload: { clipId, startIn } }),
    moveClipToTrack: (clipId: string, trackId: string) =>
      dispatch({ type: "MOVE_CLIP_TO_TRACK", payload: { clipId, trackId } }),
    renameClip: (clipId: string, name: string) =>
      dispatch({ type: "RENAME_CLIP", payload: { clipId, name } }),
    updateClipTransforms: (clipId: string, transforms: TransformKeyframe[]) =>
      dispatch({ type: "UPDATE_CLIP_TRANSFORMS", payload: { clipId, transforms } }),
    updateClipVolume: (clipId: string, volume: number) =>
      dispatch({ type: "UPDATE_CLIP_VOLUME", payload: { clipId, volume } }),
    addClipKeyframe: (clipId: string, keyframe: TransformKeyframe) =>
      dispatch({ type: "ADD_CLIP_KEYFRAME", payload: { clipId, keyframe } }),
    snapClipToPrevious: (clipId: string) =>
      dispatch({ type: "SNAP_CLIP_TO_PREVIOUS", payload: { clipId } }),
    snapClipToNext: (clipId: string) =>
      dispatch({ type: "SNAP_CLIP_TO_NEXT", payload: { clipId } }),
    updateClipTiming: (clipId: string, timing: { startIn?: number; duration?: number; sourceStart?: number; sourceEnd?: number }) =>
      dispatch({ type: "UPDATE_CLIP_TIMING", payload: { clipId, ...timing } }),
    compactTrackFromClip: (clipId: string) =>
      dispatch({ type: "COMPACT_TRACK_FROM_CLIP", payload: { clipId } }),
    pushTrackOverlapsFromClip: (clipId: string) =>
      dispatch({ type: "PUSH_TRACK_OVERLAPS_FROM_CLIP", payload: { clipId } }),
    toggleEditorMode: () =>
      dispatch({ type: "TOGGLE_EDITOR_MODE" }),
    setEditorMode: (mode: "play-all" | "play-edit") =>
      dispatch({ type: "SET_EDITOR_MODE", payload: { mode } }),
    addLoopClip: (loop: LoopClip) =>
      dispatch({ type: "ADD_LOOP_CLIP", payload: { loop } }),
    deleteLoopClip: (loopId: string) =>
      dispatch({ type: "DELETE_LOOP_CLIP", payload: { loopId } }),
    setSpeakerCameraMapping: (mapping: SpeakerCameraMapping) =>
      dispatch({ type: "SET_SPEAKER_CAMERA_MAPPING", payload: { mapping } }),
    removeSpeakerCameraMapping: (mappingId: string) =>
      dispatch({ type: "REMOVE_SPEAKER_CAMERA_MAPPING", payload: { mappingId } }),
    setCameraSwitchDecisions: (decisions: CameraSwitchDecision[]) =>
      dispatch({ type: "SET_CAMERA_SWITCH_DECISIONS", payload: { decisions } }),
    removeCameraSwitchDecision: (decisionId: string) =>
      dispatch({ type: "REMOVE_CAMERA_SWITCH_DECISION", payload: { decisionId } }),
  };
}
