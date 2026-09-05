import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { recordQuipslyProductOutcome } from "@/lib/server/product-event";
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

/**
 * Creates the same opaque bearer token for the same still-pending invitation.
 *
 * The database continues to store only the token HMAC. Reconstructing the
 * token lets email, Copy, and Share all use one valid link without persisting
 * the bearer credential or silently invalidating an invitation that is
 * already in the client's inbox.
 */
export function replayableSessionInvitationToken(input: {
  roomId: string;
  email: string;
  expiresAt: Date;
}) {
  const email = normalizeEmail(input.email);
  const signature = createHmac("sha256", invitationSecret())
    .update("quipsly-session-invitation-replayable-v1:")
    .update(input.roomId)
    .update(":")
    .update(email)
    .update(":")
    .update(input.expiresAt.toISOString())
    .digest("base64url");
  const token = `qsinv_${signature}`;
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
  const tokenHash = hashSessionInvitationToken(token);
  const invite = await prisma.callRoomInvitation.findFirst({
    where: { OR: [{ tokenHash }, { acceptedTokenHash: tokenHash }] },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedByUserId: true,
      participant: {
        select: {
          id: true,
          userId: true,
          accessStatus: true,
        },
      },
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
    reentryAvailable: invite.status === "ACCEPTED"
      && invite.participant?.accessStatus === "ACTIVE",
    acceptedByUserId: invite.acceptedByUserId,
    participant: invite.participant
      ? {
          id: invite.participant.id,
          userId: invite.participant.userId,
          accessStatus: String(invite.participant.accessStatus),
        }
      : null,
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

/**
 * Treats a still-pending Session link as narrow proof that the caller can
 * access the mailbox it was delivered to. This does not claim the invitation
 * or create any Quipsly identity or access; acceptance remains a separate,
 * transactional step after a verified server session exists.
 */
export async function verifySessionInvitationMailboxProof(input: {
  token: unknown;
  email: unknown;
}) {
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  if (!email || !cleanSessionInvitationToken(input.token)) return false;
  const invitation = await inspectSessionInvitation(input.token);
  return Boolean(
    invitation?.available
    && invitation.status === "PENDING"
    && invitation.recipientEmail === email,
  );
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
  const invite = await prisma.callRoomInvitation.findFirst({
    where: { OR: [{ tokenHash }, { acceptedTokenHash: tokenHash }] },
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
  if (invite.status === "ACCEPTED" && invite.acceptedTokenHash === tokenHash) {
    if (invite.acceptedByUserId !== input.actor.id || !invite.participantId) {
      throw new SessionInvitationError(
        "INVITATION_EMAIL_MISMATCH",
        "Sign in with the account that accepted this invitation.",
        403,
      );
    }
    const participant = await prisma.callParticipant.findUnique({
      where: { id: invite.participantId },
    });
    if (!participant || participant.userId !== input.actor.id || participant.accessStatus !== "ACTIVE") {
      throw new SessionInvitationError(
        "PARTICIPANT_ACCESS_REMOVED",
        "Your access to this Session is no longer active. Ask the host to restore it.",
        403,
      );
    }
    return {
      roomId: invite.room.id,
      roomTitle: invite.room.title || "Quipsly Session",
      purpose: String(invite.room.purpose),
      participantId: participant.id,
      participantRole: String(participant.role),
      participantCreated: false,
    };
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

  const accepted = await prisma.$transaction(async (tx) => {
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
        acceptedTokenHash: tokenHash,
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
  await recordQuipslyProductOutcome({
    prisma,
    userId: input.actor.id,
    eventName: "invitation_accepted",
    parameters: {
      workflow: String(invite.room.purpose).toUpperCase() === "COACHING"
        ? "coaching"
        : String(invite.room.purpose).toUpperCase() === "PODCAST"
          ? "podcast"
          : "unknown",
      participant_role: String(accepted.participantRole).toUpperCase() === "CLIENT"
        ? "client"
        : "guest",
      method: "link",
      result: "success",
    },
  });
  return accepted;
}
