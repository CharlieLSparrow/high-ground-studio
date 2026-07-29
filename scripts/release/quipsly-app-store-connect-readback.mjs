#!/usr/bin/env node

import { createHash, sign } from "node:crypto";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";
const DEFAULTS = Object.freeze({
  appId: "6780995957",
  appName: "Quipsly Capture",
  bundleId: "com.highgroundodyssey.HighGroundCapture",
  marketingVersion: "1.0",
  buildNumber: "6",
  groupName: "Quipsly Capture Internal",
});

function fail(message) {
  throw new Error(message);
}

export function parseArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: DEFAULTS.appId,
    appName: DEFAULTS.appName,
    bundleId: DEFAULTS.bundleId,
    marketingVersion: DEFAULTS.marketingVersion,
    buildNumber: DEFAULTS.buildNumber,
    groupName: DEFAULTS.groupName,
    testerEmail: process.env.QUIPSLY_CAPTURE_TESTER_EMAIL || "",
    expectedTesterStates: [],
    outputPath: "",
  };

  const takeValue = (index, flag) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${flag} requires a value.`);
    }
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
      case "--app-name":
        options.appName = takeValue(index, argument);
        index += 1;
        break;
      case "--bundle-id":
        options.bundleId = takeValue(index, argument);
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
      case "--group":
        options.groupName = takeValue(index, argument);
        index += 1;
        break;
      case "--tester-email":
        options.testerEmail = takeValue(index, argument);
        index += 1;
        break;
      case "--expect-tester-state":
        options.expectedTesterStates = takeValue(index, argument)
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean);
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
  APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/key.json \\
    node scripts/release/quipsly-app-store-connect-readback.mjs [options]

Options:
  --api-key-path <path>          Fastlane App Store Connect API-key JSON.
  --app-id <id>                  App Store Connect app ID.
  --app-name <name>              Expected App Store name.
  --bundle-id <id>               Expected bundle ID.
  --version <version>            Expected marketing version.
  --build <number>               Expected build number.
  --group <name>                 Expected internal TestFlight group.
  --tester-email <email>         Match one assigned tester without printing it.
  --expect-tester-state <states> Comma-separated accepted API states.
  --output <path>                Write the redacted JSON receipt with mode 0600.
`;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createScopedToken({ keyId, issuerId, privateKey, scopes, now }) {
  const issuedAt = now ?? Math.floor(Date.now() / 1000);
  const header = encodeJson({
    alg: "ES256",
    kid: keyId,
    typ: "JWT",
  });
  const payload = encodeJson({
    iss: issuerId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: "appstoreconnect-v1",
    scope: scopes,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(unsignedToken), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${unsignedToken}.${signature}`;
}

function makeRequest(path, searchEntries = []) {
  const url = new URL(path, API_ORIGIN);
  for (const [key, value] of searchEntries) {
    url.searchParams.append(key, value);
  }
  const requestPath = `${url.pathname}${url.search}`;
  return {
    url: url.toString(),
    scope: `GET ${decodeURIComponent(requestPath)}`,
  };
}

async function readApiKey(apiKeyPath) {
  if (!apiKeyPath) {
    fail("APP_STORE_CONNECT_API_KEY_PATH or --api-key-path is required.");
  }
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

async function requestJson(request, token) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(request.url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();
    if (response.ok) {
      return body;
    }
    const details = (body.errors || []).map(
      ({ status, code, title, detail }) => ({ status, code, title, detail }),
    );
    finalError = new Error(
      `App Store Connect returned HTTP ${response.status}: ${JSON.stringify(details)}`,
    );
    if (response.status !== 429 && response.status < 500) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw finalError;
}

function relationshipIds(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  if (Array.isArray(data)) {
    return data.map(({ id }) => id);
  }
  return data?.id ? [data.id] : [];
}

function includedResource(document, type, id) {
  return (document.included || []).find(
    (resource) => resource.type === type && resource.id === id,
  );
}

function emailDigest(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function summarizeReadback({
  options,
  appDocument,
  buildDocument,
  groupDocument,
  testerDocument,
  auditedAt = new Date().toISOString(),
}) {
  const app = appDocument.data;
  if (!app) {
    fail(`App Store Connect app ${options.appId} was not found.`);
  }

  const matchingBuild = (buildDocument.data || []).find((build) => {
    if (build.attributes?.version !== options.buildNumber) {
      return false;
    }
    const preReleaseId = relationshipIds(build, "preReleaseVersion")[0];
    const preRelease = includedResource(
      buildDocument,
      "preReleaseVersions",
      preReleaseId,
    );
    return preRelease?.attributes?.version === options.marketingVersion;
  });
  if (!matchingBuild) {
    fail(
      `Build ${options.marketingVersion} (${options.buildNumber}) was not found for app ${options.appId}.`,
    );
  }

  const preReleaseId = relationshipIds(matchingBuild, "preReleaseVersion")[0];
  const betaDetailId = relationshipIds(matchingBuild, "buildBetaDetail")[0];
  const preRelease = includedResource(
    buildDocument,
    "preReleaseVersions",
    preReleaseId,
  );
  const betaDetail = includedResource(
    buildDocument,
    "buildBetaDetails",
    betaDetailId,
  );

  const group = (groupDocument.data || []).find(
    (candidate) => candidate.attributes?.name === options.groupName,
  );
  if (!group) {
    fail(`TestFlight group "${options.groupName}" was not found.`);
  }
  const groupBuildIds = relationshipIds(group, "builds");
  const groupTesterIds = new Set(relationshipIds(group, "betaTesters"));

  const assignedTesters = (testerDocument.data || []).filter((tester) => {
    const testerGroupIds = relationshipIds(tester, "betaGroups");
    return (
      groupTesterIds.has(tester.id) && testerGroupIds.includes(group.id)
    );
  });
  const expectedTester = options.testerEmail
    ? assignedTesters.find(
        (tester) =>
          tester.attributes?.email?.trim().toLowerCase()
          === options.testerEmail.trim().toLowerCase(),
      )
    : undefined;
  const subjectTester =
    expectedTester
    || (!options.testerEmail && assignedTesters.length === 1
      ? assignedTesters[0]
      : undefined);
  const testerStates = [
    ...new Set(
      assignedTesters
        .map((tester) => tester.attributes?.state)
        .filter(Boolean),
    ),
  ].sort();

  const checks = {
    appIdentity:
      app.id === options.appId
      && app.attributes?.name === options.appName
      && app.attributes?.bundleId === options.bundleId,
    buildIsValid:
      matchingBuild.attributes?.processingState === "VALID"
      && matchingBuild.attributes?.expired === false,
    buildIsInInternalTesting:
      betaDetail?.attributes?.internalBuildState === "IN_BETA_TESTING",
    internalGroup:
      group.attributes?.isInternalGroup === true
      && groupBuildIds.includes(matchingBuild.id),
    testerAssigned:
      assignedTesters.length > 0
      && (!options.testerEmail || Boolean(expectedTester)),
    testerState:
      options.expectedTesterStates.length === 0
      || Boolean(
        subjectTester
        && options.expectedTesterStates.includes(
          subjectTester.attributes?.state,
        ),
      ),
  };

  return {
    schema: "quipsly-app-store-connect-readback-v1",
    auditedAt,
    app: {
      id: app.id,
      name: app.attributes?.name,
      bundleId: app.attributes?.bundleId,
    },
    build: {
      id: matchingBuild.id,
      marketingVersion: preRelease?.attributes?.version,
      buildNumber: matchingBuild.attributes?.version,
      uploadedDate: matchingBuild.attributes?.uploadedDate,
      expirationDate: matchingBuild.attributes?.expirationDate,
      processingState: matchingBuild.attributes?.processingState,
      internalBuildState: betaDetail?.attributes?.internalBuildState,
      externalBuildState: betaDetail?.attributes?.externalBuildState,
      usesNonExemptEncryption:
        matchingBuild.attributes?.usesNonExemptEncryption,
    },
    group: {
      id: group.id,
      name: group.attributes?.name,
      isInternalGroup: group.attributes?.isInternalGroup,
      feedbackEnabled: group.attributes?.feedbackEnabled,
      includesBuild: groupBuildIds.includes(matchingBuild.id),
    },
    testers: {
      assignedCount: assignedTesters.length,
      states: testerStates,
      expectedTester: subjectTester
        ? {
            id: subjectTester.id,
            emailSha256: emailDigest(subjectTester.attributes.email),
            state: subjectTester.attributes?.state,
          }
        : null,
    },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const requests = {
    app: makeRequest(`/v1/apps/${options.appId}`),
    builds: makeRequest("/v1/builds", [
      ["filter[app]", options.appId],
      ["filter[version]", options.buildNumber],
      ["include", "preReleaseVersion,buildBetaDetail"],
      ["limit", "10"],
    ]),
    groups: makeRequest("/v1/betaGroups", [
      ["filter[app]", options.appId],
      ["include", "builds,betaTesters"],
      ["limit", "50"],
    ]),
    testers: makeRequest("/v1/betaTesters", [
      ["filter[apps]", options.appId],
      ["include", "betaGroups"],
      ["limit", "50"],
    ]),
  };
  const key = await readApiKey(options.apiKeyPath);
  const token = createScopedToken({
    ...key,
    scopes: Object.values(requests).map(({ scope }) => scope),
  });
  const [appDocument, buildDocument, groupDocument, testerDocument] =
    await Promise.all([
      requestJson(requests.app, token),
      requestJson(requests.builds, token),
      requestJson(requests.groups, token),
      requestJson(requests.testers, token),
    ]);
  const receipt = summarizeReadback({
    options,
    appDocument,
    buildDocument,
    groupDocument,
    testerDocument,
  });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;

  if (options.outputPath) {
    await writeFile(options.outputPath, serialized, { mode: 0o600 });
    await chmod(options.outputPath, 0o600);
  }
  process.stdout.write(serialized);
  if (!receipt.passed) {
    process.exitCode = 1;
  }
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
