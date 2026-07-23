#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SHARED_RUNTIME_PATHS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^prisma\.config\.ts$/,
  /^\.npmrc$/,
  /^\.dockerignore$/,
  /^\.gcloudignore$/,
];

const PRISMA_PATHS = [
  /^prisma\//,
];

const WEB_PATHS = [
  /^apps\/web\//,
  /^packages\/quipsly-domain\//,
  /^packages\/worldhub-domain\//,
  /^scripts\/web-cloud-run/,
  /^scripts\/release\/web-/,
  /^cloudbuild\.web\.yaml$/,
];

const NEST_PATHS = [
  /^apps\/quipsly\//,
  /^packages\/content-studio-domain\//,
  /^packages\/quipsly-document-kernel\//,
  /^packages\/quipsly-domain\//,
  /^packages\/studio-domain\//,
  /^scripts\/quipsly-/,
  /^scripts\/release\/quipsly-/,
  /^cloudbuild\.(?:studio(?:\.deploy)?|quipsly-(?:web|hotfix))\.yaml$/,
  /^apps\/web\/content\/publish\/hgo-episodes\/episode-[123]-.*\.json$/,
];

const SCHEMA_PATHS = [
  ...PRISMA_PATHS,
  /^ops\/prisma-migrate\.Dockerfile$/,
  /^cloudbuild\.prisma-migrate\.yaml$/,
  /^scripts\/quipsly-nest-chat-schema-push\.mjs$/,
  /^scripts\/quipsly-production-core-schema-sync\.mjs$/,
  /^scripts\/release\/quipsly-(?:coaching-capture-)?schema-sync\.sh$/,
];

const CAPTURE_PATHS = [
  /^apps\/mobile-capture\/HighGroundCapture\//,
];

const NATIVE_STUDIO_PATHS = [
  /^apps\/QuipslyStudio\//,
];

const QUIPSLY_VALIDATION_ONLY_PATHS = [
  /^firebase\.json$/,
  /^docs\/coordination\/BETA-MANIFEST\.md$/,
  /^scripts\/scan-beta-blockers\.mjs$/,
  /^scripts\/sync-prisma-pnpm-clients\.mjs$/,
  /^scripts\/ci\/plan-changed-surfaces(?:\.test)?\.mjs$/,
  /^\.github\/workflows\/(?:pr-tests|deploy-cloud-run)\.yml$/,
];

function normalizedPaths(paths) {
  return [...new Set(paths.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function matchesAny(filePath, rules) {
  return rules.some((rule) => rule.test(filePath));
}

export function planChangedSurfaces(inputPaths) {
  const paths = normalizedPaths(inputPaths);
  const sharedRuntime = paths.some((filePath) => matchesAny(filePath, SHARED_RUNTIME_PATHS));
  const prisma = paths.some((filePath) => matchesAny(filePath, PRISMA_PATHS));
  const schema = paths.some((filePath) => matchesAny(filePath, SCHEMA_PATHS));
  const web = sharedRuntime || prisma || paths.some((filePath) => matchesAny(filePath, WEB_PATHS));
  const studio = sharedRuntime || prisma || paths.some((filePath) => matchesAny(filePath, NEST_PATHS));
  const capture = paths.some((filePath) => matchesAny(filePath, CAPTURE_PATHS));
  const nativeStudio = paths.some((filePath) => matchesAny(filePath, NATIVE_STUDIO_PATHS));
  const quipsly =
    studio ||
    paths.some((filePath) => matchesAny(filePath, QUIPSLY_VALIDATION_ONLY_PATHS));

  const deployTargets = [
    ...(web ? ["web"] : []),
    ...(studio ? ["studio"] : []),
  ];
  const changedSurfaces = [
    ...deployTargets,
    ...(capture ? ["capture"] : []),
    ...(nativeStudio ? ["native-studio"] : []),
  ];

  return {
    web,
    studio,
    schema,
    capture,
    nativeStudio,
    quipsly,
    deployTargets,
    changedSurfaces,
    changedPathCount: paths.length,
    paths,
    summary: deployTargets.length
      ? `Auto deploy planned for ${deployTargets.join(" and ")} from declared release inputs.`
      : "No deployable app changes detected.",
  };
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function gitChangedPaths(base, head) {
  const result = spawnSync("git", ["diff", "--name-only", base, head], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git diff failed for ${base}..${head}`);
  }
  return result.stdout.split(/\r?\n/);
}

function pathsFromArgs(args) {
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  const pathsFile = argumentValue(args, "--paths-file");

  if (Boolean(base) !== Boolean(head)) {
    throw new Error("--base and --head must be supplied together.");
  }
  if (base && pathsFile) {
    throw new Error("Use either --base/--head or --paths-file, not both.");
  }
  if (base) return gitChangedPaths(base, head);
  if (pathsFile) {
    const contents = pathsFile === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(pathsFile, "utf8");
    return contents.split(/\r?\n/);
  }
  throw new Error("Supply --base/--head or --paths-file (use - for stdin).");
}

function writeGitHubOutput(outputPath, plan) {
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

function runCli() {
  const args = process.argv.slice(2);
  const plan = planChangedSurfaces(pathsFromArgs(args));
  writeGitHubOutput(argumentValue(args, "--github-output"), plan);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
