import { Temporal } from "@js-temporal/polyfill";

export type CoachingBookingSeriesFrequency = "WEEKLY" | "MONTHLY";

export type CoachingBookingSeriesIntent = {
  frequency: CoachingBookingSeriesFrequency;
  intervalCount: number;
  occurrenceCount: number;
};

export class CoachingBookingSeriesInputError extends Error {
  readonly code = "COACHING_SERIES_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "CoachingBookingSeriesInputError";
  }
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

export function normalizeCoachingBookingSeriesIntent(
  input: Record<string, unknown>,
): CoachingBookingSeriesIntent {
  const frequency = String(input.frequency || "").trim().toUpperCase();
  if (!(["WEEKLY", "MONTHLY"] as const).includes(frequency as CoachingBookingSeriesFrequency)) {
    throw new CoachingBookingSeriesInputError(
      "Choose weekly, every two weeks, or monthly for this Session series.",
    );
  }

  const intervalCount = integer(input.intervalCount);
  const occurrenceCount = integer(input.occurrenceCount);
  if (!intervalCount || intervalCount < 1 || intervalCount > 12) {
    throw new CoachingBookingSeriesInputError(
      "A Session series interval must be between 1 and 12.",
    );
  }
  if (!occurrenceCount || occurrenceCount < 2 || occurrenceCount > 24) {
    throw new CoachingBookingSeriesInputError(
      "Choose between 2 and 24 Sessions for this series.",
    );
  }

  return {
    frequency: frequency as CoachingBookingSeriesFrequency,
    intervalCount,
    occurrenceCount,
  };
}

export function buildCoachingBookingSeriesStarts(input: {
  firstScheduledStart: Date;
  timezone: string;
  intent: CoachingBookingSeriesIntent;
}) {
  if (!Number.isFinite(input.firstScheduledStart.getTime())) {
    throw new CoachingBookingSeriesInputError(
      "Choose a valid first Session time before creating a series.",
    );
  }

  let first: Temporal.ZonedDateTime;
  try {
    first = Temporal.Instant.from(input.firstScheduledStart.toISOString())
      .toZonedDateTimeISO(input.timezone);
  } catch {
    throw new CoachingBookingSeriesInputError(
      "Choose a valid IANA timezone before creating a Session series.",
    );
  }

  return Array.from({ length: input.intent.occurrenceCount }, (_, index) => {
    const start = input.intent.frequency === "MONTHLY"
      ? first.add({ months: index * input.intent.intervalCount })
      : first.add({ weeks: index * input.intent.intervalCount });
    return new Date(start.toInstant().epochMilliseconds);
  });
}

export function coachingBookingSeriesLabel(intent: CoachingBookingSeriesIntent) {
  if (intent.frequency === "MONTHLY") {
    return intent.intervalCount === 1
      ? "Monthly"
      : `Every ${intent.intervalCount} months`;
  }
  return intent.intervalCount === 1
    ? "Weekly"
    : intent.intervalCount === 2
      ? "Every two weeks"
      : `Every ${intent.intervalCount} weeks`;
}
