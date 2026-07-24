import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { buildPortableNestExport } from "@/lib/server/nest-portable-export";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before exporting a private Nest." }, { status: 401 });
  }
  const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (!actorEmail) {
    return NextResponse.json({ ok: false, error: "The signed-in account has no verified email identity." }, { status: 401 });
  }
  const { slug } = await context.params;
  const projectSlug = slug.trim().slice(0, 200);
  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "Choose one Nest to export." }, { status: 400 });
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
      error: "Only a Nest owner can export its complete notes, vocabulary, and personal work package.",
    }, { status: 404 });
  }

  try {
    const bundle = await buildPortableNestExport(prisma, {
      projectId: access.projectId,
      actorUserId: session.user.id,
    });
    const filename = `quipsly-${bundle.sourceNest.slug}-nest-${bundle.exportedAt.slice(0, 10)}.json`
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[nest-portable-export] failed", error);
    return NextResponse.json({
      ok: false,
      error: "Quipsly could not verify and export this private Nest package.",
    }, { status: 503 });
  }
}
