#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_ENV_FILES = [".env", "apps/web/.env.local"];
const SECRET_MAPPINGS = [
  ["DATABASE_URL", "web-database-url"],
  ["AUTH_SECRET", "web-auth-secret"],
  ["GOOGLE_CLIENT_ID", "web-google-client-id"],
  ["GOOGLE_CLIENT_SECRET", "web-google-client-secret"],
  ["HGO_OWNER_EMAILS", "web-owner-emails"],
  ["HGO_TEAM_SCHEDULER_EMAILS", "web-team-scheduler-emails"],
  ["HGO_COACH_EMAILS", "web-coach-emails"],
];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: options.input,
  }).trim();
}

function runInherited(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
  });
}

function getConfigValue(key) {
  try {
    const value = run("gcloud", ["config", "get-value", key]);
    return value && value !== "(unset)" ? value : "";
  } catch {
    return "";
  }
}

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);

    if (!match) {
      continue;
    }

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

function loadEnvValues(paths) {
  return paths.reduce(
    (values, path) => ({
      ...values,
      ...parseEnvFile(path),
    }),
    {},
  );
}

function secretHasEnabledVersion(project, secretName) {
  try {
    const raw = run("gcloud", [
      "secrets",
      "versions",
      "list",
      secretName,
      "--project",
      project,
      "--format=json",
      "--limit=20",
    ]);
    const versions = JSON.parse(raw || "[]");
    return versions.some((version) => version.state === "ENABLED");
  } catch {
    return false;
  }
}

const project =
  process.env.WEB_CLOUD_RUN_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  getConfigValue("project");

if (!project) {
  throw new Error("GCP project is required.");
}

const envFiles = process.env.WEB_SECRET_ENV_FILES
  ? process.env.WEB_SECRET_ENV_FILES.split(",").map((file) => file.trim()).filter(Boolean)
  : DEFAULT_ENV_FILES;
const values = loadEnvValues(envFiles);
const force = process.env.FORCE_WEB_SECRET_VERSION === "1";

console.log("Web Cloud Run secret seeding");
console.log(`project: ${project}`);
console.log(`env files: ${envFiles.join(", ")}`);
console.log("Secret values are not printed.");

for (const [envName, secretName] of SECRET_MAPPINGS) {
  const value = values[envName] || process.env[envName] || "";

  if (!value) {
    throw new Error(`${envName} is missing from env files or process env.`);
  }

  const hasEnabledVersion = secretHasEnabledVersion(project, secretName);

  if (hasEnabledVersion && !force) {
    console.log(`${secretName}: enabled version already exists; skipped`);
    continue;
  }

  runInherited(
    "gcloud",
    [
      "secrets",
      "versions",
      "add",
      secretName,
      "--project",
      project,
      "--data-file=-",
    ],
    { input: value },
  );
  console.log(`${secretName}: added secret version from ${envName}`);
}

console.log("\nDone.");
