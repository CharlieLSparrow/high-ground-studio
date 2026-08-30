/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { mobileVoiceWritingContentHash } from "@/lib/server/mobile-voice-writing";
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

function storedVoiceDocument(
  projectId = "project-home",
  projectName = "Person Home Nest",
  projectSlug = "person-home",
  isPrivate = true,
) {
  return {
    id: `voice-writing-${draftId}`,
    projectId,
    personalOwnerUserId: "actor-1",
    isPrivate,
    projectionStatus: isPrivate ? "private" : "draft",
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
    const findTranscripts = jest.fn().mockResolvedValue([{
      id: "transcript-job-continued",
      roomId: "continued-room",
      language: "en-US",
      providerRequestId: `apple-speech:${continuationTranscriptId}`,
      completedAt: updatedAt,
      segments: [{
        id: "segment-1",
        startSeconds: 4.2,
        endSeconds: 8.8,
        text: "Provider text.",
        speakerLabel: null,
        corrections: [{
          id: "correction-1",
          correctedText: "Corrected words.",
          correctedSpeakerLabel: "Homer",
        }],
      }],
    }]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany },
      transcriptJob: { findMany: findTranscripts },
    } as never);

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
      transcripts: [{
        transcriptClientRequestId: continuationTranscriptId,
        transcriptJobId: "transcript-job-continued",
        roomId: "continued-room",
        language: "en-US",
        segments: [{
          id: "segment-1",
          startSeconds: 4.2,
          endSeconds: 8.8,
          text: "Corrected words.",
          speakerLabel: "Homer",
          providerText: "Provider text.",
          providerSpeakerLabel: null,
          acceptedCorrectionId: "correction-1",
        }],
      }],
    });
    expect(findTranscripts).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        requestedBy: "actor-1",
        provider: "apple-speech-transcriber-on-device",
        status: "COMPLETED",
        providerRequestId: {
          in: [
            `apple-speech:${transcriptId}`,
            `apple-speech:${continuationTranscriptId}`,
          ],
        },
      },
    }));
  });

  it("drops stale rich-text ranges after a Nest member edits the canonical words", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const document = storedVoiceDocument(
      "project-shared",
      "Dissertation team",
      "dissertation-team",
      false,
    );
    document.blocks[1].body = "Use the revised collaborative opening.";
    document.documentOperations[0].afterJson = {
      serverRevision: 4,
      richText: {
        schema: "quipsly-writing-runs-v1",
        text: "Start with the concrete story.",
        marks: [{ kind: "bold", startUtf16: 0, lengthUtf16: 5 }],
        structures: [],
      },
    } as never;
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany: jest.fn().mockResolvedValue([document]) },
    } as never);

    const response = await GET(new Request("http://localhost/api/mobile/capture/voice-writing", {
      headers: { "x-quipsly-writing-version": "2" },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.drafts[0]).toMatchObject({
      body: "Use the revised collaborative opening.",
      richText: null,
      visibility: "nest",
    });
    expect(payload.drafts[0].contentRevision).toBe(mobileVoiceWritingContentHash({
      title: "Dissertation opening",
      body: "Use the revised collaborative opening.",
      richText: null,
    }));
  });

  it("exposes source-less typed writing only to the versioned writing client", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const typedDocument = {
      ...storedVoiceDocument(),
      title: "Keyboard-first research note",
      blocks: [
        { id: `voice-writing-${draftId}-title`, order: 0, body: "Keyboard-first research note" },
        { id: `voice-writing-${draftId}-body`, order: 1, body: "No recording was invented." },
      ],
      documentOperations: [{
        operationType: "mobile-voice-writing-sync",
        afterJson: { serverRevision: 1 },
        payloadJson: {
          schema: "quipsly-mobile-writing-v2",
          writingOrigin: "typed",
          sources: [],
        },
      }],
    };
    const findMany = jest.fn().mockResolvedValue([typedDocument]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany },
    } as never);

    const legacyResponse = await GET(new Request("http://localhost/api/mobile/capture/voice-writing"));
    expect((await legacyResponse.json()).drafts).toEqual([]);

    const modernResponse = await GET(new Request("http://localhost/api/mobile/capture/voice-writing", {
      headers: { "x-quipsly-writing-version": "2" },
    }));
    expect(await modernResponse.json()).toMatchObject({
      drafts: [{
        draftId,
        writingOrigin: "typed",
        localRecordingId: null,
        transcriptClientRequestId: null,
        sourceSha256: null,
        sources: [],
      }],
    });
  });

  it("requires the source-less writing protocol before accepting a typed draft", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const response = await POST(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        writingOrigin: "typed",
        localRecordingId: null,
        transcriptClientRequestId: null,
        sourceSha256: null,
        callRoomId: null,
        sources: [],
        title: "Research note",
        body: "Start with the concrete story.",
        localRevision: 1,
        expectedServerRevision: 0,
        expectedContentRevision: null,
        richText: null,
      }),
    }));

    expect(response.status).toBe(426);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "VOICE_WRITING_VERSION_REQUIRED",
    });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates source-less typed writing as a private canonical document", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(ensureHomeNestForEmail).mockResolvedValue({
      id: "project-home",
      name: "Person Home Nest",
      slug: "person-home",
    } as never);
    const createdDocument = {
      ...storedVoiceDocument(),
      title: "Keyboard-first research note",
      blocks: [
        { id: `voice-writing-${draftId}-title`, order: 0, body: "Keyboard-first research note" },
        { id: `voice-writing-${draftId}-body`, order: 1, body: "No recording was invented." },
      ],
      documentOperations: [{
        operationType: "mobile-voice-writing-sync",
        afterJson: { serverRevision: 1 },
        payloadJson: {
          schema: "quipsly-mobile-writing-v2",
          writingOrigin: "typed",
          localRecordingId: null,
          transcriptClientRequestId: null,
          sourceSha256: null,
          callRoomId: null,
          sources: [],
        },
      }],
    };
    const create = jest.fn().mockResolvedValue(createdDocument);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quipsly-writing-version": "2",
      },
      body: JSON.stringify({
        draftId,
        writingOrigin: "typed",
        localRecordingId: null,
        transcriptClientRequestId: null,
        sourceSha256: null,
        callRoomId: null,
        sources: [],
        title: "Keyboard-first research note",
        body: "No recording was invented.",
        localRevision: 1,
        expectedServerRevision: 0,
        expectedContentRevision: null,
        richText: null,
      }),
    }));

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: "project-home",
        personalOwnerUserId: "actor-1",
        title: "Keyboard-first research note",
        projectionStatus: "private",
        isPrivate: true,
        documentOperations: { create: expect.objectContaining({
          payloadJson: expect.objectContaining({
            schema: "quipsly-mobile-writing-v2",
            writingOrigin: "typed",
            sources: [],
          }),
        }) },
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      nextAction: "Writing saved to Person Home Nest. Only you can open it.",
      draft: {
        draftId,
        writingOrigin: "typed",
        localRecordingId: null,
        transcriptClientRequestId: null,
        sourceSha256: null,
        sources: [],
      },
      homeProject: { id: "project-home", name: "Person Home Nest", slug: "person-home" },
    });
  });

  it("describes a save into shared writing as shared", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(ensureHomeNestForEmail).mockResolvedValue({
      id: "project-home",
      name: "Person Home Nest",
      slug: "person-home",
    } as never);
    const existing = storedVoiceDocument("project-shared", "Dissertation team", "dissertation-team", false);
    const updated = {
      ...existing,
      title: "Revised dissertation opening",
      blocks: existing.blocks.map((block) => block.id.endsWith("-title")
        ? { ...block, body: "Revised dissertation opening" }
        : { ...block, body: "Start with Homer's concrete story." }),
      documentOperations: [{
        ...existing.documentOperations[0],
        afterJson: { serverRevision: 5 },
      }],
    };
    const update = jest.fn().mockResolvedValue({});
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update,
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      studioDocumentOperation: { findUnique: jest.fn().mockResolvedValue(null) },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await POST(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quipsly-writing-version": "2",
      },
      body: JSON.stringify({
        draftId,
        writingOrigin: "recorded",
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
        title: "Revised dissertation opening",
        body: "Start with Homer's concrete story.",
        localRevision: 5,
        expectedServerRevision: 4,
        expectedContentRevision: mobileVoiceWritingContentHash({
          title: existing.title,
          body: "Start with the concrete story.",
          richText: null,
        }),
        richText: null,
      }),
    }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      nextAction: "Writing saved to Dissertation team and shared with Nest members.",
      draft: { visibility: "nest", projectId: "project-shared" },
    });
  });

  it("moves actor-owned writing to an exact writable Nest and shares it with Nest members", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "EDITOR" } as never);
    const original = storedVoiceDocument();
    const moved = storedVoiceDocument("project-shared", "Research Lab", "research-lab", false);
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
        visibility: "nest",
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
        isPrivate: false,
        projectionStatus: "draft",
        tagRevision: { increment: 1 },
        tagLinks: { deleteMany: {} },
        blocks: { updateMany: expect.objectContaining({
          data: { isPrivate: false, projectionStatus: "draft" },
        }) },
        documentOperations: { create: expect.objectContaining({
          projectId: "project-shared",
          operationType: "mobile-voice-writing-organize",
          payloadJson: expect.objectContaining({ visibility: "nest" }),
          reversible: true,
        }) },
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      visibility: "nest",
      previousProjectId: "project-home",
      draft: {
        projectId: "project-shared",
        projectName: "Research Lab",
        projectSlug: "research-lab",
        visibility: "nest",
      },
    });
  });

  it("changes who can open writing without dropping its Nest tags", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "EDITOR" } as never);
    const original = storedVoiceDocument("project-shared", "Research Lab", "research-lab", true);
    const shared = storedVoiceDocument("project-shared", "Research Lab", "research-lab", false);
    const update = jest.fn().mockResolvedValue({});
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: {
        findFirst: jest.fn().mockResolvedValue(original),
        update,
        findUniqueOrThrow: jest.fn().mockResolvedValue(shared),
      },
      studioDocumentOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      studioProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "project-shared",
          name: "Research Lab",
          slug: "research-lab",
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
        expectedProjectId: "project-shared",
        visibility: "nest",
        clientRequestId: "12121212-1212-4212-8212-121212121212",
      }),
    }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({
        tagRevision: expect.anything(),
        tagLinks: expect.anything(),
      }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      visibility: "nest",
      draft: { visibility: "nest", projectId: "project-shared", tagRevision: 2 },
    });
  });

  it("keeps My Nest private even if a stale client asks to share there", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "OWNER" } as never);
    const update = jest.fn();
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      studioDocument: {
        findFirst: jest.fn().mockResolvedValue(storedVoiceDocument()),
        update,
      },
      studioDocumentOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      studioProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "project-home",
          name: "Person Home Nest",
          slug: "person-home",
          sourceLabel: "nest-kind:home",
        }),
      },
    }));
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: transaction } as never);

    const response = await PATCH(new Request("http://localhost/api/mobile/capture/voice-writing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftId,
        destinationProjectId: "project-home",
        expectedProjectId: "project-home",
        visibility: "nest",
        clientRequestId: "13131313-1313-4313-8313-131313131313",
      }),
    }));

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: "VOICE_WRITING_HOME_PRIVATE",
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
