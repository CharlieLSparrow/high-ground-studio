import type { AppRole } from "@prisma/client";

export const STAFF_ROLES: readonly AppRole[] = [
  "OWNER",
  "STAFF_SCHEDULER",
  "COACH",
];

export function hasRole(
  roles: AppRole[] | undefined | null,
  role: AppRole,
): boolean {
  return Array.isArray(roles) && roles.includes(role);
}

export function hasAnyRole(
  roles: AppRole[] | undefined | null,
  expected: readonly AppRole[],
): boolean {
  return Array.isArray(roles) && expected.some((role) => roles.includes(role));
}

export function canAccessInternalContent(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

export function canManageClients(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

export function canManageAppointments(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

export function canManageMemberships(
  roles: AppRole[] | undefined | null,
): boolean {
  return hasAnyRole(roles, ["OWNER", "STAFF_SCHEDULER"]);
}