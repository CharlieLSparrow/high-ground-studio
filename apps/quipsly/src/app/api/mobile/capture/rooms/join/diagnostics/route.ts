import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildCaptureRoomJoinDiagnostic,
  captureRoomAccessWhere,
  roomJoinText,
} from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

async function roomJoinDiagnostics(request: Request, body: Record<string, unknown> = {}) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before inspecting capture room join readiness." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const callRoomId = roomJoinText(url.searchParams.get("callRoomId") || body.callRoomId);

  if (!callRoomId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a Quipsly capture session before inspecting room join readiness.",
        diagnosticOnly: true,
        effects: {
          sideEffectFree: true,
          externalMutated: false,
          participantCreated: false,
          providerJoined: false,
          recordingStarted: false,
          tokenMinted: false,
          tokenReturned: false,
        },
      },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, session.user),
    include: {
      booking: { include: { paymentRecord: true } },
      participants: true,
      recordingConsents: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      {
        ok: false,
        error: "You do not have access to inspect this capture room.",
        diagnosticOnly: true,
        effects: {
          sideEffectFree: true,
          externalMutated: false,
          participantCreated: false,
          providerJoined: false,
          recordingStarted: false,
          tokenMinted: false,
          tokenReturned: false,
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json(buildCaptureRoomJoinDiagnostic({ room, user: session.user }));
}

export async function GET(request: Request) {
  return roomJoinDiagnostics(request);
}

export async function POST(request: Request) {
  return roomJoinDiagnostics(request, await readJson(request));
}
