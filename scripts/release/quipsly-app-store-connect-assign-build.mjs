#!/usr/bin/env node

import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const DEFAULTS = Object.freeze({
  appId: "6780995957",
  marketingVersion: "1.0",
  buildNumber: "7",
  groupName: "Quipsly Capture Internal",
});

function fail(message) {
  throw new Error(message);
}

export function parseAssignmentArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: DEFAULTS.appId,
    marketingVersion: DEFAULTS.marketingVersion,
    buildNumber: DEFAULTS.buildNumber,
    groupName: DEFAULTS.groupName,
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
    if (flag === "--api-key-path") options.apiKeyPath = value;
    else if (flag === "--app-id") options.appId = value;
    else if (flag === "--version") options.marketingVersion = value;
    else if (flag === "--build") options.buildNumber = value;
    else if (flag === "--group") options.groupName = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  return options;
}

function usage() {
  return `Usage:
  APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/key.json \\
    node scripts/release/quipsly-app-store-connect-assign-build.mjs [options]

Options:
  --api-key-path <path>  Fastlane App Store Connect API-key JSON.
  --app-id <id>          App Store Connect app ID.
  --version <version>    Expected marketing version.
  --build <number>       Expected build number.
  --group <name>         Internal TestFlight group.
  --output <path>        Write the redacted receipt with mode 0600.
`;
}

function makeRequest(path, searchEntries = [], method = "GET") {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of searchEntries) {
    url.searchParams.append(key, value);
  }
  const requestPath = `${url.pathname}${url.search}`;
  return {
    method,
    scope: `${method} ${decodeURIComponent(requestPath)}`,
    url: url.toString(),
  };
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath) fail("APP_STORE_CONNECT_API_KEY_PATH is required.");
  const fileStat = await stat(apiKeyPath);
  if ((fileStat.mode & 0o077) !== 0) {
    fail(`API-key JSON must not be group- or world-readable: ${apiKeyPath}`);
  }
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
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

async function requestJson(request, token, body) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const document = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const details = (document?.errors || []).map(
      ({ status, code, title, detail }) => ({ status, code, title, detail }),
    );
    fail(`App Store Connect returned HTTP ${response.status}: ${JSON.stringify(details)}`);
  }
  return document;
}

function relationshipIds(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  if (Array.isArray(data)) return data.map(({ id }) => id);
  return data?.id ? [data.id] : [];
}

function includedResource(document, type, id) {
  return (document.included || []).find(
    (resource) => resource.type === type && resource.id === id,
  );
}

export function resolveAssignmentTargets({
  options,
  buildDocument,
  groupDocument,
}) {
  const build = (buildDocument.data || []).find((candidate) => {
    if (candidate.attributes?.version !== options.buildNumber) return false;
    const preReleaseVersion = includedResource(
      buildDocument,
      "preReleaseVersions",
      relationshipIds(candidate, "preReleaseVersion")[0],
    );
    return preReleaseVersion?.attributes?.version === options.marketingVersion;
  });
  if (!build) {
    fail(`Build ${options.marketingVersion} (${options.buildNumber}) was not found.`);
  }
  if (build.attributes?.processingState !== "VALID") {
    fail(`Build ${options.marketingVersion} (${options.buildNumber}) is not VALID.`);
  }

  const group = (groupDocument.data || []).find(
    (candidate) =>
      candidate.attributes?.name === options.groupName
      && candidate.attributes?.isInternalGroup === true,
  );
  if (!group) fail(`Internal TestFlight group ${options.groupName} was not found.`);

  return {
    buildId: build.id,
    groupId: group.id,
    alreadyAssigned: relationshipIds(group, "builds").includes(build.id),
  };
}

export function buildAssignmentBody(groupId) {
  return {
    data: [{ type: "betaGroups", id: groupId }],
  };
}

async function main() {
  const options = parseAssignmentArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const buildRequest = makeRequest("/v1/builds", [
    ["filter[app]", options.appId],
    ["filter[version]", options.buildNumber],
    ["include", "preReleaseVersion"],
    ["limit", "10"],
  ]);
  const groupRequest = makeRequest("/v1/betaGroups", [
    ["filter[app]", options.appId],
    ["include", "builds"],
    ["limit", "50"],
  ]);
  const key = await readApiKey(options.apiKeyPath);
  const discoveryToken = createScopedToken({
    ...key,
    scopes: [buildRequest.scope, groupRequest.scope],
  });
  const [buildDocument, groupDocument] = await Promise.all([
    requestJson(buildRequest, discoveryToken),
    requestJson(groupRequest, discoveryToken),
  ]);
  const targets = resolveAssignmentTargets({
    options,
    buildDocument,
    groupDocument,
  });

  let relationshipCreated = false;
  if (!targets.alreadyAssigned) {
    const assignmentRequest = makeRequest(
      `/v1/builds/${targets.buildId}/relationships/betaGroups`,
      [],
      "POST",
    );
    const assignmentToken = createScopedToken({
      ...key,
    });
    await requestJson(
      assignmentRequest,
      assignmentToken,
      buildAssignmentBody(targets.groupId),
    );
    relationshipCreated = true;
  }

  const verificationToken = createScopedToken({
    ...key,
    scopes: [groupRequest.scope],
  });
  const verifiedGroups = await requestJson(groupRequest, verificationToken);
  const verifiedTargets = resolveAssignmentTargets({
    options,
    buildDocument,
    groupDocument: verifiedGroups,
  });
  const receipt = {
    schema: "quipsly-app-store-connect-build-assignment-v1",
    auditedAt: new Date().toISOString(),
    appId: options.appId,
    marketingVersion: options.marketingVersion,
    buildNumber: options.buildNumber,
    groupName: options.groupName,
    relationshipCreated,
    includesBuild: verifiedTargets.alreadyAssigned,
    passed: verifiedTargets.alreadyAssigned,
  };
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.outputPath) {
    await writeFile(options.outputPath, serialized, { mode: 0o600 });
    await chmod(options.outputPath, 0o600);
  }
  process.stdout.write(serialized);
  if (!receipt.passed) process.exitCode = 1;
}

const isMain =
  process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
  });
}
