import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./quipsly-capture-app-store-metadata.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function canonicalMetadata() {
  return structuredClone(readAppStoreMetadata());
}

test("canonical App Store metadata passes its source contract", () => {
  const result = validateAppStoreMetadata(canonicalMetadata(), {
    root: repositoryRoot,
  });

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.metrics.nameCharacters, 15);
  assert.equal(result.metrics.subtitleCharacters, 30);
  assert.equal(result.metrics.promotionalTextCharacters, 167);
  assert.equal(result.metrics.keywordsBytes, 81);
  assert.equal(result.metrics.aggregateCollectedDataTypeCount, 12);
  assert.equal(result.screenshotCount, 7);
  assert.equal(result.submissionReadiness, "blocked");
  assert.equal(
    canonicalMetadata().compliance.compatibility.status,
    "complete",
  );
});

test("field limits and secret-like keys fail closed", () => {
  const metadata = canonicalMetadata();
  metadata.app.name = "x".repeat(31);
  metadata.version.keywords = "é".repeat(51);
  metadata.review.password = "never commit this";

  const result = validateAppStoreMetadata(metadata, {
    root: repositoryRoot,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /app\.name is 31 characters/);
  assert.match(result.errors.join("\n"), /102 UTF-8 bytes/);
  assert.match(result.errors.join("\n"), /Secret-like metadata keys are forbidden/);
});

test("provider-complete status fails closed without exact readback evidence", () => {
  const metadata = canonicalMetadata();
  metadata.compliance.contentRights.providerReadback = null;
  metadata.compliance.price.providerReadback.customerPrice = "1.99";
  metadata.compliance.providerTarget.build = "24";

  const result = validateAppStoreMetadata(metadata, {
    root: repositoryRoot,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /privacy questionnaire target build must match compliance\.providerTarget\.build/,
  );
  assert.match(result.errors.join("\n"), /archiveAggregateValidatedBuild must match/);
  assert.match(result.errors.join("\n"), /prove USES_THIRD_PARTY_CONTENT/);
  assert.match(result.errors.join("\n"), /prove Free pricing/);
});

test("historical configuration is valid source evidence but cannot qualify a new submission", () => {
  const metadata = canonicalMetadata();
  // Use an explicit historical fixture even after the canonical audit advances.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-historical-metadata-"));
  try {
    metadata.compliance.providerTarget.build = "24";
    metadata.privacy.archiveAggregateValidatedBuild = "24";
    for (const file of [metadata.privacy.sourceManifest, metadata.privacy.questionnaireFile, metadata.review.notesFile]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(repositoryRoot, file), path.join(root, file));
    }
    const questionnairePath = path.join(root, metadata.privacy.questionnaireFile);
    const questionnaire = JSON.parse(fs.readFileSync(questionnairePath, "utf8"));
    const pinFile = questionnaire.sourceContracts.packageResolvedPath;
    fs.mkdirSync(path.dirname(path.join(root, pinFile)), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, pinFile), path.join(root, pinFile));
    questionnaire.target.build = "24";
    fs.writeFileSync(questionnairePath, JSON.stringify(questionnaire));
    const source = validateAppStoreMetadata(metadata, { root });
    assert.equal(source.ok, true, source.errors.join("\n"));
    const submission = validateAppStoreMetadata(metadata, { root, requireSubmissionReady: true });
    assert.equal(submission.ok, false);
    assert.match(submission.errors.join("\n"), new RegExp(`exact Quipsly Capture Build ${QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber}`));
    assert.equal(metadata.compliance.providerTarget.build, "24", "Validation must not relabel old evidence");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("historical evidence still requires the correct app, version, build, and audit time", () => {
  for (const [field, value] of [
    ["appId", "another-app"], ["version", "0.0"], ["build", ""],
    ["build", "0"], ["build", "74junk"], ["build", 74],
    ["auditedAt", "not-a-date"], ["auditedAt", null],
  ]) {
    const metadata = canonicalMetadata();
    metadata.compliance.providerTarget[field] = value;
    const result = validateAppStoreMetadata(metadata, { root: repositoryRoot });
    assert.equal(result.ok, false, `${field}: ${value}`);
    assert.match(result.errors.join("\n"), /providerTarget must identify the Quipsly Capture app\/version/);
  }
});

test("universal compatibility completion fails closed without saved provider evidence", () => {
  const metadata = canonicalMetadata();
  metadata.compliance.compatibility.providerReadback.appleVisionProAvailable = true;
  metadata.compliance.compatibility.providerReadback.evidenceSha256 = "not-a-hash";

  const result = validateAppStoreMetadata(metadata, {
    root: repositoryRoot,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /universal iPhone and iPad target.*saved-and-reloaded Mac and Vision availability opt-outs/,
  );
});

test("submission mode requires approved assets and zero blockers", () => {
  const metadata = canonicalMetadata();
  metadata.screenshots.planned[0].status = "pending";
  const result = validateAppStoreMetadata(metadata, {
    root: repositoryRoot,
    requireSubmissionReady: true,
  });

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /submission\.readiness must be ready for --submission/,
  );
  assert.match(result.errors.join("\n"), /missing its approved iPhone 6\.9-inch screenshot/);
  assert.match(result.errors.join("\n"), /status must be approved for submission/);
});

test("submission mode reads PNG dimensions instead of trusting metadata", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "quipsly-app-store-metadata-"),
  );
  try {
    const metadata = canonicalMetadata();
    metadata.review.notesFile = "review-notes.md";
    metadata.screenshots.assetsDirectory = "screenshots";
    metadata.screenshots.planned = [
      {
        order: 1,
        filename: "proof.png",
        width: 1320,
        height: 2868,
        headline: "Proof",
        story: "Synthetic approved product proof.",
        status: "approved",
      },
    ];
    metadata.submission = { readiness: "ready", blockers: [] };
    fs.writeFileSync(path.join(temporaryRoot, "review-notes.md"), "review");
    fs.mkdirSync(path.join(temporaryRoot, "screenshots/iphone-6.9"), { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, "screenshots/ipad-13"), { recursive: true });

    const pngHeader = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
      pngHeader,
    );
    pngHeader.writeUInt32BE(1200, 16);
    pngHeader.writeUInt32BE(2400, 20);
    fs.writeFileSync(path.join(temporaryRoot, "screenshots/iphone-6.9/proof.png"), pngHeader);

    const ipadPngHeader = Buffer.from(pngHeader);
    ipadPngHeader.writeUInt32BE(2048, 16);
    ipadPngHeader.writeUInt32BE(2732, 20);
    fs.writeFileSync(path.join(temporaryRoot, "screenshots/ipad-13/proof.png"), ipadPngHeader);

    const result = validateAppStoreMetadata(metadata, {
      root: temporaryRoot,
      requireSubmissionReady: true,
    });

    assert.equal(result.ok, false);
    assert.match(
      result.errors.join("\n"),
      /iPhone 6\.9-inch asset is 1200x2400; expected 1320x2868/,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
