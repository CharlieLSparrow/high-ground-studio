/** @jest-environment node */

import {
  MobileSessionScheduleError,
  appendMobileSessionScheduleEvent,
  matchingMobileSessionScheduleReplay,
  mobileSessionScheduledTimezone,
  parseMobileSessionScheduleInput,
} from "./mobile-capture-session-schedule";

const now = new Date("2026-07-29T22:00:00.000Z");
const requestId = "7fcd52f2-4502-4f1e-b34d-ae3ea7b7f166";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    callRoomId: "room-1",
    scheduledStart: "2026-07-29T22:30:00.000Z",
    scheduledEnd: "2026-07-29T23:20:00.000Z",
    timezone: "America/Denver",
    expectedUpdatedAt: "2026-07-29T21:00:00.000Z",
    clientRequestId: requestId,
    reason: "Physical TestFlight rehearsal.",
    ...overrides,
  };
}

describe("mobile Capture Session scheduling contract", () => {
  it("accepts one bounded canonical Session window with explicit revision and timezone", () => {
    const parsed = parseMobileSessionScheduleInput(validInput(), now);
    expect(parsed).toMatchObject({
      roomId: "room-1",
      timezone: "America/Denver",
      clientRequestId: requestId,
      reason: "Physical TestFlight rehearsal.",
    });
    expect(parsed.scheduledStart.toISOString()).toBe("2026-07-29T22:30:00.000Z");
    expect(parsed.scheduledEnd.toISOString()).toBe("2026-07-29T23:20:00.000Z");
  });

  it.each([
    [{ scheduledEnd: "2026-07-29T22:31:00.000Z" }, "QUIPSLY_SESSION_SCHEDULE_DURATION_INVALID"],
    [{ scheduledEnd: "2026-07-31T22:30:00.000Z" }, "QUIPSLY_SESSION_SCHEDULE_DURATION_INVALID"],
    [{ timezone: "Somewhere/Imaginary" }, "QUIPSLY_SESSION_SCHEDULE_TIMEZONE_INVALID"],
    [{ clientRequestId: "not-stable" }, "QUIPSLY_SESSION_SCHEDULE_REQUEST_ID_REQUIRED"],
    [{ scheduledStart: "not-a-date" }, "QUIPSLY_SESSION_SCHEDULE_INVALID_TIME"],
  ])("rejects malformed or unsafe intent %#", (override, code) => {
    expect(() => parseMobileSessionScheduleInput(validInput(override), now))
      .toThrow(expect.objectContaining<Partial<MobileSessionScheduleError>>({ code }));
  });

  it("records an idempotent no-side-effect event and rejects changed replay intent", () => {
    const input = parseMobileSessionScheduleInput(validInput(), now);
    const event = {
      schema: "quipsly-session-schedule-event-v1" as const,
      clientRequestId: input.clientRequestId,
      actorUserId: "user-1",
      surface: "quipsly-nest-session-list" as const,
      reason: input.reason,
      previousScheduledStart: null,
      previousScheduledEnd: null,
      scheduledStart: input.scheduledStart.toISOString(),
      scheduledEnd: input.scheduledEnd.toISOString(),
      timezone: input.timezone,
      externalCalendarMutated: false as const,
      invitationSent: false as const,
      recordingStarted: false as const,
      createdAt: now.toISOString(),
    };
    const metadata = appendMobileSessionScheduleEvent({
      metadataJson: { source: "ios-capture" },
      event,
    });

    expect(matchingMobileSessionScheduleReplay({ metadataJson: metadata, input }))
      .toEqual(event);
    expect(mobileSessionScheduledTimezone(metadata)).toBe("America/Denver");
    expect(metadata).toMatchObject({
      source: "ios-capture",
      scheduledTimezone: "America/Denver",
      scheduleEvents: [{
        externalCalendarMutated: false,
        invitationSent: false,
        recordingStarted: false,
      }],
    });

    const changed = parseMobileSessionScheduleInput(
      validInput({ scheduledEnd: "2026-07-29T23:30:00.000Z" }),
      now,
    );
    expect(() => matchingMobileSessionScheduleReplay({
      metadataJson: metadata,
      input: changed,
    })).toThrow(expect.objectContaining<Partial<MobileSessionScheduleError>>({
      code: "QUIPSLY_SESSION_SCHEDULE_IDENTITY_CONFLICT",
    }));
  });
});
