#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  project: "high-ground-odyssey",
  region: "us-central1",
  service: "studio",
  sourceRef: "HEAD",
});

function fail(message) {
  throw new Error(message);
}

function value(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) fail(`${flag} requires a value.`);
  return next;
}

export function parseArguments(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--project": options.project = value(argv, index, argument); index += 1; break;
      case "--region": options.region = value(argv, index, argument); index += 1; break;
      case "--service": options.service = value(argv, index, argument); index += 1; break;
      case "--source": options.sourceRef = value(argv, index, argument); index += 1; break;
      case "--help":
      case "-h": options.help = true; break;
      default: fail(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/release/quipsly-cloud-run-source-readiness.mjs [options]

Read-only options:
  --source <commit-ish>   Expected committed source. Default: HEAD.
  --project <id>          Cloud Run project.
  --region <region>       Cloud Run region.
  --service <name>        Cloud Run service.
`;
}

function environmentMap(revision) {
  return new Map(
    (revision?.spec?.containers?.[0]?.env || []).map((entry) => [entry.name, entry.value]),
  );
}

export function summarizeCloudRunSourceReadiness({
  options,
  expectedSourceSha,
  serviceDocument,
  revisionDocument,
  auditedAt = new Date().toISOString(),
}) {
  const liveEntries = (serviceDocument?.status?.traffic || []).filter(
    (entry) => Number(entry.percent || 0) === 100 && entry.revisionName,
  );
  const liveRevision = liveEntries.length === 1 ? liveEntries[0].revisionName : null;
  const env = environmentMap(revisionDocument);
  const deployedSourceSha = String(env.get("QUIPSLY_SOURCE_SHA") || "");
  const releaseChannel = String(env.get("QUIPSLY_RELEASE_CHANNEL") || "");
  const checks = {
    singleLiveRevision: liveEntries.length === 1,
    revisionReadback: Boolean(revisionDocument?.metadata?.name),
    sourceIdentity: deployedSourceSha === expectedSourceSha,
    releaseChannel: ["preview", "production"].includes(releaseChannel),
  };
  return {
    schema: "quipsly-cloud-run-source-readiness-v1",
    auditedAt,
    mode: "read-only",
    target: {
      project: options.project,
      region: options.region,
      service: options.service,
    },
    expectedSourceSha,
    liveRevision,
    deployedSourceSha: deployedSourceSha || null,
    releaseChannel: releaseChannel || null,
    checks,
    ok: Object.values(checks).every(Boolean),
    externalMutation: false,
  };
}

function runJson(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) fail(`${command} ${args[0] || ""} failed with exit ${result.status}.`);
  return JSON.parse(result.stdout);
}

function runText(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) fail(`${command} ${args[0] || ""} failed with exit ${result.status}.`);
  return result.stdout.trim();
}

export function run(options) {
  const expectedSourceSha = runText("git", ["rev-parse", "--verify", `${options.sourceRef}^{commit}`]);
  const serviceDocument = runJson("gcloud", [
    "run", "services", "describe", options.service,
    `--project=${options.project}`, `--region=${options.region}`, "--format=json",
  ]);
  const liveEntries = (serviceDocument?.status?.traffic || []).filter(
    (entry) => Number(entry.percent || 0) === 100 && entry.revisionName,
  );
  const revisionDocument = liveEntries.length === 1
    ? runJson("gcloud", [
        "run", "revisions", "describe", liveEntries[0].revisionName,
        `--project=${options.project}`, `--region=${options.region}`, "--format=json",
      ])
    : null;
  return summarizeCloudRunSourceReadiness({
    options,
    expectedSourceSha,
    serviceDocument,
    revisionDocument,
  });
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const receipt = run(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); }
  catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
