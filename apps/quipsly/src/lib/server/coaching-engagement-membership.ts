import "server-only";

import { createHash, createHmac } from "node:crypto";
import type {
  CoachingEngagementMemberRole,
  Prisma,
} from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import {
  coachingEngagementAccessWhere,
} from "@/lib/server/coaching-engagement";
import type { SessionAccessActor } from "@/lib/server/session-access";
import {
  ensureInvitedStudioUserByEmail,
  normalizeEmail,
} from "@/lib/server/studio-user-identity";
import { recordQuipslyProductOutcome } from "@/lib/server/product-event";

const INVITABLE_ROLES = ["CLIENT", "COACH", "SUPPORT", "OBSERVER"] as const;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export class CoachingEngagementMembershipError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | "NOT_FOUND"
      | "INVALID_REQUEST"
      | "REQUEST_CONFLICT"
      | "ACCESS_CHANGED"
      | "ALREADY_MEMBER"
      | "RESTORE_REQUIRED"
      | "INVITATION_PENDING"
      | "INVITATION_UNAVAILABLE"
      | "WRONG_ACCOUNT"
      | "SELF_CHANGE_REFUSED",
  ) {
    super(message);
    this.name = "CoachingEngagementMembershipError";
  }
}

function invitationSecret() {
  const secret = String(
    process.env.QUIPSLY_INVITATION_TOKEN_SECRET
      || process.env.AUTH_SECRET
      || process.env.NEXTAUTH_SECRET
      || "",
  );
  if (secret.length < 32) {
    throw new CoachingEngagementMembershipError(
      "Coaching invitations are unavailable until a 32-character invitation or auth secret is configured.",
      503,
      "INVITATION_UNAVAILABLE",
    );
  }
  return secret;
}

function invitationToken(input: {
  requestId: string;
  engagementId: string;
  invitedUserId: string;
}) {
  return createHmac("sha256", invitationSecret())
    .update("quipsly-coaching-engagement-invitation-v1\0")
    .update(input.requestId)
    .update("\0")
    .update(input.engagementId)
    .update("\0")
    .update(input.invitedUserId)
    .digest("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function role(value: unknown): CoachingEngagementMemberRole {
  const normalized = String(value || "").trim().toUpperCase();
  if ((INVITABLE_ROLES as readonly string[]).includes(normalized)) {
    return normalized as CoachingEngagementMemberRole;
  }
  throw new CoachingEngagementMembershipError(
    "Choose client, coach, support, or observer access.",
    400,
    "INVALID_REQUEST",
  );
}

function receiptMatches(receipt: any, input: {
  engagementId: string;
  actorUserId: string;
  action: string;
  subjectUserId?: string;
  memberId?: string;
  invitationId?: string;
}) {
  return receipt.engagementId === input.engagementId
    && receipt.actorUserId === input.actorUserId
    && String(receipt.action) === input.action
    && (!input.subjectUserId || receipt.subjectUserId === input.subjectUserId)
    && (!input.memberId || receipt.memberId === input.memberId)
    && (!input.invitationId || receipt.invitationId === input.invitationId);
}

function memberProjection(member: any) {
  if (!member) {
    throw new CoachingEngagementMembershipError(
      "The membership receipt exists, but its current membership record is unavailable.",
      409,
      "ACCESS_CHANGED",
    );
  }
  return {
    id: member.id,
    userId: member.userId,
    role: member.role,
    status: member.status,
    accessRevision: member.accessRevision,
    joinedAt: member.joinedAt?.toISOString?.() ?? null,
    removedAt: member.removedAt?.toISOString?.() ?? null,
    accessChangedAt: member.accessChangedAt?.toISOString?.() ?? null,
    user: {
      name: member.user?.name || null,
      email: member.user?.primaryEmail || null,
    },
  };
}

function invitationProjection(invitation: any) {
  if (!invitation) {
    throw new CoachingEngagementMembershipError(
      "The invitation receipt exists, but its invitation record is unavailable.",
      409,
      "ACCESS_CHANGED",
    );
  }
  const expired = invitation.status === "PENDING"
    && invitation.expiresAt.getTime() <= Date.now();
  return {
    id: invitation.id,
    invitedUserId: invitation.invitedUserId,
    invitedEmail: invitation.invitedEmail,
    role: invitation.role,
    status: expired ? "EXPIRED" : invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString?.() ?? null,
    revokedAt: invitation.revokedAt?.toISOString?.() ?? null,
  };
}

export async function loadCoachingEngagementMembershipBoundary(input: {
  engagementId: string;
  actor: SessionAccessActor;
  manage?: boolean;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const engagement = await prisma.coachingEngagement.findFirst({
    where: coachingEngagementAccessWhere(
      input.engagementId,
      input.actor,
      input.manage ? "manage" : "read",
    ),
    select: {
      id: true,
      title: true,
      project: { select: { id: true, name: true, slug: true } },
      members: {
        orderBy: [{ status: "asc" }, { role: "asc" }, { joinedAt: "asc" }],
        include: { user: { select: { name: true, primaryEmail: true } } },
      },
      invitations: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      memberReceipts: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          subject: { select: { name: true, primaryEmail: true } },
          actor: { select: { name: true } },
        },
      },
    },
  });
  if (!engagement) {
    throw new CoachingEngagementMembershipError(
      "This Coaching Engagement is unavailable for membership management.",
      404,
      "NOT_FOUND",
    );
  }
  return {
    engagement: {
      id: engagement.id,
      title: engagement.title,
      project: engagement.project,
    },
    members: engagement.members.map(memberProjection),
    invitations: engagement.invitations.map(invitationProjection),
    receipts: engagement.memberReceipts.map((receipt: any) => ({
      id: receipt.id,
      action: receipt.action,
      subjectLabel: receipt.subject.name || receipt.subject.primaryEmail,
      actorLabel: receipt.actor?.name || "Quipsly operator",
      roleBefore: receipt.roleBefore,
      roleAfter: receipt.roleAfter,
      statusBefore: receipt.statusBefore,
      statusAfter: receipt.statusAfter,
      accessRevision: receipt.accessRevision,
      reason: receipt.reason,
      createdAt: receipt.createdAt.toISOString(),
      outcome: receipt.outcomeJson,
    })),
  };
}

export async function inviteCoachingEngagementMember(input: {
  engagementId: string;
  actor: SessionAccessActor;
  email: string;
  name?: string | null;
  role: unknown;
  requestId: string;
  reason?: string | null;
  origin: string;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const boundary = await loadCoachingEngagementMembershipBoundary({
    engagementId: input.engagementId,
    actor: input.actor,
    manage: true,
    prisma,
  });
  const invitedEmail = normalizeEmail(input.email);
  if (!invitedEmail || !invitedEmail.includes("@")) {
    throw new CoachingEngagementMembershipError(
      "Enter the account email that should receive engagement access.",
      400,
      "INVALID_REQUEST",
    );
  }
  const invitedRole = role(input.role);
  const invitedUser = await ensureInvitedStudioUserByEmail({
    email: invitedEmail,
    name: input.name,
    prisma,
  });
  const existingReceipt = await prisma.coachingEngagementMemberReceipt.findUnique({
    where: { requestId: input.requestId },
    include: { invitation: true },
  });
  if (existingReceipt) {
    if (!receiptMatches(existingReceipt, {
      engagementId: input.engagementId,
      actorUserId: input.actor.id,
      action: "INVITE",
      subjectUserId: invitedUser.id,
    })) {
      throw new CoachingEngagementMembershipError(
        "That request identity belongs to another membership operation.",
        409,
        "REQUEST_CONFLICT",
      );
    }
    const token = invitationToken({
      requestId: input.requestId,
      engagementId: input.engagementId,
      invitedUserId: invitedUser.id,
    });
    return {
      replayed: true,
      invitation: invitationProjection(existingReceipt.invitation),
      invitationPath: `/coaching/engagements/join#token=${encodeURIComponent(token)}`,
      invitationUrl: `${input.origin}/coaching/engagements/join#token=${encodeURIComponent(token)}`,
      delivered: false,
    };
  }

  const existingMember = await prisma.coachingEngagementMember.findUnique({
    where: {
      engagementId_userId: {
        engagementId: input.engagementId,
        userId: invitedUser.id,
      },
    },
  });
  if (existingMember?.status === "ACTIVE") {
    throw new CoachingEngagementMembershipError(
      "That account is already an active member.",
      409,
      "ALREADY_MEMBER",
    );
  }
  if (existingMember?.status === "REMOVED") {
    throw new CoachingEngagementMembershipError(
      "That account was previously removed. Use Restore so the old history remains explicit.",
      409,
      "RESTORE_REQUIRED",
    );
  }
  const pending = await prisma.coachingEngagementInvitation.findFirst({
    where: {
      engagementId: input.engagementId,
      invitedUserId: invitedUser.id,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw new CoachingEngagementMembershipError(
      "A current invitation already exists. Revoke it before creating a replacement link.",
      409,
      "INVITATION_PENDING",
    );
  }

  const token = invitationToken({
    requestId: input.requestId,
    engagementId: input.engagementId,
    invitedUserId: invitedUser.id,
  });
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const invitation = await prisma.$transaction(async (tx: any) => {
    const created = await tx.coachingEngagementInvitation.create({
      data: {
        engagementId: input.engagementId,
        invitedUserId: invitedUser.id,
        invitedEmail,
        role: invitedRole,
        tokenHash: hash,
        expiresAt,
        invitedByUserId: input.actor.id,
        metadataJson: {
          source: "coaching-engagement-member-manager",
          secretInUrlFragment: true,
          externalDeliveryAttempted: false,
          externalSideEffects: false,
        },
      },
    });
    await tx.coachingEngagementMemberReceipt.create({
      data: {
        requestId: input.requestId,
        engagementId: input.engagementId,
        invitationId: created.id,
        subjectUserId: invitedUser.id,
        actorUserId: input.actor.id,
        action: "INVITE",
        roleAfter: invitedRole,
        reason: input.reason || null,
        outcomeJson: {
          invitationCreated: true,
          invitationAccepted: false,
          canonicalAccessGranted: false,
          inviteDelivered: false,
          inviteExpiresAt: expiresAt.toISOString(),
          externalSideEffects: false,
        },
      },
    });
    return created;
  }, { isolationLevel: "Serializable" });

  return {
    replayed: false,
    invitation: invitationProjection(invitation),
    invitationPath: `/coaching/engagements/join#token=${encodeURIComponent(token)}`,
    invitationUrl: `${input.origin}/coaching/engagements/join#token=${encodeURIComponent(token)}`,
    delivered: false,
    engagement: boundary.engagement,
  };
}

export async function changeCoachingEngagementMemberAccess(input: {
  engagementId: string;
  memberId: string;
  actor: SessionAccessActor;
  action: "REMOVE" | "RESTORE";
  expectedRevision: number;
  requestId: string;
  reason?: string | null;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  await loadCoachingEngagementMembershipBoundary({
    engagementId: input.engagementId,
    actor: input.actor,
    manage: true,
    prisma,
  });
  const member = await prisma.coachingEngagementMember.findFirst({
    where: { id: input.memberId, engagementId: input.engagementId },
    include: { user: { select: { name: true, primaryEmail: true } } },
  });
  if (!member) {
    throw new CoachingEngagementMembershipError(
      "That member is not part of this Coaching Engagement.",
      404,
      "NOT_FOUND",
    );
  }
  if (member.userId === input.actor.id) {
    throw new CoachingEngagementMembershipError(
      "Another coach, support member, Nest manager, or staff operator must change your own access.",
      409,
      "SELF_CHANGE_REFUSED",
    );
  }
  const existingReceipt = await prisma.coachingEngagementMemberReceipt.findUnique({
    where: { requestId: input.requestId },
  });
  if (existingReceipt) {
    if (!receiptMatches(existingReceipt, {
      engagementId: input.engagementId,
      actorUserId: input.actor.id,
      action: input.action,
      subjectUserId: member.userId,
      memberId: member.id,
    })) {
      throw new CoachingEngagementMembershipError(
        "That request identity belongs to another membership operation.",
        409,
        "REQUEST_CONFLICT",
      );
    }
    const current = await prisma.coachingEngagementMember.findUnique({
      where: { id: member.id },
      include: { user: { select: { name: true, primaryEmail: true } } },
    });
    return { replayed: true, member: memberProjection(current), receiptId: existingReceipt.id };
  }
  const expectedStatus = input.action === "REMOVE" ? "ACTIVE" : "REMOVED";
  const nextStatus = input.action === "REMOVE" ? "REMOVED" : "ACTIVE";
  if (member.status !== expectedStatus || member.accessRevision !== input.expectedRevision) {
    throw new CoachingEngagementMembershipError(
      "Membership changed. Refresh before applying this access decision.",
      409,
      "ACCESS_CHANGED",
    );
  }
  const nextRevision = input.expectedRevision + 1;
  const now = new Date();
  const result = await prisma.$transaction(async (tx: any) => {
    const guarded = await tx.coachingEngagementMember.updateMany({
      where: {
        id: member.id,
        engagementId: input.engagementId,
        status: expectedStatus,
        accessRevision: input.expectedRevision,
      },
      data: {
        status: nextStatus,
        accessRevision: nextRevision,
        accessChangedAt: now,
        accessChangedByUserId: input.actor.id,
        removedAt: input.action === "REMOVE" ? now : null,
        removedByUserId: input.action === "REMOVE" ? input.actor.id : null,
      },
    });
    if (guarded.count !== 1) {
      throw new CoachingEngagementMembershipError(
        "Membership changed while this decision was being saved.",
        409,
        "ACCESS_CHANGED",
      );
    }
    const receipt = await tx.coachingEngagementMemberReceipt.create({
      data: {
        requestId: input.requestId,
        engagementId: input.engagementId,
        memberId: member.id,
        subjectUserId: member.userId,
        actorUserId: input.actor.id,
        action: input.action,
        roleBefore: member.role,
        roleAfter: member.role,
        statusBefore: expectedStatus,
        statusAfter: nextStatus,
        accessRevision: nextRevision,
        reason: input.reason || null,
        outcomeJson: {
          canonicalAccessChanged: true,
          providerJoined: false,
          recordingChanged: false,
          consentHistoryPreserved: true,
          authoredHistoryPreserved: true,
          NestAccessGrantChanged: false,
          externalSideEffects: false,
        },
      },
    });
    const current = await tx.coachingEngagementMember.findUnique({
      where: { id: member.id },
      include: { user: { select: { name: true, primaryEmail: true } } },
    });
    return { receipt, current };
  }, { isolationLevel: "Serializable" });
  return {
    replayed: false,
    member: memberProjection(result.current),
    receiptId: result.receipt.id,
    boundaries: {
      canonicalAccessChanged: true,
      historyPreserved: true,
      NestAccessGrantChanged: false,
      externalSideEffects: false,
    },
  };
}

export async function revokeCoachingEngagementInvitation(input: {
  engagementId: string;
  invitationId: string;
  actor: SessionAccessActor;
  requestId: string;
  reason?: string | null;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  await loadCoachingEngagementMembershipBoundary({
    engagementId: input.engagementId,
    actor: input.actor,
    manage: true,
    prisma,
  });
  const invitation = await prisma.coachingEngagementInvitation.findFirst({
    where: { id: input.invitationId, engagementId: input.engagementId },
  });
  if (!invitation) {
    throw new CoachingEngagementMembershipError(
      "That invitation was not found.",
      404,
      "NOT_FOUND",
    );
  }
  const existingReceipt = await prisma.coachingEngagementMemberReceipt.findUnique({
    where: { requestId: input.requestId },
  });
  if (existingReceipt) {
    if (!receiptMatches(existingReceipt, {
      engagementId: input.engagementId,
      actorUserId: input.actor.id,
      action: "REVOKE_INVITE",
      subjectUserId: invitation.invitedUserId,
      invitationId: invitation.id,
    })) {
      throw new CoachingEngagementMembershipError(
        "That request identity belongs to another membership operation.",
        409,
        "REQUEST_CONFLICT",
      );
    }
    return { replayed: true, invitation: invitationProjection(invitation), receiptId: existingReceipt.id };
  }
  if (invitation.status !== "PENDING") {
    throw new CoachingEngagementMembershipError(
      "Only a pending invitation can be revoked.",
      409,
      "INVITATION_UNAVAILABLE",
    );
  }
  const now = new Date();
  const result = await prisma.$transaction(async (tx: any) => {
    const guarded = await tx.coachingEngagementInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: now },
    });
    if (guarded.count !== 1) {
      throw new CoachingEngagementMembershipError(
        "Invitation changed while it was being revoked.",
        409,
        "ACCESS_CHANGED",
      );
    }
    const receipt = await tx.coachingEngagementMemberReceipt.create({
      data: {
        requestId: input.requestId,
        engagementId: input.engagementId,
        invitationId: invitation.id,
        subjectUserId: invitation.invitedUserId,
        actorUserId: input.actor.id,
        action: "REVOKE_INVITE",
        roleAfter: invitation.role,
        reason: input.reason || null,
        outcomeJson: {
          invitationRevoked: true,
          canonicalAccessChanged: false,
          externalSideEffects: false,
        },
      },
    });
    return { receipt };
  }, { isolationLevel: "Serializable" });
  const current = await prisma.coachingEngagementInvitation.findUnique({ where: { id: invitation.id } });
  return { replayed: false, invitation: invitationProjection(current), receiptId: result.receipt.id };
}

export async function previewCoachingEngagementInvitation(input: {
  token: string;
  actor?: SessionAccessActor | null;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const token = String(input.token || "").trim();
  if (token.length < 32 || token.length > 256) {
    throw new CoachingEngagementMembershipError(
      "This invitation link is invalid.",
      404,
      "INVITATION_UNAVAILABLE",
    );
  }
  const invitation = await prisma.coachingEngagementInvitation.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      engagement: { select: { id: true, title: true } },
    },
  });
  if (!invitation) {
    throw new CoachingEngagementMembershipError(
      "This invitation link is invalid or has been replaced.",
      404,
      "INVITATION_UNAVAILABLE",
    );
  }
  const state = invitationProjection(invitation);
  const isRightAccount = Boolean(input.actor?.id && input.actor.id === invitation.invitedUserId);
  return {
    invitation: state,
    engagement: invitation.engagement,
    signedIn: Boolean(input.actor?.id),
    isRightAccount,
    canAccept: state.status === "PENDING" && isRightAccount,
    canOpen: state.status === "ACCEPTED" && isRightAccount,
  };
}

export async function acceptCoachingEngagementInvitation(input: {
  token: string;
  actor: SessionAccessActor;
  requestId: string;
  prisma?: any;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const preview = await previewCoachingEngagementInvitation({ token: input.token, actor: input.actor, prisma });
  if (!preview.isRightAccount) {
    throw new CoachingEngagementMembershipError(
      "Sign in with the exact account named by this invitation.",
      403,
      "WRONG_ACCOUNT",
    );
  }
  const invitation = await prisma.coachingEngagementInvitation.findUniqueOrThrow({
    where: { id: preview.invitation.id },
  });
  const existingReceipt = await prisma.coachingEngagementMemberReceipt.findUnique({
    where: { requestId: input.requestId },
  });
  if (existingReceipt) {
    if (!receiptMatches(existingReceipt, {
      engagementId: invitation.engagementId,
      actorUserId: input.actor.id,
      action: "ACCEPT",
      subjectUserId: input.actor.id,
      invitationId: invitation.id,
    })) {
      throw new CoachingEngagementMembershipError(
        "That request identity belongs to another invitation decision.",
        409,
        "REQUEST_CONFLICT",
      );
    }
    const current = await prisma.coachingEngagementMember.findUnique({
      where: { engagementId_userId: { engagementId: invitation.engagementId, userId: input.actor.id } },
      include: { user: { select: { name: true, primaryEmail: true } } },
    });
    return { replayed: true, member: memberProjection(current), engagementId: invitation.engagementId };
  }
  if (preview.invitation.status !== "PENDING") {
    throw new CoachingEngagementMembershipError(
      "This invitation is no longer available.",
      409,
      "INVITATION_UNAVAILABLE",
    );
  }

  const existingMember = await prisma.coachingEngagementMember.findUnique({
    where: { engagementId_userId: { engagementId: invitation.engagementId, userId: input.actor.id } },
  });
  if (existingMember) {
    throw new CoachingEngagementMembershipError(
      existingMember.status === "REMOVED"
        ? "A manager must explicitly restore this previously removed membership."
        : "This account is already an active member.",
      409,
      existingMember.status === "REMOVED" ? "RESTORE_REQUIRED" : "ALREADY_MEMBER",
    );
  }
  const now = new Date();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const guarded = await tx.coachingEngagementInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
        invitedUserId: input.actor.id,
        expiresAt: { gt: now },
      },
      data: {
        status: "ACCEPTED",
        acceptedByUserId: input.actor.id,
        acceptedAt: now,
      },
    });
    if (guarded.count !== 1) {
      throw new CoachingEngagementMembershipError(
        "Invitation changed or expired while it was being accepted.",
        409,
        "ACCESS_CHANGED",
      );
    }
    const member = await tx.coachingEngagementMember.create({
      data: {
        engagementId: invitation.engagementId,
        userId: input.actor.id,
        role: invitation.role,
        status: "ACTIVE",
        accessRevision: 1,
        accessChangedAt: now,
        accessChangedByUserId: input.actor.id,
        addedByUserId: invitation.invitedByUserId,
        joinedAt: now,
        metadataJson: {
          source: "coaching-engagement-invitation-accept",
          invitationId: invitation.id,
          externalSideEffects: false,
        },
      },
    });
    const receipt = await tx.coachingEngagementMemberReceipt.create({
      data: {
        requestId: input.requestId,
        engagementId: invitation.engagementId,
        memberId: member.id,
        invitationId: invitation.id,
        subjectUserId: input.actor.id,
        actorUserId: input.actor.id,
        action: "ACCEPT",
        roleAfter: invitation.role,
        statusAfter: "ACTIVE",
        accessRevision: 1,
        outcomeJson: {
          invitationAccepted: true,
          canonicalAccessGranted: true,
          providerJoined: false,
          recordingStarted: false,
          NestAccessGrantChanged: false,
          externalSideEffects: false,
        },
      },
    });
    return { member, receipt };
  }, { isolationLevel: "Serializable" });
  await recordQuipslyProductOutcome({
    prisma,
    userId: input.actor.id,
    eventName: "invitation_accepted",
    parameters: {
      workflow: "coaching",
      participant_role: invitation.role === "CLIENT" ? "client" : "guest",
      method: "link",
      result: "success",
    },
  });
  const current = await prisma.coachingEngagementMember.findUnique({
    where: { id: result.member.id },
    include: { user: { select: { name: true, primaryEmail: true } } },
  });
  return {
    replayed: false,
    member: memberProjection(current),
    engagementId: invitation.engagementId,
    receiptId: result.receipt.id,
    boundaries: {
      canonicalAccessGranted: true,
      providerJoined: false,
      recordingStarted: false,
      NestAccessGrantChanged: false,
      externalSideEffects: false,
    },
  };
}
