#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const project =
  process.env.WEB_CLOUD_RUN_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "high-ground-odyssey";
const region = process.env.WEB_CLOUD_RUN_REGION ?? "us-central1";
const service = process.env.WEB_CLOUD_RUN_SERVICE ?? "web";
const runtimeSecret = process.env.WEB_DATABASE_SECRET ?? "web-cloudsql-database-url";
const sqlInstance = process.env.WEB_CLOUD_SQL_INSTANCE ?? "studio-postgres";
const expectedConnectionName =
  process.env.WEB_CLOUD_SQL_CONNECTION_NAME ??
  `${project}:us-central1:${sqlInstance}`;
const readSecretValue = process.env.WEB_DB_TARGET_REPORT_SKIP_SECRET !== "1";
const requireRuntimeMount = process.env.WEB_DB_TARGET_REPORT_REQUIRE_MOUNT !== "0";
const strict = process.env.WEB_DB_TARGET_REPORT_STRICT === "1";

const passed = [];
const info = [];
const pending = [];
const warnings = [];
const blocked = [];
let mountedDatabaseSecret = null;
let databaseTargetProvider = null;

function runReadOnly(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function getJson(label, command, args) {
  const output = runReadOnly(command, args);

  if (!output) {
    warnings.push(`${label} could not be read`);
    return null;
  }

  try {
    return JSON.parse(output);
  } catch {
    warnings.push(`${label} did not return parseable JSON`);
    return null;
  }
}

function printList(title, entries) {
  console.log(`\n${title}`);

  if (entries.length === 0) {
    console.log("  none");
    return;
  }

  for (const entry of entries) {
    console.log(`  - ${entry}`);
  }
}

function getSecretRefName(envEntry) {
  return (
    envEntry?.valueFrom?.secretKeyRef?.name ??
    envEntry?.valueSource?.secretKeyRef?.secret ??
    envEntry?.valueSource?.secretKeyRef?.name ??
    null
  );
}

function classifyDatabaseTarget({ host, hostParameter }) {
  const normalizedHost = host.toLowerCase();
  const normalizedHostParameter = hostParameter.toLowerCase();

  if (normalizedHost.includes("neon.tech")) {
    return "Neon";
  }

  if (
    normalizedHostParameter.startsWith("/cloudsql/") ||
    normalizedHost.includes("cloudsql")
  ) {
    return "Cloud SQL";
  }

  if (["localhost", "127.0.0.1", "::1"].includes(normalizedHost)) {
    return "Local";
  }

  return "External PostgreSQL";
}

function parseDatabaseUrl(value) {
  const url = new URL(value);
  const hostParameter = url.searchParams.get("host") ?? "";
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  return {
    provider: classifyDatabaseTarget({
      host: url.hostname,
      hostParameter,
    }),
    protocol: url.protocol.replace(/:$/, ""),
    host: url.hostname || "(socket)",
    port: url.port || "(default)",
    databaseName: databaseName || "(none)",
    sslMode: url.searchParams.get("sslmode") ?? "(default)",
    hasUsername: Boolean(url.username),
    hasPassword: Boolean(url.password),
    hostParameter: hostParameter || "(none)",
  };
}

function readCloudRunService() {
  const runService = getJson("Cloud Run service", "gcloud", [
    "run",
    "services",
    "describe",
    service,
    `--region=${region}`,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!runService) {
    blocked.push(`Cloud Run service ${service} is not readable`);
    return;
  }

  const latestRevision = runService.status?.latestReadyRevisionName;
  const url = runService.status?.url;
  const annotations = runService.spec?.template?.metadata?.annotations ?? {};
  const cloudSqlInstances = annotations["run.googleapis.com/cloudsql-instances"];
  const env = runService.spec?.template?.spec?.containers?.[0]?.env ?? [];
  const databaseEnv = env.find((entry) => entry.name === "DATABASE_URL");
  const mountedSecretName = databaseEnv ? getSecretRefName(databaseEnv) : null;
  mountedDatabaseSecret = mountedSecretName;

  if (url) {
    passed.push(`Cloud Run ${service} URL: ${url}`);
  }

  if (latestRevision) {
    passed.push(`Cloud Run latest ready revision: ${latestRevision}`);
  }

  if (mountedSecretName === runtimeSecret) {
    passed.push(`DATABASE_URL is mounted from Secret Manager secret ${runtimeSecret}`);
  } else if (!requireRuntimeMount) {
    pending.push(
      `DATABASE_URL is mounted from ${mountedSecretName ?? "missing"} while this report inspects staged secret ${runtimeSecret}`,
    );
  } else {
    blocked.push(
      `DATABASE_URL secret mount is ${mountedSecretName ?? "missing"}; expected ${runtimeSecret}`,
    );
  }

  if (cloudSqlInstances?.split(",").includes(expectedConnectionName)) {
    passed.push(`Cloud Run has Cloud SQL attachment ${expectedConnectionName}`);
  } else {
    pending.push(
      `Cloud Run Cloud SQL attachment is ${cloudSqlInstances ?? "missing"}; expected ${expectedConnectionName}`,
    );
  }
}

function readRuntimeSecret() {
  if (!readSecretValue) {
    pending.push(
      `Skipped reading ${runtimeSecret}; unset WEB_DB_TARGET_REPORT_SKIP_SECRET to inspect the masked target`,
    );
    return;
  }

  const value = runReadOnly("gcloud", [
    "secrets",
    "versions",
    "access",
    "latest",
    `--secret=${runtimeSecret}`,
    `--project=${project}`,
  ]);

  if (!value) {
    warnings.push(`Secret Manager secret ${runtimeSecret} could not be read`);
    return;
  }

  let parsed;

  try {
    parsed = parseDatabaseUrl(value);
  } catch {
    blocked.push(`${runtimeSecret} does not contain a parseable PostgreSQL URL`);
    return;
  }

  info.push(`${runtimeSecret} provider: ${parsed.provider}`);
  info.push(`${runtimeSecret} host: ${parsed.host}`);
  info.push(`${runtimeSecret} database: ${parsed.databaseName}`);
  info.push(`${runtimeSecret} port: ${parsed.port}`);
  info.push(`${runtimeSecret} sslmode: ${parsed.sslMode}`);
  info.push(`${runtimeSecret} username present: ${parsed.hasUsername ? "yes" : "no"}`);
  info.push(`${runtimeSecret} password present: ${parsed.hasPassword ? "yes" : "no"}`);

  if (parsed.hostParameter !== "(none)") {
    info.push(`${runtimeSecret} host query parameter: ${parsed.hostParameter}`);
  }

  if (parsed.provider === "Cloud SQL") {
    passed.push(`${runtimeSecret} targets Cloud SQL`);
    databaseTargetProvider = "Cloud SQL";
  } else {
    pending.push(
      `${runtimeSecret} currently targets ${parsed.provider}; Cloud SQL attachment alone does not cut over Prisma`,
    );
    databaseTargetProvider = parsed.provider;
  }
}

function readCloudSqlInstance() {
  const instance = getJson("Cloud SQL instance", "gcloud", [
    "sql",
    "instances",
    "describe",
    sqlInstance,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!instance) {
    blocked.push(`Cloud SQL instance ${sqlInstance} is not readable`);
    return;
  }

  const backups = instance.settings?.backupConfiguration ?? {};

  passed.push(`Cloud SQL instance ${sqlInstance} state: ${instance.state}`);
  passed.push(`Cloud SQL version: ${instance.databaseVersion}`);
  passed.push(`Cloud SQL tier: ${instance.settings?.tier ?? "unknown"}`);
  passed.push(
    `Cloud SQL deletion protection: ${
      instance.settings?.deletionProtectionEnabled ? "enabled" : "disabled"
    }`,
  );
  passed.push(
    `Cloud SQL backups: ${
      backups.enabled ? `enabled, ${backups.backupRetentionSettings?.retainedBackups ?? "unknown"} retained` : "disabled"
    }`,
  );
}

function readCloudSqlDatabases() {
  const databases = getJson("Cloud SQL databases", "gcloud", [
    "sql",
    "databases",
    "list",
    `--instance=${sqlInstance}`,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!databases) {
    return;
  }

  const names = databases.map((database) => database.name).sort();

  info.push(`Cloud SQL databases: ${names.join(", ") || "none"}`);

  if (names.includes("web")) {
    passed.push("Cloud SQL database web already exists");
  } else {
    pending.push("Cloud SQL database web does not exist yet");
  }
}

function readCloudSqlUsers() {
  const users = getJson("Cloud SQL users", "gcloud", [
    "sql",
    "users",
    "list",
    `--instance=${sqlInstance}`,
    `--project=${project}`,
    "--format=json",
  ]);

  if (!users) {
    return;
  }

  const names = users.map((user) => user.name).sort();

  info.push(`Cloud SQL users: ${names.join(", ") || "none"}`);

  if (names.includes("web_app")) {
    passed.push("Cloud SQL user web_app already exists");
  } else {
    pending.push("Cloud SQL user web_app does not exist yet");
  }
}

console.log("Web database target report");
console.log("Read-only infrastructure check. This script does not mutate Google Cloud.");
console.log(
  "It may read the DATABASE_URL secret, but it prints only derived target metadata and never prints the full URL, username, or password.",
);
console.log(`\nProject: ${project}`);
console.log(`Region: ${region}`);
console.log(`Service: ${service}`);
console.log(`Runtime secret: ${runtimeSecret}`);
console.log(`Expected Cloud SQL: ${expectedConnectionName}`);
console.log(`Require runtime mount: ${requireRuntimeMount ? "yes" : "no"}`);

readCloudRunService();
readRuntimeSecret();
readCloudSqlInstance();
readCloudSqlDatabases();
readCloudSqlUsers();

printList("Passed checks", passed);
printList("Target facts", info);
printList("Pending work", pending);
printList("Warnings", warnings);
printList("Blocked items", blocked);

if (
  mountedDatabaseSecret === runtimeSecret &&
  databaseTargetProvider === "Cloud SQL" &&
  pending.length === 0 &&
  blocked.length === 0
) {
  console.log("\nCloud SQL cutover state");
  console.log(`  Live ${service} is mounted to ${runtimeSecret}, which targets Cloud SQL.`);
  console.log("  Keep the previous Cloud Run revision and the old web-database-url secret as rollback anchors until the new target has enough runtime history.");
} else {
  console.log("\nSmallest safe Cloud SQL cutover path");
  console.log("  1. Create a separate Cloud SQL database, likely `web`, if still missing.");
  console.log("  2. Create a least-privilege Cloud SQL user, likely `web_app`, and stage a new secret such as `web-cloudsql-database-url`.");
  console.log("  3. Run `pnpm db:push` against the staged Cloud SQL secret from the one-off Cloud Run Job image.");
  console.log("  4. Export/import production data with an explicit backup and row-count verification plan.");
  console.log("  5. Mount `web-cloudsql-database-url` on a no-traffic revision, smoke it, then route live traffic to that revision.");
  console.log("  6. Keep `web-database-url` as the legacy source/rollback secret until the cutover is stable.");
}

if (strict && (blocked.length > 0 || pending.length > 0)) {
  process.exitCode = 1;
}
