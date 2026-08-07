import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  installGoogleDriveOAuthCredentials,
  REQUIRED_JAVASCRIPT_ORIGINS,
  REQUIRED_REDIRECT_URIS,
  validateCredentialsDocument,
} from "./quipsly-google-drive-oauth-install.mjs";

const CLIENT_ID = "123456789-quipsly.apps.googleusercontent.com";
const CLIENT_SECRET = "GOCSPX-test-secret-value";

function web(overrides = {}) {
  return {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    javascript_origins: REQUIRED_JAVASCRIPT_ORIGINS,
    redirect_uris: REQUIRED_REDIRECT_URIS,
    ...overrides,
  };
}

test("accepts only a Quipsly web client with both production and local callbacks", () => {
  assert.deepEqual(validateCredentialsDocument({ web: web() }), {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    javascriptOrigins: REQUIRED_JAVASCRIPT_ORIGINS,
    redirectUris: REQUIRED_REDIRECT_URIS,
  });
  assert.throws(
    () =>
      validateCredentialsDocument({
        web: web({ redirect_uris: [REQUIRED_REDIRECT_URIS[0]] }),
      }),
    /missing redirect URIs: http:\/\/127\.0\.0\.1:3012/,
  );
  assert.throws(
    () =>
      validateCredentialsDocument({
        web: web({
          javascript_origins: [
            ...REQUIRED_JAVASCRIPT_ORIGINS,
            "https://example.invalid",
          ],
        }),
      }),
    /unexpected JavaScript origins: https:\/\/example\.invalid/,
  );
  assert.throws(
    () => validateCredentialsDocument({ installed: web() }),
    /not a Google Web application OAuth credential/,
  );
});

test("dry-run validation performs no cloud or local writes", () => {
  let calls = 0;
  const result = installGoogleDriveOAuthCredentials({
    projectId: "high-ground-odyssey",
    stateDir: join(tmpdir(), "must-not-be-created"),
    dryRun: true,
    runGcloud: () => {
      calls += 1;
    },
    web: web(),
  });
  assert.equal(calls, 0);
  assert.equal(result.cloudWrites, 0);
  assert.equal(result.localWrites, 0);
});

test("installs two secret versions and retains only a non-secret local receipt", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "quipsly-drive-oauth-test-"));
  const calls = [];
  const existing = new Set([
    "quipsly-google-drive-oauth-state-secret",
    "quipsly-google-drive-oauth-token-encryption-key",
    "quipsly-google-drive-picker-api-key",
    "quipsly-google-drive-picker-app-id",
  ]);
  const secretValues = new Map();
  const runGcloud = (args, options = {}) => {
    calls.push({ args, input: options.input });
    if (args[0] === "secrets" && args[1] === "describe") {
      if (!existing.has(args[2])) throw new Error("not found");
    }
    if (args[0] === "secrets" && args[1] === "create") existing.add(args[2]);
    if (
      args[0] === "secrets" &&
      args[1] === "versions" &&
      args[2] === "access"
    ) {
      if (!secretValues.has(args[5])) throw new Error("latest unavailable");
      return secretValues.get(args[5]);
    }
    if (args[0] === "secrets" && args[1] === "versions" && args[2] === "add") {
      secretValues.set(args[3], options.input);
    }
    return "ok";
  };
  try {
    const result = installGoogleDriveOAuthCredentials({
      projectId: "high-ground-odyssey",
      stateDir,
      dryRun: false,
      runGcloud,
      web: web(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.secretValuesPrinted, false);
    const versionInputs = calls
      .filter(
        ({ args }) =>
          args[0] === "secrets" && args[1] === "versions" && args[2] === "add",
      )
      .map(({ input }) => input);
    assert.deepEqual(versionInputs, [CLIENT_ID, CLIENT_SECRET]);
    const project = readFileSync(
      join(stateDir, "google-drive-secret-project"),
      "utf8",
    );
    const receiptText = readFileSync(
      join(stateDir, "google-drive-oauth-install-receipt.json"),
      "utf8",
    );
    assert.equal(project, "high-ground-odyssey\n");
    assert.doesNotMatch(receiptText, new RegExp(CLIENT_ID));
    assert.doesNotMatch(receiptText, new RegExp(CLIENT_SECRET));
    const receipt = JSON.parse(receiptText);
    assert.equal(receipt.schema, "quipsly-google-drive-oauth-install-v1");
    assert.match(receipt.clientIdSha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.secretValuesPrinted, false);

    const addCount = calls.filter(
      ({ args }) =>
        args[0] === "secrets" && args[1] === "versions" && args[2] === "add",
    ).length;
    const replay = installGoogleDriveOAuthCredentials({
      projectId: "high-ground-odyssey",
      stateDir,
      dryRun: false,
      runGcloud,
      web: web(),
    });
    assert.equal(
      calls.filter(
        ({ args }) =>
          args[0] === "secrets" && args[1] === "versions" && args[2] === "add",
      ).length,
      addCount,
    );
    assert.deepEqual(
      replay.secretActions.map(({ action }) => action),
      ["unchanged", "unchanged"],
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
