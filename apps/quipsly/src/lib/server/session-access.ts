import "server-only";

import type { Prisma } from "@prisma/client";

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
  projectGrant: "read" | "collaborate" | "mutate",
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
    ...(email
      ? [
          {
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

/**
 * Shared actor boundary for every canonical Nest Session projection.
 *
 * Project access deliberately grants access to the Session shell, but every
 * actor-owned note, task, goal, reminder, and brief query must still scope its
 * rows to the current actor. This keeps collaboration and private follow-through
 * separate instead of treating Nest membership as ownership of personal work.
 */
export function sessionActorAccessWhere(actor: SessionAccessActor) {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  return {
    OR: sessionActorAccessConditions(actor, "read"),
  };
}

/**
 * Meeting-thread read boundary.
 *
 * A project VIEWER may inspect the Session shell, but that alone never grants
 * access to a meeting's conversation. Registered participants (including an
 * observer), booked coach/client, the creator, staff, and active project
 * OWNER/EDITOR collaborators may read the Session thread.
 */
export function sessionConversationActorAccessWhere(actor: SessionAccessActor) {
  if (!hasStableActorId(actor)) return deniedSessionActorAccess();
  if (actor.isStaff) return {};
  return {
    OR: sessionActorAccessConditions(actor, "collaborate"),
  };
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
  return {
    OR: sessionActorAccessConditions(actor, "mutate"),
  };
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
  return {
    OR: conditions,
  };
}

export function sessionAccessWhere(roomId: string, actor: SessionAccessActor) {
  return {
    id: roomId,
    ...sessionActorAccessWhere(actor),
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
