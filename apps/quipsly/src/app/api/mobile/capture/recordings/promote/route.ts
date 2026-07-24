import { NextResponse } from "next/server";

import { promoteRecordingAssetToStudioMedia } from "@/lib/server/recording-media-promotion";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before promoting a recording into Quipsly media." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const recordingAssetId = text(body.recordingAssetId);

  if (!recordingAssetId) {
    return NextResponse.json(
      { ok: false, error: "Choose a recording asset to promote." },
      { status: 400 },
    );
  }

  const result = await promoteRecordingAssetToStudioMedia({
    recordingAssetId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    isStaff: session.user.isStaff === true,
    nestSlug: text(body.nestSlug) || null,
    episodeSlug: text(body.episodeSlug) || null,
  });

  const failureStatus = !result.ok && "httpStatus" in result && typeof result.httpStatus === "number"
    ? result.httpStatus
    : 400;
  return NextResponse.json(result, { status: result.ok ? 200 : failureStatus });
}
