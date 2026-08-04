import "server-only";

import type { Prisma } from "@prisma/client";

import type { SessionAccessActor } from "./session-access";

const COLLABORATOR_PROJECT_ROLES = ["OWNER", "EDITOR"] as const;
const WRITING_MEMBER_ROLES = ["CLIENT", "COACH", "SUPPORT"] as const;
const MANAGING_MEMBER_ROLES = ["COACH", "SUPPORT"] as const;

function actorEmail(actor: SessionAccessActor) {
  return String(actor.primaryEmail || actor.email || "").trim().toLowerCase();
}

export function coachingEngagementActorAccessWhere(
  actor: SessionAccessActor,
  action: "read" | "write" | "manage" = "read",
): Prisma.CoachingEngagementWhereInput {
  if (actor.isStaff) return {};
  const email = actorEmail(actor);
  const allowedRoles = action === "read"
    ? null
    : action === "manage"
      ? MANAGING_MEMBER_ROLES
      : WRITING_MEMBER_ROLES;
  const member = {
    userId: actor.id,
    status: "ACTIVE" as const,
    ...(allowedRoles ? { role: { in: [...allowedRoles] } } : {}),
  };
  const conditions: Prisma.CoachingEngagementWhereInput[] = [
    { members: { some: member } },
  ];
  if (email) conditions.push({
    project: {
      accessGrants: {
        some: {
          email,
          status: "ACTIVE",
          role: { in: [...COLLABORATOR_PROJECT_ROLES] },
        },
      },
    },
  });
  return { OR: conditions };
}

export function coachingEngagementAccessWhere(
  engagementId: string,
  actor: SessionAccessActor,
  action: "read" | "write" | "manage" = "read",
): Prisma.CoachingEngagementWhereInput {
  return { id: engagementId, ...coachingEngagementActorAccessWhere(actor, action) };
}

export class CoachingEngagementError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "NOT_FOUND" | "AMBIGUOUS" | "PROJECT_MISMATCH" | "INVALID_PEOPLE",
  ) {
    super(message);
    this.name = "CoachingEngagementError";
  }
}

type EngagementClient = Prisma.TransactionClient;

async function activateMember(input: {
  prisma: EngagementClient;
  engagementId: string;
  userId: string;
  role: "CLIENT" | "COACH";
  actorUserId: string;
}) {
  return input.prisma.coachingEngagementMember.upsert({
    where: { engagementId_userId: { engagementId: input.engagementId, userId: input.userId } },
    update: {
      role: input.role,
      status: "ACTIVE",
      removedAt: null,
      removedByUserId: null,
    },
    create: {
      engagementId: input.engagementId,
      userId: input.userId,
      role: input.role,
      status: "ACTIVE",
      addedByUserId: input.actorUserId,
      metadataJson: { source: "coaching-engagement-ensure", externalSideEffects: false },
    },
  });
}

export async function ensureCoachingEngagement(input: {
  prisma: EngagementClient;
  projectId: string;
  actorUserId: string;
  clientUserId: string;
  coachUserId: string;
  clientLabel?: string | null;
  requestedEngagementId?: string | null;
}) {
  if (!input.clientUserId || !input.coachUserId || input.clientUserId === input.coachUserId) {
    throw new CoachingEngagementError(
      "A coaching engagement needs distinct coach and client identities.",
      409,
      "INVALID_PEOPLE",
    );
  }

  let engagement;
  if (input.requestedEngagementId) {
    engagement = await input.prisma.coachingEngagement.findUnique({
      where: { id: input.requestedEngagementId },
      select: { id: true, projectId: true, status: true, primaryClientUserId: true, primaryCoachUserId: true, title: true },
    });
    if (!engagement) throw new CoachingEngagementError("That coaching engagement was not found.", 404, "NOT_FOUND");
    if (engagement.projectId !== input.projectId) {
      throw new CoachingEngagementError("The coaching engagement belongs to a different Nest.", 409, "PROJECT_MISMATCH");
    }
    if (
      engagement.primaryClientUserId && engagement.primaryClientUserId !== input.clientUserId
      || engagement.primaryCoachUserId && engagement.primaryCoachUserId !== input.coachUserId
    ) {
      throw new CoachingEngagementError("The selected engagement belongs to different coach/client identities.", 409, "INVALID_PEOPLE");
    }
  } else {
    const matches = await input.prisma.coachingEngagement.findMany({
      where: {
        projectId: input.projectId,
        primaryClientUserId: input.clientUserId,
        primaryCoachUserId: input.coachUserId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 2,
      select: { id: true, projectId: true, status: true, primaryClientUserId: true, primaryCoachUserId: true, title: true },
    });
    if (matches.length > 1) {
      throw new CoachingEngagementError(
        "More than one active coaching engagement matches these people. Choose the exact engagement instead of guessing.",
        409,
        "AMBIGUOUS",
      );
    }
    engagement = matches[0] ?? await input.prisma.coachingEngagement.create({
      data: {
        projectId: input.projectId,
        createdByUserId: input.actorUserId,
        primaryClientUserId: input.clientUserId,
        primaryCoachUserId: input.coachUserId,
        title: `${input.clientLabel?.trim() || "Client"} coaching`,
        metadataJson: {
          source: "coaching-engagement-ensure",
          externalSideEffects: false,
          inferredFromHistoricalSessions: false,
        },
      },
      select: { id: true, projectId: true, status: true, primaryClientUserId: true, primaryCoachUserId: true, title: true },
    });
  }

  await activateMember({
    prisma: input.prisma,
    engagementId: engagement.id,
    userId: input.clientUserId,
    role: "CLIENT",
    actorUserId: input.actorUserId,
  });
  await activateMember({
    prisma: input.prisma,
    engagementId: engagement.id,
    userId: input.coachUserId,
    role: "COACH",
    actorUserId: input.actorUserId,
  });
  return engagement;
}
