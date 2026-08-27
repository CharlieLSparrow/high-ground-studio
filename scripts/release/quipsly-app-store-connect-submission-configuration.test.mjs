import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAvailabilityBody,
  buildFreePriceScheduleBody,
  parseArguments,
  summarizeConfiguration,
  tokenScopesForRequest,
  validateConfiguration,
} from "./quipsly-app-store-connect-submission-configuration.mjs";

const configuration = JSON.parse(readFileSync(
  "release/app-store/quipsly-capture/submission-configuration.json",
  "utf8",
));
const options = parseArguments([]);

function fixture() {
  const ageRatingId = "age-1";
  return {
    appDocument: { data: {
      type: "apps",
      id: options.appId,
      attributes: {
        bundleId: "com.highgroundodyssey.HighGroundCapture",
        contentRightsDeclaration: configuration.contentRightsDeclaration,
        subscriptionStatusUrl: configuration.serverNotifications.productionUrl,
        subscriptionStatusUrlVersion: configuration.serverNotifications.version,
        subscriptionStatusUrlForSandbox: configuration.serverNotifications.sandboxUrl,
        subscriptionStatusUrlVersionForSandbox: configuration.serverNotifications.version,
      },
    } },
    appInfo: {
      id: "info-1",
      attributes: { appStoreState: "PREPARE_FOR_SUBMISSION", appStoreAgeRating: "THIRTEEN_PLUS" },
      relationships: { ageRatingDeclaration: { data: { type: "ageRatingDeclarations", id: ageRatingId } } },
    },
    ageRating: { id: ageRatingId, type: "ageRatingDeclarations", attributes: structuredClone(configuration.ageRating) },
    version: {
      id: "version-1",
      attributes: { platform: "IOS", versionString: options.version, appStoreState: "PREPARE_FOR_SUBMISSION", usesIdfa: false },
      relationships: { build: { data: { type: "builds", id: options.buildId } } },
    },
    availabilityDocument: {
      data: { id: "availability-1", attributes: { availableInNewTerritories: false } },
    },
    territoryAvailabilitiesDocument: {
      data: [{
        type: "territoryAvailabilities",
        id: "availability-usa",
        attributes: { available: true, contentStatuses: ["AVAILABLE"] },
        relationships: { territory: { data: { type: "territories", id: "USA" } } },
      }],
    },
    priceScheduleDocument: { data: { id: options.appId } },
    pricePointsDocument: { data: [{ id: "free-point", attributes: { customerPrice: "0.0" } }] },
    territoriesDocument: { data: [
      { type: "territories", id: "CAN" },
      { type: "territories", id: "GBR" },
      { type: "territories", id: "USA" },
    ] },
    manualPricesDocument: {
      data: [{
        id: "price-1",
        attributes: { startDate: null, endDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: "free-point" } },
          territory: { data: { type: "territories", id: "USA" } },
        },
      }],
      included: [{ type: "appPricePoints", id: "free-point", attributes: { customerPrice: "0.0" } }],
    },
  };
}

test("canonical submission configuration is exact, conservative, and non-submitting", () => {
  assert.deepEqual(validateConfiguration(configuration, {
    appId: options.appId,
    version: options.version,
    build: options.build,
  }), []);
  assert.equal(configuration.contentRightsDeclaration, "USES_THIRD_PARTY_CONTENT");
  assert.equal(configuration.ageRating.messagingAndChat, true);
  assert.equal(configuration.ageRating.userGeneratedContent, true);
  assert.equal(configuration.ageRating.ageRatingOverrideV2, "THIRTEEN_PLUS");
  assert.equal(configuration.serverNotifications.version, "V2");
  assert.equal(configuration.screenshots.uploadApproved, false);
  assert.equal(configuration.reviewSubmission.allowed, false);
});

test("complete provider state is idempotent and preserves manual gates", () => {
  const receipt = summarizeConfiguration({ options, configuration, documents: fixture() });
  assert.equal(receipt.configurationComplete, true);
  assert.deepEqual(receipt.actions, []);
  assert.deepEqual(receipt.blockers, []);
  assert.equal(receipt.screenshotsUploaded, false);
  assert.equal(receipt.reviewSubmissionCreated, false);
});

test("missing provider state produces bounded configuration actions", () => {
  const documents = fixture();
  documents.appDocument.data.attributes.contentRightsDeclaration = null;
  documents.ageRating.attributes = {};
  documents.appInfo.attributes.appStoreAgeRating = null;
  documents.version.attributes.usesIdfa = null;
  documents.appDocument.data.attributes.subscriptionStatusUrl = null;
  documents.appDocument.data.attributes.subscriptionStatusUrlVersion = null;
  documents.appDocument.data.attributes.subscriptionStatusUrlForSandbox = null;
  documents.appDocument.data.attributes.subscriptionStatusUrlVersionForSandbox = null;
  documents.availabilityDocument = null;
  documents.manualPricesDocument = { data: [], included: [] };
  const receipt = summarizeConfiguration({ options, configuration, documents });
  assert.deepEqual(receipt.actions, [
    "patch-content-rights",
    "patch-age-rating",
    "patch-idfa-false",
    "create-free-usa-price",
    "create-usa-only-availability",
    "patch-server-notifications-v2",
  ]);
  assert.deepEqual(receipt.blockers, []);
});

test("compound Free and USA-only payloads preserve exact ownership", () => {
  const price = buildFreePriceScheduleBody({ appId: options.appId, pricePointId: "free-point" });
  assert.equal(price.data.relationships.app.data.id, options.appId);
  assert.equal(price.data.relationships.baseTerritory.data.id, "USA");
  assert.match(price.data.relationships.manualPrices.data[0].id, /^\$\{[a-z0-9-]+\}$/);
  assert.equal(price.included[0].relationships.appPricePoint.data.id, "free-point");
  const availability = buildAvailabilityBody({
    appId: options.appId,
    territoryIds: ["USA", "CAN", "GBR"],
  });
  assert.equal(availability.data.attributes.availableInNewTerritories, false);
  assert.equal(availability.data.relationships.territoryAvailabilities.data.length, 3);
  assert.match(
    availability.data.relationships.territoryAvailabilities.data[0].id,
    /^\$\{[a-z0-9-]+\}$/,
  );
  assert.equal(
    availability.included.find((entry) => entry.relationships.territory.data.id === "USA")
      .attributes.available,
    true,
  );
  assert.equal(
    availability.included.find((entry) => entry.relationships.territory.data.id === "CAN")
      .attributes.available,
    false,
  );
});

test("JWT scope is used only for Apple-supported GET requests", () => {
  assert.deepEqual(tokenScopesForRequest({
    method: "GET",
    scope: "GET /v1/apps/6780995957",
  }), ["GET /v1/apps/6780995957"]);
  assert.equal(tokenScopesForRequest({
    method: "PATCH",
    scope: "PATCH /v1/apps/6780995957",
  }), undefined);
  assert.equal(tokenScopesForRequest({
    method: "POST",
    scope: "POST /v1/appPriceSchedules",
  }), undefined);
});

test("operator source contains no review submission or screenshot upload mutation", () => {
  const source = readFileSync(
    "scripts/release/quipsly-app-store-connect-submission-configuration.mjs",
    "utf8",
  );
  assert.doesNotMatch(source, /POST.*reviewSubmissions|POST.*appScreenshots|POST.*appScreenshotSets/);
  assert.match(source, /--apply requires --confirm-target/);
  assert.match(source, /apply-intent/);
  assert.match(source, /apply-failed-read-back/);
  assert.match(source, /createScopedToken/);
  assert.match(source, /Apple only supports the JWT scope claim for GET operations/);
  assert.doesNotMatch(source, /set -x|console\.log\(.*token/);
});
