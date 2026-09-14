import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {promisify} from "node:util";
import {newSessionRecordingShareJob} from "../packages/quipsly-media-processing/src/session-recording-share.ts";
import {assembleSessionTranscriptProgramClock} from "../apps/quipsly/src/lib/server/session-transcript-assembly.ts";
import {buildSessionRecordingShareFilterGraph, FfmpegSessionRecordingShareRenderer} from "../apps/quipsly-media-processor/src/session-recording-share-ffmpeg.ts";
import {sha256File} from "../apps/quipsly-media-processor/src/transcoder.ts";

const run = promisify(execFile);

test("a mixed measured/reconnect clock renders every track at its canonical position", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-mixed-sync-render-"));
  try {
    const ids = ["mixed_source_coach_0001", "mixed_source_client_0001", "mixed_source_reconnect_0001"];
    const clock = assembleSessionTranscriptProgramClock(ids.map((recordingAssetId, index) => ({
      recordingAssetId, transcriptJobId: `transcript_${recordingAssetId}`, captureGroupId: "mixed_take_0001",
      recordedStartedAt: new Date(Date.parse("2026-09-13T12:00:00Z") + [0, 900, 2400][index]),
    })), {reviewedPlacements: [{alignmentJobId: "mixed_alignment_0001", captureGroupId: "mixed_take_0001",
      spineRecordingAssetId: ids[0], targetRecordingAssetId: ids[1], signedOffsetSeconds: 0.4,
      residualDriftMilliseconds: 1, correctionApplied: false, sourceBytesMutated: false, sampleAccurateClaimed: false}]});
    assert.equal(clock.authority, "mixed-waveform-clock-placement");
    assert.deepEqual(clock.sources.map(source => source.programOffsetSeconds), [0, 0.4, 2.4]);
    const sources = await Promise.all(clock.sources.map(async (source, index) => {
      const objectName = `${source.recordingAssetId}.wav`;
      const locator = path.join(root, objectName);
      await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${[440, 660, 880][index]}:sample_rate=48000:duration=1`, "-ac", "1", locator]);
      return {provider: "local", bucketName: "local", generation: "1", contentType: "audio/wav", objectName, locator,
        sha256: await sha256File(locator), sizeBytes: (await stat(locator)).size, recordingAssetId: source.recordingAssetId,
        participantId: index === 0 ? "mixed_coach_0001" : "mixed_client_0001", participantLabel: index === 0 ? "Coach" : "Client",
        programOffsetSeconds: source.programOffsetSeconds, includeInAudioMix: true};
    }));
    const output = path.join(root, "mixed-share.m4a");
    const job = newSessionRecordingShareJob({jobId: "mixed_share_job_0001", roomId: "mixed_room_0001", outputId: "mixed_output_0001", outputRevision: 1,
      requestedAt: "2026-09-13T12:00:00Z", sourceSetSha256: "a".repeat(64), sources,
      edit: {startSeconds: 0, endSeconds: 3.4, keptRanges: [{id: "mixed_range_0001", startSeconds: 0, endSeconds: 3.4}], transcriptExclusions: [], joinCrossfadeSeconds: 0},
      target: {provider: "local", bucketName: "local", objectName: "mixed-share.m4a", locator: output, contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48000, channels: 2},
    });
    const graph = buildSessionRecordingShareFilterGraph(job);
    assert.match(graph, /adelay=400:all=1/);
    assert.match(graph, /adelay=2400:all=1/);
    const result = await new FfmpegSessionRecordingShareRenderer().render(job, output);
    assert.equal(result.technical.completeDecode, true);
    assert.ok(Math.abs(result.technical.durationSeconds - 3.4) < 0.1);
    const volumeAt = async (seconds) => {
      const decoded = await run("ffmpeg", ["-hide_banner", "-nostdin", "-ss", String(seconds), "-i", output, "-t", "0.3", "-af", "volumedetect", "-f", "null", "-"]);
      return Number(/mean_volume:\s*(-?[0-9.]+) dB/.exec(decoded.stderr)?.[1]);
    };
    assert.ok(await volumeAt(1.7) < -60, "The reconnect must not be pulled into the earlier gap");
    assert.ok(await volumeAt(2.6) > -30, "The reconnect must remain audible at its capture-clock position");
    for (const source of sources) assert.equal(await sha256File(source.locator), source.sha256);
  } finally { await rm(root, {recursive: true, force: true}); }
});
