import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionInvitationAccessWhere } from "@/lib/server/session-access";
import { readSessionProviderPresence } from "@/lib/server/session-provider-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

function roomIdText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before reading live Session presence.",
      },
      401,
    );

  const prisma = getPrismaClient();
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(roomIdText(roomId), session.user),
    select: {
      id: true,
      provider: true,
      providerRoomId: true,
      participants: {
        select: {
          id: true,
          displayName: true,
          role: true,
          accessStatus: true,
        },
      },
    },
  });
  if (!room)
    return privateJson(
      {
        ok: false,
        code: "NOT_FOUND",
        error: "This Session is not available for live presence readback.",
      },
      404,
    );

  const grants = await prisma.callParticipantProviderGrantReceipt.findMany({
    where: { roomId: room.id },
    orderBy: { issuedAt: "desc" },
    take: 200,
    select: {
      participantId: true,
      providerIdentity: true,
      clientKind: true,
      deviceLabel: true,
      issuedAt: true,
    },
  });
  const presence = await readSessionProviderPresence({
    provider: room.provider,
    providerRoomId: room.providerRoomId,
    participants: room.participants.map((participant) => ({
      ...participant,
      role: String(participant.role),
      accessStatus: String(participant.accessStatus),
    })),
    grants,
  });
  return privateJson({
    ok: true,
    presence,
    boundaries: {
      sessionManagerOnly: true,
      providerReadOnly: true,
      invitationHistoryChanged: false,
      participantAccessChanged: false,
      recordingChanged: false,
    },
  });
}
