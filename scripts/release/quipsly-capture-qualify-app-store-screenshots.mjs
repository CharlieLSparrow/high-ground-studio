#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appStoreScreenshotDisplaySet,
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./quipsly-capture-app-store-metadata.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultMetadataPath = path.join(
  repositoryRoot,
  "release/app-store/quipsly-capture/en-US.json",
);

function fail(message) {
  throw new Error(message);
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = { metadataPath: defaultMetadataPath };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--metadata": options.metadataPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--draft-receipt": options.draftReceiptPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--committed-source-receipt": options.committedSourceReceiptPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--candidate-receipt": options.candidateReceiptPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--visual-inspection": options.visualInspectionPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--output": options.outputPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-capture-qualify-app-store-screenshots.mjs \\
    --draft-receipt <draft-receipt.json> \\
    --committed-source-receipt <committed-source-receipt.json> \\
    --candidate-receipt <qualified-release-receipt.json> \\
    --visual-inspection <visual-inspection.json> \\
    --output <submission-receipt.json>

Qualifies visually inspected App Store screenshots only when their clean,
detached source revision is the exact signed and fully UI-tested candidate.
This creates engineering evidence; it does not require a separate human
approval or mutate App Store Connect.
`;
}

function readJson(filePath, label) {
  if (!filePath) fail(`${label} path is required.`);
  if (!fs.statSync(filePath).isFile()) fail(`${label} is not a regular file: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function md5(bytes) {
  return crypto.createHash("md5").update(bytes).digest("hex");
}

function requireFullRevision(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value || "")) fail(`${label} must contain a full source revision.`);
  return value;
}

function validateCandidate(candidate) {
  if (candidate.schema !== "quipsly-capture-release-receipt-v1") {
    fail("Candidate receipt has an unsupported schema.");
  }
  if (candidate.candidateQualified !== true || candidate.deterministicUITestPerformed !== true) {
    fail("Candidate receipt must prove signed artifact and complete deterministic UI qualification.");
  }
  if (candidate.sourceIsolation !== "detached-worktree") {
    fail("Candidate source must be isolated in a detached worktree.");
  }
  return requireFullRevision(candidate.sourceRevision, "Candidate receipt");
}

function validateVisualInspection(inspection, revision, screenshots) {
  if (inspection.schema !== "quipsly-capture-app-store-visual-inspection-v1") {
    fail("Visual inspection has an unsupported schema.");
  }
  if (inspection.sourceRevision !== revision) {
    fail("Visual inspection source revision does not match the signed candidate.");
  }
  if (inspection.result !== "pass" || !Array.isArray(inspection.issues) || inspection.issues.length !== 0) {
    fail("Visual inspection must pass with no unresolved issues.");
  }
  if (typeof inspection.inspectedAt !== "string" || Number.isNaN(Date.parse(inspection.inspectedAt))) {
    fail("Visual inspection must record a valid inspectedAt timestamp.");
  }
  const expected = screenshots.map(({ filename, sha256: digest }) => ({ filename, sha256: digest }));
  if (JSON.stringify(inspection.screenshots) !== JSON.stringify(expected)) {
    fail("Visual inspection must identify every screenshot by filename and exact SHA-256 digest.");
  }
}

export function qualifyScreenshots({
  metadataPath = defaultMetadataPath,
  draftReceiptPath,
  committedSourceReceiptPath,
  candidateReceiptPath,
  visualInspectionPath,
  qualifiedAt = new Date().toISOString(),
}) {
  const metadata = readAppStoreMetadata(metadataPath);
  const metadataValidation = validateAppStoreMetadata(metadata, { root: repositoryRoot });
  if (!metadataValidation.ok) {
    fail(`Canonical App Store metadata is invalid:\n${metadataValidation.errors.join("\n")}`);
  }
  const draft = readJson(draftReceiptPath, "Draft screenshot receipt");
  const committed = readJson(committedSourceReceiptPath, "Committed-source receipt");
  const candidate = readJson(candidateReceiptPath, "Candidate receipt");
  const inspection = readJson(visualInspectionPath, "Visual inspection");
  const revision = validateCandidate(candidate);

  if (draft.schema !== "quipsly-capture-app-store-draft-screenshots-v1") {
    fail("Draft screenshot receipt has an unsupported schema.");
  }
  if (
    draft.sourceRevision !== revision
    || draft.sourceDirty !== false
    || draft.sourceIsolation !== "detached-worktree"
  ) {
    fail("Draft screenshots must come from the exact clean detached candidate source.");
  }
  const displayType = draft.device?.displayType;
  if (typeof displayType !== "string") {
    fail("Draft screenshot receipt must identify its App Store display type.");
  }
  const displaySet = appStoreScreenshotDisplaySet(metadata, displayType);
  if (draft.device?.class !== displaySet.deviceClass) {
    fail("Draft screenshot device class does not match canonical metadata.");
  }
  if (committed.schema !== "quipsly-capture-committed-screenshot-evidence-v1") {
    fail("Committed-source receipt has an unsupported schema.");
  }
  if (
    committed.sourceRevision !== revision
    || committed.sourceDirty !== false
    || committed.sourceIsolation !== "detached-worktree"
    || path.resolve(committed.draftReceiptPath || "") !== path.resolve(draftReceiptPath)
  ) {
    fail("Committed-source receipt does not bind the draft screenshots to the candidate source.");
  }

  const planned = [...metadata.screenshots.planned].sort((left, right) => left.order - right.order);
  if (!Array.isArray(draft.screenshots) || draft.screenshots.length !== planned.length) {
    fail(`Expected ${planned.length} candidate screenshots.`);
  }
  if (
    committed.expectedScreenshotCount !== planned.length
    || committed.screenshotCount !== planned.length
  ) {
    fail("Committed-source screenshot count does not match canonical metadata.");
  }

  const screenshots = planned.map((expected, index) => {
    const actual = draft.screenshots[index];
    if (
      actual.order !== expected.order
      || actual.filename !== expected.filename
      || actual.width !== displaySet.width
      || actual.height !== displaySet.height
    ) {
      fail(`Screenshot ${index + 1} does not match canonical order, filename, or dimensions.`);
    }
    const imagePath = path.resolve(actual.draftPath || "");
    if (!fs.statSync(imagePath).isFile()) fail(`Screenshot is unavailable: ${imagePath}`);
    const bytes = fs.readFileSync(imagePath);
    const digest = sha256(bytes);
    if (digest !== actual.sha256 || bytes.length !== actual.bytes) {
      fail(`${actual.filename} changed after deterministic capture.`);
    }
    return {
      order: actual.order,
      filename: actual.filename,
      path: imagePath,
      width: actual.width,
      height: actual.height,
      bytes: bytes.length,
      sha256: digest,
      md5: md5(bytes),
    };
  });

  validateVisualInspection(inspection, revision, screenshots);

  return {
    schema: "quipsly-capture-app-store-screenshot-submission-v1",
    qualifiedAt,
    submissionEligible: true,
    sourceRevision: revision,
    sourceIsolation: "detached-worktree",
    candidate: {
      receiptPath: path.resolve(candidateReceiptPath),
      version: candidate.version,
      build: candidate.build,
      ipaSHA256: candidate.ipaSHA256,
    },
    evidence: {
      draftReceiptPath: path.resolve(draftReceiptPath),
      committedSourceReceiptPath: path.resolve(committedSourceReceiptPath),
      visualInspectionPath: path.resolve(visualInspectionPath),
    },
    locale: "en-US",
    displayType,
    deviceClass: displaySet.deviceClass,
    orientation: metadata.screenshots.orientation,
    screenshots,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      console.log(usage());
      return 0;
    }
    if (!options.outputPath) fail("--output is required.");
    const receipt = qualifyScreenshots(options);
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    const temporaryPath = `${options.outputPath}.tmp-${process.pid}`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, options.outputPath);
    console.log(`PASS Qualified ${receipt.screenshots.length} candidate-bound App Store screenshots.`);
    console.log(`PASS Submission receipt: ${options.outputPath}`);
    return 0;
  } catch (error) {
    console.error(`FAIL App Store screenshot qualification: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
