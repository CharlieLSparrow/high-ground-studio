import {
  coachingSlotIssue,
  deriveCoachingBookableSlots,
} from "./coaching-bookable-slots";

const wednesday = {
  timezone: "America/Denver",
  dayOfWeek: 3,
  startMinute: 9 * 60,
  endMinute: 12 * 60,
  kind: "recurring",
};

describe("coaching bookable slots", () => {
  it("projects recurring working hours into chronological choices", () => {
    const slots = deriveCoachingBookableSlots({
      windows: [wednesday],
      bookings: [],
      durationMinutes: 60,
      now: new Date("2026-08-25T12:00:00.000Z"),
      horizonDays: 2,
    });
    expect(slots.map((slot) => slot.instant)).toEqual([
      "2026-08-26T15:00:00Z",
      "2026-08-26T15:30:00Z",
      "2026-08-26T16:00:00Z",
      "2026-08-26T16:30:00Z",
      "2026-08-26T17:00:00Z",
    ]);
    expect(slots[0]).toMatchObject({
      localValue: "2026-08-26T09:00",
      timezone: "America/Denver",
    });
  });

  it("removes choices that overlap canonical Sessions", () => {
    const slots = deriveCoachingBookableSlots({
      windows: [wednesday],
      bookings: [{
        scheduledStart: "2026-08-26T16:00:00.000Z",
        scheduledEnd: "2026-08-26T17:00:00.000Z",
        status: "CONFIRMED",
      }],
      durationMinutes: 60,
      now: new Date("2026-08-25T12:00:00.000Z"),
      horizonDays: 2,
    });
    expect(slots.map((slot) => slot.instant)).toEqual([
      "2026-08-26T15:00:00Z",
      "2026-08-26T17:00:00Z",
    ]);
  });

  it("ignores canceled bookings and invalid availability", () => {
    const slots = deriveCoachingBookableSlots({
      windows: [wednesday, { ...wednesday, timezone: "Mars/Olympus" }],
      bookings: [{
        scheduledStart: "2026-08-26T15:00:00.000Z",
        scheduledEnd: "2026-08-26T16:00:00.000Z",
        status: "CANCELED",
      }],
      durationMinutes: 90,
      now: new Date("2026-08-25T12:00:00.000Z"),
      maxSlots: 2,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].instant).toBe("2026-08-26T15:00:00Z");
  });

  it("explains typed conflicts and outside-hours choices before save", () => {
    const booking = {
      scheduledStart: "2026-08-26T16:00:00.000Z",
      scheduledEnd: "2026-08-26T17:00:00.000Z",
      status: "CONFIRMED",
    };
    expect(coachingSlotIssue({
      localValue: "2026-08-26T10:30",
      timezone: "America/Denver",
      durationMinutes: 30,
      windows: [wednesday],
      bookings: [booking],
    })).toBe("conflict");
    expect(coachingSlotIssue({
      localValue: "2026-08-26T18:00",
      timezone: "America/Denver",
      durationMinutes: 60,
      windows: [wednesday],
      bookings: [],
    })).toBe("outside-working-hours");
    expect(coachingSlotIssue({
      localValue: "2026-08-26T09:00",
      timezone: "America/Denver",
      durationMinutes: 60,
      windows: [wednesday],
      bookings: [],
    })).toBeNull();
  });

  it("rejects ambiguous typed wall-clock times", () => {
    expect(coachingSlotIssue({
      localValue: "2026-11-01T01:30",
      timezone: "America/Denver",
      durationMinutes: 60,
      windows: [],
      bookings: [],
    })).toBe("invalid");
  });
});
