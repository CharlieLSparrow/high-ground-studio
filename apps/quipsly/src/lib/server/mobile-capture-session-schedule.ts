import "server-only";

const MAX_SESSION_SCHEDULE_EVENTS = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MobileSessionScheduleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "MobileSessionScheduleError";
    this.status = status;
    this.code = code;
  }
}

export type MobileSessionScheduleInput = {
  roomId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  expectedUpdatedAt: Date;
  clientRequestId: string;
  reason: string;
};

export type MobileSessionScheduleEvent = {
  schema: "quipsly-session-schedule-event-v1";
  clientRequestId: string;
  actorUserId: string;
  surface: "quipsly-nest-session-list";
  reason: string;
  previousScheduledStart: string | null;
  previousScheduledEnd: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  externalCalendarMutated: false;
  invitationSent: false;
  recordingStarted: false;
  createdAt: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requiredDate(value: unknown, label: string) {
  const raw = cleanText(value, 80);
  const parsed = raw ? new Date(raw) : new Date(Number.NaN);
  if (!raw || Number.isNaN(parsed.getTime())) {
    throw new MobileSessionScheduleError(
      `${label} must be a valid date and time.`,
      400,
      "QUIPSLY_SESSION_SCHEDULE_INVALID_TIME",
    );
  }
  return parsed;
}

export function isSupportedSessionTimezone(value: unknown) {
  const timezone = cleanText(value, 120);
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function parseMobileSessionScheduleInput(
  value: unknown,
  now = new Date(),
): MobileSessionScheduleInput {
  const body = objectValue(value);
  const roomId = cleanText(body.callRoomId || body.roomId, 160);
  const clientRequestId = cleanText(body.clientRequestId, 80);
  const timezone = cleanText(body.timezone, 120);
  const scheduledStart = requiredDate(body.scheduledStart, "Session start");
  const scheduledEnd = requiredDate(body.scheduledEnd, "Session end");
  const expectedUpdatedAt = requiredDate(
    body.expectedUpdatedAt,
    "Expected Session revision",
  );

  if (!roomId) {
    throw new MobileSessionScheduleError(
      "A Session ID is required before scheduling.",
      400,
      "QUIPSLY_SESSION_ID_REQUIRED",
    );
  }
  if (!UUID_PATTERN.test(clientRequestId)) {
    throw new MobileSessionScheduleError(
      "A stable UUID request identity is required before scheduling.",
      400,
      "QUIPSLY_SESSION_SCHEDULE_REQUEST_ID_REQUIRED",
    );
  }
  if (!isSupportedSessionTimezone(timezone)) {
    throw new MobileSessionScheduleError(
      "Choose a valid IANA timezone before scheduling.",
      400,
      "QUIPSLY_SESSION_SCHEDULE_TIMEZONE_INVALID",
    );
  }
  const durationMs = scheduledEnd.getTime() - scheduledStart.getTime();
  if (durationMs < 5 * 60_000 || durationMs > 24 * 60 * 60_000) {
    throw new MobileSessionScheduleError(
      "A Session must last between 5 minutes and 24 hours.",
      400,
      "QUIPSLY_SESSION_SCHEDULE_DURATION_INVALID",
    );
  }
  const fiveYearsMs = 5 * 365 * 24 * 60 * 60_000;
  if (Math.abs(scheduledStart.getTime() - now.getTime()) > fiveYearsMs) {
    throw new MobileSessionScheduleError(
      "The Session time must be within five years of today.",
      400,
      "QUIPSLY_SESSION_SCHEDULE_TIME_OUT_OF_RANGE",
    );
  }

  return {
    roomId,
    scheduledStart,
    scheduledEnd,
    timezone,
    expectedUpdatedAt,
    clientRequestId,
    reason:
      cleanText(body.reason, 500)
      || "Scheduled from the Quipsly Session workspace.",
  };
}

export function readMobileSessionScheduleEvents(
  metadataJson: unknown,
): MobileSessionScheduleEvent[] {
  const metadata = objectValue(metadataJson);
  const rawEvents = Array.isArray(metadata.scheduleEvents)
    ? metadata.scheduleEvents
    : [];
  return rawEvents.filter((event): event is MobileSessionScheduleEvent => {
    const record = objectValue(event);
    return record.schema === "quipsly-session-schedule-event-v1"
      && typeof record.clientRequestId === "string"
      && typeof record.scheduledStart === "string"
      && typeof record.scheduledEnd === "string"
      && typeof record.timezone === "string";
  });
}

export function matchingMobileSessionScheduleReplay({
  metadataJson,
  input,
}: {
  metadataJson: unknown;
  input: MobileSessionScheduleInput;
}) {
  const event = readMobileSessionScheduleEvents(metadataJson)
    .find((candidate) => candidate.clientRequestId === input.clientRequestId);
  if (!event) return null;
  const exactIntent =
    event.scheduledStart === input.scheduledStart.toISOString()
    && event.scheduledEnd === input.scheduledEnd.toISOString()
    && event.timezone === input.timezone;
  if (!exactIntent) {
    throw new MobileSessionScheduleError(
      "That scheduling request identity is already bound to different Session times.",
      409,
      "QUIPSLY_SESSION_SCHEDULE_IDENTITY_CONFLICT",
    );
  }
  return event;
}

export function appendMobileSessionScheduleEvent({
  metadataJson,
  event,
}: {
  metadataJson: unknown;
  event: MobileSessionScheduleEvent;
}) {
  const metadata = objectValue(metadataJson);
  const existing = Array.isArray(metadata.scheduleEvents)
    ? metadata.scheduleEvents
    : [];
  return {
    ...metadata,
    scheduledTimezone: event.timezone,
    scheduleEvents: [...existing, event].slice(-MAX_SESSION_SCHEDULE_EVENTS),
  };
}

export function mobileSessionScheduledTimezone(
  metadataJson: unknown,
  bookingTimezone?: unknown,
) {
  const metadata = objectValue(metadataJson);
  const direct = cleanText(metadata.scheduledTimezone, 120);
  if (isSupportedSessionTimezone(direct)) return direct;
  const booking = cleanText(bookingTimezone, 120);
  return isSupportedSessionTimezone(booking) ? booking : null;
}
