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
