/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { loadLibrary } from "@/app/(app)/library/library-page";

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
  let actorUserId = "";
  let otherUserId = "";
  let workspaceId = "";
  let projectId = "";
  let roomId = "";
  let noteId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: actorEmail, name: "Note author" } }),
      prisma.user.create({ data: { primaryEmail: otherEmail, name: "Other actor" } }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `note-edit-${nonce}`, name: "Note edit smoke" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `note-edit-${nonce}`, name: "High Ground Odyssey" } });
    projectId = project.id;
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
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (projectId) await prisma.studioProject.deleteMany({ where: { id: projectId } });
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId || otherUserId) await prisma.user.deleteMany({ where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } } });
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
  } = {}) {
    return PATCH(new Request(`http://localhost/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, expectedUpdatedAt: expectedUpdatedAt.toISOString(), ...options }),
    }), { params: Promise.resolve({ noteId }) });
  }

  it("updates the exact actor-owned note through its Nest editor grant with a retained previous-value receipt", async () => {
    signedInAs(actorUserId, actorEmail);
    const before = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    const response = await patch(before.updatedAt, "Opening rhythm", "Pause, then let the first question breathe.");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      note: { id: noteId, title: "Opening rhythm", body: "Pause, then let the first question breathe." },
      boundaries: {
        actorOwned: true,
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
          kind: "quipsly-session-note-edit-v1",
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

  it("rejects a stale revision and another account without changing saved text", async () => {
    const current = await prisma.coachingNote.findUniqueOrThrow({ where: { id: noteId } });
    signedInAs(actorUserId, actorEmail);
    const stale = await patch(new Date(0), "Stale title", "Stale body");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ ok: false, code: "CONFLICT", current: { updatedAt: current.updatedAt.toISOString() } });

    signedInAs(otherUserId, otherEmail);
    const denied = await patch(current.updatedAt, "Other title", "Other body");
    expect(denied.status).toBe(404);
    await expect(prisma.coachingNote.findUnique({ where: { id: noteId }, select: { title: true, body: true } })).resolves.toEqual({
      title: "Opening decision",
      body: "Pause, then lead with the listener question.",
    });
  });
});
