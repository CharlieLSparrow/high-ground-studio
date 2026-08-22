/** @jest-environment node */

import { createHash } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { recordSucceededTranscriptWorkAction } from "@/lib/server/governed-action-runtime";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/governed-action-runtime", () => ({
  readGovernedActionSourceReference: jest.fn((value) => value ?? null),
  recordSucceededTranscriptWorkAction: jest.fn(),
}));
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

function reviewedAsIs(text: string, speakerLabel: string, id = "verification-1") {
  return [{
    id,
    reviewKind: "confirmed-as-is",
    providerTextSha256: createHash("sha256").update(text).digest("hex"),
    providerSpeakerLabel: speakerLabel,
    createdAt: new Date("2026-08-02T02:10:00.000Z"),
  }];
}

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
    verifications: reviewedAsIs("My goal is to build a repeatable review habit.", "Homer"),
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
      packetTemplateVersion: "quipsly-session-packet-v4",
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
  const goalTagLinks: Array<{ goalId: string; tagId: string }> = [];
  const goalProgressReceipts: any[] = [];
  const goalCreate = jest.fn(async ({ data }: any) => {
    const goal = { ...data, createdAt: new Date("2026-07-18T21:00:00.000Z") };
    goals.push(goal);
    return goal;
  });
  const goalTagLinkCreateMany = jest.fn(async ({ data }: any) => {
    goalTagLinks.push(...data);
    return { count: data.length };
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
      findFirst: jest.fn(async ({ where }: any) => goals.find((goal) => (
        goal.id === where.id
        && goal.ownerUserId === where.ownerUserId
        && (!where.status?.in || where.status.in.includes(goal.status))
        && (where.projectId === undefined || goal.projectId === where.projectId)
        && (where.roomId === undefined || goal.roomId === where.roomId)
      )) ?? null),
      findUnique: jest.fn(async ({ where }: any) => {
        const goal = goals.find((item) => item.id === where.id);
        return goal ? {
          ...goal,
          tagLinks: goalTagLinks.filter((link) => link.goalId === goal.id).map((link) => ({
            ...link,
            tag: { id: link.tagId, label: link.tagId, slug: link.tagId },
          })),
        } : null;
      }),
      create: goalCreate,
    },
    goalProgressReceipt: {
      create: jest.fn(async ({ data }: any) => {
        goalProgressReceipts.push(data);
        return data;
      }),
      findUnique: jest.fn(async ({ where }: any) => goalProgressReceipts.find((receipt) => receipt.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const receipt = goalProgressReceipts.find((item) => item.id === where.id);
        if (!receipt) throw new Error("missing goal progress receipt");
        Object.assign(receipt, data);
        return receipt;
      }),
    },
    studioTag: { findMany: jest.fn().mockResolvedValue([{ id: "tag-coaching", label: "Coaching", slug: "coaching" }]) },
    goalTagLink: { createMany: goalTagLinkCreateMany },
    $queryRaw: jest.fn().mockResolvedValue([{ id: summaryNoteId }]),
  };
  prisma.$transaction = jest.fn((callback: any) => callback(prisma));
  return { prisma, summary, goalCreate, goalTagLinkCreateMany, goalProgressReceipts, goals, segments };
}

describe("packet goal review route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(recordSucceededTranscriptWorkAction).mockImplementation(async (_tx, input) => {
      const suffix = input.capabilityId === "quipsly.session.transcript-goal.materialize"
        ? "packet-goal"
        : "packet-goal-merge";
      return ({
      schema: "quipsly-governed-action-reference-v1",
      runId: `run-${suffix}`,
      actionId: `action-${suffix}`,
      attemptId: `attempt-${suffix}`,
      receiptId: `receipt-${suffix}`,
      capabilityId: input.capabilityId,
      capabilityVersion: 1,
      });
    });
  });

  it("rejects before private reads when signed out", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as any);
    const response = await POST(request({}));
    expect(response.status).toBe(401);
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("uses the normalized active Nest grant for both preflight and transactional access", async () => {
    const state = harness();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "producer-2",
        primaryEmail: " Producer-2@Example.Test ",
        isStaff: false,
      },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);

    const response = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "DEFER",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.boundaries).toMatchObject({
      canonicalSessionAccess: true,
      sessionAccessRechecked: true,
    });
    expect(state.prisma.callRoom.findFirst).toHaveBeenCalledTimes(2);
    for (const [input] of state.prisma.callRoom.findFirst.mock.calls) {
      expect(input.where).toEqual(expect.objectContaining({
        id: roomId,
        OR: expect.arrayContaining([{
          project: {
            accessGrants: {
              some: {
                email: "producer-2@example.test",
                status: "ACTIVE",
                role: { in: ["OWNER", "EDITOR"] },
              },
            },
          },
        }]),
      }));
    }
  });

  it("fails closed without a receipt or Goal when Session access is revoked before commit", async () => {
    const state = harness();
    state.prisma.callRoom.findFirst
      .mockResolvedValueOnce({ id: roomId })
      .mockResolvedValueOnce(null);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false },
    } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);

    const response = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "ACCEPT",
    }));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe("SESSION_ACCESS_REVOKED");
    expect(state.goalCreate).not.toHaveBeenCalled();
    expect((state.summary.sourceJson.goalCandidateReviewReceipts as any[])).toEqual([]);
  });

  it("creates an internal Goal from provider transcript evidence without claiming human review", async () => {
    const state = harness();
    state.segments[0]!.verifications = [];
    const { projected: _projected, ...snapshot } = transcriptPacketSnapshot(state.segments);
    (state.summary.sourceJson as any).transcriptSnapshot = snapshot;
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      roomId,
      projectId: "project-1",
      transcriptJobId,
      gate: { allowed: true },
      playback: { sourceId: "source-1", recordingAssetId },
      segments: [{
        id: "segment-1",
        startSeconds: 10,
        endSeconds: 15,
        providerText: "My goal is to build a repeatable review habit.",
        providerTextSha256: createHash("sha256").update("My goal is to build a repeatable review habit.").digest("hex"),
        providerSpeakerLabel: "Homer",
        text: "My goal is to build a repeatable review habit.",
        speakerLabel: "Homer",
        acceptedCorrection: null,
        acceptedVerification: null,
        reviewStatus: "provider",
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
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      goal: { title: "Build a repeatable review habit." },
      boundaries: {
        humanReviewedSourceRequired: false,
        sourceReviewState: "provider-transcript",
        sourceReviewRecommended: true,
        externalDelivery: false,
        calendarMutated: false,
      },
    });
    expect(state.goalCreate).toHaveBeenCalledTimes(1);
    expect(state.prisma.coachingNote.update).toHaveBeenCalledTimes(1);
    expect(state.goals[0]?.sourceJson).toMatchObject({
      sourceReviewState: "provider-transcript",
      automaticallySuggested: true,
    });
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
      projectId: "project-1",
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
      targetAt: "2026-09-01T18:00:00.000Z",
      tagIds: ["tag-coaching"],
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      decision: "ACCEPT",
      goal: { status: "ACTIVE", roomId, targetAt: "2026-09-01T18:00:00.000Z", tags: [{ id: "tag-coaching" }] },
      boundaries: { acceptCreatesOneActorOwnedGoal: true, taskCreated: false, targetDateCreated: true, projectTagsApplied: true },
    });
    expect(state.goalCreate).toHaveBeenCalledTimes(1);
    expect(state.prisma.coachingNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ kind: true }),
    }));
    const receipt = (state.summary.sourceJson.goalCandidateReviewReceipts as any[])[0];
    expect(receipt).toMatchObject({ decision: "ACCEPT", goalCandidateId, goalId: payload.goal.id, taskCreated: false, targetDateCreated: true, projectTagsApplied: true, calendarMutated: false, materializationIntent: { title: "Build a repeatable review habit", description: "Review one real session every week.", targetAt: "2026-09-01T18:00:00.000Z", tagIds: ["tag-coaching"] } });
    expect(state.goalTagLinkCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ tagId: "tag-coaching", createdByUserId: "user-1" })] });

    const exactReplay = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "ACCEPT",
      title: "Build a repeatable review habit",
      description: "Review one real session every week.",
      targetAt: "2026-09-01T18:00:00.000Z",
      tagIds: ["tag-coaching"],
    }));
    expect(exactReplay.status).toBe(200);
    expect(await exactReplay.json()).toMatchObject({ ok: true, idempotentReplay: true, goal: { id: payload.goal.id } });
    expect(state.goalCreate).toHaveBeenCalledTimes(1);

    const changedIntent = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "ACCEPT",
      title: "Build a repeatable review habit",
      description: "Review one real session every week.",
      targetAt: "2026-10-01T18:00:00.000Z",
      tagIds: ["tag-coaching"],
    }));
    expect(changedIntent.status).toBe(409);
    expect(await changedIntent.json()).toMatchObject({ ok: false, errorCode: "GOAL_CANDIDATE_IDEMPOTENCY_CONFLICT" });
    expect(state.goalCreate).toHaveBeenCalledTimes(1);
  });

  it("appends exact transcript evidence to one selected existing Goal without changing the Goal", async () => {
    const state = harness();
    const targetUpdatedAt = new Date("2026-08-03T12:00:00.000Z");
    const target = {
      id: "goal-existing",
      ownerUserId: "user-1",
      roomId: null,
      projectId: "project-1",
      title: "Build a repeatable review practice",
      description: "Keep the goal stable while evidence accumulates.",
      status: "ACTIVE",
      targetAt: new Date("2026-10-01T18:00:00.000Z"),
      updatedAt: targetUpdatedAt,
      sourceJson: { schema: "quipsly-manual-goal-v1" },
    };
    state.goals.push(target);
    state.prisma.callRoom.findFirst.mockResolvedValue({ id: roomId, projectId: "project-1" });
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      roomId,
      projectId: "project-1",
      transcriptJobId,
      gate: { allowed: true },
      playback: { sourceId: "source-1", recordingAssetId },
      segments: [{
        id: "segment-1",
        startSeconds: 10,
        endSeconds: 15,
        providerText: "My goal is to build a repeatable review habit.",
        providerTextSha256: createHash("sha256").update("My goal is to build a repeatable review habit.").digest("hex"),
        providerSpeakerLabel: "Homer",
        text: "My goal is to build a repeatable review habit.",
        speakerLabel: "Homer",
        acceptedCorrection: null,
      }],
    } as any);

    const mergeRequest = {
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "MERGE",
      mergeTargetGoalId: target.id,
      mergeExpectedUpdatedAt: targetUpdatedAt.toISOString(),
    };
    const before = structuredClone({
      title: target.title,
      description: target.description,
      status: target.status,
      targetAt: target.targetAt.toISOString(),
      projectId: target.projectId,
      roomId: target.roomId,
      sourceJson: target.sourceJson,
    });
    const response = await POST(request(mergeRequest));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      decision: "MERGE",
      idempotentReplay: false,
      goal: { id: target.id, title: target.title, status: "ACTIVE" },
      receipt: {
        decision: "MERGE",
        goalCandidateId,
        goalId: target.id,
        goalEvidenceAppended: true,
        goalDefinitionMutated: false,
        goalStatusMutated: false,
        mergeTargetBefore: { id: target.id, updatedAt: targetUpdatedAt.toISOString() },
        mergeTargetAfter: { id: target.id, updatedAt: targetUpdatedAt.toISOString() },
        governance: {
          capabilityId: "quipsly.session.transcript-goal-evidence.merge",
        },
      },
      governance: { capabilityId: "quipsly.session.transcript-goal-evidence.merge" },
      boundaries: {
        mergeAppendsOneActorOwnedGoalEvidenceReceipt: true,
        mergeChangesNoGoalDefinitionStatusTargetOrTags: true,
        taskCreated: false,
        calendarMutated: false,
      },
    });
    expect(state.goalCreate).not.toHaveBeenCalled();
    expect(state.goalProgressReceipts).toHaveLength(1);
    expect(state.goalProgressReceipts[0]).toMatchObject({
      id: payload.receipt.goalProgressReceiptId,
      goalId: target.id,
      actorUserId: "user-1",
      kind: "TRANSCRIPT_CANDIDATE_MERGED",
      progressPercent: null,
      evidenceJson: {
        schema: "quipsly-transcript-goal-evidence-merge-v1",
        receiptId: payload.receipt.id,
        goalCandidateId,
        candidateSource: {
          schema: "quipsly-transcript-derived-goal-v1",
          roomId,
          transcriptJobId,
          segmentId: "segment-1",
          recordingAssetId,
          playbackSourceId: "source-1",
        },
        governance: {
          capabilityId: "quipsly.session.transcript-goal-evidence.merge",
        },
      },
    });
    expect(recordSucceededTranscriptWorkAction).toHaveBeenCalledWith(state.prisma, expect.objectContaining({
      capabilityId: "quipsly.session.transcript-goal-evidence.merge",
      targetObjectType: "Goal",
      targetObjectId: target.id,
      payload: expect.objectContaining({
        targetObjectId: target.id,
        expectedTargetUpdatedAt: targetUpdatedAt.toISOString(),
        evidenceReceiptId: payload.receipt.goalProgressReceiptId,
      }),
      result: expect.objectContaining({
        targetBefore: payload.receipt.mergeTargetBefore,
        targetAfter: payload.receipt.mergeTargetAfter,
      }),
    }));
    expect({
      title: target.title,
      description: target.description,
      status: target.status,
      targetAt: target.targetAt.toISOString(),
      projectId: target.projectId,
      roomId: target.roomId,
      sourceJson: target.sourceJson,
    }).toEqual(before);

    const replay = await POST(request(mergeRequest));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      ok: true,
      decision: "MERGE",
      idempotentReplay: true,
      goal: { id: target.id },
      receipt: { goalProgressReceiptId: payload.receipt.goalProgressReceiptId },
    });
    expect(state.goalProgressReceipts).toHaveLength(1);
  });

  it("rejects stale or non-owned Goal merge targets without an evidence receipt", async () => {
    const state = harness();
    const target = {
      id: "goal-existing",
      ownerUserId: "another-user",
      roomId: null,
      projectId: "project-1",
      title: "Someone else's goal",
      description: null,
      status: "ACTIVE",
      targetAt: null,
      updatedAt: new Date("2026-08-03T12:00:00.000Z"),
      sourceJson: {},
    };
    state.goals.push(target);
    state.prisma.callRoom.findFirst.mockResolvedValue({ id: roomId, projectId: "project-1" });
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
      decision: "MERGE",
      mergeTargetGoalId: target.id,
      mergeExpectedUpdatedAt: target.updatedAt.toISOString(),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MERGE_TARGET_UNAVAILABLE",
    });
    expect(state.goalProgressReceipts).toEqual([]);
    expect((state.summary.sourceJson.goalCandidateReviewReceipts as any[])).toEqual([]);

    target.ownerUserId = "user-1";
    const stale = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "MERGE",
      mergeTargetGoalId: target.id,
      mergeExpectedUpdatedAt: "2026-08-03T11:00:00.000Z",
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      ok: false,
      errorCode: "GOAL_CANDIDATE_MERGE_TARGET_CHANGED",
    });
    expect(state.goalProgressReceipts).toEqual([]);
  });

  it("accepts a complete multi-segment goal and persists every constituent evidence hash", async () => {
    const state = harness();
    const firstText = "My goal is to preserve the original recording and";
    const secondText = "wait for explicit release.";
    const sourceText = `${firstText} ${secondText}`;
    state.segments[0]!.endSeconds = 13;
    state.segments[0]!.text = firstText;
    state.segments[0]!.verifications = reviewedAsIs(firstText, "Homer");
    state.segments.push({ id: "segment-2", segmentIndex: 1, speakerLabel: "Homer", startSeconds: 13, endSeconds: 15, text: secondText, corrections: [], verifications: reviewedAsIs(secondText, "Homer", "verification-2") });
    const { projected: _projected, ...snapshot } = transcriptPacketSnapshot(state.segments);
    const packetSource = state.summary.sourceJson as any;
    packetSource.transcriptSnapshot = snapshot;
    packetSource.packetBrief.sections[0].items = [{
      segmentId: "segment-1",
      segmentIds: ["segment-1", "segment-2"],
      sourceTextSha256: createHash("sha256").update(sourceText).digest("hex"),
      text: sourceText,
    }];
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.test", isStaff: false } } as any);
    jest.mocked(getPrismaClient).mockReturnValue(state.prisma);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      roomId,
      projectId: "project-1",
      transcriptJobId,
      gate: { allowed: true },
      playback: { sourceId: "source-1", recordingAssetId },
      segments: state.segments.map((segment) => ({
        id: segment.id,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        providerText: segment.text,
        providerTextSha256: createHash("sha256").update(segment.text).digest("hex"),
        providerSpeakerLabel: segment.speakerLabel,
        text: segment.text,
        speakerLabel: segment.speakerLabel,
        acceptedCorrection: null,
      })),
    } as any);

    const response = await POST(request({
      callRoomId: roomId,
      transcriptJobId,
      recordingAssetId,
      summaryNoteId,
      packetBuildId,
      goalCandidateId,
      decision: "ACCEPT",
      title: "Preserve the recording until release",
      description: sourceText,
      tagIds: [],
    }));
    expect(response.status).toBe(200);
    const createdSource = state.goalCreate.mock.calls[0]?.[0].data.sourceJson;
    expect(createdSource).toMatchObject({
      segmentId: "segment-1",
      segmentIds: ["segment-1", "segment-2"],
      startSeconds: 10,
      endSeconds: 15,
      effectiveTextSnapshot: sourceText,
      sourceSpan: {
        segmentIds: ["segment-1", "segment-2"],
        segments: [
          expect.objectContaining({ segmentId: "segment-1", providerTextSha256: createHash("sha256").update(firstText).digest("hex") }),
          expect.objectContaining({ segmentId: "segment-2", providerTextSha256: createHash("sha256").update(secondText).digest("hex") }),
        ],
      },
    });
    expect((state.summary.sourceJson.goalCandidateReviewReceipts as any[])[0]).toMatchObject({
      segmentIds: ["segment-1", "segment-2"],
      sourceSpan: { segmentIds: ["segment-1", "segment-2"] },
    });
  });
});
