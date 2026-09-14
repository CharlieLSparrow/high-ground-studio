/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { loadLibrary } from "@/app/(app)/library/library-page";
import { generatedPacketNoteCanRefresh } from "@/lib/server/coaching-packets";

import { PATCH } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the Session note edit smoke.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Session note editing local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `note-edit-${nonce}@example.test`;
  const otherEmail = `note-edit-other-${nonce}@example.test`;
  const outsiderEmail = `note-edit-outsider-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let outsiderUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";
  let noteId = "";
  let tagId = "";
  let retiredTagId = "";

  beforeAll(async () => {
    const [actor, other, outsider] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Note author" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Other actor" } }),
      prisma.user.create({ data: { primaryEmail: outsiderEmail, name: "Outside actor" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    outsiderUserId = outsider.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `note-edit-${nonce}`, name: "Note edit smoke" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `note-edit-${nonce}`, name: "High Ground Odyssey" } });
    projectId = project.id;
    const tag = await prisma.studioTag.create({
      data: {
        projectId,
        slug: `proof-listen-${nonce}`,
        label: "Proof listen",
        category: "meaning",
        nodeType: "source_note",
      },
    });
    tagId = tag.id;
    const retiredTag = await prisma.studioTag.create({
      data: {
        projectId,
        slug: `retired-context-${nonce}`,
        label: "Retired context",
        category: "meaning",
        nodeType: "source_note",
        isActive: false,
      },
    });
    retiredTagId = retiredTag.id;
    await prisma.studioProjectAccessGrant.create({ data: { projectId, email: actorEmail, role: "EDITOR", status: "ACTIVE", createdByUserId: actorUserId, createdByEmail: actorEmail } });
    const room = await prisma.callRoom.create({ data: { createdByUserId: otherUserId, projectId, title: "Episode note edit" } });
    roomId = room.id;
    const note = await prisma.coachingNote.create({
      data: {
        roomId,
        authorUserId: actorUserId,
        kind: "SESSION_NOTE",
        title: "Opening note",
        body: "Let the opening breathe.",
        sourceJson: { schema: "quipsly-mobile-quick-entry-v1", surface: "ios-capture" },
      },
    });
    noteId = note.id;
    await prisma.coachingNoteTagLink.create({
      data: {
        noteId,
        tagId: retiredTagId,
        createdByUserId: actorUserId,
        sourceJson: { source: "local-smoke-retired-tag" },
      },
    });
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId || outsiderUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId, outsiderUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function signedInAs(id: string, email: string) {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id, primaryEmail: email, isStaff: false } } as any);
  }

  function patch(expectedUpdatedAt: Date, title: string, body: string, options: {
    kind?: "SESSION_NOTE" | "DECISION" | "PRODUCTION";
    visibility?: "AUTHOR_PRIVATE" | "SESSION_SHARED" | "CLIENT_SAFE" | "PROJECT_TEAM";
    tagIds?: string[];
    clientRequestId?: string;
  } = {}) {
    return PATCH(new Request(`http://localhost/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, expectedUpdatedAt: expectedUpdatedAt.toISOString(), ...options }),
    }), { params: Promise.resolve({ noteId }) });
  }

  it("handles simultaneous saves as a saved revision and a recoverable conflict, then saves the rebased edit once", async () => {
    signedInAs(actorUserId, actorEmail);
    const shared = await prisma.coachingNote.create({ data: {
      roomId, authorUserId: actorUserId, kind: "SESSION_NOTE", visibility: "SESSION_SHARED",
      title: "Concurrent session notes", body: "Opening question.\nNext step.",
    } });
    const edit = (expectedUpdatedAt: Date, title: string, body: string, clientRequestId: string) => PATCH(new Request(`http://localhost/api/notes/${shared.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: expectedUpdatedAt.toISOString(), title, body, clientRequestId,
        kind: "SESSION_NOTE", visibility: "SESSION_SHARED", tagIds: [] }),
    }), { params: Promise.resolve({ noteId: shared.id }) });
    const responses = await Promise.all([
      edit(shared.updatedAt, "A clearer title", shared.body, randomUUID()),
      edit(shared.updatedAt, shared.title!, "Opening question.\nNext step: one reflection.", randomUUID()),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const conflict = await responses.find(response => response.status === 409)!.json();
    expect(conflict).toMatchObject({ ok: false, code: "CONFLICT", current: { id: shared.id } });
    expect(await prisma.coachingNoteRevision.count({ where: { noteId: shared.id } })).toBe(1);
    const requestId = randomUUID();
    const retry = () => edit(new Date(conflict.current.updatedAt), "A clearer title", "Opening question.\nNext step: one reflection.", requestId);
    expect((await retry()).status).toBe(200);
    expect(await (await retry()).json()).toMatchObject({ ok: true, idempotentReplay: true });
    expect(await prisma.coachingNoteRevision.count({ where: { noteId: shared.id } })).toBe(2);
  });

  it("retries an aborted write conflict without duplicating the note revision", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.create({ data: {
      roomId, authorUserId: actorUserId, kind: "SESSION_NOTE", visibility: "SESSION_SHARED",
      title: "Aborted transaction", body: "Keep this revision once.",
    } });
    const transaction = jest.spyOn(prisma, "$transaction").mockRejectedValueOnce({ code: "P2034" });
    try {
      const response = await PATCH(new Request(`http://localhost/api/notes/${before.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: before.updatedAt.toISOString(), title: before.title, body: before.body }),
      }), { params: Promise.resolve({ noteId: before.id }) });
      expect(response.status).toBe(200);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(await prisma.coachingNoteRevision.count({ where: { noteId: before.id } })).toBe(1);
    } finally { transaction.mockRestore(); }
  });

  it("does not return newly private note content in a conflict readback", async () => {
    signedInAs(actorUserId, actorEmail);
    const shared = await prisma.coachingNote.create({ data: {
      roomId, authorUserId: otherUserId, kind: "SESSION_NOTE", visibility: "SESSION_SHARED",
      title: "Initially shared", body: "Shared opening.",
    } });
    const transaction = jest.spyOn(prisma, "$transaction").mockImplementationOnce(async () => {
      await prisma.coachingNote.update({ where: { id: shared.id }, data: { visibility: "AUTHOR_PRIVATE", body: "Now private." } });
      return { kind: "conflict" };
    });
    try {
      const response = await PATCH(new Request(`http://localhost/api/notes/${shared.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: shared.updatedAt.toISOString(), title: shared.title, body: "My edit." }),
      }), { params: Promise.resolve({ noteId: shared.id }) });
      expect(response.status).toBe(404);
      expect(await response.json()).not.toHaveProperty("current");
    } finally { transaction.mockRestore(); }
  });

  it.each(["SUMMARY", "HIGHLIGHT"] as const)("lets collaborators edit generated %s notes with source retention, retries, and isolation", async (kind) => {
    const generated = await prisma.coachingNote.create({ data: {
      roomId, authorUserId: actorUserId, kind, visibility: "SESSION_SHARED",
      title: "Generated session work", body: "The original generated wording.",
      sourceJson: { origin: "quipsly-session-follow-through", automaticallyCreated: true,
        packetBuildId: "packet-test", transcriptJobId: "source-transcript",
        generatedNoteSnapshot: { schema: "quipsly-generated-packet-note-snapshot-v1",
          title: "Generated session work", body: "The original generated wording." } },
    } });
    expect(generatedPacketNoteCanRefresh(generated)).toBe(true);
    const requestId = randomUUID();
    const edit = (overrides = {}) => PATCH(new Request(`http://localhost/api/notes/${generated.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Our session recap", body: "We agreed to practice the opening question.",
        kind, visibility: "SESSION_SHARED", tagIds: [], expectedUpdatedAt: generated.updatedAt.toISOString(),
        clientRequestId: requestId, ...overrides }),
    }), { params: Promise.resolve({ noteId: generated.id }) });
    signedInAs(outsiderUserId, outsiderEmail);
    expect((await edit()).status).toBe(404);
    signedInAs(otherUserId, otherEmail);
    const response = await edit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, note: { id: generated.id, kind, body: "We agreed to practice the opening question." } });
    expect(await (await edit()).json()).toMatchObject({ ok: true, idempotentReplay: true });
    const saved = await prisma.coachingNote.findUniqueOrThrow({ where: { id: generated.id } });
    expect(generatedPacketNoteCanRefresh(saved)).toBe(false);
    expect(saved.sourceJson).toMatchObject({ transcriptJobId: "source-transcript", packetBuildId: "packet-test",
      lastEditReceipt: { previous: { body: generated.body } } });
    expect(await prisma.coachingNoteRevision.count({ where: { noteId: generated.id } })).toBe(1);
    expect((await edit({ kind: "SESSION_NOTE", clientRequestId: randomUUID(), expectedUpdatedAt: saved.updatedAt.toISOString() })).status).toBe(400);
    expect((await edit({ body: "A stale edit", clientRequestId: randomUUID() })).status).toBe(409);
    await prisma.coachingNote.update({ where: { id: generated.id }, data: { visibility: "AUTHOR_PRIVATE" } });
    expect((await edit()).status).toBe(404);
  });

  it("updates the exact actor-owned note through its Nest editor grant with a retained previous-value receipt", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const response = await patch(before.updatedAt, "Opening rhythm", "Pause, then let the first question breathe.");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      note: { id: noteId, title: "Opening rhythm", body: "Pause, then let the first question breathe." },
      boundaries: {
        authorizedCollaborator: true,
        privateAuthorOnly: true,
        canonicalSessionMutationAccess: true,
        sessionAccessRechecked: true,
        explicitVisibility: true,
        appendOnlyRevision: true,
        externalSideEffects: false,
      },
    });
    await expect(prisma.coachingNote.findUnique({ where: { id: noteId } })).resolves.toMatchObject({
      sourceJson: {
        schema: "quipsly-mobile-quick-entry-v1",
        lastEditReceipt: {
          kind: "quipsly-session-note-edit-v2",
          previous: {
            title: "Opening note",
            body: "Let the opening breathe.",
            kind: "SESSION_NOTE",
            visibility: "AUTHOR_PRIVATE",
          },
          externalSideEffects: false,
        },
      },
    });
    const library = await loadLibrary(actorUserId, actorEmail, false);
    expect(library.entries.find((entry) => entry.id === `note:${noteId}`)).toMatchObject({
      title: "Opening rhythm",
      detail: "Pause, then let the first question breathe.",
      href: `/sessions/${roomId}?mode=notes#session-note-${noteId}`,
    });
    await expect(prisma.coachingNoteRevision.findMany({
      where: { noteId },
      orderBy: { revision: "asc" },
      select: { revision: true, operation: true, snapshotJson: true },
    })).resolves.toEqual([expect.objectContaining({
      revision: 1,
      operation: "content-or-visibility-updated",
      snapshotJson: expect.objectContaining({
        title: "Opening rhythm",
        visibility: "AUTHOR_PRIVATE",
        previous: expect.objectContaining({ title: "Opening note" }),
      }),
    })]);
  });

  it("changes note purpose and visibility while retaining the prior audience", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const response = await patch(
      before.updatedAt,
      "Opening decision",
      "Pause, then lead with the listener question.",
      { kind: "DECISION", visibility: "CLIENT_SAFE" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      note: {
        id: noteId,
        kind: "DECISION",
        visibility: "CLIENT_SAFE",
        revisionCount: 2,
      },
    });
    await expect(prisma.coachingNoteRevision.findFirst({
      where: { noteId },
      orderBy: { revision: "desc" },
    })).resolves.toMatchObject({
      revision: 2,
      snapshotJson: {
        kind: "DECISION",
        visibility: "CLIENT_SAFE",
        previous: {
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
        },
      },
    });
  });

  it("lets the Session owner update shared content without taking over its audience", async () => {
    const current = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    signedInAs(actorUserId, actorEmail);
    const stale = await patch(new Date(0), "Stale title", "Stale body");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, code: "CONFLICT", current: { updatedAt: current.updatedAt.toISOString() } });

    signedInAs(otherUserId, otherEmail);
    const collaboration = await patch(current.updatedAt, "Shared title", "Shared Session context.");
    expect(collaboration.status).toBe(200);
    const collaborated = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const audienceDenied = await patch(
      collaborated.updatedAt,
      "Shared title",
      "Shared Session context.",
      { visibility: "AUTHOR_PRIVATE" },
    );
    expect(audienceDenied.status).toBe(403);
    expect(await audienceDenied.json()).toMatchObject({ ok: false, code: "AUDIENCE_AUTHOR_REQUIRED" });
    await expect(prisma.coachingNote.findUnique({ where: { id: noteId }, select: { title: true, body: true } })).resolves.toEqual({
      title: "Shared title",
      body: "Shared Session context.",
    });

    signedInAs(outsiderUserId, outsiderEmail);
    const outside = await patch(collaborated.updatedAt, "Outside title", "Outside body");
    expect(outside.status).toBe(404);
  });

  it("atomically applies protected iPhone content, audience, and tags exactly once", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const clientRequestId = randomUUID();
    const options = {
      kind: "DECISION" as const,
      visibility: "CLIENT_SAFE" as const,
      tagIds: [tagId, retiredTagId],
      clientRequestId,
    };
    const first = await patch(
      before.updatedAt,
      "Opening decision from iPhone",
      "Lead with the listener question, then proof-listen before follow-up.",
      options,
    );
    const replay = await patch(
      before.updatedAt,
      "Opening decision from iPhone",
      "Lead with the listener question, then proof-listen before follow-up.",
      options,
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: {
        id: noteId,
        title: "Opening decision from iPhone",
        visibility: "CLIENT_SAFE",
        tags: expect.arrayContaining([
          expect.objectContaining({ id: tagId, label: "Proof listen" }),
          expect.objectContaining({ id: retiredTagId, label: "Retired context" }),
        ]),
      },
      boundaries: {
        projectAuthorityRechecked: true,
        canonicalTagsAtomic: true,
        retryIdentityProtected: true,
        externalSideEffects: false,
      },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      ok: true,
      idempotentReplay: true,
      receiptId: firstBody.receiptId,
      appliedRevision: firstBody.appliedRevision,
      note: { id: noteId },
    });

    await expect(prisma.coachingNoteRevision.count({
      where: { noteId, id: firstBody.receiptId },
    })).resolves.toBe(1);
    await expect(prisma.coachingNoteTagLink.findMany({
      where: { noteId },
      select: { tagId: true },
    })).resolves.toEqual(expect.arrayContaining([
      { tagId },
      { tagId: retiredTagId },
    ]));

    const changedIntent = await patch(
      before.updatedAt,
      "Opening decision from iPhone",
      "A different draft must not reuse the same protected identity.",
      options,
    );
    expect(changedIntent.status).toBe(409);
    expect(await changedIntent.json()).toMatchObject({
      ok: false,
      code: "REQUEST_ID_CONFLICT",
    });

    const afterIPhoneEdit = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const laterWebEdit = await patch(
      afterIPhoneEdit.updatedAt,
      "Later Nest review",
      "Nest deliberately changed the note after the protected iPhone request committed.",
    );
    expect(laterWebEdit.status).toBe(200);

    const replayAfterLaterEdit = await patch(
      before.updatedAt,
      "Opening decision from iPhone",
      "Lead with the listener question, then proof-listen before follow-up.",
      options,
    );
    expect(replayAfterLaterEdit.status).toBe(200);
    expect(await replayAfterLaterEdit.json()).toMatchObject({
      ok: true,
      idempotentReplay: true,
      receiptId: firstBody.receiptId,
      appliedRevision: firstBody.appliedRevision,
      note: {
        id: noteId,
        title: "Later Nest review",
        body: "Nest deliberately changed the note after the protected iPhone request committed.",
      },
    });
    await expect(prisma.coachingNoteRevision.count({
      where: { noteId, id: firstBody.receiptId },
    })).resolves.toBe(1);
  });

  it("denies further edits after the author is downgraded to a project viewer", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const revisionCount = await prisma.coachingNoteRevision.count({ where: { noteId } });
    await prisma.studioProjectAccessGrant.update({
      where: { projectId_email: { projectId, email: actorEmail } },
      data: { role: "VIEWER" },
    });

    const denied = await patch(
      before.updatedAt,
      "Viewer edit attempt",
      "A downgraded author must no longer mutate Session state.",
    );
    expect(denied.status).toBe(404);
    expect(await denied.json()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(prisma.coachingNote.findUnique({
      where: { id: noteId },
      select: { title: true, body: true },
    })).resolves.toEqual({ title: before.title, body: before.body });
    await expect(prisma.coachingNoteRevision.count({ where: { noteId } })).resolves.toBe(revisionCount);
  });
});
