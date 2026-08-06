import { buildEpisodeAudioProgram } from "./episode-audio-program";
import type { EpisodeAudioProcessingEvidence } from "./episode-audio-processing-evidence";

const emptyProcessing: EpisodeAudioProcessingEvidence = {
  signal: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, durationSeconds: null, signalStatus: null, observationCount: 0 },
  transcript: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, transcriptJobId: null, segmentCount: 0, wordCount: 0, timedWordCount: 0 },
  alignment: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, spineAssetId: null, qualifiedForReview: null, openingOffsetSeconds: null, residualDriftMilliseconds: null },
  mastery: { jobId: null, status: "not-queued", integrityVerified: false, error: null, updatedAt: null, action: null, sourcePassesProfile: null, previewVerified: false },
};

function source(input: {
  id: string;
  role: string;
  participantId?: string;
  held?: boolean;
  processing?: EpisodeAudioProcessingEvidence;
  deliveryApproved?: boolean;
}) {
  return {
    id: input.id,
    sourceId: `source-${input.id}`,
    originalName: `${input.id}.wav`,
    kind: "audio",
    contentType: "audio/wav",
    importRole: input.role,
    unresolvedRecordingReference: false,
    syncStatus: input.role.includes("spine") ? "spine" : "pending",
    recording: {
      participantId: input.participantId ?? null,
      readiness: { mediaProcessingReleased: !input.held },
    },
    asset: {
      duration: 90,
      readiness: { sourceSafe: true },
      audioProcessingEvidence: input.processing ?? emptyProcessing,
      audioDeliveryArtifact: input.deliveryApproved ? { readiness: { proofListenApproved: true } } : null,
    },
  };
}

describe("buildEpisodeAudioProgram", () => {
  it("projects multi-device participant sources without guessing their identity or mixing them", () => {
    const completeProcessing = {
      ...emptyProcessing,
      signal: { ...emptyProcessing.signal, jobId: "signal-1", status: "completed" as const, integrityVerified: true, durationSeconds: 90, signalStatus: "signal-present" as const, observationCount: 2 },
      transcript: { ...emptyProcessing.transcript, jobId: "transcript-process-1", status: "completed" as const, integrityVerified: true, transcriptJobId: "transcript-1", segmentCount: 12, wordCount: 240, timedWordCount: 240 },
      alignment: { ...emptyProcessing.alignment, jobId: "align-1", status: "completed" as const, integrityVerified: true, spineAssetId: "charlie-mic", qualifiedForReview: true, openingOffsetSeconds: 0.17, residualDriftMilliseconds: 2.1 },
      mastery: { ...emptyProcessing.mastery, jobId: "mastery-1", status: "completed" as const, integrityVerified: true, action: "render-loudness-master" as const, sourcePassesProfile: false, previewVerified: true },
    };
    const program = buildEpisodeAudioProgram({
      importedMedia: [
        source({ id: "homer-mic", role: "phone-audio", participantId: "homer", processing: completeProcessing, deliveryApproved: true }),
        source({ id: "homer-camera", role: "camera-video", participantId: "homer" }),
        source({ id: "charlie-mic", role: "spine-audio", participantId: "charlie" }),
      ],
    });

    expect(program.summary).toMatchObject({ retainedTrackCount: 3, dialogueTrackCount: 3, multiDeviceGroupCount: 1, finishedTrackCount: 1 });
    expect(program.groups).toContainEqual({ key: "participant:homer", label: "Participant homer", trackCount: 2, multiDevice: true });
    expect(program.tracks.find((track) => track.assetId === "homer-mic")?.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "align", state: "ready" }),
      expect.objectContaining({ id: "understand", state: "ready", detail: expect.stringContaining("240 timed words") }),
      expect.objectContaining({ id: "finish", state: "ready" }),
    ]));
    expect(program.boundaries).toMatchObject({ noMixRendered: true, noTimelinePlacementApplied: true, sourcesRemainImmutable: true });
  });

  it("ranks held dialogue ahead of downstream finishing work", () => {
    const program = buildEpisodeAudioProgram({
      importedMedia: [
        source({ id: "held-dialogue", role: "phone-audio", participantId: "guest", held: true }),
        source({ id: "reference", role: "reference-clip" }),
      ],
    });

    expect(program.summary.heldTrackCount).toBe(1);
    expect(program.nextAttention?.assetId).toBe("held-dialogue");
    expect(program.nextAttention?.attentionReason).toMatch(/^Preserve:/);
  });

  it("keeps unassigned media explicit instead of inferring a speaker from its filename", () => {
    const program = buildEpisodeAudioProgram({ importedMedia: [source({ id: "charlie-sounding-filename", role: "mystery" })] });
    expect(program.tracks[0]).toMatchObject({ kind: "unknown", participantId: null, groupKey: "source:source-charlie-sounding-filename" });
  });

  it("does not promote a spine candidate into the canonical program clock", () => {
    const program = buildEpisodeAudioProgram({ importedMedia: [source({ id: "candidate", role: "spine-audio-candidate" })] });
    expect(program.summary.alignedTrackCount).toBe(0);
    expect(program.tracks[0].stages.find((stage) => stage.id === "align")).toMatchObject({
      state: "not-started",
      detail: "No reviewed shared-clock evidence yet",
    });
  });
});
