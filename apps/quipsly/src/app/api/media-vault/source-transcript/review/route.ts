import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  TranscriptCorrectionError,
} from "@/lib/server/transcript-corrections";
import {
  confirmStudioTranscriptSegmentAsIs,
  correctStudioTranscriptSegment,
  readStudioTranscriptReviewPage,
} from "@/lib/server/studio-transcript-review";

export const runtime = "nodejs";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function coordinates(value: Record<string, unknown>) {
  const projectSlug = text(value.projectSlug);
  const episodeSlug = text(value.episodeSlug);
  const assetId = text(value.assetId);
  const sourceId = text(value.sourceId);
  return projectSlug && episodeSlug && assetId && sourceId ? { projectSlug, episodeSlug, assetId, sourceId } : null;
}

async function authorize(request: NextRequest, input: NonNullable<ReturnType<typeof coordinates>>, action: "read" | "write") {
  const prisma = getPrismaClient();
  const access = await resolveEpisodeProductionAccess({ request, projectSlug: input.projectSlug, action, prisma });
  if (!access.allowed) return { response: NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status }) } as const;
  const sourceAccess = await authorizeStudioMediaSource({
    prisma,
    actor: { id: access.actor.id, email: access.actor.email, isStaff: access.actor.isStaff },
    sourceId: input.sourceId,
  });
  if (!sourceAccess.allowed) return { response: NextResponse.json({ ok: false, code: sourceAccess.errorCode || "transcript-source-held", error: sourceAccess.error }, { status: sourceAccess.status }) } as const;
  return { prisma, actor: access.actor } as const;
}

function failure(error: unknown) {
  if (error instanceof TranscriptCorrectionError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  }
  console.error("[studio transcript review] failed", error);
  return NextResponse.json({ ok: false, code: "STUDIO_TRANSCRIPT_REVIEW_FAILED", error: "Unable to operate the Studio transcript review desk." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const input = coordinates(Object.fromEntries(request.nextUrl.searchParams));
    if (!input) return NextResponse.json({ ok: false, error: "projectSlug, episodeSlug, assetId, and sourceId are required." }, { status: 400 });
    const access = await authorize(request, input, "read");
    if ("response" in access) return access.response;
    const limit = Number(request.nextUrl.searchParams.get("limit") || 40);
    const result = await readStudioTranscriptReviewPage({
      prisma: access.prisma,
      actor: access.actor,
      ...input,
      afterSegmentId: text(request.nextUrl.searchParams.get("afterSegmentId")) || null,
      limit,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = coordinates(body);
    const action = text(body.action);
    if (!input || (action !== "correct" && action !== "confirm-as-is")) {
      return NextResponse.json({ ok: false, error: "A supported action and exact source coordinates are required." }, { status: 400 });
    }
    const access = await authorize(request, input, "write");
    if ("response" in access) return access.response;
    const common = {
      prisma: access.prisma,
      actor: access.actor,
      ...input,
      segmentId: text(body.segmentId),
      clientRequestId: text(body.clientRequestId),
      expectedText: typeof body.expectedText === "string" ? body.expectedText : "",
      expectedSpeakerLabel: typeof body.expectedSpeakerLabel === "string" ? body.expectedSpeakerLabel : null,
      confirmedAgainstPlayback: body.confirmedAgainstPlayback === true,
      playbackPositionSeconds: typeof body.playbackPositionSeconds === "number" ? body.playbackPositionSeconds : Number.NaN,
    };
    const result = action === "correct"
      ? await correctStudioTranscriptSegment({
          ...common,
          expectedAcceptedCorrectionId: typeof body.expectedAcceptedCorrectionId === "string" ? body.expectedAcceptedCorrectionId : null,
          correctedText: typeof body.correctedText === "string" ? body.correctedText : null,
          correctedSpeakerLabel: typeof body.correctedSpeakerLabel === "string" ? body.correctedSpeakerLabel : null,
          reason: typeof body.reason === "string" ? body.reason : null,
        })
      : await confirmStudioTranscriptSegmentAsIs({
          ...common,
          reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
        });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
