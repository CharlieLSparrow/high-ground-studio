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
