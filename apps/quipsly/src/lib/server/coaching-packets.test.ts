/** @jest-environment node */

import {
  buildCoachingPacketFromTranscriptJob,
  buildTranscriptPacketBrief,
  isUnreviewedTranscriptActionItem,
  mergePacketActionCandidates,
  selectLatestCorrelatedPacketNotes,
} from "./coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "./mobile-capture-processing-gates";

jest.mock("./mobile-capture-processing-gates", () => ({
  mobileCaptureTranscriptProcessingGate: jest.fn(),
}));

const mockedTranscriptGate = jest.mocked(mobileCaptureTranscriptProcessingGate);

function completedTranscriptJob() {
  return {
    id: "transcript-1",
    roomId: "room-1",
    assetId: "asset-1",
    provider: "test-provider",
    status: "COMPLETED",
    asset: { id: "asset-1", roomId: "room-1" },
    room: { bookingId: "booking-1", booking: { id: "booking-1" } },
    segments: [
      {
        id: "segment-action",
        speakerLabel: "Charlie",
        startSeconds: 12,
        endSeconds: 18,
        text: "I will send the outline before next time.",
        confidence: 0.98,
      },
      {
        id: "segment-context",
        speakerLabel: "Homer",
        startSeconds: 19,
        endSeconds: 24,
        text: "That gives the episode a much clearer shape.",
        confidence: 0.96,
      },
    ],
  };
}

describe("transcript coaching packet action review boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTranscriptGate.mockResolvedValue({ allowed: true, receipt: null });
  });

  it("stores inferred actions as packet candidates without creating OPEN ActionItem rows", async () => {
    const coachingNoteCreate = jest.fn(async ({ data }: any) => ({
      id: data.kind === "SUMMARY" ? "summary-1" : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const actionItemCreate = jest.fn();
    const prisma = {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(completedTranscriptJob()) },
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: coachingNoteCreate,
      },
      actionItem: { create: actionItemCreate },
    };

    const result = await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
    });

    expect(result.ok).toBe(true);
    expect(actionItemCreate).not.toHaveBeenCalled();

    const summaryWrite = coachingNoteCreate.mock.calls.find(
      ([call]) => call.data.kind === "SUMMARY",
    )?.[0].data;
    expect(summaryWrite?.sourceJson.actionCandidates).toEqual([
      expect.objectContaining({
        kind: "quipsly-transcript-action-candidate-v1",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        transcriptJobId: "transcript-1",
        packetBuildId: expect.any(String),
        segmentId: "segment-action",
        humanApprovalRequired: true,
        committedActionItemId: null,
      }),
    ]);
    expect(summaryWrite?.sourceJson.packetBrief).toMatchObject({
      kind: "quipsly-transcript-packet-brief-v1",
      candidateOnly: true,
      humanApprovalRequired: true,
      sections: expect.arrayContaining([
        expect.objectContaining({ id: "commitments", itemCount: 1, items: [expect.objectContaining({ segmentId: "segment-action", startSeconds: 12 })] }),
        expect.objectContaining({ id: "key-moments" }),
      ]),
    });
    expect(summaryWrite?.body).toContain("Candidate commitments:");
    expect(result).toEqual(expect.objectContaining({
      actionCandidateCount: 1,
      actionItemCount: 0,
      actionItemIds: [],
    }));
  });

  it("keeps decisions, goals, questions, commitments, and key moments in separate source-linked candidate lanes", () => {
    const segments = [
      { id: "decision", speakerLabel: "Coach", startSeconds: 1, endSeconds: 2, text: "We decided to record the pilot on Friday." },
      { id: "goal", speakerLabel: "Client", startSeconds: 3, endSeconds: 4, text: "My goal is to make the next session calmer." },
      { id: "question", speakerLabel: "Client", startSeconds: 5, endSeconds: 6, text: "Which microphone should we verify?" },
      { id: "commitment", speakerLabel: "Coach", startSeconds: 7, endSeconds: 8, text: "I will send the outline before next time." },
    ];
    const brief = buildTranscriptPacketBrief(segments, [segments[0]], [segments[3]]);
    expect(brief).toMatchObject({ kind: "quipsly-transcript-packet-brief-v1", candidateOnly: true, humanApprovalRequired: true, overview: { segmentCount: 4, speakerCount: 2 } });
    expect(Object.fromEntries(brief.sections.map((section) => [section.id, section.items.map((item) => item.segmentId)]))).toEqual({
      decisions: ["decision"],
      goals: ["goal"],
      questions: ["question"],
      commitments: ["commitment"],
      "key-moments": ["decision"],
    });
  });

  it("keeps explicitly materialized ActionItems separate while projecting legacy candidate rows as candidates", () => {
    const storedCandidate = {
      id: "quipsly-transcript-action-candidate-v1:transcript-1:stored-segment",
      kind: "quipsly-transcript-action-candidate-v1",
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      title: "Review stored follow-up",
      detail: "Stored detail",
      transcriptJobId: "transcript-1",
      recordingAssetId: "asset-1",
      roomId: "room-1",
      segmentId: "stored-segment",
      speakerLabel: "Charlie",
      startSeconds: 1,
      endSeconds: 2,
      humanApprovalRequired: true,
      committedActionItemId: null,
    } as const;
    const legacyCandidate = {
      id: "legacy-action-item",
      roomId: "room-1",
      title: "Legacy inferred follow-up",
      detail: "Legacy detail",
      status: "OPEN",
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId: "transcript-1",
        recordingAssetId: "asset-1",
        roomId: "room-1",
        segmentId: "legacy-segment",
        candidate: true,
      },
    };
    const explicitlyAccepted = {
      id: "accepted-action-item",
      status: "OPEN",
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId: "transcript-1",
        candidate: false,
        acceptedByUserId: "coach-1",
      },
    };
    const legacyWebCandidate = {
      id: "legacy-web-action-item",
      roomId: "room-1",
      title: "Legacy web inferred follow-up",
      detail: "Legacy web detail",
      status: "OPEN",
      sourceJson: {
        source: "web-transcript-packet-builder",
        transcriptJobId: "transcript-1",
        recordingAssetId: "asset-1",
        roomId: "room-1",
        segmentId: "legacy-web-segment",
        candidate: true,
      },
    };

    expect(isUnreviewedTranscriptActionItem(legacyCandidate)).toBe(true);
    expect(isUnreviewedTranscriptActionItem(legacyWebCandidate)).toBe(true);
    expect(isUnreviewedTranscriptActionItem(explicitlyAccepted)).toBe(false);
    expect(mergePacketActionCandidates({
      sourceJson: { actionCandidates: [storedCandidate] },
      legacyActionItems: [legacyCandidate, legacyWebCandidate, explicitlyAccepted],
    })).toEqual([
      expect.objectContaining(storedCandidate),
      expect.objectContaining({
        segmentId: "legacy-segment",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        committedActionItemId: null,
      }),
      expect.objectContaining({
        segmentId: "legacy-web-segment",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        committedActionItemId: null,
      }),
    ]);
  });

  it("correlates force rebuild summaries and highlights and reads only the newest build", async () => {
    const createdNotes: any[] = [];
    let latestSummary: any = null;
    let sequence = 0;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      sequence += 1;
      const note = {
        id: `${data.kind.toLowerCase()}-${sequence}`,
        ...data,
        createdAt: new Date(Date.UTC(2026, 6, 18, 12, 0, sequence)),
        updatedAt: new Date(Date.UTC(2026, 6, 18, 12, 0, sequence)),
      };
      createdNotes.push(note);
      if (data.kind === "SUMMARY") latestSummary = { ...note, actionItems: [] };
      return note;
    });
    const actionItemCreate = jest.fn();
    const prisma = {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(completedTranscriptJob()) },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: coachingNoteCreate,
      },
      actionItem: { create: actionItemCreate },
    };

    const firstBuild = await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
    }) as any;
    const forcedBuild = await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
      force: true,
    }) as any;

    expect(firstBuild.packetBuildId).toEqual(expect.any(String));
    expect(forcedBuild.packetBuildId).toEqual(expect.any(String));
    expect(forcedBuild.packetBuildId).not.toBe(firstBuild.packetBuildId);
    expect(actionItemCreate).not.toHaveBeenCalled();

    const selected = selectLatestCorrelatedPacketNotes(createdNotes);
    expect(selected.packetBuildId).toBe(forcedBuild.packetBuildId);
    expect(selected.correlationMode).toBe("PACKET_BUILD_ID");
    expect(selected.summary?.sourceJson.packetBuildId).toBe(forcedBuild.packetBuildId);
    expect(selected.highlights).toHaveLength(2);
    expect(selected.highlights.every(
      (note) => note.sourceJson.packetBuildId === forcedBuild.packetBuildId,
    )).toBe(true);

    const legacySelected = selectLatestCorrelatedPacketNotes([
      {
        id: "legacy-summary",
        kind: "SUMMARY",
        sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript-1" },
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
      },
      {
        id: "legacy-highlight",
        kind: "HIGHLIGHT",
        sourceJson: { source: "transcript-packet-builder", transcriptJobId: "transcript-1" },
        createdAt: new Date("2026-07-18T11:00:01.000Z"),
      },
    ]);
    expect(legacySelected.correlationMode).toBe("LEGACY_TRANSCRIPT_FALLBACK");
    expect(legacySelected.highlights.map((note) => note.id)).toEqual(["legacy-highlight"]);
  });
});
