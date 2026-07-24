#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_ENV_FILES = [".env", ".env.local", "apps/quipsly/.env.local"];
const DEFAULT_PROJECT_ID = "high-ground-odyssey";

const SECRET_MAPPINGS = [
  ["LIVEKIT_URL", "quipsly-livekit-url"],
  ["LIVEKIT_API_KEY", "quipsly-livekit-api-key"],
  ["LIVEKIT_API_SECRET", "quipsly-livekit-api-secret"],
  ["LIVEKIT_EGRESS_GCS_BUCKET", "quipsly-livekit-egress-gcs-bucket"],
  ["LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON", "quipsly-livekit-egress-gcp-credentials-json"],
  ["GOOGLE_CALENDAR_ID", "quipsly-google-calendar-id"],
  ["GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "quipsly-google-calendar-service-account-json"],
  ["GOOGLE_CALENDAR_REFRESH_TOKEN", "quipsly-google-calendar-refresh-token"],
  ["GOOGLE_CALENDAR_IMPERSONATION_EMAIL", "quipsly-google-calendar-impersonation-email"],
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: options.input,
  }).trim();
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = stripQuotes(rawValue.trim());
  }
  return values;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnv(paths) {
  return paths.reduce((merged, path) => ({ ...merged, ...parseEnvFile(path) }), {});
}

function secretExists(projectId, secretName) {
  try {
    run("gcloud", ["secrets", "describe", secretName, "--project", projectId]);
    return true;
  } catch {
    return false;
  }
}

function addSecretVersion(projectId, secretName, value) {
  if (!secretExists(projectId, secretName)) {
    run("gcloud", [
      "secrets",
      "create",
      secretName,
      "--project",
      projectId,
      "--replication-policy",
      "automatic",
    ]);
  }

  run("gcloud", ["secrets", "versions", "add", secretName, "--project", projectId, "--data-file", "-"], {
    input: value,
  });
}

function main() {
  const projectId = process.env.PROJECT_ID || DEFAULT_PROJECT_ID;
  const envFiles = (process.env.ENV_FILES || DEFAULT_ENV_FILES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const env = loadEnv(envFiles);

  const seeded = [];
  const missing = [];

  for (const [envName, secretName] of SECRET_MAPPINGS) {
    const value = env[envName];
    if (!value) {
      missing.push(envName);
      continue;
    }

    addSecretVersion(projectId, secretName, value);
    seeded.push({ envName, secretName });
  }

  console.log(JSON.stringify(
    {
      ok: true,
      projectId,
      envFiles: envFiles.filter((path) => existsSync(path)),
      seeded,
      missing,
      cloudRunSecretBindings: seeded.map(({ envName, secretName }) => `${envName}=${secretName}:latest`).join(","),
      note: "Secret values were written to Secret Manager and were not printed.",
    },
    null,
    2,
  ));
}

main();
