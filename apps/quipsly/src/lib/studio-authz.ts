import type { AppRole } from "@prisma/client";

export const STUDIO_ACCESS_ROLES: readonly AppRole[] = [
  "OWNER",
  "TEAM_SCHEDULER",
  "COACH",
];

export function canAccessStudio(
  roles: AppRole[] | undefined | null,
): boolean {
  return (
    Array.isArray(roles) &&
    STUDIO_ACCESS_ROLES.some((role) => roles.includes(role))
  );
}

/**
 * Validates that the current execution context has access to a specific project.
 * 
 * @param projectId The target project ID
 * @param requiredAction The action type requested (read or write)
 * @throws {Error} if authorization fails or project does not exist
 */
export async function requireProjectAccess(
  projectId: string,
  requiredAction: "read" | "write" = "read"
): Promise<void> {
  if (!projectId) {
    throw new Error("Authorization failed: A valid projectId is required.");
  }
  
  // NOTE: In production SaaS environments, this will resolve the user token
  // from NextAuth/Clerk and query `StudioWorkspace` memberships.
  // For the current local Alpha, we simply validate the ID exists in the db.
  
  const prisma = await import("@/lib/prisma").then(m => m.getPrismaClient());
  const project = await prisma.studioProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Authorization failed: Project not found.`);
}
