export const STUDIO_ALLOWLIST_MODE = "allowlist";
export const STUDIO_ALLOWLIST_ROLE = "OWNER";
export const STUDIO_ACCESS_ROLE_SET = new Set([
  "OWNER",
  "TEAM_SCHEDULER",
  "COACH",
]);

export function normalizeStudioAuthEmail(email) {
  return String(email).trim().toLowerCase();
}

export function parseStudioEmailList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => normalizeStudioAuthEmail(entry))
    .filter(Boolean);
}

export function isStudioAllowlistAuthModeValue(value) {
  return value === STUDIO_ALLOWLIST_MODE;
}

export function isStudioEmailAllowedInList(email, allowedEmails) {
  return parseStudioEmailList(allowedEmails).includes(
    normalizeStudioAuthEmail(email),
  );
}

export function createStudioAllowlistIdentityFromList(input, allowedEmails) {
  const primaryEmail = normalizeStudioAuthEmail(input.email);

  if (!isStudioEmailAllowedInList(primaryEmail, allowedEmails)) {
    return null;
  }

  const roles = [STUDIO_ALLOWLIST_ROLE];

  return {
    id: `studio-allowlist:${primaryEmail}`,
    primaryEmail,
    name: input.name?.trim() || null,
    image: input.image || null,
    roles,
    isStaff: roles.some((role) => STUDIO_ACCESS_ROLE_SET.has(role)),
  };
}
