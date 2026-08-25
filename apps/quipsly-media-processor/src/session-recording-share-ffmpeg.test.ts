import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { newSessionRecordingShareJob, type SessionRecordingShareResult } from "@high-ground/quipsly-media-processing";

import { buildSessionRecordingShareFilterGraph, buildSessionRecordingShareVideoFilterGraph, FfmpegSessionRecordingShareRenderer } from "./session-recording-share-ffmpeg.js";
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
      edit: { startSeconds: 2.5, endSeconds: 12.5, keptRanges: [{ id: "kept_range_0001", startSeconds: 2.5, endSeconds: 12.5 }], transcriptExclusions: [], joinCrossfadeSeconds: 0 },
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

test("Session recording share FFmpeg recipe joins transcript cuts with a short crossfade", () => {
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
    jobId: "share_job_text_edit_0001",
    roomId: "session_room_text_edit_0001",
    outputId: "session_output_text_edit_0001",
    outputRevision: 1,
    requestedAt: "2026-08-19T23:45:00.000Z",
    sourceSetSha256: "b".repeat(64),
    edit: {
      startSeconds: 0,
      endSeconds: 12,
      keptRanges: [
        { id: "kept_range_text_0001", startSeconds: 0, endSeconds: 4 },
        { id: "kept_range_text_0002", startSeconds: 7, endSeconds: 12 },
      ],
      transcriptExclusions: [],
      joinCrossfadeSeconds: 0.01,
    },
    sources: [{ ...base, recordingAssetId: "recording_asset_text_0001", participantId: "participant_text_0001", participantLabel: "Coach", programOffsetSeconds: 0 }],
    target: { provider: "local", bucketName: base.bucketName, objectName: "session-exports/output.m4a", locator: "/tmp/quipsly/output.m4a", contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
  });
  const graph = buildSessionRecordingShareFilterGraph(job);
  assert.match(graph, /asplit=2/);
  assert.match(graph, /atrim=start=0:end=4/);
  assert.match(graph, /atrim=start=7:end=12/);
  assert.match(graph, /acrossfade=d=0\.01:c1=tri:c2=tri/);
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
      edit: {
        startSeconds: 0.25,
        endSeconds: 2.5,
        keptRanges: [
          { id: "kept_range_render_0001", startSeconds: 0.25, endSeconds: 1 },
          { id: "kept_range_render_0002", startSeconds: 1.5, endSeconds: 2.5 },
        ],
        transcriptExclusions: [],
        joinCrossfadeSeconds: 0.01,
      },
      sources: [
        { ...base, recordingAssetId: "recording_asset_render_0001", participantId: "participant_render_0001", participantLabel: "Coach", objectName: "coach.wav", locator: coach, sha256: coachSha, sizeBytes: coachStat.size, programOffsetSeconds: 0 },
        { ...base, recordingAssetId: "recording_asset_render_0002", participantId: "participant_render_0002", participantLabel: "Client", objectName: "client.wav", locator: client, sha256: clientSha, sizeBytes: clientStat.size, programOffsetSeconds: 0.25 },
      ],
      target: { provider: "local", bucketName: base.bucketName, objectName: "share.m4a", locator: output, contentType: "audio/mp4", codec: "aac-lc", sampleRateHz: 48_000, channels: 2 },
    });
    const rendered = await new FfmpegSessionRecordingShareRenderer().render(job, output);
    assert.ok(rendered.sizeBytes > 1_000);
    assert.match(rendered.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Math.abs(rendered.technical.durationSeconds - 1.74) <= 0.25);
    assert.equal(rendered.technical.completeDecode, true);
    assert.equal(await sha256File(coach), coachSha);
    assert.equal(await sha256File(client), clientSha);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("FFmpeg renders a verified 24 fps video share from one exact camera and one audio source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-session-video-share-"));
  try {
    const camera = path.join(root, "camera.mp4");
    const microphone = path.join(root, "microphone.wav");
    const output = path.join(root, "share.mp4");
    await run("ffmpeg", [
      "-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=3",
      "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", camera,
    ]);
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-ac", "1", microphone]);
    const [cameraStat, microphoneStat, cameraSha, microphoneSha] = await Promise.all([
      stat(camera), stat(microphone), sha256File(camera), sha256File(microphone),
    ]);
    const job = newSessionRecordingShareJob({
      jobId: "share_video_job_0001",
      roomId: "share_video_room_0001",
      outputId: "share_video_output_0001",
      outputRevision: 1,
      requestedAt: "2026-08-25T22:00:00.000Z",
      sourceSetSha256: "f".repeat(64),
      edit: {
        startSeconds: 0.25,
        endSeconds: 2.75,
        keptRanges: [
          { id: "share_video_range_0001", startSeconds: 0.25, endSeconds: 1.25 },
          { id: "share_video_range_0002", startSeconds: 1.75, endSeconds: 2.75 },
        ],
        transcriptExclusions: [],
        joinCrossfadeSeconds: 0.01,
      },
      sources: [
        { provider: "local", bucketName: "local", objectName: "camera.mp4", locator: camera, generation: "1", sha256: cameraSha, sizeBytes: cameraStat.size, contentType: "video/mp4", recordingAssetId: "share_video_camera_0001", participantId: "share_video_participant_0001", participantLabel: "Coach camera", programOffsetSeconds: 0, includeInAudioMix: false },
        { provider: "local", bucketName: "local", objectName: "microphone.wav", locator: microphone, generation: "1", sha256: microphoneSha, sizeBytes: microphoneStat.size, contentType: "audio/wav", recordingAssetId: "share_video_microphone_0001", participantId: "share_video_participant_0001", participantLabel: "Coach microphone", programOffsetSeconds: 0, includeInAudioMix: true },
      ],
      target: { provider: "local", bucketName: "local", objectName: "share.mp4", locator: output, mediaKind: "video", contentType: "video/mp4", videoCodec: "h264", audioCodec: "aac-lc", widthPixels: 1920, heightPixels: 1080, frameRate: 24, sampleRateHz: 48_000, channels: 2, primaryVideoRecordingAssetId: "share_video_camera_0001" },
    });
    const graph = buildSessionRecordingShareVideoFilterGraph(job);
    assert.match(graph, /\[0:v:0\]fps=24/);
    assert.match(graph, /amix=inputs=1/);
    assert.doesNotMatch(graph, /\[0:a:0\]aresample/);
    const rendered = await new FfmpegSessionRecordingShareRenderer().render(job, output);
    assert.equal(rendered.technical.mediaKind, "video");
    if (rendered.technical.mediaKind !== "video") assert.fail("Expected video technical evidence.");
    assert.equal(rendered.technical.videoCodec, "h264");
    assert.equal(rendered.technical.frameRate, 24);
    assert.ok(Math.abs(rendered.technical.durationSeconds - 1.99) <= 0.25);
    assert.equal(await sha256File(camera), cameraSha);
    assert.equal(await sha256File(microphone), microphoneSha);
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
      edit: { startSeconds: 0, endSeconds: 1.5, keptRanges: [{ id: "kept_range_recovery_0001", startSeconds: 0, endSeconds: 1.5 }], transcriptExclusions: [], joinCrossfadeSeconds: 0 },
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
