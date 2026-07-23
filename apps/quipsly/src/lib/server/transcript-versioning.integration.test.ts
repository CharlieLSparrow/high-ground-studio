/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";
import { readTranscriptDerivedGoalSource } from "@high-ground/quipsly-domain/transcript-derived-task";

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the transcript versioning smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("immutable transcript version local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  let userId = "";
  let roomId = "";
  let firstJobId = "";
  let firstSegmentId = "";
  let taskId = "";
  let goalId = "";
  let summaryNoteId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { primaryEmail: `transcript-version-${nonce}@example.test`, name: "Transcript version smoke" },
    });
    userId = user.id;
    const room = await prisma.callRoom.create({
      data: { title: "Immutable transcript smoke", createdByUserId: userId },
    });
    roomId = room.id;
    const asset = await prisma.recordingAsset.create({
      data: { roomId, status: "VERIFIED", fileName: "immutable-smoke.m4a" },
    });
    const firstJob = await prisma.transcriptJob.create({
      data: { roomId, assetId: asset.id, status: "FAILED", provider: "deepgram" },
    });
    firstJobId = firstJob.id;
    const firstSegment = await prisma.transcriptSegment.create({
      data: {
        transcriptJobId: firstJob.id,
        speakerLabel: "Charlie",
        startSeconds: 12.25,
        endSeconds: 17.5,
        text: "Ship the episode outline before the next recording.",
        confidence: 0.97,
      },
    });
    firstSegmentId = firstSegment.id;
    const task = await prisma.actionItem.create({
      data: {
        roomId,
        assignedUserId: userId,
        title: "Ship the episode outline",
        sourceJson: {
          schema: "quipsly-transcript-derived-task-v1",
          roomId,
          transcriptJobId: firstJob.id,
          segmentId: firstSegment.id,
          startSeconds: firstSegment.startSeconds,
          endSeconds: firstSegment.endSeconds,
          effectiveTextSnapshot: firstSegment.text,
          effectiveSpeakerLabelSnapshot: firstSegment.speakerLabel,
          recordingAssetId: asset.id,
        },
      },
    });
    taskId = task.id;
    const goal = await prisma.goal.create({
      data: {
        roomId,
        ownerUserId: userId,
        title: "Build a repeatable episode-outline habit",
        status: "ACTIVE",
        sourceJson: {
          schema: "quipsly-transcript-derived-goal-v1",
          clientRequestId: `packet-goal-packet-${nonce}-${firstSegment.id}`,
          createdByUserId: userId,
          roomId,
          transcriptJobId: firstJob.id,
          segmentId: firstSegment.id,
          startSeconds: firstSegment.startSeconds,
          endSeconds: firstSegment.endSeconds,
          providerTextSha256: "a".repeat(64),
          providerSpeakerLabel: firstSegment.speakerLabel,
          effectiveTextSnapshot: firstSegment.text,
          effectiveSpeakerLabelSnapshot: firstSegment.speakerLabel,
          acceptedCorrectionId: null,
          recordingAssetId: asset.id,
          playbackSourceId: asset.id,
        },
      },
    });
    goalId = goal.id;
    const summary = await prisma.coachingNote.create({
      data: {
        roomId,
        kind: "SUMMARY",
        title: "Reviewed packet goal smoke",
        body: "One packet goal was explicitly accepted.",
        sourceJson: {
          source: "transcript-packet-builder",
          roomId,
          transcriptJobId: firstJob.id,
          recordingAssetId: asset.id,
          packetBuildId: `packet-${nonce}`,
          goalCandidateReviewReceipts: [{
            id: `receipt-${nonce}`,
            kind: "quipsly-goal-candidate-review-receipt-v1",
            decision: "ACCEPT",
            goalCandidateId: `packet-goal-packet-${nonce}-${firstSegment.id}`,
            clientRequestId: `packet-goal-packet-${nonce}-${firstSegment.id}`,
            transcriptJobId: firstJob.id,
            recordingAssetId: asset.id,
            packetBuildId: `packet-${nonce}`,
            roomId,
            segmentId: firstSegment.id,
            providerTextSha256: "a".repeat(64),
            reviewedByUserId: userId,
            goalId: goal.id,
            taskCreated: false,
            calendarMutated: false,
            deliveryClaimed: false,
            publicationClaimed: false,
          }],
        },
      },
    });
    summaryNoteId = summary.id;

    const secondJob = await prisma.transcriptJob.create({
      data: {
        roomId,
        assetId: asset.id,
        status: "COMPLETED",
        provider: "deepgram",
        resultJson: { versionedFromTranscriptJobId: firstJob.id },
      },
    });
    await prisma.transcriptSegment.create({
      data: {
        transcriptJobId: secondJob.id,
        speakerLabel: "Charlie",
        startSeconds: 12.2,
        endSeconds: 17.6,
        text: "Send the episode outline before the next recording.",
        confidence: 0.99,
      },
    });
  });

  afterAll(async () => {
    try {
      if (roomId) await prisma.callRoom.deleteMany({ where: { id: roomId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("keeps the original task and goal anchors readable after a new transcript version is stored", async () => {
    const [firstSegment, task, goal, summary, jobs] = await Promise.all([
      prisma.transcriptSegment.findUnique({ where: { id: firstSegmentId } }),
      prisma.actionItem.findUnique({ where: { id: taskId } }),
      prisma.goal.findUnique({ where: { id: goalId } }),
      prisma.coachingNote.findUnique({ where: { id: summaryNoteId } }),
      prisma.transcriptJob.findMany({ where: { roomId }, include: { segments: true }, orderBy: { createdAt: "asc" } }),
    ]);

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.segments.length)).toEqual([1, 1]);
    expect(firstSegment).toMatchObject({
      id: firstSegmentId,
      transcriptJobId: firstJobId,
      startSeconds: 12.25,
      endSeconds: 17.5,
      text: "Ship the episode outline before the next recording.",
    });
    expect(task?.sourceJson).toMatchObject({
      transcriptJobId: firstJobId,
      segmentId: firstSegmentId,
      effectiveTextSnapshot: "Ship the episode outline before the next recording.",
    });
    expect(readTranscriptDerivedGoalSource(goal?.sourceJson)).toMatchObject({
      roomId,
      transcriptJobId: firstJobId,
      segmentId: firstSegmentId,
      startSeconds: 12.25,
      effectiveTextSnapshot: "Ship the episode outline before the next recording.",
    });
    expect(summary?.sourceJson).toMatchObject({
      transcriptJobId: firstJobId,
      goalCandidateReviewReceipts: [expect.objectContaining({
        kind: "quipsly-goal-candidate-review-receipt-v1",
        decision: "ACCEPT",
        segmentId: firstSegmentId,
        goalId,
        reviewedByUserId: userId,
        taskCreated: false,
        calendarMutated: false,
        deliveryClaimed: false,
        publicationClaimed: false,
      })],
    });
  });
});
