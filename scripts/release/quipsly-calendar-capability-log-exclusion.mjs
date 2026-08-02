#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

export const EXCLUSION_NAME = "exclude-quipsly-calendar-feed-capabilities";

function assertIdentifier(value, label) {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error(`${label} must be a lowercase Google Cloud identifier.`);
  }
  return value;
}

export function calendarCapabilityRequestLogFilter(serviceName = "studio") {
  const service = assertIdentifier(serviceName, "SERVICE_NAME");
  return [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${service}"`,
    'LOG_ID("run.googleapis.com/requests")',
    'httpRequest.requestUrl=~"/api/calendar/feeds/[^/?#]+"',
  ].join(" AND ");
}

function normalizeFilter(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectCalendarCapabilityExclusion(
  sink,
  serviceName = "studio",
) {
  const expectedFilter = calendarCapabilityRequestLogFilter(serviceName);
  const exclusion = (sink?.exclusions || []).find(
    (candidate) => candidate.name === EXCLUSION_NAME,
  );
  if (!exclusion) {
    return { ok: false, reason: "missing", expectedFilter };
  }
  if (exclusion.disabled === true) {
    return { ok: false, reason: "disabled", expectedFilter, exclusion };
  }
  if (normalizeFilter(exclusion.filter) !== normalizeFilter(expectedFilter)) {
    return { ok: false, reason: "filter-mismatch", expectedFilter, exclusion };
  }
  return { ok: true, reason: "configured", expectedFilter, exclusion };
}

function parseArguments(argv) {
  const options = {
    apply: false,
    project: process.env.PROJECT_ID || "high-ground-odyssey",
    service: process.env.SERVICE_NAME || "studio",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--apply") options.apply = true;
    else if (argument === "--project") options.project = argv[++index] || "";
    else if (argument === "--service") options.service = argv[++index] || "";
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  assertIdentifier(options.project, "PROJECT_ID");
  assertIdentifier(options.service, "SERVICE_NAME");
  return options;
}

function runGcloud(arguments_) {
  const result = spawnSync("gcloud", arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "gcloud command failed.");
  }
  return result.stdout;
}

function readDefaultSink(project) {
  return JSON.parse(
    runGcloud([
      "logging",
      "sinks",
      "describe",
      "_Default",
      `--project=${project}`,
      "--format=json",
    ]),
  );
}

export function calendarCapabilityExclusionUpdateArguments(
  options,
  inspection,
) {
  const flag =
    inspection.reason === "missing" ? "--add-exclusion" : "--update-exclusion";
  const value = [
    `name=${EXCLUSION_NAME}`,
    "description=Keep revocable Quipsly calendar bearer URLs out of Cloud Logging storage.",
    `filter=${inspection.expectedFilter}`,
  ].join(",");
  return [
    "logging",
    "sinks",
    "update",
    "_Default",
    `${flag}=${value}`,
    `--project=${options.project}`,
    "--quiet",
  ];
}

function applyExclusion(options, inspection) {
  runGcloud(calendarCapabilityExclusionUpdateArguments(options, inspection));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  node scripts/release/quipsly-calendar-capability-log-exclusion.mjs
  node scripts/release/quipsly-calendar-capability-log-exclusion.mjs --apply

The default mode is read-only. --apply adds or repairs the named exclusion on
the project's _Default Cloud Logging sink, then reads it back.`);
    return;
  }

  let sink = readDefaultSink(options.project);
  let inspection = inspectCalendarCapabilityExclusion(sink, options.service);
  let mutationPerformed = false;
  if (!inspection.ok && options.apply) {
    applyExclusion(options, inspection);
    mutationPerformed = true;
    sink = readDefaultSink(options.project);
    inspection = inspectCalendarCapabilityExclusion(sink, options.service);
  }

  console.log(
    JSON.stringify(
      {
        ok: inspection.ok,
        project: options.project,
        service: options.service,
        sink: "_Default",
        exclusion: EXCLUSION_NAME,
        reason: inspection.reason,
        applyRequested: options.apply,
        mutationPerformed,
      },
      null,
      2,
    ),
  );
  if (!inspection.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
