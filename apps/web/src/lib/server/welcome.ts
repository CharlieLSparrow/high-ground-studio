import "server-only";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

const DEFAULT_POST_WELCOME_PATH = "/dashboard";

export function hasCompletedWelcome(session: Session | null | undefined) {
  return Boolean(session?.user?.welcomeCompletedAt);
}

export function sanitizeWelcomeRedirectPath(
  rawValue: string | null | undefined,
  fallback: string = DEFAULT_POST_WELCOME_PATH,
) {
  const value = rawValue?.trim();

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (value === "/welcome" || value.startsWith("/welcome?")) {
    return fallback;
  }

  if (value.startsWith("/api/auth")) {
    return fallback;
  }

  return value;
}

export function redirectToWelcomeIfNeeded(
  session: Session | null | undefined,
  currentPath: string,
) {
  if (!session?.user || hasCompletedWelcome(session)) {
    return;
  }

  const next = sanitizeWelcomeRedirectPath(currentPath, "/");
  redirect(`/welcome?next=${encodeURIComponent(next)}`);
}

export function redirectAwayFromWelcomeIfComplete(
  session: Session | null | undefined,
  nextPath: string | null | undefined,
) {
  if (!session?.user || !hasCompletedWelcome(session)) {
    return;
  }

  redirect(sanitizeWelcomeRedirectPath(nextPath));
}
