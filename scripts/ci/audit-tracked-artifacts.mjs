#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FORBIDDEN_SEGMENTS = new Set([
  ".next",
  ".venv",
  "DerivedData",
  "__pycache__",
  "node_modules",
]);

const FORBIDDEN_BASENAMES = new Set([
  ".DS_Store",
  "next-env.d.ts",
]);

const FORBIDDEN_SUFFIXES = [
  ".bak",
  ".db",
  ".pid",
  ".pyc",
  ".pyo",
  ".save",
  ".sqlite",
  ".sqlite3",
  ".xcresult",
];

function normalizedPath(filePath) {
  return String(filePath).replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function trackedArtifactReason(filePath) {
  const candidate = normalizedPath(filePath);
  const segments = candidate.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? "";

  if (
    segments.some((segment) => (
      FORBIDDEN_SEGMENTS.has(segment)
      || segment.startsWith(".next-")
      || segment.startsWith(".venv-")
    ))
  ) {
    return "generated dependency, build, or interpreter directory";
  }
  if (FORBIDDEN_BASENAMES.has(basename)) {
    return "operating-system metadata";
  }
  if (FORBIDDEN_SUFFIXES.some((suffix) => basename.endsWith(suffix))) {
    return "generated, local-state, runtime, or backup file";
  }
  if (basename.includes(".backup.")) {
    return "editor backup file";
  }

  return null;
}

export function auditTrackedArtifacts(filePaths) {
  return [...new Set(filePaths.map(normalizedPath).filter(Boolean))]
    .map((filePath) => ({
      filePath,
      reason: trackedArtifactReason(filePath),
    }))
    .filter((entry) => entry.reason)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function trackedPaths() {
  const result = spawnSync("git", ["ls-files", "-z", "--"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git ls-files failed");
  }
  return result.stdout.split("\0");
}

function runCli() {
  const violations = auditTrackedArtifacts(trackedPaths());
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`FAIL ${violation.filePath}: ${violation.reason}`);
    }
    console.error(
      "Move generated evidence and local state outside Git; keep only source and small deterministic fixtures.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("PASS tracked tree contains no generated cache, local state, runtime PID, or backup artifacts.");
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : "";
if (invokedPath === import.meta.url || process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
