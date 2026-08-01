import assert from "node:assert/strict";
import test from "node:test";

import { parseArguments } from "./quipsly-app-store-connect-listing.mjs";

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
