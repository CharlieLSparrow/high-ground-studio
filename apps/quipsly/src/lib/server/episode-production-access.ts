import "server-only";

import type { PrismaClient } from "@prisma/client";

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  type StudioProjectAccessAction,
  type StudioProjectAccessResolution,
} from "@/lib/server/studio-project-access";

export type EpisodeProductionActor = {
  id: string;
  email: string;
  name: string;
  isStaff: boolean;
  source:
    | "embedded-cookie"
    | "firebase-bearer"
    | "mac-access-token"
    | "mac-session-token"
    | "mac-web-session"
    | "none";
};

export type EpisodeProductionAccessResult =
  | {
      allowed: true;
      actor: EpisodeProductionActor;
      access: StudioProjectAccessResolution;
    }
  | {
      allowed: false;
      status: 401 | 403;
      code: "episode-production-auth-required" | "episode-production-access-denied";
      error: string;
      actor: EpisodeProductionActor;
      access: StudioProjectAccessResolution | null;
    };

function cleanString(value?: string | null) {
  return String(value ?? "").trim();
}

export async function resolveEpisodeProductionActor(request: Request): Promise<EpisodeProductionActor> {
  const session = await getQuipslySessionFromRequest(request);
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
      || session?.user?.email,
  );
  const usesBearer = request.headers
    .get("authorization")
    ?.startsWith("Bearer ") === true;
  return {
    id: cleanString(session?.user?.id),
    email,
    name: cleanString(session?.user?.name || email),
    isStaff: session?.user?.isStaff === true,
    source: session?.user?.id
      ? usesBearer
        ? "firebase-bearer"
        : "embedded-cookie"
      : "none",
  };
}

export async function resolveEpisodeProductionAccess({
  request,
  projectSlug,
  action = "write",
  prisma,
}: {
  request: Request;
  projectSlug: string;
  action?: StudioProjectAccessAction;
  prisma: PrismaClient;
}): Promise<EpisodeProductionAccessResult> {
  const actor = await resolveEpisodeProductionActor(request);

  if (!actor.email) {
    return {
      allowed: false,
      status: 401,
      code: "episode-production-auth-required",
      error: "Sign in to Nest before this episode production room can save or sync.",
      actor,
      access: null,
    };
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actor.email,
    action,
    prisma,
  });

  if (!access.allowed) {
    return {
      allowed: false,
      status: 403,
      code: "episode-production-access-denied",
      error: `This Nest account does not have ${action} access to ${projectSlug}.`,
      actor,
      access,
    };
  }

  return { allowed: true, actor, access };
}
