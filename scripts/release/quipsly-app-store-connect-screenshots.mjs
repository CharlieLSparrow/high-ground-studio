#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appStoreScreenshotDisplaySet,
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./quipsly-capture-app-store-metadata.mjs";
import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultMetadataPath = path.join(repositoryRoot, "release/app-store/quipsly-capture/en-US.json");

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
    replaceExisting: false,
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    metadataPath: defaultMetadataPath,
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    locale: "en-US",
    displayType: "APP_IPHONE_67",
    confirmTarget: "",
    confirmReplaceSet: "",
    outputPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--apply": options.apply = true; break;
      case "--replace-existing": options.replaceExisting = true; break;
      case "--api-key-path": options.apiKeyPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--metadata": options.metadataPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--submission-receipt": options.submissionReceiptPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--app-id": options.appId = requiredValue(argv, index, argument); index += 1; break;
      case "--version": options.version = requiredValue(argv, index, argument); index += 1; break;
      case "--locale": options.locale = requiredValue(argv, index, argument); index += 1; break;
      case "--display-type": options.displayType = requiredValue(argv, index, argument); index += 1; break;
      case "--confirm-target": options.confirmTarget = requiredValue(argv, index, argument); index += 1; break;
      case "--confirm-replace-set": options.confirmReplaceSet = requiredValue(argv, index, argument); index += 1; break;
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
  node scripts/release/quipsly-app-store-connect-screenshots.mjs [options]

Default mode is a read-only plan. Upload requires all of:
  --submission-receipt <candidate-bound-receipt.json>
  --api-key-path <mode-0600-key.json>
  --apply
  --confirm-target <APP_ID/VERSION/LOCALE/DISPLAY_TYPE>

Replacing a nonmatching editable screenshot set additionally requires:
  --replace-existing
  --confirm-replace-set <APP_SCREENSHOT_SET_ID>

Existing exact assets are accepted idempotently. A mismatch fails closed unless
the caller deliberately names the exact set to replace. Replacement deletes only
that set's screenshots, then uploads and orders the qualified candidate assets.
`;
}

function readJson(filePath, label) {
  if (!filePath) fail(`${label} path is required.`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is unavailable or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateSubmissionReceipt(receipt, { metadata, version, locale, displayType }) {
  if (
    receipt.schema !== "quipsly-capture-app-store-screenshot-submission-v1"
    || receipt.submissionEligible !== true
  ) fail("Screenshot receipt is not submission eligible.");
  if (!/^[0-9a-f]{40}$/.test(receipt.sourceRevision || "")) fail("Screenshot receipt source revision is invalid.");
  if (receipt.sourceIsolation !== "detached-worktree") fail("Screenshot receipt source was not isolated.");
  if (receipt.candidate?.version !== version) fail(`Screenshot candidate version must be ${version}.`);
  if (receipt.locale !== locale) fail(`Screenshot receipt locale must be ${locale}.`);
  const displaySet = appStoreScreenshotDisplaySet(metadata, displayType);
  if (receipt.displayType !== displayType || receipt.deviceClass !== displaySet.deviceClass) {
    fail(`Screenshot receipt must target canonical ${displayType} assets.`);
  }
  const planned = [...metadata.screenshots.planned].sort((left, right) => left.order - right.order);
  if (!Array.isArray(receipt.screenshots) || receipt.screenshots.length !== planned.length) {
    fail(`Screenshot receipt must contain ${planned.length} images.`);
  }
  return planned.map((expected, index) => {
    const actual = receipt.screenshots[index];
    if (
      actual.order !== expected.order
      || actual.filename !== expected.filename
      || actual.width !== displaySet.width
      || actual.height !== displaySet.height
      || !/^[0-9a-f]{64}$/.test(actual.sha256 || "")
      || !/^[0-9a-f]{32}$/.test(actual.md5 || "")
    ) fail(`Screenshot ${index + 1} does not match canonical metadata or digests.`);
    const bytes = fs.readFileSync(actual.path);
    if (bytes.length !== actual.bytes) fail(`${actual.filename} byte count changed after qualification.`);
    const currentSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const currentMd5 = crypto.createHash("md5").update(bytes).digest("hex");
    if (currentSha256 !== actual.sha256 || currentMd5 !== actual.md5) {
      fail(`${actual.filename} digest changed after qualification.`);
    }
    return { ...actual, bytesBuffer: bytes };
  });
}

function readApiKey(apiKeyPath) {
  if (!apiKeyPath) fail("APP_STORE_CONNECT_API_KEY_PATH or --api-key-path is required.");
  const fileStat = fs.statSync(apiKeyPath);
  if ((fileStat.mode & 0o077) !== 0) fail("App Store Connect API key JSON must have mode 0600.");
  const document = readJson(apiKeyPath, "App Store Connect API key");
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) fail(`API key is missing ${field}.`);
  }
  return { keyId: document.key_id.trim(), issuerId: document.issuer_id.trim(), privateKey: document.key };
}

function apiRequest(requestPath, method = "GET", search = []) {
  const url = new URL(requestPath, API_ORIGIN);
  for (const [key, value] of search) url.searchParams.append(key, value);
  return { method, url: url.toString(), scope: `${method} ${decodeURIComponent(`${url.pathname}${url.search}`)}` };
}

function tokenScopesForRequest(request) {
  return request.method === "GET" ? [request.scope] : undefined;
}

async function requestJson({ request, key, body, fetchImpl }) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createScopedToken({ ...key, scopes: tokenScopesForRequest(request) });
    const response = await fetchImpl(request.url, {
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
    const errors = (document.errors || []).slice(0, 20).map(({ status, code, title, detail, source }) => ({ status, code, title, detail, source }));
    finalError = new Error(`App Store Connect returned HTTP ${response.status}: ${JSON.stringify(errors)}`);
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw finalError;
}

function included(document, type) {
  return (document?.included || []).filter((resource) => resource.type === type);
}

function deliveryState(resource) {
  const value = resource?.attributes?.assetDeliveryState;
  return typeof value === "string" ? value : value?.state || null;
}

async function discoverTarget({ options, key, fetchImpl }) {
  const versions = await requestJson({
    request: apiRequest(`/v1/apps/${options.appId}/appStoreVersions`, "GET", [
      ["filter[platform]", "IOS"], ["filter[versionString]", options.version],
      ["include", "appStoreVersionLocalizations"], ["limit", "20"], ["limit[appStoreVersionLocalizations]", "50"],
    ]),
    key,
    fetchImpl,
  });
  if ((versions.data || []).length !== 1) fail(`Expected one editable iOS ${options.version} version.`);
  const localization = included(versions, "appStoreVersionLocalizations").find(
    (resource) => resource.attributes?.locale === options.locale,
  );
  if (!localization) fail(`Could not resolve the ${options.locale} App Store version localization.`);
  const relationships = await requestJson({
    request: apiRequest(`/v1/appStoreVersionLocalizations/${localization.id}/relationships/appScreenshotSets`, "GET", [["limit", "200"]]),
    key,
    fetchImpl,
  });
  const sets = await Promise.all((relationships.data || []).map((linkage) => requestJson({
    request: apiRequest(`/v1/appScreenshotSets/${linkage.id}`, "GET", [["include", "appScreenshots"], ["limit[appScreenshots]", "50"]]),
    key,
    fetchImpl,
  })));
  const matchingSets = sets.filter((document) => document.data?.attributes?.screenshotDisplayType === options.displayType);
  if (matchingSets.length > 1) fail(`Found multiple ${options.displayType} screenshot sets.`);
  return { localization, setDocument: matchingSets[0] || null };
}

export async function uploadReservedAsset(resource, bytes, fetchImpl = fetch) {
  const operations = resource?.attributes?.uploadOperations || [];
  if (operations.length === 0) fail("Apple returned a screenshot reservation without upload operations.");
  for (const [index, operation] of operations.entries()) {
    const offset = Number(operation.offset);
    const length = Number(operation.length);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1) {
      fail("Apple returned an invalid screenshot upload byte range.");
    }
    const chunk = bytes.subarray(offset, offset + length);
    if (chunk.length !== length) fail("Apple requested a screenshot byte range outside the source file.");
    const headers = Object.fromEntries((operation.requestHeaders || []).map(({ name, value }) => [name, value]));
    const response = await fetchImpl(operation.url, { method: operation.method, headers, body: chunk });
    if (!response.ok) fail(`Apple screenshot upload operation ${index + 1} returned HTTP ${response.status}.`);
  }
}

function providerMatchesReceipt(resources, screenshots) {
  if (resources.length !== screenshots.length) return false;
  return resources.every((resource, index) => (
    deliveryState(resource) === "COMPLETE"
    && resource.attributes?.fileName === screenshots[index].filename
    && resource.attributes?.sourceFileChecksum === screenshots[index].md5
  ));
}

async function uploadScreenshot({ screenshot, setId, key, fetchImpl, sleep }) {
  let document = await requestJson({
    request: apiRequest("/v1/appScreenshots", "POST"),
    key,
    fetchImpl,
    body: {
      data: {
        type: "appScreenshots",
        attributes: { fileName: screenshot.filename, fileSize: screenshot.bytes },
        relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
      },
    },
  });
  let resource = document.data;
  if (Number(resource.attributes?.fileSize) !== screenshot.bytes) {
    fail(`${screenshot.filename} reservation does not match the qualified byte count.`);
  }
  await uploadReservedAsset(resource, screenshot.bytesBuffer, fetchImpl);
  document = await requestJson({
    request: apiRequest(`/v1/appScreenshots/${resource.id}`, "PATCH"),
    key,
    fetchImpl,
    body: {
      data: {
        type: "appScreenshots",
        id: resource.id,
        attributes: { uploaded: true, sourceFileChecksum: screenshot.md5 },
      },
    },
  });
  resource = document.data;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (deliveryState(resource) === "COMPLETE") return resource;
    if (deliveryState(resource) === "FAILED") fail(`${screenshot.filename} failed Apple processing.`);
    await sleep(500);
    document = await requestJson({
      request: apiRequest(`/v1/appScreenshots/${resource.id}`),
      key,
      fetchImpl,
    });
    resource = document.data;
  }
  fail(`${screenshot.filename} did not finish processing within 30 seconds.`);
}

export async function execute({ options, key, metadata, receipt, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const screenshots = validateSubmissionReceipt(receipt, {
    metadata, version: options.version, locale: options.locale, displayType: options.displayType,
  });
  const target = await discoverTarget({ options, key, fetchImpl });
  const existing = target.setDocument ? included(target.setDocument, "appScreenshots") : [];
  const plan = {
    schema: "quipsly-app-store-connect-screenshot-upload-v1",
    auditedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "plan",
    target: { appId: options.appId, version: options.version, locale: options.locale, displayType: options.displayType },
    sourceRevision: receipt.sourceRevision,
    candidateBuild: receipt.candidate.build,
    screenshotCount: screenshots.length,
    existingScreenshotCount: existing.length,
    changes: [],
    providerComplete: false,
    externalMutation: false,
  };

  if (existing.length > 0 && providerMatchesReceipt(existing, screenshots)) {
    plan.providerComplete = true;
    return plan;
  }
  if (existing.length > 0) {
    if (!options.replaceExisting) {
      fail(`The ${options.displayType} set already contains ${existing.length} nonmatching screenshot(s); no asset was deleted or replaced.`);
    }
    plan.changes.push(
      `delete ${existing.length} nonmatching screenshot(s) from exact set ${target.setDocument.data.id}`,
      `upload ${screenshots.length} exact candidate-bound screenshot(s)`,
      "persist canonical screenshot order",
    );
    if (!options.apply) return plan;
  }
  if (!options.apply) {
    plan.changes = [
      ...(target.setDocument ? [] : [`create ${options.displayType} screenshot set`]),
      `upload ${screenshots.length} exact candidate-bound screenshot(s)`,
      "persist canonical screenshot order",
    ];
    return plan;
  }

  const expectedConfirmation = `${options.appId}/${options.version}/${options.locale}/${options.displayType}`;
  if (options.confirmTarget !== expectedConfirmation) {
    fail(`--apply requires --confirm-target ${expectedConfirmation}`);
  }
  if (existing.length > 0 && options.confirmReplaceSet !== target.setDocument.data.id) {
    fail(`Replacing existing screenshots requires --confirm-replace-set ${target.setDocument.data.id}`);
  }
  let setId = target.setDocument?.data?.id;
  if (!setId) {
    const created = await requestJson({
      request: apiRequest("/v1/appScreenshotSets", "POST"), key, fetchImpl,
      body: {
        data: {
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: options.displayType },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: "appStoreVersionLocalizations", id: target.localization.id },
            },
          },
        },
      },
    });
    setId = created.data.id;
    plan.changes.push(`created ${options.displayType} screenshot set`);
  }
  if (existing.length > 0) {
    for (const resource of existing) {
      await requestJson({ request: apiRequest(`/v1/appScreenshots/${resource.id}`, "DELETE"), key, fetchImpl });
      plan.changes.push(`deleted prior screenshot ${resource.id}`);
    }
  }
  const uploaded = [];
  for (const screenshot of screenshots) {
    uploaded.push(await uploadScreenshot({ screenshot, setId, key, fetchImpl, sleep }));
    plan.changes.push(`uploaded ${screenshot.filename}`);
  }
  await requestJson({
    request: apiRequest(`/v1/appScreenshotSets/${setId}/relationships/appScreenshots`, "PATCH"),
    key,
    fetchImpl,
    body: { data: uploaded.map((resource) => ({ type: "appScreenshots", id: resource.id })) },
  });
  plan.changes.push("persisted canonical screenshot order");
  plan.providerComplete = true;
  plan.externalMutation = true;
  return plan;
}

export async function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      console.log(usage());
      return 0;
    }
    const metadata = readAppStoreMetadata(options.metadataPath);
    const validation = validateAppStoreMetadata(metadata, { root: repositoryRoot });
    if (!validation.ok) fail(`Canonical App Store metadata is invalid:\n${validation.errors.join("\n")}`);
    const receipt = readJson(options.submissionReceiptPath, "Screenshot submission receipt");
    const key = readApiKey(options.apiKeyPath);
    const result = await execute({ options, key, metadata, receipt });
    if (options.outputPath) {
      fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
      fs.writeFileSync(options.outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(options.outputPath, 0o600);
    }
    console.log(`${options.apply ? "PASS" : "PLAN"} ${result.screenshotCount} candidate-bound App Store screenshot(s).`);
    for (const change of result.changes) console.log(`${options.apply ? "PASS" : "PLAN"} ${change}`);
    if (result.providerComplete) console.log("PASS App Store Connect screenshot set is complete and byte-bound to the qualified receipt.");
    return 0;
  } catch (error) {
    console.error(`FAIL App Store screenshot operation: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
