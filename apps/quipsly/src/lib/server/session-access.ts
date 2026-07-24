import "server-only";

export type SessionAccessActor = {
  id: string;
  email?: string | null;
  primaryEmail?: string | null;
  isStaff?: boolean;
};

function normalizedEmail(actor: SessionAccessActor) {
  return String(actor.primaryEmail || actor.email || "").trim().toLowerCase();
}

/**
 * Shared read/write boundary for the canonical Nest Session workspace.
 *
 * Project access deliberately grants access to the Session shell, but every
 * actor-owned note, task, goal, reminder, and brief query must still scope its
 * rows to the current actor. This keeps collaboration and private follow-through
 * separate instead of treating Nest membership as ownership of personal work.
 */
export function sessionAccessWhere(roomId: string, actor: SessionAccessActor) {
  if (actor.isStaff) return { id: roomId };

  const email = normalizedEmail(actor);
  return {
    id: roomId,
    OR: [
      { createdByUserId: actor.id },
      { participants: { some: { userId: actor.id } } },
      { booking: { clientUserId: actor.id } },
      { booking: { coachUserId: actor.id } },
      ...(email
        ? [{ project: { accessGrants: { some: { email, status: "ACTIVE" as const } } } }]
        : []),
    ],
  };
}
