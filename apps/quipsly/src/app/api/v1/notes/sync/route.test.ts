/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock("@/lib/server/bi-directional-sync", () => ({
  parseQuipslyNoteToBlocks: jest.fn(),
  QUIPSLY_NATIVE_NOTE_SOURCE_LABEL: "quipsly-native-note",
}));

jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { parseQuipslyNoteToBlocks } from "@/lib/server/bi-directional-sync";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-owner";

const session = {
  user: {
    id: USER_ID,
    email: "owner@example.com",
    primaryEmail: "owner@example.com",
  },
};

const validNote = {
  id: NOTE_ID,
  title: "Session notes",
  content: "A durable note",
  createdAt: "2026-07-17T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

function request(
  payload: unknown,
  authorization = "Bearer verified-firebase-id-token",
) {
  return new Request("http://localhost/api/v1/notes/sync", {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function prismaMocks() {
  return {
    quipslyNote: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    studioDocument: {
      findMany: jest.fn(),
    },
  };
}

describe("POST /api/v1/notes/sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not treat the former permanent dev token as authentication", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await POST(
      request({ lastSyncAt: null, clientNotes: [] }, "Bearer dev-token"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads as client errors before opening the database", async () => {
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ lastSyncAt: "not-a-time", clientNotes: [] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SYNC_PAYLOAD",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("rejects a cross-owner UUID before any note or projection mutation", async () => {
    const prisma = prismaMocks();
    prisma.quipslyNote.findMany.mockResolvedValue([
      {
        id: NOTE_ID,
        userId: "another-user",
        content: "Private note owned elsewhere",
        updatedAt: new Date("2026-07-18T10:00:00.000Z"),
      },
    ]);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ lastSyncAt: null, clientNotes: [validNote] }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOTE_NOT_FOUND",
    });
    expect(prisma.quipslyNote.updateMany).not.toHaveBeenCalled();
    expect(prisma.quipslyNote.create).not.toHaveBeenCalled();
    expect(prisma.studioDocument.findMany).not.toHaveBeenCalled();
    expect(parseQuipslyNoteToBlocks).not.toHaveBeenCalled();
  });

  it("updates an owned note with userId in the mutation predicate", async () => {
    const prisma = prismaMocks();
    const existing = {
      id: NOTE_ID,
      userId: USER_ID,
      content: "Earlier content",
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
    };
    const serverNote = { ...existing, ...validNote };
    prisma.quipslyNote.findMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([serverNote]);
    prisma.studioDocument.findMany.mockResolvedValue([
      {
        stableId: NOTE_ID,
        sourceLabel: "quipsly-native-note",
        project: { accessGrants: [{ id: "owner-grant" }] },
      },
    ]);
    prisma.quipslyNote.updateMany.mockResolvedValue({ count: 1 });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);
    jest.mocked(parseQuipslyNoteToBlocks).mockResolvedValue("document-id");

    const response = await POST(
      request({
        lastSyncAt: "2026-07-18T11:00:00.000Z",
        clientNotes: [validNote],
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.quipslyNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTE_ID, userId: USER_ID },
      }),
    );
    expect(prisma.quipslyNote.create).not.toHaveBeenCalled();
    expect(parseQuipslyNoteToBlocks).toHaveBeenCalledWith(NOTE_ID, USER_ID);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      serverNotes: [serverNote],
    });
  });

  it("rejects a projected document without the actor's active owner grant", async () => {
    const prisma = prismaMocks();
    const existing = {
      id: NOTE_ID,
      userId: USER_ID,
      content: "Earlier content",
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
    };
    prisma.quipslyNote.findMany.mockResolvedValue([existing]);
    prisma.studioDocument.findMany.mockResolvedValue([
      {
        stableId: NOTE_ID,
        sourceLabel: "quipsly-native-note",
        project: { accessGrants: [] },
      },
    ]);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ lastSyncAt: null, clientNotes: [validNote] }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOTE_ID_UNAVAILABLE",
    });
    expect(prisma.quipslyNote.updateMany).not.toHaveBeenCalled();
    expect(parseQuipslyNoteToBlocks).not.toHaveBeenCalled();
  });

  it("reports a concurrent UUID collision without attempting projection", async () => {
    const prisma = prismaMocks();
    prisma.quipslyNote.findMany.mockResolvedValue([]);
    prisma.studioDocument.findMany.mockResolvedValue([]);
    prisma.quipslyNote.create.mockRejectedValue({ code: "P2002" });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({ lastSyncAt: null, clientNotes: [validNote] }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "NOTE_ID_UNAVAILABLE",
      retryable: false,
    });
    expect(parseQuipslyNoteToBlocks).not.toHaveBeenCalled();
  });

  it("stops the whole batch for review instead of overwriting a newer server edit", async () => {
    const prisma = prismaMocks();
    const serverVersion = {
      id: NOTE_ID,
      userId: USER_ID,
      title: "Server session notes",
      content: "A newer edit made in Nest",
      tags: ["coaching"],
      folderName: "Sessions",
      createdAt: new Date("2026-07-17T09:00:00.000Z"),
      updatedAt: new Date("2026-07-18T11:30:00.000Z"),
    };
    prisma.quipslyNote.findMany.mockResolvedValue([serverVersion]);
    prisma.studioDocument.findMany.mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);

    const response = await POST(
      request({
        lastSyncAt: "2026-07-18T11:00:00.000Z",
        clientNotes: [
          {
            ...validNote,
            title: "Offline session notes",
            content: "A different offline edit",
          },
        ],
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "SYNC_CONFLICT_REVIEW_REQUIRED",
      notesSaved: false,
      retryable: false,
      conflicts: [
        {
          noteId: NOTE_ID,
          serverUpdatedAt: "2026-07-18T11:30:00.000Z",
          clientUpdatedAt: validNote.updatedAt,
          serverNote: {
            id: NOTE_ID,
            title: "Server session notes",
            content: "A newer edit made in Nest",
          },
        },
      ],
    });
    expect(prisma.quipslyNote.updateMany).not.toHaveBeenCalled();
    expect(prisma.quipslyNote.create).not.toHaveBeenCalled();
    expect(parseQuipslyNoteToBlocks).not.toHaveBeenCalled();
  });

  it("truthfully reports when the note saved but its Nest projection failed", async () => {
    const prisma = prismaMocks();
    const existing = {
      id: NOTE_ID,
      userId: USER_ID,
      content: "Earlier content",
      updatedAt: new Date("2026-07-17T10:00:00.000Z"),
    };
    prisma.quipslyNote.findMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([existing]);
    prisma.studioDocument.findMany.mockResolvedValue([]);
    prisma.quipslyNote.updateMany.mockResolvedValue({ count: 1 });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest
      .mocked(getQuipslySessionFromRequest)
      .mockResolvedValue(session as never);
    jest
      .mocked(parseQuipslyNoteToBlocks)
      .mockRejectedValue(new Error("projection offline"));

    const response = await POST(
      request({
        lastSyncAt: "2026-07-18T11:00:00.000Z",
        clientNotes: [validNote],
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "NEST_PROJECTION_FAILED",
      notesSaved: true,
      retryable: true,
      failedProjectionNoteIds: [NOTE_ID],
    });
  });
});
