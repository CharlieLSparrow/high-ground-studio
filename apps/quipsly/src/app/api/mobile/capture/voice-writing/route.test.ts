/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { DELETE, GET, PATCH, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({
  ensureHomeNestForEmail: jest.fn(),
  listProjectsVisibleToEmail: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));

const draftId = "11111111-1111-4111-8111-111111111111";
const recordingId = "22222222-2222-4222-8222-222222222222";
const transcriptId = "33333333-3333-4333-8333-333333333333";
const continuationRecordingId = "44444444-4444-4444-8444-444444444444";
const continuationTranscriptId = "55555555-5555-4555-8555-555555555555";
const updatedAt = new Date("2026-08-27T20:00:00.000Z");

function storedVoiceDocument(projectId = "project-home", projectName = "Person Home Nest", projectSlug = "person-home") {
  return {
    id: `voice-writing-${draftId}`,
    projectId,
    personalOwnerUserId: "actor-1",
    title: "Dissertation opening",
    sourceLabel: "document-kind:note;origin:ios-voice-writing",
    tagRevision: 2,
    createdAt: updatedAt,
    updatedAt,
    project: { name: projectName, slug: projectSlug, tags: [] },
    blocks: [
      { id: `voice-writing-${draftId}-title`, order: 0, body: "Dissertation opening" },
      { id: `voice-writing-${draftId}-body`, order: 1, body: "Start with the concrete story." },
    ],
    tagLinks: [],
    documentOperations: [{
      operationType: "mobile-voice-writing-sync",
      afterJson: { serverRevision: 4 },
      payloadJson: {
        localRecordingId: recordingId,
        transcriptClientRequestId: transcriptId,
        sourceSha256: "a".repeat(64),
        callRoomId: "voice-room-1",
        sources: [{
          localRecordingId: recordingId,
          transcriptClientRequestId: transcriptId,
          sourceSha256: "a".repeat(64),
          callRoomId: "voice-room-1",
        }],
      },
    }],
  };
}

describe("mobile voice-writing continuation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{
      id: "project-home",
      name: "Person Home Nest",
      slug: "person-home",
      sourceLabel: "nest-kind:home",
      role: "OWNER",
    }] as never);
  });

  it("authenticates before reading private writing", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await GET(new Request("http://localhost/api/mobile/capture/voice-writing"));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns only actor-owned iPhone writing with a content revision for cross-device continuation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const findMany = jest.fn().mockResolvedValue([{
      id: `voice-writing-${draftId}`,
      projectId: "project-home",
      title: "Dissertation opening",
      tagRevision: 2,
      createdAt: updatedAt,
      updatedAt,
      project: {
        name: "Person Home Nest",
        slug: "person-home",
        tags: [{
          id: "tag-phd",
          projectId: "project-home",
          slug: "phd",
          label: "PhD",
          isActive: true,
        }],
      },
      tagLinks: [{
        tag: {
          id: "tag-phd",
          projectId: "project-home",
          slug: "phd",
          label: "PhD",
          isActive: true,
        },
      }],
      blocks: [
        { id: `voice-writing-${draftId}-title`, order: 0, body: "Dissertation opening" },
        { id: `voice-writing-${draftId}-body`, order: 1, body: "Start with the concrete story." },
      ],
      documentOperations: [{
        operationType: "mobile-voice-writing-sync",
        afterJson: { serverRevision: 4 },
        payloadJson: {
          localRecordingId: recordingId,
          transcriptClientRequestId: transcriptId,
          sourceSha256: "a".repeat(64),
          callRoomId: null,
          sources: [
            {
              localRecordingId: recordingId,
              transcriptClientRequestId: transcriptId,
              sourceSha256: "a".repeat(64),
              callRoomId: null,
            },
            {
              localRecordingId: continuationRecordingId,
              transcriptClientRequestId: continuationTranscriptId,
              sourceSha256: "b".repeat(64),
              callRoomId: "continued-room",
            },
          ],
        },
      }],
    }]);
    jest.mocked(getPrismaClient).mockReturnValue({ studioDocument: { findMany } } as never);

    const response = await GET(new Request(`http://localhost/api/mobile/capture/voice-writing?draftId=${draftId}`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: `voice-writing-${draftId}`,
        personalOwnerUserId: "actor-1",
        AND: expect.arrayContaining([
          { NOT: { sourceLabel: { contains: "state:deleted", mode: "insensitive" } } },
        ]),
      }),
      take: 1,
    }));
    expect(payload).toMatchObject({
      ok: true,
      schema: "quipsly-mobile-voice-writing-list-v1",
      drafts: [{
        draftId,
        documentId: `voice-writing-${draftId}`,
        projectId: "project-home",
        projectName: "Person Home Nest",
        projectSlug: "person-home",
        title: "Dissertation opening",
        body: "Start with the concrete story.",
        localRevision: 4,
        serverRevision: 4,
        contentRevision: expect.stringMatching(/^[0-9a-f]{64}$/),
        localRecordingId: recordingId,
        transcriptClientRequestId: transcriptId,
        sourceSha256: "a".repeat(64),
        sources: [
          {
            localRecordingId: recordingId,
            transcriptClientRequestId: transcriptId,
            sourceSha256: "a".repeat(64),
            callRoomId: null,
          },
          {
            localRecordingId: continuationRecordingId,
            transcriptClientRequestId: continuationTranscriptId,
            sourceSha256: "b".repeat(64),
            callRoomId: "continued-room",
          },
        ],
        tagRevision: 2,
        tags: [{ id: "tag-phd", slug: "phd", label: "PhD", isActive: true }],
      }],
      homeProject: { id: "project-home", name: "Person Home Nest", slug: "person-home" },
      availableTags: [{ id: "tag-phd", slug: "phd", label: "PhD", isActive: true }],
      destinations: [{
        id: "project-home",
        name: "Person Home Nest",
        slug: "person-home",
        role: "OWNER",
        isHome: true,
      }],
    });
  });

  it("moves actor-owned writing to an exact writable Nest without sharing it", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "EDITOR" } as never);
    const original = storedVoiceDocument();
    const moved = storedVoiceDocument("project-shared", "Research Lab", "research-lab");
    const findFirst = jest.fn().mockResolvedValue(original);
    const findOperation = jest.fn().mockResolvedValue(null);
    const findProject = jest.fn().mockResolvedValue({ id: "project-shared", name: "Research Lab", slug: "research-lab" });
    const update = jest.fn().mockResolvedValue({});
    const findUniqueOrThrow = jest.fn().mockResolvedValue(moved);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findFirst, update, findUniqueOrThrow },
      studioDocumentOperation: { findUnique: findOperation },
      studioProject: { findUnique: findProject },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await PATCH(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        destinationProjectId: "project-shared",
        expectedProjectId: "project-home",
        clientRequestId: "88888888-8888-4888-8888-888888888888",
      }),
    }));

    expect(response.status).toBe(200);
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-shared",
      projectSlug: "research-lab",
      email: "person@example.com",
      action: "write",
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: `voice-writing-${draftId}` },
      data: expect.objectContaining({
        projectId: "project-shared",
        tagRevision: { increment: 1 },
        tagLinks: { deleteMany: {} },
        documentOperations: { create: expect.objectContaining({
          projectId: "project-shared",
          operationType: "mobile-voice-writing-move",
          reversible: true,
        }) },
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      privacy: "personal",
      previousProjectId: "project-home",
      draft: {
        projectId: "project-shared",
        projectName: "Research Lab",
        projectSlug: "research-lab",
      },
    });
  });

  it("rejects a viewer destination and leaves the private writing untouched", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: false, role: "VIEWER" } as never);
    const update = jest.fn();
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findFirst: jest.fn().mockResolvedValue(storedVoiceDocument()), update },
      studioDocumentOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      studioProject: { findUnique: jest.fn().mockResolvedValue({ id: "project-view", name: "View only", slug: "view-only" }) },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await PATCH(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        destinationProjectId: "project-view",
        expectedProjectId: "project-home",
        clientRequestId: "99999999-9999-4999-8999-999999999999",
      }),
    }));

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("replays the same completed move without another mutation", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const update = jest.fn();
    const clientRequestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const moved = storedVoiceDocument("project-shared", "Research Lab", "research-lab");
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findFirst: jest.fn().mockResolvedValue(moved), update },
      studioDocumentOperation: {
        findUnique: jest.fn().mockResolvedValue({
          payloadJson: {
            documentId: `voice-writing-${draftId}`,
            destinationProjectId: "project-shared",
            clientRequestId,
          },
        }),
      },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await PATCH(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        destinationProjectId: "project-shared",
        expectedProjectId: "project-home",
        clientRequestId,
      }),
    }));

    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotentReplay: true,
      draft: { projectId: "project-shared" },
    });
  });

  it("returns the current private location instead of guessing after a stale move", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const update = jest.fn();
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: {
        findFirst: jest.fn().mockResolvedValue(storedVoiceDocument("project-current", "Current Nest", "current-nest")),
        update,
      },
      studioDocumentOperation: { findUnique: jest.fn().mockResolvedValue(null) },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await PATCH(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        destinationProjectId: "project-next",
        expectedProjectId: "project-home",
        clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    }));

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "VOICE_WRITING_MOVE_CONFLICT",
      current: { projectId: "project-current", projectName: "Current Nest" },
    });
  });

  it("soft-deletes only actor-owned writing while preserving source audio", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const findFirst = jest.fn().mockResolvedValue({
      id: `voice-writing-${draftId}`,
      projectId: "project-home",
      title: "Dissertation opening",
      sourceLabel: "document-kind:note;origin:ios-voice-writing",
    });
    const update = jest.fn().mockResolvedValue({});
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findFirst, update },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const clientRequestId = "66666666-6666-4666-8666-666666666666";
    const response = await DELETE(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, clientRequestId }),
    }));

    expect(response.status).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: `voice-writing-${draftId}`,
        personalOwnerUserId: "actor-1",
      }),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: `voice-writing-${draftId}` },
      data: expect.objectContaining({
        sourceLabel: expect.stringContaining("state:deleted"),
        documentOperations: { create: expect.objectContaining({
          operationType: "mobile-voice-writing-delete",
          reversible: true,
        }) },
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sourceAudioDeleted: false,
      idempotentReplay: false,
    });
  });

  it("does not reveal another account's writing while deleting", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const findFirst = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findFirst, update },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await DELETE(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        clientRequestId: "77777777-7777-4777-8777-777777777777",
      }),
    }));

    expect(response.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not let a delayed save revive deleted writing", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(ensureHomeNestForEmail).mockResolvedValue({ id: "project-home" } as never);
    const findUnique = jest.fn().mockResolvedValue({
      id: `voice-writing-${draftId}`,
      projectId: "project-home",
      personalOwnerUserId: "actor-1",
      sourceLabel: "document-kind:note;origin:ios-voice-writing;state:deleted",
    });
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: { findUnique },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        localRecordingId: recordingId,
        transcriptClientRequestId: transcriptId,
        sourceSha256: "a".repeat(64),
        callRoomId: null,
        title: "Delayed title",
        body: "This save arrived after Delete.",
        richText: null,
        localRevision: 5,
        expectedServerRevision: 4,
        expectedContentRevision: "b".repeat(64),
        sources: [{
          localRecordingId: recordingId,
          transcriptClientRequestId: transcriptId,
          sourceSha256: "a".repeat(64),
          callRoomId: null,
        }],
      }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "VOICE_WRITING_NOT_FOUND",
    });
  });
});
