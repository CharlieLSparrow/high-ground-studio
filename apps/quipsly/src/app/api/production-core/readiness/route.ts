import { NextResponse } from "next/server";
import { getProductionCoreReadiness } from "@/lib/server/production-core-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const readiness = await getProductionCoreReadiness();

    return NextResponse.json(
      readiness,
      {
        status: readiness.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const generatedAt = new Date().toISOString();
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        generatedAt,
        error: error instanceof Error ? error.message : "Production core readiness check failed.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
