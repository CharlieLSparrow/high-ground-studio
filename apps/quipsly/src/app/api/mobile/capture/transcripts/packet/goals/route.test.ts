/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/transcript-corrections", () => {
  class MockTranscriptCorrectionError extends Error {
    constructor(message: string, public status: number, public code: string) { super(message); }
  }
  return { readTranscriptCorrectionDesk: jest.fn(), TranscriptCorrectionError: MockTranscriptCorrectionError };
});

const roomId = "room-1";
const transcriptJobId = "job-1";
const recordingAssetId = "asset-1";
const packetBuildId = "packet-build-1";
const summaryNoteId = "summary-1";
const goalCandidateId = `packet-goal-${packetBuildId}-segment-1`;

function request(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/mobile/capture/transcripts/packet/goals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function harness() {
  const segments = [{
    id: "segment-1",
    segmentIndex: 0,
    speakerLabel: "Homer",
    startSeconds: 10,
    endSeconds: 15,
    text: "My goal is to build a repeatable review habit.",
    corrections: [],
    verifications: [],
  }];
  const { projected: _projected, ...transcriptSnapshot } = transcriptPacketSnapshot(segments);
  const summary = {
    id: summaryNoteId,
    roomId,
    kind: "SUMMARY",
    createdAt: new Date("2026-07-18T20:00:00.000Z"),
    updatedAt: new Date("2026-07-18T20:00:00.000Z"),
    sourceJson: {
      source: "transcript-packet-builder",
      roomId,
      transcriptJobId,
      recordingAssetId,
      packetBuildId,
      transcriptSnapshot,
      packetBrief: {
        kind: "quipsly-transcript-packet-brief-v1",
        candidateOnly: true,
        humanApprovalRequired: true,
        sections: [{ id: "goals", items: [{ segmentId: "segment-1", text: "Build a repeatable review habit." }] }],
      },
      goalCandidateReviewReceipts: [],
    } as Record<string, unknown>,
  };
  const goals: any[] = [];
  const goalCreate = jest.fn(async ({ data }: any) => {
    const goal = { ...data, createdAt: new Date("2026-07-18T21:00:00.000Z") };
    goals.push(goal);
    return goal;
  });
  const prisma: any = {
    callRoom: { findFirst: jest.fn().mockResolvedValue({ id: roomId }) },
    coachingNote: {
      findMany: jest.fn().mockResolvedValue([summary]),
      findUnique: jest.fn().mockResolvedValue(summary),
      update: jest.fn(async ({ data }: any) => { summary.sourceJson = data.sourceJson; return summary; }),
    },
    transcriptJob: { findFirst: jest.fn().mockResolvedValue({
      id: transcriptJobId,
      roomId,
      assetId: recordingAssetId,
      status: "COMPLETED",
      asset: { id: recordingAssetId, roomId },
      segments,
    }) },
    goal: {
      findMany: jest.fn(async () => goals),
      findUnique: jest.fn(async ({ where }: any) => goals.find((goal) => goal.id === where.id) ?? null),
      create: goalCreate,
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: summaryNoteId }]),
  };
  prisma.$transaction = jest.fn((callback: any) => callback(prisma));
  return { prisma, summary, goalCreate };
}

describe("packet goal review route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("persists an edited review receipt without creating a Goal or task", async () => {
    const state = harness();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    const response = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "EDIT",
      title: "Review one coaching session every week",
      description: "Keep the practice small and inspectable.",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      decision: "EDIT",
      goal: null,
      boundaries: { editRejectDeferCreateNoGoal: true, taskCreated: false, calendarMutated: false },
    });
    expect(state.goalCreate).not.toHaveBeenCalled();
    expect((state.summary.sourceJson.goalCandidateReviewReceipts as any[])[0]).toMatchObject({
      kind: "quipsly-goal-candidate-review-receipt-v1",
      decision: "EDIT",
      goalCandidateId,
      reviewedByUserId: "user-1",
      goalId: null,
      taskCreated: false,
      externalSideEffects: false,
    });
  });

  it("atomically accepts one exact-source Goal and its packet review receipt", async () => {
    const state = harness();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      roomId,
      transcriptJobId,
      gate: { allowed: true },
      playback: { sourceId: "source-1", recordingAssetId },
      segments: [{
        id: "segment-1",
        startSeconds: 10,
        endSeconds: 15,
        providerText: "My goal is to build a repeatable review habit.",
        providerTextSha256: "0d8590eef19ed6d33d740467f0cd4ac866ced22f88f8f5bcfb9564d1cf5e106a",
        providerSpeakerLabel: "Homer",
        text: "My goal is to build a repeatable review habit.",
        speakerLabel: "Homer",
        acceptedCorrection: null,
      }],
    } as any);
    const response = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "ACCEPT",
      title: "Build a repeatable review habit",
      description: "Review one real session every week.",
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      decision: "ACCEPT",
      goal: { status: "ACTIVE", roomId },
      boundaries: { acceptCreatesOneActorOwnedGoal: true, taskCreated: false, targetDateCreated: false },
    });
    expect(state.goalCreate).toHaveBeenCalledTimes(1);
    const receipt = (state.summary.sourceJson.goalCandidateReviewReceipts as any[])[0];
    expect(receipt).toMatchObject({ decision: "ACCEPT", goalCandidateId, goalId: payload.goal.id, taskCreated: false, calendarMutated: false });
  });
});
