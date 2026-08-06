import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("impact scan preserves source and emits correctly ranked listening-only candidates", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "quipsly-dialogue-impact-scan-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "source.wav");
  const outputPath = path.join(root, "review-packet");
  await mkdir(outputPath, { recursive: true });
  await exec("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i",
    "aevalsrc=0.03*sin(2*PI*220*t)+if(lt(abs(t-0.7)\\,0.00002)\\,0.95\\,0)+if(lt(abs(t-2.1)\\,0.00002)\\,0.45\\,0):s=48000:d=3",
    "-c:a", "pcm_s24le", sourcePath,
  ]);
  const before = await fileSha256(sourcePath);
  const { stdout } = await exec(process.execPath, [
    "--experimental-strip-types",
    "--import", "./scripts/register-ts-extension-loader.mjs",
    "scripts/quipsly-dialogue-repair-impact-scan.mjs",
    "--source", sourcePath,
    "--output", outputPath,
    "--actor-email", "impact-scan@example.test",
    "--asset-id", "asset_impact_scan_test_001",
    "--maximum-candidates", "2",
    "--minimum-separation-seconds", "0.5",
  ], { cwd: repositoryRoot });
  const operation = JSON.parse(stdout);
  assert.equal(operation.ok, true);
  assert.equal(operation.candidateCount, 2);
  assert.equal(await fileSha256(sourcePath), before);
  const manifest = JSON.parse(await readFile(operation.manifestPath, "utf8"));
  assert.equal(manifest.boundaries.originalSourceBytesPreserved, true);
  assert.equal(manifest.boundaries.noTreatmentPreviewCreated, true);
  assert.equal(manifest.boundaries.noReviewReceiptCreated, true);
  assert.equal(manifest.detector.qualificationStatus, "unqualified");
  assert.equal(manifest.detector.completeSourceDecode, true);
  assert.equal(manifest.detector.completeTreatmentDecode, true);
  const byRank = [...manifest.candidates].sort((left, right) => left.rankByTreatmentImpact - right.rankByTreatmentImpact);
  assert.deepEqual(byRank.map((candidate) => candidate.rankByTreatmentImpact), [1, 2]);
  assert.equal(byRank[0].candidate.origin.score, 1);
  assert.ok(Math.abs(byRank[0].candidate.range.startSeconds - 0.7) < 0.1, `expected strongest impulse near 0.7s, got ${byRank[0].candidate.range.startSeconds}`);
  assert.ok(Math.abs(byRank[1].candidate.range.startSeconds - 2.1) < 0.1, `expected second impulse near 2.1s, got ${byRank[1].candidate.range.startSeconds}`);
  const artifacts = await readdir(outputPath);
  assert.equal(artifacts.filter((name) => name.endsWith("-source-context.wav")).length, 2);
  assert.equal(artifacts.filter((name) => name.endsWith("-source-spectrum.png")).length, 2);
  assert.equal(artifacts.some((name) => /treatment|candidate-preview/.test(name)), false);
});

async function fileSha256(filePath) {
  const { stdout } = await exec("shasum", ["-a", "256", filePath]);
  return stdout.trim().split(/\s+/)[0];
}
