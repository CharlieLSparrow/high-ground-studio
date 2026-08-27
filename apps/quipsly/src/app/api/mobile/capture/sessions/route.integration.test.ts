/** @jest-environment node */

jest.mock("@high-ground/quipsly-domain/coaching-lifecycle", () => ({
  buildQuipslyCoachingLifecycle: jest.fn(() => ({
    currentStage: "SESSION_READY",
    completionPercent: 0,
    blocker: null,
    nextAction: "Review the Session.",
  })),
}), { virtual: true });
jest.mock("@high-ground/quipsly-domain/coaching-packet", () => ({
  isTranscriptPacketSource: jest.fn(() => false),
  isUnreviewedTranscriptActionItemSource: jest.fn(() => false),
}), { virtual: true });

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { ensureStudioWorkspace } from "@/lib/studio/project-registry";

import { GET, PATCH, POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the mobile Session privacy smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("iPhone Session note privacy projection", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const ownerEmail = `mobile-session-owner-${nonce}@example.test`;
  const viewerEmail = `mobile-session-viewer-${nonce}@example.test`;
  const staffEmail = `mobile-session-staff-${nonce}@example.test`;
  let ownerUserId = "";
  let viewerUserId = "";
  let staffUserId = "";
  let projectId = "";
  let roomId = "";
  let roomCaptureGroupId = "";
  let podcastRoomId = "";
  let personalNoteRoomId = "";
  let engagementId = "";
  let engagementRoomId = "";
  let episodeProductionId = "";
  const projectSlug = `mobile-session-privacy-${nonce}`;
  const episodeSlug = `mobile-session-episode-${nonce}`;
  const clientFollowUpId = `client-follow-up-${nonce}`;
  const clientFollowUpSha256 = "a".repeat(64);
  const noteIds = {
    ownerPrivate: `privacy-owner-${nonce}`,
    viewerPrivate: `privacy-viewer-${nonce}`,
    shared: `privacy-shared-${nonce}`,
    clientSafe: `privacy-client-${nonce}`,
    projectTeam: `privacy-team-${nonce}`,
  };

  beforeAll(async () => {
    const [owner, viewer, staff] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: ownerEmail, name: "Session owner" } }),
      prisma.user.create({ data: { primaryEmail: viewerEmail, name: "Session viewer" } }),
      prisma.user.create({ data: { primaryEmail: staffEmail, name: "Session staff" } }),
    ]);
    ownerUserId = owner.id;
    viewerUserId = viewer.id;
    staffUserId = staff.id;

    const workspace = await ensureStudioWorkspace(prisma);
    const project = await prisma.studioProject.create({
      data: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: "Mobile Session Privacy",
      },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.createMany({
      data: [
        {
          projectId,
          email: ownerEmail,
          role: "OWNER",
          status: "ACTIVE",
          createdByUserId: ownerUserId,
          createdByEmail: ownerEmail,
        },
        {
          projectId,
          email: viewerEmail,
          role: "VIEWER",
          status: "ACTIVE",
          createdByUserId: ownerUserId,
          createdByEmail: ownerEmail,
        },
      ],
    });
    const engagement = await prisma.coachingEngagement.create({
      data: {
        projectId,
        createdByUserId: ownerUserId,
        primaryClientUserId: viewerUserId,
        primaryCoachUserId: ownerUserId,
        title: "Exact retained coaching relationship",
        members: {
          create: [
            { userId: ownerUserId, role: "COACH", addedByUserId: ownerUserId },
            { userId: viewerUserId, role: "CLIENT", addedByUserId: ownerUserId },
          ],
        },
      },
    });
    engagementId = engagement.id;
    const episodeDocument = await prisma.studioDocument.create({
      data: {
        projectId,
        stableId: `mobile-session-episode-document-${nonce}`,
        title: "Mobile Session Episode manuscript",
      },
    });
    const episode = await prisma.studioEpisodeProduction.create({
      data: {
        projectId,
        documentId: episodeDocument.id,
        slug: episodeSlug,
        title: "Mobile Session Episode",
        boundaryLabel: "Mobile Session Episode",
      },
    });
    episodeProductionId = episode.id;
    const room = await prisma.callRoom.create({
      data: {
        createdByUserId: ownerUserId,
        projectId,
        purpose: "COACHING",
        status: "PLANNED",
        title: "Visibility proof Session",
        participants: {
          create: [
            { userId: ownerUserId, email: ownerEmail, displayName: "Session owner", role: "HOST" },
            { userId: viewerUserId, email: viewerEmail, displayName: "Session viewer", role: "GUEST" },
          ],
        },
      },
    });
    roomId = room.id;
    roomCaptureGroupId = room.captureGroupId;
    await prisma.coachingNote.createMany({
      data: [
        {
          id: noteIds.ownerPrivate,
          roomId,
          authorUserId: ownerUserId,
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
          title: "Owner private",
          body: "Only the owner can receive this projection.",
        },
        {
          id: noteIds.viewerPrivate,
          roomId,
          authorUserId: viewerUserId,
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
          title: "Viewer private",
          body: "Only the viewer can receive this projection.",
        },
        {
          id: noteIds.shared,
          roomId,
          authorUserId: ownerUserId,
          kind: "SESSION_NOTE",
          visibility: "SESSION_SHARED",
          title: "Session shared",
          body: "Everyone with Session access can review this.",
        },
        {
          id: noteIds.clientSafe,
          roomId,
          authorUserId: ownerUserId,
          kind: "DECISION",
          visibility: "CLIENT_SAFE",
          title: "Client-safe decision",
          body: "This is safe for the coaching participant to review.",
        },
        {
          id: noteIds.projectTeam,
          roomId,
          authorUserId: ownerUserId,
          kind: "PRODUCTION",
          visibility: "PROJECT_TEAM",
          title: "Production note",
          body: "Only project owners, editors, and staff can review this.",
        },
      ],
    });
    await prisma.sessionOutput.create({
      data: {
        id: clientFollowUpId,
        roomId,
        createdByUserId: ownerUserId,
        recipientUserId: viewerUserId,
        kind: "CLIENT_FOLLOW_UP",
        status: "RELEASED",
        title: "Exact released mobile follow-up",
        bodyJson: {
          notes: [{
            id: noteIds.clientSafe,
            title: "Client-safe decision",
            body: "This is safe for the coaching participant to review.",
          }],
          goals: [],
          tasks: [],
        },
        sourceManifestJson: {
          noteIds: [noteIds.clientSafe],
          goalIds: [],
          taskIds: [],
        },
        contentSha256: clientFollowUpSha256,
        revision: 2,
        releasedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    try {
      if (engagementRoomId) await prisma.callRoom.deleteMany({ where: { id: engagementRoomId } });
      if (personalNoteRoomId) await prisma.callRoom.deleteMany({ where: { id: personalNoteRoomId } });
      if (podcastRoomId) await prisma.callRoom.deleteMany({ where: { id: podcastRoomId } });
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (engagementId) await prisma.coachingEngagement.deleteMany({ where: { id: engagementId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerUserId, viewerUserId, staffUserId].filter(Boolean) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  function signedInAs(id: string, email: string, isStaff = false) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id,
        primaryEmail: email,
        name: email,
        isStaff,
      },
    } as any);
  }

  async function projectedNoteIds() {
    const response = await GET(new Request("http://localhost/api/mobile/capture/sessions"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const session = payload.sessions.find((candidate: { id: string }) => candidate.id === roomId);
    expect(session).toBeDefined();
    expect(session.captureGroupId).toBe(roomCaptureGroupId);
    return {
      session,
      ids: session.sessionNotes.map((note: { id: string }) => note.id),
    };
  }

  it("creates a podcast Session with the exact same-project Episode relation", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const response = await POST(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "PODCAST",
        title: "First-class Episode recording Session",
        projectSlug,
        episodeSlug,
        provider: "planned",
      }),
    }));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.boundaries).toMatchObject({
      episodeBound: true,
      recordingStarted: false,
      providerJoined: false,
    });
    expect(payload.session).toMatchObject({ episodeSlug });
    podcastRoomId = payload.session.id;

    const readback = await prisma.callRoom.findUnique({
      where: { id: podcastRoomId },
      include: { episodeProduction: { select: { id: true, projectId: true, slug: true } } },
    });
    expect(readback?.episodeProduction).toEqual({
      id: episodeProductionId,
      projectId,
      slug: episodeSlug,
    });
  });

  it("creates a private self-recording voice note without a coaching or consent detour", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const response = await POST(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "FIELD_NOTE",
        title: "Dissertation thought",
        projectSlug,
        provider: "livekit",
      }),
    }));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.session).toMatchObject({
      purpose: "PERSONAL_NOTE",
      title: "Dissertation thought",
      consentGranted: true,
      projectId,
    });
    expect(payload.boundaries).toMatchObject({
      participantCount: 1,
      consentRequested: false,
      selfCaptureConsentGranted: true,
      providerJoined: false,
      providerTokenMinted: false,
      recordingStarted: false,
    });
    personalNoteRoomId = payload.session.id;

    const readback = await prisma.callRoom.findUnique({
      where: { id: personalNoteRoomId },
      select: {
        purpose: true,
        provider: true,
        coachingEngagementId: true,
        participants: { select: { userId: true, role: true } },
        recordingConsents: {
          select: {
            userId: true,
            status: true,
            canRecordAudio: true,
            canRecordVideo: true,
            canTranscribe: true,
            consentedAt: true,
          },
        },
      },
    });
    expect(readback).toMatchObject({
      purpose: "PERSONAL_NOTE",
      provider: "planned",
      coachingEngagementId: null,
      participants: [{ userId: ownerUserId, role: "HOST" }],
      recordingConsents: [{
        userId: ownerUserId,
        status: "GRANTED",
        canRecordAudio: true,
        canRecordVideo: false,
        canTranscribe: true,
        consentedAt: expect.any(Date),
      }],
    });
  });

  it("rejects unknown capture purposes instead of silently creating coaching work", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const before = await prisma.callRoom.count({ where: { projectId } });
    const response = await POST(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "UNREVIEWED_FUTURE_KIND", projectSlug }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "QUIPSLY_CAPTURE_PURPOSE_INVALID",
    });
    expect(await prisma.callRoom.count({ where: { projectId } })).toBe(before);
  });

  it("lists writable engagements and binds an iPhone coaching Session to the exact relationship", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const listResponse = await GET(new Request("http://localhost/api/mobile/capture/sessions"));
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.coachingEngagements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: engagementId,
        title: "Exact retained coaching relationship",
        projectId,
        projectSlug,
        priority: expect.objectContaining({
          schema: "quipsly-coaching-client-priority-v1",
          kind: "OPEN_RELATIONSHIP",
          deterministic: true,
          externalSideEffects: false,
        }),
      }),
    ]));

    const response = await POST(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "COACHING",
        title: "iPhone relationship continuity proof",
        projectSlug,
        coachingEngagementId: engagementId,
        provider: "planned",
      }),
    }));
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.session).toMatchObject({
      coachingEngagementId: engagementId,
      coachingEngagementTitle: "Exact retained coaching relationship",
      projectId,
      projectSlug,
    });
    expect(payload.boundaries).toMatchObject({
      participantCount: 2,
      relationshipParticipantsAttached: true,
      recordingStarted: false,
      providerJoined: false,
    });
    engagementRoomId = payload.session.id;

    const relationshipRoom = await prisma.callRoom.findUnique({
      where: { id: engagementRoomId },
      select: {
        projectId: true,
        coachingEngagementId: true,
        participants: {
          orderBy: { createdAt: "asc" },
          select: { userId: true, role: true, accessStatus: true },
        },
        recordingConsents: {
          orderBy: { createdAt: "asc" },
          select: { userId: true, status: true, canRecordAudio: true },
        },
      },
    });
    expect(relationshipRoom).toMatchObject({
      projectId,
      coachingEngagementId: engagementId,
      participants: expect.arrayContaining([
        { userId: ownerUserId, role: "COACH", accessStatus: "ACTIVE" },
        { userId: viewerUserId, role: "CLIENT", accessStatus: "ACTIVE" },
      ]),
      recordingConsents: expect.arrayContaining([
        { userId: ownerUserId, status: "REQUESTED", canRecordAudio: false },
        { userId: viewerUserId, status: "REQUESTED", canRecordAudio: false },
      ]),
    });
  });

  it("rejects an Episode relationship on a coaching Session without writing a room", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const before = await prisma.callRoom.count({ where: { projectId } });
    const response = await POST(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "COACHING",
        title: "Invalid coaching Episode binding",
        projectSlug,
        episodeSlug,
      }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "QUIPSLY_SESSION_EPISODE_BINDING_INVALID",
    });
    expect(await prisma.callRoom.count({ where: { projectId } })).toBe(before);
  });

  async function scheduleSession({
    actorId,
    actorEmail,
    clientRequestId,
    expectedUpdatedAt,
    scheduledStart,
    scheduledEnd,
  }: {
    actorId: string;
    actorEmail: string;
    clientRequestId: string;
    expectedUpdatedAt: string;
    scheduledStart: string;
    scheduledEnd: string;
  }) {
    signedInAs(actorId, actorEmail);
    return PATCH(new Request("http://localhost/api/mobile/capture/sessions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callRoomId: roomId,
        scheduledStart,
        scheduledEnd,
        timezone: "America/Denver",
        expectedUpdatedAt,
        clientRequestId,
        reason: "Local physical-rehearsal persistence proof.",
      }),
    }));
  }

  it("never projects another participant's private note or production-team work to a viewer", async () => {
    signedInAs(viewerUserId, viewerEmail);
    const { session, ids } = await projectedNoteIds();
    expect(ids).toEqual(expect.arrayContaining([
      noteIds.viewerPrivate,
      noteIds.shared,
      noteIds.clientSafe,
    ]));
    expect(ids).not.toEqual(expect.arrayContaining([
      noteIds.ownerPrivate,
      noteIds.projectTeam,
    ]));
    expect(session.sessionNotes.find((note: { id: string }) => note.id === noteIds.viewerPrivate)).toMatchObject({
      visibility: "AUTHOR_PRIVATE",
      isMine: true,
      canEdit: true,
    });
    expect(session.sessionNotes.find((note: { id: string }) => note.id === noteIds.clientSafe)).toMatchObject({
      kind: "DECISION",
      visibility: "CLIENT_SAFE",
      isMine: false,
    });
    expect(session.clientFollowUp).toMatchObject({
      id: clientFollowUpId,
      status: "RELEASED",
      title: "Exact released mobile follow-up",
      contentSha256: clientFollowUpSha256,
      revision: 2,
      canAcknowledge: true,
      notes: [{
        id: noteIds.clientSafe,
        title: "Client-safe decision",
      }],
    });
    expect(session.canUseProjectTeamNotes).toBe(false);
  });

  it("projects project-team work to an owner without widening the viewer's private note", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const { session, ids } = await projectedNoteIds();
    expect(ids).toEqual(expect.arrayContaining([
      noteIds.ownerPrivate,
      noteIds.shared,
      noteIds.clientSafe,
      noteIds.projectTeam,
    ]));
    expect(ids).not.toContain(noteIds.viewerPrivate);
    expect(session.canUseProjectTeamNotes).toBe(true);
  });

  it("keeps a just-finished Session reachable after the account has more than 30 historical rooms", async () => {
    signedInAs(ownerUserId, ownerEmail);
    const historyPrefix = `window-history-${nonce}-`;
    const freshRoomId = `window-fresh-${nonce}`;
    const historicalRooms = Array.from({ length: 32 }, (_, index) => ({
      id: `${historyPrefix}${String(index).padStart(2, "0")}`,
      createdByUserId: ownerUserId,
      projectId,
      purpose: "COACHING" as const,
      status: "ENDED" as const,
      title: `Historical Session ${index + 1}`,
      scheduledStart: new Date(Date.UTC(2025, 0, index + 1)),
      scheduledEnd: new Date(Date.UTC(2025, 0, index + 1, 1)),
      endedAt: new Date(Date.UTC(2025, 0, index + 1, 1)),
      updatedAt: new Date(Date.UTC(2025, 0, index + 1, 1)),
    }));
    try {
      await prisma.callRoom.createMany({ data: historicalRooms });
      await prisma.callRoom.create({
        data: {
          id: freshRoomId,
          createdByUserId: ownerUserId,
          projectId,
          purpose: "COACHING",
          status: "ENDED",
          title: "Just-finished retained Session",
          scheduledStart: new Date(Date.now() - 3_600_000),
          scheduledEnd: new Date(),
          endedAt: new Date(),
        },
      });

      const response = await GET(new Request("http://localhost/api/mobile/capture/sessions"));
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.sessions.map((candidate: { id: string }) => candidate.id)).toContain(freshRoomId);
      expect(payload.sessions[0].id).toBe(freshRoomId);
      expect(payload.sessions.map((candidate: { id: string }) => candidate.id)).not.toContain(`${historyPrefix}00`);
    } finally {
      await prisma.callRoom.deleteMany({
        where: { id: { in: [...historicalRooms.map((room) => room.id), freshRoomId] } },
      });
    }
  });

  it("lets staff review shared and project-team work but not either author's private note", async () => {
    signedInAs(staffUserId, staffEmail, true);
    const { session, ids } = await projectedNoteIds();
    expect(ids).toEqual(expect.arrayContaining([
      noteIds.shared,
      noteIds.clientSafe,
      noteIds.projectTeam,
    ]));
    expect(ids).not.toEqual(expect.arrayContaining([
      noteIds.ownerPrivate,
      noteIds.viewerPrivate,
    ]));
    expect(session.canUseProjectTeamNotes).toBe(true);
  });

  it("persists one authorized, idempotent, revision-safe Quipsly-only Session schedule receipt", async () => {
    const before = await prisma.callRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { updatedAt: true },
    });
    const expectedUpdatedAt = before.updatedAt.toISOString();
    const scheduledStart = new Date(Date.now() + 60 * 60_000);
    scheduledStart.setSeconds(0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + 50 * 60_000);
    const clientRequestId = randomUUID();

    const firstResponse = await scheduleSession({
      actorId: ownerUserId,
      actorEmail: ownerEmail,
      clientRequestId,
      expectedUpdatedAt,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    });
    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json();
    expect(firstPayload).toMatchObject({
      ok: true,
      session: {
        roomId,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        timezone: "America/Denver",
        replayed: false,
      },
      boundaries: {
        quipslyScheduleUpdated: true,
        externalCalendarMutated: false,
        externalInviteSent: false,
        recordingStarted: false,
      },
    });

    const persisted = await prisma.callRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: {
        scheduledStart: true,
        scheduledEnd: true,
        updatedAt: true,
        metadataJson: true,
      },
    });
    expect(persisted.scheduledStart?.toISOString()).toBe(scheduledStart.toISOString());
    expect(persisted.scheduledEnd?.toISOString()).toBe(scheduledEnd.toISOString());
    expect(persisted.metadataJson).toMatchObject({
      scheduledTimezone: "America/Denver",
      scheduleEvents: [{
        schema: "quipsly-session-schedule-event-v1",
        clientRequestId,
        actorUserId: ownerUserId,
        externalCalendarMutated: false,
        invitationSent: false,
        recordingStarted: false,
      }],
    });

    const replayResponse = await scheduleSession({
      actorId: ownerUserId,
      actorEmail: ownerEmail,
      clientRequestId,
      expectedUpdatedAt,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    });
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toMatchObject({
      ok: true,
      session: { replayed: true },
    });
    const afterReplay = await prisma.callRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { metadataJson: true },
    });
    expect((afterReplay.metadataJson as { scheduleEvents?: unknown[] }).scheduleEvents).toHaveLength(1);

    const changedIdentityResponse = await scheduleSession({
      actorId: ownerUserId,
      actorEmail: ownerEmail,
      clientRequestId,
      expectedUpdatedAt,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: new Date(scheduledEnd.getTime() + 10 * 60_000).toISOString(),
    });
    expect(changedIdentityResponse.status).toBe(409);
    expect(await changedIdentityResponse.json()).toMatchObject({
      ok: false,
      code: "QUIPSLY_SESSION_SCHEDULE_IDENTITY_CONFLICT",
    });

    const staleResponse = await scheduleSession({
      actorId: ownerUserId,
      actorEmail: ownerEmail,
      clientRequestId: randomUUID(),
      expectedUpdatedAt,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    });
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({
      ok: false,
      code: "QUIPSLY_SESSION_SCHEDULE_REVISION_CONFLICT",
    });

    const forbiddenResponse = await scheduleSession({
      actorId: viewerUserId,
      actorEmail: viewerEmail,
      clientRequestId: randomUUID(),
      expectedUpdatedAt: persisted.updatedAt.toISOString(),
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    });
    expect(forbiddenResponse.status).toBe(403);
    expect(await forbiddenResponse.json()).toMatchObject({
      ok: false,
      code: "QUIPSLY_SESSION_SCHEDULE_FORBIDDEN",
    });
  });
});
