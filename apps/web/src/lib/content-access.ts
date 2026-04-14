import { auth } from "@/auth";
import type { Session } from "next-auth"; // 👈 [Skippy Detail 1]: We bring in the explicit type here.

// ------------------------------------------------------------------
// 1. Core Types
// ------------------------------------------------------------------

export type AccessLevel = "public" | "team" | "private" | "members";

export type TeamAccessState = {
  isSignedIn: boolean;
  isTeam: boolean;
  email: string | null;
  // 👈 [Skippy Detail 2]: We drop the "ReturnType" gymnastics and explicitly declare this as a Session.
  // This completely vaporizes the "NextMiddleware" build error.
  session: Session | null; 
};

type AccessResolution = TeamAccessState & {
  access: AccessLevel;
  allowed: boolean;
};

// ------------------------------------------------------------------
// 2. Pure Utility Functions 
// (These are great because they don't rely on async/await or databases)
// ------------------------------------------------------------------

function normalizeAccess(access?: string): AccessLevel {
  const value = access?.toLowerCase();

  if (value === "team") return "team";
  if (value === "private") return "private";
  if (value === "members") return "members";

  return "public";
}

function normalizeCsvList(value?: string): string[] {
  // 👈 [Skippy Detail 3]: Filtering by `Boolean` at the end removes empty strings 
  // in case your .env variable has trailing commas (e.g., "joe@test.com,,"). Smart move.
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedTeamEmails(): string[] {
  // Pulls the list of VIPs from the environment variables.
  return normalizeCsvList(process.env.SKIPPY_ALLOWED_EMAILS);
}

// ------------------------------------------------------------------
// 3. Core Async Logic
// ------------------------------------------------------------------

export async function resolveTeamAccess(): Promise<TeamAccessState> {
  // Call the chimera function. Because we are in an async server context, 
  // we know this actually returns a Session (or null).
  const session = await auth(); 
  
  // Safely extract the email. The `?.` (optional chaining) ensures it doesn't crash if user is null.
  const email = session?.user?.email?.toLowerCase() ?? null;
  const isSignedIn = Boolean(session?.user);
  
  // Check if the current user's email is in the VIP list
  const isTeam = email ? getAllowedTeamEmails().includes(email) : false;

  return {
    isSignedIn,
    isTeam,
    email,
    session, // This maps perfectly to `Session | null` now.
  };
}

export async function resolveContentAccess(
  access?: string,
): Promise<AccessResolution> {
  const normalizedAccess = normalizeAccess(access);

  // Fast-path out if it's public. No need to query the auth server.
  if (normalizedAccess === "public") {
    return {
      access: normalizedAccess,
      allowed: true,
      isSignedIn: false,
      isTeam: false,
      email: null,
      session: null,
    };
  }

  // If it's not public, we hit the auth server to get their credentials.
  const teamAccess = await resolveTeamAccess();

  let allowed = false;

  // 👈 [Skippy Detail 4]: This switch statement is incredibly clean. 
  // It handles the cascading permission levels perfectly.
  switch (normalizedAccess) {
    case "members":
      allowed = teamAccess.isSignedIn; // Any logged-in user
      break;
    case "team":
    case "private":
      allowed = teamAccess.isTeam; // Only VIPs listed in the .env
      break;
    default:
      allowed = false;
  }

  return {
    access: normalizedAccess,
    allowed,
    ...teamAccess,
  };
}

export function buildSignInHref(callbackPath: string): string {
  const normalized = callbackPath.startsWith("/")
    ? callbackPath
    : `/${callbackPath}`;

  // Ensures users are redirected exactly back to the page they hit a wall on.
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(normalized)}`;
}