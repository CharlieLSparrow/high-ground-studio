import "server-only";

import { Temporal } from "@js-temporal/polyfill";

const EXPLICIT_OFFSET = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Turns either an exact ISO instant or a browser datetime-local value into
 * canonical UTC. A wall-clock value is interpreted in the explicitly supplied
 * IANA timezone, never in the Cloud Run machine timezone. DST gaps and folds
 * are rejected so Quipsly cannot silently move a human's appointment.
 */
export function parseCoachingScheduleDate(
  value: unknown,
  timezone: string,
): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  try {
    if (EXPLICIT_OFFSET.test(raw)) {
      const exact = new Date(raw);
      return Number.isNaN(exact.getTime()) ? null : exact;
    }
    const instant = Temporal.PlainDateTime.from(raw)
      .toZonedDateTime(timezone, { disambiguation: "reject" })
      .toInstant();
    return new Date(instant.epochMilliseconds);
  } catch {
    return null;
  }
}
