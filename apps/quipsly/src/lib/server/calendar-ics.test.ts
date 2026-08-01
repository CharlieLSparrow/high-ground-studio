/** @jest-environment node */

import { buildIcsCalendar, foldIcsLine, stableCalendarUid } from "./calendar-ics";

describe("Quipsly iCalendar projection", () => {
  const input = {
    sourceType: "COACHING_BOOKING" as const,
    sourceId: "booking-1",
    title: "Coaching: goals, decisions; and follow-through",
    description: "Open Quipsly for private notes.\nNo transcript text is exported.",
    location: "Quipsly Capture",
    startsAt: new Date("2026-11-01T15:00:00.000Z"),
    endsAt: new Date("2026-11-01T16:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    url: "https://nest.quipsly.com/sessions/room-1",
  };

  it("builds stable, escaped, CRLF-terminated UTC calendar data", () => {
    const calendar = buildIcsCalendar(input);
    const unfolded = calendar.replaceAll("\r\n ", "");
    expect(calendar).toContain(`UID:${stableCalendarUid("COACHING_BOOKING", "booking-1")}`);
    expect(calendar).toContain("DTSTART:20261101T150000Z\r\n");
    expect(calendar).toContain("SUMMARY:Coaching: goals\\, decisions\\; and follow-through");
    expect(unfolded).toContain("DESCRIPTION:Open Quipsly for private notes.\\nNo transcript text is exported.");
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("folds UTF-8 lines at 75 octets with a continuation space", () => {
    const folded = foldIcsLine(`DESCRIPTION:${"Quipsly 🎙️ ".repeat(12)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
  });

  it("rejects invalid scheduling facts", () => {
    expect(() => buildIcsCalendar({ ...input, endsAt: input.startsAt })).toThrow(/end after its start/);
  });
});
