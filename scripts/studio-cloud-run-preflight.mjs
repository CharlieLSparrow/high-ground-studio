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
    version ? `${command} is installed: ${version.split("\n")[0]}` : `${command} is installed`,
  );
  return true;
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

console.log("Studio Cloud Run operator preflight");
console.log("Read-only check. This script is not a deployment.");
console.log(
  "It does not run Cloud Build, deploy Cloud Run, create resources, change IAM, change DNS, mutate secrets, or touch databases.",
);

checkFile("apps/studio/Dockerfile");
checkFile("cloudbuild.studio.yaml");
checkFile(".dockerignore");
checkFile("apps/studio/src/app/api/health/route.ts");
checkFile("docs/runbooks/studio-cloud-run.md");
checkFile("docs/architecture/platform-service-boundaries.md");
checkFileContains(".env.example", [
  "STUDIO_AUTH_MODE",
  "STUDIO_ALLOWED_EMAILS",
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
    warnings.push("gcloud has no run region configured");
  }
}

if (!commandExists("gcloud")) {
  info.push("Install and initialize Google Cloud CLI before the operator deployment session.");
}

info.push("Review docs/runbooks/studio-cloud-run.md before running any cloud commands.");
info.push("Set project manually when ready: gcloud config set project PROJECT_ID");
info.push("Set region manually when ready: gcloud config set run/region us-central1");
info.push(
  "When explicitly ready to run Cloud Build later: pnpm studio:cloudbuild:image:sha",
);
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
