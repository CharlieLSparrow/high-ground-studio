import { buildSessionSourceClockAttention, type SessionSourceClockAttentionInput, type SessionSourceClockSource } from "./session-source-clock-attention";

const source: SessionSourceClockSource = {
  roomId: "room-1",
  recordingAssetId: "recording-1",
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-9",
  mediaAssetId: "media-1",
  sourceId: "source-1",
  sourceUrl: "/api/ingest/media/source-1",
  sourceKind: "audio",
  label: "Homer local track",
};

function evidence(): SessionSourceClockAttentionInput {
  return {
    transcript: [{
      id: "segment-1", segmentId: "segment-1", source, startSeconds: 12, endSeconds: 15, text: "A provider attempt.", speakerLabel: "Homer", providerConfidence: 0.61, reviewState: "unreviewed",
    }, {
      id: "segment-reviewed", segmentId: "segment-reviewed", source, startSeconds: 16, endSeconds: 17, text: "Already heard.", speakerLabel: null, providerConfidence: 0.4, reviewState: "verified",
    }],
    audibleEvents: [{
      id: "event-1", analysisId: "analysis-1", eventId: "event-1", source, startSeconds: 3, endSeconds: 3.2, displayLabel: "Mouth click", family: "dialogue", detectorConfidence: 0.94, reviewState: "unreviewed", detail: "Classifier suggestion.",
    }, {
      id: "event-dismissed", analysisId: "analysis-1", eventId: "event-dismissed", source, startSeconds: 4, endSeconds: 4.1, displayLabel: "Noise", family: "environment", detectorConfidence: 0.99, reviewState: "false-positive", detail: "Already dismissed.",
    }],
    dialogueRepairs: [{ id: "repair-1", candidateId: "repair-1", source, startSeconds: 7, endSeconds: 7.1, label: "noise-event", reviewState: "unreviewed" }],
    mastery: [{ id: "mastery-1", jobId: "job-1", source, startSeconds: 20, endSeconds: 21, kind: "possible-dropout", severity: "warning", detail: "Decoded low-energy interval.", reviewState: "unreviewed" }],
    edits: [{ id: "edit-1", proposalSetId: "set-1", subjectId: "edit-1", subjectKind: "candidate", source, startSeconds: 30, endSeconds: 32, editKind: "speaker-change", rationale: "Review the camera transition.", heuristicConfidence: "high", reviewState: "proof-watched" }],
  };
}

describe("buildSessionSourceClockAttention", () => {
  it("ranks exact unresolved ranges without merging authority-specific confidence", () => {
    const result = buildSessionSourceClockAttention(evidence());

    expect(result.items.map((item) => item.authority)).toEqual([
      "DIALOGUE_REPAIR",
      "AUDIO_MASTERY",
      "TRANSCRIPT_ATTEMPT",
      "AUDIBLE_EVENT_DETECTOR",
      "EDIT_PROPOSAL",
    ]);
    expect(result.counts).toMatchObject({ total: 5, high: 3, review: 2 });
    expect(result.items.find((item) => item.authority === "TRANSCRIPT_ATTEMPT")?.confidenceLabel).toContain("not measured accuracy");
    expect(result.items.find((item) => item.authority === "AUDIBLE_EVENT_DETECTOR")?.confidenceLabel).toContain("not audibility");
    expect(result.items.find((item) => item.authority === "EDIT_PROPOSAL")?.confidenceLabel).toContain("not a probability");
    expect(result.boundaries).toEqual(expect.objectContaining({ authorityScoresAreNotMerged: true, projectionCreatesNoWorkflowState: true }));
  });

  it("removes playback-reviewed transcript and false-positive detector evidence", () => {
    const result = buildSessionSourceClockAttention(evidence());
    expect(result.items.some((item) => item.id.includes("segment-reviewed"))).toBe(false);
    expect(result.items.some((item) => item.id.includes("event-dismissed"))).toBe(false);
  });

  it("creates stable one-action source, transcript, and Studio locators", () => {
    const result = buildSessionSourceClockAttention(evidence());
    const transcript = result.items.find((item) => item.authority === "TRANSCRIPT_ATTEMPT")!;
    const edit = result.items.find((item) => item.authority === "EDIT_PROPOSAL")!;
    expect(transcript.transcriptHref).toBe("/sessions/room-1?mode=transcript#transcript-segment-segment-1");
    expect(transcript.audioStudioHref).toContain("project=high-ground-odyssey");
    expect(transcript.audioStudioHref).toContain("at=12.000");
    expect(edit.editorHref).toContain("/editor?");
    expect(edit.editorHref).toContain("at=30.000");
  });

  it("fails closed on malformed source ranges", () => {
    const input = evidence();
    input.dialogueRepairs[0]!.endSeconds = input.dialogueRepairs[0]!.startSeconds;
    expect(buildSessionSourceClockAttention(input).items.some((item) => item.authority === "DIALOGUE_REPAIR")).toBe(false);
  });

  it("does not route a coaching source into an unrelated episode Audio Studio", () => {
    const input = evidence();
    input.transcript[0]!.source = { ...source, episodeSlug: null };
    const item = buildSessionSourceClockAttention(input).items.find((candidate) => candidate.authority === "TRANSCRIPT_ATTEMPT");
    expect(item?.audioStudioHref).toBeNull();
    expect(item?.editorHref).toBeNull();
  });

  it("bounds noisy authorities without starving a different evidence system", () => {
    const input = evidence();
    input.transcript = Array.from({ length: 35 }, (_, index) => ({
      id: `segment-${index}`,
      segmentId: `segment-${index}`,
      source,
      startSeconds: index,
      endSeconds: index + 0.5,
      text: `Attempt ${index}`,
      speakerLabel: null,
      providerConfidence: 0.5,
      reviewState: "unreviewed" as const,
    }));
    const result = buildSessionSourceClockAttention(input);
    expect(result.counts.byAuthority.TRANSCRIPT_ATTEMPT).toBe(20);
    expect(result.counts.byAuthority.EDIT_PROPOSAL).toBe(1);
  });

  it("clusters nearby cross-authority evidence into one bounded listening moment without merging its truth", () => {
    const input = evidence();
    input.dialogueRepairs = [];
    input.mastery = [];
    input.edits = [];
    input.audibleEvents[0]!.startSeconds = 13.2;
    input.audibleEvents[0]!.endSeconds = 13.35;
    const result = buildSessionSourceClockAttention(input);
    const moment = result.moments.find((candidate) => candidate.items.some((item) => item.id === "transcript_attempt:segment-1"));

    expect(moment).toMatchObject({
      startSeconds: 10,
      endSeconds: 17,
      severity: "HIGH",
      authorityLabels: ["Transcript attempt", "Audible-event detector"],
    });
    expect(moment?.items.map((item) => item.authority)).toEqual(["TRANSCRIPT_ATTEMPT", "AUDIBLE_EVENT_DETECTOR"]);
    expect(moment?.sharedContextSavingsSeconds).toBeGreaterThan(0);
    expect(result.counts).toMatchObject({ total: 2, moments: 1 });
    expect(result.counts.separateReviewSeconds).toBeGreaterThan(result.counts.estimatedReviewSeconds);
    expect(result.boundaries).toEqual(expect.objectContaining({
      clusteringDoesNotMergeAuthority: true,
      attentionBudgetIsDeterministicEstimate: true,
      downstreamComparisonsAreNotIncluded: true,
    }));
  });

  it("never clusters similar times from different immutable sources", () => {
    const input = evidence();
    input.dialogueRepairs = [];
    input.mastery = [];
    input.edits = [];
    input.audibleEvents[0]!.startSeconds = 13.2;
    input.audibleEvents[0]!.endSeconds = 13.35;
    input.audibleEvents[0]!.source = { ...source, mediaAssetId: "media-2", sourceId: "source-2", label: "Charlie local track" };
    const result = buildSessionSourceClockAttention(input);

    expect(result.moments).toHaveLength(2);
    expect(result.moments.every((moment) => moment.items.length === 1)).toBe(true);
    expect(result.counts.sharedContextSavingsSeconds).toBe(0);
  });

  it("breaks dense evidence chains into reviewable moments no longer than twenty-five seconds", () => {
    const input = evidence();
    input.audibleEvents = [];
    input.dialogueRepairs = [];
    input.mastery = [];
    input.edits = [];
    input.transcript = Array.from({ length: 20 }, (_, index) => ({
      id: `dense-${index}`,
      segmentId: `dense-${index}`,
      source,
      startSeconds: index * 2,
      endSeconds: index * 2 + 1,
      text: `Dense attempt ${index}`,
      speakerLabel: null,
      providerConfidence: 0.5,
      reviewState: "unreviewed" as const,
    }));
    const result = buildSessionSourceClockAttention(input);

    expect(result.items).toHaveLength(20);
    expect(result.moments.length).toBeGreaterThan(1);
    expect(result.moments.every((moment) => moment.endSeconds - moment.startSeconds <= 25)).toBe(true);
    expect(result.moments.flatMap((moment) => moment.items).map((item) => item.id).sort()).toEqual(result.items.map((item) => item.id).sort());
  });

  it("caps a long evidence preview while preserving the exact authority range", () => {
    const result = buildSessionSourceClockAttention({
      transcript: [{ id: "long-segment", segmentId: "long-segment", source, startSeconds: 40, endSeconds: 85, text: "Long uncertain passage", speakerLabel: "Charlie", providerConfidence: 0.6, reviewState: "unreviewed" }],
      audibleEvents: [], dialogueRepairs: [], mastery: [], edits: [],
    });

    expect(result.moments).toHaveLength(1);
    expect(result.moments[0]!.endSeconds - result.moments[0]!.startSeconds).toBe(25);
    expect(result.moments[0]?.contextTruncated).toBe(true);
    expect(result.moments[0]?.items[0]).toEqual(expect.objectContaining({ startSeconds: 40, endSeconds: 85 }));
    expect(result.boundaries.truncatedContextRequiresAuthoritySurface).toBe(true);
  });
});
