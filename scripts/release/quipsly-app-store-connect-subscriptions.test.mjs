import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mergeCollectionDocuments,
  mutationConfirmation,
  parseArguments,
  subscriptionCatalogProducts,
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
  assert.match(sourceForOperator(), /reviewScreenshotConfigured/);
  assert.match(sourceForOperator(), /complete: reviewReady/);
});

function sourceForOperator() {
  return readFileSync(
    new URL("./quipsly-app-store-connect-subscriptions.mjs", import.meta.url),
    "utf8",
  );
}
