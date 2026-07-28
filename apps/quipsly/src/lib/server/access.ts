import "server-only";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";

export type ProjectAccessResult = {
  user: any;
  organization: any;
  membership: any;
  workspace: any;
  project: any;
  document: any;
};

export type ProjectAccessAction =
  | "read"
  | "write"
  | "manage"
  | "import-media"
  | "record"
  | "publish";

export type ProjectAccessErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";

export function projectAccessErrorCode(error: unknown): ProjectAccessErrorCode | null {
  if (!(error instanceof Error)) return null;
  const separator = error.message.indexOf(":");
  const candidate = separator >= 0 ? error.message.slice(0, separator) : error.message;
  return candidate === "UNAUTHORIZED" || candidate === "FORBIDDEN" || candidate === "NOT_FOUND"
    ? candidate
    : null;
}

function toStudioProjectAccessAction(action: ProjectAccessAction): StudioProjectAccessAction {
  if (action === "read") return "read";
  if (action === "manage" || action === "publish") return "manage";
  return "write";
}

/**
 * Requires the same Firebase-backed Quipsly actor and app-owned Nest grant used
 * by the rest of the product. The project is resolved by its own slug and
 * workspace; customer Nests must not be forced through the legacy Studio
 * workspace registry.
 */
export async function requireProjectAccess(
  projectSlug: string,
  action: ProjectAccessAction,
): Promise<ProjectAccessResult> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED: Not signed in");
  }

  const email = normalizeAccessEmail(session.user.primaryEmail || session.user.email);
  if (!email) {
    throw new Error("UNAUTHORIZED: Signed-in account has no verified email");
  }

  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) {
    throw new Error("NOT_FOUND: Project access target was not found");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email,
    action: toStudioProjectAccessAction(action),
    prisma,
  });
  if (!access.allowed) {
    throw new Error(`FORBIDDEN: Insufficient permissions to perform ${action} on this project`);
  }

  const [document, user] = await Promise.all([
    prisma.studioDocument.findFirst({
      where: { projectId: project.id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findFirst({
      where: {
        OR: [
          { id: session.user.id },
          { primaryEmail: email },
          { aliases: { some: { email } } },
        ],
      },
      include: { roles: true },
    }),
  ]);

  if (!document) {
    throw new Error("NOT_FOUND: Project access target was not found");
  }

  const membership = project.accessGrants.find(
    (grant) => normalizeAccessEmail(grant.email) === email && grant.status === "ACTIVE",
  ) ?? null;

  return {
    user: user || session.user,
    organization: null,
    membership,
    workspace: project.workspace,
    project,
    document,
  };
}
