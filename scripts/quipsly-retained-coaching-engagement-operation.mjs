#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const enabled = process.env.QUIPSLY_RETAINED_COACHING_ENGAGEMENT_OPERATION === "1";
if (!enabled) throw new Error("Set QUIPSLY_RETAINED_COACHING_ENGAGEMENT_OPERATION=1 to authorize the retained local relationship repair.");

const databaseUrl = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio");
if (!["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname)) throw new Error("This operation is local-only.");
process.env.DATABASE_URL = databaseUrl.toString();
process.env.PRISMA_PG_POOL_MAX ||= "1";

const { getPrismaClient } = await import("../apps/quipsly/src/lib/prisma.ts");
const prisma = getPrismaClient();
const engagementId = "retained-coaching-engagement-20260731";
const bookingIds = ["retained-coaching-booking-20260731", "qa-retained-coaching-next-booking-20260807"];
const operationId = randomUUID();

function assert(value, message) {
  if (!value) throw new Error(message);
}

try {
  const result = await prisma.$transaction(async (tx) => {
    const bookings = await tx.coachingBooking.findMany({
      where: { id: { in: bookingIds } },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true,
        engagementId: true,
        clientUserId: true,
        coachUserId: true,
        clientUser: { select: { name: true, primaryEmail: true } },
        callRoom: { select: { id: true, purpose: true, projectId: true, coachingEngagementId: true } },
      },
    });
    assert(bookings.length === bookingIds.length, "Both retained coaching bookings must exist before repair.");
    const [first, ...rest] = bookings;
    assert(first.coachUserId, "The retained engagement needs an assigned coach.");
    assert(first.callRoom?.projectId, "The retained engagement needs an exact canonical Nest.");
    assert(bookings.every((booking) => booking.clientUserId === first.clientUserId), "Bookings do not have one exact client.");
    assert(bookings.every((booking) => booking.coachUserId === first.coachUserId), "Bookings do not have one exact coach.");
    assert(bookings.every((booking) => booking.callRoom?.projectId === first.callRoom.projectId), "Bookings do not have one exact Nest.");
    assert(bookings.every((booking) => booking.callRoom?.purpose === "COACHING"), "A non-coaching Session cannot enter a Coaching Engagement.");
    assert(bookings.every((booking) => !booking.engagementId || booking.engagementId === engagementId), "A booking already belongs to a different engagement.");
    assert(bookings.every((booking) => !booking.callRoom?.coachingEngagementId || booking.callRoom.coachingEngagementId === engagementId), "A Session already belongs to a different engagement.");

    const existing = await tx.coachingEngagement.findUnique({ where: { id: engagementId } });
    if (existing) {
      assert(existing.projectId === first.callRoom.projectId, "Existing engagement belongs to a different Nest.");
      assert(existing.primaryClientUserId === first.clientUserId, "Existing engagement belongs to a different client.");
      assert(existing.primaryCoachUserId === first.coachUserId, "Existing engagement belongs to a different coach.");
    } else {
      await tx.coachingEngagement.create({ data: {
        id: engagementId,
        projectId: first.callRoom.projectId,
        createdByUserId: first.coachUserId,
        primaryClientUserId: first.clientUserId,
        primaryCoachUserId: first.coachUserId,
        title: `${first.clientUser.name || first.clientUser.primaryEmail} coaching`,
        metadataJson: {
          source: "quipsly-retained-coaching-engagement-operation",
          operationId,
          reviewedBookingIds: bookingIds,
          inferredFromHistoricalSessions: false,
          externalSideEffects: false,
        },
      } });
    }

    for (const member of [
      { userId: first.clientUserId, role: "CLIENT" },
      { userId: first.coachUserId, role: "COACH" },
    ]) {
      await tx.coachingEngagementMember.upsert({
        where: { engagementId_userId: { engagementId, userId: member.userId } },
        update: { role: member.role, status: "ACTIVE", removedAt: null, removedByUserId: null },
        create: { engagementId, userId: member.userId, role: member.role, addedByUserId: first.coachUserId, metadataJson: { source: "retained-reviewed-repair", operationId } },
      });
    }
    const roomIds = bookings.map((booking) => booking.callRoom.id);
    const bookingWrite = await tx.coachingBooking.updateMany({ where: { id: { in: bookingIds } }, data: { engagementId } });
    const roomWrite = await tx.callRoom.updateMany({ where: { id: { in: roomIds } }, data: { coachingEngagementId: engagementId } });
    const taskWrite = await tx.actionItem.updateMany({ where: { OR: [{ roomId: { in: roomIds } }, { bookingId: { in: bookingIds } }], engagementId: null }, data: { engagementId } });
    const goalWrite = await tx.goal.updateMany({ where: { OR: [{ roomId: { in: roomIds } }, { bookingId: { in: bookingIds } }], engagementId: null }, data: { engagementId } });
    return { roomIds, bookingWrite: bookingWrite.count, roomWrite: roomWrite.count, taskWrite: taskWrite.count, goalWrite: goalWrite.count };
  });

  const readback = await prisma.coachingEngagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true, title: true, status: true, projectId: true,
      members: { where: { status: "ACTIVE" }, orderBy: { role: "asc" }, select: { role: true, user: { select: { primaryEmail: true } } } },
      bookings: { orderBy: { scheduledStart: "asc" }, select: { id: true } },
      callRooms: { orderBy: { scheduledStart: "asc" }, select: { id: true, title: true } },
    },
  });
  assert(readback?.bookings.length === 2 && readback.callRooms.length === 2, "Persisted engagement readback did not retain both Sessions.");
  console.log(JSON.stringify({ ok: true, operationId, writes: result, engagement: readback, externalSideEffects: false }, null, 2));
} finally {
  await prisma.$disconnect();
}
