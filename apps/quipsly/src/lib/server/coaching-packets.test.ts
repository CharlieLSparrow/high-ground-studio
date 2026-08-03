/** @jest-environment node */

import { createHash } from "node:crypto";

import {
  buildCoachingPacketFromTranscriptJob,
  buildTranscriptEvidenceSpans,
  buildTranscriptPacketBrief,
  isUnreviewedTranscriptActionItem,
  mergePacketActionCandidates,
  packetSnapshotMatches,
  projectTranscriptSegmentsForPacket,
  reviewLaneDefinitionsForPurpose,
  selectLatestCorrelatedPacketNotes,
  transcriptPacketSnapshot,
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
    room: { bookingId: "booking-1", purpose: "COACHING", booking: { id: "booking-1" } },
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
    expect(summaryWrite).toMatchObject({ visibility: "AUTHOR_PRIVATE" });
    expect(summaryWrite?.sourceJson).toMatchObject({
      packetPurpose: "COACHING",
      packetTemplateVersion: "quipsly-session-packet-v4",
    });
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

  it("keeps one complete commitment across adjacent immutable provider segments", () => {
    const raw = [
      { id: "segment-1", speakerLabel: "Coach", startSeconds: 6, endSeconds: 11, text: "The test goal is to preserve the original recording, verify the exact checksum, and", corrections: [], verifications: [] },
      { id: "segment-2", speakerLabel: "Coach", startSeconds: 11, endSeconds: 16, text: "hold all transcript work until every participant has consented and a human explicitly releases", corrections: [], verifications: [] },
      { id: "segment-3", speakerLabel: "Coach", startSeconds: 16, endSeconds: 17, text: "it.", corrections: [], verifications: [] },
      { id: "segment-4", speakerLabel: "Coach", startSeconds: 18, endSeconds: 20, text: "This is a separate sentence.", corrections: [], verifications: [] },
    ];
    const projected = projectTranscriptSegmentsForPacket(raw);
    const spans = buildTranscriptEvidenceSpans(projected);

    expect(projected.map((segment) => segment.id)).toEqual(["segment-1", "segment-2", "segment-3", "segment-4"]);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      id: "segment-1",
      segmentIds: ["segment-1", "segment-2", "segment-3"],
      startSeconds: 6,
      endSeconds: 17,
      text: "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.",
      sourceTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(spans[0]?.evidenceSegments).toEqual(projected.slice(0, 3));
    expect(spans[1]?.segmentIds).toEqual(["segment-4"]);
  });

  it("keeps coaching and podcast review lanes purpose-specific", () => {
    const coaching = reviewLaneDefinitionsForPurpose("COACHING").map((lane) => lane.id);
    const podcast = reviewLaneDefinitionsForPurpose("PODCAST").map((lane) => lane.id);
    expect(coaching).toEqual([
      "client-follow-up",
      "coaching-insights",
      "obstacles-and-support",
      "goals-and-tasks",
      "next-session-prep",
    ]);
    expect(podcast).toEqual([
      "goals-and-tasks",
      "next-session-prep",
      "podcast-production",
      "fact-checks-and-rights",
      "quote-candidates",
      "article-seeds",
      "clip-candidates",
    ]);
    expect(coaching).not.toContain("podcast-production");
    expect(podcast).not.toContain("client-follow-up");
  });

  it("builds packet text from accepted review overlays and hashes the exact review snapshot", () => {
    const providerText = "I will send the outline before next time.";
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const segments = [{
      id: "segment-action",
      speakerLabel: "Speaker 0",
      startSeconds: 12,
      endSeconds: 18,
      text: providerText,
      confidence: 0.98,
      corrections: [{
        id: "correction-1",
        status: "accepted",
        baseTextSha256: providerTextSha256,
        expectedSpeakerLabel: "Speaker 0",
        correctedText: "I will send the finished outline before next time.",
        correctedSpeakerLabel: "Charlie",
        updatedAt: new Date("2026-08-01T23:40:00.000Z"),
      }],
      verifications: [],
    }];

    expect(projectTranscriptSegmentsForPacket(segments)).toEqual([expect.objectContaining({
      text: "I will send the finished outline before next time.",
      speakerLabel: "Charlie",
      providerText,
      providerTextSha256,
      reviewStatus: "human-reviewed",
      acceptedReviewId: "correction-1",
      acceptedCorrectionId: "correction-1",
    })]);
    const snapshot = transcriptPacketSnapshot(segments);
    const persisted = { transcriptSnapshot: { ...snapshot, projected: undefined } };
    expect(snapshot).toMatchObject({ segmentCount: 1, humanReviewedSegmentCount: 1, providerOnlySegmentCount: 0 });
    expect(packetSnapshotMatches(persisted, segments)).toBe(true);
    expect(packetSnapshotMatches(persisted, [{ ...segments[0], corrections: [] }])).toBe(false);
  });

  it("records confirmed-as-is as reviewed without changing provider packet text", () => {
    const providerText = "That gives the episode a much clearer shape.";
    const providerTextSha256 = createHash("sha256").update(providerText).digest("hex");
    const projected = projectTranscriptSegmentsForPacket([{
      id: "segment-context",
      speakerLabel: "Homer",
      startSeconds: 19,
      endSeconds: 24,
      text: providerText,
      verifications: [{
        id: "verification-1",
        reviewKind: "confirmed-as-is",
        providerTextSha256,
        providerSpeakerLabel: "Homer",
        createdAt: new Date("2026-08-01T23:41:00.000Z"),
      }],
    }]);
    expect(projected[0]).toMatchObject({
      text: providerText,
      reviewStatus: "human-reviewed",
      acceptedReviewId: "verification-1",
      acceptedCorrectionId: null,
    });
  });

  it("uses a reviewed speaker identity in packets without upgrading provider words to human-reviewed", () => {
    const segments = [{
      id: "segment-context",
      speakerLabel: "Speaker 0",
      startSeconds: 19,
      endSeconds: 24,
      text: "That gives the episode a much clearer shape.",
      corrections: [],
      verifications: [],
    }];
    const firstAttribution = [{
      id: "speaker-attribution-1",
      status: "active",
      providerSpeakerLabel: "Speaker 0",
      participantId: "participant-scott",
      participantDisplaySnapshot: "Scott",
      providerSnapshotSha256: createHash("sha256").update(JSON.stringify({
        providerSpeakerLabel: "Speaker 0",
        evidence: [{
          id: "segment-context",
          startSeconds: 19,
          endSeconds: 24,
          textSha256: createHash("sha256").update("That gives the episode a much clearer shape.").digest("hex"),
        }],
      })).digest("hex"),
    }];
    const projected = projectTranscriptSegmentsForPacket(segments, firstAttribution);
    expect(projected[0]).toMatchObject({
      speakerLabel: "Scott",
      providerSpeakerLabel: "Speaker 0",
      reviewStatus: "provider",
      acceptedReviewId: null,
      acceptedCorrectionId: null,
      acceptedSpeakerAttributionId: "speaker-attribution-1",
    });

    const snapshot = transcriptPacketSnapshot(segments, firstAttribution);
    const persisted = { transcriptSnapshot: { ...snapshot, projected: undefined } };
    expect(packetSnapshotMatches(persisted, segments, firstAttribution)).toBe(true);
    expect(packetSnapshotMatches(persisted, segments, [{
      ...firstAttribution[0],
      id: "speaker-attribution-2",
      participantDisplaySnapshot: "Charlie",
    }])).toBe(false);
  });

  it("ignores a speaker identity whose full provider cluster no longer matches its reviewed snapshot", () => {
    const segments = [{
      id: "segment-context",
      speakerLabel: "Speaker 0",
      startSeconds: 19,
      endSeconds: 24,
      text: "The provider added a later turn after the identity review.",
      corrections: [],
      verifications: [],
    }];
    const projected = projectTranscriptSegmentsForPacket(segments, [{
      id: "speaker-attribution-stale",
      status: "active",
      providerSpeakerLabel: "Speaker 0",
      participantId: "participant-scott",
      participantDisplaySnapshot: "Scott",
      providerSnapshotSha256: "f".repeat(64),
    }]);
    expect(projected[0]).toMatchObject({
      speakerLabel: "Speaker 0",
      acceptedSpeakerAttributionId: null,
      reviewStatus: "provider",
    });
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

  it("reuses an identical snapshot but automatically versions the packet after transcript review changes", async () => {
    const job = completedTranscriptJob();
    const summaries: any[] = [];
    let latestSummary: any = null;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      const note = { id: `note-${summaries.length + 1}`, ...data, createdAt: new Date(), updatedAt: new Date() };
      if (data.kind === "SUMMARY") {
        latestSummary = { ...note, actionItems: [] };
        summaries.push(latestSummary);
      }
      return note;
    });
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: { findFirst: jest.fn(async () => latestSummary), create: coachingNoteCreate },
    };

    const first = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" }) as any;
    const replay = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" }) as any;
    expect(replay).toMatchObject({ reusedExistingPacket: true, packetBuildId: first.packetBuildId });

    const provider = job.segments[0];
    (provider as any).corrections = [{
      id: "correction-later",
      status: "accepted",
      baseTextSha256: createHash("sha256").update(provider.text).digest("hex"),
      expectedSpeakerLabel: provider.speakerLabel,
      correctedText: "I will send the finished outline before next time.",
      correctedSpeakerLabel: provider.speakerLabel,
      updatedAt: new Date("2026-08-01T23:50:00.000Z"),
    }];
    const rebuilt = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" }) as any;
    expect(rebuilt).toMatchObject({ reusedExistingPacket: false, rebuiltForTranscriptReviewChange: true });
    expect(rebuilt.packetBuildId).not.toBe(first.packetBuildId);
    expect(summaries).toHaveLength(2);
    expect(summaries[1].body).toContain("I will send the finished outline before next time.");
    expect(summaries[1].sourceJson.transcriptReviewCoverage).toMatchObject({ humanReviewedSegmentCount: 1, providerOnlySegmentCount: 1 });
  });
});
