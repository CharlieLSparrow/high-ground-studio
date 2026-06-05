import "server-only";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { STUDIO_WORKSPACE_SLUG, projectConfig } from "@/lib/studio/project-registry";

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

/**
 * Checks and requires authenticated access to a project and its workspace/organization context.
 * Performs tenancy check, platform-override check, and role permission validation.
 * Bypasses checks/mutes errors in development mode to prevent local owner lockouts.
 */
export async function requireProjectAccess(
  projectSlug: string,
  action: ProjectAccessAction
): Promise<ProjectAccessResult> {
  const session = await auth();
  const prisma = getPrismaClient();
  const config = projectConfig(projectSlug);

  const workspace = await prisma.studioWorkspace.findUnique({
    where: { slug: STUDIO_WORKSPACE_SLUG },
  });
  const project = workspace ? await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  }) : null;
  const document = project ? await prisma.studioDocument.findFirst({
    where: { projectId: project.id },
    orderBy: { updatedAt: "desc" },
  }) : null;

  if (!workspace || !project || !document) {
    throw new Error("NOT_FOUND: Project access target was not found");
  }

  const isDev = process.env.NODE_ENV === "development";

  // Development/local mode bypass if no active session is found (prevents owner lockouts)
  if (isDev && !session?.user?.id) {
    return {
      user: {
        id: "dev-user-id",
        primaryEmail: "dev@quipsly.com",
        name: "Dev Local Owner",
        roles: ["OWNER"],
      },
      organization: {
        id: "dev-org-id",
        slug: "dev-org",
        name: "Dev Local Organization",
      },
      membership: {
        role: "OWNER",
      },
      workspace,
      project,
      document,
    };
  }

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED: Not signed in");
  }

  // Resolve user identity (handles alias email resolution and allowlist session variations)
  const email = session.user.primaryEmail || session.user.email;
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: session.user.id },
        ...(email ? [
          { primaryEmail: email },
          { aliases: { some: { email } } }
        ] : [])
      ]
    },
    include: {
      roles: true,
      organizationMemberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  // Platform owner override (staff check)
  const isPlatformOwner =
    user?.roles.some((r) => r.role === "OWNER") ||
    (Array.isArray(session.user.roles) && session.user.roles.includes("OWNER"));

  if (isPlatformOwner) {
    return {
      user: user || { id: session.user.id, primaryEmail: email, roles: session.user.roles },
      organization: null,
      membership: null,
      workspace,
      project,
      document,
    };
  }

  // Determine workspace organization context. If not yet assigned organizationId (prior to migration),
  // fallback to standard staff/role checks to avoid blocking legitimate users.
  const workspaceOrgId = (workspace as any).organizationId;
  if (!workspaceOrgId) {
    const isStaff =
      user?.roles.some((r) => ["OWNER", "TEAM_SCHEDULER", "COACH"].includes(r.role)) ||
      session.user.isStaff;

    if (isStaff) {
      return {
        user: user || { id: session.user.id, primaryEmail: email },
        organization: null,
        membership: null,
        workspace,
        project,
        document,
      };
    }
    throw new Error("FORBIDDEN: Workspace is not yet connected to a tenant organization");
  }

  // Verify membership in workspace organization
  const membership = user?.organizationMemberships.find(
    (m) => m.organizationId === workspaceOrgId
  );

  if (!membership) {
    throw new Error("FORBIDDEN: You do not have access to this workspace's organization");
  }

  // Map roles to permission levels
  const role = membership.role;
  let allowed = false;

  switch (action) {
    case "read":
      allowed = ["OWNER", "ADMIN", "EDITOR", "VIEWER"].includes(role);
      break;
    case "write":
    case "import-media":
    case "record":
      allowed = ["OWNER", "ADMIN", "EDITOR"].includes(role);
      break;
    case "manage":
    case "publish":
      allowed = ["OWNER", "ADMIN"].includes(role);
      break;
    default:
      allowed = false;
  }

  if (!allowed) {
    throw new Error(`FORBIDDEN: Insufficient permissions to perform ${action} on this project`);
  }

  return {
    user,
    organization: membership.organization,
    membership,
    workspace,
    project,
    document,
  };
}
