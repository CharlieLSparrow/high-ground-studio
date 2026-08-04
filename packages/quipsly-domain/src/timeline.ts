export type TimelineTrackKind = "audio" | "video";

export type TransformKeyframe = {
  id: string;
  timeOffset: number; // Seconds from the start of the clip
  scale?: number;     // Zoom (2D) or FOV (360)
  x?: number;         // Pan X (2D) or Yaw (360)
  y?: number;         // Pan Y (2D) or Pitch (360)
  rotation?: number;  // Roll
  easing?: "linear" | "ease-in-out";
  aiSuggested?: boolean;
};

export type TimelineClip = {
  id: string;
  assetId: string;
  kind: TimelineTrackKind;
  startIn: number;   // Start time relative to timeline (00:00)
  duration: number;  // Duration of the clip on timeline
  sourceStart: number; // In-point on the source media
  sourceEnd?: number;
  name: string;
  color: string;
  trackId: string;
  sourceId?: string;
  volume?: number;
  deactivated?: boolean;
  aiSuggested?: boolean;
  transforms?: TransformKeyframe[];
  /**
   * Identifies a deterministic projection rather than hand-authored media.
   * Editors preserve this so a projection can be refreshed by stable identity
   * without mutating the protected source recording.
   */
  generatedFrom?: string;
  /** Receipt-backed Episode Room clock evidence for Shared Watch spans. */
  recordingSync?: {
    episodeRoomSessionId: string;
    recordingRoomId?: string;
    recordingStartedAt?: string;
    watchSegmentId: string;
    startReceiptId: string;
    endReceiptId: string;
    watchedAt: string;
  };
};

export type TranscriptBlock = {
  id: string;
  time: number; // Timeline time where this block starts
  duration: number;
  text: string;
  deleted: boolean;
  alert: string | null;
  speaker?: string | null;
  deactivated?: boolean;
  aiSuggested?: boolean;
};

/**
 * A reversible non-destructive decision to skip an exact timeline interval.
 * Source media stays immutable; active-edit playback and render projections
 * ripple around this interval while source review continues to expose it.
 */
export type TimelineRangeEdit = {
  id: string;
  startSeconds: number;
  durationSeconds: number;
  reason: string;
  source: "manual" | "deterministic-signal" | "imported-edit";
  confidence?: "low" | "medium" | "high";
  proposalId?: string;
  proposalSetId?: string;
  proposalTimelineFingerprintSha256?: string;
  createdAt?: string;
  aiSuggested?: boolean;
  sourceEvidence?: {
    recordingAssetId: string;
    sourceSha256: string;
    storageGeneration: string | null;
    signalProfileSha256: string;
    classification: "measured-low-energy";
    coverageFraction: number;
    maximumRmsDbfs: number;
    nearSilenceDbfs: number;
  };
};

export type PaperEditSnapshot = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  createdAt?: string;
  label?: string;
};

export type LoopClip = {
  id: string;
  sourceType: "youtube-embed" | "bucket-video";
  sourceUrl: string;
  startSec: number;
  endSec: number;
  title: string;
  exportability: "playable" | "exportable";
  manuscriptBlockId?: string;
  projectSlug?: string;
  episodeSlug?: string;
  createdAt?: string;
};

/**
 * An explicit human-authored identity bridge between a canonical transcript
 * speaker and one synchronized camera source. The mapping is metadata only:
 * it never changes, copies, or trims source media.
 */
export type SpeakerCameraMapping = {
  id: string;
  speakerKey: string;
  speakerLabel: string;
  targetClipId: string;
  targetAssetId: string;
  source: "manual" | "imported";
  createdAt: string;
};

/**
 * A reversible program-monitor decision over exact source time. Decisions are
 * generated only from explicit speaker mappings and retained transcript
 * evidence, and remain reviewable timeline metadata until publication.
 */
export type CameraSwitchDecision = {
  id: string;
  startSeconds: number;
  durationSeconds: number;
  speakerKey: string;
  speakerLabel: string;
  targetClipId: string;
  targetAssetId: string;
  mappingId: string;
  source: "deterministic-speaker" | "manual" | "imported-edit";
  status: "draft" | "approved";
  createdAt: string;
  evidence: {
    transcriptBlockIds: string[];
    proposalSetId?: string;
    proposalTimelineFingerprintSha256?: string;
  };
};

export type CameraCutAssemblyHold = {
  reason: "unmapped-speaker" | "camera-not-covering-range" | "rapid-speaker-turn" | "overlapping-speech";
  speakerLabel: string;
  startSeconds: number;
  endSeconds: number;
  transcriptBlockIds: string[];
};

export type CameraCutAssemblyResult = {
  decisions: CameraSwitchDecision[];
  holds: CameraCutAssemblyHold[];
};

export type TimelineState = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  deactivatedRanges?: TimelineRangeEdit[];
  paperEditSnapshots?: Record<string, PaperEditSnapshot>;
  loopClips?: LoopClip[];
  speakerCameraMappings?: SpeakerCameraMapping[];
  cameraSwitchDecisions?: CameraSwitchDecision[];
  editorMode?: "play-all" | "play-edit";
};

const CAMERA_CUT_MINIMUM_SECONDS = 1.5;

export function canonicalSpeakerKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase().replace(/\s+/g, " ")
    : "";
}

function clipCoversSourceRange(clip: TimelineClip, startSeconds: number, endSeconds: number) {
  return !clip.deactivated
    && (clip.kind === "video" || clip.trackId.toUpperCase().startsWith("V"))
    && clip.startIn <= startSeconds + 0.001
    && clip.startIn + Math.max(clip.duration, 0.05) >= endSeconds - 0.001;
}

/**
 * Builds a conservative first-pass speaker cut. Short turns and overlaps hold
 * the previous shot; missing mappings or source coverage are reported instead
 * of guessed. Accepted runs extend until the next accepted switch so held
 * chatter cannot create a flash cut.
 */
export function assembleSpeakerCameraCut(input: {
  timeline: TimelineState;
  createdAt: string;
  minimumShotSeconds?: number;
  proposalSetId?: string;
  proposalTimelineFingerprintSha256?: string;
}): CameraCutAssemblyResult {
  const minimumShotSeconds = Math.max(0.25, input.minimumShotSeconds ?? CAMERA_CUT_MINIMUM_SECONDS);
  const mappings = new Map(
    (input.timeline.speakerCameraMappings ?? []).map((mapping) => [mapping.speakerKey, mapping]),
  );
  const blocks = input.timeline.transcript
    .filter((block) => !block.deleted && !block.deactivated && canonicalSpeakerKey(block.speaker))
    .map((block) => ({
      block,
      speakerKey: canonicalSpeakerKey(block.speaker),
      speakerLabel: block.speaker?.trim() || "Unknown speaker",
      startSeconds: Math.max(0, block.time),
      endSeconds: Math.max(0, block.time + Math.max(block.duration, 0.05)),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.block.id.localeCompare(right.block.id));

  const runs: Array<{
    speakerKey: string;
    speakerLabel: string;
    startSeconds: number;
    endSeconds: number;
    transcriptBlockIds: string[];
    overlapsPriorSpeaker: boolean;
  }> = [];
  for (const item of blocks) {
    const prior = runs[runs.length - 1];
    if (prior && prior.speakerKey === item.speakerKey && item.startSeconds <= prior.endSeconds + 0.35) {
      prior.endSeconds = Math.max(prior.endSeconds, item.endSeconds);
      prior.transcriptBlockIds.push(item.block.id);
      continue;
    }
    runs.push({
      speakerKey: item.speakerKey,
      speakerLabel: item.speakerLabel,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      transcriptBlockIds: [item.block.id],
      overlapsPriorSpeaker: Boolean(prior && item.startSeconds < prior.endSeconds - 0.001 && item.speakerKey !== prior.speakerKey),
    });
  }

  const holds: CameraCutAssemblyHold[] = [];
  const accepted: Array<typeof runs[number] & { mapping: SpeakerCameraMapping }> = [];
  for (const run of runs) {
    const mapping = mappings.get(run.speakerKey);
    if (!mapping) {
      holds.push({ reason: "unmapped-speaker", speakerLabel: run.speakerLabel, startSeconds: run.startSeconds, endSeconds: run.endSeconds, transcriptBlockIds: run.transcriptBlockIds });
      continue;
    }
    if (run.overlapsPriorSpeaker) {
      holds.push({ reason: "overlapping-speech", speakerLabel: run.speakerLabel, startSeconds: run.startSeconds, endSeconds: run.endSeconds, transcriptBlockIds: run.transcriptBlockIds });
      continue;
    }
    if (run.endSeconds - run.startSeconds < minimumShotSeconds) {
      holds.push({ reason: "rapid-speaker-turn", speakerLabel: run.speakerLabel, startSeconds: run.startSeconds, endSeconds: run.endSeconds, transcriptBlockIds: run.transcriptBlockIds });
      continue;
    }
    const clip = input.timeline.clips.find((candidate) => candidate.id === mapping.targetClipId);
    if (!clip || !clipCoversSourceRange(clip, run.startSeconds, run.endSeconds)) {
      holds.push({ reason: "camera-not-covering-range", speakerLabel: run.speakerLabel, startSeconds: run.startSeconds, endSeconds: run.endSeconds, transcriptBlockIds: run.transcriptBlockIds });
      continue;
    }
    accepted.push({ ...run, mapping });
  }

  const collapsed: typeof accepted = [];
  for (const run of accepted) {
    const prior = collapsed[collapsed.length - 1];
    if (prior?.mapping.targetClipId === run.mapping.targetClipId) {
      prior.endSeconds = Math.max(prior.endSeconds, run.endSeconds);
      prior.transcriptBlockIds.push(...run.transcriptBlockIds);
    } else {
      collapsed.push({ ...run, transcriptBlockIds: [...run.transcriptBlockIds] });
    }
  }

  const decisions = collapsed.map((run, index): CameraSwitchDecision => {
    const next = collapsed[index + 1];
    const endSeconds = Math.max(run.endSeconds, next?.startSeconds ?? run.endSeconds);
    return {
      id: `camera-switch:${run.mapping.id}:${Math.round(run.startSeconds * 1_000)}`,
      startSeconds: run.startSeconds,
      durationSeconds: Math.max(0.05, endSeconds - run.startSeconds),
      speakerKey: run.speakerKey,
      speakerLabel: run.speakerLabel,
      targetClipId: run.mapping.targetClipId,
      targetAssetId: run.mapping.targetAssetId,
      mappingId: run.mapping.id,
      source: "deterministic-speaker",
      status: "draft",
      createdAt: input.createdAt,
      evidence: {
        transcriptBlockIds: Array.from(new Set(run.transcriptBlockIds)),
        proposalSetId: input.proposalSetId,
        proposalTimelineFingerprintSha256: input.proposalTimelineFingerprintSha256,
      },
    };
  });

  return { decisions, holds };
}

export function cameraSwitchDecisionAtTime(timeline: TimelineState, time: number) {
  return [...(timeline.cameraSwitchDecisions ?? [])]
    .filter((decision) => time >= decision.startSeconds && time < decision.startSeconds + decision.durationSeconds)
    .sort((left, right) => right.startSeconds - left.startSeconds)[0] ?? null;
}

export function cameraClipAtTime(timeline: TimelineState, time: number) {
  const decision = cameraSwitchDecisionAtTime(timeline, time);
  if (!decision) return null;
  const clip = timeline.clips.find((candidate) => candidate.id === decision.targetClipId);
  return clip && clipCoversSourceRange(clip, time, time + 0.001) ? clip : null;
}
