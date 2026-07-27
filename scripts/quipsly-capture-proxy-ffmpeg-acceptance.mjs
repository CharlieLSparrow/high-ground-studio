#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  FfmpegCaptureProxyTranscoder,
} from "../apps/quipsly-media-processor/src/transcoder.ts";

const scratch = await mkdtemp(join(tmpdir(), "quipsly-proxy-acceptance-"));
try {
  const source = join(scratch, "portrait-source.mov");
  const output = join(scratch, "collaboration-proxy.mp4");
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=720x1280:rate=30:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  const result = await new FfmpegCaptureProxyTranscoder()
    .transcode(source, output);
  const outputStat = await stat(output);
  assert.equal(result.sizeBytes, outputStat.size);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.technical.videoCodec, "h264");
  assert.equal(result.technical.audioCodec, "aac");
  assert.equal(result.technical.pixelFormat, "yuv420p");
  assert.equal(result.technical.width, 720);
  assert.equal(result.technical.height, 1280);
  assert.equal(result.technical.fastStart, true);
  console.log(JSON.stringify({
    ok: true,
    source: "generated-portrait-mov",
    outputBytes: result.sizeBytes,
    technical: result.technical,
  }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-32_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited ${code}: ${stderr}`));
    });
  });
}
