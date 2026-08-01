import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  buildIcsFeed,
  type QuipslyCalendarEvent,
} from "@/lib/server/calendar-ics";

export const CALENDAR_FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export type SupportedCalendarFeedPurpose =
  | "COACHING"
  | "PODCAST_PRODUCTION"
  | "PERSONAL_COMMITMENTS";

function digestToken(token: string) {
  return createHash("sha256")
    .update(`quipsly-calendar-feed-v1\0${token}`)
    .digest("hex");
}

export function isCalendarFeedToken(value: string) {
  return CALENDAR_FEED_TOKEN_PATTERN.test(value);
}

export function createCalendarFeedToken() {
  const token = randomBytes(32).toString("base64url");
  if (!isCalendarFeedToken(token))
    throw new Error("Generated calendar feed token is invalid.");
  return { token, tokenDigest: digestToken(token) };
}

export function calendarFeedTokenDigest(token: string) {
  if (!isCalendarFeedToken(token)) return null;
  return digestToken(token);
}

function revisionSequence(updatedAt: Date) {
  return Math.max(
    0,
    Math.min(2_147_483_647, Math.floor(updatedAt.getTime() / 1_000)),
  );
}

function dueWindow(date: Date) {
  return { startsAt: date, endsAt: new Date(date.getTime() + 30 * 60_000) };
}

function feedName(purpose: SupportedCalendarFeedPurpose, displayName: string) {
  if (displayName.trim()) return displayName.trim();
  if (purpose === "COACHING") return "Quipsly coaching";
  if (purpose === "PODCAST_PRODUCTION") return "Quipsly podcast production";
  return "My Quipsly commitments";
}

export async function rotateCalendarFeed(input: {
  prisma: PrismaClient;
  actorUserId: string;
  purpose: SupportedCalendarFeedPurpose;
  timezone: string;
  projectId?: string | null;
  displayName?: string | null;
}) {
  const { token, tokenDigest } = createCalendarFeedToken();
  const now = new Date();
  return input.prisma.$transaction(async (transaction) => {
    const ownerBoundary =
      input.purpose === "PODCAST_PRODUCTION"
        ? { nestId: input.projectId || "" }
        : { ownerUserId: input.actorUserId };
    if (input.purpose === "PODCAST_PRODUCTION" && !input.projectId) {
      throw new Error("A podcast production feed requires a project.");
    }
    let collection = await transaction.calendarCollection.findFirst({
      where: { ...ownerBoundary, purpose: input.purpose, status: "ACTIVE" },
    });
    if (!collection) {
      collection = await transaction.calendarCollection.create({
        data: {
          ...ownerBoundary,
          purpose: input.purpose,
          displayName: feedName(input.purpose, input.displayName || ""),
          timezone: input.timezone,
          visibility:
            input.purpose === "PODCAST_PRODUCTION" ? "TEAM" : "PRIVATE",
          metadataJson: { source: "quipsly-icalendar-subscription-v1" },
        },
      });
    }
    await transaction.calendarFeed.updateMany({
      where: {
        collectionId: collection.id,
        ownerUserId: input.actorUserId,
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: now },
    });
    const feed = await transaction.calendarFeed.create({
      data: {
        collectionId: collection.id,
        ownerUserId: input.actorUserId,
        tokenDigest,
        timezone: input.timezone,
        metadataJson: { tokenVersion: 1, rawTokenStored: false },
      },
    });
    await transaction.calendarSyncReceipt.create({
      data: {
        collectionId: collection.id,
        actorUserId: input.actorUserId,
        operation: "VERIFY",
        outcome: "SUCCEEDED",
        externalMutated: false,
        occurredAt: now,
        metadataJson: {
          source: "icalendar-feed-rotate",
          feedId: feed.id,
          priorFeedsRevoked: true,
        },
      },
    });
    return { feed, collection, token };
  });
}

export async function revokeCalendarFeeds(input: {
  prisma: PrismaClient;
  actorUserId: string;
  purpose: SupportedCalendarFeedPurpose;
  projectId?: string | null;
}) {
  const now = new Date();
  return input.prisma.$transaction(async (transaction) => {
    const collection = await transaction.calendarCollection.findFirst({
      where: {
        purpose: input.purpose,
        ...(input.purpose === "PODCAST_PRODUCTION"
          ? { nestId: input.projectId || "" }
          : { ownerUserId: input.actorUserId }),
      },
      select: { id: true },
    });
    if (!collection) return { revoked: 0 };
    const result = await transaction.calendarFeed.updateMany({
      where: {
        collectionId: collection.id,
        ownerUserId: input.actorUserId,
        status: "ACTIVE",
      },
      data: { status: "REVOKED", revokedAt: now },
    });
    if (result.count > 0) {
      await transaction.calendarSyncReceipt.create({
        data: {
          collectionId: collection.id,
          actorUserId: input.actorUserId,
          operation: "FEED_REVOKE",
          outcome: "SUCCEEDED",
          externalMutated: false,
          occurredAt: now,
          metadataJson: {
            source: "icalendar-feed-revoke",
            revokedCount: result.count,
          },
        },
      });
    }
    return { revoked: result.count };
  });
}

export async function renderCalendarFeed(input: {
  prisma: PrismaClient;
  token: string;
  origin: string;
  now?: Date;
}) {
  const tokenDigest = calendarFeedTokenDigest(input.token);
  if (!tokenDigest) return null;
  const now = input.now ?? new Date();
  const from = new Date(now.getTime() - 90 * 86_400_000);
  const until = new Date(now.getTime() + 730 * 86_400_000);
  const feed = await input.prisma.calendarFeed.findUnique({
    where: { tokenDigest },
    include: { collection: true },
  });
  if (!feed || feed.status !== "ACTIVE" || feed.collection.status !== "ACTIVE")
    return null;

  const events: QuipslyCalendarEvent[] = [];
  if (feed.collection.purpose === "COACHING" && feed.ownerUserId) {
    const bookings = await input.prisma.coachingBooking.findMany({
      where: {
        OR: [
          { clientUserId: feed.ownerUserId },
          { coachUserId: feed.ownerUserId },
        ],
        scheduledEnd: { gte: from },
        scheduledStart: { lte: until },
        status: { in: ["CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"] },
      },
      orderBy: { scheduledStart: "asc" },
      take: 1_000,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        updatedAt: true,
        offering: { select: { title: true } },
        callRoom: { select: { id: true, title: true } },
      },
    });
    for (const booking of bookings) {
      events.push({
        sourceType: "COACHING_BOOKING",
        sourceId: booking.id,
        title:
          booking.callRoom?.title ||
          booking.offering?.title ||
          "Quipsly coaching session",
        description:
          "Open Quipsly for session details. Private notes, transcript text, goals, and recordings are not included.",
        location: "Quipsly Capture",
        startsAt: booking.scheduledStart,
        endsAt: booking.scheduledEnd,
        updatedAt: booking.updatedAt,
        sequence: revisionSequence(booking.updatedAt),
        url: new URL(
          booking.callRoom?.id
            ? `/sessions/${encodeURIComponent(booking.callRoom.id)}`
            : "/coaching",
          input.origin,
        ).toString(),
        status:
          booking.status === "CANCELED" || booking.status === "NO_SHOW"
            ? "CANCELLED"
            : "CONFIRMED",
      });
    }
  }

  if (feed.collection.purpose === "PODCAST_PRODUCTION") {
    const rooms = await input.prisma.callRoom.findMany({
      where: {
        purpose: "PODCAST",
        scheduledStart: { gte: from, lte: until },
        scheduledEnd: { not: null },
        ...(feed.collection.nestId
          ? { projectId: feed.collection.nestId }
          : feed.collection.workspaceId
            ? { project: { workspaceId: feed.collection.workspaceId } }
            : { id: "__unscoped_feed__" }),
      },
      orderBy: { scheduledStart: "asc" },
      take: 1_000,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        updatedAt: true,
      },
    });
    for (const room of rooms) {
      if (!room.scheduledStart || !room.scheduledEnd) continue;
      events.push({
        sourceType: "CALL_ROOM",
        sourceId: room.id,
        title: room.title || "Podcast recording",
        description:
          "Open Quipsly for the run of show, sources, recording, and production work.",
        location: "Quipsly Capture",
        startsAt: room.scheduledStart,
        endsAt: room.scheduledEnd,
        updatedAt: room.updatedAt,
        sequence: revisionSequence(room.updatedAt),
        url: new URL(
          `/sessions/${encodeURIComponent(room.id)}`,
          input.origin,
        ).toString(),
        status:
          room.status === "CANCELED" || room.status === "FAILED"
            ? "CANCELLED"
            : "CONFIRMED",
      });
    }
  }

  if (feed.collection.purpose === "PERSONAL_COMMITMENTS" && feed.ownerUserId) {
    const [blocks, tasks, goals] = await Promise.all([
      input.prisma.workPlanBlock.findMany({
        where: {
          ownerUserId: feed.ownerUserId,
          endsAt: { gte: from },
          startsAt: { lte: until },
        },
        orderBy: { startsAt: "asc" },
        take: 1_000,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          updatedAt: true,
          actionItem: { select: { title: true } },
          goal: { select: { title: true } },
        },
      }),
      input.prisma.actionItem.findMany({
        where: {
          assignedUserId: feed.ownerUserId,
          dueAt: { gte: from, lte: until },
        },
        orderBy: { dueAt: "asc" },
        take: 1_000,
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          updatedAt: true,
        },
      }),
      input.prisma.goal.findMany({
        where: {
          ownerUserId: feed.ownerUserId,
          targetAt: { gte: from, lte: until },
        },
        orderBy: { targetAt: "asc" },
        take: 1_000,
        select: {
          id: true,
          title: true,
          targetAt: true,
          status: true,
          updatedAt: true,
        },
      }),
    ]);
    for (const block of blocks)
      events.push({
        sourceType: "WORK_PLAN_BLOCK",
        sourceId: block.id,
        title:
          block.actionItem?.title || block.goal?.title || "Quipsly focus block",
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        updatedAt: block.updatedAt,
        sequence: revisionSequence(block.updatedAt),
        url: new URL("/schedule", input.origin).toString(),
        status:
          block.status === "CANCELED" || block.status === "SKIPPED"
            ? "CANCELLED"
            : "CONFIRMED",
      });
    for (const task of tasks) {
      if (!task.dueAt) continue;
      events.push({
        sourceType: "ACTION_ITEM",
        sourceId: task.id,
        title: `Due: ${task.title}`,
        ...dueWindow(task.dueAt),
        updatedAt: task.updatedAt,
        sequence: revisionSequence(task.updatedAt),
        url: new URL("/work", input.origin).toString(),
        transparency: "TRANSPARENT",
        status: task.status === "CANCELED" ? "CANCELLED" : "CONFIRMED",
      });
    }
    for (const goal of goals) {
      if (!goal.targetAt) continue;
      events.push({
        sourceType: "GOAL",
        sourceId: goal.id,
        title: `Goal target: ${goal.title}`,
        ...dueWindow(goal.targetAt),
        updatedAt: goal.updatedAt,
        sequence: revisionSequence(goal.updatedAt),
        url: new URL("/work", input.origin).toString(),
        transparency: "TRANSPARENT",
        status: goal.status === "ARCHIVED" ? "CANCELLED" : "CONFIRMED",
      });
    }
  }

  const calendar = buildIcsFeed({
    name: feedName(feed.collection.purpose, feed.collection.displayName),
    events,
    generatedAt: now,
  });
  await input.prisma.$transaction([
    input.prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { lastGeneratedAt: now },
    }),
    input.prisma.calendarSyncReceipt.create({
      data: {
        collectionId: feed.collectionId,
        actorUserId: feed.ownerUserId,
        operation: "FEED_RENDER",
        outcome: "SUCCEEDED",
        externalMutated: false,
        occurredAt: now,
        metadataJson: {
          source: "icalendar-feed-render",
          feedId: feed.id,
          eventCount: events.length,
        },
      },
    }),
  ]);
  return {
    calendar,
    name: feedName(feed.collection.purpose, feed.collection.displayName),
    eventCount: events.length,
  };
}
