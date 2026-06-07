import "server-only";

import type { StudioProjectAccessAction } from "@/lib/server/studio-project-access";
import {
  canAccessStudioProjectBySlug,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

function parseConfiguredPrivateFictionOwners() {
  const envValue = process.env.PRIVATE_FICTION_OWNER_EMAILS;
  if (!envValue) return ["charlielsparrow@gmail.com"];

  return envValue
    .split(",")
    .map((email) => normalizePrivateFictionEmail(email))
    .filter(Boolean);
}

const PRIVATE_FICTION_OWNER_EMAILS = parseConfiguredPrivateFictionOwners();

export const PRIVATE_FICTION_OWNER_EMAIL = PRIVATE_FICTION_OWNER_EMAILS[0] ?? "charlielsparrow@gmail.com";
export const PRIVATE_FICTION_PROJECT_SLUG = "charlie-melissa-fiction-lab";
export const LEGACY_PRIVATE_FICTION_PROJECT_SLUG = "heartward-spiral-private-fiction";
export const PRIVATE_FICTION_SERIES_SLUG = "my-heart-is-a-junkyard-starship";
export const PRIVATE_FICTION_ISSUE_SLUG = "issue-001-tenderness-of-unlawful-design";

export function normalizePrivateFictionEmail(email?: string | null) {
  return normalizeAccessEmail(email);
}

export function isPrivateFictionBootstrapOwner(email?: string | null) {
  const normalized = normalizePrivateFictionEmail(email);
  return Boolean(normalized && PRIVATE_FICTION_OWNER_EMAILS.includes(normalized));
}

export async function canAccessPrivateFictionNest(
  email?: string | null,
  action: StudioProjectAccessAction = "read",
) {
  if (isPrivateFictionBootstrapOwner(email)) return true;

  return canAccessStudioProjectBySlug({
    projectSlug: PRIVATE_FICTION_PROJECT_SLUG,
    email,
    action,
  });
}

export async function canManagePrivateFictionNest(email?: string | null) {
  if (isPrivateFictionBootstrapOwner(email)) return true;

  const resolution = await resolveStudioProjectAccess({
    projectSlug: PRIVATE_FICTION_PROJECT_SLUG,
    email,
    action: "manage",
  });

  return resolution.allowed;
}

// Compatibility shim for older server-only call sites that only needed the
// original Charlie bootstrap check. New code should use canAccessPrivateFictionNest.
export function canAccessPrivateFiction(email?: string | null) {
  return isPrivateFictionBootstrapOwner(email);
}
