import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGE_RATING_QUESTION_FIELDS,
  parseArguments,
  summarizeSubmissionReadiness,
} from "./quipsly-app-store-connect-submission-readiness.mjs";
import { readAppStoreMetadata } from "./quipsly-capture-app-store-metadata.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const metadata = readAppStoreMetadata("release/app-store/quipsly-capture/en-US.json");
const configuration = JSON.parse(readFileSync(
  "release/app-store/quipsly-capture/submission-configuration.json",
  "utf8",
));
const options = parseArguments([]);

function completeFixture() {
  const appInfoId = "app-info-1";
  const versionId = "version-1";
  const localizationId = "localization-1";
  return {
    options,
    metadata,
    configuration,
    appDocument: {
      data: {
        type: "apps",
        id: options.appId,
        attributes: {
          name: options.appName,
          bundleId: options.bundleId,
          primaryLocale: "en-US",
          isOrEverWasMadeForKids: false,
          contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT",
          subscriptionStatusUrl: configuration.serverNotifications.productionUrl,
          subscriptionStatusUrlVersion: configuration.serverNotifications.version,
          subscriptionStatusUrlForSandbox: configuration.serverNotifications.sandboxUrl,
          subscriptionStatusUrlVersionForSandbox: configuration.serverNotifications.version,
        },
      },
    },
    buildDocument: {
      data: {
        type: "builds",
        id: options.buildId,
        attributes: { version: options.build },
      },
      included: [{
        type: "buildBundles",
        id: "build-bundle-1",
        attributes: {
          bundleId: options.bundleId,
          bundleType: "APP",
          isIosBuildMacAppStoreCompatible: true,
          supportedArchitectures: ["arm64"],
          requiredCapabilities: ["arm64"],
        },
      }],
    },
    appInfosDocument: {
      data: [{
        type: "appInfos",
        id: appInfoId,
        attributes: {
          appStoreState: "PREPARE_FOR_SUBMISSION",
          appStoreAgeRating: "FOUR_PLUS",
        },
        relationships: {
          ageRatingDeclaration: { data: { type: "ageRatingDeclarations", id: appInfoId } },
        },
      }],
      included: [{
        type: "ageRatingDeclarations",
        id: appInfoId,
        attributes: Object.fromEntries(
          AGE_RATING_QUESTION_FIELDS.map((field) => [field, "NONE"]),
        ),
      }],
    },
    versionsDocument: {
      data: [{
        type: "appStoreVersions",
        id: versionId,
        attributes: {
          platform: "IOS",
          versionString: options.version,
          appStoreState: "PREPARE_FOR_SUBMISSION",
          releaseType: "MANUAL",
          usesIdfa: false,
        },
        relationships: {
          build: { data: { type: "builds", id: options.buildId } },
          appStoreReviewDetail: { data: { type: "appStoreReviewDetails", id: "review-1" } },
        },
      }],
      included: [
        {
          type: "appStoreVersionLocalizations",
          id: localizationId,
          attributes: { locale: "en-US" },
        },
        {
          type: "appStoreReviewDetails",
          id: "review-1",
          attributes: { demoAccountRequired: true },
        },
      ],
    },
    availabilityDocument: {
      data: {
        type: "appAvailabilities",
        id: "availability-1",
        relationships: {
          territoryAvailabilities: { meta: { paging: { total: 1 } } },
        },
      },
    },
    territoryAvailabilitiesDocument: {
      data: [{
        type: "territoryAvailabilities",
        id: "availability-usa",
        attributes: { available: true, contentStatuses: ["AVAILABLE"] },
        relationships: { territory: { data: { type: "territories", id: "USA" } } },
      }],
    },
    priceScheduleDocument: {
      data: { type: "appPriceSchedules", id: options.appId },
    },
    baseTerritoryDocument: {
      data: { type: "territories", id: "USA", attributes: { currency: "USD" } },
    },
    manualPricesDocument: {
      data: [{
        type: "appPrices",
        id: "price-1",
        attributes: { startDate: null, endDate: null },
        relationships: {
          appPricePoint: { data: { type: "appPricePoints", id: "point-1" } },
          territory: { data: { type: "territories", id: "USA" } },
        },
      }],
      included: [
        { type: "appPricePoints", id: "point-1", attributes: { customerPrice: "0.0" } },
        { type: "territories", id: "USA", attributes: { currency: "USD" } },
      ],
    },
    reviewSubmissionsDocument: { data: [] },
    screenshotSetDocuments: metadata.screenshots.requiredDisplayTypes.map(
      (displayType, setIndex) => ({
        data: {
          type: "appScreenshotSets",
          id: `screenshots-${setIndex + 1}`,
          attributes: { screenshotDisplayType: displayType },
        },
        included: Array.from({ length: metadata.screenshots.planned.length }, (_, index) => ({
          type: "appScreenshots",
          id: `screenshot-${setIndex + 1}-${index + 1}`,
          attributes: { assetDeliveryState: { state: "COMPLETE" } },
        })),
      }),
    ),
    auditedAt: "2026-08-01T23:00:00.000Z",
  };
}

test("submission auditor has no mutation mode", () => {
  assert.equal(parseArguments([]).build, QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber);
  assert.throws(() => parseArguments(["--apply"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--submit"]), /Unknown argument/);
});

test("complete provider state still preserves manual legal and physical gates", () => {
  const receipt = summarizeSubmissionReadiness(completeFixture());
  assert.equal(receipt.providerChecksPassed, true);
  assert.equal(receipt.submissionReady, false);
  assert.equal(
    receipt.screenshots.providerCount,
    metadata.screenshots.planned.length * metadata.screenshots.requiredDisplayTypes.length,
  );
  assert.deepEqual(receipt.compatibility.desiredDeviceFamilies, ["iPhone", "iPad"]);
  assert.equal(receipt.pricing.complete, true);
  assert.equal(receipt.availability.complete, true);
  assert.equal(receipt.compatibility.iosBuildMacAppStoreCompatible, true);
  assert.equal(receipt.compatibility.macAvailabilityApiVerifiable, false);
  assert.equal(receipt.compatibility.status, "complete-manual-ui-readback");
  assert.equal(receipt.compatibility.providerReadback.saveReloadReadback, true);
  assert.deepEqual(
    receipt.blockers.map(({ code }) => code),
    [
      "app-privacy-manual-publication",
      "dsa-status-declaration",
      `physical-build${QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber}-acceptance`,
      "production-account-deletion-proof",
    ],
  );
});

test("requires trader verification only when European Union distribution is enabled", () => {
  const fixture = completeFixture();
  fixture.availabilityDocument.data.relationships.territoryAvailabilities.meta.paging.total = 2;
  fixture.territoryAvailabilitiesDocument.data.push({
    type: "territoryAvailabilities",
    id: "availability-deu",
    attributes: { available: true, contentStatuses: ["AVAILABLE"] },
    relationships: { territory: { data: { type: "territories", id: "DEU" } } },
  });

  const receipt = summarizeSubmissionReadiness(fixture);

  assert.equal(receipt.availability.currentDistributionIncludesEuropeanUnion, true);
  assert.equal(receipt.blockers.some(({ code }) => code === "dsa-trader-manual-verification"), true);
  assert.equal(receipt.blockers.some(({ code }) => code === "dsa-status-declaration"), false);
});

test("requires App Store Server Notifications V2 for paid subscription state", () => {
  const fixture = completeFixture();
  fixture.appDocument.data.attributes.subscriptionStatusUrl = null;
  fixture.appDocument.data.attributes.subscriptionStatusUrlVersion = null;
  fixture.appDocument.data.attributes.subscriptionStatusUrlForSandbox = null;
  fixture.appDocument.data.attributes.subscriptionStatusUrlVersionForSandbox = null;

  const receipt = summarizeSubmissionReadiness(fixture);

  assert.equal(receipt.serverNotifications.complete, false);
  assert.equal(receipt.checks.serverNotificationsV2, false);
  assert.equal(receipt.providerChecksPassed, false);
  assert.equal(
    receipt.blockers.some(({ code }) => code === "server-notifications-v2-missing"),
    true,
  );
});

test("preserves the compatibility blocker until manual provider evidence is complete", () => {
  const fixture = completeFixture();
  fixture.metadata = structuredClone(metadata);
  fixture.metadata.compliance.compatibility.status = "source-correct-provider-opt-out-required";
  delete fixture.metadata.compliance.compatibility.providerReadback;

  const receipt = summarizeSubmissionReadiness(fixture);

  assert.equal(receipt.compatibility.status, "manual-app-level-opt-out-required");
  assert.equal(
    receipt.blockers.some(({ code }) => code === "device-compatibility-provider-cleanup"),
    true,
  );
});

test("decodes Apple territory IDs and accepts the expected unreleased status pair", () => {
  const fixture = completeFixture();
  fixture.territoryAvailabilitiesDocument.data[0] = {
    type: "territoryAvailabilities",
    id: Buffer.from(JSON.stringify({ s: options.appId, t: "USA" })).toString("base64url"),
    attributes: {
      available: true,
      contentStatuses: ["CANNOT_SELL", "AVAILABLE_FOR_SALE_UNRELEASED_APP"],
    },
  };
  const receipt = summarizeSubmissionReadiness(fixture);
  assert.deepEqual(receipt.availability.availableTerritoryIds, ["USA"]);
  assert.deepEqual(receipt.availability.blockingContentStatuses, []);
  assert.equal(receipt.availability.complete, true);
});

test("ignores disabled-territory legal status but blocks it on an enabled territory", () => {
  const fixture = completeFixture();
  fixture.availabilityDocument.data.relationships.territoryAvailabilities.meta.paging.total = 2;
  fixture.territoryAvailabilitiesDocument.data.push({
    type: "territoryAvailabilities",
    id: "availability-deu",
    attributes: {
      available: false,
      contentStatuses: ["TRADER_STATUS_NOT_PROVIDED"],
    },
    relationships: { territory: { data: { type: "territories", id: "DEU" } } },
  });
  let receipt = summarizeSubmissionReadiness(fixture);
  assert.deepEqual(receipt.availability.blockingContentStatuses, []);
  assert.equal(receipt.availability.complete, true);

  fixture.territoryAvailabilitiesDocument.data[0].attributes.contentStatuses = [
    "TRADER_STATUS_NOT_PROVIDED",
  ];
  receipt = summarizeSubmissionReadiness(fixture);
  assert.deepEqual(receipt.availability.blockingContentStatuses, [
    "TRADER_STATUS_NOT_PROVIDED",
  ]);
  assert.equal(receipt.availability.complete, false);
});

test("missing provider declarations produce exact fail-closed blockers", () => {
  const fixture = completeFixture();
  fixture.appDocument.data.attributes.contentRightsDeclaration = null;
  fixture.appInfosDocument.data[0].attributes.appStoreAgeRating = null;
  fixture.appInfosDocument.included[0].attributes = Object.fromEntries(
    AGE_RATING_QUESTION_FIELDS.map((field) => [field, null]),
  );
  fixture.versionsDocument.data[0].attributes.usesIdfa = null;
  fixture.availabilityDocument = null;
  fixture.territoryAvailabilitiesDocument = null;
  fixture.manualPricesDocument = null;
  fixture.screenshotSetDocuments = [];

  const receipt = summarizeSubmissionReadiness(fixture);
  const codes = new Set(receipt.blockers.map(({ code }) => code));
  for (const code of [
    "content-rights-missing",
    "age-rating-incomplete",
    "idfa-declaration-missing",
    "screenshots-incomplete",
    "price-not-configured",
    "availability-not-configured",
  ]) assert.equal(codes.has(code), true, code);
  assert.equal(receipt.ageRating.answeredQuestionCount, 0);
  assert.equal(receipt.screenshots.providerCount, 0);
  assert.equal(receipt.providerChecksPassed, false);
});

test("requires the 13-inch iPad screenshot set for the universal binary", () => {
  const fixture = completeFixture();
  fixture.screenshotSetDocuments = fixture.screenshotSetDocuments.filter(
    (document) => document.data.attributes.screenshotDisplayType === "APP_IPHONE_67",
  );

  const receipt = summarizeSubmissionReadiness(fixture);

  assert.equal(receipt.checks.screenshotsComplete, false);
  assert.equal(
    receipt.screenshots.requirements.find(
      (requirement) => requirement.displayType === "APP_IPAD_PRO_3GEN_129",
    ).providerCount,
    0,
  );
  assert.equal(
    receipt.blockers.some(({ code }) => code === "screenshots-incomplete"),
    true,
  );
});

test("fails closed when Apple omits computed build compatibility metadata", () => {
  const fixture = completeFixture();
  fixture.buildDocument.included = [];
  const receipt = summarizeSubmissionReadiness(fixture);
  assert.equal(receipt.checks.buildBundleReadback, false);
  assert.equal(receipt.providerChecksPassed, false);
  assert.equal(
    receipt.blockers.some(({ code }) => code === "build-bundle-readback-missing"),
    true,
  );
});

test("receipt excludes provider secrets and asset upload details", () => {
  const fixture = completeFixture();
  fixture.versionsDocument.included[1].attributes = {
    contactEmail: "reviewer@example.test",
    contactPhone: "+1 555 0100",
    demoAccountName: "reviewer@example.test",
    demoAccountPassword: "never-print-me",
  };
  fixture.screenshotSetDocuments[0].included[0].attributes.assetToken = "never-print-token";
  const serialized = JSON.stringify(summarizeSubmissionReadiness(fixture));
  assert.doesNotMatch(serialized, /reviewer@example\.test|never-print-me|never-print-token/);
  assert.equal(JSON.parse(serialized).sensitiveFieldsPrinted, false);
});
