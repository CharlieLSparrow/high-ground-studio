#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const project =
  process.env.WEB_CLOUD_RUN_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "high-ground-odyssey";
const sqlInstance = process.env.WEB_CLOUD_SQL_INSTANCE ?? "studio-postgres";
const connectionName =
  process.env.WEB_CLOUD_SQL_CONNECTION_NAME ??
  `${project}:us-central1:${sqlInstance}`;
const databaseName = process.env.WEB_CLOUDSQL_DATABASE ?? "web";
const databaseUser = process.env.WEB_CLOUDSQL_USER ?? "web_app";
const stagedSecret =
  process.env.WEB_CLOUDSQL_DATABASE_SECRET ?? "web-cloudsql-database-url";
const runtimeServiceAccount =
  process.env.WEB_CLOUD_RUN_SERVICE_ACCOUNT ??
  `web-cloud-run@${project}.iam.gserviceaccount.com`;
const forcePassword = process.env.FORCE_WEB_CLOUDSQL_PASSWORD === "1";
const forceSecretVersion = process.env.FORCE_WEB_CLOUDSQL_SECRET_VERSION === "1";
const grantCloudSqlClient = process.env.WEB_CLOUDSQL_GRANT_CLIENT !== "0";
const dryRun = process.env.WEB_CLOUDSQL_PREPARE_DRY_RUN === "1";

const planned = [];
const changed = [];
const passed = [];
const warnings = [];
const blocked = [];

function commandText(command, args) {
  const redactedArgs = args.map((arg) =>
    arg.startsWith("--password=") ? "--password=REDACTED" : arg,
  );

  return [command, ...redactedArgs].join(" ");
}

function run(command, args, options = {}) {
  if (dryRun && options.mutates) {
    planned.push(commandText(command, args));
    return "";
  }

  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      input: options.input,
    }).trim();
  } catch (error) {
    const stderr = String(error.stderr ?? "").trim();
    const stdout = String(error.stdout ?? "").trim();
    throw new Error(
      `${commandText(command, args)} failed${stderr || stdout ? `: ${stderr || stdout}` : ""}`,
    );
  }
}

function runMutating(command, args, options = {}) {
  const output = run(command, args, { ...options, mutates: true });

  if (!dryRun) {
    changed.push(commandText(command, args));
  }

  return output;
}

function readJson(label, command, args) {
  const output = run(command, args);

  try {
    return JSON.parse(output || "[]");
  } catch {
    throw new Error(`${label} did not return parseable JSON.`);
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

function generatePassword() {
  return randomBytes(36).toString("base64url");
}

function makeDatabaseUrl(password) {
  const encodedUser = encodeURIComponent(databaseUser);
  const encodedPassword = encodeURIComponent(password);
  const encodedHost = encodeURIComponent(`/cloudsql/${connectionName}`);

  return `postgresql://${encodedUser}:${encodedPassword}@localhost/${databaseName}?host=${encodedHost}`;
}

function listDatabases() {
  return readJson("Cloud SQL databases", "gcloud", [
    "sql",
    "databases",
    "list",
    `--instance=${sqlInstance}`,
    `--project=${project}`,
    "--format=json",
  ]);
}

function listUsers() {
  return readJson("Cloud SQL users", "gcloud", [
    "sql",
    "users",
    "list",
    `--instance=${sqlInstance}`,
    `--project=${project}`,
    "--format=json",
  ]);
}

function secretExists() {
  try {
    run("gcloud", [
      "secrets",
      "describe",
      stagedSecret,
      `--project=${project}`,
      "--format=value(name)",
    ]);
    return true;
  } catch {
    return false;
  }
}

function secretHasEnabledVersion() {
  try {
    const versions = readJson("Secret versions", "gcloud", [
      "secrets",
      "versions",
      "list",
      stagedSecret,
      `--project=${project}`,
      "--format=json",
      "--limit=20",
    ]);

    return versions.some((version) => version.state === "ENABLED");
  } catch {
    return false;
  }
}

function ensureDatabase() {
  const databases = listDatabases();
  const exists = databases.some((database) => database.name === databaseName);

  if (exists) {
    passed.push(`Cloud SQL database ${databaseName} already exists`);
    return false;
  }

  runMutating("gcloud", [
    "sql",
    "databases",
    "create",
    databaseName,
    `--instance=${sqlInstance}`,
    `--project=${project}`,
  ]);
  passed.push(`Cloud SQL database ${databaseName} created`);
  return true;
}

function ensureUserAndPassword() {
  const users = listUsers();
  const exists = users.some((user) => user.name === databaseUser);
  const envPassword = process.env.WEB_CLOUDSQL_PASSWORD ?? "";

  if (exists && !forcePassword) {
    passed.push(`Cloud SQL user ${databaseUser} already exists`);

    if (!envPassword) {
      return null;
    }

    return envPassword;
  }

  const password = envPassword || generatePassword();

  if (exists && forcePassword) {
    runMutating("gcloud", [
      "sql",
      "users",
      "set-password",
      databaseUser,
      `--instance=${sqlInstance}`,
      `--project=${project}`,
      `--password=${password}`,
    ]);
    passed.push(`Cloud SQL user ${databaseUser} password rotated`);
    return password;
  }

  runMutating("gcloud", [
    "sql",
    "users",
    "create",
    databaseUser,
    `--instance=${sqlInstance}`,
    `--project=${project}`,
    `--password=${password}`,
  ]);
  passed.push(`Cloud SQL user ${databaseUser} created`);
  return password;
}

function ensureSecret(password) {
  const exists = secretExists();
  const hasEnabledVersion = exists && secretHasEnabledVersion();

  if (!exists) {
    runMutating("gcloud", [
      "secrets",
      "create",
      stagedSecret,
      `--project=${project}`,
      "--replication-policy=automatic",
    ]);
    passed.push(`Secret Manager secret ${stagedSecret} created`);
  } else {
    passed.push(`Secret Manager secret ${stagedSecret} already exists`);
  }

  if (hasEnabledVersion && !forceSecretVersion && !password) {
    passed.push(`Secret Manager secret ${stagedSecret} already has an enabled version`);
    return;
  }

  if (!password) {
    blocked.push(
      `${stagedSecret} needs a new version but no password is available. Set WEB_CLOUDSQL_PASSWORD or FORCE_WEB_CLOUDSQL_PASSWORD=1.`,
    );
    return;
  }

  runMutating(
    "gcloud",
    [
      "secrets",
      "versions",
      "add",
      stagedSecret,
      `--project=${project}`,
      "--data-file=-",
    ],
    { input: `${makeDatabaseUrl(password)}\n` },
  );
  passed.push(`Secret Manager secret ${stagedSecret} has a staged Cloud SQL URL version`);
}

function ensureSecretAccess() {
  runMutating("gcloud", [
    "secrets",
    "add-iam-policy-binding",
    stagedSecret,
    `--project=${project}`,
    `--member=serviceAccount:${runtimeServiceAccount}`,
    "--role=roles/secretmanager.secretAccessor",
  ]);
  passed.push(`${runtimeServiceAccount} can access ${stagedSecret}`);
}

function hasCloudSqlClientRole() {
  const output = run("gcloud", [
    "projects",
    "get-iam-policy",
    project,
    "--flatten=bindings[].members",
    `--filter=bindings.members:${runtimeServiceAccount} AND bindings.role:roles/cloudsql.client`,
    "--format=value(bindings.role)",
  ]);

  return output.includes("roles/cloudsql.client");
}

function ensureCloudSqlClientRole() {
  if (hasCloudSqlClientRole()) {
    passed.push(`${runtimeServiceAccount} already has roles/cloudsql.client`);
    return;
  }

  if (!grantCloudSqlClient) {
    warnings.push(
      `${runtimeServiceAccount} does not have roles/cloudsql.client and WEB_CLOUDSQL_GRANT_CLIENT=0 blocked automatic grant`,
    );
    return;
  }

  runMutating("gcloud", [
    "projects",
    "add-iam-policy-binding",
    project,
    `--member=serviceAccount:${runtimeServiceAccount}`,
    "--role=roles/cloudsql.client",
  ]);
  passed.push(`${runtimeServiceAccount} granted roles/cloudsql.client`);
}

console.log("Web Cloud SQL target prepare");
console.log("This command stages a separate web Cloud SQL target.");
console.log("It does not update the active web-database-url secret or redeploy web.");
console.log("Generated passwords and connection URLs are never printed.");
console.log(`\nProject: ${project}`);
console.log(`Cloud SQL instance: ${sqlInstance}`);
console.log(`Connection name: ${connectionName}`);
console.log(`Database: ${databaseName}`);
console.log(`User: ${databaseUser}`);
console.log(`Staged secret: ${stagedSecret}`);
console.log(`Runtime service account: ${runtimeServiceAccount}`);
console.log(`Dry run: ${dryRun ? "yes" : "no"}`);

try {
  ensureDatabase();
  const password = ensureUserAndPassword();
  ensureSecret(password);

  if (blocked.length === 0) {
    ensureSecretAccess();
    ensureCloudSqlClientRole();
  }
} catch (error) {
  blocked.push(error instanceof Error ? error.message : String(error));
}

printList("Passed checks", passed);
printList("Changed resources", changed);
printList("Planned changes", planned);
printList("Warnings", warnings);
printList("Blocked items", blocked);

console.log("\nNext safe step");
console.log(
  `  Run a one-off Prisma db-push job with DATABASE_URL=${stagedSecret}:latest, then rerun pnpm web:db:target:report with WEB_DATABASE_SECRET=${stagedSecret}.`,
);
console.log("  Do not swap web-database-url until data copy, row counts, auth smoke, and rollback are verified.");

if (blocked.length > 0) {
  process.exitCode = 1;
}
