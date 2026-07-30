/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/transcript-corrections", () => {
  class MockTranscriptCorrectionError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return { readTranscriptCorrectionDesk: jest.fn(), TranscriptCorrectionError: MockTranscriptCorrectionError };
});

const desk = {
  ok: true,
  roomId: "room-1",
  projectId: "project-1",
  transcriptJobId: "job-1",
  gate: { allowed: true },
  playback: { sourceId: "source-1", recordingAssetId: "asset-1" },
  segments: [{ id: "segment-1", startSeconds: 14.76, endSeconds: 16.2, providerText: "Why are you excited?", providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", text: "Why are you excited?", speakerLabel: "Charlie", acceptedCorrection: null }],
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/capture/transcripts/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "request-1", expectedProviderTextSha256: "a".repeat(64), title: "Episode opening", openingNote: "Answer this honestly.", ...overrides }),
  });
}

describe("source-linked transcript writing draft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates one private draft with exact immutable transcript provenance", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com", isStaff: false } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const document = { id: "document-1", projectId: "project-1", title: "Episode opening", sourcePath: "/sessions/room-1#transcript-segment-segment-1", blocks: [{ id: "source-block", order: 0 }, { id: "draft-block", order: 1 }] };
    const tx = {
      studioProject: { findUnique: jest.fn().mockResolvedValue({ slug: "high-ground" }) },
      studioDocument: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(document) },
      studioDocumentOperation: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: "operation-1" }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, idempotentReplay: false, document: { id: "document-1", href: expect.stringContaining("block=draft-block") }, boundaries: { sourceAnchorPreserved: true, taskCreated: false, goalCreated: false, calendarMutated: false, externalDelivery: false, publication: false } });
    expect(tx.studioDocument.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1", personalOwnerUserId: "user-1", projectionStatus: "draft", isPrivate: true, blocks: { create: expect.arrayContaining([expect.objectContaining({ externalId: "transcript:job-1:segment-1", body: expect.stringContaining("> Why are you excited?") }), expect.objectContaining({ externalId: "transcript-draft:job-1:segment-1", body: "Answer this honestly." })]) } }) }));
    expect(tx.studioDocumentOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operationType: "create-draft-from-transcript-segment", reversible: true, payloadJson: expect.objectContaining({ surface: "quipsly-transcript-review", segmentId: "segment-1", providerTextSha256: "a".repeat(64), recordingAssetId: "asset-1", sourceMutated: false, externalSideEffects: false, boundaries: expect.objectContaining({ providerTranscriptMutated: false, publication: false }) }) }) }));
  });

  it("fails stale provider evidence without creating a draft", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const tx = { studioProject: { findUnique: jest.fn().mockResolvedValue({ slug: "high-ground" }) }, studioDocument: { findUnique: jest.fn(), create: jest.fn() }, studioDocumentOperation: { findFirst: jest.fn(), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request({ expectedProviderTextSha256: "b".repeat(64) }));
    expect(response.status).toBe(409);
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
  });

  it("replays the same actor request without duplicating the document", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const document = { id: "document-1", projectId: "project-1", personalOwnerUserId: "user-1", title: "Episode opening", sourcePath: "/sessions/room-1#transcript-segment-segment-1", blocks: [{ id: "source-block", order: 0 }, { id: "draft-block", order: 1 }] };
    const tx = {
      studioProject: { findUnique: jest.fn().mockResolvedValue({ slug: "high-ground" }) },
      studioDocument: { findUnique: jest.fn().mockResolvedValue(document), create: jest.fn() },
      studioDocumentOperation: { findFirst: jest.fn().mockResolvedValue({ payloadJson: { clientRequestId: "request-1", createdByUserId: "user-1", roomId: "room-1", segmentId: "segment-1" } }), create: jest.fn() },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, document: { id: "document-1" } });
    expect(tx.studioDocument.create).not.toHaveBeenCalled();
  });
});
