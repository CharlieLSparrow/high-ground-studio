import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mergeCollectionDocuments,
  mutationConfirmation,
  parseArguments,
  subscriptionCatalogProducts,
  validateReviewScreenshotBytes,
  validateMutationTarget,
} from "./quipsly-app-store-connect-subscriptions.mjs";

test("subscription operator is read-only by default", () => {
  const options = parseArguments([
    "--api-key-path",
    "/private/app-store-key.json",
  ]);
  assert.equal(options.apply, false);
  assert.equal(options.appId, "6780995957");
  assert.equal(options.territory, "USA");
});

test("subscription operator requires the exact immutable product target", () => {
  const confirmTarget = mutationConfirmation();
  const options = parseArguments([
    "--apply",
    "--confirm-target",
    confirmTarget,
  ]);
  assert.doesNotThrow(() => validateMutationTarget(options));
  assert.throws(
    () => validateMutationTarget(parseArguments(["--apply"])),
    /--confirm-target 6780995957\/com\.quipsly\.capture\.coach\.monthly\/com\.quipsly\.capture\.coach\.annual/,
  );
});

test("subscription operator normalizes an explicit territory", () => {
  const options = parseArguments(["--territory", "can"]);
  assert.equal(options.territory, "CAN");
});

test("subscription operator accepts the package-runner separator and rejects unknown flags", () => {
  assert.equal(parseArguments(["--", "--apply"]).apply, true);
  assert.throws(() => parseArguments(["--surprise"]), /Unknown argument/);
});

test("subscription operator accepts an explicit review screenshot", () => {
  const options = parseArguments(["--review-screenshot", "/tmp/quipsly-review.png"]);
  assert.equal(options.reviewScreenshotPath, "/tmp/quipsly-review.png");
});

test("subscription operator stays within App Store Connect collection limits", () => {
  const source = readFileSync(
    new URL("./quipsly-app-store-connect-subscriptions.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\["limit(?:\[[^"]+\])?", "(?:5[1-9]|[6-9]\d|\d{3,})"\]/);
});

test("subscription metadata fits App Store Connect field limits", () => {
  for (const product of subscriptionCatalogProducts()) {
    assert.ok(product.localizationName.length <= 30);
    assert.ok(product.localizationDescription.length <= 55);
  }
});

test("subscription operator merges paginated resources without duplicate includes", () => {
  const merged = mergeCollectionDocuments([
    {
      data: [{ type: "subscriptionPricePoints", id: "one" }],
      included: [{ type: "territories", id: "USA", attributes: { currency: "USD" } }],
      links: { next: "page-two" },
    },
    {
      data: [{ type: "subscriptionPricePoints", id: "two" }],
      included: [{ type: "territories", id: "USA", attributes: { currency: "USD" } }],
      links: { self: "page-two" },
    },
  ]);
  assert.deepEqual(merged.data.map(({ id }) => id), ["one", "two"]);
  assert.equal(merged.included.length, 1);
  assert.deepEqual(merged.links, { self: "page-two" });
});

test("subscription catalog and App Review readiness remain separate truths", () => {
  assert.match(sourceForOperator(), /catalogComplete/);
  assert.match(sourceForOperator(), /reviewMetadataComplete/);
  assert.match(sourceForOperator(), /pricingScheduleComplete/);
  assert.match(sourceForOperator(), /reviewScreenshotConfigured/);
  assert.match(sourceForOperator(), /complete: reviewMetadataComplete/);
});

function sourceForOperator() {
  return readFileSync(
    new URL("./quipsly-app-store-connect-subscriptions.mjs", import.meta.url),
    "utf8",
  );
}

test("subscription review screenshot validation requires a portrait PNG", () => {
  const screenshot = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(screenshot);
  screenshot.writeUInt32BE(1320, 16);
  screenshot.writeUInt32BE(2868, 20);
  assert.deepEqual(
    { ...validateReviewScreenshotBytes(screenshot), md5: "redacted" },
    { width: 1320, height: 2868, md5: "redacted" },
  );
  screenshot.writeUInt32BE(2868, 16);
  assert.throws(() => validateReviewScreenshotBytes(screenshot), /portrait iPhone screenshot/);
});
