import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  assignCoachingForm,
  CoachingFormWorkflowError,
  publishCoachingFormTemplate,
  readCoachingFormWorkflows,
} from "@/lib/server/coaching-form-workflows";
import {
  readCoachingFormAutomationOverview,
  reconcileCoachingFormAutomationForCoach,
  saveCoachingFormAutomationOverride,
  saveCoachingFormAutomationPolicy,
} from "@/lib/server/coaching-form-automation";
import { promoteCoachingFormOutcome } from "@/lib/server/coaching-form-outcomes";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function failure(error: unknown) {
  if (error instanceof CoachingFormWorkflowError) {
    return json(
      { ok: false, error: error.message, code: error.code },
      error.status,
    );
  }
  console.error("Coaching form workflow failed", error);
  return json(
    {
      ok: false,
      error: "That coaching form action could not be completed safely.",
    },
    500,
  );
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user)
    return json({ ok: false, error: "Sign in to open coaching forms." }, 401);
  try {
    const result = await readCoachingFormWorkflows({
      prisma: getPrismaClient(),
      actor: session.user,
    });
    const automation = result.actor.isCoach
      ? await readCoachingFormAutomationOverview({
          prisma: getPrismaClient(),
          actor: session.user,
        })
      : {
          schema: "quipsly-coaching-form-automation-v1",
          policies: [],
          boundaries: { externalSideEffects: false },
        };
    return json({ ok: true, result: { ...result, automation } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user)
    return json({ ok: false, error: "Sign in to manage coaching forms." }, 401);
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return json({ ok: false, error: "The form details are missing." }, 400);
  }
  const action = String(body.action || "")
    .trim()
    .toUpperCase();
  try {
    const prisma = getPrismaClient();
    if (action === "PUBLISH_TEMPLATE") {
      const result = await publishCoachingFormTemplate({
        prisma,
        actor: session.user,
        body,
      });
      return json({ ok: true, result });
    }
    if (action === "ASSIGN_FORM") {
      const result = await assignCoachingForm({
        prisma,
        actor: session.user,
        body,
      });
      return json({ ok: true, result });
    }
    if (action === "SAVE_AUTOMATION_POLICY") {
      const result = await saveCoachingFormAutomationPolicy({
        prisma,
        actor: session.user,
        body,
      });
      return json({ ok: true, result });
    }
    if (action === "SAVE_AUTOMATION_OVERRIDE") {
      const result = await saveCoachingFormAutomationOverride({
        prisma,
        actor: session.user,
        body,
      });
      return json({ ok: true, result });
    }
    if (action === "RECONCILE_AUTOMATION") {
      const result = await reconcileCoachingFormAutomationForCoach({
        prisma,
        actor: session.user,
      });
      return json({ ok: true, result });
    }
    if (action === "PROMOTE_RESPONSE_OUTCOME") {
      const result = await promoteCoachingFormOutcome({
        prisma,
        actor: session.user,
        body,
      });
      return json({ ok: true, result });
    }
    return json({ ok: false, error: "Choose a form action." }, 400);
  } catch (error) {
    return failure(error);
  }
}
