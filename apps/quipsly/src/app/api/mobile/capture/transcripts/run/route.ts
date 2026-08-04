import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { transcriptRetryDisposition } from "@/lib/server/capture-transcripts";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import {
  CaptureTranscriptOutboxError,
  ensureCaptureTranscriptProcessingQueued,
} from "@/lib/server/capture-transcript-processing";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = isObject(asset?.localManifestJson) ? asset.localManifestJson : {};
  return asset?.kind === "SERVER_MIX" && manifest.source === "provider-recording-receipt-slot";
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
      { ok: false, error: "Sign in before running a transcript job." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  let transcriptJobId = text(body.transcriptJobId);
  const recordingAssetId = text(body.recordingAssetId);

  if (!transcriptJobId && !recordingAssetId) {
    return NextResponse.json(
      { ok: false, error: "Choose a transcript job or uploaded recording before running transcription." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const actorEmail = text(session.user.primaryEmail || session.user.email).toLowerCase();
  const accessibleRoomWhere = [
    { room: { createdByUserId: userId } },
    { room: { participants: { some: { userId, accessStatus: "ACTIVE" } } } },
    { room: { booking: { clientUserId: userId } } },
    { room: { booking: { coachUserId: userId } } },
    ...(actorEmail
      ? [{ room: { project: { accessGrants: { some: { email: actorEmail, status: "ACTIVE" } } } } }]
      : []),
  ];
  let ensuredFromRecording = false;

  if (!transcriptJobId && recordingAssetId) {
    const asset = await prisma.recordingAsset.findFirst({
      where: session.user.isStaff
        ? { id: recordingAssetId }
        : {
            id: recordingAssetId,
            OR: accessibleRoomWhere,
          },
      include: {
        transcriptJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            _count: {
              select: { segments: true, words: true },
            },
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { ok: false, error: "You do not have access to this uploaded recording." },
        { status: 404 },
      );
    }

    if (isProviderRecordingReceiptSlot(asset)) {
      return NextResponse.json(
        { ok: false, error: "Provider recording receipt slots are not media. Attach verified provider recording media before transcription." },
        { status: 409 },
      );
    }

    const transcriptGate = await mobileCaptureTranscriptProcessingGate({
      prisma,
      recordingAsset: asset,
    });
    if (!transcriptGate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: transcriptGate.error,
          errorCode: transcriptGate.errorCode,
          explicitReleaseRequired: true,
        },
        { status: 409 },
      );
    }

    const existingJob = asset.transcriptJobs?.[0] || null;
    if (existingJob) {
      const retryDisposition = transcriptRetryDisposition({
        status: existingJob.status,
        segmentCount: existingJob._count?.segments || 0,
        wordCount: existingJob._count?.words || 0,
      });
      const updatedJob = retryDisposition === "CREATE_VERSION"
        ? await prisma.transcriptJob.create({
            data: {
              roomId: asset.roomId,
              assetId: asset.id,
              status: "QUEUED",
              provider: "pending",
              requestedBy: userId,
              resultJson: {
                source: "mobile-capture-transcript-run",
                versionedFromTranscriptJobId: existingJob.id,
                immutablePriorSegmentCount: existingJob._count?.segments || 0,
                immutablePriorWordCount: existingJob._count?.words || 0,
                requestedByUserId: userId,
                createdAt: new Date().toISOString(),
              },
            },
            select: { id: true },
          })
        : retryDisposition === "REQUEUE"
        ? await prisma.transcriptJob.update({
            where: { id: existingJob.id },
            data: {
              status: "QUEUED",
              provider: "pending",
              requestedBy: userId,
              errorMessage: null,
              resultJson: {
                source: "mobile-capture-transcript-run",
                repairedFromRecordingAssetId: asset.id,
                previousStatus: existingJob.status,
                requestedByUserId: userId,
                repairedAt: new Date().toISOString(),
              },
            },
            select: { id: true },
          })
        : existingJob;
      transcriptJobId = updatedJob.id;
    } else {
      const createdJob = await prisma.transcriptJob.create({
        data: {
          roomId: asset.roomId,
          assetId: asset.id,
          status: "QUEUED",
          provider: "pending",
          requestedBy: userId,
          resultJson: {
            source: "mobile-capture-transcript-run",
            createdFromRecordingAssetId: asset.id,
            requestedByUserId: userId,
            createdAt: new Date().toISOString(),
          },
        },
        select: { id: true },
      });
      transcriptJobId = createdJob.id;
    }
    ensuredFromRecording = true;
  }

  const job = await prisma.transcriptJob.findFirst({
    where: session.user.isStaff
      ? { id: transcriptJobId }
        : {
          id: transcriptJobId,
          OR: accessibleRoomWhere,
        },
    select: { id: true },
  });

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this transcript job." },
      { status: 404 },
    );
  }

  const reconciled = await reconcileCaptureTranscriptJob({
    prisma,
    transcriptJobId: job.id,
  });
  if (reconciled.status === "completed") {
    return NextResponse.json({
      ok: true,
      transcriptJobId: job.id,
      status: "COMPLETED",
      segmentCount: reconciled.segmentCount,
      wordCount: reconciled.wordCount,
      alreadyCompleted: reconciled.alreadyCompleted,
      ensuredFromRecording,
    });
  }
  if (reconciled.status === "held") {
    return NextResponse.json({
      ok: false,
      transcriptJobId: job.id,
      status: "HELD",
      error: reconciled.message,
      explicitReleaseRequired: true,
      ensuredFromRecording,
    }, { status: 409 });
  }

  try {
    const queued = await ensureCaptureTranscriptProcessingQueued({
      prisma,
      transcriptJobId: job.id,
      actorUserId: userId,
      actorEmail,
    });
    if (queued.status === "held") {
      return NextResponse.json({
        ok: false,
        transcriptJobId: job.id,
        status: "HELD",
        error: "Transcript processing is held until every required consent and release is present.",
        explicitReleaseRequired: true,
        ensuredFromRecording,
      }, { status: 409 });
    }
    if (queued.status === "configuration-required") {
      return NextResponse.json({
        ok: false,
        transcriptJobId: job.id,
        status: "QUEUED",
        error: "Durable transcription is preserved in the queue, but the transcript worker is not configured.",
        errorCode: "TRANSCRIPT_WORKER_CONFIGURATION_REQUIRED",
        retryable: true,
        ensuredFromRecording,
      }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      transcriptJobId: job.id,
      status: queued.status === "completed" ? "COMPLETED" : "RUNNING",
      processingStatus: queued.status,
      executionRequested: queued.executionRequested,
      ensuredFromRecording,
    }, { status: queued.status === "completed" ? 200 : 202 });
  } catch (error) {
    if (error instanceof CaptureTranscriptOutboxError) {
      return NextResponse.json({
        ok: false,
        transcriptJobId: job.id,
        error: error.message,
        errorCode: error.code,
        ensuredFromRecording,
      }, { status: error.code === "TRANSCRIPT_JOB_NOT_FOUND" ? 404 : 409 });
    }
    throw error;
  }
}
