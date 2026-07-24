/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { loadLibrary } from "@/app/(app)/library/library-page";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Session Notes smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Session Notes creation and audience local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `session-notes-${nonce}@example.test`;
  const participantEmail = `session-notes-participant-${nonce}@example.test`;
  let actorUserId = "";
  let participantUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";

  beforeAll(async () => {
    const [actor, participant] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Session note author" } }),
      prisma.user.create({ data: { primaryEmail: participantEmail, name: "Session participant" } }),
    ]);
    actorUserId = actor.id;
    participantUserId = participant.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `session-notes-${nonce}`, name: "Session Notes smoke" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: { workspaceId, slug: `session-notes-${nonce}`, name: "Session Notes Nest" },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.createMany({
      data: [
        { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail },
        { projectId, email: participantEmail, role: "VIEWER", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail },
      ],
    });
    const room = await prisma.callRoom.create({
      data: { createdByUserId: actorUserId, projectId, title: "Audience policy rehearsal" },
    });
    roomId = room.id;
    await prisma.callParticipant.create({
      data: { roomId, userId: participantUserId, displayName: "Session participant", role: "CLIENT" },
    });
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || participantUserId) {
        await prisma.user.deleteMany({ where: { id: { in: [actorUserId, participantUserId].filter(Boolean) } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  function signedInAs(id: string, email: string) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id, primaryEmail: email, isStaff: false },
    } as any);
  }

  function post(input: {
    clientRequestId: string;
    title: string;
    body: string;
    kind: "SESSION_NOTE" | "DECISION" | "PRODUCTION";
    visibility: "AUTHOR_PRIVATE" | "SESSION_SHARED" | "CLIENT_SAFE" | "PROJECT_TEAM";
  }) {
    return POST(new Request(`http://localhost/api/sessions/${roomId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }), { params: Promise.resolve({ roomId }) });
  }

  it("creates one private note and converges an exact retry on its canonical identity", async () => {
    signedInAs(actorUserId, actorEmail);
    const input = {
      clientRequestId: randomUUID(),
      title: "Private coaching observation",
      body: "Retain the exact private coaching context.",
      kind: "SESSION_NOTE" as const,
      visibility: "AUTHOR_PRIVATE" as const,
    };
    const first = await post(input);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: {
        title: input.title,
        visibility: "AUTHOR_PRIVATE",
        revisionCount: 1,
      },
      boundaries: {
        canonicalIdentity: true,
        sessionAccessRechecked: true,
        explicitVisibility: true,
        externalSideEffects: false,
      },
    });

    const retry = await post(input);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      ok: true,
      idempotentReplay: true,
      note: { id: firstBody.note.id, revisionCount: 1 },
    });
    await expect(prisma.coachingNoteRevision.findMany({
      where: { noteId: firstBody.note.id },
      select: { revision: true, operation: true, snapshotJson: true },
    })).resolves.toEqual([expect.objectContaining({
      revision: 1,
      operation: "created",
      snapshotJson: expect.objectContaining({ visibility: "AUTHOR_PRIVATE" }),
    })]);

    const conflict = await post({ ...input, body: "Different body under the same retry identity." });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ ok: false, code: "REQUEST_ID_CONFLICT" });

    const participantLibrary = await loadLibrary(participantUserId, participantEmail, false);
    expect(JSON.stringify(participantLibrary)).not.toContain(input.title);
  });

  it("projects shared and client-safe notes to a participant while holding production-team notes", async () => {
    signedInAs(actorUserId, actorEmail);
    for (const item of [
      { title: "Shared audience evidence", visibility: "SESSION_SHARED" as const, kind: "SESSION_NOTE" as const },
      { title: "Client-safe audience evidence", visibility: "CLIENT_SAFE" as const, kind: "DECISION" as const },
      { title: "Production audience evidence", visibility: "PROJECT_TEAM" as const, kind: "PRODUCTION" as const },
    ]) {
      const response = await post({
        clientRequestId: randomUUID(),
        title: item.title,
        body: `${item.title} body`,
        kind: item.kind,
        visibility: item.visibility,
      });
      expect(response.status).toBe(200);
    }

    const participantLibrary = await loadLibrary(participantUserId, participantEmail, false);
    const participantProjection = JSON.stringify(participantLibrary);
    expect(participantProjection).toContain("Shared audience evidence");
    expect(participantProjection).toContain("Client-safe audience evidence");
    expect(participantProjection).not.toContain("Production audience evidence");

    const authorLibrary = await loadLibrary(actorUserId, actorEmail, false);
    expect(JSON.stringify(authorLibrary)).toContain("Production audience evidence");
  });

  it("does not let a project viewer author production-team policy", async () => {
    signedInAs(participantUserId, participantEmail);
    const response = await post({
      clientRequestId: randomUUID(),
      title: "Unauthorized production note",
      body: "This must not be written.",
      kind: "PRODUCTION",
      visibility: "PROJECT_TEAM",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, code: "PROJECT_ROLE_REQUIRED" });
    await expect(prisma.coachingNote.count({
      where: { roomId, title: "Unauthorized production note" },
    })).resolves.toBe(0);
  });
});
