import {
  buildCoachingBookingSeriesStarts,
  coachingBookingSeriesLabel,
  normalizeCoachingBookingSeriesIntent,
} from "./coaching-booking-series";

describe("coaching booking series", () => {
  it("keeps the same local wall-clock time across daylight-saving changes", () => {
    const starts = buildCoachingBookingSeriesStarts({
      firstScheduledStart: new Date("2026-03-02T16:00:00.000Z"),
      timezone: "America/Denver",
      intent: { frequency: "WEEKLY", intervalCount: 1, occurrenceCount: 3 },
    });

    expect(starts.map((value) => value.toISOString())).toEqual([
      "2026-03-02T16:00:00.000Z",
      "2026-03-09T15:00:00.000Z",
      "2026-03-16T15:00:00.000Z",
    ]);
  });

  it("supports every-two-weeks and bounded finite series", () => {
    const intent = normalizeCoachingBookingSeriesIntent({
      frequency: "weekly",
      intervalCount: "2",
      occurrenceCount: "6",
    });
    expect(intent).toEqual({
      frequency: "WEEKLY",
      intervalCount: 2,
      occurrenceCount: 6,
    });
    expect(coachingBookingSeriesLabel(intent)).toBe("Every two weeks");
  });

  it("anchors monthly occurrences to the original calendar date", () => {
    const starts = buildCoachingBookingSeriesStarts({
      firstScheduledStart: new Date("2026-01-31T16:00:00.000Z"),
      timezone: "America/Denver",
      intent: { frequency: "MONTHLY", intervalCount: 1, occurrenceCount: 3 },
    });
    expect(starts.map((value) => value.toISOString())).toEqual([
      "2026-01-31T16:00:00.000Z",
      "2026-02-28T16:00:00.000Z",
      "2026-03-31T15:00:00.000Z",
    ]);
  });

  it.each([
    [{ frequency: "DAILY", intervalCount: 1, occurrenceCount: 4 }, /weekly/i],
    [{ frequency: "WEEKLY", intervalCount: 0, occurrenceCount: 4 }, /interval/i],
    [{ frequency: "WEEKLY", intervalCount: 1, occurrenceCount: 25 }, /2 and 24/i],
  ])("rejects unsafe intent %#", (input, message) => {
    expect(() => normalizeCoachingBookingSeriesIntent(input)).toThrow(message);
  });
});
