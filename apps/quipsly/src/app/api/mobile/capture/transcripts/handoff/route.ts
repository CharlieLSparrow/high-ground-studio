import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  readTranscriptCorrectionDesk,
  TranscriptCorrectionError,
} from "@/lib/server/transcript-corrections";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type CanonicalDeskWord = {
  id: string;
  providerWordIndex: number;
  word: string;
  punctuatedWord: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number | null;
  speakerLabel: string | null;
  channel: number | null;
};

type CanonicalDeskSegment = {
  id: string;
  speakerLabel: string | null;
  providerSpeakerLabel: string | null;
  startSeconds: number;
  endSeconds: number;
  text: string;
  providerText: string;
  confidence: number | null;
  acceptedCorrection: { id: string } | null;
  acceptedVerification: { id: string } | null;
  speakerAttribution: {
    id: string;
    participantId: string | null;
    participantUserId: string | null;
    attributedLabel: string;
    reviewedAt: string;
  } | null;
  words: CanonicalDeskWord[];
};

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before importing a canonical transcript." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const url = new URL(request.url);
  const roomId = text(url.searchParams.get("callRoomId"));
  const transcriptJobId = text(url.searchParams.get("transcriptJobId"));
  const recordingAssetId = text(url.searchParams.get("recordingAssetId"));
  if (!roomId || !transcriptJobId) {
    return NextResponse.json(
      { ok: false, error: "callRoomId and transcriptJobId are required." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const desk = await readTranscriptCorrectionDesk({
      prisma: getPrismaClient() as any,
      roomId,
      actor: {
        id: session.user.id,
        email: session.user.primaryEmail,
        isStaff: session.user.isStaff,
      },
      recordingAssetId: recordingAssetId || null,
      transcriptJobId,
    });
    if (desk.transcriptJobId !== transcriptJobId) {
      return NextResponse.json(
        {
          ok: false,
          error: "This transcript is no longer the canonical latest version for the Session.",
          errorCode: "TRANSCRIPT_VERSION_SUPERSEDED",
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!desk.gate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: desk.gate.error || "Transcript handoff is held by consent policy.",
          errorCode: "TRANSCRIPT_HANDOFF_HELD",
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (desk.transcriptStatus !== "COMPLETED" || desk.segments.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "The canonical transcript is not complete yet.",
          errorCode: "TRANSCRIPT_NOT_COMPLETE",
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json({
      ok: true,
      schema: "quipsly-canonical-transcript-handoff-v2",
      roomId,
      transcriptJobId,
      source: {
        recordingAssetId: desk.playback?.recordingAssetId ?? null,
        playbackUrl: desk.playback?.url ?? null,
        immutableProviderWords: true,
        reviewedCorrectionsAreOverlays: true,
      },
      language: desk.processing?.routing?.language ?? null,
      provider: desk.processing?.routing?.provider ?? null,
      segments: (desk.segments as CanonicalDeskSegment[]).map((segment) => ({
        id: segment.id,
        speaker: segment.speakerLabel,
        providerSpeaker: segment.providerSpeakerLabel,
        speakerAttribution: segment.speakerAttribution,
        startTime: segment.startSeconds,
        endTime: segment.endSeconds,
        text: segment.text,
        providerText: segment.providerText,
        confidence: segment.confidence,
        reviewStatus: segment.acceptedCorrection || segment.acceptedVerification ? "human-reviewed" : "provider",
        acceptedReviewId: segment.acceptedCorrection?.id ?? segment.acceptedVerification?.id ?? null,
        acceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
        words: segment.words.map((word: CanonicalDeskWord) => ({
          id: word.id,
          providerWordIndex: word.providerWordIndex,
          word: word.punctuatedWord,
          rawWord: word.word,
          startTime: word.startSeconds,
          endTime: word.endSeconds,
          confidence: word.confidence,
          speaker: word.speakerLabel,
          channel: word.channel,
          source: "deepgram-word-anchor",
        })),
      })),
      boundaries: {
        sourceMediaUnchanged: true,
        providerWordsUnchanged: true,
        stableExternalIdentitiesIncluded: true,
        importingDoesNotPublish: true,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TranscriptCorrectionError) {
      return NextResponse.json(
        { ok: false, error: error.message, errorCode: error.code },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error("[capture-transcript-handoff] failed", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not build the canonical transcript handoff." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
