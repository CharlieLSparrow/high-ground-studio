#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONTRACT = {
  requiredFiles: [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "CODE_OF_CONDUCT.md",
    ".editorconfig",
    ".gitattributes",
    ".node-version",
    ".github/CODEOWNERS",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/dependabot.yml",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/feature.yml",
    "docs/README.md",
    "docs/development/README.md",
    "docs/development/testing.md",
    "docs/architecture/product-and-repository-map.md",
    "docs/decisions/README.md",
    "docs/decisions/0000-template.md",
    "docs/decisions/0001-product-monorepo-during-convergence.md",
    "docs/maintainers/repository-governance.md",
    "docs/runbooks/release-index.md",
    "scripts/ci/audit-changed-secrets.mjs",
    "scripts/ci/audit-changed-secrets.test.mjs",
    "scripts/ci/audit-repository-contract.mjs",
    "scripts/ci/audit-repository-contract.test.mjs",
    "scripts/ci/audit-tracked-artifacts.mjs",
    "scripts/ci/audit-tracked-artifacts.test.mjs",
    "packages/repository-governance/package.json",
    "packages/repository-governance/tsconfig.json",
    "packages/repository-governance/src/worktree-health.ts",
    "packages/repository-governance/src/worktree-health-cli.ts",
    "packages/repository-governance/src/worktree-health.test.ts",
    "packages/repository-governance/src/release-manifest.ts",
    "packages/repository-governance/src/release-manifest-cli.ts",
    "packages/repository-governance/src/release-manifest.test.ts",
    "release/manifests/schema.json",
    "release/manifests/README.md",
    "release/manifests/capture.json",
    "release/manifests/nest.json",
    "release/manifests/hgo-web.json",
    "release/manifests/quipsly-studio.json",
  ],
  maintainedMarkdown: [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "CODE_OF_CONDUCT.md",
    "docs/README.md",
    "docs/development/README.md",
    "docs/development/testing.md",
    "docs/architecture/product-and-repository-map.md",
    "docs/decisions/README.md",
    "docs/decisions/0001-product-monorepo-during-convergence.md",
    "docs/maintainers/repository-governance.md",
    "docs/runbooks/release-index.md",
  ],
  codeownerPatterns: [
    "*",
    "/apps/mobile-capture/HighGroundCapture/",
    "/apps/quipsly/",
    "/apps/QuipslyStudio/",
    "/apps/web/",
    "/packages/",
    "/prisma/",
  ],
  pullRequestHeadings: [
    "## Outcome",
    "## Source truth",
    "## Proof",
    "## Risk",
    "## Documentation and operations",
    "## Reviewer focus",
    "## Checklist",
  ],
  workflowFiles: [
    ".github/workflows/capture-pr-tests.yml",
    ".github/workflows/deploy-cloud-run.yml",
    ".github/workflows/deploy.yml",
    ".github/workflows/pr-tests.yml",
    ".github/workflows/typescript-7.yml",
  ],
  nodeVersion: "24.14.0",
  packageManager: "pnpm@10.30.3",
};

function localMarkdownTarget(rawTarget) {
  const value = rawTarget.trim().replace(/^<|>$/g, "");
  if (
    !value
    || value.startsWith("#")
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
    || value.startsWith("//")
  ) {
    return null;
  }

  const withoutFragment = value.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

export function markdownLocalTargets(markdown) {
  const targets = [];
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const target = localMarkdownTarget(match[1]);
    if (target) targets.push(target);
  }
  return targets;
}

export function validateMarkdownLinks({
  root,
  documentPath,
  markdown,
  fileExists = existsSync,
}) {
  const errors = [];
  const documentDirectory = path.dirname(path.join(root, documentPath));

  for (const target of markdownLocalTargets(markdown)) {
    const resolved = target.startsWith("/")
      ? path.join(root, target.slice(1))
      : path.resolve(documentDirectory, target);
    if (!fileExists(resolved)) {
      errors.push(`${documentPath}: missing local link target ${target}`);
    }
  }

  return errors;
}

function includesCodeownerPattern(contents, expectedPattern) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .some((line) => line.split(/\s+/, 1)[0] === expectedPattern);
}

export function validateActionPins(workflowPath, workflow) {
  const errors = [];
  const usesPattern = /^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm;

  for (const match of workflow.matchAll(usesPattern)) {
    const action = match[1];
    if (action.startsWith("./") || action.startsWith("docker://")) continue;

    const separator = action.lastIndexOf("@");
    const ref = separator >= 0 ? action.slice(separator + 1) : "";
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      errors.push(`${workflowPath}: action must be pinned to a full commit SHA: ${action}`);
    }
  }

  return errors;
}

export function auditRepository(root, contract = DEFAULT_CONTRACT) {
  const errors = [];
  const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

  for (const requiredFile of contract.requiredFiles ?? []) {
    if (!existsSync(path.join(root, requiredFile))) {
      errors.push(`missing required repository file: ${requiredFile}`);
    }
  }

  for (const documentPath of contract.maintainedMarkdown ?? []) {
    if (!existsSync(path.join(root, documentPath))) continue;
    errors.push(...validateMarkdownLinks({
      root,
      documentPath,
      markdown: read(documentPath),
    }));
  }

  if (contract.codeownerPatterns?.length && existsSync(path.join(root, ".github/CODEOWNERS"))) {
    const codeowners = read(".github/CODEOWNERS");
    for (const expectedPattern of contract.codeownerPatterns) {
      if (!includesCodeownerPattern(codeowners, expectedPattern)) {
        errors.push(`CODEOWNERS is missing ${expectedPattern}`);
      }
    }
  }

  if (contract.pullRequestHeadings?.length && existsSync(path.join(root, ".github/PULL_REQUEST_TEMPLATE.md"))) {
    const template = read(".github/PULL_REQUEST_TEMPLATE.md");
    for (const heading of contract.pullRequestHeadings) {
      if (!template.includes(heading)) {
        errors.push(`pull request template is missing ${heading}`);
      }
    }
  }

  for (const workflowPath of contract.workflowFiles ?? []) {
    if (!existsSync(path.join(root, workflowPath))) continue;
    errors.push(...validateActionPins(workflowPath, read(workflowPath)));
  }

  if (contract.nodeVersion && existsSync(path.join(root, ".node-version"))) {
    const actualNodeVersion = read(".node-version").trim();
    if (actualNodeVersion !== contract.nodeVersion) {
      errors.push(`expected Node ${contract.nodeVersion}, found ${actualNodeVersion}`);
    }
  }

  if (contract.packageManager && existsSync(path.join(root, "package.json"))) {
    const packageJson = JSON.parse(read("package.json"));
    if (packageJson.packageManager !== contract.packageManager) {
      errors.push(`expected packageManager ${contract.packageManager}, found ${packageJson.packageManager ?? "unset"}`);
    }
  }

  return errors;
}

function runCli() {
  const root = path.resolve(process.cwd());
  const errors = auditRepository(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS collaborator contract: ${DEFAULT_CONTRACT.requiredFiles.length} required files and `
    + `${DEFAULT_CONTRACT.maintainedMarkdown.length} maintained Markdown entrypoints.`,
  );
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
