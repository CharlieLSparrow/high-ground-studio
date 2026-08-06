import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import {
  StudioTranscriptTerminologyError,
  createStudioTranscriptTerminologyTerm,
  mutateStudioTranscriptTerminologyTerm,
  readStudioTranscriptTerminology,
} from "@/lib/server/studio-transcript-terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max = 240) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map((entry) => text(entry, 120)).filter(Boolean) : []; }
function terminologyValue(body: Record<string, unknown>) {
  return {
    canonicalText: text(body.canonicalText, 120),
    aliases: stringArray(body.aliases),
    category: text(body.category, 40) || "general",
    pronunciationHint: text(body.pronunciationHint, 160) || null,
    contextHint: text(body.contextHint, 240) || null,
    priority: body.priority == null ? 50 : Number(body.priority),
  };
}

export async function GET(request: NextRequest) {
  const projectSlug = text(request.nextUrl.searchParams.get("projectSlug"), 120);
  const projectId = text(request.nextUrl.searchParams.get("projectId"), 160);
  if (!projectSlug) return NextResponse.json({ ok: false, code: "TERMINOLOGY_INVALID", error: "projectSlug is required." }, { status: 400 });
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "read", prisma });
  if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
  const result = await readStudioTranscriptTerminology({ prisma, projectId: access.access.projectId! });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = record(await request.json()); } catch { /* validated below */ }
  const projectSlug = text(body.projectSlug, 120);
  const projectId = text(body.projectId, 160);
  const operation = text(body.operation, 40).toLowerCase();
  if (!projectSlug || !["create", "update", "archive", "restore"].includes(operation)) {
    return NextResponse.json({ ok: false, code: "TERMINOLOGY_INVALID", error: "A Nest and supported terminology operation are required." }, { status: 400 });
  }
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({ request, ...(projectId ? { projectId } : {}), projectSlug, action: "write", prisma });
  if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
  try {
    const actor = { id: access.actor.id, email: access.actor.email };
    const result = operation === "create"
      ? await createStudioTranscriptTerminologyTerm({ prisma, projectId: access.access.projectId!, actor, value: terminologyValue(body) })
      : await mutateStudioTranscriptTerminologyTerm({
          prisma,
          projectId: access.access.projectId!,
          actor,
          termId: text(body.termId, 160),
          expectedRevision: Number(body.expectedRevision),
          operation: operation as "update" | "archive" | "restore",
          ...(operation === "update" ? { value: terminologyValue(body) } : {}),
        });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof StudioTranscriptTerminologyError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    }
    console.error("[transcript terminology] mutation failed", error);
    return NextResponse.json({ ok: false, code: "TERMINOLOGY_UNAVAILABLE", error: "Quipsly could not update this vocabulary. No transcript or existing term was changed." }, { status: 503 });
  }
}
