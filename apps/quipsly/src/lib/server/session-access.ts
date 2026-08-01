import "server-only";

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

function sessionActorAccessConditions(
  actor: SessionAccessActor,
  projectGrant: "read" | "mutate",
) {
  const email = normalizedEmail(actor);
  return [
    { createdByUserId: actor.id },
    {
      participants: {
        some: {
          userId: actor.id,
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
                  ...(projectGrant === "mutate"
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
  if (actor.isStaff) return {};
  return {
    OR: sessionActorAccessConditions(actor, "read"),
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
  if (actor.isStaff) return {};
  return {
    OR: sessionActorAccessConditions(actor, "mutate"),
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
