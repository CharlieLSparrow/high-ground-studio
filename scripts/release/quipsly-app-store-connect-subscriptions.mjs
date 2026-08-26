#!/usr/bin/env node

import { sign } from "node:crypto";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const GROUP_REFERENCE_NAME = "Quipsly Coach";
const DEFAULT_TERRITORY = "USA";
const PRODUCTS = Object.freeze([
  Object.freeze({
    key: "monthly",
    name: "Quipsly Coach Monthly",
    productId: "com.quipsly.capture.coach.monthly",
    subscriptionPeriod: "ONE_MONTH",
    customerPrice: "29.99",
    localizationName: "Quipsly Coach Monthly",
    localizationDescription:
      "Record, transcribe, edit, and share coaching sessions.",
  }),
  Object.freeze({
    key: "annual",
    name: "Quipsly Coach Annual",
    productId: "com.quipsly.capture.coach.annual",
    subscriptionPeriod: "ONE_YEAR",
    customerPrice: "299.99",
    localizationName: "Quipsly Coach Annual",
    localizationDescription:
      "A year of recording, transcription, and coaching tools.",
  }),
]);

function fail(message) {
  throw new Error(message);
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function mutationConfirmation(appId = QUIPSLY_CAPTURE_RELEASE_TARGET.appId) {
  return [appId, ...PRODUCTS.map((product) => product.productId)].join("/");
}

export function subscriptionCatalogProducts() {
  return PRODUCTS;
}

export function parseArguments(argv) {
  const options = {
    apply: false,
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    confirmTarget: "",
    outputPath: "",
    territory: DEFAULT_TERRITORY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--api-key-path":
        options.apiKeyPath = path.resolve(valueAfter(argv, index, argument));
        index += 1;
        break;
      case "--app-id":
        options.appId = valueAfter(argv, index, argument);
        index += 1;
        break;
      case "--confirm-target":
        options.confirmTarget = valueAfter(argv, index, argument);
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(valueAfter(argv, index, argument));
        index += 1;
        break;
      case "--territory":
        options.territory = valueAfter(argv, index, argument).toUpperCase();
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export function validateMutationTarget(options) {
  if (!options.apply) return;
  const expected = mutationConfirmation(options.appId);
  if (options.confirmTarget !== expected) {
    fail(`--apply requires --confirm-target ${expected}.`);
  }
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-app-store-connect-subscriptions.mjs [options]

Default mode is read-only. It reports the current Quipsly Capture subscription
catalog without changing App Store Connect.

Apply mode creates or reconciles the exact Quipsly Coach subscription group,
monthly and annual products, versioned en-US metadata, USA availability and
prices, and a two-week free trial. It never submits products for App Review and
does not configure Server Notifications.

Required:
  --api-key-path <path>       Mode-0600 App Store Connect API-key JSON.

Required for --apply:
  --confirm-target <value>    Exact app/product target printed by read-only mode.

Optional:
  --app-id <id>               Defaults to ${QUIPSLY_CAPTURE_RELEASE_TARGET.appId}.
  --territory <code>          Defaults to ${DEFAULT_TERRITORY}.
  --output <path>             Write a mode-0600 JSON receipt.
`;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createToken({ keyId, issuerId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encodeJson({
    iss: issuerId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: "appstoreconnect-v1",
  })}`;
  const signature = sign(null, Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath) fail("--api-key-path or APP_STORE_CONNECT_API_KEY_PATH is required.");
  const fileStat = await stat(apiKeyPath);
  if ((fileStat.mode & 0o077) !== 0) {
    fail("App Store Connect API key JSON must have mode 0600.");
  }
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) {
      fail(`App Store Connect API key is missing ${field}.`);
    }
  }
  return {
    keyId: document.key_id.trim(),
    issuerId: document.issuer_id.trim(),
    privateKey: document.key,
  };
}

function requestURL(requestPath, search = []) {
  const url = new URL(requestPath, API_ORIGIN);
  for (const [key, value] of search) url.searchParams.append(key, value);
  return url.toString();
}

async function requestJson({ token, method = "GET", requestPath, search, body }) {
  const maxAttempts = method === "GET" ? 3 : 1;
  let finalError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(requestURL(requestPath, search), {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 204) return { data: null };
      const document = await response.json().catch(() => ({}));
      if (response.ok) return document;
      const errors = (document.errors || []).map(
        ({ status, code, title, detail }) => ({ status, code, title, detail }),
      );
      finalError = new Error(
        `App Store Connect returned HTTP ${response.status}: ${JSON.stringify(errors)}`,
      );
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      finalError = error;
    }
    if (attempt + 1 < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw finalError;
}

export function mergeCollectionDocuments(documents) {
  const merged = { ...(documents[0] || {}), data: [], included: [] };
  const included = new Map();
  for (const document of documents) {
    merged.data.push(...(document.data || []));
    for (const resource of document.included || []) {
      included.set(`${resource.type}:${resource.id}`, resource);
    }
  }
  merged.included = [...included.values()];
  merged.links = documents.at(-1)?.links || merged.links;
  return merged;
}

async function requestPaginatedJson({ token, requestPath, search }) {
  const documents = [];
  let nextPath = requestPath;
  let nextSearch = search;
  for (let page = 0; nextPath && page < 50; page += 1) {
    const document = await requestJson({ token, requestPath: nextPath, search: nextSearch });
    documents.push(document);
    nextPath = document.links?.next || "";
    nextSearch = undefined;
  }
  if (nextPath) fail("App Store Connect pagination exceeded 50 pages.");
  return mergeCollectionDocuments(documents);
}

function relationshipId(resource, name) {
  return resource?.relationships?.[name]?.data?.id || null;
}

async function listGroups({ token, appId }) {
  return requestJson({
    token,
    requestPath: `/v1/apps/${encodeURIComponent(appId)}/subscriptionGroups`,
    search: [
      ["include", "subscriptions"],
      ["limit", "50"],
      ["limit[subscriptions]", "50"],
    ],
  });
}

function locateCatalog(groupDocument) {
  const group = (groupDocument.data || []).find(
    (candidate) => candidate.attributes?.referenceName === GROUP_REFERENCE_NAME,
  ) || null;
  const groupSubscriptions = group
    ? new Set((group.relationships?.subscriptions?.data || []).map(({ id }) => id))
    : new Set();
  const subscriptions = (groupDocument.included || []).filter(
    (resource) =>
      resource.type === "subscriptions" && groupSubscriptions.has(resource.id),
  );
  return { group, subscriptions };
}

async function ensureGroup({ token, appId, current, apply, changes }) {
  if (current.group) return current.group;
  if (!apply) return null;
  const created = await requestJson({
    token,
    method: "POST",
    requestPath: "/v1/subscriptionGroups",
    body: {
      data: {
        type: "subscriptionGroups",
        attributes: { referenceName: GROUP_REFERENCE_NAME },
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    },
  });
  changes.push("created subscription group");
  return created.data;
}

async function ensureSubscription({ token, groupId, product, current, apply, changes }) {
  const existing = current.subscriptions.find(
    (candidate) => candidate.attributes?.productId === product.productId,
  );
  if (existing) return existing;
  if (!apply || !groupId) return null;
  const created = await requestJson({
    token,
    method: "POST",
    requestPath: "/v1/subscriptions",
    body: {
      data: {
        type: "subscriptions",
        attributes: {
          name: product.name,
          productId: product.productId,
          familySharable: false,
          subscriptionPeriod: product.subscriptionPeriod,
          groupLevel: 1,
          reviewNote:
            "Quipsly Coach includes scheduling, consent-aware calling, participant-owned recording, transcription, basic editing, and shared follow-through.",
        },
        relationships: {
          group: { data: { type: "subscriptionGroups", id: groupId } },
        },
      },
    },
  });
  changes.push(`created ${product.key} subscription`);
  return created.data;
}

async function ensureVersionedSubscriptionMetadata({ token, subscription, product, apply, changes }) {
  if (!subscription) return;
  let versions = await requestJson({
    token,
    requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/versions`,
    search: [["include", "localizations"], ["limit", "50"], ["limit[localizations]", "50"]],
  });
  let version = (versions.data || []).find(
    (candidate) => candidate.attributes?.state === "PREPARE_FOR_SUBMISSION",
  ) || versions.data?.[0] || null;
  if (!version && apply) {
    const created = await requestJson({
      token,
      method: "POST",
      requestPath: "/v1/subscriptionVersions",
      body: {
        data: {
          type: "subscriptionVersions",
          relationships: {
            subscription: {
              data: { type: "subscriptions", id: subscription.id },
            },
          },
        },
      },
    });
    version = created.data;
    changes.push(`created ${product.key} metadata version`);
    versions = { data: [version], included: [] };
  }
  if (!version) return;

  const localizationIds = new Set(
    (version.relationships?.localizations?.data || []).map(({ id }) => id),
  );
  const localization = (versions.included || []).find(
    (candidate) =>
      candidate.type === "subscriptionLocalizations" &&
      localizationIds.has(candidate.id) &&
      candidate.attributes?.locale === "en-US",
  );
  if (!localization && apply) {
    await requestJson({
      token,
      method: "POST",
      requestPath: "/v2/subscriptionLocalizations",
      body: {
        data: {
          type: "subscriptionLocalizations",
          attributes: {
            locale: "en-US",
            name: product.localizationName,
            description: product.localizationDescription,
          },
          relationships: {
            version: {
              data: { type: "subscriptionVersions", id: version.id },
            },
          },
        },
      },
    });
    changes.push(`created ${product.key} en-US localization`);
  }
}

async function ensureGroupMetadata({ token, group, apply, changes }) {
  if (!group) return;
  let versions = await requestJson({
    token,
    requestPath: `/v1/subscriptionGroups/${encodeURIComponent(group.id)}/versions`,
    search: [["include", "localizations"], ["limit", "50"], ["limit[localizations]", "50"]],
  });
  let version = (versions.data || []).find(
    (candidate) => candidate.attributes?.state === "PREPARE_FOR_SUBMISSION",
  ) || versions.data?.[0] || null;
  if (!version && apply) {
    const created = await requestJson({
      token,
      method: "POST",
      requestPath: "/v1/subscriptionGroupVersions",
      body: {
        data: {
          type: "subscriptionGroupVersions",
          relationships: {
            subscriptionGroup: {
              data: { type: "subscriptionGroups", id: group.id },
            },
          },
        },
      },
    });
    version = created.data;
    changes.push("created subscription group metadata version");
    versions = { data: [version], included: [] };
  }
  if (!version) return;

  const localizationIds = new Set(
    (version.relationships?.localizations?.data || []).map(({ id }) => id),
  );
  const localization = (versions.included || []).find(
    (candidate) =>
      candidate.type === "subscriptionGroupLocalizations" &&
      localizationIds.has(candidate.id) &&
      candidate.attributes?.locale === "en-US",
  );
  if (!localization && apply) {
    await requestJson({
      token,
      method: "POST",
      requestPath: "/v2/subscriptionGroupLocalizations",
      body: {
        data: {
          type: "subscriptionGroupLocalizations",
          attributes: {
            locale: "en-US",
            name: GROUP_REFERENCE_NAME,
            customAppName: "Quipsly Capture",
          },
          relationships: {
            version: {
              data: { type: "subscriptionGroupVersions", id: version.id },
            },
          },
        },
      },
    });
    changes.push("created subscription group en-US localization");
  }
}

async function ensurePlanAvailability({ token, subscription, territory, apply, changes, product }) {
  if (!subscription) return;
  const current = await requestJson({
    token,
    requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/planAvailabilities`,
    search: [["include", "availableTerritories"], ["limit", "50"], ["limit[availableTerritories]", "50"]],
  });
  const availableTerritoryIds = new Set(
    (current.included || [])
      .filter((resource) => resource.type === "territories")
      .map((resource) => resource.id),
  );
  const configured = (current.data || []).some(
    (resource) =>
      resource.attributes?.planType === "UPFRONT" &&
      availableTerritoryIds.has(territory),
  );
  if (configured || !apply) return;
  await requestJson({
    token,
    method: "POST",
    requestPath: "/v1/subscriptionPlanAvailabilities",
    body: {
      data: {
        type: "subscriptionPlanAvailabilities",
        attributes: {
          planType: "UPFRONT",
          availableInNewTerritories: false,
        },
        relationships: {
          subscription: {
            data: { type: "subscriptions", id: subscription.id },
          },
          availableTerritories: {
            data: [{ type: "territories", id: territory }],
          },
        },
      },
    },
  });
  changes.push(`enabled ${product.key} in ${territory}`);
}

async function readPrices({ token, subscription, territory }) {
  return requestJson({
    token,
    requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/prices`,
    search: [
      ["filter[planType]", "UPFRONT"],
      ["filter[territory]", territory],
      ["include", "subscriptionPricePoint,territory"],
      ["limit", "50"],
    ],
  });
}

function includedPrice(prices, priceId) {
  return (prices.included || []).find(
    (resource) => resource.type === "subscriptionPricePoints" && resource.id === priceId,
  );
}

async function ensurePrice({ token, subscription, territory, apply, changes, product }) {
  if (!subscription) return;
  const prices = await readPrices({ token, subscription, territory });
  const matching = (prices.data || []).some((price) => {
    const pricePoint = includedPrice(prices, relationshipId(price, "subscriptionPricePoint"));
    return pricePoint?.attributes?.customerPrice === product.customerPrice;
  });
  if (matching || !apply) return;

  const points = await requestPaginatedJson({
    token,
    requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/pricePoints`,
    search: [["filter[territory]", territory], ["include", "territory"], ["limit", "50"]],
  });
  const point = (points.data || []).find(
    (candidate) => candidate.attributes?.customerPrice === product.customerPrice,
  );
  if (!point) fail(`${product.key} price point ${product.customerPrice} was not returned for ${territory}.`);
  await requestJson({
    token,
    method: "POST",
    requestPath: "/v1/subscriptionPrices",
    body: {
      data: {
        type: "subscriptionPrices",
        attributes: { startDate: null, planType: "UPFRONT" },
        relationships: {
          subscription: {
            data: { type: "subscriptions", id: subscription.id },
          },
          subscriptionPricePoint: {
            data: { type: "subscriptionPricePoints", id: point.id },
          },
        },
      },
    },
  });
  changes.push(`set ${product.key} ${territory} price to ${product.customerPrice}`);
}

async function ensureIntroductoryOffer({ token, subscription, territory, apply, changes, product }) {
  if (!subscription) return;
  const offers = await requestJson({
    token,
    requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/introductoryOffers`,
    search: [["filter[territory]", territory], ["include", "territory"], ["limit", "50"]],
  });
  const configured = (offers.data || []).some(
    (offer) =>
      offer.attributes?.offerMode === "FREE_TRIAL" &&
      offer.attributes?.duration === "TWO_WEEKS" &&
      offer.attributes?.numberOfPeriods === 1,
  );
  if (configured || !apply) return;
  await requestJson({
    token,
    method: "POST",
    requestPath: "/v1/subscriptionIntroductoryOffers",
    body: {
      data: {
        type: "subscriptionIntroductoryOffers",
        attributes: {
          duration: "TWO_WEEKS",
          offerMode: "FREE_TRIAL",
          numberOfPeriods: 1,
        },
        relationships: {
          subscription: {
            data: { type: "subscriptions", id: subscription.id },
          },
          territory: {
            data: { type: "territories", id: territory },
          },
        },
      },
    },
  });
  changes.push(`created ${product.key} two-week ${territory} trial`);
}

async function describeProduct({ token, subscription, product, territory }) {
  if (!subscription) {
    return {
      key: product.key,
      productId: product.productId,
      exists: false,
      priceConfigured: false,
      trialConfigured: false,
    };
  }
  const [prices, offers, versions, reviewScreenshot] = await Promise.all([
    readPrices({ token, subscription, territory }),
    requestJson({
      token,
      requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/introductoryOffers`,
      search: [["filter[territory]", territory], ["limit", "50"]],
    }),
    requestJson({
      token,
      requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/versions`,
      search: [["include", "localizations"], ["limit", "50"], ["limit[localizations]", "50"]],
    }),
    requestJson({
      token,
      requestPath: `/v1/subscriptions/${encodeURIComponent(subscription.id)}/appStoreReviewScreenshot`,
    }),
  ]);
  const priceConfigured = (prices.data || []).some((price) => {
    const point = includedPrice(prices, relationshipId(price, "subscriptionPricePoint"));
    return point?.attributes?.customerPrice === product.customerPrice;
  });
  const trialConfigured = (offers.data || []).some(
    (offer) =>
      offer.attributes?.offerMode === "FREE_TRIAL" &&
      offer.attributes?.duration === "TWO_WEEKS" &&
      offer.attributes?.numberOfPeriods === 1,
  );
  const localized = (versions.included || []).some(
    (resource) =>
      resource.type === "subscriptionLocalizations" &&
      resource.attributes?.locale === "en-US" &&
      resource.attributes?.name === product.localizationName,
  );
  return {
    key: product.key,
    id: subscription.id,
    productId: product.productId,
    exists: true,
    state: subscription.attributes?.state || null,
    period: subscription.attributes?.subscriptionPeriod || null,
    localized,
    territory,
    price: product.customerPrice,
    priceConfigured,
    trialConfigured,
    reviewScreenshotConfigured: Boolean(reviewScreenshot.data?.id),
  };
}

async function operate(options) {
  validateMutationTarget(options);
  const apiKey = await readApiKey(options.apiKeyPath);
  const token = createToken(apiKey);
  const changes = [];

  let groupDocument = await listGroups({ token, appId: options.appId });
  let catalog = locateCatalog(groupDocument);
  const group = await ensureGroup({
    token,
    appId: options.appId,
    current: catalog,
    apply: options.apply,
    changes,
  });

  if (options.apply && !catalog.group) {
    groupDocument = await listGroups({ token, appId: options.appId });
    catalog = locateCatalog(groupDocument);
  }
  const effectiveGroup = catalog.group || group;
  await ensureGroupMetadata({ token, group: effectiveGroup, apply: options.apply, changes });

  const resolvedProducts = [];
  for (const product of PRODUCTS) {
    let subscription = await ensureSubscription({
      token,
      groupId: effectiveGroup?.id,
      product,
      current: catalog,
      apply: options.apply,
      changes,
    });
    if (options.apply && !subscription) fail(`Could not resolve ${product.key} subscription.`);
    if (options.apply && !catalog.subscriptions.includes(subscription)) {
      groupDocument = await listGroups({ token, appId: options.appId });
      catalog = locateCatalog(groupDocument);
      subscription = catalog.subscriptions.find(
        (candidate) => candidate.attributes?.productId === product.productId,
      ) || subscription;
    }
    resolvedProducts.push({ product, subscription });
    await ensureVersionedSubscriptionMetadata({
      token,
      subscription,
      product,
      apply: options.apply,
      changes,
    });
    await ensurePlanAvailability({
      token,
      subscription,
      product,
      territory: options.territory,
      apply: options.apply,
      changes,
    });
    await ensurePrice({
      token,
      subscription,
      product,
      territory: options.territory,
      apply: options.apply,
      changes,
    });
    await ensureIntroductoryOffer({
      token,
      subscription,
      product,
      territory: options.territory,
      apply: options.apply,
      changes,
    });
  }

  if (options.apply) {
    groupDocument = await listGroups({ token, appId: options.appId });
    catalog = locateCatalog(groupDocument);
  }
  const products = [];
  for (const product of PRODUCTS) {
    products.push(await describeProduct({
      token,
      product,
      territory: options.territory,
      subscription: catalog.subscriptions.find(
        (candidate) => candidate.attributes?.productId === product.productId,
      ) || null,
    }));
  }
  const catalogComplete = Boolean(
    catalog.group &&
    products.every(
      (product) =>
        product.exists &&
        product.localized &&
        product.priceConfigured &&
        product.trialConfigured,
    ),
  );
  const reviewReady = Boolean(
    catalogComplete &&
    products.every(
      (product) =>
        product.reviewScreenshotConfigured && product.state !== "MISSING_METADATA",
    ),
  );
  const receipt = {
    schema: "quipsly-app-store-subscription-catalog-v1",
    auditedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "read-only",
    appId: options.appId,
    group: catalog.group
      ? {
          id: catalog.group.id,
          referenceName: catalog.group.attributes?.referenceName || null,
        }
      : null,
    territory: options.territory,
    products,
    changes,
    catalogComplete,
    reviewReady,
    complete: reviewReady,
    mutationConfirmation: mutationConfirmation(options.appId),
    boundaries: {
      submittedForReview: false,
      serverNotificationsChanged: false,
      additionalTerritoriesChanged: false,
    },
  };
  if (options.outputPath) {
    await writeFile(options.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(options.outputPath, 0o600);
  }
  return receipt;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const receipt = await operate(options);
  console.log(JSON.stringify(receipt, null, 2));
  if (options.apply && !receipt.catalogComplete) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
