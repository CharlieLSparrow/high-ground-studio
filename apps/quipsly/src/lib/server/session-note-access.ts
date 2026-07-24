import "server-only";

import type { Prisma, StudioProjectAccessRole } from "@prisma/client";

export const SESSION_NOTE_VISIBLE_KINDS = [
  "SESSION_NOTE",
  "FOLLOW_UP",
  "DECISION",
  "PRODUCTION",
] as const;

export function canUseProjectTeamNotes(
  role: StudioProjectAccessRole | null | undefined,
  isStaff = false,
) {
  return isStaff || role === "OWNER" || role === "EDITOR";
}

/**
 * Apply only after the enclosing Session access check. Private notes remain
 * author-only even for staff; shared/client-safe notes inherit Session access;
 * project-team notes additionally require a production-capable Nest role.
 */
export function sessionNoteVisibilityWhere(input: {
  actorUserId: string;
  canViewProjectTeam: boolean;
}): Prisma.CoachingNoteWhereInput {
  return {
    OR: [
      { authorUserId: input.actorUserId },
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
      ...(input.canViewProjectTeam ? [{ visibility: "PROJECT_TEAM" as const }] : []),
    ],
  };
}

export function workspaceNoteVisibilityWhere(input: {
  actorUserId: string;
  projectTeamProjectIds: string[];
}): Prisma.CoachingNoteWhereInput {
  return {
    OR: [
      { authorUserId: input.actorUserId },
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
      ...(input.projectTeamProjectIds.length ? [{
        visibility: "PROJECT_TEAM" as const,
        room: { projectId: { in: input.projectTeamProjectIds } },
      }] : []),
    ],
  };
}
