#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const prismaBin = path.join(repoRoot, "node_modules", ".bin", "prisma");
const expectedModelNeedles = [
  "model ServiceOffering",
  "model CoachingBooking",
  "model CallRoom",
  "model RecordingAsset",
  "model TranscriptJob",
];

function fail(message) {
  console.error(`Prisma workspace generation failed: ${message}`);
  process.exit(1);
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function walkDirectories(root, visitor) {
  if (!exists(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    visitor(fullPath);
    walkDirectories(fullPath, visitor);
  }
}

function findPhysicalPrismaClientPackages() {
  // pnpm may use a traditional virtual store or a flat/hoisted package tree
  // (including after a lockfile reset). Always include the directly resolved
  // workspace client, then fan out to any physical virtual-store copies.
  const packages = [];
  const rootClient = path.join(repoRoot, "node_modules", "@prisma", "client");
  if (exists(path.join(rootClient, "package.json"))) packages.push(rootClient);
  walkDirectories(pnpmDir, (dir) => {
    if (!dir.endsWith(path.join("node_modules", "@prisma", "client"))) return;
    const packageJson = path.join(dir, "package.json");
    if (!exists(packageJson)) return;
    packages.push(dir);
  });
  return [...new Set(packages)].sort();
}

function generatedClientDirForPackage(clientPackageDir) {
  const nodeModulesDir = path.resolve(clientPackageDir, "..", "..");
  return path.join(nodeModulesDir, ".prisma", "client");
}

function findGeneratedClientSource(clientPackages) {
  for (const packageDir of clientPackages) {
    const candidate = generatedClientDirForPackage(packageDir);
    const generatedSchema = path.join(candidate, "schema.prisma");
    const generatedDefault = path.join(candidate, "default.d.ts");
    if (!exists(generatedSchema) || !exists(generatedDefault)) continue;
    const schema = fs.readFileSync(generatedSchema, "utf8");
    if (expectedModelNeedles.every((needle) => schema.includes(needle))) {
      return candidate;
    }
  }
  return null;
}

function copyGeneratedClient(sourceDir, targetDir) {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) return "source";

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return "copied";
}

function main() {
  if (!exists(schemaPath)) fail(`schema not found at ${schemaPath}`);
  if (!exists(prismaBin)) fail(`Prisma binary not found at ${prismaBin}. Run pnpm install first.`);

  const generate = spawnSync(prismaBin, ["generate", "--schema", schemaPath], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (generate.status !== 0) {
    process.exit(generate.status || 1);
  }

  const packages = findPhysicalPrismaClientPackages();
  if (!packages.length) fail("no physical @prisma/client packages found under node_modules/.pnpm");

  const sourceDir = findGeneratedClientSource(packages);
  if (!sourceDir) {
    fail(
      "could not find a generated .prisma/client containing the current coaching/capture schema models",
    );
  }

  const results = packages.map((packageDir) => {
    const targetDir = generatedClientDirForPackage(packageDir);
    return {
      packageDir: path.relative(repoRoot, packageDir),
      targetDir: path.relative(repoRoot, targetDir),
      action: copyGeneratedClient(sourceDir, targetDir),
    };
  });

  console.log("Prisma workspace clients synchronized:");
  for (const result of results) {
    console.log(`- ${result.action.padEnd(6)} ${result.targetDir}`);
  }
}

main();
