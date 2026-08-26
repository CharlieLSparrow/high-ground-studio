export const AUDIO_ALIGNMENT_WINDOW_FIT_POLICY =
  "fit-to-exact-decoded-overlap-v1" as const;

export type AudioAlignmentWindowFit = {
  policy: typeof AUDIO_ALIGNMENT_WINDOW_FIT_POLICY;
  spineDecodedDurationSeconds: number;
  targetDecodedDurationSeconds: number;
  initialOffsetSeconds: number;
  requestedOpeningTargetSeconds: number;
  requestedLaterTargetSeconds: number;
  analyzedOpeningTargetSeconds: number;
  analyzedLaterTargetSeconds: number;
  windowSeconds: number;
  adjustedToDecodedDuration: boolean;
};

export type FittedAudioAlignmentWindows = {
  openingTargetSeconds: number;
  laterTargetSeconds: number;
  windowSeconds: number;
  adjustedToDecodedDuration: boolean;
};

/**
 * Reconciles provisional capture-clock windows with the immutable bytes the
 * worker actually decoded. Browser MediaRecorder containers can omit or
 * overstate duration until decoded, so the exact media clock is authoritative.
 */
export function fitAudioAlignmentWindows(input: {
  spineDurationSeconds: number;
  targetDurationSeconds: number;
  initialOffsetSeconds: number;
  requestedOpeningTargetSeconds: number;
  requestedLaterTargetSeconds: number;
  windowSeconds: number;
}): FittedAudioAlignmentWindows {
  const spineDuration = bounded(
    input.spineDurationSeconds,
    0.001,
    86_400,
    "spineDurationSeconds",
  );
  const targetDuration = bounded(
    input.targetDurationSeconds,
    0.001,
    86_400,
    "targetDurationSeconds",
  );
  const initialOffsetSeconds = finite(
    input.initialOffsetSeconds,
    "initialOffsetSeconds",
  );
  const requestedOpening = nonNegative(
    input.requestedOpeningTargetSeconds,
    "requestedOpeningTargetSeconds",
  );
  const requestedLater = nonNegative(
    input.requestedLaterTargetSeconds,
    "requestedLaterTargetSeconds",
  );
  const windowSeconds = bounded(input.windowSeconds, 1, 30, "windowSeconds");
  if (requestedLater <= requestedOpening) {
    throw new Error("The later alignment point must follow the opening point.");
  }

  const overlapStart = Math.max(0, -initialOffsetSeconds);
  const overlapEnd = Math.min(
    targetDuration,
    spineDuration - initialOffsetSeconds,
  );
  const latestStart = overlapEnd - windowSeconds - 0.002;
  const minimumSeparation = Math.max(2, windowSeconds / 2);
  if (latestStart - overlapStart < minimumSeparation) {
    throw new Error(
      "The exact decoded sources do not share enough duration for two separated alignment windows.",
    );
  }

  const openingTargetSeconds = rounded(
    clamp(
      requestedOpening,
      overlapStart,
      latestStart - minimumSeparation,
    ),
  );
  const laterTargetSeconds = rounded(
    clamp(
      requestedLater,
      openingTargetSeconds + minimumSeparation,
      latestStart,
    ),
  );
  return {
    openingTargetSeconds,
    laterTargetSeconds,
    windowSeconds,
    adjustedToDecodedDuration:
      Math.abs(openingTargetSeconds - requestedOpening) > 0.000001 ||
      Math.abs(laterTargetSeconds - requestedLater) > 0.000001,
  };
}

function finite(value: unknown, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite.`);
  return parsed;
}

function nonNegative(value: unknown, label: string) {
  const parsed = finite(value, label);
  if (parsed < 0) throw new Error(`${label} must be non-negative.`);
  return parsed;
}

function bounded(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = finite(value, label);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${label} is outside its safe bounds.`);
  }
  return parsed;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, places = 6) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
