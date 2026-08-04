import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/server/studio-user-identity";

const TOKEN_PATTERN = /^qsinv_[A-Za-z0-9_-]{32,120}$/;
const JOINABLE_ROOM_STATUSES = new Set(["PLANNED", "OPEN", "RECORDING"]);

export const SESSION_INVITATION_ROLES = ["CLIENT", "GUEST", "PRODUCER", "OBSERVER"] as const;
export type SessionInvitationRole = typeof SESSION_INVITATION_ROLES[number];

export class SessionInvitationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SessionInvitationError";
  }
}

function invitationSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new SessionInvitationError(
      "INVITATION_CONFIG_UNAVAILABLE",
      "Session invitations are unavailable until the server auth secret is configured.",
      503,
    );
  }
  return secret;
}

export function cleanSessionInvitationToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  return token.length <= 160 && TOKEN_PATTERN.test(token) ? token : "";
}

export function hashSessionInvitationToken(value: string) {
  const token = cleanSessionInvitationToken(value);
  if (!token) throw new SessionInvitationError("INVALID_INVITATION", "This Session invitation link is invalid.");
  return createHmac("sha256", invitationSecret())
    .update("quipsly-session-invitation:")
    .update(token)
    .digest("hex");
}

export function createSessionInvitationToken() {
  const token = `qsinv_${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashSessionInvitationToken(token) };
}

export function sessionInvitationRole(value: unknown, purpose?: unknown): SessionInvitationRole {
  const role = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (SESSION_INVITATION_ROLES.includes(role as SessionInvitationRole)) return role as SessionInvitationRole;
  return String(purpose || "").toUpperCase() === "COACHING" ? "CLIENT" : "GUEST";
}

export function sessionInvitationExpiry(hours: unknown, now = new Date()) {
  const numeric = Number(hours);
  const boundedHours = Number.isFinite(numeric)
    ? Math.min(24 * 30, Math.max(1, Math.round(numeric)))
    : 24 * 7;
  return new Date(now.getTime() + boundedHours * 60 * 60 * 1_000);
}

export function maskInvitationEmail(value: string) {
  const email = normalizeEmail(value);
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "the invited email";
  return `${local.slice(0, 1)}${"•".repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}`;
}

export async function inspectSessionInvitation(tokenValue: unknown) {
  const token = cleanSessionInvitationToken(tokenValue);
  if (!token) return null;
  const prisma = getPrismaClient();
  const invite = await prisma.callRoomInvitation.findUnique({
    where: { tokenHash: hashSessionInvitationToken(token) },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      expiresAt: true,
      room: {
        select: {
          id: true,
          title: true,
          purpose: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          createdByUser: { select: { name: true } },
        },
      },
    },
  });
  if (!invite) return null;
  const expired = invite.expiresAt.getTime() <= Date.now();
  const available = invite.status === "PENDING"
    && !expired
    && JOINABLE_ROOM_STATUSES.has(String(invite.room.status));
  return {
    id: invite.id,
    recipientEmail: normalizeEmail(invite.email),
    recipientEmailHint: maskInvitationEmail(invite.email),
    displayName: invite.displayName,
    role: String(invite.role),
    status: expired && invite.status === "PENDING" ? "EXPIRED" : String(invite.status),
    expiresAt: invite.expiresAt.toISOString(),
    available,
    room: {
      id: invite.room.id,
      title: invite.room.title || "Quipsly Session",
      purpose: String(invite.room.purpose),
      status: String(invite.room.status),
      scheduledStart: invite.room.scheduledStart?.toISOString() ?? null,
      scheduledEnd: invite.room.scheduledEnd?.toISOString() ?? null,
      hostName: invite.room.createdByUser?.name || null,
    },
  };
}

export async function acceptSessionInvitation(input: {
  token: unknown;
  actor: { id: string; email?: string | null; primaryEmail?: string | null; name?: string | null };
}) {
  const token = cleanSessionInvitationToken(input.token);
  if (!token) throw new SessionInvitationError("INVALID_INVITATION", "This Session invitation link is invalid.");
  const actorEmail = normalizeEmail(input.actor.primaryEmail || input.actor.email || "");
  if (!actorEmail) throw new SessionInvitationError("EMAIL_REQUIRED", "Sign in with the email that received this invitation.", 401);

  const prisma = getPrismaClient();
  const tokenHash = hashSessionInvitationToken(token);
  const invite = await prisma.callRoomInvitation.findUnique({
    where: { tokenHash },
    include: { room: { select: { id: true, title: true, purpose: true, status: true } } },
  });
  if (!invite) throw new SessionInvitationError("INVITATION_NOT_FOUND", "This Session invitation is no longer available.", 404);
  if (normalizeEmail(invite.email) !== actorEmail) {
    throw new SessionInvitationError(
      "INVITATION_EMAIL_MISMATCH",
      `This invitation belongs to ${maskInvitationEmail(invite.email)}. Switch accounts before accepting it.`,
      403,
    );
  }
  if (invite.status !== "PENDING" || invite.revokedAt) {
    throw new SessionInvitationError("INVITATION_NOT_PENDING", "This Session invitation was already accepted or revoked.", 409);
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    await prisma.callRoomInvitation.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "EXPIRED", tokenHash: null },
    });
    throw new SessionInvitationError("INVITATION_EXPIRED", "This Session invitation expired. Ask the host for a new link.", 410);
  }
  if (!JOINABLE_ROOM_STATUSES.has(String(invite.room.status))) {
    throw new SessionInvitationError("SESSION_NOT_JOINABLE", "This Session is no longer open for new participants.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.callRoomInvitation.updateMany({
      where: {
        id: invite.id,
        tokenHash,
        status: "PENDING",
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "ACCEPTED",
        tokenHash: null,
        acceptedAt: new Date(),
        acceptedByUserId: input.actor.id,
      },
    });
    if (claimed.count !== 1) {
      throw new SessionInvitationError("INVITATION_ALREADY_CLAIMED", "This Session invitation was already used.", 409);
    }

    const existing = await tx.callParticipant.findFirst({
      where: {
        roomId: invite.roomId,
        OR: [
          { userId: input.actor.id },
          { userId: null, email: actorEmail },
        ],
      },
    });
    if (existing?.accessStatus === "REMOVED") {
      throw new SessionInvitationError(
        "PARTICIPANT_ACCESS_REMOVED",
        "This participant has a removed Session access record. Ask the host to restore that record instead of accepting another invitation.",
        409,
      );
    }
    const participant = existing
      ? await tx.callParticipant.update({
          where: { id: existing.id },
          data: {
            userId: input.actor.id,
            email: actorEmail,
            displayName: existing.displayName || invite.displayName || input.actor.name || actorEmail,
            role: existing.userId ? existing.role : invite.role,
            leftAt: null,
          },
        })
      : await tx.callParticipant.create({
          data: {
            roomId: invite.roomId,
            userId: input.actor.id,
            email: actorEmail,
            displayName: invite.displayName || input.actor.name || actorEmail,
            role: invite.role,
            deviceLabel: "Accepted Session invitation",
            connectionJson: {
              invitationId: invite.id,
              acceptedVia: "email-bound-session-link",
            },
          },
        });

    await tx.callRoomInvitation.update({
      where: { id: invite.id },
      data: {
        participantId: participant.id,
        participantCreated: !existing,
      },
    });

    return {
      roomId: invite.room.id,
      roomTitle: invite.room.title || "Quipsly Session",
      purpose: String(invite.room.purpose),
      participantId: participant.id,
      participantRole: String(participant.role),
      participantCreated: !existing,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
