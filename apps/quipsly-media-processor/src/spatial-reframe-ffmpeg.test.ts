import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { SpatialRenderJob } from "@high-ground/quipsly-media-processing";

import { FfmpegSpatialReframeRenderer, buildSpatialReframeCommandSchedule, sampleSpatialReframe } from "./spatial-reframe-ffmpeg.js";

const execute = promisify(execFile);

const keyframes = [
  { sourceSeconds: 0, panDegrees: 170, tiltDegrees: 4, rollDegrees: 0, fieldOfViewDegrees: 100, interpolation: "ease" as const },
  { sourceSeconds: 1, panDegrees: -170, tiltDegrees: -4, rollDegrees: 2, fieldOfViewDegrees: 72, interpolation: "linear" as const },
];

test("spatial reframe sampling uses smooth easing and the short angle path", () => {
  const middle = sampleSpatialReframe(keyframes, 0.5);
  assert.ok(Math.abs(Math.abs(middle.panDegrees) - 180) < 0.001);
  assert.equal(middle.tiltDegrees, 0);
  assert.equal(middle.fieldOfViewDegrees, 86);
  const schedule = buildSpatialReframeCommandSchedule(keyframes, 0, 1, 24);
  assert.equal(schedule.frameCount, 24);
  assert.equal(schedule.commandCount, 96);
  assert.match(schedule.commands, /quipsly_view yaw/);
  assert.match(schedule.commands, /quipsly_view h_fov/);
});

test("FFmpeg v360 renders a complete frame-commanded flat proof from an equirectangular master", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-spatial-reframe-"));
  const source = path.join(root, "stitched-equirectangular.mp4");
  const output = path.join(root, "reframed-proof.mp4");
  await execute("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=960x480:rate=24:duration=1",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source,
  ]);
  const job = {
    selection: { startSeconds: 0, endSeconds: 1 },
    recipe: { keyframes },
    reframe: { profile: "spatial-proof-720p24" },
  } as SpatialRenderJob;
  const technical = await new FfmpegSpatialReframeRenderer().render(job, source, output);
  assert.equal(technical.width, 1280);
  assert.equal(technical.height, 720);
  assert.equal(technical.fps, 24);
  assert.equal(technical.videoCodec, "h264");
  assert.equal(technical.audioCodec, "aac");
  assert.equal(technical.completeDecode, true);
  assert.equal(technical.commandCount, 96);
  assert.ok((await stat(output)).size > 1_000);
});
