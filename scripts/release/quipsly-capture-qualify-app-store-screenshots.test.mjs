import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { qualifyScreenshots } from "./quipsly-capture-qualify-app-store-screenshots.mjs";

const revision = "a".repeat(40);
const canonicalMetadataPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../release/app-store/quipsly-capture/en-US.json",
);

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-screenshot-qualifier-"));
  const metadataPath = path.join(directory, "metadata.json");
  const draftReceiptPath = path.join(directory, "draft.json");
  const committedSourceReceiptPath = path.join(directory, "committed.json");
  const candidateReceiptPath = path.join(directory, "candidate.json");
  const visualInspectionPath = path.join(directory, "inspection.json");
  const screenshotPath = path.join(directory, "01-today.png");
  const bytes = Buffer.from("candidate-bound-screenshot");
  fs.writeFileSync(screenshotPath, bytes);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const metadata = JSON.parse(fs.readFileSync(canonicalMetadataPath, "utf8"));
  metadata.screenshots.planned = [
    { order: 1, filename: "01-today.png", width: 1320, height: 2868, headline: "Today", story: "Today", status: "pending" },
  ];
  writeJson(metadataPath, metadata);
  writeJson(draftReceiptPath, {
    schema: "quipsly-capture-app-store-draft-screenshots-v1", sourceRevision: revision,
    sourceDirty: false, sourceIsolation: "detached-worktree", submissionEligible: false,
    device: { displayType: "APP_IPHONE_67", class: "iPhone 6.9-inch" },
    screenshots: [{ order: 1, filename: "01-today.png", width: 1320, height: 2868, bytes: bytes.length, sha256: digest, draftPath: screenshotPath }],
  });
  writeJson(committedSourceReceiptPath, {
    schema: "quipsly-capture-committed-screenshot-evidence-v1", sourceRevision: revision,
    sourceDirty: false, sourceIsolation: "detached-worktree", draftReceiptPath,
    expectedScreenshotCount: 1, screenshotCount: 1,
  });
  writeJson(candidateReceiptPath, {
    schema: "quipsly-capture-release-receipt-v1", sourceRevision: revision,
    sourceIsolation: "detached-worktree", candidateQualified: true, deterministicUITestPerformed: true,
    version: "1.0", build: "35", ipaSHA256: "b".repeat(64),
  });
  writeJson(visualInspectionPath, {
    schema: "quipsly-capture-app-store-visual-inspection-v1", sourceRevision: revision,
    inspectedAt: "2026-08-27T03:00:00.000Z", result: "pass", issues: [],
    screenshots: [{ filename: "01-today.png", sha256: digest }],
  });
  return { directory, metadataPath, draftReceiptPath, committedSourceReceiptPath, candidateReceiptPath, visualInspectionPath, screenshotPath };
}

test("qualifies an exact candidate-bound and visually inspected screenshot set", () => {
  const values = fixture();
  try {
    const receipt = qualifyScreenshots({ ...values, qualifiedAt: "2026-08-27T03:01:00.000Z" });
    assert.equal(receipt.submissionEligible, true);
    assert.equal(receipt.candidate.build, "35");
    assert.equal(receipt.displayType, "APP_IPHONE_67");
    assert.equal(receipt.screenshots.length, 1);
    assert.match(receipt.screenshots[0].md5, /^[0-9a-f]{32}$/);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("qualifies the same product story for the canonical 13-inch iPad set", () => {
  const values = fixture();
  try {
    const draft = JSON.parse(fs.readFileSync(values.draftReceiptPath, "utf8"));
    draft.device = {
      displayType: "APP_IPAD_PRO_3GEN_129",
      class: "iPad 13-inch",
    };
    draft.screenshots[0].width = 2048;
    draft.screenshots[0].height = 2732;
    writeJson(values.draftReceiptPath, draft);

    const receipt = qualifyScreenshots(values);
    assert.equal(receipt.displayType, "APP_IPAD_PRO_3GEN_129");
    assert.equal(receipt.deviceClass, "iPad 13-inch");
    assert.equal(receipt.screenshots[0].width, 2048);
    assert.equal(receipt.screenshots[0].height, 2732);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("rejects a visual inspection that is not bound to the exact bytes", () => {
  const values = fixture();
  try {
    const inspection = JSON.parse(fs.readFileSync(values.visualInspectionPath, "utf8"));
    inspection.screenshots[0].sha256 = "0".repeat(64);
    writeJson(values.visualInspectionPath, inspection);
    assert.throws(() => qualifyScreenshots(values), /exact SHA-256/);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});

test("rejects screenshots from a different source than the signed candidate", () => {
  const values = fixture();
  try {
    const draft = JSON.parse(fs.readFileSync(values.draftReceiptPath, "utf8"));
    draft.sourceRevision = "c".repeat(40);
    writeJson(values.draftReceiptPath, draft);
    assert.throws(() => qualifyScreenshots(values), /exact clean detached candidate source/);
  } finally {
    fs.rmSync(values.directory, { recursive: true, force: true });
  }
});
