import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { materializeDraftScreenshots } from "./app-store-draft-screenshots.mjs";
import { readAppStoreMetadata } from "../../../../scripts/release/quipsly-capture-app-store-metadata.mjs";

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "quipsly-app-store-drafts-"),
  );
  const exportedDirectory = path.join(root, "attachments");
  const outputDirectory = path.join(root, "output");
  fs.mkdirSync(exportedDirectory);
  const metadata = readAppStoreMetadata();
  const attachments = metadata.screenshots.planned.map((planned, index) => {
    const exportedFileName = `attachment-${index}.png`;
    fs.writeFileSync(
      path.join(exportedDirectory, exportedFileName),
      pngHeader(planned.width, planned.height),
    );
    return {
      exportedFileName,
      suggestedHumanReadableName:
        `${path.parse(planned.filename).name}_0_fixture.png`,
      isAssociatedWithFailure: false,
      configurationName: "Test",
      deviceName: "iPhone 17 Pro Max",
      deviceId: "fixture-device",
    };
  });
  const manifestPath = path.join(exportedDirectory, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify([
      {
        testIdentifier: "CaptureAppStoreScreenshotUITests/testCapturePrivateDataSafeDrafts()",
        attachments,
      },
    ]),
  );
  return {
    root,
    metadata,
    attachments,
    manifestPath,
    exportedDirectory,
    outputDirectory,
  };
}

test("materializes all five named 6.9-inch drafts with a fail-closed receipt", () => {
  const current = fixture();
  try {
    const result = materializeDraftScreenshots({
      manifestPath: current.manifestPath,
      exportedDirectory: current.exportedDirectory,
      outputDirectory: current.outputDirectory,
      sourceRevision: "a".repeat(40),
      sourceDirty: true,
      resultBundlePath: path.join(current.root, "result.xcresult"),
      deviceName: "iPhone 17 Pro Max",
      deviceId: "fixture-device",
      capturedAt: "2026-07-24T00:00:00.000Z",
    });

    assert.equal(result.receipt.screenshots.length, 5);
    assert.equal(result.receipt.submissionEligible, false);
    assert.equal(result.receipt.status, "draft-layout-evidence");
    assert.equal(result.receipt.sourceDirty, true);
    for (const planned of current.metadata.screenshots.planned) {
      assert.equal(
        fs.existsSync(path.join(result.screenshotDirectory, planned.filename)),
        true,
      );
    }
  } finally {
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});

test("fails when an attachment is missing or has the wrong dimensions", () => {
  const missing = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(missing.manifestPath, "utf8"));
    manifest[0].attachments.pop();
    fs.writeFileSync(missing.manifestPath, JSON.stringify(manifest));
    assert.throws(
      () => materializeDraftScreenshots({
        manifestPath: missing.manifestPath,
        exportedDirectory: missing.exportedDirectory,
        outputDirectory: missing.outputDirectory,
        sourceRevision: "b".repeat(40),
        resultBundlePath: "result.xcresult",
        deviceName: "iPhone 17 Pro Max",
        deviceId: "fixture-device",
      }),
      /Expected exactly one xcresult attachment named 05-account\.png; found 0/,
    );
  } finally {
    fs.rmSync(missing.root, { recursive: true, force: true });
  }

  const wrongSize = fixture();
  try {
    fs.writeFileSync(
      path.join(
        wrongSize.exportedDirectory,
        wrongSize.attachments[0].exportedFileName,
      ),
      pngHeader(1200, 2400),
    );
    assert.throws(
      () => materializeDraftScreenshots({
        manifestPath: wrongSize.manifestPath,
        exportedDirectory: wrongSize.exportedDirectory,
        outputDirectory: wrongSize.outputDirectory,
        sourceRevision: "c".repeat(40),
        resultBundlePath: "result.xcresult",
        deviceName: "iPhone 17 Pro Max",
        deviceId: "fixture-device",
      }),
      /01-today\.png is 1200x2400; expected 1320x2868/,
    );
  } finally {
    fs.rmSync(wrongSize.root, { recursive: true, force: true });
  }
});
