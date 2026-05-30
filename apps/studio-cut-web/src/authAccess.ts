export type StudioCutAuthAccessConfig = {
  allowedEmails: readonly string[];
  allowedEmailDomains: readonly string[];
};

export type StudioCutAuthAccessResult =
  | { allowed: true; reason: "email" | "domain" }
  | { allowed: false; reason: "missing_email" | "not_allowed" };

export function parseAllowedEmails(value: string | undefined) {
  return parseCommaSeparatedValues(value)
    .map((email) => email.toLowerCase())
    .filter((email) => email.includes("@"));
}

export function parseAllowedEmailDomains(value: string | undefined) {
  return parseCommaSeparatedValues(value)
    .map(normalizeAllowedEmailDomain)
    .filter(Boolean);
}

export function isStudioCutAccessConfigured(
  config: StudioCutAuthAccessConfig,
) {
  return config.allowedEmails.length > 0 || config.allowedEmailDomains.length > 0;
}

export function checkStudioCutEmailAccess(
  email: string | null | undefined,
  config: StudioCutAuthAccessConfig,
): StudioCutAuthAccessResult {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return { allowed: false, reason: "missing_email" };
  }

  if (config.allowedEmails.includes(normalizedEmail)) {
    return { allowed: true, reason: "email" };
  }

  const emailDomain = getEmailDomain(normalizedEmail);

  if (emailDomain && config.allowedEmailDomains.includes(emailDomain)) {
    return { allowed: true, reason: "domain" };
  }

  return { allowed: false, reason: "not_allowed" };
}

export function getAllowedAccessDescription(
  config: StudioCutAuthAccessConfig,
) {
  const hasEmails = config.allowedEmails.length > 0;
  const hasDomains = config.allowedEmailDomains.length > 0;

  if (hasEmails && hasDomains) {
    return "an approved email address or approved High Ground Odyssey email domain";
  }

  if (hasDomains) {
    return "an approved High Ground Odyssey email domain";
  }

  return "an approved email address";
}

function parseCommaSeparatedValues(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAllowedEmailDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex < 0 || atIndex === email.length - 1) {
    return undefined;
  }

  return email.slice(atIndex + 1).toLowerCase();
}
