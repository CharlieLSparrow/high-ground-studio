import { candidateReviewRequest, committedTasks, goalCandidateReviewRequest, packetLaneReviewRequest, timestampForSeconds } from "./session-review-model";

describe("session review model", () => {
  const packet: any = {
    ok: true,
    room: { id: "room-1" },
    transcriptJob: { id: "job-1", asset: { id: "asset-1" } },
    packet: {
      build: { packetBuildId: "build-1", correlationMode: "PACKET_BUILD_ID" },
      summary: { id: "summary-1" },
      actionItems: [
        { id: "candidate-row", title: "Suggested", source: { candidate: true } },
        { id: "accepted-row", title: "Committed", source: { candidate: false } },
      ],
    },
  };
  const candidate: any = {
    id: "candidate-1", roomId: "room-1", transcriptJobId: "job-1", recordingAssetId: "asset-1",
    packetBuildId: "build-1", segmentId: "segment-1", title: "Draft", detail: "Evidence",
  };

  it("formats transcript evidence time without inventing a wall-clock", () => {
    expect(timestampForSeconds(65.8)).toBe("01:05");
    expect(timestampForSeconds(-1)).toBe("00:00");
  });

  it("keeps quarantined candidates out of committed tasks", () => {
    expect(committedTasks(packet).map((item) => item.id)).toEqual(["accepted-row"]);
  });

  it("binds every review decision to the packet evidence", () => {
    expect(candidateReviewRequest({ packet, candidate, decision: "EDIT", title: "Clarified" })).toEqual({
      callRoomId: "room-1", transcriptJobId: "job-1", recordingAssetId: "asset-1", summaryNoteId: "summary-1",
      packetBuildId: "build-1", actionCandidateId: "candidate-1", decision: "EDIT", title: "Clarified",
    });
  });

  it("refuses a review payload without a correlated packet build", () => {
    expect(candidateReviewRequest({ packet: { ...packet, packet: { ...packet.packet, build: null } }, candidate, decision: "ACCEPT" })).toBeNull();
  });

  it("binds every goal review decision to the exact packet evidence", () => {
    const goalCandidate: any = {
      id: "packet-goal-build-1-segment-1",
      clientRequestId: "packet-goal-build-1-segment-1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      segmentId: "segment-1",
      providerTextSha256: "a".repeat(64),
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      committedGoalId: null,
    };
    expect(goalCandidateReviewRequest({ packet, candidate: goalCandidate, decision: "EDIT", title: "  Build the review habit  ", description: "  One real review each week.  " })).toEqual({
      callRoomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      goalCandidateId: "packet-goal-build-1-segment-1",
      decision: "EDIT",
      title: "Build the review habit",
      description: "One real review each week.",
    });
    expect(goalCandidateReviewRequest({ packet, candidate: { ...goalCandidate, committedGoalId: "goal-1", reviewStatus: "ACCEPTED_AS_GOAL" }, decision: "ACCEPT" })).toBeNull();
  });

  it("binds packet lane review to the canonical room, transcript, and summary", () => {
    const lane: any = { id: "client-follow-up", status: "READY_FOR_HUMAN_REVIEW" };
    expect(packetLaneReviewRequest({ packet, lane, status: "APPROVED_FOR_INTERNAL_USE", note: "  Reviewed for internal use.  " })).toEqual({
      callRoomId: "room-1",
      transcriptJobId: "job-1",
      summaryNoteId: "summary-1",
      laneId: "client-follow-up",
      status: "APPROVED_FOR_INTERNAL_USE",
      note: "Reviewed for internal use.",
    });
    expect(packetLaneReviewRequest({ packet: { ...packet, room: null }, lane, status: "NEEDS_REVISION" })).toBeNull();
  });
});
