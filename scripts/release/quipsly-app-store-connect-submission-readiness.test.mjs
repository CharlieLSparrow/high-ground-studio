import assert from "node:assert/strict";
import test from "node:test";

import {
  AGE_RATING_QUESTION_FIELDS,
  parseArguments,
  summarizeSubmissionReadiness,
} from "./quipsly-app-store-connect-submission-readiness.mjs";
import { readAppStoreMetadata } from "./quipsly-capture-app-store-metadata.mjs";

const metadata = readAppStoreMetadata("release/app-store/quipsly-capture/en-US.json");
const options = parseArguments([]);

function completeFixture() {
  const appInfoId = "app-info-1";
  const versionId = "version-1";
  const localizationId = "localization-1";
  return {
    options,
    metadata,
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
        },
      },
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
    screenshotSetDocuments: [{
      data: {
        type: "appScreenshotSets",
        id: "screenshots-1",
        attributes: { screenshotDisplayType: "APP_IPHONE_67" },
      },
      included: Array.from({ length: 5 }, (_, index) => ({
        type: "appScreenshots",
        id: `screenshot-${index + 1}`,
        attributes: { assetDeliveryState: { state: "COMPLETE" } },
      })),
    }],
    auditedAt: "2026-08-01T23:00:00.000Z",
  };
}

test("submission auditor has no mutation mode", () => {
  assert.equal(parseArguments([]).build, "26");
  assert.throws(() => parseArguments(["--apply"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--submit"]), /Unknown argument/);
});

test("complete provider state still preserves manual legal and physical gates", () => {
  const receipt = summarizeSubmissionReadiness(completeFixture());
  assert.equal(receipt.providerChecksPassed, true);
  assert.equal(receipt.submissionReady, false);
  assert.equal(receipt.screenshots.providerCount, 5);
  assert.equal(receipt.pricing.complete, true);
  assert.equal(receipt.availability.complete, true);
  assert.deepEqual(
    receipt.blockers.map(({ code }) => code),
    [
      "app-privacy-manual-publication",
      "dsa-trader-manual-verification",
      "physical-build26-acceptance",
      "production-account-deletion-proof",
      "device-compatibility-provider-cleanup",
    ],
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
