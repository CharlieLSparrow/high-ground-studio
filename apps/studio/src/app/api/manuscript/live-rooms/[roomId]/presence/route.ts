import { NextResponse, type NextRequest } from "next/server";

import { getStudioApiActor, studioJsonError } from "@/lib/server/studio-api-actor";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  heartbeatStudioManuscriptLivePresence,
  listStudioManuscriptLivePresence,
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
  console.error("Studio live manuscript presence request failed.", error);

  return studioJsonError(
    "Live manuscript room presence is not available in this environment.",
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
    const presence = await listStudioManuscriptLivePresence({
      ownerEmail: actor.ownerEmail,
      roomId,
    });

    if (!presence) {
      return studioJsonError("Live manuscript room was not found.", 404);
    }

    return NextResponse.json({ ok: true, presence });
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
    return studioJsonError("Live presence request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          clientId?: unknown;
          displayName?: unknown;
          mode?: unknown;
        })
      : null;
  const { roomId } = await context.params;

  try {
    const presence = await heartbeatStudioManuscriptLivePresence({
      ownerEmail: actor.ownerEmail,
      roomId,
      clientId: requestBody?.clientId,
      displayName: requestBody?.displayName ?? actor.actorLabel,
      mode: requestBody?.mode,
    });

    if (!presence) {
      return studioJsonError("Live manuscript room was not found.", 404);
    }

    return NextResponse.json({ ok: true, presence });
  } catch (error) {
    return liveRoomServiceUnavailable(error);
  }
}
