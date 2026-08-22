import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionInvitationAccessWhere } from "@/lib/server/session-access";
import { projectSessionCollaborationActivity } from "@/lib/server/session-collaboration-activity";
import {
  createSessionInvitationToken,
  sessionInvitationExpiry,
  sessionInvitationRole,
} from "@/lib/server/session-invitation";
import {
  sendSessionInvitationEmail,
  sessionInvitationEmailReadiness,
  sessionInvitationJoinUrl,
} from "@/lib/server/session-invitation-email";
import { normalizeEmail } from "@/lib/server/studio-user-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function body(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function invitationRow(row: any) {
  const expired =
    row.status === "PENDING" && row.expiresAt.getTime() <= Date.now();
  const participant = row.participant
    ? {
        id: row.participant.id,
        accessStatus: String(row.participant.accessStatus || "ACTIVE"),
        accessRevision: Number(row.participant.accessRevision || 0),
        providerAccessStatus: String(
          row.participant.providerAccessStatus || "NOT_REQUIRED",
        ),
        providerAccessErrorCode:
          row.participant.providerAccessErrorCode || null,
      }
    : null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: String(row.role),
    status: expired ? "EXPIRED" : String(row.status),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    canRevokeLink: row.status === "PENDING" && !expired,
    participant,
    canRemoveParticipant:
      row.status === "ACCEPTED" &&
      row.participantCreated === true &&
      participant?.accessStatus === "ACTIVE",
    canRestoreParticipant:
      row.status === "ACCEPTED" &&
      row.participantCreated === true &&
      participant?.accessStatus === "REMOVED" &&
      ["CONVERGED", "NOT_REQUIRED"].includes(participant.providerAccessStatus),
    canReconcileProvider:
      row.status === "ACCEPTED" &&
      row.participantCreated === true &&
      participant?.accessStatus === "REMOVED" &&
      ["BLOCKED", "FAILED"].includes(participant.providerAccessStatus),
    delivery: row.deliveries?.[0]
      ? {
          id: row.deliveries[0].id,
          channel: row.deliveries[0].channel,
          status: String(row.deliveries[0].status),
          requestedAt: row.deliveries[0].requestedAt.toISOString(),
          completedAt: row.deliveries[0].completedAt?.toISOString() ?? null,
          errorCode: row.deliveries[0].errorCode || null,
          errorMessage: row.deliveries[0].errorMessage || null,
        }
      : null,
  };
}

function deliveryRow(row: any) {
  return {
    id: row.id,
    channel: row.channel,
    status: String(row.status),
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorCode: row.errorCode || null,
    errorMessage: row.errorMessage || null,
  };
}

async function authorizedRoom(request: Request, roomId: string) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return {
      error: privateJson(
        {
          ok: false,
          code: "AUTH_REQUIRED",
          error: "Sign in before managing Session invitations.",
        },
        401,
      ),
    };
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(roomId, session.user),
    select: {
      id: true,
      title: true,
      purpose: true,
      status: true,
      scheduledStart: true,
      createdByUser: { select: { name: true } },
    },
  });
  if (!room)
    return {
      error: privateJson(
        {
          ok: false,
          code: "NOT_FOUND",
          error: "This Session is not available for invitation management.",
        },
        404,
      ),
    };
  return { prisma, room, actor: session.user };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  const now = new Date();
  const [invitations, accessReceipts, providerGrants] = await Promise.all([
    access.prisma.callRoomInvitation.findMany({
      where: { roomId: access.room.id },
      orderBy: { createdAt: "desc" },
      include: {
        participant: {
          select: {
            id: true,
            accessStatus: true,
            accessRevision: true,
            providerAccessStatus: true,
            providerAccessErrorCode: true,
          },
        },
        createdBy: { select: { name: true, primaryEmail: true } },
        acceptedBy: { select: { name: true, primaryEmail: true } },
        deliveries: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    access.prisma.callParticipantAccessReceipt.findMany({
      where: { roomId: access.room.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        providerStatus: true,
        createdAt: true,
        actor: { select: { name: true, primaryEmail: true } },
        participant: { select: { displayName: true, email: true } },
      },
    }),
    access.prisma.callParticipantProviderGrantReceipt.findMany({
      where: { roomId: access.room.id, expiresAt: { gt: now } },
      orderBy: { issuedAt: "desc" },
      take: 100,
      select: {
        id: true,
        participantId: true,
        clientInstanceId: true,
        clientKind: true,
        deviceLabel: true,
        issuedAt: true,
        expiresAt: true,
        participant: { select: { displayName: true, email: true } },
      },
    }),
  ]);
  const collaboration = projectSessionCollaborationActivity({
    invitations,
    accessReceipts,
    providerGrants,
    now,
  });
  return privateJson({
    ok: true,
    deliveryCapabilities: {
      email: sessionInvitationEmailReadiness(request.url),
      privateLink: { available: true },
    },
    room: {
      id: access.room.id,
      title: access.room.title,
      purpose: String(access.room.purpose),
    },
    invitations: invitations.map(invitationRow),
    collaboration,
    boundaries: {
      sessionScoped: true,
      grantsNestAccess: false,
      emailBound: true,
      expiring: true,
      linkReturnedOnlyWhenCreated: true,
      emailDeliveryRecorded: true,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  if (!["PLANNED", "OPEN", "RECORDING"].includes(String(access.room.status))) {
    return privateJson(
      {
        ok: false,
        code: "SESSION_NOT_JOINABLE",
        error: "This Session is not open for new participants.",
      },
      409,
    );
  }
  const input = await body(request);
  const email = normalizeEmail(text(input.email));
  const displayName = text(input.displayName, 160) || null;
  const role = sessionInvitationRole(input.role, access.room.purpose);
  const delivery =
    text(input.delivery, 32).toUpperCase() === "EMAIL" ? "EMAIL" : "LINK";
  const requestId = text(input.requestId, 120);
  if (!email || !email.includes("@")) {
    return privateJson(
      {
        ok: false,
        code: "EMAIL_REQUIRED",
        error: "Enter the participant email that must accept this invitation.",
      },
      400,
    );
  }
  if (
    delivery === "EMAIL" &&
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(requestId)
  ) {
    return privateJson(
      {
        ok: false,
        code: "DELIVERY_REQUEST_ID_REQUIRED",
        error:
          "Create a fresh delivery request before sending this invitation.",
      },
      400,
    );
  }
  if (delivery === "EMAIL") {
    const existingDelivery =
      await access.prisma.callRoomInvitationDeliveryReceipt.findFirst({
        where: { requestId, invitation: { roomId: access.room.id } },
        include: {
          invitation: {
            include: {
              deliveries: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      });
    if (existingDelivery) {
      return privateJson({
        ok: true,
        deliveryCapabilities: {
          email: sessionInvitationEmailReadiness(request.url),
          privateLink: { available: true },
        },
        invitation: invitationRow(existingDelivery.invitation),
        invitePath: null,
        delivery: deliveryRow(existingDelivery),
        boundaries: {
          sessionScoped: true,
          grantsNestAccess: false,
          emailBound: true,
          pendingAcceptanceSingleClaim: true,
          acceptedReentryRequiresCanonicalAccess: true,
          emailSent: existingDelivery.status === "SENT",
          idempotentReplay: true,
          recordingStarted: false,
          providerJoined: false,
        },
      });
    }
  }
  const currentParticipant = await access.prisma.callParticipant.findFirst({
    where: { roomId: access.room.id, email, userId: { not: null } },
    select: { id: true, accessStatus: true },
  });
  if (currentParticipant?.accessStatus === "REMOVED") {
    return privateJson(
      {
        ok: false,
        code: "PARTICIPANT_ACCESS_REMOVED",
        error:
          "That participant was removed from this Session. Restore the existing access record instead of creating another identity.",
      },
      409,
    );
  }

  const { token, tokenHash } = createSessionInvitationToken();
  const expiresAt = sessionInvitationExpiry(input.expiresInHours);
  const invitation = await access.prisma.callRoomInvitation.upsert({
    where: { roomId_email: { roomId: access.room.id, email } },
    create: {
      roomId: access.room.id,
      email,
      displayName,
      role,
      tokenHash,
      expiresAt,
      createdByUserId: access.actor.id,
      metadataJson: {
        source: "nest-session-live-room",
        delivery,
        deliveryReceiptIsCanonical: true,
        grantsNestAccess: false,
      },
    },
    update: {
      displayName,
      role,
      status: "PENDING",
      tokenHash,
      acceptedTokenHash: null,
      expiresAt,
      acceptedAt: null,
      acceptedByUserId: null,
      participantId: null,
      participantCreated: false,
      revokedAt: null,
      createdByUserId: access.actor.id,
      metadataJson: {
        source: "nest-session-live-room",
        delivery,
        deliveryReceiptIsCanonical: true,
        grantsNestAccess: false,
        regenerated: true,
      },
    },
  });
  const invitePath = `/sessions/join?token=${encodeURIComponent(token)}`;
  let deliveryReceipt: any = null;
  if (delivery === "EMAIL") {
    deliveryReceipt =
      await access.prisma.callRoomInvitationDeliveryReceipt.create({
        data: {
          invitationId: invitation.id,
          requestId,
          channel: "EMAIL",
          status: "PENDING",
          recipientEmail: email,
          provider: "resend",
          requestedByUserId: access.actor.id,
        },
      });
    const deliveryResult = await sendSessionInvitationEmail({
      recipientEmail: email,
      recipientName: displayName,
      hostName: access.room.createdByUser?.name || access.actor.name,
      roomTitle: access.room.title || "Quipsly Session",
      scheduledStart: access.room.scheduledStart,
      joinUrl: sessionInvitationJoinUrl({
        requestUrl: request.url,
        invitePath,
      }),
      idempotencyKey: `session-invitation/${deliveryReceipt.id}`,
    });
    deliveryReceipt =
      await access.prisma.callRoomInvitationDeliveryReceipt.update({
        where: { id: deliveryReceipt.id },
        data: deliveryResult.ok
          ? {
              status: "SENT",
              providerMessageId: deliveryResult.providerMessageId,
              completedAt: new Date(),
              errorCode: null,
              errorMessage: null,
            }
          : {
              status: "FAILED",
              completedAt: new Date(),
              errorCode: deliveryResult.code,
              errorMessage: deliveryResult.message,
            },
      });
  }
  return privateJson(
    {
      ok: true,
      deliveryCapabilities: {
        email: sessionInvitationEmailReadiness(request.url),
        privateLink: { available: true },
      },
      invitation: invitationRow(invitation),
      invitePath,
      delivery: deliveryReceipt ? deliveryRow(deliveryReceipt) : null,
      boundaries: {
        sessionScoped: true,
        grantsNestAccess: false,
        emailBound: true,
        expiresAt: expiresAt.toISOString(),
        pendingAcceptanceSingleClaim: true,
        acceptedReentryRequiresCanonicalAccess: true,
        emailSent: deliveryReceipt?.status === "SENT",
        recordingStarted: false,
        providerJoined: false,
      },
    },
    201,
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  const input = await body(request);
  const invitationId = text(input.invitationId, 240);
  if (!invitationId)
    return privateJson(
      {
        ok: false,
        code: "INVITATION_REQUIRED",
        error: "Choose a pending invitation link to revoke.",
      },
      400,
    );
  const updated = await access.prisma.callRoomInvitation.updateMany({
    where: { id: invitationId, roomId: access.room.id, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date(), tokenHash: null },
  });
  if (updated.count !== 1) {
    return privateJson(
      {
        ok: false,
        code: "INVITATION_NOT_PENDING",
        error: "Only a still-pending invitation link can be revoked here.",
      },
      409,
    );
  }
  return privateJson({
    ok: true,
    invitationId,
    boundaries: {
      pendingLinkRevoked: true,
      participantRemoved: false,
      providerConnectionChanged: false,
      externalMessageSent: false,
    },
  });
}
