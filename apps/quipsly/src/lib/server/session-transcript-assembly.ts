export const SESSION_TRANSCRIPT_PROGRAM_CLOCK_SCHEMA =
  "quipsly-session-transcript-program-clock-v1" as const;

export type SessionTranscriptTimingAuthority =
  | "single-source-origin"
  | "reviewed-waveform-placement"
  | "mixed-waveform-clock-placement"
  | "capture-clock-proposal"
  | "reported-wall-clock-fallback";

export type SessionTranscriptReviewedPlacement = {
  alignmentJobId: string;
  captureGroupId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  signedOffsetSeconds: number;
  residualDriftMilliseconds: number;
  correctionApplied: false;
  sourceBytesMutated: false;
  sampleAccurateClaimed: false;
};

export type SessionTranscriptTimingSource = {
  recordingAssetId: string;
  transcriptJobId: string;
  captureGroupId?: string | null;
  recordedStartedAt: string | Date;
  alignment?: unknown;
};

export type SessionTranscriptProgramSource = {
  recordingAssetId: string;
  transcriptJobId: string;
  captureGroupId: string | null;
  programOffsetSeconds: number;
  estimatedProgramStartedAt: string;
  timingAuthority: SessionTranscriptTimingAuthority;
  timingUncertaintyMilliseconds: number | null;
  timingReviewRequired: boolean;
  sampleAccurateClaimed: false;
};

export type SessionTranscriptProgramClock = {
  schema: typeof SESSION_TRANSCRIPT_PROGRAM_CLOCK_SCHEMA;
  authority: SessionTranscriptTimingAuthority;
  captureGroupId: string | null;
  baselineRecordingAssetId: string;
  baselineStartedAt: string;
  sources: SessionTranscriptProgramSource[];
  waveformReviewRequired: boolean;
  sampleAccurateClaimed: false;
  reason: string;
};

export class SessionTranscriptAssemblyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "TRANSCRIPT_SOURCE_INVALID"
      | "TRANSCRIPT_SOURCE_TAKE_MISMATCH"
      | "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT",
  ) {
    super(message);
    this.name = "SessionTranscriptAssemblyError";
  }
}

type ValidAlignment = {
  captureGroupId: string;
  estimatedServerStartedAt: string;
  startedAtMilliseconds: number;
  uncertaintyMilliseconds: number;
};

/**
 * Places independently source-bound transcripts on one provisional Session
 * clock. Measured relationships are retained within connected groups; device
 * clocks place disconnected/reconnected groups. No provider/source times are
 * rewritten and no placement implies drift correction or sample accuracy.
 */
export function assembleSessionTranscriptProgramClock(
  input: SessionTranscriptTimingSource[],
  options: { reviewedPlacements?: SessionTranscriptReviewedPlacement[] } = {},
): SessionTranscriptProgramClock {
  if (!input.length) {
    throw new SessionTranscriptAssemblyError(
      "At least one source-bound transcript is required.",
      "TRANSCRIPT_SOURCE_INVALID",
    );
  }
  const normalized = input.map((source) => {
    const recordingAssetId = text(source.recordingAssetId);
    const transcriptJobId = text(source.transcriptJobId);
    const recordedStartedAtMilliseconds = dateMilliseconds(
      source.recordedStartedAt,
    );
    const declaredCaptureGroupId = text(source.captureGroupId) || null;
    const alignment = validAlignment(source.alignment);
    if (
      !recordingAssetId ||
      !transcriptJobId ||
      recordedStartedAtMilliseconds === null
    ) {
      throw new SessionTranscriptAssemblyError(
        "Every transcript source requires recording identity, transcript identity, and a valid start boundary.",
        "TRANSCRIPT_SOURCE_INVALID",
      );
    }
    if (
      declaredCaptureGroupId &&
      alignment &&
      alignment.captureGroupId !== declaredCaptureGroupId
    ) {
      throw new SessionTranscriptAssemblyError(
        "A transcript source's declared take does not match its capture-clock evidence.",
        "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
      );
    }
    return {
      recordingAssetId,
      transcriptJobId,
      captureGroupId:
        declaredCaptureGroupId ?? alignment?.captureGroupId ?? null,
      recordedStartedAtMilliseconds,
      alignment,
    };
  });
  if (
    new Set(normalized.map((source) => source.recordingAssetId)).size !==
      normalized.length ||
    new Set(normalized.map((source) => source.transcriptJobId)).size !==
      normalized.length
  ) {
    throw new SessionTranscriptAssemblyError(
      "Transcript assembly cannot reuse a recording or transcript identity.",
      "TRANSCRIPT_SOURCE_INVALID",
    );
  }

  const declaredGroups = [
    ...new Set(
      normalized
        .map((source) => source.captureGroupId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (declaredGroups.length > 1) {
    throw new SessionTranscriptAssemblyError(
      "Participant transcripts belong to different capture takes.",
      "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
    );
  }

  const singleSource = normalized.length === 1;
  const reviewedClock = singleSource
    ? null
    : reviewedProgramClock(normalized, options.reviewedPlacements ?? []);
  const completeClockEvidence =
    !singleSource &&
    normalized.every((source) => source.alignment !== null) &&
    new Set(normalized.map((source) => source.alignment!.captureGroupId))
      .size === 1;
  const authority: SessionTranscriptTimingAuthority = singleSource
    ? "single-source-origin"
    : reviewedClock
      ? reviewedClock.componentCount === 1
        ? "reviewed-waveform-placement"
        : "mixed-waveform-clock-placement"
      : completeClockEvidence
        ? "capture-clock-proposal"
        : "reported-wall-clock-fallback";
  const starts =
    reviewedClock?.startsMilliseconds ??
    normalized.map((source) =>
      authority === "capture-clock-proposal"
        ? source.alignment!.startedAtMilliseconds
        : source.recordedStartedAtMilliseconds,
    );
  const baselineMilliseconds = Math.min(...starts);
  const baselineIndex = starts.findIndex(
    (value) => value === baselineMilliseconds,
  );
  const captureGroupId =
    reviewedClock?.captureGroupId ??
    (completeClockEvidence
      ? normalized[0].alignment!.captureGroupId
      : (declaredGroups[0] ?? null));

  return {
    schema: SESSION_TRANSCRIPT_PROGRAM_CLOCK_SCHEMA,
    authority,
    captureGroupId,
    baselineRecordingAssetId: normalized[baselineIndex]!.recordingAssetId,
    baselineStartedAt: new Date(baselineMilliseconds).toISOString(),
    sources: normalized.map((source, index) => ({
      recordingAssetId: source.recordingAssetId,
      transcriptJobId: source.transcriptJobId,
      captureGroupId: source.captureGroupId,
      programOffsetSeconds: rounded(
        (starts[index]! - baselineMilliseconds) / 1_000,
      ),
      estimatedProgramStartedAt: new Date(starts[index]!).toISOString(),
      timingAuthority: authority,
      timingUncertaintyMilliseconds:
        authority === "capture-clock-proposal"
          ? source.alignment!.uncertaintyMilliseconds
          : null,
      timingReviewRequired:
        !singleSource && authority !== "reviewed-waveform-placement",
      sampleAccurateClaimed: false,
    })),
    waveformReviewRequired:
      !singleSource && authority !== "reviewed-waveform-placement",
    sampleAccurateClaimed: false,
    reason: singleSource
      ? "One transcript source defines its own zero point; no cross-device alignment is implied."
      : reviewedClock
        ? reviewedClock.componentCount === 1
          ? "Measured audio places these tracks together. Originals and transcript source times stay unchanged. Drift correction has not been applied."
          : "Measured audio keeps matched tracks together; device clocks or recording start times place the remaining groups. You can keep editing while sync is refined. Originals stay unchanged; drift correction has not been applied."
        : completeClockEvidence
          ? "Validated monotonic/server clock proposals place sources on a provisional Session clock. Waveform correlation and drift review remain required before sample-accurate editing."
          : "Complete capture-clock evidence is unavailable. Reported source start times provide a visible fallback estimate; waveform correlation and drift review remain required.",
  };
}

function reviewedProgramClock(
  sources: Array<{
    recordingAssetId: string;
    captureGroupId: string | null;
    recordedStartedAtMilliseconds: number;
    alignment: ValidAlignment | null;
  }>,
  placements: SessionTranscriptReviewedPlacement[],
) {
  if (!placements.length) return null;
  const sourceIds = new Set(sources.map((source) => source.recordingAssetId));
  const declaredGroups = new Set(
    sources.map((source) => source.captureGroupId).filter(Boolean),
  );
  const placementGroups = new Set<string>();
  const adjacency = new Map<
    string,
    Array<{ id: string; deltaSeconds: number }>
  >();
  for (const source of sources) adjacency.set(source.recordingAssetId, []);
  for (const placement of placements) {
    const spineId = text(placement.spineRecordingAssetId);
    const targetId = text(placement.targetRecordingAssetId);
    const captureGroupId = text(placement.captureGroupId);
    const offset = finite(placement.signedOffsetSeconds);
    if (
      !sourceIds.has(spineId) ||
      !sourceIds.has(targetId) ||
      spineId === targetId ||
      !captureGroupId ||
      offset === null ||
      finite(placement.residualDriftMilliseconds) === null ||
      placement.correctionApplied !== false ||
      placement.sourceBytesMutated !== false ||
      placement.sampleAccurateClaimed !== false
    ) {
      throw new SessionTranscriptAssemblyError(
        "A reviewed waveform placement is malformed or belongs to different Session sources.",
        "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT",
      );
    }
    placementGroups.add(captureGroupId);
    adjacency.get(spineId)!.push({ id: targetId, deltaSeconds: offset });
    adjacency.get(targetId)!.push({ id: spineId, deltaSeconds: -offset });
  }
  if (
    placementGroups.size !== 1 ||
    (declaredGroups.size > 0 &&
      [...placementGroups].some((group) => !declaredGroups.has(group)))
  ) {
    throw new SessionTranscriptAssemblyError(
      "Reviewed waveform placements do not belong to the current Session take.",
      "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT",
    );
  }

  // Prefer a server-calibrated anchor, then the earliest source and a stable
  // identity tie-breaker. Input/query order must not move a partial timeline.
  const start = (source: (typeof sources)[number]) =>
    source.alignment?.startedAtMilliseconds ?? source.recordedStartedAtMilliseconds;
  const anchors = [...sources].sort((left, right) =>
    Number(!left.alignment) - Number(!right.alignment) ||
    start(left) - start(right) || left.recordingAssetId.localeCompare(right.recordingAssetId),
  );
  const startsById = new Map<string, number>();
  let componentCount = 0;
  for (const anchor of anchors) {
    if (startsById.has(anchor.recordingAssetId)) continue;
    componentCount += 1;
    const relativeSeconds = new Map([[anchor.recordingAssetId, 0]]);
    const queue = [anchor.recordingAssetId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentId = queue[cursor]!;
      const currentOffset = relativeSeconds.get(currentId)!;
      for (const edge of adjacency.get(currentId) ?? []) {
        const proposed = rounded(currentOffset + edge.deltaSeconds);
        const existing = relativeSeconds.get(edge.id);
        if (existing !== undefined && Math.abs(existing - proposed) > 0.001) {
          throw new SessionTranscriptAssemblyError(
            "Reviewed waveform placements conflict by more than one millisecond.",
            "TRANSCRIPT_REVIEWED_PLACEMENT_CONFLICT",
          );
        }
        if (existing === undefined) {
          relativeSeconds.set(edge.id, proposed);
          queue.push(edge.id);
        }
      }
    }
    for (const [id, relative] of relativeSeconds) {
      startsById.set(id, rounded(start(anchor) + relative * 1_000));
    }
  }
  return {
    captureGroupId: [...placementGroups][0]!,
    componentCount,
    startsMilliseconds: sources.map(source => startsById.get(source.recordingAssetId)!),
  };
}

function validAlignment(value: unknown): ValidAlignment | null {
  const row = object(value);
  const reviewGate = object(row.reviewGate);
  const captureGroupId = text(row.captureGroupId);
  const estimatedServerStartedAt = text(row.estimatedServerStartedAt);
  const startedAtMilliseconds = dateMilliseconds(estimatedServerStartedAt);
  const uncertaintyMilliseconds = finiteNonnegative(
    row.uncertaintyMilliseconds,
  );
  if (
    row.schema !== "quipsly-capture-alignment-proposal-v1" ||
    row.status !== "proposal-ready" ||
    !captureGroupId ||
    startedAtMilliseconds === null ||
    uncertaintyMilliseconds === null ||
    row.sampleAccurateClaimed !== false ||
    row.reviewRequired !== true ||
    reviewGate.waveformCorrelationRequired !== true ||
    reviewGate.driftReviewRequired !== true ||
    reviewGate.humanApprovalRequired !== true
  )
    return null;
  return {
    captureGroupId,
    estimatedServerStartedAt,
    startedAtMilliseconds,
    uncertaintyMilliseconds,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateMilliseconds(value: unknown) {
  const parsed =
    value instanceof Date ? value.getTime() : Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteNonnegative(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finite(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
