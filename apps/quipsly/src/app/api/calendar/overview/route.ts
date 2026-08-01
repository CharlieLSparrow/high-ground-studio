import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { loadCalendarOverviewForActor } from "@/lib/server/calendar-overview";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } },
    );
  }

  try {
    const prisma = getPrismaClient();
    const visibleProjects = await listProjectsVisibleToEmail(session.user.primaryEmail, prisma);
    const overview = await loadCalendarOverviewForActor({
      actor: { id: session.user.id },
      visibleProjectIds: visibleProjects.map((project) => project.id),
      prisma,
    });

    return NextResponse.json(
      { ok: true, overview },
      { headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } },
    );
  } catch (error) {
    console.error("[calendar-overview] Failed to read calendar readiness", error);
    return NextResponse.json(
      { ok: false, error: "Calendar readiness is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } },
    );
  }
}
