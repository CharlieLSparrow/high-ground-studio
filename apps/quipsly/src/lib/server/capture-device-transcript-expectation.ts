import "server-only";

export const CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA =
  "quipsly-capture-device-transcript-expectation-v1";

const MINIMUM_GRACE_SECONDS = 30 * 60;
const MAXIMUM_GRACE_SECONDS = 6 * 60 * 60;
const PROCESSING_OVERHEAD_SECONDS = 15 * 60;
const RECORDING_DURATION_MULTIPLIER = 2;

export type CaptureDeviceTranscriptExpectation = {
  schema: typeof CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA;
  expected: true;
  state: "awaiting-device";
  actorUserId: string;
  actorEmail: string;
  expectedAt: string;
  fallbackAfter: string;
  graceSeconds: number;
  recordingDurationSeconds: number | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function recordingDurationSeconds(startedAt?: string | null, stoppedAt?: string | null) {
  const started = validDate(startedAt);
  const stopped = validDate(stoppedAt);
  if (!started || !stopped) return null;
  const seconds = (stopped.getTime() - started.getTime()) / 1_000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function captureDeviceTranscriptGraceSeconds(durationSeconds: number | null) {
  if (durationSeconds === null) return MINIMUM_GRACE_SECONDS;
  return Math.min(
    MAXIMUM_GRACE_SECONDS,
    Math.max(
      MINIMUM_GRACE_SECONDS,
      Math.ceil(durationSeconds * RECORDING_DURATION_MULTIPLIER + PROCESSING_OVERHEAD_SECONDS),
    ),
  );
}

/**
 * Records a durable, time-bounded device-first transcription promise. Replays
 * preserve the original deadline so a retried upload cannot postpone fallback
 * forever. Longer recordings receive proportionally longer local-processing
 * time before Quipsly purchases cloud ASR.
 */
export function captureDeviceTranscriptExpectation(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  priorResultJson?: unknown;
  now?: Date;
}): CaptureDeviceTranscriptExpectation | null {
  const actorUserId = input.actorUserId?.trim();
  const actorEmail = input.actorEmail?.trim().toLowerCase();
  if (!actorUserId || !actorEmail) return null;

  const prior = objectValue(objectValue(input.priorResultJson).deviceTranscriptExpectation);
  const priorExpectedAt = validDate(prior.expectedAt);
  const priorFallbackAfter = validDate(prior.fallbackAfter);
  if (
    prior.schema === CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA
    && prior.expected === true
    && priorExpectedAt
    && priorFallbackAfter
  ) {
    return {
      schema: CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA,
      expected: true,
      state: "awaiting-device",
      actorUserId,
      actorEmail,
      expectedAt: priorExpectedAt.toISOString(),
      fallbackAfter: priorFallbackAfter.toISOString(),
      graceSeconds: typeof prior.graceSeconds === "number"
        ? prior.graceSeconds
        : Math.max(0, Math.round((priorFallbackAfter.getTime() - priorExpectedAt.getTime()) / 1_000)),
      recordingDurationSeconds: typeof prior.recordingDurationSeconds === "number"
        ? prior.recordingDurationSeconds
        : null,
    };
  }

  const now = input.now ?? new Date();
  const durationSeconds = recordingDurationSeconds(input.startedAt, input.stoppedAt);
  const graceSeconds = captureDeviceTranscriptGraceSeconds(durationSeconds);
  return {
    schema: CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA,
    expected: true,
    state: "awaiting-device",
    actorUserId,
    actorEmail,
    expectedAt: now.toISOString(),
    fallbackAfter: new Date(now.getTime() + graceSeconds * 1_000).toISOString(),
    graceSeconds,
    recordingDurationSeconds: durationSeconds,
  };
}

export function parseCaptureDeviceTranscriptExpectation(
  resultJson: unknown,
): CaptureDeviceTranscriptExpectation | null {
  const expectation = objectValue(objectValue(resultJson).deviceTranscriptExpectation);
  if (
    expectation.schema !== CAPTURE_DEVICE_TRANSCRIPT_EXPECTATION_SCHEMA
    || expectation.expected !== true
    || expectation.state !== "awaiting-device"
    || typeof expectation.actorUserId !== "string"
    || typeof expectation.actorEmail !== "string"
    || !validDate(expectation.expectedAt)
    || !validDate(expectation.fallbackAfter)
  ) {
    return null;
  }
  return expectation as CaptureDeviceTranscriptExpectation;
}
