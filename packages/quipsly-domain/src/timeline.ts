export type TimelineTrackKind = "audio" | "video";

export type CaptureTakeParticipantIdentity = {
  participantId: string;
  userId: string | null;
  displayLabel: string;
  email: string | null;
  role: string | null;
  deviceLabel: string | null;
};

export type CaptureTakeSourceBinding = {
  schema: "quipsly-capture-take-source-v1";
  captureGroupId: string;
  roomId: string;
  recordingAssetId: string;
  mediaAssetId: string;
  sourceId: string;
  sourceSha256: string | null;
  storageGeneration: string | null;
  participant: CaptureTakeParticipantIdentity | null;
  cameraPosition: string | null;
  alignmentReviewId: string | null;
  alignmentMethod: string;
  audioDecodeEvidence?: {
    jobId: string;
    sourceSha256: string | null;
    completedAt: string;
    completeDecode: true;
    signalStatus?: "signal-present" | "attention" | "near-digital-silence" | null;
    rmsDbfs?: number | null;
    samplePeakDbfs?: number | null;
  } | null;
};

export type CaptureTakeTranscriptBinding = {
  schema: "quipsly-capture-take-transcript-v1";
  transcriptJobId: string;
  recordingAssetId: string;
  sourceClipId: string;
  blockIds: string[];
  providerWordsImmutable: true;
  reviewedCorrectionsAreOverlays: true;
  speakerAttributionComplete: boolean;
};

export type CaptureTakeMaterializationReceipt = {
  schema: "quipsly-capture-take-materialization-v1";
  id: string;
  captureGroupId: string;
  roomId: string;
  sourceSetFingerprintSha256: string;
  status: "media-materialized" | "assembly-ready";
  sourceBindings: Array<CaptureTakeSourceBinding & {
    clipId: string;
    trackId: string;
  }>;
  transcriptBinding: CaptureTakeTranscriptBinding | null;
  speakerCameraMappingIds: string[];
  materializedByUserId: string;
  materializedByEmail: string;
  materializedAt: string;
  boundaries: {
    sourceMediaUnchanged: true;
    providerWordsUnchanged: true;
    reviewedAlignmentRequiredForNonSpineSources: true;
    speakerIdentityNeverGuessed: true;
    existingHumanTimelineDecisionsPreserved: true;
    publicationNotStarted: true;
  };
};

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

export type SourceStoryReframeKeyframe = {
  sourceSeconds: number;
  panDegrees: number;
  tiltDegrees: number;
  rollDegrees: number;
  fieldOfViewDegrees: number;
  interpolation: "hold" | "linear" | "ease";
};

/**
 * Immutable Source-to-Story provenance carried by a canonical Episode clip.
 * The editor may move or trim the clip, but this binding always identifies the
 * exact retained range/package that was deliberately promoted into the edit.
 */
export type SourceStoryTimelineBinding = {
  schema: "quipsly-source-story-timeline-binding-v1";
  placementId: string;
  cardId: string;
  cardStableId: string;
  cardRevision: number;
  sourceRangeId: string;
  selectorSha256: string;
  sourceRevisionId: string;
  sourceIdentitySha256: string;
  sourceContentSha256: string | null;
  sourceSetId: string | null;
  sourceSetIdentitySha256: string | null;
  externalReferenceId: string | null;
  browseDerivative: null | {
    id: string;
    profile: string;
    contentSha256: string;
    sizeBytes: string;
    mimeType: string;
  };
  reframeRecipe: null | {
    schema: "quipsly-360-reframe-v1";
    projection: "equirectangular";
    aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
    stabilization: "source" | "flowstate" | "off";
    horizonLock: boolean;
    keyframes: SourceStoryReframeKeyframe[];
  };
  promotedAt: string;
  promotedByUserId: string;
  promotedByEmail: string;
  boundaries: {
    sourceMediaUnchanged: true;
    browseDerivativeIsNotOriginal: true;
    sourceClockPreserved: true;
    finalRenderMustResolveExactSource: true;
    publicationNotStarted: true;
  };
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
  /** Immutable Capture-to-Episode identity and reviewed placement evidence. */
  captureTakeSource?: CaptureTakeSourceBinding;
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
  /** Source Story range/package identity and explicit promotion evidence. */
  sourceStory?: SourceStoryTimelineBinding;
};

export type TranscriptBlock = {
  id: string;
  time: number; // Timeline time where this block starts
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
    mediaAssetKind: "capture-recording" | "studio-media";
    mediaAssetId: string;
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
  source: "deterministic-speaker" | "deterministic-assembly" | "manual" | "imported-edit";
  status: "draft" | "approved";
  createdAt: string;
  evidence: {
    transcriptBlockIds: string[];
    proposalSetId?: string;
    proposalTimelineFingerprintSha256?: string;
    policyId?: string;
    assemblyReason?: CameraAssemblyReason;
  };
};

export type CameraAssemblyStyle = "active-speaker" | "natural-conversation" | "dynamic";
export type CameraWideAngleMode = "off" | "overlap-and-silence" | "periodic";
export type CameraAssemblyReason =
  | "active-speaker"
  | "wide-overlap"
  | "wide-silence"
  | "wide-intro"
  | "wide-outro"
  | "wide-cutaway";

export type CameraAssemblyPolicy = {
  id: string;
  style: CameraAssemblyStyle;
  minimumShotSeconds: number;
  speakerSwitchDelaySeconds: number;
  wideAngleMode: CameraWideAngleMode;
  wideClipId: string | null;
  silenceWideThresholdSeconds: number;
  cutawayIntervalSeconds: number | null;
  cutawayDurationSeconds: number;
  useWideForIntroOutro: boolean;
  source: "manual" | "imported";
  createdAt: string;
};

export type CameraCutAssemblyHold = {
  reason: "unmapped-speaker" | "camera-not-covering-range" | "rapid-speaker-turn" | "overlapping-speech";
  speakerLabel: string;
  startSeconds: number;
  endSeconds: number;
  transcriptBlockIds: string[];
};

export type CameraCutAssemblyWarning = {
  reason: "wide-camera-not-mapped" | "wide-camera-not-covering-range";
  startSeconds: number | null;
  endSeconds: number | null;
  detail: string;
};

export type CameraCutAssemblyResult = {
  decisions: CameraSwitchDecision[];
  holds: CameraCutAssemblyHold[];
  warnings: CameraCutAssemblyWarning[];
  policy: CameraAssemblyPolicy;
};

export type CameraAssemblyReadinessIssue = {
  code:
    | "no-video-source"
    | "single-video-source"
    | "no-transcript"
    | "unlabeled-transcript"
    | "unmapped-speaker"
    | "mapped-camera-missing"
    | "mapped-camera-not-covering-speaker"
    | "wide-camera-not-mapped"
    | "wide-camera-not-covering-program";
  severity: "block" | "warning";
  detail: string;
  speakerKey?: string;
  clipId?: string;
};

export type CameraAssemblyReadiness = {
  status: "ready" | "speaker-only" | "blocked";
  videoSourceCount: number;
  activeTranscriptBlockCount: number;
  labeledTranscriptBlockCount: number;
  speakerCount: number;
  mappedSpeakerCount: number;
  programStartSeconds: number | null;
  programEndSeconds: number | null;
  policy: CameraAssemblyPolicy;
  issues: CameraAssemblyReadinessIssue[];
  nextAction: string;
  boundaries: {
    timelinePlacementIsNotSourceSyncProof: true;
    readinessCreatesNoDecision: true;
    explicitCameraIdentityRequired: true;
  };
};

export type TimelineState = {
  clips: TimelineClip[];
  transcript: TranscriptBlock[];
  deactivatedRanges?: TimelineRangeEdit[];
  paperEditSnapshots?: Record<string, PaperEditSnapshot>;
  loopClips?: LoopClip[];
  speakerCameraMappings?: SpeakerCameraMapping[];
  cameraAssemblyPolicy?: CameraAssemblyPolicy;
  cameraSwitchDecisions?: CameraSwitchDecision[];
  captureTakeMaterializations?: CaptureTakeMaterializationReceipt[];
  editorMode?: "play-all" | "play-edit";
};

const CAMERA_CUT_MINIMUM_SECONDS = 1.5;

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function cameraAssemblyPolicyPreset(
  style: CameraAssemblyStyle,
  input: { id?: string; wideClipId?: string | null; createdAt?: string } = {},
): CameraAssemblyPolicy {
  const shared = {
    id: input.id?.trim() || "camera-assembly-policy",
    wideClipId: input.wideClipId?.trim() || null,
    source: "manual" as const,
    createdAt: input.createdAt?.trim() || new Date(0).toISOString(),
  };
  if (style === "natural-conversation") return {
    ...shared,
    style,
    minimumShotSeconds: 2,
    speakerSwitchDelaySeconds: 0.2,
    wideAngleMode: "overlap-and-silence",
    silenceWideThresholdSeconds: 1.25,
    cutawayIntervalSeconds: null,
    cutawayDurationSeconds: 2.5,
    useWideForIntroOutro: true,
  };
  if (style === "dynamic") return {
    ...shared,
    style,
    minimumShotSeconds: 1.75,
    speakerSwitchDelaySeconds: 0.15,
    wideAngleMode: "periodic",
    silenceWideThresholdSeconds: 1,
    cutawayIntervalSeconds: 30,
    cutawayDurationSeconds: 2.5,
    useWideForIntroOutro: true,
  };
  return {
    ...shared,
    style: "active-speaker",
    minimumShotSeconds: CAMERA_CUT_MINIMUM_SECONDS,
    speakerSwitchDelaySeconds: 0,
    wideAngleMode: "off",
    silenceWideThresholdSeconds: 1.25,
    cutawayIntervalSeconds: null,
    cutawayDurationSeconds: 2.5,
    useWideForIntroOutro: false,
  };
}

export function normalizeCameraAssemblyPolicy(value: CameraAssemblyPolicy | null | undefined): CameraAssemblyPolicy {
  const style: CameraAssemblyStyle = value?.style === "natural-conversation" || value?.style === "dynamic"
    ? value.style
    : "active-speaker";
  const preset = cameraAssemblyPolicyPreset(style, {
    id: value?.id,
    wideClipId: value?.wideClipId,
    createdAt: value?.createdAt,
  });
  const wideAngleMode: CameraWideAngleMode = value?.wideAngleMode === "overlap-and-silence" || value?.wideAngleMode === "periodic"
    ? value.wideAngleMode
    : style === "active-speaker" ? "off" : preset.wideAngleMode;
  const interval = value?.cutawayIntervalSeconds;
  return {
    ...preset,
    minimumShotSeconds: boundedNumber(value?.minimumShotSeconds, preset.minimumShotSeconds, 0.5, 30),
    speakerSwitchDelaySeconds: boundedNumber(value?.speakerSwitchDelaySeconds, preset.speakerSwitchDelaySeconds, 0, 2),
    wideAngleMode,
    silenceWideThresholdSeconds: boundedNumber(value?.silenceWideThresholdSeconds, preset.silenceWideThresholdSeconds, 0.5, 10),
    cutawayIntervalSeconds: interval === null || interval === undefined
      ? preset.cutawayIntervalSeconds
      : boundedNumber(interval, preset.cutawayIntervalSeconds ?? 30, 5, 120),
    cutawayDurationSeconds: boundedNumber(value?.cutawayDurationSeconds, preset.cutawayDurationSeconds, 1, 10),
    useWideForIntroOutro: value?.useWideForIntroOutro ?? preset.useWideForIntroOutro,
    source: value?.source === "imported" ? "imported" : "manual",
  };
}

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

export function cameraAssemblyReadiness(timeline: TimelineState): CameraAssemblyReadiness {
  const policy = normalizeCameraAssemblyPolicy(timeline.cameraAssemblyPolicy);
  const videoClips = timeline.clips.filter((clip) => (clip.kind === "video" || clip.trackId.toUpperCase().startsWith("V")) && !clip.deactivated);
  const activeBlocks = timeline.transcript.filter((block) => !block.deleted && !block.deactivated);
  const labeledBlocks = activeBlocks.filter((block) => canonicalSpeakerKey(block.speaker));
  const speakers = new Map<string, { label: string; startSeconds: number; endSeconds: number }>();
  for (const block of labeledBlocks) {
    const speakerKey = canonicalSpeakerKey(block.speaker);
    const current = speakers.get(speakerKey);
    const startSeconds = Math.max(0, block.time);
    const endSeconds = Math.max(startSeconds + 0.05, block.time + Math.max(block.duration, 0.05));
    speakers.set(speakerKey, {
      label: block.speaker?.trim() || speakerKey,
      startSeconds: current ? Math.min(current.startSeconds, startSeconds) : startSeconds,
      endSeconds: current ? Math.max(current.endSeconds, endSeconds) : endSeconds,
    });
  }
  const mappings = new Map((timeline.speakerCameraMappings ?? []).map((mapping) => [canonicalSpeakerKey(mapping.speakerKey), mapping]));
  const issues: CameraAssemblyReadinessIssue[] = [];
  if (!videoClips.length) issues.push({ code: "no-video-source", severity: "block", detail: "Attach at least one synchronized video source before assembling camera decisions." });
  else if (videoClips.length === 1) issues.push({ code: "single-video-source", severity: "warning", detail: "Only one active video source is present. Speaker cuts can be reviewed, but there is no second angle to switch to." });
  if (!activeBlocks.length) issues.push({ code: "no-transcript", severity: "block", detail: "Attach or generate the canonical timed transcript before using speaker evidence." });
  else if (labeledBlocks.length < activeBlocks.length) issues.push({ code: "unlabeled-transcript", severity: "block", detail: `${activeBlocks.length - labeledBlocks.length} active transcript block${activeBlocks.length - labeledBlocks.length === 1 ? " has" : "s have"} no canonical speaker identity.` });

  let mappedSpeakerCount = 0;
  for (const [speakerKey, speaker] of speakers) {
    const mapping = mappings.get(speakerKey);
    if (!mapping) {
      issues.push({ code: "unmapped-speaker", severity: "block", speakerKey, detail: `${speaker.label} has no explicit camera mapping.` });
      continue;
    }
    const clip = videoClips.find((candidate) => candidate.id === mapping.targetClipId);
    if (!clip) {
      issues.push({ code: "mapped-camera-missing", severity: "block", speakerKey, clipId: mapping.targetClipId, detail: `${speaker.label}'s mapped camera is not an active video source on this timeline.` });
      continue;
    }
    if (!clipCoversSourceRange(clip, speaker.startSeconds, speaker.endSeconds)) {
      issues.push({ code: "mapped-camera-not-covering-speaker", severity: "block", speakerKey, clipId: clip.id, detail: `${speaker.label}'s mapped camera does not cover the complete labeled source range.` });
      continue;
    }
    mappedSpeakerCount += 1;
  }
  const programStartSeconds = activeBlocks.length ? Math.min(...activeBlocks.map((block) => Math.max(0, block.time))) : null;
  const programEndSeconds = activeBlocks.length ? Math.max(...activeBlocks.map((block) => Math.max(0, block.time + Math.max(block.duration, 0.05)))) : null;
  if (policy.wideAngleMode !== "off") {
    const wideClip = policy.wideClipId ? videoClips.find((clip) => clip.id === policy.wideClipId) : null;
    if (!wideClip) issues.push({ code: "wide-camera-not-mapped", severity: "warning", detail: "The selected style requests wide coverage, but no active wide camera is mapped. Quipsly will keep speaker-only decisions and report every unavailable wide range." });
    else if (programStartSeconds !== null && programEndSeconds !== null && !clipCoversSourceRange(wideClip, programStartSeconds, programEndSeconds)) {
      issues.push({ code: "wide-camera-not-covering-program", severity: "warning", clipId: wideClip.id, detail: "The mapped wide camera does not cover the complete transcript program range. Uncovered wide decisions will be refused individually." });
    }
  }

  const blocking = issues.filter((issue) => issue.severity === "block");
  const status = blocking.length ? "blocked" : issues.some((issue) => issue.severity === "warning") ? "speaker-only" : "ready";
  const nextAction = blocking[0]?.detail
    ?? issues[0]?.detail
    ?? "Bind the current timeline and transcript evidence, then assemble and proof-watch the reversible draft.";
  return {
    status,
    videoSourceCount: videoClips.length,
    activeTranscriptBlockCount: activeBlocks.length,
    labeledTranscriptBlockCount: labeledBlocks.length,
    speakerCount: speakers.size,
    mappedSpeakerCount,
    programStartSeconds,
    programEndSeconds,
    policy,
    issues,
    nextAction,
    boundaries: {
      timelinePlacementIsNotSourceSyncProof: true,
      readinessCreatesNoDecision: true,
      explicitCameraIdentityRequired: true,
    },
  };
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
  const normalizedPolicy = normalizeCameraAssemblyPolicy(input.timeline.cameraAssemblyPolicy);
  const policy = input.minimumShotSeconds === undefined
    ? normalizedPolicy
    : { ...normalizedPolicy, minimumShotSeconds: boundedNumber(input.minimumShotSeconds, normalizedPolicy.minimumShotSeconds, 0.5, 30) };
  const minimumShotSeconds = policy.minimumShotSeconds;
  const mappings = new Map(
    (input.timeline.speakerCameraMappings ?? []).map((mapping) => [canonicalSpeakerKey(mapping.speakerKey), mapping]),
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
    const requiredRunSeconds = minimumShotSeconds + (accepted.length ? policy.speakerSwitchDelaySeconds : 0);
    if (run.endSeconds - run.startSeconds < requiredRunSeconds) {
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

  const switchStarts = collapsed.map((run, index) => index === 0
    ? run.startSeconds
    : Math.min(run.endSeconds - 0.05, run.startSeconds + policy.speakerSwitchDelaySeconds));
  let decisions = collapsed.map((run, index): CameraSwitchDecision => {
    const next = collapsed[index + 1];
    const startSeconds = switchStarts[index] ?? run.startSeconds;
    const endSeconds = Math.max(run.endSeconds, next ? switchStarts[index + 1] ?? next.startSeconds : run.endSeconds);
    return {
      id: `camera-switch:${run.mapping.id}:${Math.round(startSeconds * 1_000)}`,
      startSeconds,
      durationSeconds: Math.max(0.05, endSeconds - startSeconds),
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
        policyId: policy.id,
        assemblyReason: "active-speaker",
      },
    };
  });

  const warnings: CameraCutAssemblyWarning[] = [];
  const wideClip = policy.wideClipId
    ? input.timeline.clips.find((clip) => clip.id === policy.wideClipId && (clip.kind === "video" || clip.trackId.toUpperCase().startsWith("V")) && !clip.deactivated)
    : null;
  if (policy.wideAngleMode !== "off" && !wideClip) {
    warnings.push({
      reason: "wide-camera-not-mapped",
      startSeconds: null,
      endSeconds: null,
      detail: "This assembly style requests wide coverage, but no active wide camera is mapped. Speaker decisions remain available; Quipsly will not substitute an arbitrary track.",
    });
  }

  type WideOverlay = {
    startSeconds: number;
    endSeconds: number;
    reason: Exclude<CameraAssemblyReason, "active-speaker">;
    transcriptBlockIds: string[];
  };
  const overlays: WideOverlay[] = [];
  const firstDecision = decisions[0];
  const lastDecision = decisions[decisions.length - 1];
  if (wideClip && policy.useWideForIntroOutro && firstDecision && lastDecision) {
    const introEnd = Math.min(firstDecision.startSeconds + 3, firstDecision.startSeconds + firstDecision.durationSeconds);
    if (introEnd - firstDecision.startSeconds >= 1) overlays.push({ startSeconds: firstDecision.startSeconds, endSeconds: introEnd, reason: "wide-intro", transcriptBlockIds: firstDecision.evidence.transcriptBlockIds });
    const lastEnd = lastDecision.startSeconds + lastDecision.durationSeconds;
    const outroStart = Math.max(lastDecision.startSeconds, lastEnd - 3);
    if (lastEnd - outroStart >= 1) overlays.push({ startSeconds: outroStart, endSeconds: lastEnd, reason: "wide-outro", transcriptBlockIds: lastDecision.evidence.transcriptBlockIds });
  }
  if (wideClip && policy.wideAngleMode === "periodic" && policy.cutawayIntervalSeconds) {
    for (const decision of decisions) {
      const decisionEnd = decision.startSeconds + decision.durationSeconds;
      for (let startSeconds = decision.startSeconds + policy.cutawayIntervalSeconds; startSeconds + policy.cutawayDurationSeconds < decisionEnd - 0.05; startSeconds += policy.cutawayIntervalSeconds) {
        overlays.push({ startSeconds, endSeconds: startSeconds + policy.cutawayDurationSeconds, reason: "wide-cutaway", transcriptBlockIds: decision.evidence.transcriptBlockIds });
      }
    }
  }
  if (wideClip && policy.wideAngleMode !== "off") {
    for (let index = 0; index < collapsed.length - 1; index += 1) {
      const current = collapsed[index]!;
      const next = collapsed[index + 1]!;
      const silenceStart = current.endSeconds;
      const silenceEnd = next.startSeconds;
      if (silenceEnd - silenceStart >= policy.silenceWideThresholdSeconds) {
        overlays.push({ startSeconds: silenceStart, endSeconds: silenceEnd, reason: "wide-silence", transcriptBlockIds: [] });
      }
    }
    for (const hold of holds.filter((candidate) => candidate.reason === "overlapping-speech")) {
      if (hold.endSeconds - hold.startSeconds >= 0.25) overlays.push({ startSeconds: hold.startSeconds, endSeconds: hold.endSeconds, reason: "wide-overlap", transcriptBlockIds: hold.transcriptBlockIds });
    }
  }

  function withWideOverlay(current: CameraSwitchDecision[], overlay: WideOverlay) {
    if (!wideClip || !clipCoversSourceRange(wideClip, overlay.startSeconds, overlay.endSeconds)) {
      warnings.push({
        reason: "wide-camera-not-covering-range",
        startSeconds: overlay.startSeconds,
        endSeconds: overlay.endSeconds,
        detail: `The mapped wide camera does not cover ${overlay.startSeconds.toFixed(3)}–${overlay.endSeconds.toFixed(3)} seconds. The existing shot remains; no blank angle was created.`,
      });
      return current;
    }
    const next: CameraSwitchDecision[] = [];
    for (const decision of current) {
      const decisionEnd = decision.startSeconds + decision.durationSeconds;
      if (overlay.endSeconds <= decision.startSeconds + 0.001 || overlay.startSeconds >= decisionEnd - 0.001) {
        next.push(decision);
        continue;
      }
      if (overlay.startSeconds > decision.startSeconds + 0.001) next.push({
        ...decision,
        id: `${decision.id}:before:${Math.round(overlay.startSeconds * 1_000)}`,
        durationSeconds: overlay.startSeconds - decision.startSeconds,
      });
      if (overlay.endSeconds < decisionEnd - 0.001) next.push({
        ...decision,
        id: `${decision.id}:after:${Math.round(overlay.endSeconds * 1_000)}`,
        startSeconds: overlay.endSeconds,
        durationSeconds: decisionEnd - overlay.endSeconds,
      });
    }
    next.push({
      id: `camera-switch:${policy.id}:${overlay.reason}:${Math.round(overlay.startSeconds * 1_000)}`,
      startSeconds: overlay.startSeconds,
      durationSeconds: overlay.endSeconds - overlay.startSeconds,
      speakerKey: "__wide__",
      speakerLabel: "Wide coverage",
      targetClipId: wideClip.id,
      targetAssetId: wideClip.assetId,
      mappingId: policy.id,
      source: "deterministic-assembly",
      status: "draft",
      createdAt: input.createdAt,
      evidence: {
        transcriptBlockIds: Array.from(new Set(overlay.transcriptBlockIds)),
        proposalSetId: input.proposalSetId,
        proposalTimelineFingerprintSha256: input.proposalTimelineFingerprintSha256,
        policyId: policy.id,
        assemblyReason: overlay.reason,
      },
    });
    return next.sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
  }

  const overlayPriority: Record<WideOverlay["reason"], number> = {
    "wide-intro": 0,
    "wide-outro": 0,
    "wide-cutaway": 1,
    "wide-silence": 2,
    "wide-overlap": 3,
  };
  for (const overlay of overlays.sort((left, right) => overlayPriority[left.reason] - overlayPriority[right.reason] || left.startSeconds - right.startSeconds)) {
    decisions = withWideOverlay(decisions, overlay);
  }

  return { decisions, holds, warnings, policy };
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
