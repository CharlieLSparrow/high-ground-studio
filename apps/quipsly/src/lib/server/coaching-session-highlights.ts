import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { coachingEngagementAccessWhere } from "./coaching-engagement";
import {
  sessionActorAccessWhere,
  type SessionAccessActor,
} from "./session-access";

export const coachingSessionSummarySelect = {
  id: true,
  title: true,
  purpose: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  endedAt: true,
  createdAt: true,
  transcriptJobs: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { status: true },
  },
  outputs: { where: { status: "RELEASED" }, take: 1, select: { id: true } },
  _count: { select: { recordingAssets: true } },
} satisfies Prisma.CallRoomSelect;

/** Highlights are queried independently of the bounded history list. Old unclosed
 * rooms are still available in history but cannot hide the next appointment. */
export async function loadCoachingSessionHighlights({
  prisma,
  engagementId,
  actor,
  now = new Date(),
}: {
  prisma: PrismaClient;
  engagementId: string;
  actor: SessionAccessActor;
  now?: Date;
}) {
  if (!Number.isFinite(now.getTime()))
    throw new Error("A valid session overview time is required.");
  const access: Prisma.CallRoomWhereInput = {
    AND: [
      sessionActorAccessWhere(actor),
      {
        coachingEngagement: {
          is: coachingEngagementAccessWhere(engagementId, actor, "read"),
        },
      },
    ],
  };
  const first = (
    where: Prisma.CallRoomWhereInput,
    orderBy: Prisma.CallRoomOrderByWithRelationInput[],
  ) =>
    prisma.callRoom.findFirst({
      where: { AND: [access, where] },
      orderBy: [...orderBy, { id: "asc" }],
      select: coachingSessionSummarySelect,
    });
  const scheduledStatuses = ["PLANNED", "OPEN"] as const;
  const [recording, current, upcoming, unscheduled, overdue, last] =
    await Promise.all([
      first({ status: "RECORDING" }, [{ updatedAt: "desc" }]),
      first(
        {
          status: { in: [...scheduledStatuses] },
          scheduledStart: { lte: now },
          scheduledEnd: { gt: now },
        },
        [{ scheduledStart: "desc" }],
      ),
      first(
        { status: { in: [...scheduledStatuses] }, scheduledStart: { gt: now } },
        [{ scheduledStart: "asc" }],
      ),
      first({ status: "OPEN", scheduledStart: null }, [{ createdAt: "desc" }]),
      first(
        {
          status: { in: [...scheduledStatuses] },
          scheduledStart: { lte: now },
          OR: [{ scheduledEnd: null }, { scheduledEnd: { lte: now } }],
        },
        [{ scheduledStart: "desc" }],
      ),
      first({ status: "ENDED" }, [
        { endedAt: { sort: "desc", nulls: "last" } },
        { scheduledStart: "desc" },
        { createdAt: "desc" },
      ]),
    ]);
  return {
    next: recording || current || upcoming || unscheduled || overdue,
    last,
    overdue:
      !recording && !current && !upcoming && !unscheduled && Boolean(overdue),
  };
}
