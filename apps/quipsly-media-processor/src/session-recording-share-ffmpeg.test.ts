import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { newSessionRecordingShareJob, type SessionRecordingShareResult } from "@high-ground/quipsly-media-processing";

import { buildSessionRecordingShareFilterGraph, FfmpegSessionRecordingShareRenderer } from "./session-recording-share-ffmpeg.js";
import { runOneLocalSessionRecordingShareJob } from "./local-session-recording-share-worker.js";
import { sha256File } from "./transcoder.js";

const run = promisify(execFile);

test("Session recording share FFmpeg recipe aligns exact sources and trims one common window", () => {
    const base = {
      provider: "local" as const,
      bucketName: "quipsly-local-development-vault",
      objectName: "mobile/source.webm",
      locator: "/tmp/quipsly/source.webm",
      generation: "1",
      sha256: "a".repeat(64),
      sizeBytes: 1_000,
      contentType: "audio/webm",
    };
    const job = newSessionRecordingShareJob({
      jobId: "share_job_0001",
      roomId: "session_room_0001",
      outputId: "session_output_0001",
      outputRevision: 1,
      requestedAt: "2026-08-19T23:45:00.000Z",
      sourceSetSha256: "b".repeat(64),
      edit: { startSeconds: 2.5, endSeconds: 12.5 },
      sources: [
        { ...base, recordingAssetId: "recording_asset_0001", participantId: "participant_0001", participantLabel: "Coach", programOffsetSeconds: 0 },
        { ...base, objectName: "mobile/client.webm", locator: "/tmp/quipsly/client.webm", recordingAssetId: "recording_asset_0002", participantId: "participant_0002", participantLabel: "Client", programOffsetSeconds: 0.375 },
      ],
      target: { provider: "local", bucketName: base.bucketName, objectName: "session-exports/output.m4a", locator: "/tmp/quipsly/output.m4a", contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
    });
    const graph = buildSessionRecordingShareFilterGraph(job);
    assert.match(graph, /adelay=0:all=1/);
    assert.match(graph, /adelay=375:all=1/);
    assert.match(graph, /atrim=start=2\.5:end=12\.5/);
    assert.match(graph, /amix=inputs=2/);
    assert.match(graph, /loudnorm=I=-16:TP=-1\.5:LRA=11/);
});

test("FFmpeg renders a verified aligned Session share without mutating sources", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-session-share-"));
  try {
    const coach = path.join(root, "coach.wav");
    const client = path.join(root, "client.wav");
    const output = path.join(root, "share.m4a");
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ar", "48000", "-ac", "1", coach]);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:duration=2.75", "-ar", "48000", "-ac", "1", client]);
    const [coachStat, clientStat] = await Promise.all([stat(coach), stat(client)]);
    const [coachSha, clientSha] = await Promise.all([sha256File(coach), sha256File(client)]);
    const base = { provider: "local" as const, bucketName: "quipsly-local-development-vault", generation: "1", contentType: "audio/wav" };
    const job = newSessionRecordingShareJob({
      jobId: "share_job_render_0001",
      roomId: "session_room_render_0001",
      outputId: "session_output_render_0001",
      outputRevision: 1,
      requestedAt: "2026-08-19T23:45:00.000Z",
      sourceSetSha256: "c".repeat(64),
      edit: { startSeconds: 0.25, endSeconds: 2.5 },
      sources: [
        { ...base, recordingAssetId: "recording_asset_render_0001", participantId: "participant_render_0001", participantLabel: "Coach", objectName: "coach.wav", locator: coach, sha256: coachSha, sizeBytes: coachStat.size, programOffsetSeconds: 0 },
        { ...base, recordingAssetId: "recording_asset_render_0002", participantId: "participant_render_0002", participantLabel: "Client", objectName: "client.wav", locator: client, sha256: clientSha, sizeBytes: clientStat.size, programOffsetSeconds: 0.25 },
      ],
      target: { provider: "local", bucketName: base.bucketName, objectName: "share.m4a", locator: output, contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
    });
    const rendered = await new FfmpegSessionRecordingShareRenderer().render(job, output);
    assert.ok(rendered.bytes.length > 1_000);
    assert.match(rendered.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Math.abs(rendered.technical.durationSeconds - 2.25) <= 0.25);
    assert.equal(rendered.technical.completeDecode, true);
    assert.equal(await sha256File(coach), coachSha);
    assert.equal(await sha256File(client), clientSha);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local worker recovers an exact durable render after losing its database claim", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-session-share-recovery-"));
  try {
    const coach = path.join(root, "coach.wav");
    const client = path.join(root, "client.wav");
    const output = path.join(root, "session-exports", "share.m4a");
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ar", "48000", "-ac", "1", coach]);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-ar", "48000", "-ac", "1", client]);
    const [coachStat, clientStat, coachSha, clientSha] = await Promise.all([stat(coach), stat(client), sha256File(coach), sha256File(client)]);
    const job = newSessionRecordingShareJob({
      jobId: "share_recovery_job_0001",
      roomId: "share_recovery_room_0001",
      outputId: "share_recovery_output_0001",
      outputRevision: 1,
      requestedAt: "2026-08-19T23:45:00.000Z",
      sourceSetSha256: "d".repeat(64),
      edit: { startSeconds: 0, endSeconds: 1.5 },
      sources: [
        { provider: "local", bucketName: "local", generation: "1", contentType: "audio/wav", objectName: "coach.wav", locator: coach, sha256: coachSha, sizeBytes: coachStat.size, recordingAssetId: "recovery_asset_coach", participantId: "recovery_participant_coach", participantLabel: "Coach", programOffsetSeconds: 0 },
        { provider: "local", bucketName: "local", generation: "1", contentType: "audio/wav", objectName: "client.wav", locator: client, sha256: clientSha, sizeBytes: clientStat.size, recordingAssetId: "recovery_asset_client", participantId: "recovery_participant_client", participantLabel: "Client", programOffsetSeconds: 0.1 },
      ],
      target: { provider: "local", bucketName: "local", objectName: "session-exports/share.m4a", locator: output, contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
    });
    const claim = { id: job.jobId, inputJson: job, resultJson: null };
    const options = { executionId: "execution_recovery_0001", buildId: "test", imageDigest: null, localMediaRoot: root, leaseMs: 60_000, now: () => new Date("2026-08-19T23:46:00.000Z") };
    const first = await runOneLocalSessionRecordingShareJob({ claim: async () => claim, complete: async () => false, fail: async (input) => { throw new Error(`unexpected failure: ${input.code}`); } }, new FfmpegSessionRecordingShareRenderer(), options);
    assert.equal(first.disposition, "claim-lost");
    let completedResult: SessionRecordingShareResult | undefined;
    const second = await runOneLocalSessionRecordingShareJob({ claim: async () => claim, complete: async (input) => { completedResult = input.result; return true; }, fail: async (input) => { throw new Error(`unexpected failure: ${input.code}`); } }, new FfmpegSessionRecordingShareRenderer(), options);
    assert.equal(second.disposition, "completed");
    assert.equal("recovered" in second && second.recovered, true);
    assert.ok(completedResult);
    assert.equal(completedResult.output.sha256, await sha256File(output));
    assert.equal(await sha256File(coach), coachSha);
    assert.equal(await sha256File(client), clientSha);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
