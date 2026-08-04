import { NextResponse } from "next/server";

import {
  changeCoachingEngagementMemberAccess,
  CoachingEngagementMembershipError,
  inviteCoachingEngagementMember,
  loadCoachingEngagementMembershipBoundary,
  revokeCoachingEngagementInvitation,
} from "@/lib/server/coaching-engagement-membership";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ engagementId: string }> };

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function body(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function failure(error: unknown) {
  if (error instanceof CoachingEngagementMembershipError) {
    return privateJson({ ok: false, error: error.message, code: error.code }, error.status);
  }
  console.error("Coaching engagement membership operation failed", error);
  return privateJson({ ok: false, error: "Membership could not be updated safely." }, 500);
}

export async function GET(request: Request, context: Context) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return privateJson({ ok: false, error: "Sign in to manage this engagement." }, 401);
  const { engagementId } = await context.params;
  try {
    const boundary = await loadCoachingEngagementMembershipBoundary({
      engagementId,
      actor: session.user,
      manage: true,
    });
    return privateJson({ ok: true, boundary });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return privateJson({ ok: false, error: "Sign in to manage this engagement." }, 401);
  const { engagementId } = await context.params;
  const input = await body(request);
  const action = text(input.action, 40).toUpperCase();
  const requestId = text(input.requestId, 80);
  if (!UUID.test(requestId)) return privateJson({ ok: false, error: "A valid operation identity is required." }, 400);

  try {
    if (action === "INVITE") {
      const result = await inviteCoachingEngagementMember({
        engagementId,
        actor: session.user,
        email: text(input.email, 320),
        name: text(input.name, 200) || null,
        role: input.role,
        reason: text(input.reason, 1_000) || null,
        requestId,
        origin: new URL(request.url).origin,
      });
      return privateJson({ ok: true, result }, 201);
    }
    if (action === "REMOVE" || action === "RESTORE") {
      const expectedRevision = Number(input.expectedRevision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return privateJson({ ok: false, error: "Refresh the membership before changing access." }, 400);
      }
      const result = await changeCoachingEngagementMemberAccess({
        engagementId,
        actor: session.user,
        memberId: text(input.memberId, 200),
        action,
        expectedRevision,
        requestId,
        reason: text(input.reason, 1_000) || null,
      });
      return privateJson({ ok: true, result });
    }
    if (action === "REVOKE_INVITE") {
      const result = await revokeCoachingEngagementInvitation({
        engagementId,
        actor: session.user,
        invitationId: text(input.invitationId, 200),
        requestId,
        reason: text(input.reason, 1_000) || null,
      });
      return privateJson({ ok: true, result });
    }
    return privateJson({ ok: false, error: "Choose invite, remove, restore, or revoke invitation." }, 400);
  } catch (error) {
    return failure(error);
  }
}
