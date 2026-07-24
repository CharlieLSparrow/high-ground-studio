import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { validateResearchBundle } from "@/lib/research-portability";
import { applyResearchRestore, buildResearchRestorePlan } from "@/lib/server/research-restore";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before validating or restoring private research." }, { status: 401 });
  }
  const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (!actorEmail) return NextResponse.json({ ok: false, error: "The signed-in account has no verified email identity." }, { status: 401 });
  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project") || "").trim().slice(0, 160);
  const mode = url.searchParams.get("mode") === "apply" ? "apply" : "validate";
  if (!projectSlug) return NextResponse.json({ ok: false, error: "Choose the destination Nest before restoring." }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 30 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "This research bundle is larger than the 30 MB restore limit." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Choose a valid JSON research export." }, { status: 400 });
  }
  const validation = validateResearchBundle(input);
  if (!validation.ok) return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({ projectSlug, email: actorEmail, action: "write", prisma });
  if (!access.allowed || !access.projectId) {
    return NextResponse.json({ ok: false, error: "That destination Nest is unavailable for research restore." }, { status: 404 });
  }

  try {
    if (mode === "validate") {
      const plan = await buildResearchRestorePlan(prisma, {
        projectId: access.projectId,
        actorUserId: session.user.id,
        bundle: validation.bundle,
      });
      return NextResponse.json({
        ok: true,
        mode,
        projectSlug,
        sourceProject: validation.bundle.project,
        plan,
        requiresExplicitApply: true,
      }, { headers: { "cache-control": "private, no-store" } });
    }
    const result = await applyResearchRestore(prisma, {
      projectId: access.projectId,
      actorUserId: session.user.id,
      actorEmail,
      bundle: validation.bundle,
    });
    return NextResponse.json({
      ok: true,
      mode,
      projectSlug,
      manifestSha256: validation.bundle.manifestSha256,
      ...result,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[research-restore] failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not complete this restore safely. Existing sources were not overwritten; retry uses the same restore identities." }, { status: 503 });
  }
}
