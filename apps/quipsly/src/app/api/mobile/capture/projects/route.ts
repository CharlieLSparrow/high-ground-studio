import { NextResponse } from "next/server";

import {
  createNestWithOwner,
  QuipslyNestCreateIdentityConflictError,
} from "@/lib/server/quipsly-core";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_KINDS = new Set([
  "writing",
  "study",
  "production",
  "research",
  "course",
  "gallery",
  "fiction",
  "mixed",
]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonResponse(
      { ok: false, code: "PROJECT_SIGN_IN_REQUIRED", error: "Sign in before creating a private project." },
      401,
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    body = {};
  }

  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  const name = normalizedText(body.name);
  const description = text(body.description, 2_000);
  const nestKind = text(body.nestKind, 40).toLowerCase();
  const clientRequestId = text(body.clientRequestId, 80).toLowerCase();

  if (!actorEmail) {
    return jsonResponse(
      { ok: false, code: "PROJECT_IDENTITY_REQUIRED", error: "The signed-in account has no verified Quipsly email." },
      403,
    );
  }
  if (!name) {
    return jsonResponse(
      { ok: false, code: "PROJECT_NAME_REQUIRED", error: "Give this project a name." },
      400,
    );
  }
  if (name.length > 120) {
    return jsonResponse(
      { ok: false, code: "PROJECT_NAME_TOO_LONG", error: "Keep the project name to 120 characters." },
      400,
    );
  }
  if (!SUPPORTED_KINDS.has(nestKind)) {
    return jsonResponse(
      { ok: false, code: "PROJECT_KIND_INVALID", error: "Choose a supported Quipsly project type." },
      400,
    );
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clientRequestId)) {
    return jsonResponse(
      { ok: false, code: "PROJECT_REQUEST_ID_INVALID", error: "The protected project retry identity is invalid." },
      400,
    );
  }
  const projectAccess = await quipslyCoachCapabilityAccess({
    prisma: getPrismaClient(),
    userId: session.user.id,
    capability: "workspace.private_nests",
    isStaff: session.user.isStaff,
  });
  if (!projectAccess.allowed) {
    return jsonResponse(
      {
        ok: false,
        code: "QUIPSLY_SUBSCRIPTION_REQUIRED",
        error: "Start or restore your Quipsly Coach plan to create another private Nest. Your Home Nest and every Nest shared with you remain available.",
        managementURL: "/settings#subscription",
      },
      402,
    );
  }

  try {
    const result = await createNestWithOwner({
      name,
      description: description || null,
      nestKind,
      ownerEmail: actorEmail,
      clientRequestId,
    });
    return jsonResponse({
      ok: true,
      schema: "quipsly-mobile-project-create-v1",
      idempotentReplay: result.idempotentReplay,
      receiptId: result.receiptId,
      project: {
        id: result.nest.id,
        slug: result.nest.slug,
        name: result.nest.name,
        role: "OWNER",
        canWrite: true,
        isHomeNest: false,
        kind: result.nest.kind,
      },
      document: result.document,
      boundaries: {
        actorScoped: true,
        canonicalProjectCreated: true,
        ownerGrantCreated: true,
        slugCollisionCannotGrantExistingOwnership: true,
        retryIdentityProtected: true,
        externalSideEffects: false,
      },
    });
  } catch (error) {
    if (error instanceof QuipslyNestCreateIdentityConflictError) {
      return jsonResponse(
        {
          ok: false,
          code: "PROJECT_REQUEST_ID_CONFLICT",
          error: "That retry identity already belongs to a different project request. Nothing was changed.",
        },
        409,
      );
    }
    console.error("[mobile-project-create] canonical project creation failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse(
      {
        ok: false,
        code: "PROJECT_CREATE_UNAVAILABLE",
        error: "Quipsly could not create the private project. The request remains safe to retry.",
      },
      503,
    );
  }
}
