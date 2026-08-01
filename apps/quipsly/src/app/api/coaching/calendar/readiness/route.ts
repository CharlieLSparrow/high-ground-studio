import { NextResponse } from "next/server";

import {
  checkCoachingCalendarAccess,
  getCoachingCalendarReadiness,
} from "@/lib/server/coaching-google-calendar";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const url = new URL(request.url);
  const verifyAccess = url.searchParams.get("verify") === "1";

  if (!session?.user) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before checking coaching calendar readiness.",
        readiness: getCoachingCalendarReadiness(),
      },
      { status: 401 },
    );
  }

  if (verifyAccess && !session.user.isStaff) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only staff can verify provider calendar access.",
        readiness: getCoachingCalendarReadiness(),
      },
      { status: 403 },
    );
  }

  if (!verifyAccess) {
    return NextResponse.json({
      ok: true,
      signedIn: true,
      verifiedProviderAccess: false,
      externalMutated: false,
      readiness: getCoachingCalendarReadiness(),
      nextAction:
        "Add ?verify=1 as staff to perform a read-only Google Calendar event-access check.",
    });
  }

  try {
    const check = await checkCoachingCalendarAccess();
    return NextResponse.json({
      ok: check.accessOk === true,
      signedIn: true,
      verifiedProviderAccess: true,
      externalMutated: false,
      readiness: check,
      nextAction: check.accessOk
        ? "Calendar event access is readable. Quipsly can attach calendar evidence when an operator explicitly syncs a booking."
        : "Fix Google Calendar credentials or sharing before syncing booking evidence.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar readiness check failed.";
    return NextResponse.json(
      {
        ok: false,
        signedIn: true,
        verifiedProviderAccess: true,
        externalMutated: false,
        error: message,
        readiness: {
          ...getCoachingCalendarReadiness(),
          accessOk: false,
          accessStatus: "error",
          externalMutated: false,
          message,
        },
      },
      { status: 503 },
    );
  }
}
