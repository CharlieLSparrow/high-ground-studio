import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  buildSessionReadinessTopology,
  type SessionReadinessTopology,
} from "@/lib/server/session-readiness-topology";

export const runtime = "nodejs";

const PACKET_KIND = "quipsly-mobile-capture-review-digest-v1";

type SourceExitReadiness = SessionReadinessTopology["exitReadiness"] & {
  attentionAt?: string | null;
};

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

function digestSession(session: any, sourceExitReadiness: SourceExitReadiness | null = null) {
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
    updatedAt: session.updatedAt,
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
    sourceExitReadiness,
    actionPacket: session.actionPacket,
    blockers,
    attentionChecks,
    nextAction: session.actionPacket?.nextAction || session.nextAction || session.afterCaptureNextAction,
  };
}

function finishAction(session: ReturnType<typeof digestSession>) {
  if (!text(session.callRoomId) || Number(session.recordingCount || 0) <= 0) return null;
  const capabilities = session.actionPacket?.capabilities || {};
  const hasCanonicalMedia = Boolean(session.latestRecordingMediaAssetId);
  const transcriptStatus = text(session.latestTranscriptStatus).toUpperCase();
  const exit = session.sourceExitReadiness;

  if (exit && !exit.safeToLeaveAllEndpoints) {
    const endpointConfirmationOnly = exit.state === "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED";
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: endpointConfirmationOnly ? "confirm-endpoint-drain" : "protect-recording-sources",
      label: exit.label,
      detail: exit.detail,
      priority: endpointConfirmationOnly ? 5 : 0,
      sourceExitReadiness: exit,
    };
  }

  if (!hasCanonicalMedia && capabilities.canPromoteRecordingToMedia === true) {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "promote-recording",
      label: "Move the verified recording into Studio",
      detail: "The retained source is verified and eligible for explicit promotion into the canonical media inventory.",
      priority: 10,
    };
  }
  if (!hasCanonicalMedia && session.blockers.length > 0) {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "resolve-media-hold",
      label: "Resolve the retained-media hold",
      detail: session.nextAction || `Review ${session.blockers[0]} before deriving or promoting this source.`,
      priority: 15,
    };
  }
  if (capabilities.canRunTranscript === true && transcriptStatus !== "COMPLETED") {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "run-transcript",
      label: "Create the timed transcript",
      detail: "Transcription is authorized and available for the retained Session source; starting it remains an explicit action.",
      priority: 20,
    };
  }
  if (capabilities.canReviewPacket === true || session.coachingPacketStatus === "READY_FOR_REVIEW") {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "review-packet",
      label: session.purpose === "COACHING" ? "Review coaching notes and actions" : "Review Session proposals",
      detail: "A source-bound packet is ready for human review. Nothing becomes canonical until an explicit reviewed action.",
      priority: 40,
    };
  }
  if (capabilities.canBuildPacket === true) {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "build-review-packet",
      label: session.purpose === "COACHING" ? "Build the coaching review packet" : "Build the Session review packet",
      detail: "The timed transcript is ready. Quipsly can prepare cited proposals without creating canonical notes, tasks, goals, or edits.",
      priority: 30,
    };
  }
  if (session.blockers.length > 0 || session.attentionChecks.length > 0) {
    return {
      callRoomId: session.callRoomId,
      title: session.title,
      purpose: session.purpose,
      stage: session.stage,
      kind: "resolve-review-attention",
      label: "Resolve Session finishing attention",
      detail: session.nextAction || session.attentionChecks[0]?.meaning || `Review ${session.blockers[0]} before continuing.`,
      priority: 50,
    };
  }
  return null;
}

function buildDigest(
  sessions: any[],
  sourceExitReadinessByRoom: ReadonlyMap<string, SourceExitReadiness> = new Map(),
) {
  const sessionDigests = sessions.map((session) => digestSession(
    session,
    sourceExitReadinessByRoom.get(text(session.callRoomId)) ?? null,
  ));
  const sessionDigestByRoom = new Map(
    sessionDigests.map((session) => [text(session.callRoomId), session]),
  );
  const allFinishActions = sessionDigests
    .map(finishAction)
    .filter(Boolean)
    .sort((left: any, right: any) => {
      const priority = left.priority - right.priority;
      if (priority) return priority;
      const leftSession = sessionDigestByRoom.get(text(left.callRoomId));
      const rightSession = sessionDigestByRoom.get(text(right.callRoomId));
      const leftAttention = Date.parse(text(leftSession?.sourceExitReadiness?.attentionAt || leftSession?.updatedAt || leftSession?.scheduledStart)) || 0;
      const rightAttention = Date.parse(text(rightSession?.sourceExitReadiness?.attentionAt || rightSession?.updatedAt || rightSession?.scheduledStart)) || 0;
      return rightAttention - leftAttention || text(left.title).localeCompare(text(right.title));
    });
  const finishActions = allFinishActions.slice(0, 8);
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
    recoveryOpen: countWhere(sessionDigests, (session) => (
      Number(session.recordingCount || 0) > 0
      && Boolean(session.sourceExitReadiness && !session.sourceExitReadiness.safeToLeaveAllEndpoints)
    )),
    safeToLeave: countWhere(sessionDigests, (session) => (
      Number(session.recordingCount || 0) > 0
      && session.sourceExitReadiness?.safeToLeaveAllEndpoints === true
    )),
    needsFinish: allFinishActions.length,
    finishActions,
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

function sourceExitReadinessForRoom(
  room: any,
  finalizationReceipts: any[],
  currentUserId: string,
): SourceExitReadiness {
  const captures = new Map<string, {
    captureId: string;
    actorUserId: string;
    status: "START_AND_STOP_RECEIVED" | "START_ONLY" | "STOP_ONLY";
    startedAt: Date | string | null;
    stoppedAt: Date | string | null;
    lastReceivedAt: Date | string;
  }>();
  for (const receipt of asArray(room.stateReceipts)) {
    const row = receipt as any;
    const captureId = text(row.captureId).toLowerCase();
    if (!captureId || row.outcome !== "APPLIED" || row.stateApplied !== true) continue;
    const current = captures.get(captureId) ?? {
      captureId,
      actorUserId: text(row.captureOwnerUserId || row.actorUserId),
      status: "STOP_ONLY" as const,
      startedAt: null,
      stoppedAt: null,
      lastReceivedAt: row.receivedAt,
    };
    if (row.action === "START_RECORDING") current.startedAt = row.occurredAt;
    if (row.action === "STOP_RECORDING") current.stoppedAt = row.occurredAt;
    current.lastReceivedAt = row.receivedAt;
    current.status = current.startedAt && current.stoppedAt
      ? "START_AND_STOP_RECEIVED"
      : current.startedAt
        ? "START_ONLY"
        : "STOP_ONLY";
    captures.set(captureId, current);
  }

  const topology = buildSessionReadinessTopology({
    participants: asArray(room.participants).map((participant) => {
      const row = participant as any;
      return {
        id: text(row.id),
        userId: text(row.userId) || null,
        label: text(row.displayName || row.email, "Session participant"),
        role: text(row.role, "PARTICIPANT"),
        isCurrentActor: row.userId === currentUserId,
        consent: null,
      };
    }).filter((participant) => participant.id),
    grants: asArray(room.participantProviderGrants) as any[],
    preflights: asArray(room.participantPreflightReceipts) as any[],
    endpointQueues: asArray(room.endpointQueueReceipts) as any[],
    expectedSources: asArray(room.expectedSources) as any[],
    recordings: asArray(room.recordingAssets) as any[],
    finalizations: finalizationReceipts,
    captures: [...captures.values()],
  });
  const attentionAt = [
    room.updatedAt,
    ...asArray(room.endpointQueueReceipts).map((receipt) => (receipt as any).reconciledAt || (receipt as any).createdAt),
    ...asArray(room.expectedSources).map((source) => (source as any).updatedAt || (source as any).createdAt),
    ...asArray(room.recordingAssets).map((asset) => (asset as any).updatedAt || (asset as any).createdAt),
    ...asArray(room.stateReceipts).map((receipt) => (receipt as any).receivedAt || (receipt as any).createdAt),
    ...finalizationReceipts.map((receipt) => receipt.updatedAt || receipt.createdAt),
  ]
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  return {
    ...topology.exitReadiness,
    attentionAt: Number.isFinite(attentionAt) ? new Date(attentionAt).toISOString() : null,
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
  const actorEmail = text(session.user.primaryEmail || session.user.email).toLowerCase();

  const rooms = await prisma.callRoom.findMany({
    // This is a personal work projection, not an authorization search. Staff
    // privilege may open a room explicitly, but must not fill the iPhone queue
    // with every tenant's unfinished recording work.
    where: {
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
      participantProviderGrants: {
        orderBy: { issuedAt: "desc" },
        take: 200,
      },
      participantPreflightReceipts: {
        orderBy: { testedAt: "desc" },
        take: 200,
      },
      endpointQueueReceipts: {
        orderBy: { queueRevision: "desc" },
        take: 500,
      },
      expectedSources: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        take: 200,
      },
      stateReceipts: {
        where: { captureId: { not: null } },
        orderBy: { sequence: "asc" },
      },
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
  const sourceExitReadinessByRoom = new Map<string, SourceExitReadiness>();
  for (const room of rooms as any[]) {
    const roomAssetIds = new Set(asArray(room.recordingAssets).map((asset) => text((asset as any).id)).filter(Boolean));
    const roomFinalizations = finalizationReceipts.filter((receipt: any) => (
      receipt.roomId === room.id || roomAssetIds.has(text(receipt.recordingAssetId))
    ));
    sourceExitReadinessByRoom.set(
      room.id,
      sourceExitReadinessForRoom(room, roomFinalizations, userId),
    );
  }
  const digest = buildDigest(sessions, sourceExitReadinessByRoom);

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
        "Nest owns operational capture truth. This digest shares the same retained-source plan, exact server-copy, and installation queue projection as the Session Finishing Cockpit before ranking downstream work.",
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
