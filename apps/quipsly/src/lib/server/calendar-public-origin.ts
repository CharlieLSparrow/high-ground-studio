import "server-only";

const PRODUCTION_CALENDAR_ORIGIN = "https://nest.quipsly.com";

function parseOrigin(value: string) {
  const candidate = value.includes("://") ? value : `https://${value}`;
  const url = new URL(candidate);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The configured Quipsly calendar origin is invalid.");
  }
  return url.origin;
}

export function resolveCalendarPublicOrigin(
  requestUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configured = environment.QUIPSLY_APP_HOST?.trim();
  if (configured) return parseOrigin(configured);
  if (environment.NODE_ENV === "production") {
    return PRODUCTION_CALENDAR_ORIGIN;
  }
  return parseOrigin(new URL(requestUrl).origin);
}
