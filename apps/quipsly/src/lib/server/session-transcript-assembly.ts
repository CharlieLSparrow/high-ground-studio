export const SESSION_TRANSCRIPT_PROGRAM_CLOCK_SCHEMA =
  "quipsly-session-transcript-program-clock-v1" as const;

export type SessionTranscriptTimingAuthority =
  | "single-source-origin"
  | "capture-clock-proposal"
  | "reported-wall-clock-fallback";

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
    readonly code: "TRANSCRIPT_SOURCE_INVALID" | "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
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
 * clock. It never rewrites provider/source times and never promotes a clock
 * proposal into sample-accurate alignment. Waveform/drift review remains a
 * separate editor decision.
 */
export function assembleSessionTranscriptProgramClock(
  input: SessionTranscriptTimingSource[],
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
    const recordedStartedAtMilliseconds = dateMilliseconds(source.recordedStartedAt);
    const declaredCaptureGroupId = text(source.captureGroupId) || null;
    const alignment = validAlignment(source.alignment);
    if (!recordingAssetId || !transcriptJobId || recordedStartedAtMilliseconds === null) {
      throw new SessionTranscriptAssemblyError(
        "Every transcript source requires recording identity, transcript identity, and a valid start boundary.",
        "TRANSCRIPT_SOURCE_INVALID",
      );
    }
    if (
      declaredCaptureGroupId
      && alignment
      && alignment.captureGroupId !== declaredCaptureGroupId
    ) {
      throw new SessionTranscriptAssemblyError(
        "A transcript source's declared take does not match its capture-clock evidence.",
        "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
      );
    }
    return {
      recordingAssetId,
      transcriptJobId,
      captureGroupId: declaredCaptureGroupId ?? alignment?.captureGroupId ?? null,
      recordedStartedAtMilliseconds,
      alignment,
    };
  });
  if (
    new Set(normalized.map((source) => source.recordingAssetId)).size !== normalized.length
    || new Set(normalized.map((source) => source.transcriptJobId)).size !== normalized.length
  ) {
    throw new SessionTranscriptAssemblyError(
      "Transcript assembly cannot reuse a recording or transcript identity.",
      "TRANSCRIPT_SOURCE_INVALID",
    );
  }

  const declaredGroups = [...new Set(normalized
    .map((source) => source.captureGroupId)
    .filter((value): value is string => Boolean(value)))];
  if (declaredGroups.length > 1) {
    throw new SessionTranscriptAssemblyError(
      "Participant transcripts belong to different capture takes.",
      "TRANSCRIPT_SOURCE_TAKE_MISMATCH",
    );
  }

  const singleSource = normalized.length === 1;
  const completeClockEvidence = !singleSource
    && normalized.every((source) => source.alignment !== null)
    && new Set(normalized.map((source) => source.alignment!.captureGroupId)).size === 1;
  const authority: SessionTranscriptTimingAuthority = singleSource
    ? "single-source-origin"
    : completeClockEvidence
      ? "capture-clock-proposal"
      : "reported-wall-clock-fallback";
  const starts = normalized.map((source) => authority === "capture-clock-proposal"
    ? source.alignment!.startedAtMilliseconds
    : source.recordedStartedAtMilliseconds);
  const baselineMilliseconds = Math.min(...starts);
  const baselineIndex = starts.findIndex((value) => value === baselineMilliseconds);
  const captureGroupId = completeClockEvidence
    ? normalized[0].alignment!.captureGroupId
    : declaredGroups[0] ?? null;

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
      programOffsetSeconds: rounded((starts[index]! - baselineMilliseconds) / 1_000),
      estimatedProgramStartedAt: new Date(starts[index]!).toISOString(),
      timingAuthority: authority,
      timingUncertaintyMilliseconds: authority === "capture-clock-proposal"
        ? source.alignment!.uncertaintyMilliseconds
        : null,
      timingReviewRequired: !singleSource,
      sampleAccurateClaimed: false,
    })),
    waveformReviewRequired: !singleSource,
    sampleAccurateClaimed: false,
    reason: singleSource
      ? "One transcript source defines its own zero point; no cross-device alignment is implied."
      : completeClockEvidence
        ? "Validated monotonic/server clock proposals place sources on a provisional Session clock. Waveform correlation and drift review remain required before sample-accurate editing."
        : "Complete capture-clock evidence is unavailable. Reported source start times provide a visible fallback estimate; waveform correlation and drift review remain required.",
  };
}

function validAlignment(value: unknown): ValidAlignment | null {
  const row = object(value);
  const reviewGate = object(row.reviewGate);
  const captureGroupId = text(row.captureGroupId);
  const estimatedServerStartedAt = text(row.estimatedServerStartedAt);
  const startedAtMilliseconds = dateMilliseconds(estimatedServerStartedAt);
  const uncertaintyMilliseconds = finiteNonnegative(row.uncertaintyMilliseconds);
  if (
    row.schema !== "quipsly-capture-alignment-proposal-v1"
    || row.status !== "proposal-ready"
    || !captureGroupId
    || startedAtMilliseconds === null
    || uncertaintyMilliseconds === null
    || row.sampleAccurateClaimed !== false
    || row.reviewRequired !== true
    || reviewGate.waveformCorrelationRequired !== true
    || reviewGate.driftReviewRequired !== true
    || reviewGate.humanApprovalRequired !== true
  ) return null;
  return {
    captureGroupId,
    estimatedServerStartedAt,
    startedAtMilliseconds,
    uncertaintyMilliseconds,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateMilliseconds(value: unknown) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteNonnegative(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
