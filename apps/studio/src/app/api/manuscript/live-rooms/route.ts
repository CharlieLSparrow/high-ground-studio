import { NextResponse, type NextRequest } from "next/server";

import { getStudioApiActor, studioJsonError } from "@/lib/server/studio-api-actor";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  createStudioManuscriptLiveRoom,
  listStudioManuscriptLiveRooms,
} from "@/lib/server/studio-manuscript-live-rooms";

export const dynamic = "force-dynamic";

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
  console.error("Studio live manuscript room request failed.", error);

  return studioJsonError(
    "Live manuscript rooms are not available in this environment.",
    503,
  );
}

export async function GET() {
  const unavailableResponse = assertLiveRoomPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const actor = await getStudioApiActor("live manuscript rooms");

  if (!actor.ok) {
    return actor.response;
  }

  try {
    const rooms = await listStudioManuscriptLiveRooms({
      ownerEmail: actor.ownerEmail,
    });

    return NextResponse.json({ ok: true, rooms });
  } catch (error) {
    return liveRoomServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
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
    return studioJsonError("Live room request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          title?: unknown;
          initialText?: unknown;
          manuscriptId?: unknown;
        })
      : null;

  try {
    const room = await createStudioManuscriptLiveRoom({
      ownerEmail: actor.ownerEmail,
      title: requestBody?.title,
      initialText: requestBody?.initialText,
      manuscriptId: requestBody?.manuscriptId,
    });

    return NextResponse.json({ ok: true, room }, { status: 201 });
  } catch (error) {
    return liveRoomServiceUnavailable(error);
  }
}
