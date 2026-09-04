#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";

function fail(message) {
  throw new Error(message);
}

export function parseArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    marketingVersion: QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion,
    buildNumber: "",
  };
  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
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

function relationshipId(resource, name) {
  return resource?.relationships?.[name]?.data?.id || null;
}

function includedResource(document, type, id) {
  return (document.included || []).find(
    (resource) => resource.type === type && resource.id === id,
  );
}

export function summarizeAvailability({ options, buildDocument }) {
  if (!/^\d+$/.test(options.buildNumber)) {
    fail("Build number must be a positive integer.");
  }
  const requestedBuild = Number(options.buildNumber);
  if (!Number.isSafeInteger(requestedBuild) || requestedBuild < 1) {
    fail("Build number must be a positive safe integer.");
  }

  const versionBuilds = (buildDocument.data || []).filter((build) => {
    const preRelease = includedResource(
      buildDocument,
      "preReleaseVersions",
      relationshipId(build, "preReleaseVersion"),
    );
    return preRelease?.attributes?.version === options.marketingVersion;
  });
  const numericBuilds = versionBuilds
    .map((build) => Number(build.attributes?.version))
    .filter((build) => Number.isSafeInteger(build) && build >= 1);
  const highestUploadedBuild = numericBuilds.length > 0
    ? Math.max(...numericBuilds)
    : null;
  const exactBuildAlreadyExists = versionBuilds.some(
    (build) => build.attributes?.version === options.buildNumber,
  );
  const higherThanUploadedBuilds = highestUploadedBuild === null
    || requestedBuild > highestUploadedBuild;

  return {
    schema: "quipsly-app-store-connect-build-number-availability-v1",
    auditedAt: new Date().toISOString(),
    appId: options.appId,
    marketingVersion: options.marketingVersion,
    requestedBuildNumber: options.buildNumber,
    highestUploadedBuildNumber:
      highestUploadedBuild === null ? null : String(highestUploadedBuild),
    exactBuildAlreadyExists,
    higherThanUploadedBuilds,
    passed: !exactBuildAlreadyExists && higherThanUploadedBuilds,
  };
}

async function readApiKey(path) {
  if (!path) fail("APP_STORE_CONNECT_API_KEY_PATH or --api-key-path is required.");
  const fileStat = await stat(path);
  if ((fileStat.mode & 0o077) !== 0) {
    fail(`API-key JSON must not be group- or world-readable: ${path}`);
  }
  const document = JSON.parse(await readFile(path, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (typeof document[field] !== "string" || !document[field].trim()) {
      fail(`API-key JSON is missing ${field}.`);
    }
  }
  return {
    keyId: document.key_id.trim(),
    issuerId: document.issuer_id.trim(),
    privateKey: document.key,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Usage: quipsly-app-store-connect-build-number-availability.mjs --build <number> [--version <version>] [--app-id <id>] [--api-key-path <path>]\n",
    );
    return;
  }
  if (!options.buildNumber) fail("--build is required.");

  const key = await readApiKey(options.apiKeyPath);
  const token = createScopedToken(key);
  const url = new URL("/v1/builds", API_ORIGIN);
  url.searchParams.set("filter[app]", options.appId);
  url.searchParams.set("include", "preReleaseVersion");
  url.searchParams.set("sort", "-uploadedDate");
  url.searchParams.set("limit", "200");
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const buildDocument = await response.json();
  if (!response.ok) {
    fail(`App Store Connect returned HTTP ${response.status}.`);
  }
  const receipt = summarizeAvailability({ options, buildDocument });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}

