import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveMacSessionActor } from "@/lib/server/mac-session-token";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (session?.user?.id) {
    return NextResponse.json({
      ok: true,
      source: "embedded-cookie",
      user: {
        id: session.user.id,
        email: session.user.primaryEmail || session.user.email,
        name: session.user.name,
        roles: session.user.roles || [],
      },
    });
  }

  const actor = resolveMacSessionActor(request);
  if (actor) {
    return NextResponse.json({
      ok: true,
      source: actor.source,
      expiresAt: actor.expiresAt ? new Date(actor.expiresAt).toISOString() : null,
      user: {
        id: actor.id,
        email: actor.primaryEmail || actor.email,
        name: actor.name,
        roles: actor.roles,
      },
    });
  }

  return NextResponse.json({
    ok: false,
    error: "No embedded Nest session or valid Quipsly Mac session token was found.",
  }, { status: 401 });
}
