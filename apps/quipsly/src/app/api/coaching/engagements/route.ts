import { NextResponse } from "next/server";
import { createCoachingClientSpace, coachingClientSchedulingContext, CoachingClientSpaceError } from "@/lib/server/coaching-client-space";
import { CoachingEngagementError } from "@/lib/server/coaching-engagement";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return json({ error: "Sign in to schedule a session." }, 401);
  const engagementId = new URL(request.url).searchParams.get("engagementId");
  if (!engagementId || engagementId.length > 200) return json({ error: "Choose a client space." }, 400);
  try {
    return json({ context: await coachingClientSchedulingContext({ actor: session.user, engagementId }) });
  } catch (error) {
    if (error instanceof CoachingClientSpaceError) return json({ error: error.message }, error.status);
    return json({ error: "We couldn’t load this client. Please try again." }, 500);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return json({ error: "Sign in to add a client." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Enter the client’s email." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Enter the client’s email." }, 400);
  const fields = body as Record<string, unknown>;
  try {
    const space = await createCoachingClientSpace({
      actor: session.user,
      email: typeof fields.email === "string" ? fields.email : "",
      name: typeof fields.name === "string" ? fields.name : "",
    });
    return json({ space }, 201);
  } catch (error) {
    if (error instanceof CoachingClientSpaceError || error instanceof CoachingEngagementError) return json({ error: error.message }, error.status);
    console.error("Client space creation failed", error instanceof Error ? error.name : "unknown error");
    return json({ error: "We couldn’t create the client space. Please try again." }, 500);
  }
}
