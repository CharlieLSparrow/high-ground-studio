import {
  initialOccurrencePlan,
  isIanaTimeZone,
  nextCompletionOccurrence,
  nextRecurrenceLocalDate,
  occurrenceForLocalDate,
  parseRecurrenceStart,
  recurrenceLabel,
  type TaskRecurrenceRule,
} from "./task-recurrence";

const dailyDenver: TaskRecurrenceRule = {
  cadence: "FIXED",
  frequency: "DAILY",
  interval: 1,
  timezone: "America/Denver",
  localTimeMinutes: 9 * 60,
  anchorLocalDate: "2026-03-07",
  anchorDayOfMonth: 7,
};

describe("task recurrence wall-clock contract", () => {
  it("keeps the same Denver wall time across spring DST while exact instants are 23 hours apart", () => {
    const [before, after] = initialOccurrencePlan(dailyDenver, 2);
    expect(before.requestedLocalDateTime).toBe("2026-03-07T09:00");
    expect(after.requestedLocalDateTime).toBe("2026-03-08T09:00");
    expect(after.scheduledFor.getTime() - before.scheduledFor.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("keeps the same Denver wall time across fall DST while exact instants are 25 hours apart", () => {
    const rule = { ...dailyDenver, anchorLocalDate: "2026-10-31", anchorDayOfMonth: 31 };
    const [before, after] = initialOccurrencePlan(rule, 2);
    expect(after.scheduledFor.getTime() - before.scheduledFor.getTime()).toBe(25 * 60 * 60 * 1000);
    expect(after.requestedLocalDateTime).toBe("2026-11-01T09:00");
  });

  it("records the compatible shift when a requested wall time does not exist", () => {
    const result = parseRecurrenceStart("2026-03-08T02:30", "America/Denver");
    expect(result).toMatchObject({
      anchorLocalDate: "2026-03-08",
      localTimeMinutes: 150,
      requestedLocalDateTime: "2026-03-08T02:30",
      resolvedLocalDateTime: "2026-03-08T03:30",
      dstResolution: "shifted",
    });
  });

  it("uses the anchor day for month-end recurrence instead of drifting after February", () => {
    const monthly = { ...dailyDenver, frequency: "MONTHLY" as const, anchorLocalDate: "2027-01-31", anchorDayOfMonth: 31 };
    const february = nextRecurrenceLocalDate(monthly.anchorLocalDate, monthly);
    expect(february).toBe("2027-02-28");
    expect(nextRecurrenceLocalDate(february, monthly)).toBe("2027-03-31");
  });

  it("schedules completion cadence from the completion's local calendar date", () => {
    const weekly = { ...dailyDenver, cadence: "COMPLETION" as const, frequency: "WEEKLY" as const };
    const next = nextCompletionOccurrence(new Date("2026-03-08T23:30:00.000Z"), weekly);
    expect(next.requestedLocalDateTime).toBe("2026-03-15T09:00");
  });

  it("uses stable occurrence keys and rejects invalid zones", () => {
    expect(occurrenceForLocalDate("2026-03-07", dailyDenver).occurrenceKey).toBe("2026-03-07T09:00[America/Denver]");
    expect(isIanaTimeZone("America/Denver")).toBe(true);
    expect(isIanaTimeZone("Mountain-ish" as string)).toBe(false);
    expect(recurrenceLabel(dailyDenver)).toBe("Every day at 09:00 (America/Denver), on schedule");
  });
});
