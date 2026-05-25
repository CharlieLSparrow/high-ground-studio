import { NextResponse, type NextRequest } from "next/server";

import { getStudioApiActor, studioJsonError } from "@/lib/server/studio-api-actor";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { getStudioManuscriptLiveRoom } from "@/lib/server/studio-manuscript-live-rooms";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

function assertLiveRoomPersistenceConfigured() {
  if (getStudioDatabaseUrl()) {
    return null;
  }

  return studioJsonError(
    "Live manuscript rooms need a configured Studio database.",
    503,
  );
}

function liveRoomServiceUnavailable(error: unknown) {
  console.error("Studio live manuscript room detail request failed.", error);

  return studioJsonError(
    "Live manuscript rooms are not available in this environment.",
    503,
  );
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const unavailableResponse = assertLiveRoomPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const actor = await getStudioApiActor("live manuscript rooms");

  if (!actor.ok) {
    return actor.response;
  }

  const { roomId } = await context.params;

  try {
    const room = await getStudioManuscriptLiveRoom({
      ownerEmail: actor.ownerEmail,
      roomId,
    });

    if (!room) {
      return studioJsonError("Live manuscript room was not found.", 404);
    }

    return NextResponse.json({ ok: true, room });
  } catch (error) {
    return liveRoomServiceUnavailable(error);
  }
}
