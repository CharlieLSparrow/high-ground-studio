import { NextResponse } from "next/server";

import { validateNestBundle } from "@/lib/nest-portability";
import { getPrismaClient } from "@/lib/prisma";
import {
  applyNestRestore,
  buildNestRestorePlan,
  nestRestorePlanSha256,
  NestRestorePlanChangedError,
} from "@/lib/server/nest-portable-restore";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BUNDLE_BYTES = 30 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before validating or restoring a private Nest." }, { status: 401 });
  }
  const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (!actorEmail) {
    return NextResponse.json({ ok: false, error: "The signed-in account has no verified email identity." }, { status: 401 });
  }
  const { slug } = await context.params;
  const projectSlug = slug.trim().slice(0, 200);
  const mode = new URL(request.url).searchParams.get("mode") === "apply" ? "apply" : "validate";
  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "Choose the destination Nest before restoring." }, { status: 400 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BUNDLE_BYTES) {
    return NextResponse.json({ ok: false, error: "This Nest bundle is larger than the 30 MB restore limit." }, { status: 413 });
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BUNDLE_BYTES) {
      return NextResponse.json({ ok: false, error: "This Nest bundle is larger than the 30 MB restore limit." }, { status: 413 });
    }
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Choose a valid JSON Nest export." }, { status: 400 });
  }
  const validation = validateNestBundle(input);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "manage",
    prisma,
  });
  if (!access.allowed || !access.projectId) {
    return NextResponse.json({
      ok: false,
      error: "Only a Nest owner can restore a portable package into this destination.",
    }, { status: 404 });
  }

  try {
    if (mode === "validate") {
      const plan = await buildNestRestorePlan(prisma, {
        projectId: access.projectId,
        actorUserId: session.user.id,
        bundle: validation.bundle,
      });
      return NextResponse.json({
        ok: true,
        mode,
        destinationNestSlug: projectSlug,
        sourceNest: validation.bundle.sourceNest,
        plan,
        planSha256: nestRestorePlanSha256(plan),
        requiresExplicitApply: true,
      }, { headers: { "cache-control": "private, no-store" } });
    }
    const expectedPlanSha256 = request.headers.get("x-quipsly-restore-plan-sha256")?.trim().toLowerCase() || "";
    if (!/^[a-f0-9]{64}$/.test(expectedPlanSha256)) {
      return NextResponse.json({
        ok: false,
        error: "Validate this package and review its current restore plan before applying it.",
      }, { status: 428, headers: { "cache-control": "private, no-store" } });
    }
    const result = await applyNestRestore(prisma, {
      projectId: access.projectId,
      actorUserId: session.user.id,
      actorEmail,
      bundle: validation.bundle,
      expectedPlanSha256,
    });
    return NextResponse.json({
      ok: true,
      mode,
      destinationNestSlug: projectSlug,
      manifestSha256: validation.bundle.manifestSha256,
      ...result,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NestRestorePlanChangedError) {
      return NextResponse.json({
        ok: false,
        error: "This destination changed after validation. Nothing was restored; validate again to review the current plan.",
      }, { status: 409, headers: { "cache-control": "private, no-store" } });
    }
    console.error("[nest-portable-restore] failed", error);
    return NextResponse.json({
      ok: false,
      error: "Quipsly could not complete this restore safely. Existing records were not overwritten; retrying the same bundle reuses the same identities.",
    }, { status: 503 });
  }
}
