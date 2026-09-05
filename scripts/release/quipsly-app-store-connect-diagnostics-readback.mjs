#!/usr/bin/env node

import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { appStoreConnectReadCredentialPath } from "./quipsly-app-store-connect-credentials.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";

function fail(message) {
  throw new Error(message);
}

export function parseArguments(argv) {
  const options = {
    apiKeyPath: appStoreConnectReadCredentialPath(),
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    marketingVersion: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    buildNumber: QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber,
    outputPath: "",
  };
  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--":
        break;
      case "--api-key-path":
        options.apiKeyPath = takeValue(index, argument);
        index += 1;
        break;
      case "--app-id":
        options.appId = takeValue(index, argument);
        index += 1;
        break;
      case "--version":
        options.marketingVersion = takeValue(index, argument);
        index += 1;
        break;
      case "--build":
        options.buildNumber = takeValue(index, argument);
        index += 1;
        break;
      case "--output":
        options.outputPath = takeValue(index, argument);
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

function usage() {
  return `Usage:
  node scripts/release/quipsly-app-store-connect-diagnostics-readback.mjs [options]

Options:
  --api-key-path <path>  Override the default private credential path.
  --app-id <id>          App Store Connect app ID.
  --version <version>    Expected marketing version.
  --build <number>       Expected build number.
  --output <path>        Write a redacted mode-0600 JSON receipt.

This command is read-only. It never requests tester email, comments, crash-log
contents, tokens, or private keys in its receipt.
`;
}

function makeRequest(pathname, entries = []) {
  const url = new URL(pathname, API_ORIGIN);
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return {
    url: url.toString(),
    scope: `GET ${decodeURIComponent(url.pathname + url.search)}`,
  };
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath || !path.isAbsolute(apiKeyPath)) {
    fail("APP_STORE_CONNECT_API_KEY_PATH must be an absolute private JSON path.");
  }
  const fileStat = await stat(apiKeyPath);
  if (!fileStat.isFile()) fail("App Store Connect API key path is not a file.");
  if ((fileStat.mode & 0o077) !== 0) {
    fail("App Store Connect API key JSON must not be group- or world-readable.");
  }
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
  const key = {
    keyId: String(document.key_id || "").trim(),
    issuerId: String(document.issuer_id || "").trim(),
    privateKey: String(document.key || "").trim(),
  };
  if (!key.keyId || !key.issuerId || !key.privateKey.includes("PRIVATE KEY")) {
    fail("App Store Connect API key JSON is incomplete.");
  }
  return key;
}

async function requestDocument(request, token, { allowNotFound = false } = {}) {
  const response = await fetch(request.url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (allowNotFound && response.status === 404) return { unavailable: true, body };
  if (!response.ok) {
    const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || `HTTP ${response.status}`;
    fail(`App Store Connect diagnostics readback failed: ${detail}`);
  }
  return { unavailable: false, body };
}

export function summarizeDiagnostics({
  options,
  buildDocument,
  crashDocument,
  diagnosticDocument,
  auditedAt = new Date().toISOString(),
}) {
  const included = buildDocument.included || [];
  const build = (buildDocument.data || []).find((candidate) => {
    if (candidate.attributes?.version !== options.buildNumber) return false;
    const prereleaseId = candidate.relationships?.preReleaseVersion?.data?.id;
    const prerelease = included.find((item) => item.type === "preReleaseVersions" && item.id === prereleaseId);
    return prerelease?.attributes?.version === options.marketingVersion;
  });
  if (!build) fail(`Build ${options.marketingVersion} (${options.buildNumber}) was not found.`);

  const crashIncluded = crashDocument.included || [];
  const crashes = (crashDocument.data || [])
    .filter((item) => item.relationships?.build?.data?.id === build.id)
    .map((item) => ({
      id: item.id,
      createdDate: item.attributes?.createdDate || null,
      deviceModel: item.attributes?.deviceModel || null,
      osVersion: item.attributes?.osVersion || null,
    }));
  const representedBuilds = new Map();
  for (const item of crashIncluded) {
    if (item.type !== "builds") continue;
    representedBuilds.set(item.id, item.attributes?.version || null);
  }

  const diagnosticUnavailable = diagnosticDocument.unavailable === true;
  const signatures = diagnosticUnavailable
    ? []
    : (diagnosticDocument.body?.data || []).map((item) => ({
      id: item.id,
      diagnosticType: item.attributes?.diagnosticType || null,
      signature: item.attributes?.signature || null,
      weight: item.attributes?.weight ?? null,
    }));

  return {
    schema: "quipsly-app-store-connect-diagnostics-readback-v1",
    auditedAt,
    appId: options.appId,
    build: {
      id: build.id,
      marketingVersion: options.marketingVersion,
      buildNumber: options.buildNumber,
      uploadedDate: build.attributes?.uploadedDate || null,
      processingState: build.attributes?.processingState || null,
    },
    testerSubmittedCrashes: {
      count: crashes.length,
      reports: crashes,
      allAppReportCount: (crashDocument.data || []).length,
      representedBuildNumbers: [...new Set([...representedBuilds.values()].filter(Boolean))].sort(),
      boundary: "Tester-submitted TestFlight crash feedback only; zero is not proof of zero crashes.",
    },
    aggregateDiagnostics: {
      available: !diagnosticUnavailable,
      count: signatures.length,
      signatures,
      boundary: diagnosticUnavailable
        ? "Apple has not materialized aggregate diagnostic signatures for this build."
        : "Apple aggregate diagnostic signatures; absence is not physical-device acceptance.",
    },
    redaction: {
      testerEmailRequested: false,
      testerCommentRequested: false,
      crashLogRequested: false,
    },
    passed: crashes.length === 0,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const requests = {
    builds: makeRequest("/v1/builds", [
      ["filter[app]", options.appId],
      ["filter[version]", options.buildNumber],
      ["include", "preReleaseVersion"],
      ["limit", "10"],
    ]),
    crashes: makeRequest(`/v1/apps/${options.appId}/betaFeedbackCrashSubmissions`, [
      ["fields[betaFeedbackCrashSubmissions]", "createdDate,deviceModel,osVersion,build"],
      ["fields[builds]", "version,uploadedDate"],
      ["include", "build"],
      ["limit", "200"],
    ]),
  };
  const key = await readApiKey(options.apiKeyPath);
  let token = createScopedToken({ ...key, scopes: Object.values(requests).map((request) => request.scope) });
  const [buildResult, crashResult] = await Promise.all([
    requestDocument(requests.builds, token),
    requestDocument(requests.crashes, token),
  ]);
  const build = (buildResult.body.data || [])[0];
  if (!build?.id) fail(`Build ${options.buildNumber} was not returned by App Store Connect.`);
  const diagnosticRequest = makeRequest(`/v1/builds/${build.id}/diagnosticSignatures`, [
    ["fields[diagnosticSignatures]", "diagnosticType,signature,weight"],
    ["limit", "200"],
  ]);
  token = createScopedToken({ ...key, scopes: [diagnosticRequest.scope] });
  const diagnosticResult = await requestDocument(diagnosticRequest, token, { allowNotFound: true });
  const receipt = summarizeDiagnostics({
    options,
    buildDocument: buildResult.body,
    crashDocument: crashResult.body,
    diagnosticDocument: diagnosticResult,
  });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.outputPath) {
    await writeFile(options.outputPath, serialized, { mode: 0o600 });
    await chmod(options.outputPath, 0o600);
  }
  process.stdout.write(serialized);
  if (!receipt.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
