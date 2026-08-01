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
    jest.mocked(renderCalendarFeed).mockResolvedValue({
      calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      name: "Coaching",
      eventCount: 0,
      contentDigest: "a".repeat(64),
    });
    const response = await GET(
      new Request(
        `https://nest.quipsly.com/api/calendar/feeds/${"A".repeat(43)}`,
      ),
      { params: Promise.resolve({ token: "A".repeat(43) }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=300, must-revalidate",
    );
    expect(response.headers.get("etag")).toBe(`"${"a".repeat(64)}"`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(renderCalendarFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: getPrismaClient(),
        origin: "https://nest.quipsly.com",
      }),
    );
  });

  it("returns a bodyless 304 for the current strong or weak entity tag", async () => {
    jest.mocked(renderCalendarFeed).mockResolvedValue({
      calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      name: "Coaching",
      eventCount: 0,
      contentDigest: "b".repeat(64),
    });
    const response = await GET(
      new Request(
        `https://nest.quipsly.com/api/calendar/feeds/${"A".repeat(43)}`,
        { headers: { "If-None-Match": `W/"${"b".repeat(64)}"` } },
      ),
      { params: Promise.resolve({ token: "A".repeat(43) }) },
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe(`"${"b".repeat(64)}"`);
  });
});
