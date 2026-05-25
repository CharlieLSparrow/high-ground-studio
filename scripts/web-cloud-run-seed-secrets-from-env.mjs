#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_ENV_FILES = [".env", "apps/web/.env.local"];
const REQUIRED_SECRET_MAPPINGS = [
  ["DATABASE_URL", "web-cloudsql-database-url"],
  ["AUTH_SECRET", "web-auth-secret"],
  ["GOOGLE_CLIENT_ID", "web-google-client-id"],
  ["GOOGLE_CLIENT_SECRET", "web-google-client-secret"],
  ["HGO_OWNER_EMAILS", "web-owner-emails"],
  ["HGO_TEAM_SCHEDULER_EMAILS", "web-team-scheduler-emails"],
  ["HGO_COACH_EMAILS", "web-coach-emails"],
];
const OPTIONAL_SECRET_MAPPINGS = [
  ["STRIPE_SECRET_KEY", "web-stripe-secret-key"],
  ["STRIPE_WEBHOOK_SECRET", "web-stripe-webhook-secret"],
  ["STRIPE_PUBLISHABLE_KEY", "web-stripe-publishable-key"],
  ["STRIPE_COACHING_PRICE_ID", "web-stripe-coaching-price-id"],
  ["STRIPE_SUPPORTER_PRICE_ID", "web-stripe-supporter-price-id"],
  ["STRIPE_SUCCESS_URL", "web-stripe-success-url"],
  ["STRIPE_CANCEL_URL", "web-stripe-cancel-url"],
  ["PATREON_CLIENT_ID", "web-patreon-client-id"],
  ["PATREON_CLIENT_SECRET", "web-patreon-client-secret"],
  ["PATREON_WEBHOOK_SECRET", "web-patreon-webhook-secret"],
  ["PATREON_CAMPAIGN_ID", "web-patreon-campaign-id"],
  ["PATREON_CREATOR_ACCESS_TOKEN", "web-patreon-creator-access-token"],
  ["GOOGLE_CALENDAR_ID", "web-google-calendar-id"],
  ["GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "web-google-calendar-service-account-json"],
  ["GOOGLE_CALENDAR_REFRESH_TOKEN", "web-google-calendar-refresh-token"],
  ["GOOGLE_CALENDAR_IMPERSONATION_EMAIL", "web-google-calendar-impersonation-email"],
  ["GOOGLE_CALENDAR_SYNC_CLIENT_ID", "web-google-calendar-sync-client-id"],
  ["GOOGLE_CALENDAR_SYNC_CLIENT_SECRET", "web-google-calendar-sync-client-secret"],
  ["GOOGLE_CALENDAR_SEND_UPDATES", "web-google-calendar-send-updates"],
  ["HGO_MERCH_PROVIDER", "web-hgo-merch-provider"],
  ["SHOPIFY_ADMIN_ACCESS_TOKEN", "web-shopify-admin-access-token"],
  ["SHOPIFY_STORE_DOMAIN", "web-shopify-store-domain"],
  ["FOURTHWALL_API_KEY", "web-fourthwall-api-key"],
  ["FOURTHWALL_SHOP_URL", "web-fourthwall-shop-url"],
  ["PRINTFUL_API_KEY", "web-printful-api-key"],
  ["PRINTFUL_STORE_ID", "web-printful-store-id"],
  ["PRINTIFY_API_KEY", "web-printify-api-key"],
  ["PRINTIFY_SHOP_ID", "web-printify-shop-id"],
  ["GELATO_API_KEY", "web-gelato-api-key"],
  ["GELATO_STORE_ID", "web-gelato-store-id"],
  ["RESEND_API_KEY", "web-resend-api-key"],
  ["HGO_EMAIL_FROM", "web-hgo-email-from"],
  ["RESEND_WEBHOOK_SECRET", "web-resend-webhook-secret"],
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

for (const [envName, secretName] of REQUIRED_SECRET_MAPPINGS) {
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

for (const [envName, secretName] of OPTIONAL_SECRET_MAPPINGS) {
  const value = values[envName] || process.env[envName] || "";

  if (!value) {
    console.log(`${secretName}: skipped; ${envName} is not set`);
    continue;
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
  console.log(`${secretName}: added optional secret version from ${envName}`);
}

console.log("\nDone.");
