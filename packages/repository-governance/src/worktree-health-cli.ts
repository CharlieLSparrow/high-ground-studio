#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  WORKTREE_SURFACES,
  analyzeWorktreeHealth,
  attachWorktreeFileSizes,
  formatWorktreeHealth,
  mergeWorktreeChanges,
  parseNameStatusZ,
  type WorktreePathChange,
  type WorktreeSurface,
} from "./worktree-health.ts";

interface CliOptions {
  readonly json: boolean;
  readonly strict: boolean;
  readonly root: string;
  readonly activeSurface?: WorktreeSurface;
  readonly maxDirtyPaths?: number;
}

function argumentValue(args: readonly string[], name: string): string {
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? "" : "";
}

function parsePositiveInteger(value: string, name: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function parseOptions(args: readonly string[]): CliOptions {
  const surfaceValue = argumentValue(args, "--surface");
  if (surfaceValue && !WORKTREE_SURFACES.includes(surfaceValue as WorktreeSurface)) {
    throw new Error(`--surface must be one of: ${WORKTREE_SURFACES.join(", ")}`);
  }
  return {
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    root: path.resolve(argumentValue(args, "--root") || process.cwd()),
    activeSurface: surfaceValue ? surfaceValue as WorktreeSurface : undefined,
    maxDirtyPaths: parsePositiveInteger(argumentValue(args, "--max-dirty"), "--max-dirty"),
  };
}

function runGit(root: string, args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
  }
  return result.stdout;
}

function collectWorktreeChanges(root: string): readonly WorktreePathChange[] {
  const repositoryRoot = runGit(root, ["rev-parse", "--show-toplevel"]).trim();
  if (path.resolve(repositoryRoot) !== path.resolve(root)) {
    throw new Error(`Run from the repository root or pass --root=${repositoryRoot}.`);
  }
  const staged = parseNameStatusZ(
    runGit(root, ["diff", "--cached", "--name-status", "-z", "--find-renames"]),
    "staged",
  );
  const unstaged = parseNameStatusZ(
    runGit(root, ["diff", "--name-status", "-z", "--find-renames"]),
    "unstaged",
  );
  const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((filePath) => ({ path: filePath, states: ["untracked"] as const }));

  return attachWorktreeFileSizes(root, mergeWorktreeChanges([staged, unstaged, untracked]));
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: pnpm repo:health [--surface <name>] [--max-dirty <count>] [--json] [--strict]",
      "",
      "Reports staged, unstaged, and untracked repository state without modifying files.",
      "--strict exits nonzero when the active slice exceeds a boundary.",
      `Surfaces: ${WORKTREE_SURFACES.join(", ")}`,
      "",
    ].join("\n"),
  );
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const options = parseOptions(args);
  const report = analyzeWorktreeHealth(collectWorktreeChanges(options.root), {
    activeSurface: options.activeSurface,
    maxDirtyPaths: options.maxDirtyPaths,
  });
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatWorktreeHealth(report));
  if (options.strict && report.strictFailure) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
