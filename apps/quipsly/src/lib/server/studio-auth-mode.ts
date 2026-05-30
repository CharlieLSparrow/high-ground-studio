import "server-only";

import type { AppRole } from "@prisma/client";

import {
  createStudioAllowlistIdentityFromList,
  isStudioAllowlistAuthModeValue,
  isStudioEmailAllowedInList,
  normalizeStudioAuthEmail,
  parseStudioEmailList,
} from "@/lib/studio-auth-mode-core.mjs";
import type { StudioUserIdentity } from "./studio-user-identity";
import { canAccessStudio } from "@/lib/studio-authz";

export { normalizeStudioAuthEmail };

export function isStudioAllowlistAuthMode(): boolean {
  return isStudioAllowlistAuthModeValue(process.env.STUDIO_AUTH_MODE);
}

export function getStudioAllowedEmails(): string[] {
  return parseStudioEmailList(process.env.STUDIO_ALLOWED_EMAILS);
}

export function isStudioEmailAllowed(email: string): boolean {
  return isStudioEmailAllowedInList(email, process.env.STUDIO_ALLOWED_EMAILS);
}

export function createStudioAllowlistIdentity(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): StudioUserIdentity | null {
  const identity = createStudioAllowlistIdentityFromList(
    input,
    process.env.STUDIO_ALLOWED_EMAILS,
  );

  if (!identity) {
    return null;
  }

  const roles = identity.roles as AppRole[];

  return {
    ...identity,
    roles,
    isStaff: canAccessStudio(roles),
  };
}
