export const MOBILE_CAPTURE_INTERRUPTION_REPAIR_CONTRACT =
  "quipsly-interruption-repair-state-v1" as const;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sourceProfile(value: unknown) {
  if (typeof value !== "string") return record(value);
  if (!value.trim()) return {};
  try {
    return record(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * A recovered browser recorder has exact durable bytes, but an abrupt process
 * exit can leave the final WebM cluster/container metadata incomplete. That is
 * a media-processing concern, not a source-integrity failure: preserve the
 * original and repair a derivative before promotion to Studio.
 */
export function mobileCaptureInterruptionRepairRequired(value: unknown) {
  const profile = sourceProfile(value);
  const recovery = record(profile.interruptionRecovery);
  return recovery.mediaTailMayBeIncomplete === true;
}

