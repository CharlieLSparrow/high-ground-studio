import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  authorizeCaptureTranscriptFollowThroughWorker,
  runCaptureTranscriptFollowThroughMaintenance,
} from "@/lib/server/capture-transcript-follow-through-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeCaptureTranscriptFollowThroughWorker({
    authorization: request.headers.get("authorization"),
  });
  if (authorization === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "Capture transcript follow-through is not configured." },
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
    const result = await runCaptureTranscriptFollowThroughMaintenance({
      prisma: getPrismaClient() as any,
    });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Capture transcript follow-through did not complete." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
