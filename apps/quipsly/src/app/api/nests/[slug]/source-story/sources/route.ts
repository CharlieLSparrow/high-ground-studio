import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { readSourceLibraryPage } from "@/lib/server/source-library";
import { requireSourceStoryAccess } from "@/lib/server/source-story-access";

export const dynamic = "force-dynamic";

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as T;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const actor = await requireSourceStoryAccess(request, slug, "read");
    const url = new URL(request.url);
    const page = await readSourceLibraryPage({
      prisma: getPrismaClient(),
      projectId: actor.projectId,
      cursor: url.searchParams.get("cursor"),
      query: url.searchParams.get("query"),
      limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(jsonSafe({ ok: true, page }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status: number }).status) : 500;
    const safeStatus = status === 400 || status === 401 || status === 404 ? status : 500;
    if (safeStatus === 500) console.error("[source-story-sources] request failed", error);
    return NextResponse.json({
      error: safeStatus === 500 ? "The source library could not be loaded." : (error as Error).message,
      errorCode: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined,
    }, { status: safeStatus, headers: { "Cache-Control": "no-store" } });
  }
}
