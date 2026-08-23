import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArguments,
  validateMutationTarget,
} from "./quipsly-app-store-connect-listing.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const releaseConfirmation = [
  QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
  QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
  QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
].join("/");

function escapedPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("listing operator is read-only unless apply is explicit", () => {
  const options = parseArguments(["--api-key-path", "/private/key.json"]);
  assert.equal(options.apply, false);
  assert.equal(options.appId, "6780995957");
  assert.equal(options.version, "1.0");
  assert.equal(options.demoAccount, "codex@dev.test");
});

test("listing operator accepts an explicit contact without committing it", () => {
  const options = parseArguments([
    "--apply",
    "--review-contact-first-name", "Review",
    "--review-contact-last-name", "Operator",
    "--review-contact-email", "review@example.test",
    "--review-contact-phone", "+1 555 0100",
    "--password-keychain-service", "test-service",
    "--password-keychain-account", "test-account",
  ]);
  assert.equal(options.apply, true);
  assert.equal(options.reviewContactEmail, "review@example.test");
  assert.equal(options.passwordKeychainService, "test-service");
});

test("listing operator rejects unknown flags", () => {
  assert.throws(() => parseArguments(["--surprise"]), /Unknown argument/);
});

test("listing operator tolerates the package-runner separator", () => {
  assert.equal(parseArguments(["--", "--apply"]).apply, true);
});

test("build-only apply requires the exact provider target", () => {
  const options = parseArguments([
    "--apply",
    "--assign-build-only",
    "--confirm-target", releaseConfirmation,
  ]);
  assert.equal(options.assignBuildOnly, true);
  assert.doesNotThrow(() => validateMutationTarget(options));
});

test("apply rejects a missing or stale provider confirmation", () => {
  const currentBuild = QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber;
  const staleBuild = String(Math.max(0, Number.parseInt(currentBuild, 10) - 1));
  const expectedError = new RegExp(`--confirm-target ${escapedPattern(releaseConfirmation)}`);
  assert.throws(
    () => validateMutationTarget(parseArguments(["--apply"])),
    expectedError,
  );
  assert.throws(
    () => validateMutationTarget(parseArguments([
      "--apply", "--confirm-target", [
        QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
        QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
        staleBuild,
      ].join("/"),
    ])),
    expectedError,
  );
});
