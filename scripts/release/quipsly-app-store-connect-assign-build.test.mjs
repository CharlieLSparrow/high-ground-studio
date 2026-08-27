import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssignmentBody,
  parseAssignmentArguments,
  resolveAssignmentTargets,
} from "./quipsly-app-store-connect-assign-build.mjs";

const options = {
  appId: "6780995957",
  marketingVersion: "1.0",
  buildNumber: "7",
  groupName: "Quipsly Capture Internal",
};

const buildDocument = {
  data: [{
    type: "builds",
    id: "build-7",
    attributes: { version: "7", processingState: "VALID" },
    relationships: {
      preReleaseVersion: {
        data: { type: "preReleaseVersions", id: "version-1" },
      },
    },
  }],
  included: [{
    type: "preReleaseVersions",
    id: "version-1",
    attributes: { version: "1.0" },
  }],
};

test("defaults internal assignment to the canonical current release build", () => {
  const parsed = parseAssignmentArguments([]);
  assert.equal(parsed.appId, "6780995957");
  assert.equal(parsed.marketingVersion, "1.0");
  assert.equal(parsed.buildNumber, "38");
  assert.equal(parsed.groupName, "Quipsly Capture Internal");
});

test("parses an exact build and internal-group assignment contract", () => {
  const parsed = parseAssignmentArguments([
    "--api-key-path", "/private/key.json",
    "--version", "1.0",
    "--build", "7",
    "--group", "Quipsly Capture Internal",
  ]);

  assert.equal(parsed.apiKeyPath, "/private/key.json");
  assert.equal(parsed.marketingVersion, "1.0");
  assert.equal(parsed.buildNumber, "7");
  assert.equal(parsed.groupName, "Quipsly Capture Internal");
});

test("resolves only the exact valid build and internal group", () => {
  const targets = resolveAssignmentTargets({
    options,
    buildDocument,
    groupDocument: {
      data: [{
        type: "betaGroups",
        id: "internal-group",
        attributes: {
          name: options.groupName,
          isInternalGroup: true,
        },
        relationships: {
          builds: { data: [] },
        },
      }],
    },
  });

  assert.deepEqual(targets, {
    buildId: "build-7",
    groupId: "internal-group",
    alreadyAssigned: false,
  });
  assert.deepEqual(buildAssignmentBody(targets.groupId), {
    data: [{ type: "betaGroups", id: "internal-group" }],
  });
});

test("is idempotent when the group already includes the build", () => {
  const targets = resolveAssignmentTargets({
    options,
    buildDocument,
    groupDocument: {
      data: [{
        type: "betaGroups",
        id: "internal-group",
        attributes: {
          name: options.groupName,
          isInternalGroup: true,
        },
        relationships: {
          builds: { data: [{ type: "builds", id: "build-7" }] },
        },
      }],
    },
  });

  assert.equal(targets.alreadyAssigned, true);
});
