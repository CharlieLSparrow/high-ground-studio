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
  roomId: "room-1", projectId: "project-1", transcriptJobId: "job-1", gate: { allowed: true }, playback: { sourceId: "source-1", recordingAssetId: "asset-1" },
  segments: [{ id: "segment-1", startSeconds: 10, endSeconds: 14, providerText: "My goal is to publish the pilot.", providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", text: "My goal is to publish the pilot.", speakerLabel: "Charlie", acceptedCorrection: null }],
};

function request(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/mobile/capture/transcripts/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

describe("explicit transcript-derived goal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("creates one actor-owned active goal with exact source evidence and no implied work", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const targetAt = "2026-09-01T18:00:00.000Z";
    const created = { id: "goal-created", ownerUserId: "user-1", roomId: "room-1", title: "Publish the pilot", description: "A clear first episode.", status: "ACTIVE", targetAt: new Date(targetAt), createdAt: new Date("2026-07-18T22:00:00Z") };
    const tx = {
      goal: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      studioTag: { findMany: jest.fn().mockResolvedValue([{ id: "tag-episode", label: "Episode", slug: "episode" }]) },
      goalTagLink: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "goal-request-1", expectedProviderTextSha256: "a".repeat(64), title: "Publish the pilot", description: "A clear first episode.", targetAt, tagIds: ["tag-episode"], surface: "ios-capture" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, goal: { ownerUserId: "user-1", status: "ACTIVE", targetAt, tags: [{ id: "tag-episode" }] }, boundaries: { taskCreated: false, targetDateCreated: true, projectTagsApplied: true, calendarMutated: false, externalDelivery: false, publication: false } });
    expect(tx.goal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerUserId: "user-1", roomId: "room-1", projectId: "project-1", targetAt: new Date(targetAt), sourceJson: expect.objectContaining({ schema: "quipsly-transcript-derived-goal-v1", segmentId: "segment-1", providerTextSha256: "a".repeat(64), recordingAssetId: "asset-1", explicitHumanAction: true, materializationIntent: { title: "Publish the pilot", description: "A clear first episode.", targetAt, tagIds: ["tag-episode"] } }) }) });
    expect(tx.goalTagLink.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ goalId: "goal-created", tagId: "tag-episode", createdByUserId: "user-1" })] });
  });

  it("fails stale provider evidence without creating a goal", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const tx = { goal: { findUnique: jest.fn(), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "goal-request-2", expectedProviderTextSha256: "b".repeat(64), title: "Stale goal" }));
    expect(response.status).toBe(409);
    expect(tx.goal.create).not.toHaveBeenCalled();
  });

  it("replays the same actor request without creating a duplicate goal", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const replay = { id: "goal-replay", ownerUserId: "user-1", roomId: "room-1", title: "Publish the pilot", description: null, status: "ACTIVE", createdAt: new Date(), sourceJson: { schema: "quipsly-transcript-derived-goal-v1", clientRequestId: "goal-replay", createdByUserId: "user-1" } };
    const tx = { goal: { findUnique: jest.fn().mockResolvedValue(replay), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "goal-replay", expectedProviderTextSha256: "a".repeat(64), title: "Publish the pilot" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, idempotentReplay: true, goal: { title: "Publish the pilot" } });
    expect(tx.goal.create).not.toHaveBeenCalled();
  });

  it("rejects a reused request identity with changed materialization intent", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1" } } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue(desk as any);
    const replay = {
      id: "goal-replay",
      ownerUserId: "user-1",
      roomId: "room-1",
      title: "Publish the pilot",
      description: null,
      targetAt: null,
      tagLinks: [],
      sourceJson: {
        schema: "quipsly-transcript-derived-goal-v1",
        clientRequestId: "goal-replay",
        createdByUserId: "user-1",
        materializationIntent: { title: "Publish the pilot", description: null, targetAt: null, tagIds: [] },
      },
    };
    const tx = { goal: { findUnique: jest.fn().mockResolvedValue(replay), create: jest.fn() } };
    jest.mocked(getPrismaClient).mockReturnValue({ $transaction: jest.fn((callback: any) => callback(tx)) } as any);
    const response = await POST(request({ roomId: "room-1", segmentId: "segment-1", clientRequestId: "goal-replay", expectedProviderTextSha256: "a".repeat(64), title: "Publish a different pilot" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    expect(tx.goal.create).not.toHaveBeenCalled();
  });
});
