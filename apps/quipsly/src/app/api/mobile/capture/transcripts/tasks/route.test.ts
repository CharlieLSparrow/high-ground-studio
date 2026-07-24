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
  segments: [{ id: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerText: "Welcome, everybody.", providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", text: "Welcome, everybody.", speakerLabel: "Charlie", acceptedCorrection: { id: "correction-1" } }],
};

describe("explicit transcript-derived task", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/tasks", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates one self-owned task with exact source evidence and no external effects", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com", isStaff: false } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const created = { id: "created-task", title: "Prepare the opening", detail: null, status: "OPEN", roomId: "room-1", assignedUserId: "user-1", createdAt: new Date("2026-07-18T22:00:00Z") };
    const tx = { actionItem: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "request-1", expectedProviderTextSha256: "a".repeat(64), title: "Prepare the opening", surface: "ios-capture" }),
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, idempotentReplay: false, task: { assignedUserId: "user-1", status: "OPEN" }, boundaries: { deadlineCreated: false, calendarMutated: false, externalDelivery: false, publication: false } });
    expect(tx.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ assignedUserId: "user-1", roomId: "room-1", projectId: "project-1", sourceJson: expect.objectContaining({ segmentId: "segment-1", providerTextSha256: "a".repeat(64), acceptedCorrectionId: "correction-1", recordingAssetId: "asset-1", explicitHumanAction: true }) }) });
  });

  it("fails stale provider evidence without creating work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const tx = { actionItem: { findUnique: jest.fn(), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "request-2", expectedProviderTextSha256: "b".repeat(64), title: "Stale task" }),
    }));
    expect(response.status).toBe(409);
    expect(tx.actionItem.create).not.toHaveBeenCalled();
  });

  it("replays the same actor request without creating a duplicate task", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const replay = { id: "replayed-task", title: "Prepare the opening", detail: null, status: "OPEN", roomId: "room-1", assignedUserId: "user-1", createdAt: new Date(), sourceJson: { schema: "quipsly-transcript-derived-task-v1", clientRequestId: "request-replay", createdByUserId: "user-1" } };
    const tx = { actionItem: { findUnique: jest.fn().mockResolvedValue(replay), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "request-replay", expectedProviderTextSha256: "a".repeat(64), title: "Prepare the opening" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, task: { title: "Prepare the opening" } });
    expect(tx.actionItem.create).not.toHaveBeenCalled();
  });
});
