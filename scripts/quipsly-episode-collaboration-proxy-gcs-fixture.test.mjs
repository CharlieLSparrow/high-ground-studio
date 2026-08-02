import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = fs.readFileSync(
  path.join(root, "scripts/release/quipsly-episode-collaboration-proxy-gcs-fixture.mjs"),
  "utf8",
);

test("GCS fixture requires explicit consent before creating isolated objects", () => {
  assert.ok(fixture.includes('process.env.ALLOW_GCS_FIXTURE !== "1"'));
  assert.ok(fixture.indexOf("ALLOW_GCS_FIXTURE") < fixture.indexOf("bucket.upload"));
  assert.ok(fixture.includes("preconditionOpts: { ifGenerationMatch: 0 }"));
});

test("GCS fixture exercises the real local worker without Cloud Build or Cloud Run", () => {
  assert.ok(fixture.includes("processEpisodeCloudProxyQueueObject"));
  assert.ok(fixture.includes("GcsCaptureProxyWorkerStorage"));
  assert.ok(fixture.includes("FfmpegCaptureProxyTranscoder"));
  assert.equal(fixture.includes("gcloud builds"), false);
  assert.equal(fixture.includes("gcloud run jobs execute"), false);
});

test("GCS fixture independently verifies and removes only exact generated objects", () => {
  for (const contract of [
    "downloadExact(sourceObjectName, sourceEvidence.generation)",
    "downloadExact(targetObjectName, result.output.generation)",
    "assertFastStart(outputReadback)",
    "assertTechnical(technical, result.output.metadata)",
    "replayWasCreateOnceNoOp: true",
    "deleteAllExactNameVersions",
    "candidate.name === objectName",
    "ifGenerationMatch: generation",
  ]) {
    assert.ok(fixture.includes(contract), contract);
  }
});
