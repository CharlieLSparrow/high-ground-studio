import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { ensureCoachingEngagement, coachingEngagementAccessWhere } from "./coaching-engagement";
import { ensureHomeNestForEmailInTransaction } from "./home-nest";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock";
import { ensureInvitedStudioUserByEmail } from "./studio-user-identity";
import type { SessionAccessActor } from "./session-access";

export class CoachingClientSpaceError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function coachingClientSchedulingContext(input: {
  actor: SessionAccessActor;
  engagementId: string;
  prisma?: PrismaClient | Prisma.TransactionClient;
}) {
  const prisma = input.prisma ?? getPrismaClient();
  const space = await prisma.coachingEngagement.findFirst({
    where: { AND: [coachingEngagementAccessWhere(input.engagementId, input.actor, "manage"),
      ...(input.actor.isStaff ? [] : [{ primaryCoachUserId: input.actor.id }])], status: { in: ["ACTIVE", "PAUSED"] } },
    select: { id: true, title: true, projectId: true, primaryCoachUserId: true, primaryClientUserId: true, project: { select: { slug: true } } },
  });
  if (!space?.primaryClientUserId || !space.primaryCoachUserId) throw new CoachingClientSpaceError("This client space is not available for scheduling.", 404);
  const client = await prisma.user.findUniqueOrThrow({ where: { id: space.primaryClientUserId }, select: { name: true, primaryEmail: true } });
  return { engagementId: space.id, title: space.title, projectId: space.projectId, projectSlug: space.project.slug, coachUserId: space.primaryCoachUserId, clientUserId: space.primaryClientUserId, clientEmail: client.primaryEmail, clientName: client.name || "" };
}

export async function createCoachingClientSpace(input: {
  actor: SessionAccessActor;
  email: string;
  name?: string;
  prisma?: PrismaClient;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length > 200) {
    throw new CoachingClientSpaceError("Enter a valid client email and a name of 200 characters or fewer.", 400);
  }
  if (!input.actor.id?.trim()) throw new CoachingClientSpaceError("Sign in to add a client.", 401);
  const prisma = input.prisma ?? getPrismaClient();
  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: input.actor.id }, select: { id: true, primaryEmail: true, isActive: true },
    });
    if (!actor?.isActive) throw new CoachingClientSpaceError("Your account is not available for this action.", 403);
    const profile = await tx.coachProfile.findFirst({ where: { userId: actor.id, isActive: true }, select: { id: true } });
    const membership = profile || input.actor.isStaff ? null : await tx.coachingEngagementMember.findFirst({
      where: { userId: actor.id, role: "COACH", status: "ACTIVE" }, select: { id: true },
    });
    if (!profile && !membership && !input.actor.isStaff) {
      throw new CoachingClientSpaceError("Set up your coaching profile before adding a client.", 403);
    }

    // Match the identity reconciler's mailbox lock. Concurrent requests create
    // one account and one relationship, without manufacturing a booking.
    await acquirePrismaAdvisoryTransactionLock(tx, `quipsly:identity:email:${email}`);
    const client = await ensureInvitedStudioUserByEmail({ email, name, prisma: tx });
    if (client.id === actor.id) throw new CoachingClientSpaceError("Use your client’s email, not your own account.", 400);
    const home = await ensureHomeNestForEmailInTransaction(actor.primaryEmail, tx);
    const engagement = await ensureCoachingEngagement({
      prisma: tx, projectId: home.id, actorUserId: actor.id,
      coachUserId: actor.id, clientUserId: client.id,
      clientLabel: name || client.name || email,
    });
    return { id: engagement.id, title: engagement.title, href: `/coaching/engagements/${encodeURIComponent(engagement.id)}` };
  });
}
