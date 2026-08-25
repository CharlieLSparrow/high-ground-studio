import { Temporal } from "@js-temporal/polyfill";

export type CoachingBookableWindow = {
  timezone: string;
  dayOfWeek: number | null;
  startMinute: number | null;
  endMinute: number | null;
  kind: string;
};

export type CoachingBusyInterval = {
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
};

export type CoachingBookableSlot = {
  instant: string;
  localValue: string;
  timezone: string;
  label: string;
};

export type CoachingSlotIssue = "invalid" | "conflict" | "outside-working-hours" | null;

const INACTIVE_STATUSES = new Set(["CANCELED", "COMPLETED", "NO_SHOW"]);

function schemaDayOfWeek(date: Temporal.PlainDate) {
  return date.dayOfWeek === 7 ? 0 : date.dayOfWeek;
}

function localInputValue(dateTime: Temporal.PlainDateTime) {
  return `${dateTime.toPlainDate().toString()}T${String(dateTime.hour).padStart(2, "0")}:${String(dateTime.minute).padStart(2, "0")}`;
}

export function coachingSlotIssue(input: {
  localValue: string;
  timezone: string;
  durationMinutes: number;
  windows: CoachingBookableWindow[];
  bookings: CoachingBusyInterval[];
}): CoachingSlotIssue {
  let start: Temporal.ZonedDateTime;
  try {
    start = Temporal.PlainDateTime.from(input.localValue).toZonedDateTime(
      input.timezone,
      { disambiguation: "reject" },
    );
  } catch {
    return "invalid";
  }
  const startMs = start.epochMilliseconds;
  const endMs = startMs + Math.max(15, input.durationMinutes) * 60_000;
  const conflicts = input.bookings.some((booking) => {
    if (INACTIVE_STATUSES.has(booking.status.toUpperCase())) return false;
    const busyStart = new Date(booking.scheduledStart).getTime();
    const busyEnd = new Date(booking.scheduledEnd).getTime();
    return Number.isFinite(busyStart) && Number.isFinite(busyEnd) && startMs < busyEnd && endMs > busyStart;
  });
  if (conflicts) return "conflict";

  const recurring = input.windows.filter(
    (window) =>
      window.kind === "recurring" &&
      window.dayOfWeek !== null &&
      window.startMinute !== null &&
      window.endMinute !== null,
  );
  if (!recurring.length) return null;
  const inside = recurring.some((window) => {
    try {
      const localStart = start.toInstant().toZonedDateTimeISO(window.timezone);
      const localEnd = Temporal.Instant.fromEpochMilliseconds(endMs).toZonedDateTimeISO(window.timezone);
      return (
        schemaDayOfWeek(localStart.toPlainDate()) === window.dayOfWeek &&
        localStart.toPlainDate().equals(localEnd.toPlainDate()) &&
        localStart.hour * 60 + localStart.minute >= (window.startMinute as number) &&
        localEnd.hour * 60 + localEnd.minute <= (window.endMinute as number)
      );
    } catch {
      return false;
    }
  });
  return inside ? null : "outside-working-hours";
}

export function deriveCoachingBookableSlots(input: {
  windows: CoachingBookableWindow[];
  bookings: CoachingBusyInterval[];
  durationMinutes: number;
  now?: Date;
  horizonDays?: number;
  maxSlots?: number;
  minimumLeadMinutes?: number;
}): CoachingBookableSlot[] {
  const durationMinutes = Math.max(15, Math.round(input.durationMinutes));
  const now = input.now || new Date();
  const earliest = now.getTime() + (input.minimumLeadMinutes ?? 30) * 60_000;
  const horizonDays = Math.min(31, Math.max(1, input.horizonDays ?? 14));
  const maxSlots = Math.min(24, Math.max(1, input.maxSlots ?? 6));
  const busy = input.bookings
    .filter((booking) => !INACTIVE_STATUSES.has(booking.status.toUpperCase()))
    .map((booking) => ({
      start: new Date(booking.scheduledStart).getTime(),
      end: new Date(booking.scheduledEnd).getTime(),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end));
  const slots = new Map<string, CoachingBookableSlot>();

  for (const window of input.windows) {
    if (
      window.kind !== "recurring" ||
      window.dayOfWeek === null ||
      window.startMinute === null ||
      window.endMinute === null
    ) continue;
    let today: Temporal.PlainDate;
    try {
      today = Temporal.Instant.from(now.toISOString())
        .toZonedDateTimeISO(window.timezone)
        .toPlainDate();
    } catch {
      continue;
    }

    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = today.add({ days: offset });
      if (schemaDayOfWeek(date) !== window.dayOfWeek) continue;
      for (
        let minute = window.startMinute;
        minute + durationMinutes <= window.endMinute;
        minute += 30
      ) {
        try {
          const plain = date.toPlainDateTime({
            hour: Math.floor(minute / 60),
            minute: minute % 60,
          });
          const zoned = plain.toZonedDateTime(window.timezone, {
            disambiguation: "reject",
          });
          const start = zoned.epochMilliseconds;
          const end = start + durationMinutes * 60_000;
          if (start < earliest) continue;
          if (busy.some((interval) => start < interval.end && end > interval.start)) continue;
          const instant = zoned.toInstant().toString();
          slots.set(instant, {
            instant,
            localValue: localInputValue(plain),
            timezone: window.timezone,
            label: new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: window.timezone,
              timeZoneName: "short",
            }).format(new Date(start)),
          });
        } catch {
          // A DST fold/gap or invalid timezone is not a bookable choice.
        }
      }
    }
  }

  return [...slots.values()]
    .sort((left, right) => left.instant.localeCompare(right.instant))
    .slice(0, maxSlots);
}
