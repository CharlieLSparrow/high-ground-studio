#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createScopedToken } from "./quipsly-app-store-connect-readback.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./quipsly-capture-release-target.mjs";

const API_ORIGIN = "https://api.appstoreconnect.apple.com";

function fail(message) {
  throw new Error(message);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    apiKeyPath: process.env.APP_STORE_CONNECT_API_KEY_PATH || "",
    appId: QUIPSLY_CAPTURE_RELEASE_TARGET.appId,
    testerEmail: process.env.QUIPSLY_CAPTURE_TESTER_EMAIL || "",
    outputPath: "",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--apply") {
      options.apply = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--api-key-path") options.apiKeyPath = value;
    else if (flag === "--app-id") options.appId = value;
    else if (flag === "--tester-email") options.testerEmail = value;
    else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  if (options.help) return options;
  if (!clean(options.testerEmail)) fail("--tester-email is required.");
  return options;
}

function usage() {
  return `Usage:
  APP_STORE_CONNECT_API_KEY_PATH=/absolute/private/key.json \\
    node scripts/release/quipsly-app-store-connect-resend-invitation.mjs \\
      --tester-email <apple-account-email> [--apply] [--output <receipt.json>]

Without --apply, this command performs only read-only app, tester, state, and
group-assignment verification. --apply sends or resends one TestFlight email
through Apple's betaTesterInvitations endpoint. Receipts contain only a digest
of the tester email.
`;
}

function makeRequest(apiPath, searchEntries = [], method = "GET") {
  const url = new URL(apiPath, API_ORIGIN);
  for (const [key, value] of searchEntries) url.searchParams.append(key, value);
  return {
    method,
    url: url.toString(),
    scope: `${method} ${decodeURIComponent(`${url.pathname}${url.search}`)}`,
  };
}

async function readApiKey(apiKeyPath) {
  if (!clean(apiKeyPath)) {
    fail("APP_STORE_CONNECT_API_KEY_PATH or --api-key-path is required.");
  }
  const keyStat = await stat(apiKeyPath);
  if ((keyStat.mode & 0o077) !== 0) {
    fail(`API-key JSON must not be group- or world-readable: ${apiKeyPath}`);
  }
  const document = JSON.parse(await readFile(apiKeyPath, "utf8"));
  for (const field of ["key_id", "issuer_id", "key"]) {
    if (!clean(document[field])) fail(`API-key JSON is missing ${field}.`);
  }
  return {
    keyId: clean(document.key_id),
    issuerId: clean(document.issuer_id),
    privateKey: document.key,
  };
}

async function requestJson(request, key, body) {
  let finalError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createScopedToken({
      ...key,
      ...(request.method === "GET" ? { scopes: [request.scope] } : {}),
    });
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
    if (response.ok) {
      return { status: response.status, document };
    }
    const details = (document?.errors || []).map(
      ({ status, code, title, detail }) => ({
        status,
        code,
        title,
        detail,
      }),
    );
    finalError = new Error(
      `App Store Connect returned HTTP ${response.status}: ${JSON.stringify(details)}`,
    );
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw finalError;
}

function relationshipIds(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  if (Array.isArray(data)) return data.map(({ id }) => id);
  return data?.id ? [data.id] : [];
}

function emailDigest(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function resolveInvitationTarget({
  appDocument,
  testerListDocument,
  testerDocument,
  expectedAppId,
  expectedEmail,
}) {
  const app = appDocument?.data;
  if (!app || app.id !== expectedAppId) {
    fail(`App Store Connect app ${expectedAppId} was not found.`);
  }
  const matchingTesters = (testerListDocument?.data || []).filter(
    (tester) =>
      clean(tester.attributes?.email).toLowerCase() ===
      clean(expectedEmail).toLowerCase(),
  );
  if (matchingTesters.length !== 1) {
    fail(
      `Expected exactly one TestFlight tester for the supplied email; found ${matchingTesters.length}.`,
    );
  }
  const tester = testerDocument?.data;
  if (!tester || tester.id !== matchingTesters[0].id) {
    fail("The exact tester detail did not match the tester lookup.");
  }
  if (
    clean(tester.attributes?.email).toLowerCase() !==
    clean(expectedEmail).toLowerCase()
  ) {
    fail("The exact tester detail returned a different email.");
  }
  const testerAppIds = relationshipIds(tester, "apps");
  const testerGroupIds = relationshipIds(tester, "betaGroups");
  if (!testerAppIds.includes(expectedAppId) || testerGroupIds.length === 0) {
    fail("The tester is not assigned to this app through a TestFlight group.");
  }
  const state =
    clean(
      tester.attributes?.state || matchingTesters[0].attributes?.state,
    ).toUpperCase() || "UNKNOWN";
  if (state !== "INVITED") {
    fail(`Tester state ${state} is not eligible for an invitation resend.`);
  }
  return {
    app,
    tester,
    testerGroupIds,
    state: state || "UNKNOWN",
  };
}

export function buildInvitationBody({ appId, testerId }) {
  return {
    data: {
      type: "betaTesterInvitations",
      relationships: {
        app: { data: { type: "apps", id: appId } },
        betaTester: {
          data: { type: "betaTesters", id: testerId },
        },
      },
    },
  };
}

async function writeReceipt(outputPath, receipt) {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (clean(outputPath)) {
    await writeFile(outputPath, serialized, { mode: 0o600 });
    await chmod(outputPath, 0o600);
  }
  process.stdout.write(serialized);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const key = await readApiKey(options.apiKeyPath);
  const appRequest = makeRequest(`/v1/apps/${options.appId}`);
  const testerListRequest = makeRequest("/v1/betaTesters", [
    ["filter[apps]", options.appId],
    ["filter[email]", clean(options.testerEmail).toLowerCase()],
    ["include", "betaGroups"],
    ["limit", "10"],
  ]);
  const [{ document: appDocument }, { document: testerListDocument }] =
    await Promise.all([
      requestJson(appRequest, key),
      requestJson(testerListRequest, key),
    ]);
  const matchingTesterIds = (testerListDocument?.data || [])
    .filter(
      (tester) =>
        clean(tester.attributes?.email).toLowerCase() ===
        clean(options.testerEmail).toLowerCase(),
    )
    .map((tester) => tester.id);
  if (matchingTesterIds.length !== 1) {
    fail(
      `Expected exactly one app-scoped tester for the supplied email; found ${matchingTesterIds.length}.`,
    );
  }
  const [testerId] = matchingTesterIds;
  const testerRequest = makeRequest(`/v1/betaTesters/${testerId}`, [
    ["fields[betaTesters]", "email,state,inviteType,apps,betaGroups"],
    ["include", "apps,betaGroups"],
  ]);
  const { document: testerDocument } = await requestJson(testerRequest, key);
  const target = resolveInvitationTarget({
    appDocument,
    testerListDocument,
    testerDocument,
    expectedAppId: options.appId,
    expectedEmail: options.testerEmail,
  });

  let invitationSent = false;
  let invitationReceiptPresent = false;
  let providerStatus = null;
  if (options.apply) {
    const invitationRequest = makeRequest(
      "/v1/betaTesterInvitations",
      [],
      "POST",
    );
    const { status, document } = await requestJson(
      invitationRequest,
      key,
      buildInvitationBody({
        appId: target.app.id,
        testerId: target.tester.id,
      }),
    );
    providerStatus = status;
    invitationReceiptPresent = Boolean(
      document?.data?.type === "betaTesterInvitations" && document?.data?.id,
    );
    if (status !== 201 || !invitationReceiptPresent) {
      fail("App Store Connect did not return a beta invitation receipt.");
    }
    invitationSent = true;
  }

  await writeReceipt(options.outputPath, {
    schema: "quipsly-app-store-connect-resend-invitation-v1",
    auditedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "plan",
    app: {
      id: target.app.id,
      name: target.app.attributes?.name || "",
      bundleId: target.app.attributes?.bundleId || "",
    },
    tester: {
      id: target.tester.id,
      emailSha256: emailDigest(options.testerEmail),
      state: target.state,
      inviteType: target.tester.attributes?.inviteType || "",
      assignedGroupCount: target.testerGroupIds.length,
    },
    plan: {
      exactTesterResolved: true,
      assignedToApp: true,
      eligibleForResend: target.state === "INVITED",
      wouldSendInvitation: !options.apply,
    },
    result: {
      invitationSent,
      providerStatus,
      invitationReceiptPresent,
      emailDeliveryProven: false,
    },
    safety: {
      rawTesterEmailPrinted: false,
      apiKeyPrinted: false,
      privateKeyPrinted: false,
      dryRunByDefault: true,
    },
    passed: options.apply ? invitationSent : true,
  });
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(
      `FAIL ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
