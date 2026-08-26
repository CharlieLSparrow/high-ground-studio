import "server-only";

import type { Prisma, StudioProjectAccessRole } from "@prisma/client";

import {
  EDITABLE_SESSION_NOTE_KINDS,
  type SessionNoteVisibility,
} from "@/lib/session-note-contract";
import {
  sessionMutationActorAccessWhere,
  type SessionAccessActor,
} from "@/lib/server/session-access";

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

/**
 * Canonical mutation boundary for a note inside a Session. A writable Session
 * participant may collaborate on shared notes, while another person's private
 * note remains invisible and immutable. Project-team notes additionally keep
 * the owner/editor boundary used by every other production surface.
 */
export function sessionNoteMutationWhere(
  actor: SessionAccessActor,
): Prisma.CoachingNoteWhereInput {
  const actorEmail = String(actor.primaryEmail || actor.email || "")
    .trim()
    .toLowerCase();

  return {
    kind: { in: [...EDITABLE_SESSION_NOTE_KINDS] },
    room: sessionMutationActorAccessWhere(actor),
    OR: [
      { authorUserId: actor.id },
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
      ...(actor.isStaff
        ? [{ visibility: "PROJECT_TEAM" as const }]
        : actorEmail
          ? [{
              visibility: "PROJECT_TEAM" as const,
              room: {
                project: {
                  accessGrants: {
                    some: {
                      email: actorEmail,
                      status: "ACTIVE" as const,
                      role: { in: ["OWNER", "EDITOR"] satisfies StudioProjectAccessRole[] },
                    },
                  },
                },
              },
            }]
          : []),
    ],
  };
}

export function canEditSessionNoteProjection(input: {
  actorUserId: string;
  authorUserId: string | null | undefined;
  kind: string;
  visibility: SessionNoteVisibility;
  canMutateSession: boolean;
  canUseProjectTeam: boolean;
}) {
  if (!input.canMutateSession) return false;
  if (!(EDITABLE_SESSION_NOTE_KINDS as readonly string[]).includes(input.kind)) return false;
  if (input.authorUserId === input.actorUserId) return true;
  if (input.visibility === "SESSION_SHARED" || input.visibility === "CLIENT_SAFE") return true;
  return input.visibility === "PROJECT_TEAM" && input.canUseProjectTeam;
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

/**
 * Visibility policy for the iPhone Session projection. The enclosing room query
 * still owns Session access; this predicate prevents that access from widening
 * author-private notes or production-team notes.
 */
export function mobileSessionNoteVisibilityWhere(input: {
  actorUserId: string;
  actorEmail: string;
  isStaff: boolean;
}): Prisma.CoachingNoteWhereInput {
  return {
    OR: [
      { authorUserId: input.actorUserId },
      { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
      ...(input.isStaff
        ? [{ visibility: "PROJECT_TEAM" as const }]
        : input.actorEmail
          ? [{
              visibility: "PROJECT_TEAM" as const,
              room: {
                project: {
                  accessGrants: {
                    some: {
                      email: input.actorEmail,
                      status: "ACTIVE" as const,
                      role: { in: ["OWNER", "EDITOR"] satisfies StudioProjectAccessRole[] },
                    },
                  },
                },
              },
            }]
          : []),
    ],
  };
}
