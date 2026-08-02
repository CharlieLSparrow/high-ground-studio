#!/usr/bin/env node

import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./quipsly-capture-app-store-metadata.mjs";
import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { summarizeTerritoryAvailability } from "./quipsly-app-store-connect-availability.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultMetadataPath = path.join(repositoryRoot, "release/app-store/quipsly-capture/en-US.json");

export const AGE_RATING_QUESTION_FIELDS = Object.freeze([
  "advertising",
  "ageAssurance",
  "alcoholTobaccoOrDrugUseOrReferences",
  "contests",
  "gambling",
  "gamblingSimulated",
  "gunsOrOtherWeapons",
  "healthOrWellnessTopics",
  "horrorOrFearThemes",
  "lootBox",
  "matureOrSuggestiveThemes",
  "medicalOrTreatmentInformation",
  "messagingAndChat",
  "parentalControls",
  "profanityOrCrudeHumor",
  "sexualContentGraphicAndNudity",
  "sexualContentOrNudity",
  "socialMedia",
  "socialMediaAgeRestricted",
  "unrestrictedWebAccess",
  "userGeneratedContent",
  "violenceCartoonOrFantasy",
  "violenceRealistic",
  "violenceRealisticProlongedGraphicOrSadistic",
]);

const VALID_CONTENT_RIGHTS = new Set([
  "DOES_NOT_USE_THIRD_PARTY_CONTENT",
  "USES_THIRD_PARTY_CONTENT",
]);

function fail(message) {
  throw new Error(message);
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    metadataPath: defaultMetadataPath,
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    appName: QUIPSLY_CAPTURE_RELEASE_TARGET.appName,
    bundleId: QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
    version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    buildId: QUIPSLY_CAPTURE_RELEASE_TARGET.buildId,
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--api-key-path": options.apiKeyPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--metadata": options.metadataPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--app-id": options.appId = requiredValue(argv, index, argument); index += 1; break;
      case "--app-name": options.appName = requiredValue(argv, index, argument); index += 1; break;
      case "--bundle-id": options.bundleId = requiredValue(argv, index, argument); index += 1; break;
      case "--version": options.version = requiredValue(argv, index, argument); index += 1; break;
      case "--build": options.build = requiredValue(argv, index, argument); index += 1; break;
      case "--build-id": options.buildId = requiredValue(argv, index, argument); index += 1; break;
      case "--output": options.outputPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/key.json \\
    node scripts/release/quipsly-app-store-connect-submission-readiness.mjs [options]

Read-only options:
  --api-key-path <path>  Mode-0600 App Store Connect API-key JSON.
  --metadata <path>      Canonical Quipsly Capture metadata JSON.
  --app-id <id>          Expected App Store Connect app ID.
  --app-name <name>      Expected App Store name.
  --bundle-id <id>       Expected bundle ID.
  --version <version>    Expected marketing version.
  --build <number>       Expected build number.
  --build-id <id>        Expected provider build ID.
  --output <path>        Write a redacted mode-0600 JSON receipt.

There is intentionally no apply or submit mode.
`;
}

function makeRequest(requestPath, searchEntries = []) {
  const url = new URL(requestPath, API_ORIGIN);
  for (const [key, value] of searchEntries) url.searchParams.append(key, value);
  return {
    url: url.toString(),
    scope: `GET ${decodeURIComponent(`${url.pathname}${url.search}`)}`,
  };
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath) fail("APP_STORE_CONNECT_API_KEY_PATH or --api-key-path is required.");
  const fileStat = await stat(apiKeyPath);
  if ((fileStat.mode & 0o077) !== 0) fail("App Store Connect API key JSON must have mode 0600.");
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) {
      fail(`API key is missing ${field}.`);
    }
  }
  return {
    keyId: document.key_id.trim(),
    issuerId: document.issuer_id.trim(),
    privateKey: document.key,
  };
}

async function requestJson({ request, key, optionalNotFound = false }) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createScopedToken({ ...key, scopes: [request.scope] });
    const response = await fetch(request.url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const document = await response.json().catch(() => ({}));
    if (response.ok) return document;
    if (optionalNotFound && response.status === 404) return null;
    const errors = (document.errors || []).map(({ status, code, title, detail }) => ({
      status, code, title, detail,
    }));
    finalError = new Error(
      `App Store Connect returned HTTP ${response.status}: ${JSON.stringify(errors)}`,
    );
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw finalError;
}

function included(document, type) {
  return (document?.included || []).filter((resource) => resource.type === type);
}

function relationshipId(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  return Array.isArray(data) ? data[0]?.id || null : data?.id || null;
}

function expectedDisplayTypes(metadata) {
  if (metadata.screenshots.deviceClass !== "iPhone 6.9-inch") {
    fail(`Unsupported screenshot device class: ${metadata.screenshots.deviceClass}`);
  }
  // Apple still uses APP_IPHONE_67 for the current largest-iPhone set.
  return ["APP_IPHONE_67"];
}

function requiredAgeFields(isMadeForKids) {
  return [
    ...AGE_RATING_QUESTION_FIELDS,
    ...(isMadeForKids ? ["kidsAgeBand"] : []),
  ];
}

function missingAgeFields(ageRating, isMadeForKids) {
  return requiredAgeFields(isMadeForKids).filter(
    (field) => ageRating?.attributes?.[field] == null,
  );
}

function screenshotState(screenshot) {
  const deliveryState = screenshot.attributes?.assetDeliveryState;
  return typeof deliveryState === "string" ? deliveryState : deliveryState?.state || null;
}

function activePriceSelections(manualPricesDocument) {
  if (!manualPricesDocument) return [];
  return (manualPricesDocument.data || []).filter((price) => {
    const endDate = price.attributes?.endDate;
    return endDate == null || Date.parse(endDate) > Date.now();
  }).map((price) => {
    const pointId = relationshipId(price, "appPricePoint");
    const territoryId = relationshipId(price, "territory");
    const point = included(manualPricesDocument, "appPricePoints").find(
      (resource) => resource.id === pointId,
    );
    const territory = included(manualPricesDocument, "territories").find(
      (resource) => resource.id === territoryId,
    );
    return {
      territoryId,
      currency: territory?.attributes?.currency || null,
      customerPrice: point?.attributes?.customerPrice ?? null,
      startDate: price.attributes?.startDate || null,
      endDate: price.attributes?.endDate || null,
    };
  });
}

function addBlocker(blockers, code, message, kind = "provider") {
  blockers.push({ code, kind, message });
}

export function summarizeSubmissionReadiness({
  options,
  metadata,
  appDocument,
  appInfosDocument,
  versionsDocument,
  availabilityDocument,
  territoryAvailabilitiesDocument,
  priceScheduleDocument,
  baseTerritoryDocument,
  manualPricesDocument,
  reviewSubmissionsDocument,
  screenshotSetDocuments,
  auditedAt = new Date().toISOString(),
}) {
  const app = appDocument?.data;
  if (!app) fail(`App Store Connect app ${options.appId} was not found.`);
  const appInfo = (appInfosDocument?.data || []).find(
    (resource) => resource.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
  ) || (appInfosDocument?.data || [])[0];
  const version = (versionsDocument?.data || []).find(
    (resource) => resource.attributes?.versionString === options.version
      && resource.attributes?.platform === "IOS",
  );
  const localization = included(versionsDocument, "appStoreVersionLocalizations").find(
    (resource) => resource.attributes?.locale === metadata.locale,
  );
  if (!appInfo || !version || !localization) {
    fail(`Could not resolve App Info, iOS ${options.version}, and ${metadata.locale} localization.`);
  }

  const ageRating = included(appInfosDocument, "ageRatingDeclarations").find(
    (resource) => resource.id === relationshipId(appInfo, "ageRatingDeclaration"),
  ) || included(appInfosDocument, "ageRatingDeclarations")[0] || null;
  const isMadeForKids = app.attributes?.isOrEverWasMadeForKids === true;
  const expectedAgeRatingFields = requiredAgeFields(isMadeForKids);
  const missingAgeRatingFields = missingAgeFields(ageRating, isMadeForKids);
  const contentRightsValue = app.attributes?.contentRightsDeclaration ?? null;
  const reviewDetailPresent = included(versionsDocument, "appStoreReviewDetails").length > 0;

  const wantedDisplayTypes = expectedDisplayTypes(metadata);
  const screenshotSets = screenshotSetDocuments.map((document) => {
    const screenshots = included(document, "appScreenshots");
    return {
      id: document.data?.id || null,
      displayType: document.data?.attributes?.screenshotDisplayType || null,
      count: screenshots.length,
      deliveryStates: [...new Set(screenshots.map(screenshotState).filter(Boolean))].sort(),
    };
  });
  const wantedSets = screenshotSets.filter((set) => wantedDisplayTypes.includes(set.displayType));
  const screenshotCount = wantedSets.reduce((sum, set) => sum + set.count, 0);
  const screenshotsDelivered = wantedSets.every((set) =>
    set.deliveryStates.every((state) => state === "COMPLETE"));

  const priceSelections = activePriceSelections(manualPricesDocument);
  const freePriceConfigured = priceSelections.some(
    (selection) => Number(selection.customerPrice) === 0,
  );

  const availability = summarizeTerritoryAvailability({
    availabilityDocument,
    territoryAvailabilitiesDocument,
  });
  const territories = availability.rows;
  const territoryTotal = availability.reportedTerritoryCount;
  const blockingStatuses = availability.blockingContentStatuses;
  const traderStatusBlockers = availability.traderStatusBlockers;
  const expectedTerritoryIds = metadata.compliance.territories.recommendedFirstRelease.map(
    (name) => name === "United States" ? "USA" : name,
  );
  const expectedTerritoriesAvailable = expectedTerritoryIds.every((id) =>
    territories.some((entry) => entry.id === id && entry.available));

  const checks = {
    appIdentity: app.id === options.appId
      && app.attributes?.name === options.appName
      && app.attributes?.bundleId === options.bundleId,
    appInfoEditable: appInfo.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
    versionEditable: version.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
    buildAssigned: relationshipId(version, "build") === options.buildId,
    reviewDetailPresent,
    contentRightsDeclared: VALID_CONTENT_RIGHTS.has(contentRightsValue),
    ageRatingComplete: Boolean(appInfo.attributes?.appStoreAgeRating)
      && Boolean(ageRating)
      && missingAgeRatingFields.length === 0,
    idfaDeclared: typeof version.attributes?.usesIdfa === "boolean",
    screenshotsComplete: screenshotCount >= metadata.screenshots.planned.length
      && screenshotsDelivered,
    priceConfigured: Boolean(priceScheduleDocument?.data) && priceSelections.length > 0,
    expectedFreePriceConfigured: freePriceConfigured,
    availabilityConfigured: Boolean(availabilityDocument?.data),
    territoryInventoryComplete: availability.inventoryComplete,
    expectedTerritoriesAvailable,
    territoryStatusesClear: blockingStatuses.length === 0,
  };

  const blockers = [];
  if (!checks.appIdentity) addBlocker(blockers, "app-identity-mismatch", "The provider app identity does not match the release target.");
  if (!checks.buildAssigned) addBlocker(blockers, "build-not-assigned", `Build ${options.version} (${options.build}) is not assigned.`);
  if (!checks.reviewDetailPresent) addBlocker(blockers, "review-detail-missing", "App Review information is missing.");
  if (!checks.contentRightsDeclared) addBlocker(blockers, "content-rights-missing", "The App Store content-rights declaration is unset.", "legal");
  if (!checks.ageRatingComplete) addBlocker(blockers, "age-rating-incomplete", `The current age-rating questionnaire has ${missingAgeRatingFields.length} unanswered field(s).`, "legal");
  if (!checks.idfaDeclared) addBlocker(blockers, "idfa-declaration-missing", "The App Store version has no explicit IDFA declaration.", "legal");
  if (!checks.screenshotsComplete) addBlocker(blockers, "screenshots-incomplete", `Expected ${metadata.screenshots.planned.length} approved ${metadata.screenshots.deviceClass} screenshots; Apple reports ${screenshotCount}.`, "creative");
  if (!checks.priceConfigured || !checks.expectedFreePriceConfigured) addBlocker(blockers, "price-not-configured", "The app has no active Free price selection.", "legal");
  if (!checks.availabilityConfigured) addBlocker(blockers, "availability-not-configured", "No App Availability resource exists; release territories are not configured.", "legal");
  else {
    if (!checks.territoryInventoryComplete) addBlocker(blockers, "territory-readback-incomplete", "Apple returned a partial territory inventory; readiness fails closed.");
    if (!checks.expectedTerritoriesAvailable) addBlocker(blockers, "expected-territory-unavailable", `The intended first-release territories are not all available: ${expectedTerritoryIds.join(", ")}.`, "legal");
    if (!checks.territoryStatusesClear) addBlocker(blockers, "territory-status-blocked", `Apple reports blocking territory status: ${blockingStatuses.join(", ")}.`, "legal");
  }
  addBlocker(blockers, "app-privacy-manual-publication", "App Privacy answers and Publish confirmation require App Store Connect verification.", "manual");
  addBlocker(blockers, "dsa-trader-manual-verification", traderStatusBlockers.length > 0
    ? `Apple reports: ${traderStatusBlockers.join(", ")}.`
    : "EU DSA trader identity remains an account-level legal verification.", "manual");
  addBlocker(blockers, `physical-build${options.build}-acceptance`, `Install Build ${options.build} from TestFlight on a physical iPhone and prove capture, recovery, upload, playback, alignment, and cross-device readback.`, "manual");
  addBlocker(blockers, "production-account-deletion-proof", "Prove account deletion against a disposable production account with independent readback.", "manual");
  if (metadata.compliance.compatibility.status !== "complete") {
    addBlocker(blockers, "device-compatibility-provider-cleanup", "Confirm iPhone-only availability and remove unintended Mac or Vision compatibility.", "manual");
  }

  const reviewSubmissions = (reviewSubmissionsDocument?.data || []).map((submission) => ({
    id: submission.id,
    platform: submission.attributes?.platform || null,
    state: submission.attributes?.state || null,
    submittedDate: submission.attributes?.submittedDate || null,
    appStoreVersionForReviewId: relationshipId(submission, "appStoreVersionForReview"),
    itemCount: submission.relationships?.items?.data?.length || 0,
  }));
  const providerChecksPassed = Object.values(checks).every(Boolean);

  return {
    schema: "quipsly-app-store-connect-submission-readiness-v1",
    auditedAt,
    mode: "read-only",
    app: {
      id: app.id,
      name: app.attributes?.name || null,
      bundleId: app.attributes?.bundleId || null,
      primaryLocale: app.attributes?.primaryLocale || null,
      isOrEverWasMadeForKids: app.attributes?.isOrEverWasMadeForKids === true,
    },
    version: {
      id: version.id,
      versionString: version.attributes?.versionString || null,
      buildNumber: options.build,
      expectedBuildId: options.buildId,
      assignedBuildId: relationshipId(version, "build"),
      appStoreState: version.attributes?.appStoreState || null,
      releaseType: version.attributes?.releaseType || null,
      usesIdfa: version.attributes?.usesIdfa ?? null,
    },
    contentRights: { value: contentRightsValue, complete: checks.contentRightsDeclared },
    ageRating: {
      declarationId: ageRating?.id || null,
      appStoreAgeRating: appInfo.attributes?.appStoreAgeRating || null,
      answeredQuestionCount: expectedAgeRatingFields.length - missingAgeRatingFields.length,
      expectedQuestionCount: expectedAgeRatingFields.length,
      missingFields: missingAgeRatingFields,
      complete: checks.ageRatingComplete,
    },
    screenshots: {
      locale: metadata.locale,
      expectedDeviceClass: metadata.screenshots.deviceClass,
      expectedDisplayTypes: wantedDisplayTypes,
      expectedCount: metadata.screenshots.planned.length,
      providerCount: screenshotCount,
      sets: screenshotSets,
      complete: checks.screenshotsComplete,
    },
    pricing: {
      scheduleId: priceScheduleDocument?.data?.id || null,
      baseTerritoryId: baseTerritoryDocument?.data?.id || null,
      activeSelections: priceSelections,
      expected: metadata.compliance.price.recommendedValue,
      complete: checks.priceConfigured && checks.expectedFreePriceConfigured,
    },
    availability: {
      id: availabilityDocument?.data?.id || null,
      reportedTerritoryCount: territoryTotal,
      readTerritoryCount: availability.readTerritoryCount,
      expectedTerritoryIds,
      availableTerritoryIds: availability.availableTerritoryIds,
      blockingContentStatuses: blockingStatuses,
      traderStatusBlockers,
      complete: checks.availabilityConfigured
        && checks.territoryInventoryComplete
        && checks.expectedTerritoriesAvailable
        && checks.territoryStatusesClear,
    },
    review: {
      detailPresent: reviewDetailPresent,
      submissionCount: reviewSubmissions.length,
      submissions: reviewSubmissions,
      submitted: reviewSubmissions.some((submission) => submission.submittedDate),
    },
    appPrivacy: {
      apiVerifiable: false,
      canonicalPublicationStatus: metadata.privacy.publicationStatus,
      status: "manual-verification-required",
    },
    checks,
    providerChecksPassed,
    submissionReady: providerChecksPassed && blockers.length === 0,
    blockers,
    externalMutation: false,
    sensitiveFieldsPrinted: false,
  };
}

async function discover({ options, key, locale }) {
  const requests = {
    app: makeRequest(`/v1/apps/${options.appId}`, [["fields[apps]", "name,bundleId,primaryLocale,isOrEverWasMadeForKids,contentRightsDeclaration"]]),
    appInfos: makeRequest(`/v1/apps/${options.appId}/appInfos`, [["include", "ageRatingDeclaration,appInfoLocalizations"], ["limit", "20"], ["limit[appInfoLocalizations]", "50"]]),
    versions: makeRequest(`/v1/apps/${options.appId}/appStoreVersions`, [["filter[platform]", "IOS"], ["filter[versionString]", options.version], ["include", "appStoreVersionLocalizations,appStoreReviewDetail,build"], ["limit", "20"], ["limit[appStoreVersionLocalizations]", "50"]]),
    availability: makeRequest(`/v1/apps/${options.appId}/appAvailabilityV2`),
    priceSchedule: makeRequest(`/v1/apps/${options.appId}/appPriceSchedule`),
    reviewSubmissions: makeRequest(`/v1/apps/${options.appId}/reviewSubmissions`, [["filter[platform]", "IOS"], ["include", "items,appStoreVersionForReview"], ["limit", "200"], ["limit[items]", "50"]]),
  };
  const [appDocument, appInfosDocument, versionsDocument, availabilityDocument,
    priceScheduleDocument, reviewSubmissionsDocument] = await Promise.all([
    requestJson({ request: requests.app, key }),
    requestJson({ request: requests.appInfos, key }),
    requestJson({ request: requests.versions, key }),
    requestJson({ request: requests.availability, key, optionalNotFound: true }),
    requestJson({ request: requests.priceSchedule, key, optionalNotFound: true }),
    requestJson({ request: requests.reviewSubmissions, key }),
  ]);

  const localization = included(versionsDocument, "appStoreVersionLocalizations").find(
    (resource) => resource.attributes?.locale === locale,
  );
  if (!localization) fail(`Could not resolve the ${locale} version localization.`);
  const screenshotRelationships = await requestJson({
    request: makeRequest(`/v1/appStoreVersionLocalizations/${localization.id}/relationships/appScreenshotSets`, [["limit", "200"]]),
    key,
  });
  const screenshotSetDocuments = await Promise.all((screenshotRelationships.data || []).map(
    (resource) => requestJson({
      request: makeRequest(`/v1/appScreenshotSets/${resource.id}`, [["include", "appScreenshots"], ["limit[appScreenshots]", "50"]]),
      key,
    }),
  ));

  let baseTerritoryDocument = null;
  let manualPricesDocument = null;
  let territoryAvailabilitiesDocument = null;
  if (availabilityDocument?.data?.id) {
    territoryAvailabilitiesDocument = await requestJson({
      request: makeRequest(
        `/v2/appAvailabilities/${availabilityDocument.data.id}/territoryAvailabilities`,
        [["include", "territory"], ["limit", "200"]],
      ),
      key,
    });
  }
  if (priceScheduleDocument?.data?.id) {
    const scheduleId = priceScheduleDocument.data.id;
    [baseTerritoryDocument, manualPricesDocument] = await Promise.all([
      requestJson({ request: makeRequest(`/v1/appPriceSchedules/${scheduleId}/baseTerritory`), key, optionalNotFound: true }),
      requestJson({
        request: makeRequest(`/v1/appPriceSchedules/${scheduleId}/manualPrices`, [["include", "appPricePoint,territory"], ["fields[appPricePoints]", "customerPrice"], ["fields[territories]", "currency"], ["limit", "200"]]),
        key,
        optionalNotFound: true,
      }),
    ]);
  }
  return {
    appDocument,
    appInfosDocument,
    versionsDocument,
    availabilityDocument,
    territoryAvailabilitiesDocument,
    priceScheduleDocument,
    baseTerritoryDocument,
    manualPricesDocument,
    reviewSubmissionsDocument,
    screenshotSetDocuments,
  };
}

async function writeReceipt(outputPath, receipt) {
  if (!outputPath) return;
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

export async function run(options) {
  const metadata = readAppStoreMetadata(options.metadataPath);
  const validation = validateAppStoreMetadata(metadata, { root: repositoryRoot });
  if (!validation.ok) fail(`Canonical App Store metadata failed validation: ${validation.errors.join(" ")}`);
  const key = await readApiKey(options.apiKeyPath);
  const documents = await discover({ options, key, locale: metadata.locale });
  const receipt = summarizeSubmissionReadiness({ options, metadata, ...documents });
  await writeReceipt(options.outputPath, receipt);
  return receipt;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const receipt = await run(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.submissionReady) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
