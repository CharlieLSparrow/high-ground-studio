import { parseCoachingScheduleDate } from "./coaching-schedule-time";

describe("coaching schedule time", () => {
  it("preserves exact instants without applying the supplied timezone twice", () => {
    expect(
      parseCoachingScheduleDate(
        "2026-08-26T16:00:00.000Z",
        "America/Denver",
      )?.toISOString(),
    ).toBe("2026-08-26T16:00:00.000Z");
  });

  it("interprets browser wall-clock values in the coach timezone", () => {
    expect(
      parseCoachingScheduleDate("2026-08-26T10:00", "America/Denver")?.toISOString(),
    ).toBe("2026-08-26T16:00:00.000Z");
  });

  it("honors daylight-saving offsets for the chosen date", () => {
    expect(
      parseCoachingScheduleDate("2026-01-14T10:00", "America/Denver")?.toISOString(),
    ).toBe("2026-01-14T17:00:00.000Z");
  });

  it("rejects nonexistent and ambiguous daylight-saving wall times", () => {
    expect(
      parseCoachingScheduleDate("2026-03-08T02:30", "America/Denver"),
    ).toBeNull();
    expect(
      parseCoachingScheduleDate("2026-11-01T01:30", "America/Denver"),
    ).toBeNull();
  });

  it("rejects invalid values and invalid timezones", () => {
    expect(parseCoachingScheduleDate("not-a-date", "America/Denver")).toBeNull();
    expect(parseCoachingScheduleDate("2026-08-26T10:00", "Mars/Olympus")).toBeNull();
  });
});
