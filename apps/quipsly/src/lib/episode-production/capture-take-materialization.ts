import { createHash } from "node:crypto";

import {
  canonicalSpeakerKey,
  type CaptureTakeMaterializationReceipt,
  type CaptureTakeParticipantIdentity,
  type SpeakerCameraMapping,
  type TimelineClip,
  type TimelineState,
  type TranscriptBlock,
} from "@high-ground/quipsly-domain";

export const CAPTURE_TAKE_TIMELINE_SOURCE = "quipsly-capture-take-materialization-v1";

export type CaptureTakeReviewedAlignment = {
  reviewId: string;
  method: string;
  anchorTimelineSeconds: number;
  targetSourceSeconds: number;
};

export type CaptureTakeMaterializationSource = {
  captureGroupId: string;
  roomId: string;
  recordingAssetId: string;
  mediaAssetId: string;
  sourceId: string;
  sourceSha256: string | null;
  storageGeneration: string | null;
  playbackUrl: string;
  originalName: string;
  kind: "audio" | "video";
  durationSeconds: number;
  participant: CaptureTakeParticipantIdentity | null;
  cameraPosition: string | null;
  audioDecodeEvidence: {
    status: "not-observed" | "pending" | "failed" | "complete";
    jobId: string | null;
    sourceSha256: string | null;
    completedAt: string | null;
    completeDecode: boolean;
    error: string | null;
  };
  alignment: CaptureTakeReviewedAlignment | null;
};

export type CaptureTakeTranscriptSegment = {
  id: string;
  speaker: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  reviewStatus: "provider" | "human-reviewed";
  acceptedReviewId: string | null;
  speakerAttribution: {
    participantId: string | null;
    participantUserId: string | null;
    attributedLabel: string;
  } | null;
};

export type CaptureTakeMaterializationTranscript = {
  transcriptJobId: string;
  recordingAssetId: string;
  segments: CaptureTakeTranscriptSegment[];
};

export type CaptureTakeMaterializationIssue = {
  code:
    | "capture-group-empty"
    | "capture-group-identity-mismatch"
    | "source-identity-incomplete"
    | "source-media-unplayable"
    | "source-decode-incomplete"
    | "source-duration-invalid"
    | "spine-source-ambiguous"
    | "spine-source-missing"
    | "reviewed-alignment-required"
    | "reviewed-alignment-invalid"
    | "source-set-changed"
    | "materialized-source-lane-missing"
    | "transcript-source-missing"
    | "transcript-not-ready"
    | "speaker-attribution-incomplete"
    | "participant-camera-ambiguous"
    | "participant-camera-missing";
  severity: "blocker" | "warning";
  message: string;
  recordingAssetId?: string;
  participantId?: string;
};

export type CaptureTakeMaterializationPlan = {
  ok: boolean;
  status: "blocked" | "media-ready" | "assembly-ready";
  captureGroupId: string;
  roomId: string;
  sourceSetFingerprintSha256: string;
  timeline: TimelineState;
  sourceBindings: CaptureTakeMaterializationReceipt["sourceBindings"];
  transcriptBinding: CaptureTakeMaterializationReceipt["transcriptBinding"];
  speakerCameraMappingIds: string[];
  issues: CaptureTakeMaterializationIssue[];
  nextAction: string;
  changed: boolean;
  boundaries: CaptureTakeMaterializationReceipt["boundaries"];
};

const BOUNDARIES: CaptureTakeMaterializationReceipt["boundaries"] = {
  sourceMediaUnchanged: true,
  providerWordsUnchanged: true,
  reviewedAlignmentRequiredForNonSpineSources: true,
  speakerIdentityNeverGuessed: true,
  existingHumanTimelineDecisionsPreserved: true,
  publicationNotStarted: true,
};

function rounded(value: number) {
  return Number(value.toFixed(3));
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(value)))
    .digest("hex");
}

function sourceSetFingerprint(sources: CaptureTakeMaterializationSource[]) {
  return sha256(
    sources
      .map((source) => ({
        recordingAssetId: source.recordingAssetId,
        mediaAssetId: source.mediaAssetId,
        sourceId: source.sourceId,
        sourceSha256: source.sourceSha256,
        storageGeneration: source.storageGeneration,
        kind: source.kind,
        durationSeconds: rounded(source.durationSeconds),
        participantId: source.participant?.participantId ?? null,
        cameraPosition: source.cameraPosition,
        audioCompleteDecode: source.kind === "audio"
          ? source.audioDecodeEvidence.completeDecode
          : null,
        alignmentReviewId: source.alignment?.reviewId ?? null,
        alignmentAnchorTimelineSeconds: source.alignment
          ? rounded(source.alignment.anchorTimelineSeconds)
          : null,
        alignmentTargetSourceSeconds: source.alignment
          ? rounded(source.alignment.targetSourceSeconds)
          : null,
      }))
      .sort((left, right) => left.recordingAssetId.localeCompare(right.recordingAssetId)),
  );
}

function captureTakeClipId(captureGroupId: string, recordingAssetId: string) {
  return `capture-take:${captureGroupId}:${recordingAssetId}`;
}

function captureTakeTranscriptBlockId(transcriptJobId: string, segmentId: string) {
  return `capture-transcript:${transcriptJobId}:${segmentId}`;
}

function captureTakeSpeakerCameraMappingId(
  captureGroupId: string,
  participantId: string,
  clipId: string,
) {
  return `capture-speaker-camera:${captureGroupId}:${participantId}:${clipId}`;
}

function occupiedTrackIndexes(timeline: TimelineState, kind: "audio" | "video", captureGroupId: string) {
  const prefix = kind === "audio" ? "A" : "V";
  return new Set(
    timeline.clips
      .filter((clip) => clip.captureTakeSource?.captureGroupId !== captureGroupId)
      .map((clip) => new RegExp(`^${prefix}(\\d+)`, "i").exec(clip.trackId)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number),
  );
}

function allocateTracks(
  timeline: TimelineState,
  sources: CaptureTakeMaterializationSource[],
  captureGroupId: string,
) {
  const occupiedAudio = occupiedTrackIndexes(timeline, "audio", captureGroupId);
  const occupiedVideo = occupiedTrackIndexes(timeline, "video", captureGroupId);
  let audioCursor = 1;
  let videoCursor = 1;
  const allocation = new Map<string, string>();
  for (const source of sources) {
    const occupied = source.kind === "audio" ? occupiedAudio : occupiedVideo;
    let cursor = source.kind === "audio" ? audioCursor : videoCursor;
    while (occupied.has(cursor)) cursor += 1;
    occupied.add(cursor);
    allocation.set(source.recordingAssetId, `${source.kind === "audio" ? "A" : "V"}${cursor}`);
    if (source.kind === "audio") audioCursor = cursor + 1;
    else videoCursor = cursor + 1;
  }
  return allocation;
}

function resolveSpine(
  sources: CaptureTakeMaterializationSource[],
  spineAudioAssetId: string | null,
) {
  if (spineAudioAssetId) {
    return sources.find((source) => (
      source.mediaAssetId === spineAudioAssetId
      || source.sourceId === spineAudioAssetId
      || source.recordingAssetId === spineAudioAssetId
    )) ?? null;
  }
  const audio = sources.filter((source) => source.kind === "audio");
  if (audio.length === 1) return audio[0];
  return sources.length === 1 ? sources[0] : null;
}

function clipForSource(
  source: CaptureTakeMaterializationSource,
  spine: CaptureTakeMaterializationSource,
  trackId: string,
  existing?: TimelineClip | null,
): TimelineClip {
  const alignment = source.recordingAssetId === spine.recordingAssetId
    ? null
    : source.alignment;
  const startIn = alignment?.anchorTimelineSeconds ?? 0;
  const sourceStart = alignment?.targetSourceSeconds ?? 0;
  const duration = Math.max(0.05, source.durationSeconds - sourceStart);
  const canonical: TimelineClip = {
    id: captureTakeClipId(source.captureGroupId, source.recordingAssetId),
    assetId: source.mediaAssetId,
    sourceId: source.sourceId,
    trackId,
    startIn: rounded(startIn),
    duration: rounded(duration),
    sourceStart: rounded(sourceStart),
    sourceEnd: rounded(sourceStart + duration),
    name: source.originalName,
    color: source.kind === "audio" ? "#4f8f72" : "#4178be",
    kind: source.kind,
    transforms: [],
    generatedFrom: CAPTURE_TAKE_TIMELINE_SOURCE,
    captureTakeSource: {
      schema: "quipsly-capture-take-source-v1",
      captureGroupId: source.captureGroupId,
      roomId: source.roomId,
      recordingAssetId: source.recordingAssetId,
      mediaAssetId: source.mediaAssetId,
      sourceId: source.sourceId,
      sourceSha256: source.sourceSha256,
      storageGeneration: source.storageGeneration,
      participant: source.participant,
      cameraPosition: source.cameraPosition,
      alignmentReviewId: alignment?.reviewId ?? null,
      alignmentMethod: alignment?.method ?? "spine-origin-v1",
      audioDecodeEvidence: source.kind === "audio"
        && source.audioDecodeEvidence.status === "complete"
        && source.audioDecodeEvidence.completeDecode
        && source.audioDecodeEvidence.jobId
        && source.audioDecodeEvidence.completedAt
        ? {
            jobId: source.audioDecodeEvidence.jobId,
            sourceSha256: source.audioDecodeEvidence.sourceSha256,
            completedAt: source.audioDecodeEvidence.completedAt,
            completeDecode: true,
          }
        : null,
    },
  };
  if (!existing) return canonical;
  return {
    ...canonical,
    ...existing,
    id: canonical.id,
    assetId: canonical.assetId,
    sourceId: canonical.sourceId,
    kind: canonical.kind,
    generatedFrom: canonical.generatedFrom,
    captureTakeSource: canonical.captureTakeSource,
    transforms: existing.transforms ?? [],
  };
}

function translatedTranscriptBlocks(
  transcript: CaptureTakeMaterializationTranscript,
  sourceClip: TimelineClip,
) {
  return transcript.segments.flatMap((segment): TranscriptBlock[] => {
    const text = segment.text.trim();
    const sourceEnd = sourceClip.sourceEnd ?? sourceClip.sourceStart + sourceClip.duration;
    const visibleStart = Math.max(sourceClip.sourceStart, segment.startSeconds);
    const visibleEnd = Math.min(sourceEnd, segment.endSeconds);
    if (!text || visibleEnd <= visibleStart) return [];
    const speaker = segment.speakerAttribution?.attributedLabel
      || segment.speaker
      || null;
    return [{
      id: captureTakeTranscriptBlockId(transcript.transcriptJobId, segment.id),
      time: rounded(sourceClip.startIn + visibleStart - sourceClip.sourceStart),
      duration: rounded(Math.max(0.1, visibleEnd - visibleStart)),
      text,
      deleted: false,
      alert: null,
      speaker,
      speakerParticipantId: segment.speakerAttribution?.participantId ?? null,
      speakerUserId: segment.speakerAttribution?.participantUserId ?? null,
      sourceTranscriptJobId: transcript.transcriptJobId,
      sourceSegmentId: segment.id,
      sourceRecordingAssetId: transcript.recordingAssetId,
      sourceStartSeconds: rounded(visibleStart),
      sourceEndSeconds: rounded(visibleEnd),
      reviewStatus: segment.reviewStatus,
      acceptedReviewId: segment.acceptedReviewId,
    }];
  });
}

function mapSpeakersToReviewedParticipantCameras(input: {
  captureGroupId: string;
  now: string;
  transcriptBlocks: TranscriptBlock[];
  videoClips: TimelineClip[];
  existingMappings: SpeakerCameraMapping[];
}) {
  const issues: CaptureTakeMaterializationIssue[] = [];
  const generated: SpeakerCameraMapping[] = [];
  const speakers = new Map<string, { participantId: string; speakerLabel: string }>();
  for (const block of input.transcriptBlocks) {
    const participantId = block.speakerParticipantId;
    const speakerLabel = block.speaker?.trim();
    if (!participantId || !speakerLabel) continue;
    speakers.set(canonicalSpeakerKey(speakerLabel), { participantId, speakerLabel });
  }

  for (const [speakerKey, speaker] of speakers) {
    const existing = input.existingMappings.find((mapping) => mapping.speakerKey === speakerKey);
    if (existing) continue;
    const cameras = input.videoClips.filter((clip) => (
      clip.captureTakeSource?.participant?.participantId === speaker.participantId
    ));
    if (cameras.length === 0) {
      issues.push({
        code: "participant-camera-missing",
        severity: "warning",
        participantId: speaker.participantId,
        message: `${speaker.speakerLabel} has reviewed transcript identity but no participant-bound camera in this take.`,
      });
      continue;
    }
    if (cameras.length > 1) {
      issues.push({
        code: "participant-camera-ambiguous",
        severity: "warning",
        participantId: speaker.participantId,
        message: `${speaker.speakerLabel} has more than one camera in this take. Choose the primary angle before automated assembly.`,
      });
      continue;
    }
    const camera = cameras[0];
    generated.push({
      id: captureTakeSpeakerCameraMappingId(input.captureGroupId, speaker.participantId, camera.id),
      speakerKey,
      speakerLabel: speaker.speakerLabel,
      targetClipId: camera.id,
      targetAssetId: camera.assetId,
      source: "imported",
      createdAt: input.now,
    });
  }
  return { generated, issues };
}

function unchangedTimeline(left: TimelineState, right: TimelineState) {
  return canonicalSha256(left) === canonicalSha256(right);
}

export function planCaptureTakeMaterialization(input: {
  timeline: TimelineState;
  sources: CaptureTakeMaterializationSource[];
  transcript?: CaptureTakeMaterializationTranscript | null;
  spineAudioAssetId?: string | null;
  actor: { id: string; email: string };
  materializedAt: string;
}): CaptureTakeMaterializationPlan {
  const sources = [...input.sources].sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.recordingAssetId.localeCompare(right.recordingAssetId)
  ));
  const captureGroupId = sources[0]?.captureGroupId ?? "";
  const roomId = sources[0]?.roomId ?? "";
  const sourceSetFingerprintSha256 = sourceSetFingerprint(sources);
  const issues: CaptureTakeMaterializationIssue[] = [];
  const blocked = (nextAction: string): CaptureTakeMaterializationPlan => ({
    ok: false,
    status: "blocked",
    captureGroupId,
    roomId,
    sourceSetFingerprintSha256,
    timeline: input.timeline,
    sourceBindings: [],
    transcriptBinding: null,
    speakerCameraMappingIds: [],
    issues,
    nextAction,
    changed: false,
    boundaries: BOUNDARIES,
  });

  if (!sources.length) {
    issues.push({ code: "capture-group-empty", severity: "blocker", message: "No promoted Capture sources belong to this take." });
    return blocked("Promote the verified protected masters from Capture into this episode.");
  }
  if (sources.some((source) => source.captureGroupId !== captureGroupId || source.roomId !== roomId)) {
    issues.push({ code: "capture-group-identity-mismatch", severity: "blocker", message: "The selected sources do not share one exact Session and capture-group identity." });
    return blocked("Refresh the Episode Room and choose one coherent Capture take.");
  }
  for (const source of sources) {
    if (!source.recordingAssetId || !source.mediaAssetId || !source.sourceId) {
      issues.push({ code: "source-identity-incomplete", severity: "blocker", recordingAssetId: source.recordingAssetId, message: `${source.originalName} is missing stable Capture or Studio media identity.` });
    }
    if (!source.playbackUrl) {
      issues.push({ code: "source-media-unplayable", severity: "blocker", recordingAssetId: source.recordingAssetId, message: `${source.originalName} does not have a playable editor source.` });
    }
    if (!Number.isFinite(source.durationSeconds) || source.durationSeconds <= 0.05) {
      issues.push({ code: "source-duration-invalid", severity: "blocker", recordingAssetId: source.recordingAssetId, message: `${source.originalName} does not have a trustworthy duration.` });
    }
    if (source.kind === "audio" && source.audioDecodeEvidence.status !== "complete") {
      const failed = source.audioDecodeEvidence.status === "failed";
      issues.push({
        code: failed ? "source-media-unplayable" : "source-decode-incomplete",
        severity: "blocker",
        recordingAssetId: source.recordingAssetId,
        message: failed
          ? `${source.originalName} failed complete source decoding${source.audioDecodeEvidence.error ? `: ${source.audioDecodeEvidence.error}` : "."}`
          : `${source.originalName} has no completed exact-source decode receipt.`,
      });
    }
  }
  if (issues.some((issue) => issue.severity === "blocker")) {
    return blocked(
      issues.some((issue) => issue.code === "source-media-unplayable")
        ? "Replace or recover every source that failed complete decoding before materializing this take."
        : issues.some((issue) => issue.code === "source-decode-incomplete")
          ? "Run complete exact-source decode for every audio master before materializing this take."
          : "Repair the held source evidence before materializing this take.",
    );
  }

  const priorReceipt = (input.timeline.captureTakeMaterializations ?? []).find((receipt) => receipt.captureGroupId === captureGroupId);
  if (priorReceipt && priorReceipt.sourceSetFingerprintSha256 !== sourceSetFingerprintSha256) {
    issues.push({ code: "source-set-changed", severity: "blocker", message: "The Capture source set or reviewed placement changed after this take was materialized." });
    return blocked("Review the changed protected-master set before replacing the prior materialization.");
  }
  const existingClipByRecordingAssetId = new Map(
    (priorReceipt?.sourceBindings ?? []).map((binding) => [
      binding.recordingAssetId,
      input.timeline.clips.find((clip) => clip.id === binding.clipId) ?? null,
    ]),
  );
  if (priorReceipt) {
    for (const source of sources) {
      if (existingClipByRecordingAssetId.get(source.recordingAssetId)) continue;
      issues.push({
        code: "materialized-source-lane-missing",
        severity: "blocker",
        recordingAssetId: source.recordingAssetId,
        message: `${source.originalName} was previously materialized but its editorial lane is no longer present. Quipsly will not recreate a human-removed lane automatically.`,
      });
    }
    if (issues.some((issue) => issue.severity === "blocker")) {
      return blocked("Restore the removed source lane explicitly, or start a reviewed replacement take.");
    }
  }

  const spine = resolveSpine(sources, input.spineAudioAssetId ?? null);
  if (!spine) {
    issues.push({
      code: input.spineAudioAssetId ? "spine-source-missing" : "spine-source-ambiguous",
      severity: "blocker",
      message: input.spineAudioAssetId
        ? "The configured spine source is not part of this Capture take."
        : "Choose one audio spine before materializing a take with multiple audio sources.",
    });
    return blocked("Choose the canonical high-quality audio spine in Guided sync.");
  }
  for (const source of sources) {
    if (source.recordingAssetId === spine.recordingAssetId) continue;
    if (!source.alignment) {
      issues.push({ code: "reviewed-alignment-required", severity: "blocker", recordingAssetId: source.recordingAssetId, message: `${source.originalName} still needs reviewed waveform and drift alignment to the spine.` });
      continue;
    }
    if (
      !source.alignment.reviewId
      || !Number.isFinite(source.alignment.anchorTimelineSeconds)
      || source.alignment.anchorTimelineSeconds < 0
      || !Number.isFinite(source.alignment.targetSourceSeconds)
      || source.alignment.targetSourceSeconds < 0
      || source.alignment.targetSourceSeconds >= source.durationSeconds
    ) {
      issues.push({ code: "reviewed-alignment-invalid", severity: "blocker", recordingAssetId: source.recordingAssetId, message: `${source.originalName} has invalid reviewed placement evidence.` });
    }
  }
  if (issues.some((issue) => issue.severity === "blocker")) {
    return blocked("Finish Guided sync for every non-spine source, including later-take drift review.");
  }

  const tracks = allocateTracks(input.timeline, sources, captureGroupId);
  const clips = sources.map((source) => {
    const existing = existingClipByRecordingAssetId.get(source.recordingAssetId);
    return clipForSource(
      source,
      spine,
      existing?.trackId ?? tracks.get(source.recordingAssetId)!,
      existing,
    );
  });
  const priorSourceClipIds = new Set(priorReceipt?.sourceBindings.map((binding) => binding.clipId) ?? []);
  const preservedClips = input.timeline.clips.filter((clip) => (
    clip.captureTakeSource?.captureGroupId !== captureGroupId
    && !priorSourceClipIds.has(clip.id)
  ));
  const sourceClip = input.transcript
    ? clips.find((clip) => clip.captureTakeSource?.recordingAssetId === input.transcript?.recordingAssetId) ?? null
    : null;
  let transcriptBlocks: TranscriptBlock[] = [];
  let transcriptBinding: CaptureTakeMaterializationReceipt["transcriptBinding"] = null;
  if (!input.transcript) {
    issues.push({ code: "transcript-not-ready", severity: "warning", message: "Media is ready, but no completed canonical transcript is available yet." });
  } else if (!sourceClip) {
    issues.push({ code: "transcript-source-missing", severity: "warning", recordingAssetId: input.transcript.recordingAssetId, message: "The canonical transcript source is not in this materialized take." });
  } else {
    transcriptBlocks = translatedTranscriptBlocks(input.transcript, sourceClip);
    if (!transcriptBlocks.length) {
      issues.push({ code: "transcript-not-ready", severity: "warning", message: "The canonical transcript has no timed segments inside the visible source range." });
    }
  }

  const priorTranscriptBlockIds = new Set(priorReceipt?.transcriptBinding?.blockIds ?? []);
  const preservedTranscript = input.timeline.transcript.filter((block) => (
    !priorTranscriptBlockIds.has(block.id)
    && block.sourceTranscriptJobId !== input.transcript?.transcriptJobId
  ));
  const priorMappingIds = new Set(priorReceipt?.speakerCameraMappingIds ?? []);
  const preservedMappings = (input.timeline.speakerCameraMappings ?? []).filter((mapping) => (
    !priorMappingIds.has(mapping.id) || mapping.source === "manual"
  ));
  const mapped = mapSpeakersToReviewedParticipantCameras({
    captureGroupId,
    now: priorReceipt?.materializedAt ?? input.materializedAt,
    transcriptBlocks,
    videoClips: clips.filter((clip) => clip.kind === "video"),
    existingMappings: preservedMappings,
  });
  issues.push(...mapped.issues);

  const attributedSpeakerKeys = new Set(
    transcriptBlocks
      .filter((block) => block.speakerParticipantId && block.speaker)
      .map((block) => canonicalSpeakerKey(block.speaker!)),
  );
  const allSpeakerKeys = new Set(
    transcriptBlocks
      .filter((block) => block.speaker)
      .map((block) => canonicalSpeakerKey(block.speaker!)),
  );
  if (transcriptBlocks.length > 0 && attributedSpeakerKeys.size !== allSpeakerKeys.size) {
    issues.push({ code: "speaker-attribution-incomplete", severity: "warning", message: "At least one transcript speaker still needs playback-reviewed participant identity." });
  }

  const allMappings = [...preservedMappings, ...mapped.generated];
  const mappedSpeakerKeys = new Set(allMappings.map((mapping) => mapping.speakerKey));
  const speakerAttributionComplete = transcriptBlocks.length > 0
    && allSpeakerKeys.size > 0
    && attributedSpeakerKeys.size === allSpeakerKeys.size;
  const assemblyReady = speakerAttributionComplete
    && [...allSpeakerKeys].every((speakerKey) => mappedSpeakerKeys.has(speakerKey));
  if (input.transcript && sourceClip && transcriptBlocks.length) {
    transcriptBinding = {
      schema: "quipsly-capture-take-transcript-v1",
      transcriptJobId: input.transcript.transcriptJobId,
      recordingAssetId: input.transcript.recordingAssetId,
      sourceClipId: sourceClip.id,
      blockIds: transcriptBlocks.map((block) => block.id),
      providerWordsImmutable: true,
      reviewedCorrectionsAreOverlays: true,
      speakerAttributionComplete,
    };
  }

  const sourceBindings = clips.map((clip) => ({
    ...clip.captureTakeSource!,
    clipId: clip.id,
    trackId: clip.trackId,
  }));
  const receipt: CaptureTakeMaterializationReceipt = {
    schema: "quipsly-capture-take-materialization-v1",
    id: priorReceipt?.id ?? `capture-materialization:${captureGroupId}`,
    captureGroupId,
    roomId,
    sourceSetFingerprintSha256,
    status: assemblyReady ? "assembly-ready" : "media-materialized",
    sourceBindings,
    transcriptBinding,
    speakerCameraMappingIds: mapped.generated.map((mapping) => mapping.id),
    materializedByUserId: priorReceipt?.materializedByUserId ?? input.actor.id,
    materializedByEmail: priorReceipt?.materializedByEmail ?? input.actor.email,
    materializedAt: priorReceipt?.materializedAt ?? input.materializedAt,
    boundaries: BOUNDARIES,
  };
  const nextTimeline: TimelineState = {
    ...input.timeline,
    clips: [...preservedClips, ...clips].sort((left, right) => left.startIn - right.startIn || left.trackId.localeCompare(right.trackId)),
    transcript: [...preservedTranscript, ...transcriptBlocks].sort((left, right) => left.time - right.time || left.id.localeCompare(right.id)),
    speakerCameraMappings: allMappings,
    captureTakeMaterializations: [
      ...(input.timeline.captureTakeMaterializations ?? []).filter((candidate) => candidate.captureGroupId !== captureGroupId),
      receipt,
    ],
  };

  return {
    ok: true,
    status: assemblyReady ? "assembly-ready" : "media-ready",
    captureGroupId,
    roomId,
    sourceSetFingerprintSha256,
    timeline: nextTimeline,
    sourceBindings,
    transcriptBinding,
    speakerCameraMappingIds: receipt.speakerCameraMappingIds,
    issues,
    nextAction: assemblyReady
      ? "Review the deterministic camera assembly and audio treatment before approving an edit."
      : input.transcript
        ? "Resolve the remaining speaker/camera review warnings before automated camera assembly."
        : "Continue media review now; materialize the completed canonical transcript when it arrives.",
    changed: !unchangedTimeline(input.timeline, nextTimeline),
    boundaries: BOUNDARIES,
  };
}
