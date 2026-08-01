/** @jest-environment node */

import { renderCalendarFeed } from "@/lib/server/calendar-feed";
import { getPrismaClient } from "@/lib/prisma";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn(() => ({})) }));
jest.mock("@/lib/server/calendar-feed", () => ({
  renderCalendarFeed: jest.fn(),
}));

describe("public iCalendar capability route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the same non-enumerable 404 for invalid or revoked links", async () => {
    jest.mocked(renderCalendarFeed).mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/feeds/bad"),
      { params: Promise.resolve({ token: "bad" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toMatch(/token|digest|database/i);
  });

  it("serves calendar data without cookies or shared caching", async () => {
    jest
      .mocked(renderCalendarFeed)
      .mockResolvedValue({
        calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
        name: "Coaching",
        eventCount: 0,
      });
    const response = await GET(
      new Request(
        `https://nest.quipsly.com/api/calendar/feeds/${"A".repeat(43)}`,
      ),
      { params: Promise.resolve({ token: "A".repeat(43) }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(renderCalendarFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: getPrismaClient(),
        origin: "https://nest.quipsly.com",
      }),
    );
  });
});
