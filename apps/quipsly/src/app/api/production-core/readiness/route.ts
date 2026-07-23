import { NextResponse } from "next/server";
import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getProductionCoreReadinessSafe();
  const { error: _privateError, ...publicReadiness } = readiness;
  return NextResponse.json(
    readiness.status === "error"
      ? { ...publicReadiness, error: "Production core schema query is unavailable." }
      : publicReadiness,
    {
      status: readiness.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
