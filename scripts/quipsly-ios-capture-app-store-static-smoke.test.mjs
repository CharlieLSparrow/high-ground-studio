import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readAppStoreMetadata } from "./release/quipsly-capture-app-store-metadata.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = path.join(root, "scripts/quipsly-ios-capture-app-store-static-smoke.mjs");
function run(cwd, summary = true) {
  return spawnSync(process.execPath, [script, ...(summary ? ["--summary"] : [])], {
    cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 30_000,
  });
}

test("actual source-check CLI reports multiple failures and rejects missing input", (t) => {
  const baseline = run(root, false);
  assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
  const report = JSON.parse(baseline.stdout);
  assert.equal(report.ok, true);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-source-check-cli-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const copy = (file) => {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  };
  // Only source/configuration inputs: never copy builds, credentials, or media.
  for (const file of Object.values(report.checked)) copy(file);
  const sourceDirectory = path.dirname(report.checked.appInfoPlist);
  fs.cpSync(path.join(root, sourceDirectory), path.join(fixture, sourceDirectory), {
    recursive: true,
    filter: (source) => fs.statSync(source).isDirectory() || source.endsWith(".swift"),
  });
  const metadata = readAppStoreMetadata();
  copy(metadata.privacy.questionnaireFile);
  copy(metadata.review.notesFile);
  const healthy = run(fixture);
  assert.equal(healthy.status, 0, healthy.stderr || healthy.stdout);
  assert.equal(JSON.parse(healthy.stdout).checkCount, report.checkCount);

  const infoPath = path.join(fixture, report.checked.appInfoPlist);
  fs.writeFileSync(infoPath, fs.readFileSync(infoPath, "utf8")
    .replaceAll("NSMicrophoneUsageDescription", "RemovedMicrophoneDescription")
    .replaceAll("NSCameraUsageDescription", "RemovedCameraDescription"));
  const broken = run(fixture);
  assert.equal(broken.status, 1, broken.stderr);
  const failureReport = JSON.parse(broken.stdout);
  assert.equal(failureReport.ok, false);
  assert.equal(failureReport.checkCount, report.checkCount, "A failure must not hide later checks");
  assert.ok(failureReport.statusCounts.fail >= 2);
  assert.ok(failureReport.failures.some(({ label }) => label === "microphone usage string"));
  assert.ok(failureReport.failures.some(({ label }) => label === "camera usage string required by linked session SDK"));

  fs.unlinkSync(infoPath);
  const missing = run(fixture);
  assert.equal(missing.status, 1);
  const fatalReport = JSON.parse(missing.stderr);
  assert.equal(fatalReport.ok, false);
  assert.equal(fatalReport.file, report.checked.appInfoPlist);
  assert.match(fatalReport.error, /file is missing/);
});
