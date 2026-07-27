import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  CAPTURE_CLOCK_PROTOCOL_VERSION,
  parseCaptureClockProbe,
} from "@/lib/server/mobile-capture-clock";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
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

export async function POST(request: Request) {
  // This timestamp intentionally brackets authentication and room lookup.
  // Client-side NTP arithmetic subtracts the server processing interval.
  const serverReceivedAt = new Date();
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNAUTHORIZED",
        error: "Sign in before measuring a private capture-room clock.",
      },
      { status: 401 },
    );
  }

  const parsed = parseCaptureClockProbe(await readJson(request));
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 400 });
  }

  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(parsed.probe.callRoomId, session.user),
    select: { id: true },
  });
  if (!room) {
    return NextResponse.json(
      {
        ok: false,
        code: "CALL_ROOM_NOT_FOUND",
        error: "You do not have access to this capture room.",
      },
      { status: 404 },
    );
  }

  const serverSentAt = new Date();
  return NextResponse.json({
    ok: true,
    protocolVersion: CAPTURE_CLOCK_PROTOCOL_VERSION,
    sampleId: parsed.probe.sampleId,
    callRoomId: room.id,
    captureGroupId: parsed.probe.captureGroupId,
    clientKind: parsed.probe.clientKind,
    deviceWallSentAt: parsed.probe.deviceWallSentAt,
    deviceMonotonicSentNanoseconds:
      parsed.probe.deviceMonotonicSentNanoseconds,
    serverReceivedAt: serverReceivedAt.toISOString(),
    serverSentAt: serverSentAt.toISOString(),
    clockBoundary: {
      sideEffectFree: true,
      persistedByServer: false,
      sourceProfileOwnsCompletedSample: true,
      sampleAccurateClaimed: false,
      meaning:
        "The client must add its receive timestamps, calculate offset and uncertainty, and preserve the completed sample with the immutable local source.",
    },
  });
}
