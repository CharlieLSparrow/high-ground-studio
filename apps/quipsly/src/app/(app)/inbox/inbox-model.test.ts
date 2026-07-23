import { buildInboxSnapshot } from "./inbox-model";

function room() {
  return {
    id: "room-1",
    title: "Episode 5 review",
    purpose: "PODCAST",
    updatedAt: "2026-07-19T15:00:00.000Z",
    project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground-odyssey" },
    notes: [{
      id: "summary-1",
      kind: "SUMMARY",
      title: "Review packet",
      body: "Candidate packet",
      createdAt: "2026-07-19T15:00:00.000Z",
      updatedAt: "2026-07-19T15:00:00.000Z",
      sourceJson: {
        packetBuildId: "build-1",
        actionCandidates: [{
          id: "quipsly-transcript-action-candidate-v1:job-1:segment-action",
          kind: "quipsly-transcript-action-candidate-v1",
          reviewStatus: "READY_FOR_HUMAN_REVIEW",
          title: "Review the cold open",
          detail: "00:10 Homer: Review it",
          transcriptJobId: "job-1",
          recordingAssetId: "asset-1",
          roomId: "room-1",
          packetBuildId: "build-1",
          segmentId: "segment-action",
          speakerLabel: "Homer",
          startSeconds: 10,
          endSeconds: 14,
          humanApprovalRequired: true,
          committedActionItemId: null,
        }],
        packetBrief: {
          kind: "quipsly-transcript-packet-brief-v1",
          candidateOnly: true,
          humanApprovalRequired: true,
          sections: [{ id: "goals", items: [{ segmentId: "segment-goal", text: "Publish one thoughtful episode" }] }],
        },
        goalCandidateReviewReceipts: [],
        reviewLanes: [{ id: "clips", label: "Clip candidates", status: "NEEDS_REVISION", meaning: "Moments to compare with playback" }],
      },
    }],
    actionItems: [],
  };
}

describe("Nest Inbox model", () => {
  it("projects only reviewable packet evidence and preserves exact Session anchors", () => {
    const result = buildInboxSnapshot([room()]);
    expect(result.ready.map((item) => [item.kind, item.state])).toEqual([
      ["ACTION", "READY"],
      ["GOAL", "READY"],
      ["LANE", "REVISE"],
    ]);
    expect(result.ready[0]).toMatchObject({ roomId: "room-1", segmentId: "segment-action", project: { name: "High Ground Odyssey" } });
    expect(result.counts).toEqual({ ready: 2, revise: 1, deferred: 0, sources: 0, sessions: 1 });
    expect(result.boundaries).toMatchObject({ noUnreadClaim: true, externalSideEffects: false });
  });

  it("puts actor-owned iPhone sources ahead of proposals without pretending they are filed research", () => {
    const result = buildInboxSnapshot([room()], [{
      id: "mobile-source-source-1",
      captureType: "BOOKMARK",
      title: "Leadership interview",
      excerpt: "https://example.com/interview",
      updatedAt: "2026-07-19T16:00:00.000Z",
      captureCount: 2,
      lastCapturedAt: "2026-07-19T17:00:00.000Z",
    }]);
    expect(result.ready[0]).toMatchObject({
      id: "mobile-source-source-1",
      kind: "SOURCE",
      roomId: null,
      project: null,
      sourceLabel: "iPhone link capture",
      captureCount: 2,
      updatedAt: "2026-07-19T17:00:00.000Z",
    });
    expect(result.counts.sources).toBe(1);
    expect(result.boundaries).toMatchObject({ personalSourceCaptureIncluded: true, transcriptPacketReviewIncluded: true, noUnreadClaim: true });
  });

  it("separates deferred work and excludes accepted or rejected proposals", () => {
    const fixture = room();
    const source = fixture.notes[0].sourceJson as any;
    source.actionCandidates[0].reviewStatus = "ACCEPTED_AS_ACTION_ITEM";
    source.goalCandidateReviewReceipts = [
      { kind: "quipsly-goal-candidate-review-receipt-v1", goalCandidateId: "packet-goal-build-1-segment-goal", decision: "DEFER" },
    ];
    source.reviewLanes[0].status = "REJECTED_BY_HUMAN";
    const result = buildInboxSnapshot([fixture]);
    expect(result.ready).toEqual([]);
    expect(result.deferred.map((item) => item.kind)).toEqual(["GOAL"]);
  });
});
