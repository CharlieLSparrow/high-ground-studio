import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { reviewedSpatialStitchMasterCanonicalJson } from "@high-ground/quipsly-media-processing";

import { ReviewedSpatialStitchMasterError, ReviewedSpatialStitchMasterVerifier } from "./reviewed-spatial-stitch-master.js";

test("seals a full-decode reviewed 5.7K stitch master against unchanged exact INSV bytes", async () => {
  const fixture = await fixtureFiles();
  try {
    const calls: Array<{ command: string; args: string[] }> = [];
    const verifier = new ReviewedSpatialStitchMasterVerifier("ffmpeg-test", "ffprobe-test", async (command, args) => {
      calls.push({ command, args });
      return command === "ffprobe-test"
        ? { stdout: JSON.stringify({ streams: [{ codec_name: "hevc", width: 5760, height: 2880, avg_frame_rate: "24/1" }], format: { duration: "10.000" } }), stderr: "" }
        : { stdout: "", stderr: "" };
    });
    const receipt = await verifier.verifyAndSeal(input(fixture));
    assert.equal(receipt.output.sha256, fixture.outputSha256);
    assert.equal(receipt.output.width, 5760);
    assert.equal(receipt.output.height, 2880);
    assert.equal(receipt.boundaries.exactPackageVerifiedBeforeAndAfter, true);
    assert.equal(receipt.receiptSha256, createHash("sha256").update(reviewedSpatialStitchMasterCanonicalJson(receipt)).digest("hex"));
    assert.deepEqual(calls.map((call) => call.command), ["ffprobe-test", "ffmpeg-test"]);
    assert.ok(calls[1]!.args.includes("-xerror"));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("refuses a reviewed export that does not preserve the complete 5.7K source clock", async () => {
  const fixture = await fixtureFiles();
  try {
    const verifier = new ReviewedSpatialStitchMasterVerifier("ffmpeg-test", "ffprobe-test", async (command) => command === "ffprobe-test"
      ? { stdout: JSON.stringify({ streams: [{ codec_name: "h264", width: 1920, height: 960, avg_frame_rate: "30/1" }], format: { duration: "9.000" } }), stderr: "" }
      : { stdout: "", stderr: "" });
    await assert.rejects(verifier.verifyAndSeal(input(fixture)), (error: unknown) => error instanceof ReviewedSpatialStitchMasterError && error.code === "reviewed-spatial-stitch-output-contract-mismatch");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("refuses source drift that occurs during output verification", async () => {
  const fixture = await fixtureFiles();
  try {
    const verifier = new ReviewedSpatialStitchMasterVerifier("ffmpeg-test", "ffprobe-test", async (command) => {
      if (command === "ffprobe-test") await writeFile(fixture.sourcePath, "changed-insv-bytes");
      return command === "ffprobe-test"
        ? { stdout: JSON.stringify({ streams: [{ codec_name: "hevc", width: 5760, height: 2880, avg_frame_rate: "24/1" }], format: { duration: "10.000" } }), stderr: "" }
        : { stdout: "", stderr: "" };
    });
    await assert.rejects(verifier.verifyAndSeal(input(fixture)), (error: unknown) => error instanceof ReviewedSpatialStitchMasterError && ["reviewed-spatial-stitch-member-byte-mismatch", "reviewed-spatial-stitch-member-unavailable"].includes(error.code));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function fixtureFiles() {
  const root = await mkdtemp(path.join(os.tmpdir(), "quipsly-reviewed-spatial-"));
  const sourcePath = path.join(root, "VID_001.insv");
  const outputPath = path.join(root, "VID_001-stitched.mp4");
  await writeFile(sourcePath, "original-insv-bytes");
  await writeFile(outputPath, "reviewed-stitch-master-bytes");
  const source = await stat(sourcePath);
  return {
    root,
    sourcePath,
    outputPath,
    sourceSizeBytes: source.size,
    sourceSha256: digest("original-insv-bytes"),
    outputSha256: digest("reviewed-stitch-master-bytes"),
  };
}

function input(fixture: Awaited<ReturnType<typeof fixtureFiles>>) {
  return {
    receiptId: "spatialstitchreceipt_test0001",
    clientRequestId: "spatialstitchrequest_test0001",
    projectId: "project_test0001",
    sourceSetId: "sourceset_test0001",
    sourceSetIdentitySha256: "1".repeat(64),
    sourceClockRevisionId: "revision_test0001",
    sourceDurationSeconds: 10,
    sourceFramesPerSecond: 24,
    exactMembers: [{
      sourceRevisionId: "revision_test0001",
      role: "primary-original" as const,
      fileName: "VID_001.insv",
      locator: fixture.sourcePath,
      generation: `sha256:${fixture.sourceSha256}`,
      sha256: fixture.sourceSha256,
      sizeBytes: fixture.sourceSizeBytes,
    }],
    outputPath: fixture.outputPath,
    review: {
      reviewedAt: "2026-08-07T12:00:00.000Z",
      reviewedByUserId: "user_test0001",
      reviewedByEmail: "reviewer@quipsly.test",
      application: "Insta360 Studio" as const,
      applicationVersion: "5.9.9",
      flowStateEnabled: true,
      horizonLockEnabled: true,
      stitchMode: "ai-flow" as const,
      visualPlaybackReviewed: true as const,
    },
  };
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
