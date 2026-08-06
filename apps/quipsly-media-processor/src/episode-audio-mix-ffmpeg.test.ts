import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { newAutomaticEpisodeAudioMixProposal, type EpisodeAudioMixTrack } from "@high-ground/quipsly-media-processing";

import { buildEpisodeAudioMixFilterGraph, FfmpegEpisodeAudioMixRenderer } from "./episode-audio-mix-ffmpeg.js";
import { sha256File } from "./transcoder.js";

const run = promisify(execFile);

test("FFmpeg renders aligned exact sources with reviewed gain automation to a verified stereo float preview", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-mix-test-"));
  try {
    const primaryPath = path.join(root, "primary.wav");
    const scratchPath = path.join(root, "scratch.wav");
    const outputPath = path.join(root, "mix.wav");
    await Promise.all([
      run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ar", "48000", "-c:a", "pcm_s24le", primaryPath]),
      run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-ar", "48000", "-c:a", "pcm_s24le", scratchPath]),
    ]);
    const [primaryStat, scratchStat, primarySha, scratchSha] = await Promise.all([stat(primaryPath), stat(scratchPath), sha256File(primaryPath), sha256File(scratchPath)]);
    const common = { participantId: "participant_0001", participantLabel: "Speaker", mixDisposition: "include" as const, sourceDurationSeconds: 2 };
    const tracks: EpisodeAudioMixTrack[] = [
      { ...common, assetId: "asset_primary", sourceId: "source_primary", title: "Primary", role: "dialogue-primary", alignment: "program-clock", programOffsetSeconds: 0, alignmentEvidenceJobId: null, source: { assetId: "asset_primary", provider: "local", locator: primaryPath, generation: `sha256:${primarySha}`, sha256: primarySha, sizeBytes: primaryStat.size, contentType: "audio/wav" } },
      { ...common, assetId: "asset_scratch", sourceId: "source_scratch", title: "Scratch", role: "camera-scratch", alignment: "qualified-candidate", programOffsetSeconds: 0.1, alignmentEvidenceJobId: "alignment_0001", source: { assetId: "asset_scratch", provider: "local", locator: scratchPath, generation: `sha256:${scratchSha}`, sha256: scratchSha, sizeBytes: scratchStat.size, contentType: "audio/wav" } },
    ];
    const proposal = newAutomaticEpisodeAudioMixProposal({ proposalId: "mix_proposal_ffmpeg", createdAt: "2026-08-06T12:00:00.000Z", projectId: "project_0001", episodeProductionId: "episode_0001", programFingerprintSha256: "f".repeat(64), activeDecisionReceiptIds: ["decision_0001"], tracks, evidenceReviews: [{ receiptId: "review_0001", analysisReceiptId: "analysis_0001", eventId: "event_0001", decision: "mic-bleed", startSeconds: 0.5, endSeconds: 1.2, involvedAssetIds: ["asset_primary", "asset_scratch"], playbackEvidenceSha256: "c".repeat(64) }], output: { assetId: "mix_asset_ffmpeg", provider: "local", locator: outputPath, contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-preview", masteryProfileId: "apple-podcasts-dialogue-v1" }, baselineOutput: { assetId: "mix_baseline_ffmpeg", provider: "local", locator: path.join(root, "baseline.wav"), contentType: "audio/wav", codec: "pcm_s24le", sampleRateHz: 48_000, channelCount: 2, variantKind: "episode-mix-baseline", masteryProfileId: "apple-podcasts-dialogue-v1" } });
    const graph = buildEpisodeAudioMixFilterGraph(proposal);
    assert.match(graph.filterComplex, /adelay=100:all=1/);
    assert.match(graph.filterComplex, /volume='/);
    const baselineGraph = buildEpisodeAudioMixFilterGraph({ ...proposal, actions: [] });
    assert.doesNotMatch(baselineGraph.filterComplex, /volume='/);
    const result = await new FfmpegEpisodeAudioMixRenderer().renderUnmasteredPreview({ proposal, sourcePathsByAssetId: new Map([["asset_primary", primaryPath], ["asset_scratch", scratchPath]]), outputPath });
    assert.equal(result.channels, 2);
    assert.equal(result.sampleRateHz, 48_000);
    assert.equal(result.exactSourcesVerifiedBeforeAndAfter, true);
    assert.ok(Math.abs(result.durationSeconds - 2.1) < 0.05);
    assert.ok(result.sizeBytes > 100_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
