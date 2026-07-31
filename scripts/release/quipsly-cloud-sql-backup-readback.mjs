#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) fail(`Unknown argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a value.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage:
  quipsly-cloud-sql-backup-readback.mjs \\
    --input <gcloud-json> \\
    --expected-project <project-id> \\
    --expected-instance <instance-id> \\
    --expected-description <description> \\
    [--expected-id <backup-id>] \\
    [--output <receipt.json>]

The input may be one backup object or the JSON array returned by
gcloud sql backups list. The command fails unless exactly one matching,
successful on-demand backup can be independently identified. Output is a
small redacted receipt; raw gcloud account metadata is never copied.
`;
}

function instanceFromBackup(backup) {
  const direct = backup.instance ?? backup.instanceId ?? backup.targetId;
  if (typeof direct === "string" && direct.length > 0) {
    return direct.split("/").at(-1).split(":").at(-1);
  }
  const link = backup.selfLink ?? backup.instanceLink ?? backup.targetLink;
  if (typeof link !== "string") return null;
  const match = link.match(/\/instances\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function projectFromBackup(backup) {
  const direct = backup.project ?? backup.projectId ?? backup.targetProject;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const link = backup.selfLink ?? backup.instanceLink ?? backup.targetLink;
  if (typeof link !== "string") return null;
  const match = link.match(/\/projects\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function normalizedId(backup) {
  const id = backup.id ?? backup.name;
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  if (typeof id === "string" && /^[A-Za-z0-9._:-]+$/.test(id)) return id;
  return null;
}

export function summarizeBackupReadback(document, expected) {
  const candidates = Array.isArray(document) ? document : [document];
  const matching = candidates.filter((backup) => {
    if (!backup || typeof backup !== "object") return false;
    return backup.description === expected.description
      && instanceFromBackup(backup) === expected.instance
      && (!expected.id || normalizedId(backup) === expected.id);
  });

  if (matching.length !== 1) {
    fail(
      `Expected exactly one backup matching ${expected.instance}/${expected.description}; found ${matching.length}.`,
    );
  }

  const backup = matching[0];
  const id = normalizedId(backup);
  if (!id) fail("Matching backup does not have a safe backup ID.");

  const project = projectFromBackup(backup);
  if (project && project !== expected.project) {
    fail(`Backup project ${project} does not match ${expected.project}.`);
  }

  const status = String(backup.status ?? "").toUpperCase();
  if (status !== "SUCCESSFUL") {
    fail(`Backup ${id} is not successful (status: ${status || "missing"}).`);
  }

  const type = String(backup.type ?? backup.backupType ?? "").toUpperCase();
  if (type !== "ON_DEMAND") {
    fail(`Backup ${id} is not on-demand (type: ${type || "missing"}).`);
  }

  return {
    schema: "quipsly-cloud-sql-backup-readback-v1",
    checkedAt: new Date().toISOString(),
    project: expected.project,
    instance: expected.instance,
    id,
    description: expected.description,
    status,
    type,
    startTime: typeof backup.startTime === "string" ? backup.startTime : null,
    endTime: typeof backup.endTime === "string" ? backup.endTime : null,
    passed: true,
  };
}

async function writeReceipt(outputPath, receipt) {
  const absolute = resolve(outputPath);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await chmod(temporary, 0o600);
  await rename(temporary, absolute);
  await chmod(absolute, 0o600);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  for (const key of ["input", "expected-project", "expected-instance", "expected-description"]) {
    if (!options[key]) fail(`--${key} is required.`);
  }

  const document = JSON.parse(await readFile(options.input, "utf8"));
  const receipt = summarizeBackupReadback(document, {
    project: options["expected-project"],
    instance: options["expected-instance"],
    description: options["expected-description"],
    id: options["expected-id"],
  });

  if (options.output) await writeReceipt(options.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

const isMain = process.argv[1]
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
