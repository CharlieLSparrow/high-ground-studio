import { NextResponse } from "next/server";

import {
  promoteRecordingAssetToStudioMedia,
  promoteRecordingCaptureGroupToStudioMedia,
} from "@/lib/server/recording-media-promotion";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))];
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
  const captureGroupId = text(body.captureGroupId);
  const roomId = text(body.roomId);
  const expectedRecordingAssetIds = stringList(
    body.expectedRecordingAssetIds,
  );
  const actorEmail = text(
    session.user.primaryEmail || session.user.email,
  ).toLowerCase();

  if (captureGroupId) {
    if (!roomId || expectedRecordingAssetIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Session, capture group, and the exact reviewed source list are required.",
        },
        { status: 400 },
      );
    }
    const result = await promoteRecordingCaptureGroupToStudioMedia({
      roomId,
      captureGroupId,
      expectedRecordingAssetIds,
      actorUserId: session.user.id,
      actorEmail,
      isStaff: session.user.isStaff === true,
      nestSlug: text(body.nestSlug) || null,
      episodeSlug: text(body.episodeSlug) || null,
    });
    const failureStatus =
      !result.ok
      && "httpStatus" in result
      && typeof result.httpStatus === "number"
        ? result.httpStatus
        : 409;
    return NextResponse.json(result, {
      status: result.ok ? 200 : failureStatus,
    });
  }

  if (!recordingAssetId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Choose a recording asset or one exact capture group to promote.",
      },
      { status: 400 },
    );
  }

  const result = await promoteRecordingAssetToStudioMedia({
    recordingAssetId,
    actorUserId: session.user.id,
    actorEmail,
    isStaff: session.user.isStaff === true,
    nestSlug: text(body.nestSlug) || null,
    episodeSlug: text(body.episodeSlug) || null,
  });

  const failureStatus = !result.ok && "httpStatus" in result && typeof result.httpStatus === "number"
    ? result.httpStatus
    : 400;
  return NextResponse.json(result, { status: result.ok ? 200 : failureStatus });
}
