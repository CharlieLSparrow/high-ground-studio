import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "@/lib/mobile-capture-consent-policy.js";
import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { mapMobileCaptureSessionsForUser } from "@/lib/server/mobile-capture-sessions";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
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
  participants: true,
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
  actionItems: {
    where: { status: "OPEN" },
    select: { id: true, sourceJson: true },
    take: 100,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePurpose(value: unknown) {
  const purpose = text(value).toUpperCase().replace(/[-\s]+/g, "_");
  return ["COACHING", "PODCAST", "RESEARCH_INTERVIEW", "INTERNAL_MEETING"].includes(purpose)
    ? purpose
    : "COACHING";
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function fallbackTitleForPurpose(purpose: string) {
  if (purpose === "PODCAST") return "Podcast capture session";
  if (purpose === "RESEARCH_INTERVIEW") return "Research interview capture session";
  if (purpose === "INTERNAL_MEETING") return "Quipsly meeting capture";
  return "Coaching capture session";
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

  const rooms = await prisma.callRoom.findMany({
    where: isStaff
      ? {}
      : {
          OR: [
            { createdByUserId: userId },
            { participants: { some: { userId } } },
            { booking: { clientUserId: userId } },
            { booking: { coachUserId: userId } },
          ],
    },
    orderBy: [{ scheduledStart: "asc" }, { updatedAt: "desc" }],
    take: 30,
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
  const captureProjects = (await listAccessibleStudioProjectSummariesForEmail(
    session.user.primaryEmail,
    prisma,
  )).filter((project) => project.role === "OWNER" || project.role === "EDITOR");
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

  return NextResponse.json({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.primaryEmail,
      name: session.user.name,
      isStaff: session.user.isStaff,
      canCreateCaptureSessions: session.user.isStaff || session.user.hasBetaAccess,
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
    sessions: mapMobileCaptureSessionsForUser({
      rooms,
      userId,
      isStaff: session.user.isStaff === true,
      productionNoteProjectIds: captureProjects.map((project) => project.id),
      finalizationReceipts,
    }),
    links: {
      today: "/api/mobile/capture/today",
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
  if (!session.user.isStaff && !session.user.hasBetaAccess) {
    return NextResponse.json(
      {
        ok: false,
        error: "Creating Capture rooms is limited to approved Quipsly beta accounts.",
        code: "QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED",
      },
      { status: 403 },
    );
  }

  const body = await readJson(request);
  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const purpose = normalizePurpose(body.purpose);
  const title = text(body.title) || fallbackTitleForPurpose(purpose);
  const requestedProvider = text(body.provider).toLowerCase();
  const provider = requestedProvider === "planned" ? "planned" : "livekit";
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

  const room = await prisma.callRoom.create({
    data: {
      createdByUserId: userId,
      projectId: captureProjectId,
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
        explicitConsentRequired: true,
        hiddenRecordingAllowed: false,
        joiningStartsRecording: false,
        localRecordingRequiresConsent: true,
        providerRecordingRequiresAllParticipantConsent: true,
        visibleRecordingIndicatorRequired: true,
      },
      transcriptPolicyJson: {
        source: "mobile-capture-session-create",
        transcriptRequiresRecordingEvidence: true,
        transcriptRequiresConsent: true,
        packetRequiresHumanReview: true,
      },
      metadataJson: {
        source: "ios-capture",
        appSurface: "HighGroundCapture",
        createdFrom: "api/mobile/capture/sessions POST",
        createdByUserId: userId,
        projectId: captureProjectId,
        projectSlug: captureProjectSlug,
        episodeSlug: text(body.episodeSlug) || null,
        quickSession: true,
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
        create: {
          userId,
          displayName: participantDisplayName,
          email: session.user.primaryEmail,
          role: "HOST",
          deviceLabel: text(body.deviceLabel) || "Quipsly iOS Capture",
        },
      },
    },
    include: { participants: true },
  });

  const hostParticipant = room.participants.find((item: any) => item.userId === userId) || room.participants[0] || null;
  await prisma.recordingConsent.create({
    data: {
      roomId: room.id,
      participantId: hostParticipant?.id ?? null,
      userId,
      status: "REQUESTED",
      consentText: MOBILE_CAPTURE_CONSENT_TEXT,
      policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      canRecordAudio: false,
      canRecordVideo: false,
      canTranscribe: false,
      metadataJson: {
        source: "ios-capture-session-create",
        appSurface: "HighGroundCapture",
        requestedByUserId: userId,
        attestationKind: "recorder-all-heard-participants-notified-and-agreed",
        independentParticipantReceiptsRequiredForProviderEgress: true,
        consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        consentEvidenceVersion: 2,
        requestedAt: now.toISOString(),
      },
    },
  });

  const createdRoom = await prisma.callRoom.findUnique({
    where: { id: room.id },
    include: MOBILE_CAPTURE_ROOM_INCLUDE,
  });

  const [mapped] = mapMobileCaptureSessionsForUser({
    rooms: createdRoom ? [createdRoom] : [],
    userId,
    isStaff: session.user.isStaff === true,
    productionNoteProjectIds: createdRoom?.projectId ? [createdRoom.projectId] : [],
  });

  return NextResponse.json(
    {
      ok: true,
      created: true,
      session: mapped,
      boundaries: {
        appOwnedRoomCreated: true,
        participantCreated: Boolean(hostParticipant?.id),
        consentRequested: true,
        recordingStarted: false,
        providerJoined: false,
        providerTokenMinted: false,
        calendarMutated: false,
        stripeMutated: false,
        externalInviteSent: false,
        nextAction: "Open this Quipsly capture session, collect explicit consent, then join or record from visible controls.",
      },
    },
    { status: 201 },
  );
}
