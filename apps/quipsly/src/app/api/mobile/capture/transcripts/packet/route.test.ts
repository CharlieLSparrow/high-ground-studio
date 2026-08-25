/** @jest-environment node */

import { createHash } from "node:crypto";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureTranscriptProcessingGate: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

import { getPrismaClient } from "@/lib/prisma";
import { mobileCaptureTranscriptProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { buildPacketGoalCandidates, buildPacketNoteCandidates, GET, packetNoteVisibilityWhere } from "./route-implementation";

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

describe("packet note privacy", () => {
  it("never widens another author's private packet just because the Session is shared", () => {
    expect(packetNoteVisibilityWhere({
      id: "client-user",
      primaryEmail: " Client@Example.Test ",
      isStaff: false,
    } as any, "room-1")).toEqual({
      AND: [
        { roomId: "room-1" },
        {
          OR: [
            { authorUserId: "client-user" },
            { visibility: { in: ["SESSION_SHARED", "CLIENT_SAFE"] } },
            {
              visibility: "PROJECT_TEAM",
              room: {
                project: {
                  accessGrants: {
                    some: {
                      email: "client@example.test",
                      status: "ACTIVE",
                      role: { in: ["OWNER", "EDITOR"] },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });
});

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

  it("projects an exact MERGE receipt as terminal evidence on the selected existing goal", () => {
    const mergedSummary = {
      sourceJson: {
        ...summary.sourceJson,
        goalCandidateReviewReceipts: [{
          id: "receipt-merge-1",
          kind: "quipsly-goal-candidate-review-receipt-v1",
          decision: "MERGE",
          goalCandidateId: "packet-goal-packet-build-1-segment-1",
          roomId: "room-1",
          transcriptJobId: "job-1",
          recordingAssetId: "asset-1",
          packetBuildId,
          goalId: "goal-existing",
          reviewedAt: "2026-08-03T12:00:00.000Z",
          reviewedByUserId: "user-1",
          candidateDraftAfter: {
            title: "Build a repeatable coaching review habit.",
            description: "My goal is to build a repeatable coaching review habit.",
          },
        }],
      },
    };
    const goals = [{ id: "goal-existing", sourceJson: { schema: "quipsly-manual-goal-v1" } }];
    expect(buildPacketGoalCandidates({ summary: mergedSummary, latestTranscriptJob, goals, packetBuildId })[0]).toMatchObject({
      reviewStatus: "MERGED_INTO_GOAL",
      humanApprovalRequired: false,
      committedGoalId: "goal-existing",
      lastHumanReview: { receiptId: "receipt-merge-1", decision: "MERGE" },
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

  it("projects a complete multi-segment goal with every immutable segment in its source span", () => {
    const sourceText = "My goal is to preserve the recording and wait for explicit release.";
    const spanJob = {
      ...latestTranscriptJob,
      segments: [
        { id: "segment-1", speakerLabel: "Homer", startSeconds: 12.4, endSeconds: 15, text: "My goal is to preserve the recording and" },
        { id: "segment-2", speakerLabel: "Homer", startSeconds: 15, endSeconds: 17.8, text: "wait for explicit release." },
      ],
    };
    const spanSummary = {
      sourceJson: {
        packetBrief: {
          kind: "quipsly-transcript-packet-brief-v1",
          candidateOnly: true,
          humanApprovalRequired: true,
          sections: [{
            id: "goals",
            items: [{
              segmentId: "segment-1",
              segmentIds: ["segment-1", "segment-2"],
              sourceTextSha256: createHash("sha256").update(sourceText).digest("hex"),
              text: sourceText,
            }],
          }],
        },
      },
    };

    expect(buildPacketGoalCandidates({ summary: spanSummary, latestTranscriptJob: spanJob, goals: [], packetBuildId })[0]).toMatchObject({
      segmentId: "segment-1",
      segmentIds: ["segment-1", "segment-2"],
      startSeconds: 12.4,
      endSeconds: 17.8,
      sourceText,
      sourceSpan: {
        primarySegmentId: "segment-1",
        segmentIds: ["segment-1", "segment-2"],
        segments: [
          expect.objectContaining({ segmentId: "segment-1" }),
          expect.objectContaining({ segmentId: "segment-2" }),
        ],
      },
    });
    const tampered = structuredClone(spanSummary);
    tampered.sourceJson.packetBrief.sections[0]!.items[0]!.sourceTextSha256 = "0".repeat(64);
    expect(buildPacketGoalCandidates({ summary: tampered, latestTranscriptJob: spanJob, goals: [], packetBuildId })).toEqual([]);
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

  it("projects only the current actor's latest note-review receipt", () => {
    const candidateId = "packet-note-packet-build-1-coaching-insights-segment-1";
    const snapshotSha256 = "f".repeat(64);
    const receipt = (actor: string, decision: string, title: string) => ({
      id: `receipt-${actor}-${decision}`,
      kind: "quipsly-note-candidate-review-receipt-v1",
      decision,
      packetNoteCandidateId: candidateId,
      reviewedByUserId: actor,
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      packetBuildId,
      summaryNoteId: "summary-1",
      packetLaneId: "coaching-insights",
      transcriptSnapshotSha256: snapshotSha256,
      reviewedAt: "2026-08-03T12:00:00.000Z",
      candidateDraftAfter: { title, body: `${title} body`, kind: "DECISION", visibility: "AUTHOR_PRIVATE" },
    });
    const summary = {
      ...noteSummary,
      sourceJson: {
        ...noteSummary.sourceJson,
        transcriptSnapshot: { sha256: snapshotSha256 },
        noteCandidateReviewReceipts: [
          receipt("user-2", "REJECT", "Other actor private rejection"),
          {
            ...receipt("user-1", "EDIT", "My reviewed insight"),
            governance: {
              schema: "quipsly-governed-action-reference-v1",
              runId: "run-note-1",
              actionId: "action-note-1",
              attemptId: "attempt-note-1",
              receiptId: "governed-receipt-note-1",
              capabilityId: "quipsly.session.transcript-note.materialize",
              capabilityVersion: 1,
            },
          },
        ],
      },
    };

    expect(buildPacketNoteCandidates({ summary, latestTranscriptJob, notes: [], packetBuildId, actorUserId: "user-1" })[0]).toMatchObject({
      suggestedTitle: "My reviewed insight",
      suggestedBody: "My reviewed insight body",
      suggestedKind: "DECISION",
      suggestedVisibility: "AUTHOR_PRIVATE",
      reviewStatus: "EDITED_FOR_REVIEW",
      lastHumanReview: { receiptId: "receipt-user-1-EDIT", decision: "EDIT", reviewedByUserId: "user-1", governance: { actionId: "action-note-1", capabilityId: "quipsly.session.transcript-note.materialize" } },
    });
    expect(buildPacketNoteCandidates({ summary, latestTranscriptJob, notes: [], packetBuildId, actorUserId: "user-3" })[0]).toMatchObject({
      suggestedTitle: "Insights and decisions",
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      lastHumanReview: null,
    });
  });

  it("carries an exact-source non-canonical draft into a rebuilt packet without carrying its decision", () => {
    const sourceText = latestTranscriptJob.segments[0].text;
    const sourceTextSha256 = createHash("sha256").update(sourceText).digest("hex");
    const providerTextSha256 = createHash("sha256").update(sourceText).digest("hex");
    const historicalReceipt = {
      id: "historical-edit-receipt",
      kind: "quipsly-note-candidate-review-receipt-v1",
      decision: "EDIT",
      packetNoteCandidateId: "packet-note-packet-build-old-coaching-insights-segment-1",
      reviewedByUserId: "user-1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      packetBuildId: "packet-build-old",
      summaryNoteId: "summary-old",
      packetLaneId: "coaching-insights",
      segmentId: "segment-1",
      segmentIds: ["segment-1"],
      sourceTextSha256,
      providerTextSha256,
      reviewedAt: "2026-08-03T12:00:00.000Z",
      candidateDraftAfter: {
        title: "A durable reviewed insight",
        body: "Keep the exact-source draft through packet rebuild.",
        kind: "DECISION",
        visibility: "AUTHOR_PRIVATE",
      },
    };
    const currentSummary = {
      ...noteSummary,
      id: "summary-current",
      sourceJson: {
        ...noteSummary.sourceJson,
        roomId: "room-1",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        reviewLanes: [{
          ...noteSummary.sourceJson.reviewLanes[0],
          items: [{
            ...noteSummary.sourceJson.reviewLanes[0].items[0],
            sourceTextSha256,
          }],
        }],
      },
    };
    const historicalSummary = {
      id: "summary-old",
      kind: "SUMMARY",
      sourceJson: {
        source: "transcript-packet-builder",
        roomId: "room-1",
        transcriptJobId: "job-1",
        recordingAssetId: "asset-1",
        noteCandidateReviewReceipts: [historicalReceipt],
      },
    };

    expect(buildPacketNoteCandidates({
      summary: currentSummary,
      latestTranscriptJob,
      notes: [historicalSummary],
      packetBuildId: "packet-build-current",
      actorUserId: "user-1",
    })[0]).toMatchObject({
      id: "packet-note-packet-build-current-coaching-insights-segment-1",
      suggestedTitle: "A durable reviewed insight",
      suggestedBody: "Keep the exact-source draft through packet rebuild.",
      suggestedKind: "DECISION",
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      lastHumanReview: null,
      carriedForwardDraft: {
        receiptId: "historical-edit-receipt",
        decision: "EDIT",
        packetBuildId: "packet-build-old",
        exactSourceMatch: true,
      },
    });

    const changedEvidence = structuredClone(historicalSummary);
    changedEvidence.sourceJson.noteCandidateReviewReceipts[0].providerTextSha256 = "0".repeat(64);
    expect(buildPacketNoteCandidates({
      summary: currentSummary,
      latestTranscriptJob,
      notes: [changedEvidence],
      packetBuildId: "packet-build-current",
      actorUserId: "user-1",
    })[0]).toMatchObject({
      suggestedTitle: "Insights and decisions",
      carriedForwardDraft: null,
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

  it("projects one complete multi-segment note candidate instead of a truncated first segment", () => {
    const sourceText = "I realized the checksum matters and we should verify it before release.";
    const spanJob = {
      ...latestTranscriptJob,
      segments: [
        { id: "segment-1", speakerLabel: "Homer", startSeconds: 12.4, endSeconds: 15, text: "I realized the checksum matters and" },
        { id: "segment-2", speakerLabel: "Homer", startSeconds: 15, endSeconds: 17.8, text: "we should verify it before release." },
      ],
    };
    const spanSummary = {
      id: "summary-1",
      sourceJson: {
        reviewLanes: [{
          id: "coaching-insights",
          label: "Insights and decisions",
          status: "READY_FOR_HUMAN_REVIEW",
          items: [{
            segmentId: "segment-1",
            segmentIds: ["segment-1", "segment-2"],
            sourceTextSha256: createHash("sha256").update(sourceText).digest("hex"),
            text: sourceText,
          }],
        }],
      },
    };
    expect(buildPacketNoteCandidates({ summary: spanSummary, latestTranscriptJob: spanJob, notes: [], packetBuildId, actorUserId: "user-1" })[0]).toMatchObject({
      segmentIds: ["segment-1", "segment-2"],
      startSeconds: 12.4,
      endSeconds: 17.8,
      sourceText,
      suggestedBody: sourceText,
      sourceSpan: { segmentIds: ["segment-1", "segment-2"] },
    });
  });
});

describe("packet source selection", () => {
  const actor = { id: "producer-1", primaryEmail: "producer@example.test", isStaff: false };
  const recording = {
    id: "asset-recovered-2",
    roomId: "room-1",
    fileName: "DJI backup delayed.wav",
    status: "VERIFIED",
    kind: "LOCAL_AUDIO",
    checksum: "a".repeat(64),
    byteSize: 1024n,
    storageBucket: "quipsly-local",
    storageObjectPath: "room-1/dji.wav",
    localManifestJson: {},
  };

  function packetReadPrisma(selectedRecordingAsset: typeof recording | null) {
    return {
      callRoom: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-1" }),
        findUnique: jest.fn().mockResolvedValue({
          id: "room-1",
          title: "Episode 9",
          purpose: "PODCAST",
          status: "ENDED",
          scheduledStart: null,
          scheduledEnd: null,
          projectId: null,
          project: null,
          tagLinks: [],
          booking: null,
        }),
      },
      coachingNote: { findMany: jest.fn().mockResolvedValue([]) },
      actionItem: { findMany: jest.fn().mockResolvedValue([]) },
      recordingAsset: { findFirst: jest.fn().mockResolvedValue(selectedRecordingAsset) },
      transcriptJob: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as any);
    jest.mocked(mobileCaptureTranscriptProcessingGate).mockResolvedValue({ allowed: true } as any);
  });

  it("returns an access-checked selected source and enables its first transcript job", async () => {
    const prisma = packetReadPrisma(recording);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/transcripts/packet?callRoomId=room-1&recordingAssetId=asset-recovered-2"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.recordingAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "asset-recovered-2", roomId: "room-1" },
    }));
    expect(prisma.transcriptJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId: "room-1", assetId: "asset-recovered-2" },
    }));
    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        roomId: "room-1",
        OR: [
          { assignedUserId: actor.id },
          { assignedUserId: null, note: { authorUserId: actor.id } },
        ],
      },
    }));
    expect(payload.selectedRecordingAsset).toEqual({
      id: "asset-recovered-2",
      fileName: "DJI backup delayed.wav",
      status: "VERIFIED",
      kind: "LOCAL_AUDIO",
      explicitlySelected: true,
    });
    expect(payload.transcriptJob).toBeNull();
    expect(payload.packet.safeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "repair-transcript-first", label: "Start source-bound transcript", enabled: true }),
    ]));
    expect(mobileCaptureTranscriptProcessingGate).toHaveBeenCalledWith({ prisma, recordingAsset: recording });
  });

  it("fails closed when a requested source is not in the accessible Session", async () => {
    const prisma = packetReadPrisma(null);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as any);

    const response = await GET(new Request("http://localhost/api/mobile/capture/transcripts/packet?callRoomId=room-1&recordingAssetId=asset-from-other-room"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringMatching(/not part of the accessible Session/i) });
    expect(mobileCaptureTranscriptProcessingGate).not.toHaveBeenCalled();
  });
});
