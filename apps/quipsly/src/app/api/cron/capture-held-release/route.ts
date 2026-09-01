import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { authorizeCaptureTranscriptFollowThroughWorker } from "@/lib/server/capture-transcript-follow-through-worker";
import { runHeldMobileCaptureReleaseMaintenance } from "@/lib/server/mobile-capture-held-release-worker";

export const runtime = "nodejs";
export const maxDuration = 900;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeCaptureTranscriptFollowThroughWorker({
    authorization: request.headers.get("authorization"),
  });
  if (authorization === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "Capture recovery is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (authorization !== "authorized") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    // One source per request keeps long 4K SHA-256 verification bounded and
    // prevents storage throughput from competing with ordinary transcript work.
    const result = await runHeldMobileCaptureReleaseMaintenance({
      prisma: getPrismaClient() as any,
      limit: 1,
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Capture recovery did not complete." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
