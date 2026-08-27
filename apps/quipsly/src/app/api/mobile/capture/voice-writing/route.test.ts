/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ ensureHomeNestForEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const draftId = "11111111-1111-4111-8111-111111111111";
const recordingId = "22222222-2222-4222-8222-222222222222";
const transcriptId = "33333333-3333-4333-8333-333333333333";
const updatedAt = new Date("2026-08-27T20:00:00.000Z");

describe("mobile voice-writing continuation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        tagRevision: 2,
        tags: [{ id: "tag-phd", slug: "phd", label: "PhD", isActive: true }],
      }],
      homeProject: { id: "project-home", name: "Person Home Nest", slug: "person-home" },
      availableTags: [{ id: "tag-phd", slug: "phd", label: "PhD", isActive: true }],
    });
  });
});
