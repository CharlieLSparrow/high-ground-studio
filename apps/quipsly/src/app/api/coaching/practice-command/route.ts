import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { loadCoachingPracticeCommandForActor } from "@/lib/server/coaching-practice-command";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before opening your coaching practice." },
      { status: 401 },
    );
  }

  const generatedAt = new Date();
  const practiceCommand = await loadCoachingPracticeCommandForActor({
    prisma: getPrismaClient() as any,
    userId: session.user.id,
    now: generatedAt,
  });
  return NextResponse.json({
    ok: true,
    generatedAt: generatedAt.toISOString(),
    user: {
      id: session.user.id,
      isCoach: practiceCommand !== null,
      isStaff: session.user.isStaff,
    },
    practiceCommand,
    boundaries: {
      exactCoachOnly: true,
      readOnly: true,
      externalSideEffects: false,
      completeRunwayLoaded: false,
    },
  });
}
