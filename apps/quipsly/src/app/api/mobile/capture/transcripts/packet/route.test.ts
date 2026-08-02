/** @jest-environment node */

import { createHash } from "node:crypto";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

import { buildPacketGoalCandidates, buildPacketNoteCandidates } from "./route-implementation";

const packetBuildId = "packet-build-1";
const summary = {
  sourceJson: {
    packetBrief: {
      kind: "quipsly-transcript-packet-brief-v1",
      candidateOnly: true,
      humanApprovalRequired: true,
      sections: [{
        id: "goals",
        items: [{ segmentId: "segment-1", text: "Build a repeatable coaching review habit." }],
      }],
    },
  },
};
const latestTranscriptJob = {
  id: "job-1",
  roomId: "room-1",
  assetId: "asset-1",
  status: "COMPLETED",
  segments: [{ id: "segment-1", speakerLabel: "Homer", startSeconds: 12.4, endSeconds: 17.8, text: "My goal is to build a repeatable coaching review habit." }],
};

describe("packet goal candidates", () => {
  it("binds a candidate to current provider evidence without creating work", () => {
    expect(buildPacketGoalCandidates({ summary, latestTranscriptJob, goals: [], packetBuildId })).toEqual([expect.objectContaining({
      id: "packet-goal-packet-build-1-segment-1",
      clientRequestId: "packet-goal-packet-build-1-segment-1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      segmentId: "segment-1",
      startSeconds: 12.4,
      providerTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      suggestedTitle: "Build a repeatable coaching review habit.",
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      committedGoalId: null,
    })]);
  });

  it("correlates the actor's accepted goal by deterministic request identity", () => {
    const goals = [{ id: "goal-1", sourceJson: { schema: "quipsly-transcript-derived-goal-v1", clientRequestId: "packet-goal-packet-build-1-segment-1" } }];
    expect(buildPacketGoalCandidates({ summary, latestTranscriptJob, goals, packetBuildId })[0]).toMatchObject({
      reviewStatus: "ACCEPTED_AS_GOAL",
      humanApprovalRequired: false,
      committedGoalId: "goal-1",
    });
  });

  it("uses the accepted correction for the candidate while retaining the provider hash", () => {
    const providerText = latestTranscriptJob.segments[0].text;
    const correctedJob = {
      ...latestTranscriptJob,
      segments: [{
        ...latestTranscriptJob.segments[0],
        corrections: [{
          id: "correction-1",
          status: "accepted",
          baseTextSha256: createHash("sha256").update(providerText).digest("hex"),
          expectedSpeakerLabel: "Homer",
          correctedText: "My goal is to build a repeatable weekly coaching-review habit.",
          correctedSpeakerLabel: "Scott",
          updatedAt: new Date("2026-08-01T23:45:00.000Z"),
        }],
      }],
    };
    expect(buildPacketGoalCandidates({ summary, latestTranscriptJob: correctedJob, goals: [], packetBuildId })[0]).toMatchObject({
      sourceText: "My goal is to build a repeatable weekly coaching-review habit.",
      suggestedDescription: "My goal is to build a repeatable weekly coaching-review habit.",
      speakerLabel: "Scott",
      acceptedReviewId: "correction-1",
      acceptedCorrectionId: "correction-1",
      transcriptReviewStatus: "human-reviewed",
      providerTextSha256: createHash("sha256").update(providerText).digest("hex"),
    });
  });

  it("replays the latest exact-source human review draft without manufacturing a goal", () => {
    const reviewedSummary = {
      sourceJson: {
        ...summary.sourceJson,
        goalCandidateReviewReceipts: [{
          id: "receipt-1",
          kind: "quipsly-goal-candidate-review-receipt-v1",
          decision: "EDIT",
          goalCandidateId: "packet-goal-packet-build-1-segment-1",
          roomId: "room-1",
          transcriptJobId: "job-1",
          recordingAssetId: "asset-1",
          packetBuildId,
          reviewedAt: "2026-07-18T23:00:00.000Z",
          reviewedByUserId: "user-1",
          candidateDraftAfter: { title: "Review one coaching session each week", description: "A concrete weekly review habit." },
        }],
      },
    };
    expect(buildPacketGoalCandidates({ summary: reviewedSummary, latestTranscriptJob, goals: [], packetBuildId })[0]).toMatchObject({
      suggestedTitle: "Review one coaching session each week",
      suggestedDescription: "A concrete weekly review habit.",
      reviewStatus: "EDITED_FOR_REVIEW",
      committedGoalId: null,
      lastHumanReview: { receiptId: "receipt-1", decision: "EDIT", reviewedByUserId: "user-1" },
    });
  });

  it("fails closed for a non-candidate or uncorrelated brief", () => {
    expect(buildPacketGoalCandidates({ summary: { sourceJson: { packetBrief: { ...summary.sourceJson.packetBrief, candidateOnly: false } } }, latestTranscriptJob, goals: [], packetBuildId })).toEqual([]);
    expect(buildPacketGoalCandidates({ summary, latestTranscriptJob: { ...latestTranscriptJob, status: "RUNNING" }, goals: [], packetBuildId })).toEqual([]);
  });
});

describe("packet note candidates", () => {
  const noteSummary = {
    id: "summary-1",
    sourceJson: {
      reviewLanes: [{
        id: "coaching-insights",
        label: "Insights and decisions",
        status: "READY_FOR_HUMAN_REVIEW",
        items: [{ segmentId: "segment-1", text: "My goal is to build a repeatable coaching review habit." }],
      }],
    },
  };

  it("projects exact reviewed transcript evidence into an author-private note candidate", () => {
    expect(buildPacketNoteCandidates({
      summary: noteSummary,
      latestTranscriptJob,
      notes: [],
      packetBuildId,
      actorUserId: "user-1",
    })).toEqual([expect.objectContaining({
      id: "packet-note-packet-build-1-coaching-insights-segment-1",
      summaryNoteId: "summary-1",
      laneId: "coaching-insights",
      laneLabel: "Insights and decisions",
      segmentId: "segment-1",
      sourceText: "My goal is to build a repeatable coaching review habit.",
      providerTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      suggestedKind: "SESSION_NOTE",
      suggestedVisibility: "AUTHOR_PRIVATE",
      humanApprovalRequired: true,
      committedNoteId: null,
    })]);
  });

  it("correlates only the current actor's deliberate canonical note", () => {
    const sourceJson = {
      schema: "quipsly-transcript-derived-note-v1",
      packetNoteCandidateId: "packet-note-packet-build-1-coaching-insights-segment-1",
    };
    const notes = [
      { id: "other-private-note", authorUserId: "user-2", sourceJson },
      { id: "actor-note", authorUserId: "user-1", sourceJson },
    ];
    expect(buildPacketNoteCandidates({ summary: noteSummary, latestTranscriptJob, notes, packetBuildId, actorUserId: "user-1" })[0]).toMatchObject({
      humanApprovalRequired: false,
      committedNoteId: "actor-note",
    });
    expect(buildPacketNoteCandidates({ summary: noteSummary, latestTranscriptJob, notes: notes.slice(0, 1), packetBuildId, actorUserId: "user-1" })[0]).toMatchObject({
      humanApprovalRequired: true,
      committedNoteId: null,
    });
  });

  it("uses the accepted correction while preserving the immutable provider hash", () => {
    const providerText = latestTranscriptJob.segments[0].text;
    const correctedJob = {
      ...latestTranscriptJob,
      segments: [{
        ...latestTranscriptJob.segments[0],
        corrections: [{
          id: "correction-1",
          status: "accepted",
          baseTextSha256: createHash("sha256").update(providerText).digest("hex"),
          expectedSpeakerLabel: "Homer",
          correctedText: "I learned that a weekly review makes follow-through visible.",
          correctedSpeakerLabel: "Scott",
          updatedAt: new Date("2026-08-02T02:00:00.000Z"),
        }],
      }],
    };
    expect(buildPacketNoteCandidates({ summary: noteSummary, latestTranscriptJob: correctedJob, notes: [], packetBuildId, actorUserId: "user-1" })[0]).toMatchObject({
      sourceText: "I learned that a weekly review makes follow-through visible.",
      suggestedBody: "I learned that a weekly review makes follow-through visible.",
      speakerLabel: "Scott",
      acceptedReviewId: "correction-1",
      acceptedCorrectionId: "correction-1",
      transcriptReviewStatus: "human-reviewed",
      providerTextSha256: createHash("sha256").update(providerText).digest("hex"),
    });
  });

  it("omits empty or unresolvable lane items", () => {
    expect(buildPacketNoteCandidates({
      summary: { id: "summary-1", sourceJson: { reviewLanes: [{ id: "empty", label: "Empty", status: "EMPTY", items: [{ segmentId: "segment-1" }] }] } },
      latestTranscriptJob,
      notes: [],
      packetBuildId,
      actorUserId: "user-1",
    })).toEqual([]);
  });
});
