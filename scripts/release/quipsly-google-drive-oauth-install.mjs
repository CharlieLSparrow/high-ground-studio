#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_JAVASCRIPT_ORIGINS = [
  "https://nest.quipsly.com",
  "http://127.0.0.1:3012",
];

export const REQUIRED_REDIRECT_URIS = [
  "https://nest.quipsly.com/api/media/connections/google-drive/callback",
  "http://127.0.0.1:3012/api/media/connections/google-drive/callback",
];

const TARGET_SECRETS = [
  ["clientId", "quipsly-google-drive-oauth-client-id"],
  ["clientSecret", "quipsly-google-drive-oauth-client-secret"],
];

const REQUIRED_EXISTING_SECRETS = [
  "quipsly-google-drive-oauth-state-secret",
  "quipsly-google-drive-oauth-token-encryption-key",
  "quipsly-google-drive-picker-api-key",
  "quipsly-google-drive-picker-app-id",
];

function usage() {
  return `Usage: node scripts/release/quipsly-google-drive-oauth-install.mjs --credentials PATH [options]

Validate one Google Auth Platform Web application credential and install its
ID and secret into Google Secret Manager without printing either value.

Options:
  --credentials PATH   Downloaded Google OAuth client JSON (required)
  --project ID         Google Cloud project (default: high-ground-odyssey)
  --gcloud-bin PATH    gcloud executable (default: gcloud on PATH)
  --state-dir PATH     Local Quipsly lifecycle state directory
  --dry-run            Validate the file only; do not call Google or write state
  -h, --help           Show this help
`;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))]
    : [];
}

function assertProjectId(projectId) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) {
    throw new Error("The Google Cloud project ID is malformed.");
  }
  return projectId;
}

function missingValues(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

export function validateCredentialsDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The credentials file must contain one JSON object.");
  }
  const web = document.web;
  if (!web || typeof web !== "object" || Array.isArray(web)) {
    throw new Error(
      "This is not a Google Web application OAuth credential. Create a Web application client, not an installed or iOS client.",
    );
  }
  const clientId = text(web.client_id);
  const clientSecret = text(web.client_secret);
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error("The OAuth client ID is missing or malformed.");
  }
  if (clientSecret.length < 10 || clientSecret.length > 512) {
    throw new Error("The OAuth client secret is missing or malformed.");
  }
  const javascriptOrigins = uniqueStrings(web.javascript_origins);
  const redirectUris = uniqueStrings(web.redirect_uris);
  const missingOrigins = missingValues(
    REQUIRED_JAVASCRIPT_ORIGINS,
    javascriptOrigins,
  );
  const missingRedirects = missingValues(REQUIRED_REDIRECT_URIS, redirectUris);
  const unexpectedOrigins = missingValues(
    javascriptOrigins,
    REQUIRED_JAVASCRIPT_ORIGINS,
  );
  const unexpectedRedirects = missingValues(
    redirectUris,
    REQUIRED_REDIRECT_URIS,
  );
  if (
    missingOrigins.length ||
    missingRedirects.length ||
    unexpectedOrigins.length ||
    unexpectedRedirects.length
  ) {
    const details = [
      missingOrigins.length
        ? `missing JavaScript origins: ${missingOrigins.join(", ")}`
        : "",
      missingRedirects.length
        ? `missing redirect URIs: ${missingRedirects.join(", ")}`
        : "",
      unexpectedOrigins.length
        ? `unexpected JavaScript origins: ${unexpectedOrigins.join(", ")}`
        : "",
      unexpectedRedirects.length
        ? `unexpected redirect URIs: ${unexpectedRedirects.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(`The OAuth client does not match Quipsly: ${details}.`);
  }
  return { clientId, clientSecret, javascriptOrigins, redirectUris };
}

function readCredentials(path) {
  const resolved = resolve(path);
  const stats = lstatSync(resolved);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("The credentials path must be one ordinary file.");
  }
  if (stats.size <= 0 || stats.size > 64 * 1024) {
    throw new Error("The credentials file has an unexpected size.");
  }
  let document;
  try {
    document = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new Error("The credentials file is not valid JSON.");
  }
  return { resolved, credentials: validateCredentialsDocument(document) };
}

function defaultStateDir() {
  if (text(process.env.QUIPSLY_LOCAL_STATE_DIR)) {
    return resolve(process.env.QUIPSLY_LOCAL_STATE_DIR);
  }
  if (process.platform === "darwin") {
    try {
      const root = execFileSync("getconf", ["DARWIN_USER_CACHE_DIR"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (root) return join(root.replace(/\/$/, ""), "quipsly", "local");
    } catch {
      // Fall through to the portable temporary directory.
    }
  }
  return join(tmpdir(), `quipsly-local-${process.getuid?.() ?? "user"}`);
}

function writeAtomicPrivateFile(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function gcloudRunner(gcloudBin) {
  return (args, options = {}) =>
    execFileSync(gcloudBin, args, {
      encoding: "utf8",
      input: options.input,
      stdio: options.input
        ? ["pipe", "pipe", "pipe"]
        : ["ignore", "pipe", "pipe"],
    }).trim();
}

function secretExists(runGcloud, projectId, secretName) {
  try {
    runGcloud(["secrets", "describe", secretName, "--project", projectId]);
    return true;
  } catch {
    return false;
  }
}

function requireLatestSecret(runGcloud, projectId, secretName) {
  try {
    runGcloud([
      "secrets",
      "versions",
      "describe",
      "latest",
      "--secret",
      secretName,
      "--project",
      projectId,
    ]);
  } catch {
    throw new Error(
      `Required prerequisite secret ${secretName}:latest is unavailable in ${projectId}.`,
    );
  }
}

function secretFingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function installSecretVersion(runGcloud, projectId, secretName, value) {
  const exists = secretExists(runGcloud, projectId, secretName);
  if (!exists) {
    runGcloud([
      "secrets",
      "create",
      secretName,
      "--project",
      projectId,
      "--replication-policy",
      "automatic",
    ]);
  } else {
    try {
      const current = runGcloud([
        "secrets",
        "versions",
        "access",
        "latest",
        "--secret",
        secretName,
        "--project",
        projectId,
      ]);
      if (secretFingerprint(current) === secretFingerprint(value)) {
        requireLatestSecret(runGcloud, projectId, secretName);
        return "unchanged";
      }
    } catch {
      // A missing or disabled latest version is repaired by adding a new one.
    }
  }
  runGcloud(
    [
      "secrets",
      "versions",
      "add",
      secretName,
      "--project",
      projectId,
      "--data-file",
      "-",
    ],
    { input: value },
  );
  requireLatestSecret(runGcloud, projectId, secretName);
  return exists ? "rotated" : "created";
}

export function installGoogleDriveOAuthCredentials(input) {
  const projectId = assertProjectId(text(input.projectId));
  const credentials = validateCredentialsDocument({ web: input.web });
  const stateDir = resolve(input.stateDir);
  if (input.dryRun) {
    return {
      ok: true,
      dryRun: true,
      projectId,
      origins: credentials.javascriptOrigins,
      redirectUris: credentials.redirectUris,
      cloudWrites: 0,
      localWrites: 0,
    };
  }
  const runGcloud = input.runGcloud;
  runGcloud(["auth", "print-access-token"]);
  runGcloud(["projects", "describe", projectId]);
  for (const secretName of REQUIRED_EXISTING_SECRETS) {
    requireLatestSecret(runGcloud, projectId, secretName);
  }
  const secretActions = TARGET_SECRETS.map(([key, secretName]) => ({
    secretName,
    action: installSecretVersion(
      runGcloud,
      projectId,
      secretName,
      credentials[key],
    ),
  }));
  const installedAt = new Date().toISOString();
  const clientIdSha256 = createHash("sha256")
    .update(credentials.clientId)
    .digest("hex");
  const receipt = {
    schema: "quipsly-google-drive-oauth-install-v1",
    projectId,
    installedAt,
    clientIdSha256,
    javascriptOrigins: credentials.javascriptOrigins,
    redirectUris: credentials.redirectUris,
    secretNames: TARGET_SECRETS.map(([, secretName]) => secretName),
    secretValuesPrinted: false,
  };
  writeAtomicPrivateFile(
    join(stateDir, "google-drive-secret-project"),
    `${projectId}\n`,
  );
  writeAtomicPrivateFile(
    join(stateDir, "google-drive-oauth-install-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return {
    ok: true,
    dryRun: false,
    projectId,
    installedAt,
    clientIdSha256,
    secretNames: receipt.secretNames,
    secretActions,
    localActivationRecorded: true,
    secretValuesPrinted: false,
  };
}

function parseArgs(argv) {
  const options = {
    projectId: "high-ground-odyssey",
    credentialsPath: "",
    gcloudBin: process.env.GCLOUD_BIN || "gcloud",
    stateDir: defaultStateDir(),
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    if (argument === "--credentials") options.credentialsPath = value;
    else if (argument === "--project") options.projectId = value;
    else if (argument === "--gcloud-bin") options.gcloudBin = value;
    else if (argument === "--state-dir") options.stateDir = value;
    else throw new Error(`Unknown option ${argument}.`);
    index += 1;
  }
  if (!options.credentialsPath) {
    throw new Error("--credentials is required.");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const { resolved, credentials } = readCredentials(options.credentialsPath);
  const result = installGoogleDriveOAuthCredentials({
    projectId: options.projectId,
    stateDir: options.stateDir,
    dryRun: options.dryRun,
    runGcloud: gcloudRunner(options.gcloudBin),
    web: {
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      javascript_origins: credentials.javascriptOrigins,
      redirect_uris: credentials.redirectUris,
    },
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        credentialsFile: resolved,
        next: result.dryRun
          ? "Re-run without --dry-run to install the validated credential."
          : "Run pnpm quipsly:local:up; the launcher will load Drive secrets inside its durable children.",
      },
      null,
      2,
    )}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "OAuth installation failed."}\n`,
    );
    process.exitCode = 1;
  }
}
