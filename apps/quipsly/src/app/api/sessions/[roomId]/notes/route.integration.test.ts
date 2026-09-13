/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { loadLibrary } from "@/app/(app)/library/library-page";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";
import { PATCH } from "@/app/api/notes/[noteId]/route";

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
  const projectViewerEmail = `session-notes-viewer-${nonce}@example.test`;
  let actorUserId = "";
  let participantUserId = "";
  let projectViewerUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";

  beforeAll(async () => {
    const [actor, participant, projectViewer] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Session note author" } }),
      prisma.user.create({ data: { primaryEmail: participantEmail, name: "Session participant" } }),
      prisma.user.create({ data: { primaryEmail: projectViewerEmail, name: "Project-only viewer" } }),
    ]);
    actorUserId = actor.id;
    participantUserId = participant.id;
    projectViewerUserId = projectViewer.id;
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
        { projectId, email: projectViewerEmail, role: "VIEWER", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail },
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
      if (actorUserId || participantUserId || projectViewerUserId) {
        await prisma.user.deleteMany({ where: { id: { in: [actorUserId, participantUserId, projectViewerUserId].filter(Boolean) } } });
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
        canonicalSessionMutationAccess: true,
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

  it("does not let a Session participant with a viewer project role author production-team policy", async () => {
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

  it("keeps a project-only viewer read-only for every Session note audience", async () => {
    signedInAs(projectViewerUserId, projectViewerEmail);
    const response = await post({
      clientRequestId: randomUUID(),
      title: "Viewer private note attempt",
      body: "A read-only project grant must not create Session state.",
      kind: "SESSION_NOTE",
      visibility: "AUTHOR_PRIVATE",
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(prisma.coachingNote.count({
      where: { roomId, title: "Viewer private note attempt" },
    })).resolves.toBe(0);
  });

  it("reads canonical live notes with private, shared, read-only and outsider boundaries", async () => {
    const read = () => GET(new Request(`http://localhost/api/sessions/${roomId}/notes`), { params: Promise.resolve({ roomId }) });
    signedInAs(actorUserId, actorEmail);
    const author = await read();
    expect(author.headers.get("Cache-Control")).toBe("private, no-store");
    const authorBody = await author.json();
    expect(authorBody.actorUserId).toBe(actorUserId);
    expect(authorBody.canCreate).toBe(true);
    expect(authorBody.notes.map((note: any) => note.title)).toContain("Private coaching observation");
    expect(authorBody.notes.map((note: any) => note.title)).toContain("Production audience evidence");

    signedInAs(participantUserId, participantEmail);
    const participant = await (await read()).json();
    expect(participant.canCreate).toBe(true);
    expect(participant.notes.map((note: any) => note.title)).toEqual(expect.arrayContaining(["Shared audience evidence", "Client-safe audience evidence"]));
    expect(participant.notes.every((note: any) => note.canEdit)).toBe(true);
    expect(participant.notes.some((note: any) => note.visibility === "AUTHOR_PRIVATE" || note.visibility === "PROJECT_TEAM")).toBe(false);
    expect(participant.notes.every((note: any) => !note.canChangeVisibility)).toBe(true);
    const shared = participant.notes.find((note: any) => note.title === "Shared audience evidence");
    const editInput = { clientRequestId: randomUUID(), title: shared.title, body: "The client revised this during our call.", kind: shared.kind, visibility: shared.visibility, tagIds: shared.tags.map((tag: any) => tag.id), expectedUpdatedAt: shared.updatedAt, surface: "nest-session-notes" };
    const edit = () => PATCH(new Request(`http://localhost/api/notes/${shared.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(editInput) }), { params: Promise.resolve({ noteId: shared.id }) });
    expect((await edit()).status).toBe(200);
    const replay = await (await edit()).json();
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, note: { body: editInput.body } });

    signedInAs(projectViewerUserId, projectViewerEmail);
    const viewer = await (await read()).json();
    expect(viewer.canCreate).toBe(false);
    expect(viewer.notes.every((note: any) => !note.canEdit)).toBe(true);

    const outsider = await prisma.user.create({ data: { primaryEmail: `live-notes-outsider-${nonce}@example.test` } });
    try { signedInAs(outsider.id, outsider.primaryEmail!); expect((await read()).status).toBe(404); }
    finally { await prisma.user.delete({ where: { id: outsider.id } }); }
  });
});
