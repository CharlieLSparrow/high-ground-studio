import "server-only";

import { NextResponse } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";

export function studioJsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function getStudioApiActor(featureName: string) {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: studioJsonError(`Sign in to use ${featureName}.`, 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: studioJsonError(
        `This account cannot access ${featureName}.`,
        403,
      ),
    };
  }

  const ownerEmail =
    access.session?.user?.primaryEmail || access.session?.user?.email || "";

  if (!ownerEmail) {
    return {
      ok: false as const,
      response: studioJsonError("Studio session is missing an owner email.", 400),
    };
  }

  return {
    ok: true as const,
    ownerEmail,
    actorLabel: access.actorLabel,
  };
}
