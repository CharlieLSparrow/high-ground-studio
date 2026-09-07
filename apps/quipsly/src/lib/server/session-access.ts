import "server-only";

import type { Prisma } from "@prisma/client";
import { coachingEngagementActorAccessWhere } from "./coaching-engagement";

export type SessionAccessActor = {
  id: string;
  email?: string | null;
  primaryEmail?: string | null;
  isStaff?: boolean;
};

function normalizedEmail(actor: SessionAccessActor) {
  return String(actor.primaryEmail || actor.email || "")
    .trim()
    .toLowerCase();
}

const SESSION_MUTATION_PROJECT_ROLES = ["OWNER", "EDITOR"] as const;
const MISSING_SESSION_ACTOR_ID = "__quipsly_missing_session_actor__";

function hasStableActorId(actor: SessionAccessActor) {
  return typeof actor.id === "string" && actor.id.trim().length > 0;
}

function deniedSessionActorAccess(): Prisma.CallRoomWhereInput {
  return {
    AND: [
      { id: MISSING_SESSION_ACTOR_ID },
      { id: { not: MISSING_SESSION_ACTOR_ID } },
    ],
  };
}

function sessionActorAccessConditions(
  actor: SessionAccessActor,
  projectGrant: "read" | "collaborate" | "mutate" | "join",
) {
  const email = normalizedEmail(actor);
  return [
    { createdByUserId: actor.id },
    {
      participants: {
        some: {
          userId: actor.id,
          accessStatus: "ACTIVE" as const,
          ...(projectGrant === "mutate"
            ? { role: { not: "OBSERVER" as const } }
            : {}),
        },
      },
    },
    { booking: { clientUserId: actor.id } },
    { booking: { coachUserId: actor.id } },
    ...(email && projectGrant !== "join"
      ? [
          {
            coachingEngagementId: null,
            project: {
              accessGrants: {
                some: {
                  email,
                  status: "ACTIVE" as const,
                  ...(projectGrant !== "read"
                    ? { role: { in: [...SESSION_MUTATION_PROJECT_ROLES] } }
                    : {}),
                },
              },
            },
          },
        ]
      : []),
  ];
}

/** A room invitation is session-scoped; it does not join the whole client space.
 * Existing space members keep their current space role, including revocation,
 * even when old bookings or room-participant records still reference them.
 */
function coachingSessionScope(
  actor: SessionAccessActor,
  action: "read" | "write" | "manage",
): Prisma.CallRoomWhereInput {
  return { OR: [
    { coachingEngagementId: null },
    { coachingEngagement: { members: { none: { userId: actor.id } } } },
    { coachingEngagement: coachingEngagementActorAccessWhere(actor, action) },
  ] };
}

function scopedSessionConditions(
  actor: SessionAccessActor,
  conditions: Prisma.CallRoomWhereInput[],
  action: "read" | "write" | "manage",
): Prisma.CallRoomWhereInput {
  return {
    OR: [...conditions, { coachingEngagement: coachingEngagementActorAccessWhere(actor, action) }],
    AND: [coachingSessionScope(actor, action)],
  };
}

/**
 * Shared actor boundary for every canonical Nest Session projection.
 *
 * Project access grants access to non-client-space Session shells, but every
 * actor-owned note, task, goal, reminder, and brief query must still scope its
 * rows to the current actor. This keeps collaboration and private follow-through
 * separate instead of treating Nest membership as ownership of personal work.
 */
export function sessionActorAccessWhere(actor: SessionAccessActor) {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  return scopedSessionConditions(actor, sessionActorAccessConditions(actor, "read"), "read");
}

/**
 * Meeting-thread read boundary.
 *
 * A project VIEWER may inspect the Session shell, but that alone never grants
 * access to a meeting's conversation. Registered participants (including an
 * observer), booked coach/client, the creator, staff, and active project
 * OWNER/EDITOR collaborators may read non-client-space Session threads.
 * Private coaching spaces use their explicit membership instead.
 */
export function sessionConversationActorAccessWhere(actor: SessionAccessActor) {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  return scopedSessionConditions(actor, sessionActorAccessConditions(actor, "collaborate"), "read");
}

/**
 * Shared mutation boundary for canonical Session projections.
 *
 * Direct Session owners, non-observer participants, booked clients/coaches,
 * and staff keep mutation authority. Project-only collaborators must hold an
 * active OWNER or EDITOR grant; VIEWER remains a read-only role.
 */
export function sessionMutationActorAccessWhere(actor: SessionAccessActor) {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  return scopedSessionConditions(actor, sessionActorAccessConditions(actor, "mutate"), "write");
}

/**
 * Invitation authority is narrower than ordinary Session collaboration.
 * A client or guest may contribute to their own Session, but cannot expand the
 * participant list. Hosts, coaches, producers, the creator, staff, and Nest
 * owners/editors can issue or revoke expiring Session-scoped invitations.
 */
export function sessionInvitationActorAccessWhere(actor: SessionAccessActor): Prisma.CallRoomWhereInput {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  const email = normalizedEmail(actor);
  const conditions: Prisma.CallRoomWhereInput[] = [
    { createdByUserId: actor.id },
    { participants: { some: { userId: actor.id, accessStatus: "ACTIVE", role: { in: ["HOST", "COACH", "PRODUCER"] } } } },
    { booking: { coachUserId: actor.id } },
  ];
  if (email) conditions.push({
    coachingEngagementId: null,
    project: {
      accessGrants: {
        some: {
          email,
          status: "ACTIVE",
          role: { in: [...SESSION_MUTATION_PROJECT_ROLES] },
        },
      },
    },
  });
  return scopedSessionConditions(actor, conditions, "manage");
}

export function sessionAccessWhere(roomId: string, actor: SessionAccessActor) {
  return {
    id: roomId,
    ...sessionActorAccessWhere(actor),
  };
}

/** Live entry requires a room invitation, booking, or creator identity, not
 * just permission to browse a Nest or client relationship. Reuse the same
 * client-space revocation policy as recordings, notes, and conversations.
 */
export function sessionJoinAccessWhere(roomId: string, actor: SessionAccessActor): Prisma.CallRoomWhereInput {
  if (!hasStableActorId(actor)) return { id: roomId, ...deniedSessionActorAccess() };
  if (actor.isStaff) return { id: roomId };
  return {
    id: roomId,
    OR: sessionActorAccessConditions(actor, "join"),
    AND: [coachingSessionScope(actor, "read")],
  };
}

export function sessionMutationAccessWhere(
  roomId: string,
  actor: SessionAccessActor,
) {
  return {
    id: roomId,
    ...sessionMutationActorAccessWhere(actor),
  };
}

export function sessionConversationAccessWhere(
  roomId: string,
  actor: SessionAccessActor,
) {
  return {
    id: roomId,
    ...sessionConversationActorAccessWhere(actor),
  };
}


export function sessionInvitationAccessWhere(
  roomId: string,
  actor: SessionAccessActor,
) {
  return {
    id: roomId,
    ...sessionInvitationActorAccessWhere(actor),
  };
}
