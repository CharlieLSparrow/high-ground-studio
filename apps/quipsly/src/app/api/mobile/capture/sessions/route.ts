import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { chooseQuipslyCoachingClientPriority } from "@high-ground/quipsly-domain/coaching-client-priority";

import {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/mobile-capture-consent-policy.js";
import { getPrismaClient } from "@/lib/prisma";
import {
  fallbackTitleForMobileCapturePurpose,
  parseMobileCaptureSessionPurpose,
} from "@/lib/mobile-capture-session-purpose";
import { coachingEngagementAccessWhere, coachingEngagementActorAccessWhere } from "@/lib/server/coaching-engagement";
import { reconcileCaptureProxyResults } from "@/lib/server/capture-proxy-reconciliation";
import { reconcileInterruptionRepairResults } from "@/lib/server/capture-interruption-repair-reconciliation";
import { reconcileCaptureTranscriptFollowThrough } from "@/lib/server/capture-transcript-follow-through";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import {
  MobileSessionScheduleError,
  appendMobileSessionScheduleEvent,
  matchingMobileSessionScheduleReplay,
  mobileSessionScheduledTimezone,
  parseMobileSessionScheduleInput,
} from "@/lib/server/mobile-capture-session-schedule";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { quipslyCoachCapabilityAccess } from "@/lib/server/subscription-entitlements";
import { loadPriorSessionContinuityByRoomId } from "@/lib/server/session-continuity";
import {
  loadCurrentSessionFollowThroughByRoomId,
  loadPriorSessionFollowThroughByRoomId,
} from "@/lib/server/session-follow-through";
import {
  resolveSessionEpisodeBinding,
  SessionEpisodeBindingError,
} from "@/lib/server/session-episode-binding";
import {
  mobileSessionNoteVisibilityWhere,
  SESSION_NOTE_VISIBLE_KINDS,
} from "@/lib/server/session-note-access";
import {
  listAccessibleStudioProjectSummariesForEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
import { sourceLabelForNestKind } from "@/lib/studio/project-registry";

const MOBILE_CAPTURE_ROOM_INCLUDE = {
  coachingEngagement: {
    select: { id: true, title: true, status: true },
  },
  episodeProduction: {
    select: { id: true, projectId: true, slug: true, title: true },
  },
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
      tags: {
        where: { isActive: true },
        orderBy: { label: "asc" },
        select: { id: true, slug: true, label: true },
      },
    },
  },
  booking: {
    include: {
      offering: true,
      clientUser: { select: { id: true, name: true, primaryEmail: true } },
      coachUser: { select: { id: true, name: true, primaryEmail: true } },
      paymentRecord: {
        include: {
          checkoutSessionLedgers: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      calendarLinks: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  },
  participants: { where: { accessStatus: "ACTIVE" } },
  recordingConsents: true,
  stateReceipts: {
    where: {
      action: "START_RECORDING",
      stateApplied: true,
      outcome: "APPLIED",
    },
    orderBy: { sequence: "asc" },
    select: {
      receiptId: true,
      roomId: true,
      captureId: true,
      actorUserId: true,
      action: true,
      occurredAt: true,
      receivedAt: true,
      outcome: true,
      stateApplied: true,
    },
  },
  recordingAssets: {
    include: {
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { _count: { select: { segments: true, words: true } } },
      },
    },
  },
  transcriptJobs: {
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      asset: { select: { id: true, fileName: true, status: true, kind: true, localManifestJson: true } },
      _count: { select: { segments: true, words: true } },
    },
  },
  notes: {
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      authorUserId: true,
      kind: true,
      visibility: true,
      title: true,
      body: true,
      sourceJson: true,
      createdAt: true,
      updatedAt: true,
      authorUser: { select: { name: true, primaryEmail: true } },
      tagLinks: {
        orderBy: { createdAt: "asc" },
        select: { tag: { select: { id: true, slug: true, label: true, isActive: true } } },
      },
      _count: { select: { actionItems: true, revisions: true } },
    },
  },
  outputs: {
    where: {
      kind: "CLIENT_FOLLOW_UP",
      status: "RELEASED",
    },
    orderBy: { releasedAt: "desc" },
    take: 5,
    select: {
      id: true,
      kind: true,
      createdByUserId: true,
      recipientUserId: true,
      status: true,
      title: true,
      intro: true,
      nextSessionFocus: true,
      bodyJson: true,
      contentSha256: true,
      revision: true,
      releasedAt: true,
      recipient: { select: { name: true, primaryEmail: true } },
      deliveries: {
        where: { kind: "OPENED_IN_APP" },
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { occurredAt: true },
      },
    },
  },
  actionItems: {
    select: {
      id: true,
      title: true,
      detail: true,
      status: true,
      assignedUserId: true,
      dueAt: true,
      completedAt: true,
      sourceJson: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 100,
  },
  goals: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      ownerUserId: true,
      targetAt: true,
      achievedAt: true,
      sourceJson: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 100,
  },
};

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

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before loading capture sessions." },
      { status: 401 },
    );
  }
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const isStaff = session.user.isStaff;
  const actorEmail = text(session.user.primaryEmail || session.user.email).toLowerCase();
  const accessibleCaptureProjects =
    await listAccessibleStudioProjectSummariesForEmail(
      session.user.primaryEmail,
      prisma,
    );
  const accessibleProjectIds = accessibleCaptureProjects.map((project) => project.id);
  await reconcileInterruptionRepairResults({
    prisma,
    projectIds: accessibleProjectIds,
    limit: 6,
  });
  await reconcileCaptureProxyResults({
    prisma,
    projectIds: accessibleProjectIds,
    limit: 6,
  });
  const roomAccessWhere = isStaff
    ? {}
    : {
        OR: [
          { createdByUserId: userId },
          { participants: { some: { userId, accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: userId } },
          { booking: { coachUserId: userId } },
          ...(actorEmail ? [{
            project: {
              accessGrants: {
                some: { email: actorEmail, status: "ACTIVE" as const },
              },
            },
          }] : []),
        ],
      };

  // The picker is a working set, not an archive. An oldest-first capped query
  // made a just-recorded Session disappear for accounts with more than 30
  // historical rooms. Keep every accessible active room in the window, then
  // fill it with the most recently changed rooms for review and follow-through.
  const [activeRoomRefs, recentRoomRefs] = await Promise.all([
    prisma.callRoom.findMany({
      where: {
        AND: [
          roomAccessWhere,
          { status: { in: ["PLANNED", "OPEN", "RECORDING"] } },
        ],
      },
      orderBy: [{ scheduledStart: "asc" }, { updatedAt: "desc" }],
      take: 30,
      select: { id: true },
    }),
    prisma.callRoom.findMany({
      where: roomAccessWhere,
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true },
    }),
  ]);
  const roomIds = [...new Set([
    ...activeRoomRefs.map((room: { id: string }) => room.id),
    ...recentRoomRefs.map((room: { id: string }) => room.id),
  ])];

  if (roomIds.length > 0) {
    const transcriptCandidates = await prisma.transcriptJob.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: ["QUEUED", "RUNNING", "HELD", "COMPLETED"] },
      },
      distinct: ["roomId"],
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true },
    });
    const reconciliations = await Promise.allSettled(
      transcriptCandidates.map((job: { id: string }) =>
        reconcileCaptureTranscriptFollowThrough({
          prisma,
          transcriptJobId: job.id,
        })),
    );
    reconciliations.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      console.error("[Capture Follow-through] Session-list reconciliation remains retryable", {
        transcriptJobId: transcriptCandidates[index]?.id,
        reason: result.reason instanceof Error ? result.reason.message : "unknown",
      });
    });
  }

  const rooms = roomIds.length === 0 ? [] : await prisma.callRoom.findMany({
    where: { id: { in: roomIds } },
    orderBy: { updatedAt: "desc" },
    include: {
      ...MOBILE_CAPTURE_ROOM_INCLUDE,
      notes: {
        ...MOBILE_CAPTURE_ROOM_INCLUDE.notes,
        where: {
          AND: [
            { kind: { in: ["SUMMARY", "HIGHLIGHT", ...SESSION_NOTE_VISIBLE_KINDS] } },
            mobileSessionNoteVisibilityWhere({
              actorUserId: userId,
              actorEmail,
              isStaff: isStaff === true,
            }),
          ],
        },
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
  const mediaAssetIds = [...new Set(
    finalizationReceipts
      .map((receipt: any) => text(receipt.mediaAssetId))
      .filter(Boolean),
  )];
  const rawCaptureMediaAssets = mediaAssetIds.length
    ? await prisma.studioMediaAsset.findMany({
        where: { id: { in: mediaAssetIds } },
        include: {
          variants: { orderBy: { updatedAt: "desc" } },
          workflowJobs: {
            orderBy: { createdAt: "desc" },
            take: 8,
          },
        },
      })
    : [];
  const captureProxyAssets = rawCaptureMediaAssets.length
    ? await prisma.studioMediaAsset.findMany({
        where: {
          rawAssetId: {
            in: rawCaptureMediaAssets.map((asset: any) => asset.id),
          },
          isProxy: true,
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const captureMediaAssets = rawCaptureMediaAssets.map((asset: any) => ({
    ...asset,
    proxyAssets: captureProxyAssets.filter(
      (proxy: any) => proxy.rawAssetId === asset.id,
    ),
  }));
  const captureProjects = accessibleCaptureProjects.filter(
    (project) => project.role === "OWNER" || project.role === "EDITOR",
  );
  const coachingEngagements = await prisma.coachingEngagement.findMany({
    where: coachingEngagementActorAccessWhere(session.user, "write"),
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      project: { select: { id: true, slug: true, name: true } },
      primaryClient: { select: { name: true, primaryEmail: true } },
      primaryCoach: { select: { name: true, primaryEmail: true } },
      members: {
        where: { userId, status: "ACTIVE" },
        take: 1,
        select: { role: true },
      },
      actionItems: {
        where: {
          status: "OPEN",
          dueAt: { lt: new Date() },
          sourceJson: { path: ["visibility"], equals: "engagement-shared" },
        },
        take: 101,
        select: { id: true },
      },
      callRooms: {
        where: { status: { in: ["PLANNED", "OPEN", "RECORDING", "ENDED"] } },
        orderBy: [{ scheduledStart: "desc" }, { createdAt: "desc" }],
        take: 30,
        select: {
          id: true,
          title: true,
          status: true,
          scheduledStart: true,
          endedAt: true,
          createdAt: true,
          transcriptJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true },
          },
          outputs: {
            where: { status: "RELEASED" },
            take: 1,
            select: { id: true },
          },
          _count: { select: { recordingAssets: true } },
        },
      },
    },
  });
  const captureProjectTags = captureProjects.length > 0
    ? await prisma.studioTag.findMany({
        where: {
          projectId: { in: captureProjects.map((project) => project.id) },
          isActive: true,
        },
        orderBy: [{ projectId: "asc" }, { label: "asc" }],
        select: { id: true, projectId: true, slug: true, label: true },
      })
    : [];
  const captureTagsByProject = new Map<string, typeof captureProjectTags>();
  for (const tag of captureProjectTags) {
    const projectTags = captureTagsByProject.get(tag.projectId) || [];
    projectTags.push(tag);
    captureTagsByProject.set(tag.projectId, projectTags);
  }
  const followThroughRooms = rooms.map((room: any) => ({
    id: room.id,
    title: room.title,
    purpose: room.purpose,
    projectId: room.projectId,
    coachingEngagementId: room.coachingEngagementId,
    scheduledStart: room.scheduledStart,
    endedAt: room.endedAt,
    createdAt: room.createdAt,
    booking: room.booking ? {
      clientUserId: room.booking.clientUserId,
      coachUserId: room.booking.coachUserId,
    } : null,
  }));
  const [
    priorContinuityByRoomId,
    priorFollowThroughByRoomId,
    currentFollowThroughByRoomId,
  ] = await Promise.all([
    loadPriorSessionContinuityByRoomId({
      prisma,
      actor: session.user,
      rooms: followThroughRooms,
    }),
    loadPriorSessionFollowThroughByRoomId({
      prisma,
      actor: session.user,
      rooms: followThroughRooms,
    }),
    loadCurrentSessionFollowThroughByRoomId({
      prisma,
      actor: session.user,
      rooms: followThroughRooms,
    }),
  ]);
  const createSessionAccess = await quipslyCoachCapabilityAccess({
    prisma,
    userId,
    capability: "coaching.call",
    isStaff: session.user.isStaff,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.primaryEmail,
      name: session.user.name,
      isStaff: session.user.isStaff,
      canCreateCaptureSessions: createSessionAccess.allowed,
    },
    captureProjects: captureProjects.map((project) => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      role: project.role,
      isHomeNest: project.sourceLabel === sourceLabelForNestKind("home"),
      availableTags: (captureTagsByProject.get(project.id) || []).map((tag: {
        id: string;
        slug: string;
        label: string;
      }) => ({
        id: tag.id,
        slug: tag.slug,
        label: tag.label,
      })),
    })),
    coachingEngagements: coachingEngagements.map((engagement: any) => {
      const priority = chooseQuipslyCoachingClientPriority({
        now: new Date().toISOString(),
        viewerRole: session.user.isStaff
          ? "COACH"
          : engagement.members[0]?.role === "COACH"
            ? "COACH"
            : engagement.members[0]?.role === "CLIENT"
              ? "CLIENT"
              : engagement.members[0]?.role === "SUPPORT"
                ? "SUPPORT"
                : "OBSERVER",
        overdueCommitmentCount: engagement.actionItems.length,
        rooms: engagement.callRooms.map((room: any) => ({
          id: room.id,
          title: room.title,
          status: room.status,
          scheduledStart: room.scheduledStart?.toISOString() ?? null,
          endedAt: room.endedAt?.toISOString() ?? null,
          createdAt: room.createdAt.toISOString(),
          recordingCount: room._count.recordingAssets,
          transcriptStatus: room.transcriptJobs[0]?.status ?? null,
          followUpReleased: room.outputs.length > 0,
        })),
      });
      return {
        id: engagement.id,
        title: engagement.title,
        status: engagement.status,
        projectId: engagement.project.id,
        projectSlug: engagement.project.slug,
        projectName: engagement.project.name,
        clientLabel: engagement.primaryClient?.name || engagement.primaryClient?.primaryEmail || null,
        coachLabel: engagement.primaryCoach?.name || engagement.primaryCoach?.primaryEmail || null,
        priority,
      };
    }),
    sessions: mapMobileCaptureSessionsForUser({
      rooms,
      userId,
      isStaff: session.user.isStaff === true,
      productionNoteProjectIds: captureProjects.map((project) => project.id),
      finalizationReceipts,
      captureMediaAssets,
      priorContinuityByRoomId,
      priorFollowThroughByRoomId,
      currentFollowThroughByRoomId,
    }),
    links: {
      today: "/api/mobile/capture/today",
      work: "/api/mobile/capture/work",
      projects: "/api/mobile/capture/projects",
      readiness: "/api/mobile/capture/readiness",
      consent: "/api/mobile/capture/consent",
      join: "/api/mobile/capture/rooms/join",
      roomState: "/api/mobile/capture/rooms/state",
      providerRecording: "/api/mobile/capture/rooms/provider-recording",
      promoteRecording: "/api/mobile/capture/recordings/promote",
      transcriptRun: "/api/mobile/capture/transcripts/run",
      transcriptPacket: "/api/mobile/capture/transcripts/packet",
      reviewDigest: "/api/mobile/capture/review-digest",
    },
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before creating a Quipsly capture session." },
      { status: 401 },
    );
  }
  const body = await readJson(request);
  const purpose = parseMobileCaptureSessionPurpose(body.purpose);
  if (!purpose) {
    return NextResponse.json(
      { ok: false, error: "Choose a supported capture type.", code: "QUIPSLY_CAPTURE_PURPOSE_INVALID" },
      { status: 400 },
    );
  }
  const prisma = getPrismaClient() as any;
  const createSessionAccess = await quipslyCoachCapabilityAccess({
    prisma,
    userId: session.user.id,
    capability: purpose === "PERSONAL_NOTE" ? "coaching.local_recording" : "coaching.call",
    isStaff: session.user.isStaff,
  });
  if (!createSessionAccess.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: purpose === "PERSONAL_NOTE"
          ? "Start or restore Quipsly access to create a new voice note. Your existing recordings and writing remain available."
          : "Start or restore a Quipsly Coach plan to create a new Session. Existing Sessions and client invitations remain available.",
        code: "QUIPSLY_SUBSCRIPTION_REQUIRED",
      },
      { status: 402 },
    );
  }

  const userId = session.user.id;
  const title = text(body.title) || fallbackTitleForMobileCapturePurpose(purpose);
  const requestedProvider = text(body.provider).toLowerCase();
  const provider = purpose === "PERSONAL_NOTE" || requestedProvider === "planned" ? "planned" : "livekit";
  const providerRoomId = provider === "livekit" ? `quipsly-${randomUUID()}` : null;
  const scheduledStart = parseDate(body.scheduledStart);
  const scheduledEnd = parseDate(body.scheduledEnd);
  const now = new Date();
  const participantDisplayName = session.user.name || session.user.primaryEmail || "Quipsly participant";
  const requestedProjectSlug = text(body.projectSlug) || text(body.nestSlug);
  const projectBinding = requestedProjectSlug
    ? await resolveStudioProjectAccess({
        projectSlug: requestedProjectSlug,
        email: session.user.primaryEmail,
        action: "write",
        prisma,
      })
    : null;
  if (requestedProjectSlug && (!projectBinding?.allowed || !projectBinding.projectId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have write access to the requested capture Nest." },
      { status: 403 },
    );
  }
  const homeNest = requestedProjectSlug
    ? null
    : await ensureHomeNestForEmail(session.user.primaryEmail, prisma);
  const captureProjectSlug = requestedProjectSlug || homeNest?.slug || "";
  const captureProjectId = projectBinding?.projectId || homeNest?.id || null;
  if (!captureProjectSlug || !captureProjectId) {
    return NextResponse.json(
      { ok: false, error: "Quipsly could not bind this capture session to an actor-owned Nest." },
      { status: 409 },
    );
  }
  let episodeBinding;
  try {
    episodeBinding = await resolveSessionEpisodeBinding({
      prisma,
      projectId: captureProjectId,
      purpose,
      episodeSlug: body.episodeSlug,
    });
  } catch (error) {
    if (error instanceof SessionEpisodeBindingError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: "QUIPSLY_SESSION_EPISODE_BINDING_INVALID" },
        { status: error.status },
      );
    }
    throw error;
  }

  const requestedEngagementId = text(body.coachingEngagementId);
  if (requestedEngagementId && purpose !== "COACHING") {
    return NextResponse.json(
      { ok: false, error: "Only coaching Sessions can bind a Coaching Engagement." },
      { status: 409 },
    );
  }
  const coachingEngagement = requestedEngagementId
    ? await prisma.coachingEngagement.findFirst({
        where: {
          ...coachingEngagementAccessWhere(requestedEngagementId, session.user, "write"),
          projectId: captureProjectId,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
        select: {
          id: true,
          title: true,
          members: {
            where: {
              status: "ACTIVE",
              role: { in: ["COACH", "CLIENT", "SUPPORT"] },
            },
            orderBy: { joinedAt: "asc" },
            select: {
              userId: true,
              role: true,
              user: { select: { name: true, primaryEmail: true } },
            },
          },
        },
      })
    : null;
  if (requestedEngagementId && !coachingEngagement) {
    return NextResponse.json(
      { ok: false, error: "The requested Coaching Engagement is unavailable or belongs to another Nest." },
      { status: 404 },
    );
  }

  const participantRows = (coachingEngagement?.members || []).map((member: any) => ({
    userId: member.userId,
    displayName: member.user.name || member.user.primaryEmail,
    email: member.user.primaryEmail,
    role: member.role === "COACH" ? "COACH" : member.role === "CLIENT" ? "CLIENT" : "GUEST",
    deviceLabel: member.userId === userId
      ? text(body.deviceLabel) || "Quipsly iOS Capture"
      : "Quipsly coaching relationship",
  }));
  if (!participantRows.some((participant: any) => participant.userId === userId)) {
    participantRows.unshift({
      userId,
      displayName: participantDisplayName,
      email: session.user.primaryEmail,
      role: coachingEngagement ? "GUEST" : "HOST",
      deviceLabel: text(body.deviceLabel) || "Quipsly iOS Capture",
    });
  }

  const room = await prisma.callRoom.create({
    data: {
      createdByUserId: userId,
      projectId: captureProjectId,
      episodeProductionId: episodeBinding.episodeProductionId,
      coachingEngagementId: coachingEngagement?.id || null,
      purpose,
      status: "PLANNED",
      provider,
      providerRoomId,
      title,
      scheduledStart,
      scheduledEnd,
      nestSlug: captureProjectSlug,
      projectSlug: captureProjectSlug,
      recordingPolicyJson: {
        source: "mobile-capture-session-create",
        explicitConsentRequired: purpose !== "PERSONAL_NOTE",
        hiddenRecordingAllowed: false,
        joiningStartsRecording: false,
        localRecordingRequiresConsent: true,
        providerRecordingRequiresAllParticipantConsent: purpose !== "PERSONAL_NOTE",
        visibleRecordingIndicatorRequired: true,
        selfCaptureOnly: purpose === "PERSONAL_NOTE",
      },
      transcriptPolicyJson: {
        source: "mobile-capture-session-create",
        transcriptRequiresRecordingEvidence: true,
        transcriptRequiresConsent: true,
        packetRequiresHumanReview: false,
        automaticEditableWork: true,
      },
      metadataJson: {
        source: "ios-capture",
        appSurface: "HighGroundCapture",
        createdFrom: "api/mobile/capture/sessions POST",
        createdByUserId: userId,
        projectId: captureProjectId,
        projectSlug: captureProjectSlug,
        episodeSlug: episodeBinding.episodeSlug,
        coachingEngagementId: coachingEngagement?.id || null,
        coachingEngagementTitle: coachingEngagement?.title || null,
        quickSession: true,
        personalSelfCapture: purpose === "PERSONAL_NOTE",
        otherAudibleParticipantsAllowed: purpose !== "PERSONAL_NOTE",
        externalSideEffects: {
          calendarMutated: false,
          stripeMutated: false,
          providerJoined: false,
          tokenMinted: false,
          recordingStarted: false,
          inviteSent: false,
        },
        createdAt: now.toISOString(),
      },
      participants: {
        create: participantRows,
      },
    },
    include: { participants: { where: { accessStatus: "ACTIVE" } } },
  });

  const hostParticipant = room.participants.find((item: any) => item.userId === userId) || room.participants[0] || null;
  await prisma.recordingConsent.createMany({
    data: room.participants.map((participant: any) => ({
      roomId: room.id,
      participantId: participant.id,
      userId: participant.userId,
      status: purpose === "PERSONAL_NOTE" ? "GRANTED" : "REQUESTED",
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: purpose === "PERSONAL_NOTE",
      canRecordVideo: false,
      canTranscribe: purpose === "PERSONAL_NOTE",
      consentedAt: purpose === "PERSONAL_NOTE" ? now : null,
      metadataJson: {
        source: purpose === "PERSONAL_NOTE" ? "ios-personal-self-capture" : "ios-capture-session-create",
        appSurface: "HighGroundCapture",
        requestedByUserId: userId,
        attestationKind: purpose === "PERSONAL_NOTE"
          ? "actor-recording-self"
          : "recorder-all-heard-participants-notified-and-agreed",
        independentParticipantReceiptsRequiredForProviderEgress: purpose !== "PERSONAL_NOTE",
        selfCaptureOnly: purpose === "PERSONAL_NOTE",
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        consentEvidenceVersion: 2,
        requestedAt: now.toISOString(),
      },
    })),
  });

  const createdRoom = await prisma.callRoom.findUnique({
    where: { id: room.id },
    include: MOBILE_CAPTURE_ROOM_INCLUDE,
  });
  const createdRoomIdentity = createdRoom ? {
    id: createdRoom.id,
    title: createdRoom.title,
    purpose: createdRoom.purpose,
    projectId: createdRoom.projectId,
    scheduledStart: createdRoom.scheduledStart,
    endedAt: createdRoom.endedAt,
    createdAt: createdRoom.createdAt,
    booking: createdRoom.booking ? {
      clientUserId: createdRoom.booking.clientUserId,
      coachUserId: createdRoom.booking.coachUserId,
    } : null,
  } : null;
  const createdPriorContinuity = createdRoomIdentity
    ? await loadPriorSessionContinuityByRoomId({
        prisma,
        actor: session.user,
        rooms: [createdRoomIdentity],
      })
    : {};
  const createdPriorFollowThrough = createdRoomIdentity
    ? await loadPriorSessionFollowThroughByRoomId({
        prisma,
        actor: session.user,
        rooms: [createdRoomIdentity],
      })
    : {};

  const [mapped] = mapMobileCaptureSessionsForUser({
    rooms: createdRoom ? [createdRoom] : [],
    userId,
    isStaff: session.user.isStaff === true,
    productionNoteProjectIds: createdRoom?.projectId ? [createdRoom.projectId] : [],
    priorContinuityByRoomId: createdPriorContinuity,
    priorFollowThroughByRoomId: createdPriorFollowThrough,
  });

  return NextResponse.json(
    {
      ok: true,
      created: true,
      session: mapped,
      boundaries: {
        appOwnedRoomCreated: true,
        episodeBound: Boolean(episodeBinding.episodeProductionId),
        participantCreated: Boolean(hostParticipant?.id),
        participantCount: room.participants.length,
        relationshipParticipantsAttached: Boolean(
          coachingEngagement && room.participants.length >= 2,
        ),
        consentRequested: purpose !== "PERSONAL_NOTE",
        selfCaptureConsentGranted: purpose === "PERSONAL_NOTE",
        recordingStarted: false,
        providerJoined: false,
        providerTokenMinted: false,
        calendarMutated: false,
        stripeMutated: false,
        externalInviteSent: false,
        nextAction: purpose === "PERSONAL_NOTE"
          ? "Record when ready. If another person can be heard, start a Session so they can consent."
          : "Open this Quipsly capture session, collect explicit consent, then join or record from visible controls.",
      },
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before scheduling a Quipsly Session." },
      { status: 401 },
    );
  }

  try {
    const input = parseMobileSessionScheduleInput(await readJson(request));
    const prisma = getPrismaClient() as any;
    const result = await prisma.$transaction(async (tx: any) => {
      const room = await tx.callRoom.findUnique({
        where: { id: input.roomId },
        select: {
          id: true,
          bookingId: true,
          createdByUserId: true,
          projectId: true,
          project: { select: { id: true, slug: true } },
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          updatedAt: true,
          metadataJson: true,
        },
      });
      if (!room) {
        throw new MobileSessionScheduleError(
          "That Session was not found.",
          404,
          "QUIPSLY_SESSION_NOT_FOUND",
        );
      }
      if (room.bookingId) {
        throw new MobileSessionScheduleError(
          "This Session belongs to a coaching booking. Reschedule the booking so its appointment and receipt trail stay together.",
          409,
          "QUIPSLY_SESSION_BOOKING_SCHEDULE_REQUIRED",
        );
      }
      if (room.status !== "PLANNED") {
        throw new MobileSessionScheduleError(
          "Only a planned Session can be scheduled. Preserve active or completed capture history and create a new Session when needed.",
          409,
          "QUIPSLY_SESSION_SCHEDULE_STATUS_LOCKED",
        );
      }

      const projectAccess = room.project?.slug
        ? await resolveStudioProjectAccess({
            projectSlug: room.project.slug,
            email: session.user.primaryEmail,
            action: "write",
            prisma: tx,
          })
        : null;
      const canSchedule =
        session.user.isStaff === true
        || room.createdByUserId === session.user.id
        || (
          projectAccess?.allowed === true
          && projectAccess.projectId === room.projectId
        );
      if (!canSchedule) {
        throw new MobileSessionScheduleError(
          "Only the Session creator or a Nest owner/editor can change this Session time.",
          403,
          "QUIPSLY_SESSION_SCHEDULE_FORBIDDEN",
        );
      }

      const replay = matchingMobileSessionScheduleReplay({
        metadataJson: room.metadataJson,
        input,
      });
      if (replay) {
        return {
          replayed: true,
          roomId: room.id,
          scheduledStart: replay.scheduledStart,
          scheduledEnd: replay.scheduledEnd,
          timezone: replay.timezone,
          updatedAt: room.updatedAt.toISOString(),
        };
      }

      const scheduleEvent = {
        schema: "quipsly-session-schedule-event-v1" as const,
        clientRequestId: input.clientRequestId,
        actorUserId: session.user.id,
        surface: "quipsly-nest-session-list" as const,
        reason: input.reason,
        previousScheduledStart: room.scheduledStart?.toISOString?.() ?? null,
        previousScheduledEnd: room.scheduledEnd?.toISOString?.() ?? null,
        scheduledStart: input.scheduledStart.toISOString(),
        scheduledEnd: input.scheduledEnd.toISOString(),
        timezone: input.timezone,
        externalCalendarMutated: false as const,
        invitationSent: false as const,
        recordingStarted: false as const,
        createdAt: new Date().toISOString(),
      };
      const updated = await tx.callRoom.updateMany({
        where: {
          id: room.id,
          status: "PLANNED",
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          metadataJson: appendMobileSessionScheduleEvent({
            metadataJson: room.metadataJson,
            event: scheduleEvent,
          }),
        },
      });
      if (updated.count !== 1) {
        const current = await tx.callRoom.findUnique({
          where: { id: room.id },
          select: {
            scheduledStart: true,
            scheduledEnd: true,
            updatedAt: true,
            metadataJson: true,
          },
        });
        throw new MobileSessionScheduleError(
          `This Session changed in another client. Current revision: ${
            current?.updatedAt?.toISOString?.() || "unavailable"
          }. Refresh before replacing its time.`,
          409,
          "QUIPSLY_SESSION_SCHEDULE_REVISION_CONFLICT",
        );
      }
      const persisted = await tx.callRoom.findUnique({
        where: { id: room.id },
        select: {
          scheduledStart: true,
          scheduledEnd: true,
          updatedAt: true,
          metadataJson: true,
        },
      });
      return {
        replayed: false,
        roomId: room.id,
        scheduledStart: persisted?.scheduledStart?.toISOString?.() ?? null,
        scheduledEnd: persisted?.scheduledEnd?.toISOString?.() ?? null,
        timezone: mobileSessionScheduledTimezone(persisted?.metadataJson),
        updatedAt: persisted?.updatedAt?.toISOString?.() ?? null,
      };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      session: result,
      boundaries: {
        quipslyScheduleUpdated: true,
        externalCalendarMutated: false,
        externalInviteSent: false,
        recordingStarted: false,
        nextAction: "The Quipsly Session time is saved. Consent, recording, invitations, and external calendars remain separate.",
      },
    });
  } catch (error) {
    if (error instanceof MobileSessionScheduleError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[mobile-capture-sessions] failed to schedule Session", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Quipsly could not safely schedule that Session.",
        code: "QUIPSLY_SESSION_SCHEDULE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
