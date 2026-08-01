/** @jest-environment node */

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({
  mobileCaptureTranscriptProcessingGate: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const mockedGetPrisma = jest.mocked(getPrismaClient);
const mockedTranscriptGate = jest.mocked(mobileCaptureTranscriptProcessingGate);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);

const ROOM_ID = "room-1";
const TRANSCRIPT_JOB_ID = "transcript-1";
const RECORDING_ASSET_ID = "asset-1";
const SUMMARY_NOTE_ID = "summary-1";
const PACKET_BUILD_ID = "packet-build-1";
const ACTION_CANDIDATE_ID = `quipsly-transcript-action-candidate-v1:${TRANSCRIPT_JOB_ID}:segment-1`;

function actionCandidate() {
  return {
    id: ACTION_CANDIDATE_ID,
    kind: "quipsly-transcript-action-candidate-v1",
    reviewStatus: "READY_FOR_HUMAN_REVIEW",
    title: "Send the revised episode outline",
    detail: "- 00:12 Charlie: I will send the revised episode outline.",
    transcriptJobId: TRANSCRIPT_JOB_ID,
    recordingAssetId: RECORDING_ASSET_ID,
    roomId: ROOM_ID,
    packetBuildId: PACKET_BUILD_ID,
    segmentId: "segment-1",
    speakerLabel: "Charlie",
    startSeconds: 12,
    endSeconds: 18,
    humanApprovalRequired: true,
    committedActionItemId: null,
  };
}

function createPrismaHarness() {
  const segments = [{
    id: "segment-1",
    segmentIndex: 0,
    speakerLabel: "Charlie",
    startSeconds: 12,
    endSeconds: 18,
    text: "I will send the revised episode outline.",
    corrections: [],
    verifications: [],
  }];
  const { projected: _projected, ...transcriptSnapshot } = transcriptPacketSnapshot(segments);
  const summary = {
    id: SUMMARY_NOTE_ID,
    kind: "SUMMARY",
    roomId: ROOM_ID,
    bookingId: "booking-1",
    createdAt: new Date("2026-07-18T12:00:00.000Z"),
    updatedAt: new Date("2026-07-18T12:00:00.000Z"),
    sourceJson: {
      source: "transcript-packet-builder",
      transcriptJobId: TRANSCRIPT_JOB_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      roomId: ROOM_ID,
      packetBuildId: PACKET_BUILD_ID,
      transcriptSnapshot,
      actionCandidates: [actionCandidate()],
      actionCandidateReviewReceipts: [],
    } as Record<string, unknown>,
  };
  const actionItems: any[] = [];
  let actionSequence = 0;
  let transactionTail = Promise.resolve<unknown>(undefined);

  const prisma: any = {
    callRoom: {
      findFirst: jest.fn(async ({ where }: any) => where.id === ROOM_ID ? { id: ROOM_ID } : null),
    },
    transcriptJob: {
      findFirst: jest.fn(async ({ where }: any) => (
        where.id === TRANSCRIPT_JOB_ID && where.roomId === ROOM_ID
          ? {
              id: TRANSCRIPT_JOB_ID,
              roomId: ROOM_ID,
              assetId: RECORDING_ASSET_ID,
              status: "COMPLETED",
              asset: { id: RECORDING_ASSET_ID, roomId: ROOM_ID },
              segments,
            }
          : null
      )),
    },
    coachingNote: {
      findMany: jest.fn(async () => [summary]),
      findUnique: jest.fn(async ({ where }: any) => where.id === summary.id ? summary : null),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id !== summary.id) return null;
        summary.sourceJson = data.sourceJson;
        summary.updatedAt = new Date();
        return summary;
      }),
    },
    actionItem: {
      findMany: jest.fn(async ({ where }: any) => actionItems.filter((item) => (
        item.roomId === where.roomId && item.noteId === where.noteId
      ))),
      findUnique: jest.fn(async ({ where }: any) => actionItems.find((item) => item.id === where.id) || null),
      create: jest.fn(async ({ data }: any) => {
        actionSequence += 1;
        const item = {
          id: `action-${actionSequence}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        actionItems.push(item);
        return item;
      }),
    },
    $queryRaw: jest.fn(async () => [{ id: SUMMARY_NOTE_ID }]),
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => Promise<unknown>) => {
    const execution = transactionTail.then(() => callback(prisma));
    transactionTail = execution.then(() => undefined, () => undefined);
    return execution;
  });

  return { prisma, summary, actionItems };
}

function reviewRequest(
  decision: "ACCEPT" | "EDIT" | "REJECT" | "DEFER",
  overrides: Record<string, unknown> = {},
) {
  return new Request("http://localhost/api/mobile/capture/transcripts/packet/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomId: ROOM_ID,
      transcriptJobId: TRANSCRIPT_JOB_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      summaryNoteId: SUMMARY_NOTE_ID,
      packetBuildId: PACKET_BUILD_ID,
      actionCandidateId: ACTION_CANDIDATE_ID,
      decision,
      ...overrides,
    }),
  });
}

describe("action candidate review route", () => {
  let harness: ReturnType<typeof createPrismaHarness>;

  beforeEach(() => {
    jest.clearAllMocks();
    harness = createPrismaHarness();
    mockedGetPrisma.mockReturnValue(harness.prisma);
    mockedSession.mockResolvedValue({
      user: { id: "coach-1", isStaff: false, email: "coach@example.com" },
    } as any);
    mockedTranscriptGate.mockResolvedValue({ allowed: true, receipt: null });
  });

  it("requires authentication before reading room or packet evidence", async () => {
    mockedSession.mockResolvedValue(null);

    const response = await POST(reviewRequest("ACCEPT"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.errorCode).toBe("AUTH_REQUIRED");
    expect(harness.prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when the signed-in user cannot access the requested room", async () => {
    harness.prisma.callRoom.findFirst.mockResolvedValue(null);

    const response = await POST(reviewRequest("ACCEPT", { roomId: "room-2" }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe("ROOM_ACCESS_DENIED");
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("serializes concurrent ACCEPT repeats into exactly one provenance-rich, unassigned ActionItem", async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      POST(reviewRequest("ACCEPT")),
      POST(reviewRequest("ACCEPT")),
    ]);
    const first = await firstResponse.json();
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(harness.prisma.actionItem.create).toHaveBeenCalledTimes(1);
    expect(harness.actionItems).toHaveLength(1);
    expect(new Set([first.actionItem.id, second.actionItem.id])).toEqual(new Set(["action-1"]));
    expect([first.idempotentReplay, second.idempotentReplay].sort()).toEqual([false, true]);

    const action = harness.actionItems[0];
    expect(action).toEqual(expect.objectContaining({
      roomId: ROOM_ID,
      bookingId: "booking-1",
      noteId: SUMMARY_NOTE_ID,
      assignedUserId: null,
      status: "OPEN",
      title: "Send the revised episode outline",
    }));
    expect(action.sourceJson).toEqual(expect.objectContaining({
      source: "transcript-packet-builder",
      materializationSource: "transcript-action-candidate-acceptance",
      candidate: false,
      humanAccepted: true,
      actionCandidateId: ACTION_CANDIDATE_ID,
      transcriptJobId: TRANSCRIPT_JOB_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      packetBuildId: PACKET_BUILD_ID,
      packetSummaryNoteId: SUMMARY_NOTE_ID,
      segmentId: "segment-1",
      acceptedByUserId: "coach-1",
      externalSideEffects: false,
      assignmentClaimed: false,
      deliveryClaimed: false,
      publicationClaimed: false,
    }));

    const source = harness.summary.sourceJson as any;
    expect(source.actionCandidateReviewReceipts).toHaveLength(1);
    expect(source.actionCandidateReviewReceipts[0]).toEqual(expect.objectContaining({
      kind: "quipsly-action-candidate-review-receipt-v1",
      decision: "ACCEPT",
      actionCandidateId: ACTION_CANDIDATE_ID,
      actionItemId: "action-1",
      transcriptJobId: TRANSCRIPT_JOB_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      packetBuildId: PACKET_BUILD_ID,
    }));
    expect(source.actionCandidates[0]).toEqual(expect.objectContaining({
      reviewStatus: "ACCEPTED_AS_ACTION_ITEM",
      humanApprovalRequired: false,
      committedActionItemId: "action-1",
    }));
  });

  it.each(["REJECT", "DEFER"] as const)("records %s without materializing open work", async (decision) => {
    const response = await POST(reviewRequest(decision, { note: `${decision.toLowerCase()} for review` }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.actionItem).toBeNull();
    expect(harness.prisma.actionItem.create).not.toHaveBeenCalled();
    const source = harness.summary.sourceJson as any;
    expect(source.actionCandidateReviewReceipts).toHaveLength(1);
    expect(source.actionCandidateReviewReceipts[0].decision).toBe(decision);
    expect(source.actionCandidates[0].committedActionItemId).toBeNull();
    expect(source.actionCandidates[0].reviewStatus).toBe(
      decision === "REJECT" ? "REJECTED_BY_HUMAN" : "DEFERRED_BY_HUMAN",
    );
  });

  it("edits only the candidate draft while preserving source evidence and original draft in its receipt", async () => {
    const response = await POST(reviewRequest("EDIT", {
      title: "Send the final episode outline",
      detail: "Send the version with chapter beats and source links.",
      note: "Clarified the deliverable before accepting it.",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.actionItem).toBeNull();
    expect(harness.prisma.actionItem.create).not.toHaveBeenCalled();
    const source = harness.summary.sourceJson as any;
    expect(source.actionCandidates[0]).toEqual(expect.objectContaining({
      title: "Send the final episode outline",
      detail: "Send the version with chapter beats and source links.",
      reviewStatus: "EDITED_FOR_REVIEW",
      transcriptJobId: TRANSCRIPT_JOB_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      roomId: ROOM_ID,
      packetBuildId: PACKET_BUILD_ID,
      segmentId: "segment-1",
      startSeconds: 12,
      endSeconds: 18,
      committedActionItemId: null,
    }));
    expect(source.actionCandidateReviewReceipts[0]).toEqual(expect.objectContaining({
      decision: "EDIT",
      reviewNote: "Clarified the deliverable before accepting it.",
      candidateDraftBefore: {
        title: "Send the revised episode outline",
        detail: "- 00:12 Charlie: I will send the revised episode outline.",
      },
      candidateDraftAfter: {
        title: "Send the final episode outline",
        detail: "Send the version with chapter beats and source links.",
      },
      actionItemId: null,
    }));
  });

  it("rejects stale packet-build evidence before entering the materialization transaction", async () => {
    const response = await POST(reviewRequest("ACCEPT", { packetBuildId: "stale-build" }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("STALE_PACKET_BUILD");
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it("holds every decision when transcript and recording release evidence is missing", async () => {
    mockedTranscriptGate.mockResolvedValue({
      allowed: false,
      receipt: null,
      errorCode: "TRANSCRIPT_PROCESSING_RELEASE_REQUIRED",
      error: "Reviewed transcript release is required.",
    });

    const response = await POST(reviewRequest("REJECT"));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("TRANSCRIPT_PROCESSING_RELEASE_REQUIRED");
    expect(payload.explicitReleaseRequired).toBe(true);
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    expect(harness.prisma.actionItem.create).not.toHaveBeenCalled();
    expect(harness.prisma.coachingNote.update).not.toHaveBeenCalled();
  });

  it("rechecks release evidence inside the transaction before materializing accepted work", async () => {
    mockedTranscriptGate
      .mockResolvedValueOnce({ allowed: true, receipt: null })
      .mockResolvedValueOnce({
        allowed: false,
        receipt: null,
        errorCode: "TRANSCRIPT_PROCESSING_RELEASE_REQUIRED",
        error: "Recording release was withdrawn before review committed.",
      });

    const response = await POST(reviewRequest("ACCEPT"));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("TRANSCRIPT_PROCESSING_RELEASE_REQUIRED");
    expect(mockedTranscriptGate).toHaveBeenCalledTimes(2);
    expect(harness.prisma.actionItem.create).not.toHaveBeenCalled();
    expect(harness.prisma.coachingNote.update).not.toHaveBeenCalled();
  });

  it.each([
    ["title", "EDIT", { title: "x".repeat(501) }, "ACTION_CANDIDATE_TITLE_TOO_LONG"],
    ["detail", "EDIT", { detail: "x".repeat(5_001) }, "ACTION_CANDIDATE_DETAIL_TOO_LONG"],
    ["note", "DEFER", { note: "x".repeat(2_001) }, "ACTION_CANDIDATE_REVIEW_NOTE_TOO_LONG"],
  ] as const)("bounds %s before reading packet data", async (_field, decision, overrides, errorCode) => {
    const response = await POST(reviewRequest(decision, overrides));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.errorCode).toBe(errorCode);
    expect(harness.prisma.callRoom.findFirst).not.toHaveBeenCalled();
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });
});
