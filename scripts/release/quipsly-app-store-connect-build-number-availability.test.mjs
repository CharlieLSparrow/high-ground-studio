#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  summarizeAvailability,
} from "./quipsly-app-store-connect-build-number-availability.mjs";

function buildDocument(buildNumbers) {
  return {
    data: buildNumbers.map((buildNumber, index) => ({
      type: "builds",
      id: `build-${buildNumber}`,
      attributes: { version: String(buildNumber) },
      relationships: {
        preReleaseVersion: { data: { type: "preReleaseVersions", id: `version-${index}` } },
      },
    })),
    included: buildNumbers.map((_, index) => ({
      type: "preReleaseVersions",
      id: `version-${index}`,
      attributes: { version: "1.0" },
    })),
  };
}

test("accepts a build number higher than every uploaded build", () => {
  const receipt = summarizeAvailability({
    options: { appId: "app", marketingVersion: "1.0", buildNumber: "73" },
    buildDocument: buildDocument([70, 71, 72]),
  });
  assert.equal(receipt.highestUploadedBuildNumber, "72");
  assert.equal(receipt.exactBuildAlreadyExists, false);
  assert.equal(receipt.passed, true);
});

test("rejects an already-uploaded build before qualification", () => {
  const receipt = summarizeAvailability({
    options: { appId: "app", marketingVersion: "1.0", buildNumber: "72" },
    buildDocument: buildDocument([70, 71, 72]),
  });
  assert.equal(receipt.exactBuildAlreadyExists, true);
  assert.equal(receipt.passed, false);
});

test("rejects an unused but stale build number", () => {
  const receipt = summarizeAvailability({
    options: { appId: "app", marketingVersion: "1.0", buildNumber: "71" },
    buildDocument: buildDocument([70, 72]),
  });
  assert.equal(receipt.exactBuildAlreadyExists, false);
  assert.equal(receipt.higherThanUploadedBuilds, false);
  assert.equal(receipt.passed, false);
});

test("parses an explicit release identity", () => {
  assert.deepEqual(
    parseArguments(["--app-id", "app", "--version", "1.2", "--build", "9"]),
    {
      apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
      appId: "app",
      marketingVersion: "1.2",
      buildNumber: "9",
    },
  );
});

