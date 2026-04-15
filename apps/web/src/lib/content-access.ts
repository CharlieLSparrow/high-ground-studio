import { auth } from "@/auth";
import { canAccessInternalContent } from "@/lib/authz";
import type { AppRole } from "@prisma/client";
import type { Session } from "next-auth";

export type AccessLevel = "public" | "team" | "private" | "members";

export type TeamAccessState = {
  isSignedIn: boolean;
  isTeam: boolean;
  email: string | null;
  roles: AppRole[];
  session: Session | null;
};

type AccessResolution = TeamAccessState & {
  access: AccessLevel;
  allowed: boolean;
};

function normalizeAccess(access?: string): AccessLevel {
  const value = access?.toLowerCase();

  if (value === "team") return "team";
  if (value === "private") return "private";
  if (value === "members") return "members";

  return "public";
}

export async function resolveTeamAccess(): Promise<TeamAccessState> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? null;
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const isSignedIn = Boolean(session?.user);
  const isTeam = canAccessInternalContent(roles);

  return {
    isSignedIn,
    isTeam,
    email,
    roles,
    session,
  };
}

export async function resolveContentAccess(
  access?: string,
): Promise<AccessResolution> {
  const normalizedAccess = normalizeAccess(access);

  if (normalizedAccess === "public") {
    return {
      access: normalizedAccess,
      allowed: true,
      isSignedIn: false,
      isTeam: false,
      email: null,
      roles: [],
      session: null,
    };
  }

  const teamAccess = await resolveTeamAccess();

  let allowed = false;

  switch (normalizedAccess) {
    case "members":
      allowed = teamAccess.isSignedIn;
      break;
    case "team":
    case "private":
      allowed = teamAccess.isTeam;
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

  return `/api/auth/signin?callbackUrl=${encodeURIComponent(normalized)}`;
}