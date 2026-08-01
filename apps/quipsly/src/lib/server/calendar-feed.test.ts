/** @jest-environment node */

jest.mock("server-only", () => ({}));

import {
  calendarFeedTokenDigest,
  createCalendarFeedToken,
  renderCalendarFeed,
} from "./calendar-feed";

describe("revocable Quipsly calendar feeds", () => {
  it("creates a one-time 256-bit capability and stores only a domain-separated digest", () => {
    const first = createCalendarFeedToken();
    const second = createCalendarFeedToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(calendarFeedTokenDigest(first.token)).toBe(first.tokenDigest);
    expect(first.token).not.toBe(second.token);
    expect(calendarFeedTokenDigest("not-a-token")).toBeNull();
  });

  it("fails closed before database access for malformed tokens", async () => {
    const findUnique = jest.fn();
    const rendered = await renderCalendarFeed({
      prisma: { calendarFeed: { findUnique } } as never,
      token: "bad",
      origin: "https://nest.quipsly.com",
    });
    expect(rendered).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("renders personal timing facts without task detail, notes, transcripts, or identities", async () => {
    const { token, tokenDigest } = createCalendarFeedToken();
    const prisma = {
      calendarFeed: {
        findUnique: jest.fn().mockResolvedValue({
          id: "feed-1",
          collectionId: "collection-1",
          ownerUserId: "user-1",
          status: "ACTIVE",
          collection: {
            id: "collection-1",
            purpose: "PERSONAL_COMMITMENTS",
            displayName: "My Quipsly commitments",
            status: "ACTIVE",
            nestId: null,
            workspaceId: null,
          },
        }),
        update: jest.fn().mockResolvedValue({ id: "feed-1" }),
      },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
      actionItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: "task-1",
              title: "Send recap",
              dueAt: new Date("2026-08-03T18:00:00Z"),
              status: "OPEN",
              updatedAt: new Date("2026-08-01T12:00:00Z"),
            },
          ]),
      },
      goal: { findMany: jest.fn().mockResolvedValue([]) },
      calendarSyncReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    expect(tokenDigest).toBe(calendarFeedTokenDigest(token));
    const rendered = await renderCalendarFeed({
      prisma: prisma as never,
      token,
      origin: "https://nest.quipsly.com",
      now: new Date("2026-08-01T12:00:00Z"),
    });
    expect(rendered?.eventCount).toBe(1);
    expect(rendered?.calendar).toContain("SUMMARY:Due: Send recap");
    expect(rendered?.calendar).toContain("TRANSP:TRANSPARENT");
    expect(rendered?.calendar).not.toMatch(/transcript|private note|email/i);
    expect(prisma.calendarFeed.findUnique).toHaveBeenCalledWith({
      where: { tokenDigest },
      include: { collection: true },
    });
    expect(prisma.calendarSyncReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: "FEED_RENDER",
          externalMutated: false,
        }),
      }),
    );
  });

  it("returns no calendar for a revoked capability", async () => {
    const { token } = createCalendarFeedToken();
    const prisma = {
      calendarFeed: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            status: "REVOKED",
            collection: { status: "ACTIVE" },
          }),
      },
    };
    expect(
      await renderCalendarFeed({
        prisma: prisma as never,
        token,
        origin: "https://nest.quipsly.com",
      }),
    ).toBeNull();
  });
});
