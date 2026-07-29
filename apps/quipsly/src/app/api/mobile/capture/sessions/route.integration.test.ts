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

import { GET, PATCH } from "./route";

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
        slug: `mobile-session-privacy-${nonce}`,
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
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
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
        hasBetaAccess: true,
      },
    } as any);
  }

  async function projectedNoteIds() {
    const response = await GET(new Request("http://localhost/api/mobile/capture/sessions"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const session = payload.sessions.find((candidate: { id: string }) => candidate.id === roomId);
    expect(session).toBeDefined();
    return {
      session,
      ids: session.sessionNotes.map((note: { id: string }) => note.id),
    };
  }

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
