import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionInvitationAccessWhere } from "@/lib/server/session-access";
import {
  createSessionInvitationToken,
  sessionInvitationExpiry,
  sessionInvitationRole,
} from "@/lib/server/session-invitation";
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
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function invitationRow(row: any) {
  const expired = row.status === "PENDING" && row.expiresAt.getTime() <= Date.now();
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
  };
}

async function authorizedRoom(request: Request, roomId: string) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return { error: privateJson({ ok: false, code: "AUTH_REQUIRED", error: "Sign in before managing Session invitations." }, 401) };
  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(roomId, session.user),
    select: { id: true, title: true, purpose: true, status: true },
  });
  if (!room) return { error: privateJson({ ok: false, code: "NOT_FOUND", error: "This Session is not available for invitation management." }, 404) };
  return { prisma, room, actor: session.user };
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  const invitations = await access.prisma.callRoomInvitation.findMany({
    where: { roomId: access.room.id },
    orderBy: { createdAt: "desc" },
  });
  return privateJson({
    ok: true,
    room: { id: access.room.id, title: access.room.title, purpose: String(access.room.purpose) },
    invitations: invitations.map(invitationRow),
    boundaries: {
      sessionScoped: true,
      grantsNestAccess: false,
      emailBound: true,
      expiring: true,
      linkReturnedOnlyWhenCreated: true,
      emailSent: false,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  if (!["PLANNED", "OPEN", "RECORDING"].includes(String(access.room.status))) {
    return privateJson({ ok: false, code: "SESSION_NOT_JOINABLE", error: "This Session is not open for new participants." }, 409);
  }
  const input = await body(request);
  const email = normalizeEmail(text(input.email));
  const displayName = text(input.displayName, 160) || null;
  const role = sessionInvitationRole(input.role, access.room.purpose);
  if (!email || !email.includes("@")) {
    return privateJson({ ok: false, code: "EMAIL_REQUIRED", error: "Enter the participant email that must accept this invitation." }, 400);
  }
  const currentParticipant = await access.prisma.callParticipant.findFirst({
    where: { roomId: access.room.id, email, userId: { not: null } },
    select: { id: true },
  });
  if (currentParticipant) {
    return privateJson({ ok: false, code: "ALREADY_PARTICIPANT", error: "That email is already connected to this Session." }, 409);
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
        delivery: "copy-or-system-share",
        externalMessageSent: false,
        grantsNestAccess: false,
      },
    },
    update: {
      displayName,
      role,
      status: "PENDING",
      tokenHash,
      expiresAt,
      acceptedAt: null,
      acceptedByUserId: null,
      participantId: null,
      participantCreated: false,
      revokedAt: null,
      createdByUserId: access.actor.id,
      metadataJson: {
        source: "nest-session-live-room",
        delivery: "copy-or-system-share",
        externalMessageSent: false,
        grantsNestAccess: false,
        regenerated: true,
      },
    },
  });
  const invitePath = `/sessions/join?token=${encodeURIComponent(token)}`;
  return privateJson({
    ok: true,
    invitation: invitationRow(invitation),
    invitePath,
    boundaries: {
      sessionScoped: true,
      grantsNestAccess: false,
      emailBound: true,
      expiresAt: expiresAt.toISOString(),
      oneTimeToken: true,
      emailSent: false,
      recordingStarted: false,
      providerJoined: false,
    },
  }, 201);
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const access = await authorizedRoom(request, text(roomId, 240));
  if (access.error) return access.error;
  const input = await body(request);
  const invitationId = text(input.invitationId, 240);
  if (!invitationId) return privateJson({ ok: false, code: "INVITATION_REQUIRED", error: "Choose a pending invitation link to revoke." }, 400);
  const updated = await access.prisma.callRoomInvitation.updateMany({
    where: { id: invitationId, roomId: access.room.id, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date(), tokenHash: null },
  });
  if (updated.count !== 1) {
    return privateJson({ ok: false, code: "INVITATION_NOT_PENDING", error: "Only a still-pending invitation link can be revoked here." }, 409);
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
