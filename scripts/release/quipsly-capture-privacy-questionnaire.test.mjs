import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aggregatePrivacyManifests,
  validatePrivacyQuestionnaire,
} from "./quipsly-capture-privacy-questionnaire.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const questionnairePath = path.join(repositoryRoot, "release/app-store/quipsly-capture/privacy-questionnaire.json");

function canonicalQuestionnaire() {
  return JSON.parse(fs.readFileSync(questionnairePath, "utf8"));
}

test("canonical questionnaire covers source manifests and pinned SDKs", () => {
  const result = validatePrivacyQuestionnaire(canonicalQuestionnaire(), { root: repositoryRoot });
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(canonicalQuestionnaire().collectedDataTypes.length, 12);
});

test("fails closed when the third-party aggregate answer is omitted", () => {
  const questionnaire = canonicalQuestionnaire();
  questionnaire.collectedDataTypes = questionnaire.collectedDataTypes.filter(
    (entry) => entry.identifier !== "NSPrivacyCollectedDataTypeCoarseLocation",
  );
  const result = validatePrivacyQuestionnaire(questionnaire, { root: repositoryRoot });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /omits reviewed SDK data type NSPrivacyCollectedDataTypeCoarseLocation/);
});

test("aggregates duplicate app and SDK declarations conservatively", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-privacy-app-"));
  try {
    const appManifest = `<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict>
      <key>NSPrivacyTracking</key><false/>
      <key>NSPrivacyTrackingDomains</key><array/>
      <key>NSPrivacyCollectedDataTypes</key><array><dict>
        <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeUserID</string>
        <key>NSPrivacyCollectedDataTypeLinked</key><true/>
        <key>NSPrivacyCollectedDataTypeTracking</key><false/>
        <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
      </dict></array></dict></plist>`;
    const sdkManifest = appManifest.replace(
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
      "NSPrivacyCollectedDataTypePurposeAnalytics",
    );
    fs.writeFileSync(path.join(temporaryRoot, "PrivacyInfo.xcprivacy"), appManifest);
    fs.mkdirSync(path.join(temporaryRoot, "SDK.bundle"));
    fs.writeFileSync(path.join(temporaryRoot, "SDK.bundle/PrivacyInfo.xcprivacy"), sdkManifest);
    const aggregate = aggregatePrivacyManifests(temporaryRoot);
    assert.equal(aggregate.manifestCount, 2);
    assert.deepEqual(aggregate.collectedDataTypes[0].purposes, [
      "NSPrivacyCollectedDataTypePurposeAnalytics",
      "NSPrivacyCollectedDataTypePurposeAppFunctionality",
    ]);
    assert.equal(aggregate.collectedDataTypes[0].linkedToUser, true);
    assert.equal(aggregate.tracking, false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("archive comparison rejects a questionnaire that misses an SDK declaration", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-privacy-archive-"));
  try {
    const archivePath = path.join(temporaryRoot, "Fake.xcarchive");
    const appPath = path.join(archivePath, "Products/Applications/Quipsly.app");
    fs.mkdirSync(path.join(appPath, "Vendor.bundle"), { recursive: true });
    const emptyManifest = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
      <key>NSPrivacyTracking</key><false/><key>NSPrivacyTrackingDomains</key><array/>
      <key>NSPrivacyCollectedDataTypes</key><array/></dict></plist>`;
    const vendorManifest = emptyManifest.replace(
      "<key>NSPrivacyCollectedDataTypes</key><array/>",
      `<key>NSPrivacyCollectedDataTypes</key><array><dict>
        <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeCoarseLocation</string>
        <key>NSPrivacyCollectedDataTypeLinked</key><true/>
        <key>NSPrivacyCollectedDataTypeTracking</key><false/>
        <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
      </dict></array>`,
    );
    fs.writeFileSync(path.join(appPath, "PrivacyInfo.xcprivacy"), emptyManifest);
    fs.writeFileSync(path.join(appPath, "Vendor.bundle/PrivacyInfo.xcprivacy"), vendorManifest);
    const questionnaire = canonicalQuestionnaire();
    questionnaire.collectedDataTypes = questionnaire.collectedDataTypes.filter(
      (entry) => entry.identifier !== "NSPrivacyCollectedDataTypeCoarseLocation",
    );
    questionnaire.archiveEvidence = aggregatePrivacyManifests(appPath);
    const result = validatePrivacyQuestionnaire(questionnaire, {
      root: repositoryRoot,
      archivePath,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /omits archive-collected data type NSPrivacyCollectedDataTypeCoarseLocation/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
