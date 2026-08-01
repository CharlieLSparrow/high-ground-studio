/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import {
  revokeCalendarFeeds,
  rotateCalendarFeed,
} from "@/lib/server/calendar-feed";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { DELETE, GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/calendar-feed", () => ({
  rotateCalendarFeed: jest.fn(),
  revokeCalendarFeeds: jest.fn(),
}));
jest.mock("@/lib/server/home-nest", () => ({
  listProjectsVisibleToEmail: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const session = {
  user: { id: "user-1", primaryEmail: "person@example.com" },
} as never;

describe("calendar subscription management API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("authenticates before reading or changing feed state", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/feeds"),
    );
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(rotateCalendarFeed).not.toHaveBeenCalled();
  });

  it("returns safe status without capability material", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session);
    jest.mocked(getPrismaClient).mockReturnValue({
      calendarFeed: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "feed-1",
            status: "ACTIVE",
            createdAt: new Date("2026-08-01T12:00:00Z"),
            revokedAt: null,
            lastGeneratedAt: null,
            collection: {
              purpose: "COACHING",
              displayName: "Coaching",
              nestId: null,
            },
          },
        ]),
      },
    } as never);
    const response = await GET(
      new Request("https://nest.quipsly.com/api/calendar/feeds"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.feeds[0]).toMatchObject({
      status: "ACTIVE",
      subscriptionUrlRecoverable: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/token|webcal|subscriptionUrl":/i);
  });

  it("creates a one-time link and scopes podcast feeds to a visible Nest", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session);
    const prisma = {} as never;
    jest.mocked(getPrismaClient).mockReturnValue(prisma);
    jest
      .mocked(listProjectsVisibleToEmail)
      .mockResolvedValue([{ id: "project-1" }] as never);
    jest.mocked(rotateCalendarFeed).mockResolvedValue({
      token: "A".repeat(43),
      feed: { id: "feed-1" },
      collection: {
        purpose: "PODCAST_PRODUCTION",
        displayName: "HGO production",
      },
    } as never);
    const response = await POST(
      new Request("https://nest.quipsly.com/api/calendar/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "PODCAST_PRODUCTION",
          projectId: "project-1",
          timezone: "America/Denver",
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(rotateCalendarFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        projectId: "project-1",
        prisma,
      }),
    );
    expect(body.feed.subscriptionUrl).toBe(
      `https://nest.quipsly.com/api/calendar/feeds/${"A".repeat(43)}`,
    );
    expect(body.feed.webcalUrl).toMatch(/^webcal:/);
    expect(body.feed.shownOnce).toBe(true);
  });

  it("denies an inaccessible podcast project and revokes without returning an old link", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session);
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([]);
    const denied = await DELETE(
      new Request("https://nest.quipsly.com/api/calendar/feeds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "PODCAST_PRODUCTION",
          projectId: "not-visible",
        }),
      }),
    );
    expect(denied.status).toBe(403);
    expect(revokeCalendarFeeds).not.toHaveBeenCalled();
  });
});
