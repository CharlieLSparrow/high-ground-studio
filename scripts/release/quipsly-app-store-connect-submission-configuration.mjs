#!/usr/bin/env node

import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { summarizeTerritoryAvailability } from "./quipsly-app-store-connect-availability.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultConfigurationPath = path.join(
  repositoryRoot,
  "release/app-store/quipsly-capture/submission-configuration.json",
);
const CONTENT_FREQUENCIES = new Set([
  "NONE",
  "INFREQUENT_OR_MILD",
  "FREQUENT_OR_INTENSE",
]);
const BOOLEAN_AGE_FIELDS = Object.freeze([
  "advertising",
  "ageAssurance",
  "gambling",
  "healthOrWellnessTopics",
  "lootBox",
  "messagingAndChat",
  "parentalControls",
  "socialMedia",
  "socialMediaAgeRestricted",
  "unrestrictedWebAccess",
  "userGeneratedContent",
]);
const FREQUENCY_AGE_FIELDS = Object.freeze([
  "alcoholTobaccoOrDrugUseOrReferences",
  "contests",
  "gamblingSimulated",
  "gunsOrOtherWeapons",
  "horrorOrFearThemes",
  "matureOrSuggestiveThemes",
  "medicalOrTreatmentInformation",
  "profanityOrCrudeHumor",
  "sexualContentGraphicAndNudity",
  "sexualContentOrNudity",
  "violenceCartoonOrFantasy",
  "violenceRealistic",
  "violenceRealisticProlongedGraphicOrSadistic",
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
    apply: false,
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    configurationPath: defaultConfigurationPath,
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    buildId: QUIPSLY_CAPTURE_RELEASE_TARGET.buildId,
    confirmTarget: "",
    outputPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--apply": options.apply = true; break;
      case "--api-key-path": options.apiKeyPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--configuration": options.configurationPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--app-id": options.appId = requiredValue(argv, index, argument); index += 1; break;
      case "--version": options.version = requiredValue(argv, index, argument); index += 1; break;
      case "--build": options.build = requiredValue(argv, index, argument); index += 1; break;
      case "--build-id": options.buildId = requiredValue(argv, index, argument); index += 1; break;
      case "--confirm-target": options.confirmTarget = requiredValue(argv, index, argument); index += 1; break;
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
  node scripts/release/quipsly-app-store-connect-submission-configuration.mjs [options]

Default mode is a read-only plan. The only mutation mode is --apply with the
exact --confirm-target APP_ID/VERSION/BUILD. It can set source-backed content
rights, age-rating, IDFA, Free pricing, USA-first availability, and App Store
Server Notifications V2 URLs. It cannot upload screenshots, publish App
Privacy, change DSA identity, create a review submission, submit a version, or
release an app.
`;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateConfiguration(configuration, expected) {
  const errors = [];
  if (!isObject(configuration) || configuration.schemaVersion !== 1) {
    errors.push("configuration schemaVersion must be 1");
    return errors;
  }
  for (const key of ["appId", "version", "build"]) {
    if (configuration[key] !== expected[key]) errors.push(`${key} must equal ${expected[key]}`);
  }
  if (configuration.contentRightsDeclaration !== "USES_THIRD_PARTY_CONTENT") {
    errors.push("contentRightsDeclaration must conservatively declare third-party content");
  }
  if (configuration.usesIdfa !== false) errors.push("usesIdfa must be false");
  if (!isObject(configuration.ageRating)) errors.push("ageRating must be an object");
  for (const field of BOOLEAN_AGE_FIELDS) {
    if (typeof configuration.ageRating?.[field] !== "boolean") {
      errors.push(`ageRating.${field} must be boolean`);
    }
  }
  for (const field of FREQUENCY_AGE_FIELDS) {
    if (!CONTENT_FREQUENCIES.has(configuration.ageRating?.[field])) {
      errors.push(`ageRating.${field} has an unsupported frequency`);
    }
  }
  if (configuration.ageRating?.ageRatingOverrideV2 !== "THIRTEEN_PLUS") {
    errors.push("ageRating.ageRatingOverrideV2 must use the conservative THIRTEEN_PLUS override");
  }
  if (
    configuration.pricing?.customerPrice !== "0.0"
    || configuration.pricing?.baseTerritory !== "USA"
  ) errors.push("pricing must be Free with USA as the base territory");
  if (
    configuration.availability?.availableInNewTerritories !== false
    || JSON.stringify(configuration.availability?.territories) !== JSON.stringify(["USA"])
  ) errors.push("availability must be USA-only without automatic new-territory expansion");
  const notifications = configuration.serverNotifications;
  for (const field of ["productionUrl", "sandboxUrl"]) {
    try {
      const url = new URL(notifications?.[field]);
      if (
        url.protocol !== "https:"
        || url.origin !== "https://nest.quipsly.com"
        || url.pathname !== "/api/billing/app-store/notifications"
        || url.search
        || url.hash
      ) errors.push(`serverNotifications.${field} must use the canonical HTTPS notification route`);
    } catch {
      errors.push(`serverNotifications.${field} must be a valid URL`);
    }
  }
  if (notifications?.version !== "V2") {
    errors.push("serverNotifications.version must be V2");
  }
  if (configuration.screenshots?.uploadApproved !== false) {
    errors.push("draft screenshot upload must remain disabled");
  }
  if (configuration.reviewSubmission?.allowed !== false) {
    errors.push("review submission must remain disabled");
  }
  return errors;
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

function apiRequest(requestPath, method = "GET", search = []) {
  const url = new URL(requestPath, API_ORIGIN);
  for (const [key, value] of search) url.searchParams.append(key, value);
  return {
    method,
    url: url.toString(),
    scope: `${method} ${decodeURIComponent(`${url.pathname}${url.search}`)}`,
  };
}

export function tokenScopesForRequest(request) {
  return request.method === "GET" ? [request.scope] : undefined;
}

async function requestJson({ request, key, body, optionalNotFound = false }) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Apple only supports the JWT scope claim for GET operations. Mutations
    // therefore use a short-lived unscoped token whose authority is still
    // bounded by this operator and the App Store Connect key's assigned role.
    const token = createScopedToken({
      ...key,
      scopes: tokenScopesForRequest(request),
    });
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const document = await response.json().catch(() => ({}));
    if (response.ok) return document;
    if (optionalNotFound && response.status === 404) return null;
    const providerErrors = document.errors || [];
    const errors = providerErrors.slice(0, 20).map(({ status, code, title, detail, source }) => ({
      status, code, title, detail, source,
    }));
    finalError = new Error(
      `App Store Connect returned HTTP ${response.status} with ${providerErrors.length} error(s): ${JSON.stringify(errors)}`,
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

function ageRatingMatches(actual, desired) {
  return Object.entries(desired).every(([field, value]) => actual?.attributes?.[field] === value);
}

function activePrices(manualPricesDocument) {
  return (manualPricesDocument?.data || []).filter((price) => {
    const endDate = price.attributes?.endDate;
    return endDate == null || Date.parse(endDate) > Date.now();
  }).map((price) => {
    const pointId = relationshipId(price, "appPricePoint");
    const point = included(manualPricesDocument, "appPricePoints").find(
      (candidate) => candidate.id === pointId,
    );
    return {
      priceId: price.id,
      pointId,
      customerPrice: point?.attributes?.customerPrice ?? null,
      territoryId: relationshipId(price, "territory"),
    };
  });
}

export function buildFreePriceScheduleBody({ appId, pricePointId }) {
  const priceId = "${quipsly-free-usa}";
  return {
    data: {
      type: "appPriceSchedules",
      relationships: {
        app: { data: { type: "apps", id: appId } },
        baseTerritory: { data: { type: "territories", id: "USA" } },
        manualPrices: { data: [{ type: "appPrices", id: priceId }] },
      },
    },
    included: [{
      type: "appPrices",
      id: priceId,
      attributes: { startDate: null, endDate: null },
      relationships: {
        appPricePoint: { data: { type: "appPricePoints", id: pricePointId } },
      },
    }],
  };
}

export function buildAvailabilityBody({ appId, territoryIds }) {
  const normalizedTerritories = [...new Set(territoryIds || [])].sort();
  if (!normalizedTerritories.includes("USA") || normalizedTerritories.length < 2) {
    fail("Availability creation requires Apple's complete territory catalog including USA.");
  }
  const inlineTerritories = normalizedTerritories.map((territoryId) => ({
    type: "territoryAvailabilities",
    id: `\${quipsly-${territoryId.toLowerCase()}}`,
    attributes: {
      available: territoryId === "USA",
      preOrderEnabled: false,
    },
    relationships: {
      territory: { data: { type: "territories", id: territoryId } },
    },
  }));
  return {
    data: {
      type: "appAvailabilities",
      attributes: { availableInNewTerritories: false },
      relationships: {
        app: { data: { type: "apps", id: appId } },
        territoryAvailabilities: {
          data: inlineTerritories.map(({ type, id }) => ({ type, id })),
        },
      },
    },
    included: inlineTerritories,
  };
}

async function discover({ options, key }) {
  const [appDocument, appInfosDocument, versionsDocument, availabilityDocument,
    priceScheduleDocument, pricePointsDocument, territoriesDocument] = await Promise.all([
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}`, "GET", [["fields[apps]", "name,bundleId,primaryLocale,isOrEverWasMadeForKids,contentRightsDeclaration,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox"]]),
      key,
    }),
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}/appInfos`, "GET", [["include", "ageRatingDeclaration"], ["limit", "20"]]),
      key,
    }),
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}/appStoreVersions`, "GET", [["filter[platform]", "IOS"], ["filter[versionString]", options.version], ["include", "build"], ["limit", "20"]]),
      key,
    }),
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}/appAvailabilityV2`),
      key,
      optionalNotFound: true,
    }),
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}/appPriceSchedule`),
      key,
      optionalNotFound: true,
    }),
    requestJson({
      request: apiRequest(`/v1/apps/${options.appId}/appPricePoints`, "GET", [["filter[territory]", "USA"], ["fields[appPricePoints]", "customerPrice,proceeds,territory"], ["include", "territory"], ["limit", "200"]]),
      key,
    }),
    requestJson({
      request: apiRequest("/v1/territories", "GET", [["limit", "200"]]),
      key,
    }),
  ]);
  const appInfo = (appInfosDocument.data || []).find(
    (resource) => resource.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
  ) || (appInfosDocument.data || [])[0];
  const ageRating = included(appInfosDocument, "ageRatingDeclarations").find(
    (resource) => resource.id === relationshipId(appInfo, "ageRatingDeclaration"),
  ) || included(appInfosDocument, "ageRatingDeclarations")[0];
  const version = (versionsDocument.data || []).find(
    (resource) => resource.attributes?.platform === "IOS"
      && resource.attributes?.versionString === options.version,
  );
  if (!appDocument.data || !appInfo || !ageRating || !version) {
    fail("Could not resolve the exact editable app, App Info, age rating, and iOS version.");
  }
  if (relationshipId(version, "build") !== options.buildId) {
    fail(`iOS ${options.version} is not assigned to exact Build ${options.build}.`);
  }
  let manualPricesDocument = null;
  if (priceScheduleDocument?.data?.id) {
    manualPricesDocument = await requestJson({
      request: apiRequest(`/v1/appPriceSchedules/${priceScheduleDocument.data.id}/manualPrices`, "GET", [["include", "appPricePoint,territory"], ["fields[appPricePoints]", "customerPrice"], ["limit", "200"]]),
      key,
      optionalNotFound: true,
    });
  }
  let territoryAvailabilitiesDocument = null;
  if (availabilityDocument?.data?.id) {
    territoryAvailabilitiesDocument = await requestJson({
      request: apiRequest(
        `/v2/appAvailabilities/${availabilityDocument.data.id}/territoryAvailabilities`,
        "GET",
        [["include", "territory"], ["limit", "200"]],
      ),
      key,
    });
  }
  return {
    appDocument,
    appInfo,
    ageRating,
    version,
    availabilityDocument,
    priceScheduleDocument,
    pricePointsDocument,
    territoriesDocument,
    territoryAvailabilitiesDocument,
    manualPricesDocument,
  };
}

export function summarizeConfiguration({
  options,
  configuration,
  documents,
  applied = false,
  externalMutation = false,
  auditedAt = new Date().toISOString(),
}) {
  const active = activePrices(documents.manualPricesDocument);
  const freePrice = active.find(
    (price) => price.territoryId === "USA" && Number(price.customerPrice) === 0,
  );
  const freePoint = (documents.pricePointsDocument?.data || []).find(
    (point) => Number(point.attributes?.customerPrice) === 0,
  );
  const availability = summarizeTerritoryAvailability({
    availabilityDocument: documents.availabilityDocument,
    territoryAvailabilitiesDocument: documents.territoryAvailabilitiesDocument,
  });
  const availableTerritories = availability.availableTerritoryIds;
  const blockingStatuses = availability.blockingContentStatuses;
  const territoryCatalogIds = (documents.territoriesDocument?.data || [])
    .map((territory) => territory.id)
    .filter(Boolean)
    .sort();
  const checks = {
    exactApp: documents.appDocument.data.id === options.appId
      && documents.appDocument.data.attributes?.bundleId === QUIPSLY_CAPTURE_RELEASE_TARGET.bundleId,
    exactBuild: relationshipId(documents.version, "build") === options.buildId,
    editable: documents.appInfo.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION"
      && documents.version.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
    contentRights: documents.appDocument.data.attributes?.contentRightsDeclaration
      === configuration.contentRightsDeclaration,
    ageRating: ageRatingMatches(documents.ageRating, configuration.ageRating)
      && Boolean(documents.appInfo.attributes?.appStoreAgeRating),
    idfa: documents.version.attributes?.usesIdfa === false,
    freePrice: Boolean(freePrice),
    usaOnlyAvailability: Boolean(documents.availabilityDocument?.data)
      && documents.availabilityDocument.data.attributes?.availableInNewTerritories === false
      && availability.inventoryComplete
      && JSON.stringify(availableTerritories) === JSON.stringify(["USA"]),
    availabilityClear: blockingStatuses.length === 0,
    serverNotifications:
      documents.appDocument.data.attributes?.subscriptionStatusUrl
        === configuration.serverNotifications.productionUrl
      && documents.appDocument.data.attributes?.subscriptionStatusUrlForSandbox
        === configuration.serverNotifications.sandboxUrl
      && documents.appDocument.data.attributes?.subscriptionStatusUrlVersion
        === configuration.serverNotifications.version
      && documents.appDocument.data.attributes?.subscriptionStatusUrlVersionForSandbox
        === configuration.serverNotifications.version,
    territoryCatalogLoaded: territoryCatalogIds.length > 1
      && territoryCatalogIds.includes("USA"),
    screenshotsHeld: configuration.screenshots.uploadApproved === false,
    reviewSubmissionProhibited: configuration.reviewSubmission.allowed === false,
  };
  const actions = [];
  if (!checks.contentRights) actions.push("patch-content-rights");
  if (!checks.ageRating) actions.push("patch-age-rating");
  if (!checks.idfa) actions.push("patch-idfa-false");
  if (!checks.freePrice) actions.push("create-free-usa-price");
  if (!checks.usaOnlyAvailability) actions.push("create-usa-only-availability");
  if (!checks.serverNotifications) actions.push("patch-server-notifications-v2");
  const blockers = [];
  if (!checks.exactApp || !checks.exactBuild || !checks.editable) blockers.push("target-not-exact-or-editable");
  if (active.length > 0 && !freePrice) blockers.push("nonfree-active-price-requires-separate-review");
  if (documents.availabilityDocument?.data && !checks.usaOnlyAvailability) {
    blockers.push("existing-availability-requires-separate-review");
  }
  if (!freePoint && !checks.freePrice) blockers.push("free-usa-price-point-missing");
  if (!checks.territoryCatalogLoaded && !checks.usaOnlyAvailability) {
    blockers.push("app-store-territory-catalog-incomplete");
  }
  const submissionGates = [];
  if (!checks.availabilityClear) submissionGates.push("availability-content-status-blocked");
  const configurationCheckNames = [
    "exactApp",
    "exactBuild",
    "editable",
    "contentRights",
    "ageRating",
    "idfa",
    "freePrice",
    "usaOnlyAvailability",
    "serverNotifications",
    "territoryCatalogLoaded",
    "screenshotsHeld",
    "reviewSubmissionProhibited",
  ];
  return {
    schema: "quipsly-app-store-submission-configuration-v1",
    auditedAt,
    mode: applied ? "applied-and-read-back" : "read-only-plan",
    target: {
      appId: options.appId,
      version: options.version,
      build: options.build,
      buildId: options.buildId,
      ageRatingDeclarationId: documents.ageRating.id,
    },
    desired: {
      contentRightsDeclaration: configuration.contentRightsDeclaration,
      usesIdfa: configuration.usesIdfa,
      ageRating: configuration.ageRating,
      pricing: configuration.pricing,
      availability: configuration.availability,
      serverNotifications: configuration.serverNotifications,
      screenshotsUploadApproved: false,
      reviewSubmissionAllowed: false,
    },
    observed: {
      contentRightsDeclaration: documents.appDocument.data.attributes?.contentRightsDeclaration ?? null,
      usesIdfa: documents.version.attributes?.usesIdfa ?? null,
      appStoreAgeRating: documents.appInfo.attributes?.appStoreAgeRating ?? null,
      activePrices: active,
      availableTerritories,
      blockingStatuses,
      reportedTerritoryCount: availability.reportedTerritoryCount,
      readTerritoryCount: availability.readTerritoryCount,
      territoryCatalogCount: territoryCatalogIds.length,
      freePricePointResolved: Boolean(freePoint),
      serverNotifications: {
        productionUrl: documents.appDocument.data.attributes?.subscriptionStatusUrl ?? null,
        sandboxUrl: documents.appDocument.data.attributes?.subscriptionStatusUrlForSandbox ?? null,
        productionVersion: documents.appDocument.data.attributes?.subscriptionStatusUrlVersion ?? null,
        sandboxVersion: documents.appDocument.data.attributes?.subscriptionStatusUrlVersionForSandbox ?? null,
      },
    },
    checks,
    actions,
    blockers,
    submissionGates,
    configurationComplete: configurationCheckNames.every((name) => checks[name])
      && blockers.length === 0,
    externalMutation,
    screenshotsUploaded: false,
    reviewSubmissionCreated: false,
    appPrivacyPublished: false,
    dsaIdentityChanged: false,
    sensitiveFieldsPrinted: false,
  };
}

async function applyConfiguration({ options, configuration, documents, key }) {
  const plan = summarizeConfiguration({ options, configuration, documents });
  if (plan.blockers.length > 0) fail(`Apply is blocked: ${plan.blockers.join(", ")}.`);
  const wanted = new Set(plan.actions);
  const appliedActions = [];
  let activeAction = "";
  const applyAction = async (action, operation) => {
    if (!wanted.has(action)) return;
    activeAction = action;
    await operation();
    appliedActions.push(action);
    activeAction = "";
  };
  try {
    await applyAction("patch-content-rights", () => requestJson({
      request: apiRequest(`/v1/apps/${options.appId}`, "PATCH"),
      key,
      body: { data: { type: "apps", id: options.appId, attributes: {
        contentRightsDeclaration: configuration.contentRightsDeclaration,
      } } },
    }));
    await applyAction("patch-age-rating", () => requestJson({
      request: apiRequest(`/v1/ageRatingDeclarations/${documents.ageRating.id}`, "PATCH"),
      key,
      body: { data: { type: "ageRatingDeclarations", id: documents.ageRating.id, attributes: configuration.ageRating } },
    }));
    await applyAction("patch-idfa-false", () => requestJson({
      request: apiRequest(`/v1/appStoreVersions/${documents.version.id}`, "PATCH"),
      key,
      body: { data: { type: "appStoreVersions", id: documents.version.id, attributes: { usesIdfa: false } } },
    }));
    await applyAction("patch-server-notifications-v2", () => requestJson({
      request: apiRequest(`/v1/apps/${options.appId}`, "PATCH"),
      key,
      body: { data: { type: "apps", id: options.appId, attributes: {
        subscriptionStatusUrl: configuration.serverNotifications.productionUrl,
        subscriptionStatusUrlVersion: configuration.serverNotifications.version,
        subscriptionStatusUrlForSandbox: configuration.serverNotifications.sandboxUrl,
        subscriptionStatusUrlVersionForSandbox: configuration.serverNotifications.version,
      } } },
    }));
    await applyAction("create-free-usa-price", () => {
      const freePoint = documents.pricePointsDocument.data.find(
        (point) => Number(point.attributes?.customerPrice) === 0,
      );
      return requestJson({
        request: apiRequest("/v1/appPriceSchedules", "POST"),
        key,
        body: buildFreePriceScheduleBody({ appId: options.appId, pricePointId: freePoint.id }),
      });
    });
    await applyAction("create-usa-only-availability", () => requestJson({
      request: apiRequest("/v2/appAvailabilities", "POST"),
      key,
      body: buildAvailabilityBody({
        appId: options.appId,
        territoryIds: documents.territoriesDocument.data.map((territory) => territory.id),
      }),
    }));
  } catch (error) {
    error.appliedActions = [...appliedActions];
    error.failedAction = activeAction || "unknown";
    throw error;
  }
  return appliedActions;
}

async function writeReceipt(outputPath, receipt) {
  if (!outputPath) return;
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

export async function verifyConfigurationWithRetry({
  readReceipt,
  maxAttempts = 5,
  initialDelayMilliseconds = 250,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let receipt;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    receipt = await readReceipt();
    if (receipt.configurationComplete || attempt === maxAttempts) {
      return { receipt, attempts: attempt };
    }
    await sleep(initialDelayMilliseconds * (2 ** (attempt - 1)));
  }
  return { receipt, attempts: maxAttempts };
}

export async function run(options) {
  const configuration = JSON.parse(await readFile(options.configurationPath, "utf8"));
  const errors = validateConfiguration(configuration, {
    appId: options.appId,
    version: options.version,
    build: options.build,
  });
  if (errors.length > 0) fail(`Invalid submission configuration: ${errors.join("; ")}.`);
  const key = await readApiKey(options.apiKeyPath);
  let documents = await discover({ options, key });
  let receipt = summarizeConfiguration({ options, configuration, documents });
  if (options.apply) {
    const expectedConfirmation = `${options.appId}/${options.version}/${options.build}`;
    if (options.confirmTarget !== expectedConfirmation) {
      fail(`--apply requires --confirm-target ${expectedConfirmation}.`);
    }
    const plannedActions = [...receipt.actions];
    await writeReceipt(options.outputPath, {
      ...receipt,
      mode: "apply-intent",
      confirmedTarget: expectedConfirmation,
    });
    try {
      const appliedActions = await applyConfiguration({ options, configuration, documents, key });
      receipt.appliedActions = appliedActions;
    } catch (error) {
      const appliedActions = Array.isArray(error?.appliedActions)
        ? error.appliedActions
        : [];
      documents = await discover({ options, key });
      receipt = {
        ...summarizeConfiguration({
          options,
          configuration,
          documents,
          applied: true,
          externalMutation: appliedActions.length > 0,
        }),
        mode: "apply-failed-read-back",
        plannedActions,
        appliedActions,
        failedAction: typeof error?.failedAction === "string"
          ? error.failedAction
          : "unknown",
        applyError: error instanceof Error
          ? error.message.slice(0, 2_000)
          : "Unknown App Store configuration failure.",
      };
      await writeReceipt(options.outputPath, receipt);
      throw error;
    }
    const verification = await verifyConfigurationWithRetry({
      readReceipt: async () => {
        documents = await discover({ options, key });
        return summarizeConfiguration({
          options,
          configuration,
          documents,
          applied: true,
          externalMutation: plannedActions.length > 0,
        });
      },
    });
    receipt = verification.receipt;
    receipt.verificationAttempts = verification.attempts;
    receipt.plannedActions = plannedActions;
    receipt.appliedActions = plannedActions;
    await writeReceipt(options.outputPath, receipt);
    if (!receipt.configurationComplete) {
      fail(`Applied configuration did not pass readback: ${receipt.actions.join(", ")} ${receipt.blockers.join(", ")}`.trim());
    }
  }
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
  if (!receipt.configurationComplete) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
