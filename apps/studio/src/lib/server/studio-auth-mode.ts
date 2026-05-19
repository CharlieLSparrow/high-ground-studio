import "server-only";

import type { AppRole } from "@prisma/client";

import type { StudioUserIdentity } from "./studio-user-identity";
import { canAccessStudio } from "@/lib/studio-authz";

const ALLOWLIST_STUDIO_ROLE: AppRole = "OWNER";

export function normalizeStudioAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeStudioAuthEmail(entry))
    .filter(Boolean);
}

export function isStudioAllowlistAuthMode(): boolean {
  return process.env.STUDIO_AUTH_MODE === "allowlist";
}

export function getStudioAllowedEmails(): string[] {
  return parseEmailList(process.env.STUDIO_ALLOWED_EMAILS);
}

export function isStudioEmailAllowed(email: string): boolean {
  return getStudioAllowedEmails().includes(normalizeStudioAuthEmail(email));
}

export function createStudioAllowlistIdentity(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): StudioUserIdentity | null {
  const primaryEmail = normalizeStudioAuthEmail(input.email);

  if (!isStudioEmailAllowed(primaryEmail)) {
    return null;
  }

  const roles: AppRole[] = [ALLOWLIST_STUDIO_ROLE];

  return {
    id: `studio-allowlist:${primaryEmail}`,
    primaryEmail,
    name: input.name?.trim() || null,
    image: input.image || null,
    roles,
    isStaff: canAccessStudio(roles),
  };
}
