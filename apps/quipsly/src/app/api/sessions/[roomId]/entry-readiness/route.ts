import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { captureRoomAccessWhere } from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { buildSessionPreparationState } from "@/app/(app)/sessions/[roomId]/session-preparation-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in to refresh this Session." },
      { status: 401 },
    );
  }

  const { roomId } = await context.params;
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(roomId, session.user),
    include: {
      project: { select: { id: true, name: true, slug: true } },
      booking: {
        select: {
          status: true,
          paymentPolicy: true,
          paymentRecord: { select: { status: true } },
        },
      },
      participants: {
        where: { accessStatus: "ACTIVE" },
        include: {
          user: { select: { name: true, primaryEmail: true } },
        },
      },
      recordingConsents: true,
    },
  });

  if (!room) {
    return NextResponse.json(
      { ok: false, code: "ROOM_ACCESS_DENIED", error: "This Session is not available to the current account." },
      { status: 404 },
    );
  }

  const { preparation, consentSnapshot } = buildSessionPreparationState(
    room,
    session.user.id,
  );
  const response = NextResponse.json({
    ok: true,
    roomId: room.id,
    generatedAt: new Date().toISOString(),
    entryReadiness: preparation.entryReadiness,
    participantCount: preparation.participants.length,
    consentSnapshot,
    effects: {
      sideEffectFree: true,
      participantCreated: false,
      consentChanged: false,
      providerTokenMinted: false,
      providerJoined: false,
      recordingStarted: false,
      externalMutated: false,
    },
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
