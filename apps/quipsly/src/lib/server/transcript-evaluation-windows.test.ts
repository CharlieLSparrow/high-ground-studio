import { createHash } from "node:crypto";

import { transcriptEvaluationReadiness } from "./transcript-evaluation-windows";

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function evidence(): { room: any; job: any } {
  const providerText = "Welcome to a real playback reviewed episode.";
  const reviewedAt = new Date("2026-08-03T18:00:00.000Z");
  const room = {
    purpose: "PODCAST",
    createdByUserId: "user-1",
    participants: [{ id: "participant-1", userId: "user-1", role: "HOST" }],
    recordingConsents: [{
      id: "consent-1",
      participantId: "participant-1",
      userId: "user-1",
      status: "GRANTED",
      policyVersion: "capture-v1",
      canRecordAudio: true,
      canRecordVideo: true,
      canTranscribe: true,
      consentedAt: reviewedAt,
      revokedAt: null,
      metadataJson: {},
      updatedAt: reviewedAt,
    }],
  };
  const job = {
    id: "job-1",
    sourceSha256: "a".repeat(64),
    asset: { id: "asset-1", durationSeconds: 60, checksum: "a".repeat(64) },
    speakerAttributions: [],
    evaluationWindows: [],
    segments: [{
      id: "segment-1",
      speakerLabel: "Speaker 1",
      startSeconds: 0,
      endSeconds: 60,
      text: providerText,
      words: [
        { id: "word-1", punctuatedWord: "Welcome", startSeconds: 0.2, endSeconds: 0.6, speakerLabel: "Speaker 1", channel: 0 },
        { id: "word-2", punctuatedWord: "episode.", startSeconds: 1, endSeconds: 1.4, speakerLabel: "Speaker 1", channel: 0 },
      ],
      corrections: [],
      verifications: [{
        id: "verification-1",
        reviewKind: "confirmed-as-is",
        providerTextSha256: sha(providerText),
        providerSpeakerLabel: "Speaker 1",
        createdAt: reviewedAt,
      }],
    }],
  };
  return { room, job };
}

describe("transcriptEvaluationReadiness", () => {
  const actor = { id: "user-1", email: "reviewer@example.com", isStaff: false };
  const playback = { sourceId: "source-1", recordingAssetId: "asset-1" };

  it("requires complete playback review and immutable source and consent evidence", () => {
    const { room, job } = evidence();
    const ready = transcriptEvaluationReadiness({ room, job, actor, gateAllowed: true, playback });
    expect(ready).toMatchObject({
      eligible: true,
      canApprove: true,
      suggestedWorkload: "podcast",
      reviewedSegmentCount: 1,
      totalSegmentCount: 1,
      referenceWordCount: 2,
      timingEvidenceWordCount: 2,
      sourceSha256: "a".repeat(64),
      boundaries: {
        providerTranscriptImmutable: true,
        appendOnlyWindow: true,
        providerInvocation: false,
        transcriptTextExcludedFromPublicProjection: true,
      },
    });
    expect(ready.consentVersionSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when release, review, source, playback, or duration is incomplete", () => {
    const { room, job } = evidence();
    room.recordingConsents = [];
    job.asset.durationSeconds = 181;
    job.asset.checksum = "b".repeat(64);
    job.segments[0].verifications = [];
    const blocked = transcriptEvaluationReadiness({ room, job, actor, gateAllowed: false, playback: null });
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockers.map((value) => value.code)).toEqual(expect.arrayContaining([
      "TRANSCRIPT_RELEASE_REQUIRED",
      "PLAYBACK_REQUIRED",
      "WINDOW_DURATION_REQUIRED",
      "SOURCE_SHA_REQUIRED",
      "COMPLETE_PLAYBACK_REVIEW_REQUIRED",
      "REFERENCE_WORDS_REQUIRED",
    ]));
  });

  it("projects frozen windows without transcript or provider text", () => {
    const { room, job } = evidence();
    job.evaluationWindows = [{
      id: "window-1",
      workload: "podcast",
      conditionsJson: ["normal-exchange"],
      sourceStartSeconds: 0,
      sourceEndSeconds: 60,
      sourceDurationSeconds: 60,
      sourceSha256: "a".repeat(64),
      consentVersionSha256: "c".repeat(64),
      referenceRevisionId: "reviewed-reference-example",
      referenceContentSha256: "d".repeat(64),
      referenceWordsJson: [{ text: "private transcript text" }],
      providerSnapshotJson: { rawTranscript: "private provider text" },
      approvedAt: new Date("2026-08-03T18:30:00.000Z"),
    }];
    const projected = transcriptEvaluationReadiness({ room, job, actor, gateAllowed: true, playback });
    expect(projected.approvedWindows[0]).toMatchObject({ id: "window-1", referenceWordCount: 1 });
    expect(JSON.stringify(projected.approvedWindows)).not.toContain("private transcript text");
    expect(JSON.stringify(projected.approvedWindows)).not.toContain("private provider text");
  });
});
