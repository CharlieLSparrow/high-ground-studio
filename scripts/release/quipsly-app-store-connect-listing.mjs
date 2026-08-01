#!/usr/bin/env node

import { createHash, sign } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./quipsly-capture-app-store-metadata.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const execFileAsync = promisify(execFile);
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
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    metadataPath: defaultMetadataPath,
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    version: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    build: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    outputPath: "",
    reviewContactFirstName: process.env.QUIPSLY_APP_REVIEW_CONTACT_FIRST_NAME || "",
    reviewContactLastName: process.env.QUIPSLY_APP_REVIEW_CONTACT_LAST_NAME || "",
    reviewContactEmail: process.env.QUIPSLY_APP_REVIEW_CONTACT_EMAIL || "",
    reviewContactPhone: process.env.QUIPSLY_APP_REVIEW_CONTACT_PHONE || "",
    demoAccount: process.env.QUIPSLY_CAPTURE_REVIEWER_EMAIL || "codex@dev.test",
    passwordKeychainService:
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_SERVICE || "quipsly-capture-reviewer",
    passwordKeychainAccount:
      process.env.QUIPSLY_CAPTURE_REVIEWER_PASSWORD_KEYCHAIN_ACCOUNT || "codex@dev.test",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--": break;
      case "--apply": options.apply = true; break;
      case "--api-key-path": options.apiKeyPath = requiredValue(argv, index, argument); index += 1; break;
      case "--metadata": options.metadataPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--app-id": options.appId = requiredValue(argv, index, argument); index += 1; break;
      case "--version": options.version = requiredValue(argv, index, argument); index += 1; break;
      case "--build": options.build = requiredValue(argv, index, argument); index += 1; break;
      case "--output": options.outputPath = path.resolve(requiredValue(argv, index, argument)); index += 1; break;
      case "--review-contact-first-name": options.reviewContactFirstName = requiredValue(argv, index, argument); index += 1; break;
      case "--review-contact-last-name": options.reviewContactLastName = requiredValue(argv, index, argument); index += 1; break;
      case "--review-contact-email": options.reviewContactEmail = requiredValue(argv, index, argument); index += 1; break;
      case "--review-contact-phone": options.reviewContactPhone = requiredValue(argv, index, argument); index += 1; break;
      case "--demo-account": options.demoAccount = requiredValue(argv, index, argument); index += 1; break;
      case "--password-keychain-service": options.passwordKeychainService = requiredValue(argv, index, argument); index += 1; break;
      case "--password-keychain-account": options.passwordKeychainAccount = requiredValue(argv, index, argument); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-app-store-connect-listing.mjs [options]

Default mode is a read-only plan. Add --apply to update safe, non-legal listing
metadata, assign the validated build, and create/update App Review details.

Required for --apply:
  --api-key-path <path>
  --review-contact-first-name <name>
  --review-contact-last-name <name>
  --review-contact-email <email>
  --review-contact-phone <phone>

The demo password is read from macOS Keychain and is never written to the
receipt. Use --password-keychain-service and --password-keychain-account to
override the default reviewer credential identity.
`;
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createToken({ keyId, issuerId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: "ES256", kid: keyId, typ: "JWT" })}.${base64url({
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
  if ((fileStat.mode & 0o077) !== 0) fail("App Store Connect API key JSON must have mode 0600.");
  const value = JSON.parse(await readFile(apiKeyPath, "utf8"));
  for (const key of ["key_id", "issuer_id", "key"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) fail(`API key is missing ${key}.`);
  }
  return { keyId: value.key_id.trim(), issuerId: value.issuer_id.trim(), privateKey: value.key };
}

function requestUrl(requestPath, search = []) {
  const url = new URL(requestPath, API_ORIGIN);
  for (const [key, value] of search) url.searchParams.append(key, value);
  return url.toString();
}

async function requestJson({ token, method = "GET", requestPath, search, body }) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(requestUrl(requestPath, search), {
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
    const errors = (document.errors || []).map(({ status, code, title, detail }) => ({ status, code, title, detail }));
    finalError = new Error(`App Store Connect returned HTTP ${response.status}: ${JSON.stringify(errors)}`);
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw finalError;
}

function included(document, type) {
  return (document.included || []).filter((resource) => resource.type === type);
}

async function discover({ token, options }) {
  const appInfos = await requestJson({
    token,
    requestPath: `/v1/apps/${options.appId}/appInfos`,
    search: [["include", "appInfoLocalizations,primaryCategory,secondaryCategory"], ["limit[appInfoLocalizations]", "50"]],
  });
  const versions = await requestJson({
    token,
    requestPath: `/v1/apps/${options.appId}/appStoreVersions`,
    search: [["filter[platform]", "IOS"], ["filter[versionString]", options.version], ["include", "appStoreVersionLocalizations,appStoreReviewDetail,build"], ["limit[appStoreVersionLocalizations]", "50"]],
  });
  const builds = await requestJson({
    token,
    requestPath: "/v1/builds",
    search: [["filter[app]", options.appId], ["filter[version]", options.build], ["include", "preReleaseVersion"], ["limit", "10"]],
  });

  const appInfo = (appInfos.data || [])[0];
  const appInfoLocalization = included(appInfos, "appInfoLocalizations").find(
    (resource) => resource.attributes?.locale === "en-US",
  );
  const version = (versions.data || []).find((resource) => resource.attributes?.versionString === options.version);
  const versionLocalization = included(versions, "appStoreVersionLocalizations").find(
    (resource) => resource.attributes?.locale === "en-US",
  );
  const reviewDetail = included(versions, "appStoreReviewDetails")[0] || null;
  const build = (builds.data || []).find((candidate) => {
    const preReleaseId = candidate.relationships?.preReleaseVersion?.data?.id;
    const preRelease = included(builds, "preReleaseVersions").find((resource) => resource.id === preReleaseId);
    return candidate.attributes?.version === options.build && preRelease?.attributes?.version === options.version;
  });
  if (!appInfo || !appInfoLocalization || !version || !versionLocalization || !build) {
    fail(`Could not resolve editable en-US App Store records and Build ${options.version} (${options.build}).`);
  }
  return { appInfo, appInfoLocalization, version, versionLocalization, reviewDetail, build };
}

function digest(value) {
  return value ? createHash("sha256").update(String(value)).digest("hex") : null;
}

function desiredFromMetadata(metadata) {
  return {
    appLocalization: {
      name: metadata.app.name,
      subtitle: metadata.app.subtitle,
      privacyPolicyUrl: metadata.app.privacyPolicyUrl,
      privacyChoicesUrl: metadata.app.privacyChoicesUrl,
    },
    versionLocalization: {
      description: metadata.version.description,
      keywords: metadata.version.keywords,
      marketingUrl: metadata.version.marketingUrl,
      promotionalText: metadata.version.promotionalText,
      supportUrl: metadata.version.supportUrl,
    },
    version: {
      copyright: metadata.version.copyright,
      releaseType: "MANUAL",
    },
    primaryCategoryId: "PRODUCTIVITY",
    secondaryCategoryId: "PHOTO_AND_VIDEO",
  };
}

function equalFields(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

async function keychainPassword(service, account) {
  const { stdout } = await execFileAsync("/usr/bin/security", [
    "find-generic-password", "-s", service, "-a", account, "-w",
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const password = stdout.trim();
  if (!password) fail("Reviewer password in macOS Keychain is empty.");
  return password;
}

async function applyListing({ token, current, desired, metadata, options }) {
  for (const [value, label] of [
    [options.reviewContactFirstName, "review contact first name"],
    [options.reviewContactLastName, "review contact last name"],
    [options.reviewContactEmail, "review contact email"],
    [options.reviewContactPhone, "review contact phone"],
    [options.demoAccount, "demo account"],
  ]) if (!String(value || "").trim()) fail(`${label} is required with --apply.`);

  const reviewerPassword = await keychainPassword(
    options.passwordKeychainService,
    options.passwordKeychainAccount,
  );
  const reviewNotes = await readFile(path.join(repositoryRoot, metadata.review.notesFile), "utf8");
  if (Buffer.byteLength(reviewNotes, "utf8") > 4_000) fail("App Review notes exceed 4,000 UTF-8 bytes.");

  await requestJson({
    token, method: "PATCH", requestPath: `/v1/appInfoLocalizations/${current.appInfoLocalization.id}`,
    body: { data: { type: "appInfoLocalizations", id: current.appInfoLocalization.id, attributes: desired.appLocalization } },
  });
  await requestJson({
    token, method: "PATCH", requestPath: `/v1/appInfos/${current.appInfo.id}`,
    body: { data: { type: "appInfos", id: current.appInfo.id, relationships: {
      primaryCategory: { data: { type: "appCategories", id: desired.primaryCategoryId } },
      secondaryCategory: { data: { type: "appCategories", id: desired.secondaryCategoryId } },
    } } },
  });
  await requestJson({
    token, method: "PATCH", requestPath: `/v1/appStoreVersionLocalizations/${current.versionLocalization.id}`,
    body: { data: { type: "appStoreVersionLocalizations", id: current.versionLocalization.id, attributes: desired.versionLocalization } },
  });
  await requestJson({
    token, method: "PATCH", requestPath: `/v1/appStoreVersions/${current.version.id}`,
    body: { data: { type: "appStoreVersions", id: current.version.id, attributes: desired.version } },
  });
  await requestJson({
    token, method: "PATCH", requestPath: `/v1/appStoreVersions/${current.version.id}/relationships/build`,
    body: { data: { type: "builds", id: current.build.id } },
  });

  const reviewAttributes = {
    contactFirstName: options.reviewContactFirstName.trim(),
    contactLastName: options.reviewContactLastName.trim(),
    contactEmail: options.reviewContactEmail.trim(),
    contactPhone: options.reviewContactPhone.trim(),
    demoAccountName: options.demoAccount.trim(),
    demoAccountPassword: reviewerPassword,
    demoAccountRequired: true,
    notes: reviewNotes,
  };
  if (current.reviewDetail) {
    await requestJson({
      token, method: "PATCH", requestPath: `/v1/appStoreReviewDetails/${current.reviewDetail.id}`,
      body: { data: { type: "appStoreReviewDetails", id: current.reviewDetail.id, attributes: reviewAttributes } },
    });
  } else {
    await requestJson({
      token, method: "POST", requestPath: "/v1/appStoreReviewDetails",
      body: { data: { type: "appStoreReviewDetails", attributes: reviewAttributes, relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: current.version.id } },
      } } },
    });
  }
}

function summarize({ current, desired, options, applied, auditedAt }) {
  const primaryCategoryId = current.appInfo.relationships?.primaryCategory?.data?.id || null;
  const secondaryCategoryId = current.appInfo.relationships?.secondaryCategory?.data?.id || null;
  const assignedBuildId = current.version.relationships?.build?.data?.id || null;
  const checks = {
    appLocalization: equalFields(current.appInfoLocalization.attributes, desired.appLocalization),
    categories: primaryCategoryId === desired.primaryCategoryId && secondaryCategoryId === desired.secondaryCategoryId,
    versionLocalization: equalFields(current.versionLocalization.attributes, desired.versionLocalization),
    versionSettings: equalFields(current.version.attributes, desired.version),
    buildAssigned: assignedBuildId === current.build.id,
    reviewDetailPresent: Boolean(current.reviewDetail),
    reviewDemoAccountRequired: current.reviewDetail?.attributes?.demoAccountRequired === true,
  };
  return {
    schema: "quipsly-app-store-connect-listing-v1",
    auditedAt,
    mode: applied ? "applied-and-read-back" : "read-only-plan",
    appId: options.appId,
    appInfoId: current.appInfo.id,
    versionId: current.version.id,
    version: options.version,
    build: { number: options.build, id: current.build.id, assigned: checks.buildAssigned },
    localization: "en-US",
    categories: { primary: primaryCategoryId, secondary: secondaryCategoryId },
    review: {
      present: checks.reviewDetailPresent,
      contactEmailSha256: digest(current.reviewDetail?.attributes?.contactEmail),
      contactPhoneSha256: digest(current.reviewDetail?.attributes?.contactPhone),
      demoAccountSha256: digest(current.reviewDetail?.attributes?.demoAccountName),
      passwordPresent: Boolean(current.reviewDetail?.attributes?.demoAccountPassword),
      passwordPrinted: false,
    },
    checks,
    passed: Object.values(checks).every(Boolean),
    legalDeclarationsUntouched: [
      "age rating", "content rights", "App Privacy answers", "EU DSA trader status",
      "pricing and territory availability", "IDFA declaration",
    ],
    externalMutation: applied,
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
  const token = createToken(key);
  const desired = desiredFromMetadata(metadata);
  let current = await discover({ token, options });
  if (options.apply) {
    await applyListing({ token, current, desired, metadata, options });
    current = await discover({ token, options });
  }
  const receipt = summarize({ current, desired, options, applied: options.apply, auditedAt: new Date().toISOString() });
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
  if (options.apply && !receipt.passed) process.exitCode = 1;
}

if (pathToFileURL(process.argv[1] || "").href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
