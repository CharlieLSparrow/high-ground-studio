import {
  collapseTaskRecurrenceForCalendar,
  formatScheduleDateTime,
  groupPlanBlocksByLocalDay,
  formatScheduleMediaTime,
  humanizeScheduleValue,
  planBlockDurationMinutes,
  planBlockLocalInputValue,
  type SchedulePlanBlock,
} from "./schedule-model";

describe("schedule runway model", () => {
  it("turns stored enum-like values into readable labels", () => {
    expect(humanizeScheduleValue("READY_FOR_HUMAN_REVIEW")).toBe("Ready For Human Review");
  });

  it("renders a canonical Session instant in its stored timezone instead of the server timezone", () => {
    expect(formatScheduleDateTime(
      "2026-07-29T23:00:00.000Z",
      "America/Denver",
    )).toBe("Wed, Jul 29, 5:00 PM MDT");
    expect(formatScheduleDateTime(
      "2026-07-29T23:00:00.000Z",
      "UTC",
    )).toBe("Wed, Jul 29, 11:00 PM UTC");
    expect(formatScheduleDateTime(
      "2026-07-29T23:00:00.000Z",
      "Not/AZone",
    )).toBe("Wed, Jul 29, 11:00 PM UTC");
  });

  it("keeps only the next ordered open occurrence from each repeating series", () => {
    const standalone = { id: "standalone", recurrenceOccurrence: null };
    const first = { id: "series-first", recurrenceOccurrence: { seriesId: "series-1" } };
    const later = { id: "series-later", recurrenceOccurrence: { seriesId: "series-1" } };
    const another = { id: "series-2-first", recurrenceOccurrence: { seriesId: "series-2" } };

    expect(collapseTaskRecurrenceForCalendar([standalone, first, later, another])).toEqual([
      standalone,
      first,
      another,
    ]);
  });

  it("groups personal focus blocks by the actor timezone and preserves time order", () => {
    const base = {
      targetType: "task" as const,
      targetId: "task-1",
      title: "Correct the transcript",
      targetStatus: "OPEN",
      timezone: "America/Denver",
      status: "PLANNED" as const,
      completedAt: null,
      actualMinutes: null,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null,
      tags: [],
      sourceAnchor: null,
    };
    const blocks: SchedulePlanBlock[] = [
      { ...base, id: "later", startsAt: "2026-07-19T15:00:00.000Z", endsAt: "2026-07-19T16:30:00.000Z" },
      { ...base, id: "earlier", startsAt: "2026-07-19T01:00:00.000Z", endsAt: "2026-07-19T01:25:00.000Z" },
    ];

    expect(groupPlanBlocksByLocalDay(blocks, "America/Denver")).toEqual([
      { date: "2026-07-18", blocks: [expect.objectContaining({ id: "earlier" })] },
      { date: "2026-07-19", blocks: [expect.objectContaining({ id: "later" })] },
    ]);
    expect(planBlockDurationMinutes(blocks[1])).toBe(25);
    expect(planBlockDurationMinutes({ startsAt: "bad", endsAt: "also bad" })).toBeNull();
    expect(planBlockLocalInputValue("2026-07-19T18:00:00.000Z", "America/Denver")).toBe("2026-07-19T12:00");
    expect(planBlockLocalInputValue("2026-07-19T18:00:00.000Z", "Pacific/Honolulu")).toBe("2026-07-19T08:00");
    expect(planBlockLocalInputValue("bad", "America/Denver")).toBe("");
    expect(planBlockLocalInputValue("2026-07-19T18:00:00.000Z", "Not/AZone")).toBe("");
    expect(formatScheduleMediaTime(3.66)).toBe("0:03");
    expect(formatScheduleMediaTime(3_661)).toBe("1:01:01");
  });
});
