#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  auditReleaseManifests,
  loadReleaseManifests,
  planChangedSurfaces,
  type ChangedSurfacePlan,
} from "./release-manifest.ts";

function argumentValue(args: readonly string[], name: string): string {
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? "" : "";
}

function repositoryRoot(args: readonly string[]): string {
  const explicitRoot = argumentValue(args, "--root");
  if (explicitRoot) return path.resolve(explicitRoot);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function gitChangedPaths(root: string, base: string, head: string): readonly string[] {
  const result = spawnSync("git", ["diff", "--name-only", base, head], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git diff failed for ${base}..${head}`);
  }
  return result.stdout.split(/\r?\n/);
}

function pathsFromArgs(root: string, args: readonly string[]): readonly string[] {
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  const pathsFile = argumentValue(args, "--paths-file");
  if (Boolean(base) !== Boolean(head)) {
    throw new Error("--base and --head must be supplied together.");
  }
  if (base && pathsFile) {
    throw new Error("Use either --base/--head or --paths-file, not both.");
  }
  if (base) return gitChangedPaths(root, base, head);
  if (pathsFile) {
    const contents = pathsFile === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(pathsFile, "utf8");
    return contents.split(/\r?\n/);
  }
  throw new Error("Supply --base/--head or --paths-file (use - for stdin).");
}

function writeGitHubOutput(outputPath: string, plan: ChangedSurfacePlan): void {
  if (!outputPath) return;
  appendFileSync(
    outputPath,
    [
      `web=${plan.web}`,
      `studio=${plan.studio}`,
      `schema=${plan.schema}`,
      `capture=${plan.capture}`,
      `native_studio=${plan.nativeStudio}`,
      `quipsly=${plan.quipsly}`,
      `changed_path_count=${plan.changedPathCount}`,
      `summary=${plan.summary}`,
      "",
    ].join("\n"),
  );
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage:",
      "  pnpm release:manifests:audit [--json]",
      "  node --experimental-strip-types scripts/ci/plan-changed-surfaces.mjs --base <sha> --head <sha>",
      "  node --experimental-strip-types scripts/ci/plan-changed-surfaces.mjs --paths-file <path|->",
      "",
      "Release manifests are the source of truth for app ownership, affected-surface",
      "planning, proof levels, artifact provenance, and delivery targets.",
      "",
    ].join("\n"),
  );
}

export function runReleaseManifestCli(args: readonly string[]): number {
  const command = args[0] && !args[0].startsWith("-") ? args[0] : "audit";
  const commandArgs = command === "audit" ? args.slice(command === args[0] ? 1 : 0) : args.slice(1);
  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    printHelp();
    return 0;
  }

  const root = repositoryRoot(commandArgs);
  if (command === "audit") {
    const audit = auditReleaseManifests(root);
    if (commandArgs.includes("--json")) {
      process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    } else if (audit.errors.length === 0) {
      process.stdout.write(`PASS ${audit.manifests.length} release manifests are valid and ownership-complete.\n`);
    } else {
      for (const error of audit.errors) process.stderr.write(`FAIL ${error}\n`);
    }
    return audit.errors.length === 0 ? 0 : 1;
  }

  if (command === "plan") {
    const manifests = loadReleaseManifests(root);
    const plan = planChangedSurfaces(pathsFromArgs(root, commandArgs), manifests);
    writeGitHubOutput(argumentValue(commandArgs, "--github-output"), plan);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  throw new Error(`Unknown release-manifest command: ${command}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runReleaseManifestCli(process.argv.slice(2));
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
