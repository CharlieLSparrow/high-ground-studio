import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { runCaptureTranscriptJob, transcriptRetryDisposition } from "@/lib/server/capture-transcripts";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
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
    { room: { participants: { some: { userId } } } },
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
          include: { _count: { select: { segments: true } } },
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
      const retryDisposition = transcriptRetryDisposition({ status: existingJob.status, segmentCount: existingJob._count?.segments || 0 });
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

  const result = await runCaptureTranscriptJob({
    prisma,
    transcriptJobId: job.id,
    requestedByUserId: userId,
  });
  const status = result.ok ? 200 : "status" in result && typeof result.status === "number" ? result.status : 500;

  return NextResponse.json({ ...result, ensuredFromRecording }, { status });
}
