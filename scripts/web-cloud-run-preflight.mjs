#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const passed = [];
const warnings = [];
const blocked = [];
const info = [];

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function checkFile(relativePath) {
  if (existsSync(repoPath(relativePath))) {
    passed.push(`${relativePath} exists`);
    return true;
  }

  blocked.push(`${relativePath} is missing`);
  return false;
}

function checkFileContains(relativePath, requiredText) {
  if (!checkFile(relativePath)) {
    return;
  }

  const body = readFileSync(repoPath(relativePath), "utf8");

  for (const text of requiredText) {
    if (body.includes(text)) {
      passed.push(`${relativePath} documents ${text}`);
    } else {
      blocked.push(`${relativePath} does not document ${text}`);
    }
  }
}

function runReadOnly(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function commandExists(command) {
  return Boolean(runReadOnly("which", [command]));
}

function getGcloudValue(args) {
  const value = runReadOnly("gcloud", args);

  if (!value || value === "(unset)") {
    return null;
  }

  return value;
}

function checkTool(command, args) {
  if (!commandExists(command)) {
    warnings.push(`${command} is not installed or is not on PATH`);
    return false;
  }

  const version = runReadOnly(command, args);
  passed.push(
    version
      ? `${command} is installed: ${version.split("\n")[0]}`
      : `${command} is installed`,
  );
  return true;
}

function checkOptionalGcloudResource(label, args) {
  const value = runReadOnly("gcloud", args);

  if (value) {
    passed.push(`${label}: ${value.split("\n")[0]}`);
    return true;
  } else {
    warnings.push(`${label} was not found or could not be read`);
    return false;
  }
}

function checkSecretEnabledVersion(secretName) {
  const value = runReadOnly("gcloud", [
    "secrets",
    "versions",
    "list",
    secretName,
    "--format=json",
    "--limit=20",
  ]);

  if (!value) {
    warnings.push(`Secret Manager secret ${secretName} has no readable versions`);
    return false;
  }

  const versions = JSON.parse(value);
  const hasEnabledVersion = versions.some(
    (version) => version.state === "ENABLED",
  );

  if (hasEnabledVersion) {
    passed.push(`Secret Manager secret ${secretName} has an enabled version`);
    return true;
  }

  warnings.push(`Secret Manager secret ${secretName} has no enabled version`);
  return false;
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

console.log("Web Cloud Run operator preflight");
console.log("Read-only check. This script is not a deployment.");
console.log(
  "It does not run Cloud Build, deploy Cloud Run, create resources, change IAM, change DNS, mutate secrets, or touch databases.",
);

checkFile("apps/web/Dockerfile");
checkFile("cloudbuild.web.yaml");
checkFile(".dockerignore");
checkFile("apps/web/src/app/api/health/route.ts");
checkFile("apps/web/src/lib/web-health.mjs");
checkFile("docs/runbooks/web-cloud-run.md");
checkFile("docs/architecture/platform-service-boundaries.md");
checkFile("docs/architecture/worldhub-foundation.md");
checkFile("scripts/web-cloud-run-deploy.mjs");
checkFile("scripts/web-cloud-run-seed-secrets-from-env.mjs");

checkFileContains("apps/web/Dockerfile", [
  "pnpm --filter web exec next build --webpack",
  "DATABASE_URL=postgresql://build:build@localhost:5432/high_ground_build",
  "CMD [\"node\", \"apps/web/server.js\"]",
]);
checkFileContains("apps/web/next.config.mjs", [
  'output: "standalone"',
  "outputFileTracingRoot",
]);
checkFileContains(".env.example", [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "HGO_OWNER_EMAILS",
  "HGO_TEAM_SCHEDULER_EMAILS",
  "HGO_COACH_EMAILS",
]);
checkFileContains(".dockerignore", [
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
]);

const hasGcloud = checkTool("gcloud", ["--version"]);
checkTool("docker", ["--version"]);
checkTool("pnpm", ["--version"]);

if (hasGcloud) {
  const account = getGcloudValue([
    "auth",
    "list",
    "--filter=status:ACTIVE",
    "--format=value(account)",
  ]);
  const project = getGcloudValue(["config", "get-value", "project"]);
  const region = getGcloudValue(["config", "get-value", "run/region"]);
  const effectiveRegion = region ?? "us-central1";

  if (account) {
    passed.push(`gcloud active account: ${account}`);
  } else {
    warnings.push("gcloud has no active account configured");
  }

  if (project) {
    passed.push(`gcloud active project: ${project}`);
  } else {
    warnings.push("gcloud has no active project configured");
  }

  if (region) {
    passed.push(`gcloud run region: ${region}`);
  } else {
    warnings.push("gcloud run region is not configured; runbook defaults to us-central1");
  }

  if (project) {
    const requiredWebSecretNames = [
      "web-cloudsql-database-url",
      "web-auth-secret",
      "web-google-client-id",
      "web-google-client-secret",
      "web-owner-emails",
      "web-team-scheduler-emails",
      "web-coach-emails",
    ];
    const optionalWebSecretNames = [
      "web-stripe-webhook-secret",
      "web-patreon-webhook-secret",
      "web-google-calendar-id",
      "web-google-calendar-service-account-json",
      "web-google-calendar-refresh-token",
      "web-google-calendar-sync-client-id",
      "web-google-calendar-sync-client-secret",
      "web-resend-api-key",
    ];

    checkOptionalGcloudResource("Artifact Registry repo high-ground-studio", [
      "artifacts",
      "repositories",
      "describe",
      "high-ground-studio",
      "--location",
      effectiveRegion,
      "--format=value(name)",
    ]);
    checkOptionalGcloudResource("Cloud Run service web", [
      "run",
      "services",
      "describe",
      "web",
      "--region",
      effectiveRegion,
      "--format=value(metadata.name)",
    ]);
    checkOptionalGcloudResource("Cloud Run runtime service account web-cloud-run", [
      "iam",
      "service-accounts",
      "describe",
      `web-cloud-run@${project}.iam.gserviceaccount.com`,
      "--format=value(email)",
    ]);

    for (const secretName of requiredWebSecretNames) {
      const secretExists = checkOptionalGcloudResource(
        `Secret Manager secret ${secretName}`,
        ["secrets", "describe", secretName, "--format=value(name)"],
      );

      if (!secretExists) {
        continue;
      }

      checkSecretEnabledVersion(secretName);
    }

    for (const secretName of optionalWebSecretNames) {
      const secretExists = checkOptionalGcloudResource(
        `Optional Secret Manager secret ${secretName}`,
        ["secrets", "describe", secretName, "--format=value(name)"],
      );

      if (secretExists) {
        checkSecretEnabledVersion(secretName);
      }
    }
  }
}

if (!commandExists("gcloud")) {
  info.push("Install and initialize Google Cloud CLI before the operator deployment session.");
}

info.push("Review docs/runbooks/web-cloud-run.md before running any cloud commands.");
info.push("Set project manually when ready: gcloud config set project PROJECT_ID");
info.push("Set region manually when ready: gcloud config set run/region us-central1");
info.push(
  "When explicitly ready to run Cloud Build later: pnpm web:cloudbuild:image:sha",
);
info.push("To add missing web secret versions from local env files: pnpm web:cloudrun:seed-secrets");
info.push("To deploy the existing service after validation: pnpm web:cloudrun:deploy");
info.push("For the first web service deploy only: WEB_CLOUD_RUN_CREATE_SERVICE=1 pnpm web:cloudrun:deploy");
info.push("Do not run deploy, DNS, IAM, Secret Manager, or db:push commands from this preflight.");

printList("Passed checks", passed);
printList("Warnings", warnings);
printList("Blocked items", blocked);
printList("Suggested next operator commands", info);

if (blocked.length > 0) {
  console.log("\nResult: blocked. Fix missing repository readiness items first.");
  process.exitCode = 1;
} else {
  console.log("\nResult: repository readiness checks passed.");
}
