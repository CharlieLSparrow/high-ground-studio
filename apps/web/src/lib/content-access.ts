import { auth } from "@/auth";

export type AccessLevel = "public" | "team" | "private" | "members";

export type TeamAccessState = {
  isSignedIn: boolean;
  isTeam: boolean;
  email: string | null;
  session: Awaited<ReturnType<typeof auth>> | null;
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

function normalizeCsvList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedTeamEmails(): string[] {
  return normalizeCsvList(process.env.SKIPPY_ALLOWED_EMAILS);
}

export async function resolveTeamAccess(): Promise<TeamAccessState> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? null;
  const isSignedIn = Boolean(session?.user);
  const isTeam = email ? getAllowedTeamEmails().includes(email) : false;

  return {
    isSignedIn,
    isTeam,
    email,
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