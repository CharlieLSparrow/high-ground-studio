/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/home-nest", () => ({
  listProjectsVisibleToEmail: jest.fn(),
}));

import {
  calendarFeedTokenDigest,
  createCalendarFeedToken,
  renderCalendarFeed,
  rotateCalendarFeed,
} from "./calendar-feed";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";

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

  it("serializes rotation before revoking the prior capability and creating its replacement", async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ lock: "" }]),
      calendarCollection: {
        findFirst: jest.fn().mockResolvedValue({
          id: "collection-1",
          purpose: "PODCAST_PRODUCTION",
          displayName: "HGO production",
        }),
      },
      calendarFeed: {
        findMany: jest.fn().mockResolvedValue([{ id: "feed-1" }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: "feed-2" }),
      },
      calendarSyncReceipt: {
        create: jest.fn().mockResolvedValue({ id: "receipt-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (value: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };

    const rotated = await rotateCalendarFeed({
      prisma: prisma as never,
      actorUserId: "user-1",
      purpose: "PODCAST_PRODUCTION",
      timezone: "America/Denver",
      projectId: "project-1",
    });

    expect(rotated.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.calendarFeed.updateMany).toHaveBeenCalledWith({
      where: {
        collectionId: "collection-1",
        ownerUserId: "user-1",
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: expect.any(Date) },
    });
    expect(
      transaction.calendarFeed.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.calendarFeed.create.mock.invocationCallOrder[0]);
    expect(transaction.calendarSyncReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: "FEED_REVOKE",
        metadataJson: expect.objectContaining({ feedIds: ["feed-1"] }),
      }),
    });
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
    let feedMetadata: Record<string, unknown> = {
      tokenVersion: 1,
      rawTokenStored: false,
    };
    const feedRecord = {
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
      owner: { primaryEmail: "person@example.test", isActive: true },
    };
    const transaction = {
      calendarFeed: {
        findUnique: jest
          .fn()
          .mockImplementation(async (query: any) =>
            "tokenDigest" in query.where
              ? feedRecord
              : { status: "ACTIVE", metadataJson: feedMetadata },
          ),
        update: jest.fn().mockImplementation(async (query: any) => {
          feedMetadata = query.data.metadataJson;
          return { id: "feed-1" };
        }),
      },
      workPlanBlock: { findMany: jest.fn().mockResolvedValue([]) },
      actionItem: {
        findMany: jest.fn().mockResolvedValue([
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
      $queryRaw: jest.fn().mockResolvedValue([{ lock: "" }]),
    };
    const prisma = {
      ...transaction,
      $transaction: jest.fn(
        async (operation: (value: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
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
      include: {
        collection: true,
        owner: { select: { primaryEmail: true, isActive: true } },
      },
    });
    expect(prisma.calendarSyncReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operation: "FEED_RENDER",
          responseDigest: rendered?.contentDigest,
          externalMutated: false,
        }),
      }),
    );

    await renderCalendarFeed({
      prisma: prisma as never,
      token,
      origin: "https://nest.quipsly.com",
      now: new Date("2026-08-01T12:05:00Z"),
    });
    expect(prisma.calendarFeed.update).toHaveBeenCalledTimes(1);
    expect(prisma.calendarSyncReceipt.create).toHaveBeenCalledTimes(1);
  });

  it("returns no calendar for a revoked capability", async () => {
    const { token } = createCalendarFeedToken();
    const prisma = {
      calendarFeed: {
        findUnique: jest.fn().mockResolvedValue({
          status: "REVOKED",
          collection: { status: "ACTIVE" },
          owner: { primaryEmail: "person@example.test", isActive: true },
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

  it("stops a podcast capability when its owner loses Nest access", async () => {
    const { token } = createCalendarFeedToken();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([]);
    const callRoomFindMany = jest.fn();
    const prisma = {
      calendarFeed: {
        findUnique: jest.fn().mockResolvedValue({
          id: "feed-1",
          collectionId: "collection-1",
          ownerUserId: "user-1",
          status: "ACTIVE",
          collection: {
            status: "ACTIVE",
            purpose: "PODCAST_PRODUCTION",
            nestId: "project-1",
          },
          owner: { primaryEmail: "person@example.test", isActive: true },
        }),
      },
      callRoom: { findMany: callRoomFindMany },
    };

    expect(
      await renderCalendarFeed({
        prisma: prisma as never,
        token,
        origin: "https://nest.quipsly.com",
      }),
    ).toBeNull();
    expect(listProjectsVisibleToEmail).toHaveBeenCalledWith(
      "person@example.test",
      prisma,
    );
    expect(callRoomFindMany).not.toHaveBeenCalled();
  });

  it("stops every capability owned by a deactivated user", async () => {
    const { token } = createCalendarFeedToken();
    const actionItemFindMany = jest.fn();
    const prisma = {
      calendarFeed: {
        findUnique: jest.fn().mockResolvedValue({
          status: "ACTIVE",
          collection: {
            status: "ACTIVE",
            purpose: "PERSONAL_COMMITMENTS",
          },
          owner: { primaryEmail: "person@example.test", isActive: false },
        }),
      },
      actionItem: { findMany: actionItemFindMany },
    };

    expect(
      await renderCalendarFeed({
        prisma: prisma as never,
        token,
        origin: "https://nest.quipsly.com",
      }),
    ).toBeNull();
    expect(actionItemFindMany).not.toHaveBeenCalled();
  });
});
