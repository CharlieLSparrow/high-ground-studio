import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { canAccessStudio } from "@/lib/studio-authz";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionInvitationAccessWhere } from "@/lib/server/session-access";
import { reconcileRemovedParticipantProviderAccess } from "@/lib/server/session-participant-provider-access";
import { normalizeEmail } from "@/lib/server/studio-user-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccessAction = "REMOVE" | "RESTORE" | "RECONCILE";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

function text(value: unknown, max = 320) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown) {
  const candidate = text(value, 64).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    candidate,
  )
    ? candidate
    : "";
}

async function requestBody(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function participantRow(participant: any) {
  return {
    id: participant.id,
    displayName: participant.displayName,
    email: participant.email,
    role: String(participant.role),
    accessStatus: String(participant.accessStatus || "ACTIVE"),
    accessRevision: Number(participant.accessRevision || 0),
    accessChangedAt: participant.accessChangedAt?.toISOString?.() ?? null,
    providerAccessStatus: String(
      participant.providerAccessStatus || "NOT_REQUIRED",
    ),
    providerAccessReconciledAt:
      participant.providerAccessReconciledAt?.toISOString?.() ?? null,
    providerAccessErrorCode: participant.providerAccessErrorCode || null,
  };
}

function residualAccessReasons(room: any, participant: any) {
  const reasons: string[] = [];
  const user = participant.user;
  if (!user) return reasons;
  if (room.createdByUserId === user.id) reasons.push("SESSION_CREATOR");
  if (room.booking?.coachUserId === user.id) reasons.push("BOOKED_COACH");
  if (room.booking?.clientUserId === user.id) reasons.push("BOOKED_CLIENT");
  if (canAccessStudio((user.roles || []).map((entry: any) => entry.role)))
    reasons.push("STAFF_ROLE");
  const email = normalizeEmail(user.primaryEmail || participant.email || "");
  if (
    email &&
    (room.project?.accessGrants || []).some(
      (grant: any) =>
        normalizeEmail(grant.email) === email && grant.status === "ACTIVE",
    )
  )
    reasons.push("ACTIVE_PROJECT_GRANT");
  return [...new Set(reasons)];
}

async function loadAuthorizedBoundary(
  request: Request,
  roomId: string,
  participantId: string,
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return {
      error: privateJson(
        {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Sign in before changing Session participant access.",
        },
        401,
      ),
    };
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(roomId, session.user),
    select: {
      id: true,
      title: true,
      purpose: true,
      provider: true,
      providerRoomId: true,
      createdByUserId: true,
      booking: { select: { coachUserId: true, clientUserId: true } },
      project: {
        select: {
          accessGrants: { select: { email: true, status: true } },
        },
      },
    },
  });
  if (!room)
    return {
      error: privateJson(
        {
          ok: false,
          code: "NOT_FOUND",
          error:
            "This Session is not available for participant access management.",
        },
        404,
      ),
    };
  const participant = await prisma.callParticipant.findFirst({
    where: { id: participantId, roomId: room.id },
    include: {
      user: { include: { roles: true } },
      acceptedInvitations: {
        where: { roomId: room.id, status: "ACCEPTED" },
        select: { id: true, participantCreated: true },
      },
    },
  });
  if (!participant)
    return {
      error: privateJson(
        {
          ok: false,
          code: "PARTICIPANT_NOT_FOUND",
          error: "That participant is not part of this Session.",
        },
        404,
      ),
    };
  return { prisma, room, participant, actor: session.user };
}

async function appendProviderOutcome(input: {
  prisma: any;
  room: any;
  participantId: string;
  actorUserId: string;
  accessRevision: number;
}) {
  const now = new Date();
  const grants =
    await input.prisma.callParticipantProviderGrantReceipt.findMany({
      where: {
        participantId: input.participantId,
        expiresAt: { gt: now },
      },
      select: { providerIdentity: true, expiresAt: true },
    });
  const outcome = await reconcileRemovedParticipantProviderAccess({
    provider: input.room.provider,
    providerRoomId: input.room.providerRoomId,
    participantId: input.participantId,
    grants,
    now,
  });
  const participant = await input.prisma.$transaction(async (tx: any) => {
    const guarded = await tx.callParticipant.updateMany({
      where: {
        id: input.participantId,
        roomId: input.room.id,
        accessStatus: "REMOVED",
        accessRevision: input.accessRevision,
        providerAccessStatus: "PENDING",
      },
      data: {
        providerAccessStatus: outcome.status,
        providerAccessReconciledAt:
          outcome.status === "CONVERGED" || outcome.status === "NOT_REQUIRED"
            ? now
            : null,
        providerAccessErrorCode: outcome.errorCode,
      },
    });
    if (guarded.count !== 1) {
      throw new Error("PARTICIPANT_ACCESS_CHANGED_DURING_RECONCILIATION");
    }
    await tx.callParticipantAccessReceipt.create({
      data: {
        requestId: randomUUID(),
        roomId: input.room.id,
        participantId: input.participantId,
        actorUserId: input.actorUserId,
        action: "PROVIDER_RECONCILE",
        accessStatusBefore: "REMOVED",
        accessStatusAfter: "REMOVED",
        accessRevision: input.accessRevision,
        providerStatus: outcome.status,
        providerRoomId: outcome.providerRoomId,
        providerIdentityCount: outcome.identityCount,
        providerOutcomeJson: {
          removedIdentityCount: outcome.removedIdentityCount,
          activeIdentityCountAfter: outcome.activeIdentityCountAfter,
          tokenRevocationGuaranteed: outcome.tokenRevocationGuaranteed,
          latestGrantExpiry: outcome.latestGrantExpiry,
          errorCode: outcome.errorCode,
        },
      },
    });
    return tx.callParticipant.findUnique({
      where: { id: input.participantId },
    });
  });
  return { participant, outcome };
}

async function postParticipantAccess(
  request: Request,
  context: { params: Promise<{ roomId: string; participantId: string }> },
) {
  const [{ roomId, participantId }, input] = await Promise.all([
    context.params,
    requestBody(request),
  ]);
  const normalizedRoomId = text(roomId, 240);
  const normalizedParticipantId = text(participantId, 240);
  const access = await loadAuthorizedBoundary(
    request,
    normalizedRoomId,
    normalizedParticipantId,
  );
  if (access.error) return access.error;

  const action = text(input.action, 24).toUpperCase() as AccessAction;
  const requestId = uuid(input.requestId);
  const expectedRevision = Number(input.expectedRevision);
  const reason = text(input.reason, 500) || null;
  if (!requestId)
    return privateJson(
      {
        ok: false,
        code: "REQUEST_ID_REQUIRED",
        error:
          "Participant access changes require one stable UUID request identity.",
      },
      400,
    );
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
    return privateJson(
      {
        ok: false,
        code: "REVISION_REQUIRED",
        error: "Refresh participant access before changing it.",
      },
      400,
    );
  if (!(["REMOVE", "RESTORE", "RECONCILE"] as string[]).includes(action))
    return privateJson(
      {
        ok: false,
        code: "ACTION_REQUIRED",
        error: "Choose remove, restore, or reconcile.",
      },
      400,
    );

  const priorReceipt =
    await access.prisma.callParticipantAccessReceipt.findUnique({
      where: { requestId },
    });
  if (priorReceipt) {
    if (
      priorReceipt.roomId !== access.room.id ||
      priorReceipt.participantId !== access.participant.id ||
      priorReceipt.actorUserId !== access.actor.id ||
      String(priorReceipt.action) !== action
    ) {
      return privateJson(
        {
          ok: false,
          code: "REQUEST_ID_CONFLICT",
          error:
            "That request identity belongs to another participant access operation.",
        },
        409,
      );
    }
    const current = await access.prisma.callParticipant.findUnique({
      where: { id: access.participant.id },
    });
    return privateJson({
      ok: true,
      replayed: true,
      participant: participantRow(current),
      receiptId: priorReceipt.id,
    });
  }

  if (access.participant.userId === access.actor.id) {
    return privateJson(
      {
        ok: false,
        code: "SELF_REMOVAL_REFUSED",
        error:
          "Use Leave room for your own device. Another authorized host must change your Session access.",
      },
      409,
    );
  }
  const acceptedInvitation = access.participant.acceptedInvitations.find(
    (invitation: any) => invitation.participantCreated,
  );
  if (!acceptedInvitation) {
    return privateJson(
      {
        ok: false,
        code: "NOT_INVITATION_OWNED",
        error:
          "This participant is owned by a booking, project, or another workflow. Change access at that source instead.",
      },
      409,
    );
  }
  const residualReasons = residualAccessReasons(
    access.room,
    access.participant,
  );
  if (residualReasons.length) {
    return privateJson(
      {
        ok: false,
        code: "OTHER_ACCESS_REMAINS",
        error:
          "This person has another active Session access source. Change that source before removing invitation-owned access.",
        residualAccessReasons: residualReasons,
      },
      409,
    );
  }

  if (action === "REMOVE") {
    if (
      access.participant.accessStatus !== "ACTIVE" ||
      access.participant.accessRevision !== expectedRevision
    ) {
      return privateJson(
        {
          ok: false,
          code: "ACCESS_CHANGED",
          error: "Participant access changed. Refresh before removing it.",
        },
        409,
      );
    }
    const nextRevision = expectedRevision + 1;
    const providerStatus =
      String(access.room.provider).toLowerCase() === "livekit" &&
      access.room.providerRoomId
        ? "PENDING"
        : "NOT_REQUIRED";
    const removed = await access.prisma.$transaction(async (tx: any) => {
      const guarded = await tx.callParticipant.updateMany({
        where: {
          id: access.participant.id,
          roomId: access.room.id,
          accessStatus: "ACTIVE",
          accessRevision: expectedRevision,
        },
        data: {
          accessStatus: "REMOVED",
          accessRevision: nextRevision,
          accessChangedAt: new Date(),
          accessChangedByUserId: access.actor.id,
          providerAccessStatus: providerStatus,
          providerAccessReconciledAt:
            providerStatus === "NOT_REQUIRED" ? new Date() : null,
          providerAccessErrorCode: null,
        },
      });
      if (guarded.count !== 1) throw new Error("PARTICIPANT_ACCESS_CONFLICT");
      const receipt = await tx.callParticipantAccessReceipt.create({
        data: {
          requestId,
          roomId: access.room.id,
          participantId: access.participant.id,
          actorUserId: access.actor.id,
          action: "REMOVE",
          accessStatusBefore: "ACTIVE",
          accessStatusAfter: "REMOVED",
          accessRevision: nextRevision,
          reason,
          providerStatus,
          providerRoomId: access.room.providerRoomId,
          providerOutcomeJson: {
            invitationId: acceptedInvitation.id,
            canonicalAccessRemoved: true,
            presenceChanged: false,
            consentHistoryPreserved: true,
          },
        },
      });
      const participant = await tx.callParticipant.findUnique({
        where: { id: access.participant.id },
      });
      return { receipt, participant };
    });
    if (providerStatus === "NOT_REQUIRED") {
      return privateJson({
        ok: true,
        participant: participantRow(removed.participant),
        receiptId: removed.receipt.id,
        boundaries: {
          canonicalAccessRemoved: true,
          providerConverged: true,
          consentHistoryPreserved: true,
          recordingChanged: false,
        },
      });
    }
    const provider = await appendProviderOutcome({
      prisma: access.prisma,
      room: access.room,
      participantId: access.participant.id,
      actorUserId: access.actor.id,
      accessRevision: nextRevision,
    });
    return privateJson({
      ok: true,
      participant: participantRow(provider.participant),
      receiptId: removed.receipt.id,
      provider: provider.outcome,
      boundaries: {
        canonicalAccessRemoved: true,
        providerConverged:
          provider.outcome.status === "CONVERGED" ||
          provider.outcome.status === "NOT_REQUIRED",
        consentHistoryPreserved: true,
        recordingChanged: false,
      },
    });
  }

  if (action === "RESTORE") {
    if (
      access.participant.accessStatus !== "REMOVED" ||
      access.participant.accessRevision !== expectedRevision
    ) {
      return privateJson(
        {
          ok: false,
          code: "ACCESS_CHANGED",
          error: "Participant access changed. Refresh before restoring it.",
        },
        409,
      );
    }
    if (
      !["CONVERGED", "NOT_REQUIRED"].includes(
        String(access.participant.providerAccessStatus),
      )
    ) {
      return privateJson(
        {
          ok: false,
          code: "PROVIDER_RECONCILIATION_REQUIRED",
          error:
            "Reconcile provider removal before restoring access so Quipsly does not hide a still-connected device.",
        },
        409,
      );
    }
    const nextRevision = expectedRevision + 1;
    const restored = await access.prisma.$transaction(async (tx: any) => {
      const guarded = await tx.callParticipant.updateMany({
        where: {
          id: access.participant.id,
          roomId: access.room.id,
          accessStatus: "REMOVED",
          accessRevision: expectedRevision,
          providerAccessStatus: { in: ["CONVERGED", "NOT_REQUIRED"] },
        },
        data: {
          accessStatus: "ACTIVE",
          accessRevision: nextRevision,
          accessChangedAt: new Date(),
          accessChangedByUserId: access.actor.id,
          providerAccessStatus: "NOT_REQUIRED",
          providerAccessReconciledAt: null,
          providerAccessErrorCode: null,
        },
      });
      if (guarded.count !== 1) throw new Error("PARTICIPANT_ACCESS_CONFLICT");
      const receipt = await tx.callParticipantAccessReceipt.create({
        data: {
          requestId,
          roomId: access.room.id,
          participantId: access.participant.id,
          actorUserId: access.actor.id,
          action: "RESTORE",
          accessStatusBefore: "REMOVED",
          accessStatusAfter: "ACTIVE",
          accessRevision: nextRevision,
          reason,
          providerStatus: "NOT_REQUIRED",
          providerRoomId: access.room.providerRoomId,
          providerOutcomeJson: {
            invitationId: acceptedInvitation.id,
            providerJoined: false,
            recordingChanged: false,
          },
        },
      });
      const participant = await tx.callParticipant.findUnique({
        where: { id: access.participant.id },
      });
      return { receipt, participant };
    });
    return privateJson({
      ok: true,
      participant: participantRow(restored.participant),
      receiptId: restored.receipt.id,
      boundaries: {
        canonicalAccessRestored: true,
        providerJoined: false,
        recordingChanged: false,
        consentHistoryPreserved: true,
      },
    });
  }

  if (
    access.participant.accessStatus !== "REMOVED" ||
    access.participant.accessRevision !== expectedRevision
  ) {
    return privateJson(
      {
        ok: false,
        code: "ACCESS_CHANGED",
        error:
          "Only currently removed access can be reconciled with the provider.",
      },
      409,
    );
  }
  if (access.participant.providerAccessStatus === "PENDING") {
    return privateJson(
      {
        ok: false,
        code: "PROVIDER_RECONCILIATION_PENDING",
        error: "Provider reconciliation is already in progress.",
      },
      409,
    );
  }
  await access.prisma.$transaction(async (tx: any) => {
    const guarded = await tx.callParticipant.updateMany({
      where: {
        id: access.participant.id,
        roomId: access.room.id,
        accessStatus: "REMOVED",
        accessRevision: expectedRevision,
        providerAccessStatus: { not: "PENDING" },
      },
      data: { providerAccessStatus: "PENDING", providerAccessErrorCode: null },
    });
    if (guarded.count !== 1) throw new Error("PARTICIPANT_ACCESS_CONFLICT");
    await tx.callParticipantAccessReceipt.create({
      data: {
        requestId,
        roomId: access.room.id,
        participantId: access.participant.id,
        actorUserId: access.actor.id,
        action: "PROVIDER_RECONCILE",
        accessStatusBefore: "REMOVED",
        accessStatusAfter: "REMOVED",
        accessRevision: expectedRevision,
        reason,
        providerStatus: "PENDING",
        providerRoomId: access.room.providerRoomId,
        providerOutcomeJson: { retryRequested: true },
      },
    });
  });
  const provider = await appendProviderOutcome({
    prisma: access.prisma,
    room: access.room,
    participantId: access.participant.id,
    actorUserId: access.actor.id,
    accessRevision: expectedRevision,
  });
  return privateJson({
    ok: true,
    participant: participantRow(provider.participant),
    provider: provider.outcome,
    boundaries: {
      canonicalAccessStillRemoved: true,
      providerConverged:
        provider.outcome.status === "CONVERGED" ||
        provider.outcome.status === "NOT_REQUIRED",
      recordingChanged: false,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string; participantId: string }> },
) {
  try {
    return await postParticipantAccess(request, context);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (
      code === "PARTICIPANT_ACCESS_CONFLICT" ||
      code === "PARTICIPANT_ACCESS_CHANGED_DURING_RECONCILIATION"
    ) {
      return privateJson(
        {
          ok: false,
          code: "ACCESS_CHANGED",
          error:
            "Participant access changed while this request was running. Refresh before trying again.",
        },
        409,
      );
    }
    throw error;
  }
}
