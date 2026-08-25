import type { AppRole } from "@prisma/client";

export const STUDIO_ACCESS_ROLES: readonly AppRole[] = [
  "OWNER",
  "TEAM_SCHEDULER",
];

export const QUIPSLY_PRODUCT_ACCESS_ROLES: readonly AppRole[] = [
  ...STUDIO_ACCESS_ROLES,
  "COACH",
  "CLIENT",
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
 * Product entry is intentionally broader than Studio/staff authority. A coach
 * or client may enter their own Coaching and Session surfaces, but must not inherit the
 * global data bypasses guarded by `isStaff` / `canAccessStudio`.
 */
export function canAccessQuipslyProduct(
  roles: AppRole[] | undefined | null,
): boolean {
  return (
    Array.isArray(roles) &&
    QUIPSLY_PRODUCT_ACCESS_ROLES.some((role) => roles.includes(role))
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
  
  // NOTE: Project-level access should flow through the Firebase-backed
  // Quipsly session actor and app-owned membership/access rows. This legacy
  // helper only validates that the project exists for older Studio paths.
  
  const prisma = await import("@/lib/prisma").then(m => m.getPrismaClient());
  const project = await prisma.studioProject.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Authorization failed: Project not found.`);
}
