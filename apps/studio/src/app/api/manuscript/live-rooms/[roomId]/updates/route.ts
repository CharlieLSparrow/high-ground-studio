import { NextResponse, type NextRequest } from "next/server";

import { getStudioApiActor, studioJsonError } from "@/lib/server/studio-api-actor";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  appendStudioManuscriptLiveRoomUpdate,
  listStudioManuscriptLiveRoomUpdates,
} from "@/lib/server/studio-manuscript-live-rooms";

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
  console.error("Studio live manuscript update request failed.", error);

  return studioJsonError(
    "Live manuscript room updates are not available in this environment.",
    503,
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const unavailableResponse = assertLiveRoomPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const actor = await getStudioApiActor("live manuscript rooms");

  if (!actor.ok) {
    return actor.response;
  }

  const { roomId } = await context.params;
  const afterClock = Number(request.nextUrl.searchParams.get("after") ?? "0");

  try {
    const updates = await listStudioManuscriptLiveRoomUpdates({
      ownerEmail: actor.ownerEmail,
      roomId,
      afterClock: Number.isFinite(afterClock) ? afterClock : 0,
    });

    return NextResponse.json({ ok: true, updates });
  } catch (error) {
    return liveRoomServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const unavailableResponse = assertLiveRoomPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const actor = await getStudioApiActor("live manuscript rooms");

  if (!actor.ok) {
    return actor.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return studioJsonError("Live update request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          updateBase64?: unknown;
          clientId?: unknown;
        })
      : null;

  const { roomId } = await context.params;

  try {
    const room = await appendStudioManuscriptLiveRoomUpdate({
      ownerEmail: actor.ownerEmail,
      roomId,
      updateBase64: requestBody?.updateBase64,
      clientId: requestBody?.clientId,
    });

    if (!room) {
      return studioJsonError("Live manuscript room was not found.", 404);
    }

    return NextResponse.json({ ok: true, room });
  } catch (error) {
    if (error instanceof Error && error.message.includes("too large")) {
      return studioJsonError(error.message, 400);
    }

    return liveRoomServiceUnavailable(error);
  }
}
