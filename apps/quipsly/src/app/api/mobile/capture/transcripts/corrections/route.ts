import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  attributeTranscriptSpeaker,
  confirmTranscriptSegmentAsIs,
  createTranscriptCorrection,
  readTranscriptCorrectionDesk,
  reviewTranscriptCorrectionProposal,
  TranscriptCorrectionError,
} from "@/lib/server/transcript-corrections";
import {
  approveTranscriptEvaluationWindow,
  readTranscriptEvaluationReadiness,
  TranscriptEvaluationWindowError,
} from "@/lib/server/transcript-evaluation-windows";
import { readTranscriptEvaluationCandidates } from "@/lib/server/transcript-evaluation-candidates";

export const dynamic = "force-dynamic";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function speakerSamples(value: unknown) {
  return Array.isArray(value)
    ? value.map((sample) => {
        const entry = object(sample);
        return {
          segmentId: text(entry.segmentId),
          playbackPositionSeconds: number(entry.playbackPositionSeconds) ?? Number.NaN,
        };
      })
    : [];
}

async function body(request: Request) {
  try {
    return object(await request.json());
  } catch {
    return {};
  }
}

function responseBody(error: unknown) {
  if (error instanceof TranscriptCorrectionError || error instanceof TranscriptEvaluationWindowError) {
    return NextResponse.json(
      { ok: false, error: error.message, errorCode: error.code },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  console.error("[transcript-corrections] request failed", error);
  return NextResponse.json(
    { ok: false, error: "Quipsly could not update transcript review state." },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

function actorFromSession(session: NonNullable<Awaited<ReturnType<typeof getQuipslySessionFromRequest>>>) {
  return {
    id: session.user.id,
    email: session.user.primaryEmail,
    isStaff: session.user.isStaff,
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to review transcript corrections." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const roomId = text(new URL(request.url).searchParams.get("callRoomId"));
  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "callRoomId is required." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const result = await readTranscriptCorrectionDesk({
      prisma: getPrismaClient() as any,
      roomId,
      actor: actorFromSession(session),
    });
    let evaluation = null;
    try {
      evaluation = await readTranscriptEvaluationReadiness({
        prisma: getPrismaClient() as any,
        roomId,
        actor: actorFromSession(session),
      });
      try {
        const providerEvidence = await readTranscriptEvaluationCandidates({
          prisma: getPrismaClient() as any,
          roomId,
          actor: actorFromSession(session),
        });
        evaluation = { ...evaluation, candidates: providerEvidence.candidates, providerEvidenceError: null };
      } catch (providerError) {
        console.error("[transcript-corrections] provider scorecards unavailable", providerError);
        evaluation = { ...evaluation, candidates: [], providerEvidenceError: "Provider scorecards are temporarily unavailable." };
      }
    } catch (error) {
      if (!(error instanceof TranscriptEvaluationWindowError)) throw error;
      evaluation = {
        schema: "quipsly-transcript-evaluation-window-v1",
        eligible: false,
        canApprove: false,
        blockers: [{ code: error.code, detail: error.message }],
        approvedWindows: [],
      };
    }
    return NextResponse.json({ ...result, evaluation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return responseBody(error);
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to correct a transcript." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const input = await body(request);
  const operation = text(input.operation) || "accept-human-correction";
  const prisma = getPrismaClient() as any;
  const actor = actorFromSession(session);
  try {
    if (operation === "approve-evaluation-window") {
      const result = await approveTranscriptEvaluationWindow({
        prisma,
        actor,
        roomId: text(input.roomId),
        clientRequestId: text(input.clientRequestId),
        workload: input.workload,
        conditions: input.conditions,
        startSegmentId: input.startSegmentId,
        endSegmentId: input.endSegmentId,
        reviewNote: nullableText(input.reviewNote),
        sourcePlaybackEvidence: input.sourcePlaybackEvidence,
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (operation === "attribute-provider-speaker") {
      const result = await attributeTranscriptSpeaker({
        prisma,
        actor,
        roomId: text(input.roomId),
        providerSpeakerLabel: text(input.providerSpeakerLabel),
        participantId: text(input.participantId),
        clientRequestId: text(input.clientRequestId),
        expectedProviderSnapshotSha256: text(input.expectedProviderSnapshotSha256),
        samples: speakerSamples(input.samples),
        confirmedAgainstPlayback: input.confirmedAgainstPlayback === true,
        reviewNote: nullableText(input.reviewNote),
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (operation === "confirm-segment-as-is") {
      const result = await confirmTranscriptSegmentAsIs({
        prisma,
        actor,
        roomId: text(input.roomId),
        segmentId: text(input.segmentId),
        clientRequestId: text(input.clientRequestId),
        expectedText: typeof input.expectedText === "string" ? input.expectedText : "",
        expectedSpeakerLabel: nullableText(input.expectedSpeakerLabel),
        expectedAcceptedCorrectionId: nullableText(input.expectedAcceptedCorrectionId),
        confirmedAgainstPlayback: input.confirmedAgainstPlayback === true,
        playbackPositionSeconds: number(input.playbackPositionSeconds),
        reviewNote: nullableText(input.reviewNote),
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (operation === "accept-human-correction") {
      const result = await createTranscriptCorrection({
        prisma,
        actor,
        roomId: text(input.roomId),
        segmentId: text(input.segmentId),
        clientRequestId: text(input.clientRequestId),
        origin: "human",
        expectedText: typeof input.expectedText === "string" ? input.expectedText : "",
        expectedSpeakerLabel: nullableText(input.expectedSpeakerLabel),
        expectedAcceptedCorrectionId: nullableText(input.expectedAcceptedCorrectionId),
        correctedText: nullableText(input.correctedText),
        correctedSpeakerLabel: nullableText(input.correctedSpeakerLabel),
        reason: nullableText(input.reason),
        confirmedAgainstPlayback: input.confirmedAgainstPlayback === true,
        playbackPositionSeconds: number(input.playbackPositionSeconds),
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (operation === "review-ai-proposal") {
      const decision = text(input.decision);
      if (decision !== "accept" && decision !== "reject") {
        return NextResponse.json(
          { ok: false, error: "AI proposal decision must be accept or reject." },
          { status: 400, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const result = await reviewTranscriptCorrectionProposal({
        prisma,
        actor,
        roomId: text(input.roomId),
        correctionId: text(input.correctionId),
        decision,
        expectedAcceptedCorrectionId: nullableText(input.expectedAcceptedCorrectionId),
        confirmedAgainstPlayback: input.confirmedAgainstPlayback === true,
        playbackPositionSeconds: number(input.playbackPositionSeconds),
        reviewNote: nullableText(input.reviewNote),
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(
      { ok: false, error: "Unknown transcript correction operation." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return responseBody(error);
  }
}
