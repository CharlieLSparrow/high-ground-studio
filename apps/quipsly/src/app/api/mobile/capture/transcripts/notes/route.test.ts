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

const session = { user: { id: "user-1", primaryEmail: "person@example.com", isStaff: false } };
const desk = {
  ok: true,
  roomId: "room-1",
  projectId: "project-1",
  transcriptJobId: "job-1",
  gate: { allowed: true },
  playback: { sourceId: "source-1", recordingAssetId: "asset-1" },
  segments: [{
    id: "segment-1",
    startSeconds: 3.66,
    endSeconds: 4.84,
    providerText: "Welcome, everybody.",
    providerTextSha256: "a".repeat(64),
    providerSpeakerLabel: "Speaker",
    text: "Welcome, everybody.",
    speakerLabel: "Charlie",
    acceptedCorrection: { id: "correction-1" },
  }],
};

const requestBody = {
  roomId: "room-1",
  segmentId: "segment-1",
  clientRequestId: "transcript-note-request-1",
  expectedProviderTextSha256: "a".repeat(64),
  title: "Opening observation",
  body: "This is the note we want to carry into follow-through.",
  kind: "SESSION_NOTE",
  visibility: "CLIENT_SAFE",
  surface: "ios-capture-transcript-review",
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/capture/transcripts/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...requestBody, ...overrides }),
  });
}

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: "transcript-note-1",
    roomId: "room-1",
    authorUserId: "user-1",
    title: "Opening observation",
    body: "This is the note we want to carry into follow-through.",
    kind: "SESSION_NOTE",
    visibility: "CLIENT_SAFE",
    createdAt: new Date("2026-08-02T02:00:00.000Z"),
    updatedAt: new Date("2026-08-02T02:00:00.000Z"),
    authorUser: { name: "Charlie", primaryEmail: "person@example.com" },
    tagLinks: [],
    _count: { revisions: 1 },
    ...overrides,
  };
}

function transaction(room: any, existing: any = null, created: any = null) {
  const tx = {
    callRoom: { findFirst: jest.fn().mockResolvedValue(room) },
    coachingNote: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async (args: any) => created || note({ sourceJson: args.data.sourceJson })),
    },
  };
  jest.mocked(getPrismaClient).mockReturnValue({
    $transaction: jest.fn((callback: any) => callback(tx)),
    coachingNote: { findUnique: jest.fn() },
  } as any);
  return tx;
}

describe("explicit transcript-derived Session note", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(session as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
  });

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates one revisioned client-safe note with exact playback provenance and no external effects", async () => {
    const tx = transaction({ id: "room-1", bookingId: "booking-1", project: { accessGrants: [] } });
    const response = await POST(request());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      idempotentReplay: false,
      note: {
        title: "Opening observation",
        visibility: "CLIENT_SAFE",
        revisionCount: 1,
        originLabel: "Transcript review",
        sourceAnchor: { roomId: "room-1", segmentId: "segment-1", startSeconds: 3.66, recordingAssetId: "asset-1" },
      },
      boundaries: { noteCreated: true, sourceAnchorPreserved: true, taskCreated: false, goalCreated: false, messageSent: false, externalDelivery: false, publication: false },
    });
    expect(tx.callRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "room-1" }) }));
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledWith(expect.objectContaining({ prisma: tx, roomId: "room-1" }));
    expect(tx.coachingNote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingId: "booking-1",
        authorUserId: "user-1",
        visibility: "CLIENT_SAFE",
        sourceJson: expect.objectContaining({
          schema: "quipsly-transcript-derived-note-v1",
          providerTextSha256: "a".repeat(64),
          acceptedCorrectionId: "correction-1",
          recordingAssetId: "asset-1",
          initialVisibility: "CLIENT_SAFE",
        }),
        revisions: { create: expect.objectContaining({ revision: 1, operation: "created-from-transcript" }) },
      }),
    }));
  });

  it("fails closed when Session mutation access disappears", async () => {
    const tx = transaction(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "SESSION_MUTATION_ACCESS_REQUIRED" });
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("requires owner, editor, or staff authority for production-team notes", async () => {
    const tx = transaction({ id: "room-1", bookingId: null, project: { accessGrants: [{ role: "VIEWER" }] } });
    const response = await POST(request({ kind: "PRODUCTION", visibility: "PROJECT_TEAM" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PROJECT_ROLE_REQUIRED" });
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("rejects stale provider evidence without creating a note", async () => {
    const tx = transaction({ id: "room-1", bookingId: null, project: { accessGrants: [] } });
    const response = await POST(request({ expectedProviderTextSha256: "b".repeat(64) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "STALE_PROVIDER_EVIDENCE" });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });

  it("replays the same initial request without duplicating the canonical note", async () => {
    const sourceJson = {
      schema: "quipsly-transcript-derived-note-v1",
      createdByUserId: "user-1",
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "transcript-note-request-1",
      providerTextSha256: "a".repeat(64),
      initialTitle: requestBody.title,
      initialBody: requestBody.body,
      initialKind: "SESSION_NOTE",
      initialVisibility: "CLIENT_SAFE",
      transcriptJobId: "job-1",
      startSeconds: 3.66,
      endSeconds: 4.84,
      effectiveTextSnapshot: "Welcome, everybody.",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    };
    const tx = transaction(
      { id: "room-1", bookingId: null, project: { accessGrants: [] } },
      note({ sourceJson, title: "Later edited title", _count: { revisions: 2 } }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, note: { title: "Later edited title", revisionCount: 2 }, boundaries: { noteCreated: false } });
    expect(tx.coachingNote.create).not.toHaveBeenCalled();
  });
});
