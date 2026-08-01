#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { summarizeQuipslyCloudCost } from "./quipsly-cloud-cost-audit-core.mjs";

const options = parseArguments(process.argv.slice(2));

try {
  const auditedAt = new Date();
  const windowStartedAt = new Date(
    auditedAt.getTime() - options.days * 86_400_000,
  ).toISOString();
  runGcloud(["auth", "print-access-token"], { discard: true });
  const repositoryRoot = `${options.region}-docker.pkg.dev/${options.project}/${options.repository}`;
  const [builds, images, revisions, service, cleanupPolicies] = [
    runJson([
      "builds",
      "list",
      `--project=${options.project}`,
      `--filter=createTime>=\"${windowStartedAt}\"`,
      "--limit=500",
      "--format=json",
    ]),
    runJson([
      "artifacts",
      "docker",
      "images",
      "list",
      repositoryRoot,
      `--project=${options.project}`,
      "--include-tags",
      "--format=json",
    ]),
    runJson([
      "run",
      "revisions",
      "list",
      `--project=${options.project}`,
      `--region=${options.region}`,
      `--service=${options.service}`,
      "--format=json",
    ]),
    runJson([
      "run",
      "services",
      "describe",
      options.service,
      `--project=${options.project}`,
      `--region=${options.region}`,
      "--format=json",
    ]),
    runJson([
      "artifacts",
      "repositories",
      "list-cleanup-policies",
      options.repository,
      `--project=${options.project}`,
      `--location=${options.region}`,
      "--format=json",
    ]),
  ];
  const receipt = summarizeQuipslyCloudCost({
    auditedAt: auditedAt.toISOString(),
    windowStartedAt,
    projectId: options.project,
    region: options.region,
    repository: options.repository,
    serviceName: options.service,
    builds,
    images,
    revisions,
    service,
    cleanupPolicies,
  });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    await writeFile(outputPath, serialized, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(outputPath, 0o600);
    process.stdout.write(`${outputPath}\n`);
  } else {
    process.stdout.write(serialized);
  }
} catch (error) {
  process.stderr.write(
    `FAIL ${error instanceof Error ? error.message : "Cloud cost audit failed."}\n`,
  );
  process.stderr.write("Refresh Google Cloud credentials, then rerun:\n");
  process.stderr.write("  gcloud auth login --update-adc --brief\n");
  process.stderr.write(
    "  gcloud auth application-default set-quota-project quipsly-reef\n",
  );
  process.exitCode = 1;
}

function runJson(argumentsList) {
  const output = runGcloud(argumentsList);
  const parsed = JSON.parse(output || "null");
  return parsed ?? [];
}

function runGcloud(argumentsList, { discard = false } = {}) {
  try {
    const output = execFileSync("gcloud", argumentsList, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
    return discard ? "" : output;
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    throw new Error(
      stderr
        ? `gcloud readback failed: ${stderr.slice(0, 700)}`
        : "gcloud readback failed.",
    );
  }
}

function parseArguments(argumentsList) {
  const options = {
    project: "high-ground-odyssey",
    region: "us-central1",
    repository: "high-ground-studio",
    service: "studio",
    days: 30,
    output: "",
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--project")
      options.project = valueAfter(argumentsList, ++index, argument);
    else if (argument === "--region")
      options.region = valueAfter(argumentsList, ++index, argument);
    else if (argument === "--repository")
      options.repository = valueAfter(argumentsList, ++index, argument);
    else if (argument === "--service")
      options.service = valueAfter(argumentsList, ++index, argument);
    else if (argument === "--days")
      options.days = Number(valueAfter(argumentsList, ++index, argument));
    else if (argument === "--output")
      options.output = valueAfter(argumentsList, ++index, argument);
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write(
        "Usage: pnpm quipsly:cloud:cost-audit -- [--days 30] [--output CREATE_ONLY.json]\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown cloud cost audit option: ${argument}`);
  }
  for (const [field, value] of Object.entries({
    project: options.project,
    region: options.region,
    repository: options.repository,
    service: options.service,
  })) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(value))
      throw new Error(`${field} is invalid.`);
  }
  if (
    !Number.isSafeInteger(options.days) ||
    options.days < 1 ||
    options.days > 366
  ) {
    throw new Error("--days must be an integer from 1 through 366.");
  }
  return options;
}

function valueAfter(argumentsList, index, flag) {
  const value = argumentsList[index];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value.`);
  return value;
}
