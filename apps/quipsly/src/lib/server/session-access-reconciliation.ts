import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { canAccessStudio } from "@/lib/studio-authz";
import { sessionJoinAccessWhere } from "./session-access";
import {
  liveKitAccessAdmin,
  reconcileRemovedParticipantProviderAccess,
} from "./session-participant-provider-access";
import type { LiveKitWebhookEvidence } from "./livekit-egress-provider";

const pendingStatuses = ["PENDING", "BLOCKED", "FAILED"] as const;

/** Membership and participant rows are the durable desired state. Provider
 * status is retry state, not a second authorization system. Never remove a
 * participant row, recording, consent, or authored work to disconnect a call. */
export async function reconcileSessionParticipantAccess(input: {
  participantId: string;
  actorUserId?: string;
  prisma?: PrismaClient;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const participant = await prisma.callParticipant.findUnique({
    where: { id: input.participantId },
    include: {
      room: { select: { id: true, provider: true, providerRoomId: true } },
      user: {
        select: {
          id: true,
          primaryEmail: true,
          roles: { select: { role: true } },
        },
      },
    },
  });
  if (!participant) return { status: "NOT_REQUIRED" as const };
  const actor = {
    id: participant.user?.id ?? "",
    primaryEmail: participant.user?.primaryEmail,
    isStaff: canAccessStudio(participant.user?.roles.map(({ role }) => role)),
  };
  const allowed = () =>
    prisma.callRoom.findFirst({
      where: sessionJoinAccessWhere(participant.roomId, actor),
      select: { id: true },
    });
  if (await allowed()) {
    // Restoration cancels retries. It does not silently rejoin any device.
    const stillAllowed = await prisma.$transaction(
      async (tx) => {
        if (
          !(await tx.callRoom.findFirst({
            where: sessionJoinAccessWhere(participant.roomId, actor),
            select: { id: true },
          }))
        )
          return false;
        await tx.callParticipant.updateMany({
          where: {
            id: participant.id,
            accessRevision: participant.accessRevision,
            providerAccessStatus: { in: [...pendingStatuses] },
          },
          data: {
            providerAccessStatus: "NOT_REQUIRED",
            providerAccessErrorCode: null,
          },
        });
        return true;
      },
      { isolationLevel: "Serializable" },
    );
    if (stillAllowed) return { status: "NOT_REQUIRED" as const };
  }
  const grants = await prisma.callParticipantProviderGrantReceipt.findMany({
    where: {
      participantId: participant.id,
      providerRoomId: participant.room.providerRoomId ?? "",
    },
    distinct: ["providerIdentity"],
    orderBy: { expiresAt: "desc" },
    select: { providerIdentity: true, expiresAt: true },
  });
  // Keep expired receipts: the provider can have refreshed a connected token.
  const outcome = await reconcileRemovedParticipantProviderAccess({
    provider: participant.room.provider,
    providerRoomId: participant.room.providerRoomId,
    participantId: participant.id,
    grants,
  });
  await prisma.$transaction(
    async (tx) => {
      const current = await tx.callParticipant.findUnique({
        where: { id: participant.id },
      });
      if (!current || current.accessRevision !== participant.accessRevision)
        return;
      // A provider request cannot be atomic with PostgreSQL. A concurrent restore
      // may need one rejoin, but its canonical access must never be overwritten.
      if (
        await tx.callRoom.findFirst({
          where: sessionJoinAccessWhere(participant.roomId, actor),
          select: { id: true },
        })
      )
        return;
      await tx.callParticipant.update({
        where: { id: participant.id },
        data: {
          providerAccessStatus: outcome.status,
          providerAccessErrorCode: outcome.errorCode,
          providerAccessReconciledAt:
            outcome.status === "CONVERGED" || outcome.status === "NOT_REQUIRED"
              ? new Date()
              : null,
        },
      });
      await tx.callParticipantAccessReceipt.create({
        data: {
          requestId: randomUUID(),
          roomId: participant.roomId,
          participantId: participant.id,
          actorUserId: input.actorUserId ?? null,
          action: "PROVIDER_RECONCILE",
          accessStatusBefore: participant.accessStatus,
          accessStatusAfter: participant.accessStatus,
          accessRevision: participant.accessRevision,
          providerStatus: outcome.status,
          providerRoomId: outcome.providerRoomId,
          providerIdentityCount: outcome.identityCount,
          providerOutcomeJson: { ...outcome, cause: "CURRENT_SESSION_ACCESS" },
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  return outcome;
}

export async function reconcileCoachingMemberCalls(input: {
  engagementId: string;
  userId: string;
  actorUserId?: string;
  prisma?: PrismaClient;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const participants = await prisma.callParticipant.findMany({
    where: {
      userId: input.userId,
      room: { coachingEngagementId: input.engagementId, provider: "livekit" },
      providerAccessStatus: { in: [...pendingStatuses] },
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
    select: { id: true },
  });
  let pending = false;
  const deadline = Date.now() + 8_000;
  for (const participant of participants) {
    if (Date.now() >= deadline) {
      pending = true;
      break;
    }
    try {
      const outcome = await reconcileSessionParticipantAccess({
        ...input,
        participantId: participant.id,
        prisma,
      });
      if (outcome.status === "FAILED" || outcome.status === "BLOCKED") {
        pending = true;
        break;
      }
    } catch {
      // The committed PENDING state survives request/process failure. The
      // maintenance runner will retry without replaying the membership change.
      pending = true;
      break;
    }
  }
  const remaining = await prisma.callParticipant.count({
    where: {
      userId: input.userId,
      room: { coachingEngagementId: input.engagementId, provider: "livekit" },
      providerAccessStatus: { in: [...pendingStatuses] },
    },
  });
  return {
    pending: pending || remaining > 0,
    checkedParticipants: participants.length,
  };
}

/** Periodic backstop also checks live rooms, catching missed join webhooks and
 * self-hosted token reuse after an earlier successful disconnection. */
export async function reconcileLiveSessionAccess(
  input: { prisma?: PrismaClient; limit?: number } = {},
) {
  const prisma = input.prisma ?? getPrismaClient();
  const admin = liveKitAccessAdmin();
  if (!admin) throw new Error("LIVEKIT_ADMIN_NOT_CONFIGURED");
  const activeRooms = await admin.listRooms();
  const activeNames = activeRooms.map((room) => room.name);
  const removedMembers = activeNames.length
    ? await prisma.coachingEngagementMember.findMany({
        where: {
          status: "REMOVED",
          engagement: {
            callRooms: {
              some: {
                provider: "livekit",
                providerRoomId: { in: activeNames },
              },
            },
          },
        },
        select: { userId: true, engagementId: true },
      })
    : [];
  const candidates: Prisma.CallParticipantWhereInput[] = [
    { providerAccessStatus: { in: [...pendingStatuses] } },
    { accessStatus: "REMOVED", room: { providerRoomId: { in: activeNames } } },
    ...removedMembers.map((member) => ({
      userId: member.userId,
      room: {
        coachingEngagementId: member.engagementId,
        providerRoomId: { in: activeNames },
      },
    })),
  ];
  const participants = await prisma.callParticipant.findMany({
    where: { room: { provider: "livekit" }, OR: candidates },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(100, input.limit ?? 100)),
    select: { id: true },
  });
  let failed = 0;
  let checkedParticipants = 0;
  const deadline = Date.now() + 40_000;
  for (const participant of participants) {
    if (Date.now() >= deadline) break;
    checkedParticipants += 1;
    try {
      const outcome = await reconcileSessionParticipantAccess({
        prisma,
        participantId: participant.id,
      });
      if (outcome.status === "FAILED" || outcome.status === "BLOCKED")
        failed += 1;
    } catch {
      failed += 1;
    }
  }
  return {
    checkedParticipants,
    failed,
    deferred: participants.length - checkedParticipants,
  };
}

export async function reconcileLiveKitParticipantJoin(
  evidence: LiveKitWebhookEvidence,
  prisma = getPrismaClient(),
) {
  if (evidence.eventType !== "participant_joined") return null;
  const room = evidence.raw.room as { name?: unknown } | undefined;
  const participant = evidence.raw.participant as
    | { identity?: unknown }
    | undefined;
  if (
    typeof room?.name !== "string" ||
    typeof participant?.identity !== "string"
  ) {
    throw new Error("LIVEKIT_JOIN_EVENT_MISSING_IDENTITY");
  }
  const canonical = await prisma.callParticipant.findFirst({
    where: {
      id: participant.identity.split(":")[0],
      room: { provider: "livekit", providerRoomId: room.name },
    },
    select: { id: true },
  });
  if (!canonical) return { status: "NOT_REQUIRED" as const };
  return reconcileSessionParticipantAccess({
    participantId: canonical.id,
    prisma,
  });
}
