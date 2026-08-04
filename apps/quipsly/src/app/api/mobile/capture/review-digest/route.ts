import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const PACKET_KIND = "quipsly-mobile-capture-review-digest-v1";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown) {
  return value === true;
}

function sessionStage(session: any) {
  return (
    text(session?.journeySummary?.stage) ||
    text(session?.lifecycle?.stage) ||
    text(session?.captureReadiness?.status) ||
    "unknown"
  );
}

function sessionBlockers(session: any) {
  const blockers = new Set<string>();
  for (const blocker of asArray(session?.journeySummary?.blockers)) {
    const value = text(blocker);
    if (value) blockers.add(value);
  }
  for (const blocker of asArray(session?.captureReadiness?.blockers)) {
    const value = text(blocker);
    if (value) blockers.add(value);
  }
  for (const blocker of asArray(session?.actionPacket?.blockers)) {
    const value = text(blocker);
    if (value) blockers.add(value);
  }
  for (const check of asArray(session?.lifecycle?.checks)) {
    const status = text((check as any)?.status).toLowerCase();
    const id = text((check as any)?.id);
    if (id && (status === "missing" || status === "attention")) {
      blockers.add(`${id}:${status}`);
    }
  }
  return [...blockers];
}

function countWhere<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length;
}

function digestSession(session: any) {
  const blockers = sessionBlockers(session);
  const lifecycleChecks = asArray(session?.lifecycle?.checks);
  const attentionChecks = lifecycleChecks
    .filter((check: any) => ["missing", "attention"].includes(text(check?.status).toLowerCase()))
    .map((check: any) => ({
      id: text(check?.id),
      label: text(check?.label),
      status: text(check?.status),
      meaning: text(check?.meaning),
    }))
    .filter((check) => check.id);

  return {
    id: session.id,
    callRoomId: session.callRoomId,
    title: session.title,
    stage: sessionStage(session),
    status: session.status,
    purpose: session.purpose,
    scheduledStart: session.scheduledStart,
    provider: session.provider,
    providerReadiness: session.providerReadiness,
    providerCanJoin: session.providerCanJoin,
    localFallbackReady: session.captureReadiness?.safeToRecordLocally === true,
    canRecordNow: session.canRecordNow === true,
    recordingConsentStatus: session.recordingConsentStatus,
    recordingConsentGranted: session.recordingConsentGranted === true,
    paymentPolicy: session.paymentPolicy,
    paymentStatus: session.paymentStatus,
    bookingStatus: session.bookingStatus,
    recordingCount: session.recordingCount,
    contentReadiness: session.contentReadiness,
    latestRecordingAssetStatus: session.latestRecordingAssetStatus,
    latestRecordingPromotionStatus: session.latestRecordingPromotionStatus,
    latestRecordingMediaAssetId: session.latestRecordingMediaAssetId,
    latestRecordingPlaybackUrl: session.latestRecordingPlaybackUrl,
    latestTranscriptStatus: session.latestTranscriptStatus,
    latestTranscriptSegmentCount: session.latestTranscriptSegmentCount,
    coachingPacketStatus: session.coachingPacketStatus,
    coachingPacketHighlightCount: session.coachingPacketHighlightCount,
    coachingPacketActionItemCount: session.coachingPacketActionItemCount,
    providerRecordingReceiptSlotId: session.providerRecordingReceiptSlotId,
    actionPacket: session.actionPacket,
    blockers,
    attentionChecks,
    nextAction: session.actionPacket?.nextAction || session.nextAction || session.afterCaptureNextAction,
  };
}

function buildDigest(sessions: any[]) {
  const sessionDigests = sessions.map(digestSession);
  const blockers = new Map<string, number>();
  for (const session of sessionDigests) {
    for (const blocker of session.blockers) {
      blockers.set(blocker, (blockers.get(blocker) || 0) + 1);
    }
  }

  return {
    sessionCount: sessions.length,
    readyToCapture: countWhere(sessions, (session) => bool(session.canRecordNow)),
    needsConsent: countWhere(sessions, (session) => sessionStage(session) === "consent-needed" || !bool(session.recordingConsentGranted)),
    paymentHold: countWhere(sessions, (session) => sessionStage(session) === "payment-needed" || session.captureReadiness?.status === "payment-hold"),
    providerJoinReady: countWhere(sessions, (session) => bool(session.providerCanJoin)),
    localFallbackReady: countWhere(sessions, (session) => session.captureReadiness?.safeToRecordLocally === true),
    recordingEvidence: countWhere(sessions, (session) => Number(session.recordingCount || 0) > 0),
    capturePlumbingEvidence: countWhere(sessions, (session) => Number(session.contentReadiness?.captureAssetCount || 0) > 0),
    substantialRecordingEvidence: countWhere(sessions, (session) => session.contentReadiness?.status === "substantial"),
    recordingPromotionReady: countWhere(
      sessions,
      (session) => session.actionPacket?.capabilities?.canPromoteRecordingToMedia === true,
    ),
    recordingPromotedToMedia: countWhere(sessions, (session) => Boolean(session.latestRecordingMediaAssetId)),
    joinableProviderRooms: countWhere(sessions, (session) => session.actionPacket?.capabilities?.canJoin === true),
    locallyRecordableRooms: countWhere(sessions, (session) => session.actionPacket?.capabilities?.canStartLocalRecording === true),
    transcriptRunnableRooms: countWhere(sessions, (session) => session.actionPacket?.capabilities?.canRunTranscript === true),
    packetBuildableRooms: countWhere(sessions, (session) => session.actionPacket?.capabilities?.canBuildPacket === true),
    transcriptNeeded: countWhere(sessions, (session) => sessionStage(session) === "transcription-needed" || session.coachingPacketStatus === "NOT_READY"),
    packetReady: countWhere(sessions, (session) => session.coachingPacketStatus === "READY_FOR_REVIEW"),
    reviewReady: countWhere(sessions, (session) => session.lifecycle?.readyForReview === true),
    actionPackets: sessionDigests
      .map((session) => session.actionPacket)
      .filter(Boolean),
    blockers: [...blockers.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([id, count]) => ({ id, count })),
    nextActions: sessionDigests
      .filter((session) => text(session.nextAction))
      .slice(0, 8)
      .map((session) => ({
        callRoomId: session.callRoomId,
        title: session.title,
        stage: session.stage,
        nextAction: session.nextAction,
      })),
    sessions: sessionDigests,
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before loading the mobile capture review digest." },
      { status: 401 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const isStaff = session.user.isStaff;
  const actorEmail = text(session.user.primaryEmail || session.user.email).toLowerCase();

  const rooms = await prisma.callRoom.findMany({
    where: isStaff
      ? {}
      : {
          OR: [
            { createdByUserId: userId },
            { participants: { some: { userId, accessStatus: "ACTIVE" } } },
            { booking: { clientUserId: userId } },
            { booking: { coachUserId: userId } },
            ...(actorEmail
              ? [{ project: { accessGrants: { some: { email: actorEmail, status: "ACTIVE" } } } }]
              : []),
          ],
        },
    orderBy: [{ scheduledStart: "asc" }, { updatedAt: "desc" }],
    take: 30,
    include: {
      booking: {
        include: {
          offering: true,
          clientUser: { select: { id: true, name: true, primaryEmail: true } },
          coachUser: { select: { id: true, name: true, primaryEmail: true } },
          paymentRecord: true,
          calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
      recordingAssets: true,
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          asset: { select: { id: true, fileName: true, status: true, kind: true, localManifestJson: true } },
          _count: { select: { segments: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          sourceJson: true,
          createdAt: true,
          _count: { select: { actionItems: true } },
        },
      },
      actionItems: {
        where: { status: "OPEN" },
        select: { id: true, sourceJson: true },
        take: 100,
      },
    },
  });

  const recordingAssetIds = rooms.flatMap((room: any) => room.recordingAssets.map((asset: any) => asset.id));
  const finalizationReceipts = recordingAssetIds.length
    ? await prisma.mobileCaptureFinalizationReceipt.findMany({
        where: { recordingAssetId: { in: recordingAssetIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const sessions = mapMobileCaptureSessionsForUser({ rooms, userId, finalizationReceipts });
  const digest = buildDigest(sessions);

  return NextResponse.json({
    ok: true,
    packetKind: PACKET_KIND,
    generatedAt: new Date().toISOString(),
    user: {
      id: session.user.id,
      email: session.user.primaryEmail,
      name: session.user.name,
      isStaff: session.user.isStaff,
    },
    boundaries: {
      sideEffectFree: true,
      noRecordingStarted: true,
      noExternalMeetingJoined: true,
      noPaymentMutation: true,
      sourceOfTruth:
        "Nest owns operational capture truth. This digest only summarizes app-owned rooms, consent, payment evidence, recording assets, transcript jobs, packet notes, and next actions.",
    },
    links: {
      readiness: "/api/mobile/capture/readiness",
      sessions: "/api/mobile/capture/sessions",
      consent: "/api/mobile/capture/consent",
      roomJoin: "/api/mobile/capture/rooms/join",
      providerRecording: "/api/mobile/capture/rooms/provider-recording",
      promoteRecording: "/api/mobile/capture/recordings/promote",
      transcriptRun: "/api/mobile/capture/transcripts/run",
      transcriptPacket: "/api/mobile/capture/transcripts/packet",
    },
    digest,
  });
}
