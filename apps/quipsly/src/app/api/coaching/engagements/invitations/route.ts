import { NextResponse } from "next/server";

import {
  acceptCoachingEngagementInvitation,
  CoachingEngagementMembershipError,
  previewCoachingEngagementInvitation,
} from "@/lib/server/coaching-engagement-membership";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  let input: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) input = parsed;
  } catch {
    return json({ ok: false, error: "Invitation details are missing." }, 400);
  }
  const action = String(input.action || "PREVIEW").trim().toUpperCase();
  const token = String(input.token || "").trim();
  const session = await getQuipslySessionFromRequest(request);
  try {
    if (action === "PREVIEW") {
      const result = await previewCoachingEngagementInvitation({ token, actor: session?.user || null });
      return json({ ok: true, result });
    }
    if (action === "ACCEPT") {
      if (!session?.user) return json({ ok: false, error: "Sign in before accepting this invitation." }, 401);
      const requestId = String(input.requestId || "").trim();
      if (!UUID.test(requestId)) return json({ ok: false, error: "A valid acceptance identity is required." }, 400);
      const result = await acceptCoachingEngagementInvitation({ token, actor: session.user, requestId });
      return json({ ok: true, result });
    }
    return json({ ok: false, error: "Choose preview or accept." }, 400);
  } catch (error) {
    if (error instanceof CoachingEngagementMembershipError) {
      return json({ ok: false, error: error.message, code: error.code }, error.status);
    }
    console.error("Coaching invitation operation failed", error);
    return json({ ok: false, error: "The invitation could not be reviewed safely." }, 500);
  }
}
