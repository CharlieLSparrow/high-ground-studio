import assert from "node:assert/strict";
import test from "node:test";

import {
  newAutomaticEpisodeAudioMixProposal,
  parseEpisodeAudioMixProposal,
  reviseEpisodeAudioMixProposal,
  type EpisodeAudioMixTrack,
} from "@high-ground/quipsly-media-processing";

const source = (assetId: string, suffix: string) => ({ assetId, provider: "local" as const, locator: `/tmp/quipsly/${assetId}.wav`, generation: `sha256:${suffix.repeat(64)}`, sha256: suffix.repeat(64), sizeBytes: 48_000, contentType: "audio/wav" });
const track = (input: Partial<EpisodeAudioMixTrack> & Pick<EpisodeAudioMixTrack, "assetId" | "sourceId" | "title" | "role">): EpisodeAudioMixTrack => ({
  participantId: `participant_${input.assetId}`,
  participantLabel: input.title,
  mixDisposition: "include",
  alignment: "qualified-candidate",
  programOffsetSeconds: 0.2,
  sourceDurationSeconds: 60,
  alignmentEvidenceJobId: `alignment_${input.assetId}`,
  source: source(input.assetId, input.assetId === "asset_primary" ? "a" : "b"),
  ...input,
});

test("automatic mix suggestions attenuate only a uniquely lower-authority reviewed track", () => {
  const proposal = newAutomaticEpisodeAudioMixProposal({
    proposalId: "mix_proposal_0001",
    createdAt: "2026-08-06T12:00:00.000Z",
    projectId: "project_0001",
    episodeProductionId: "episode_0001",
    programFingerprintSha256: "f".repeat(64),
    activeDecisionReceiptIds: ["decision_0002", "decision_0001"],
    tracks: [
      track({ assetId: "asset_primary", sourceId: "source_primary", title: "Charlie MV7i", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, alignmentEvidenceJobId: null }),
      track({ assetId: "asset_scratch", sourceId: "source_scratch", title: "Camera scratch", role: "camera-scratch" }),
    ],
    evidenceReviews: [{ receiptId: "review_0001", analysisReceiptId: "analysis_0001", eventId: "event_0001", decision: "mic-bleed", startSeconds: 12, endSeconds: 15, involvedAssetIds: ["asset_scratch", "asset_primary"], playbackEvidenceSha256: "c".repeat(64) }],
    output: { assetId: "mix_asset_0001", provider: "local", locator: "/tmp/quipsly/mix.wav", contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" },
  });
  assert.equal(proposal.actions.length, 1);
  assert.deepEqual(proposal.actions[0], { id: "mix_action_review_0001_asset_scratch", operation: "gain-envelope", origin: "review-derived", targetAssetId: "asset_scratch", programStartSeconds: 12, programEndSeconds: 15, gainDb: -18, attackMilliseconds: 75, releaseMilliseconds: 150, reason: "mic-bleed", evidenceReviewReceiptIds: ["review_0001"], replacesActionId: null });
  assert.deepEqual(proposal.activeDecisionReceiptIds, ["decision_0001", "decision_0002"]);
  assert.equal(proposal.unresolvedEvents.length, 0);
  assert.equal(parseEpisodeAudioMixProposal(proposal).boundaries.correlationNeverAuthorizesAutomation, true);
  const jsonbRoundTrip = JSON.parse(JSON.stringify(proposal));
  jsonbRoundTrip.boundaries = Object.fromEntries(Object.entries(jsonbRoundTrip.boundaries).reverse());
  assert.equal(parseEpisodeAudioMixProposal(jsonbRoundTrip).proposalId, proposal.proposalId, "JSONB key ordering must not invalidate an exact safety contract");
});

test("ambiguous primary tracks stay unresolved instead of receiving guessed gain", () => {
  const proposal = newAutomaticEpisodeAudioMixProposal({
    proposalId: "mix_proposal_0002", createdAt: "2026-08-06T12:00:00.000Z", projectId: "project_0001", episodeProductionId: "episode_0001", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision_0001"],
    tracks: [track({ assetId: "asset_primary", sourceId: "source_primary", title: "Charlie", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, alignmentEvidenceJobId: null }), track({ assetId: "asset_scratch", sourceId: "source_scratch", title: "Homer", role: "dialogue-primary" })],
    evidenceReviews: [{ receiptId: "review_0002", analysisReceiptId: "analysis_0001", eventId: "event_0002", decision: "confirmed-overlap", startSeconds: 20, endSeconds: 24, involvedAssetIds: ["asset_primary", "asset_scratch"], playbackEvidenceSha256: "d".repeat(64) }],
    output: { assetId: "mix_asset_0002", provider: "local", locator: "/tmp/quipsly/mix-2.wav", contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" },
  });
  assert.equal(proposal.actions.length, 0);
  assert.equal(proposal.unresolvedEvents[0]?.reason, "review-does-not-authorize-gain");
});

test("human adjustments create an immutable revision and reject unsafe gain", () => {
  const parent = newAutomaticEpisodeAudioMixProposal({
    proposalId: "mix_proposal_0003", createdAt: "2026-08-06T12:00:00.000Z", projectId: "project_0001", episodeProductionId: "episode_0001", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision_0001"],
    tracks: [track({ assetId: "asset_primary", sourceId: "source_primary", title: "Charlie", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, alignmentEvidenceJobId: null }), track({ assetId: "asset_scratch", sourceId: "source_scratch", title: "Scratch", role: "camera-scratch" })],
    evidenceReviews: [{ receiptId: "review_0003", analysisReceiptId: "analysis_0001", eventId: "event_0003", decision: "same-participant-redundancy", startSeconds: 30, endSeconds: 33, involvedAssetIds: ["asset_primary", "asset_scratch"], playbackEvidenceSha256: "e".repeat(64) }],
    output: { assetId: "mix_asset_0003", provider: "local", locator: "/tmp/quipsly/mix-3.wav", contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" },
  });
  const revision = reviseEpisodeAudioMixProposal({ proposalId: "mix_proposal_0004", createdAt: "2026-08-06T12:05:00.000Z", parent, edits: [{ actionId: parent.actions[0]!.id, gainDb: -12, attackMilliseconds: 100, releaseMilliseconds: 250 }] });
  assert.equal(revision.parentProposalId, parent.proposalId);
  assert.equal(revision.revision, 2);
  assert.equal(revision.actions[0]?.origin, "human-adjustment");
  assert.equal(revision.actions[0]?.replacesActionId, parent.actions[0]?.id);
  assert.throws(() => reviseEpisodeAudioMixProposal({ proposalId: "mix_proposal_0005", createdAt: "2026-08-06T12:10:00.000Z", parent, edits: [{ actionId: parent.actions[0]!.id, gainDb: 12, attackMilliseconds: 100, releaseMilliseconds: 250 }] }), /out of range/);
});
