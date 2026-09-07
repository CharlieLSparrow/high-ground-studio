import "server-only";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
} from "@/lib/server/studio-project-access";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";

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
async function requireAuthorizedProject(
  locator: { projectSlug: string } | { projectId: string },
  action: ProjectAccessAction,
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED: Not signed in");
  }

  const email = normalizeAccessEmail(session.user.primaryEmail || session.user.email);
  if (!email) {
    throw new Error("UNAUTHORIZED: Signed-in account has no verified email");
  }

  const prisma = getPrismaClient();
  const projectId = "projectId" in locator ? locator.projectId.trim() : undefined;
  if (projectId === "") throw new Error("NOT_FOUND: Project access target was not found");
  const projectSlug = "projectSlug" in locator ? locator.projectSlug : (await prisma.studioProject.findUnique({
    where: { id: projectId }, select: { slug: true },
  }))?.slug;
  if (!projectSlug) throw new Error("NOT_FOUND: Project access target was not found");
  const project = await findStudioProjectForAccess(projectSlug, prisma, projectId);
  if (!project) {
    throw new Error("NOT_FOUND: Project access target was not found");
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    projectId: project.id,
    email,
    action: toStudioProjectAccessAction(action),
    prisma,
  });
  if (!access.allowed || access.projectId !== project.id) {
    throw new Error(`FORBIDDEN: Insufficient permissions to perform ${action} on this project`);
  }

  return { session, prisma, project, email, access };
}

/** ID-based application actions use the same authority as slug-based pages.
 * An empty workspace is valid: access never requires a document to exist.
 */
export async function requireProjectAccessById(projectId: string, action: ProjectAccessAction = "read") {
  const { session, project, access } = await requireAuthorizedProject({ projectId }, action);
  return { user: session.user, project, role: access.role, workspace: project.workspace };
}

export async function requireProjectAccess(
  projectSlug: string,
  action: ProjectAccessAction,
): Promise<ProjectAccessResult> {
  const { session, prisma, project, email } = await requireAuthorizedProject({ projectSlug }, action);
  const [document, user] = await Promise.all([
    prisma.studioDocument.findFirst({
      where: {
        projectId: project.id,
        ...personalWritingDocumentVisibilityWhere(session.user.id),
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findFirst({
      where: { id: session.user.id },
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
