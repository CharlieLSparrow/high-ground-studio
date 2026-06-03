#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const pnpmStore = path.join(repoRoot, "node_modules", ".pnpm");

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findGeneratedPrismaDir() {
  const rootGenerated = path.join(repoRoot, "node_modules", ".prisma");
  if (exists(path.join(rootGenerated, "client", "default.js"))) {
    return rootGenerated;
  }

  if (!exists(pnpmStore)) return null;

  for (const entry of fs.readdirSync(pnpmStore)) {
    if (!entry.startsWith("@prisma+client@")) continue;
    const generated = path.join(pnpmStore, entry, "node_modules", ".prisma");
    if (exists(path.join(generated, "client", "default.js"))) {
      return generated;
    }
  }

  return null;
}

const source = findGeneratedPrismaDir();
if (!source) {
  throw new Error("Could not find generated Prisma client payload under node_modules/.prisma.");
}

let synced = 0;

function copyIfDifferent(target) {
  if (path.resolve(source) === path.resolve(target)) return;
  fs.cpSync(source, target, { recursive: true, force: true });
  synced += 1;
}

const rootTarget = path.join(repoRoot, "node_modules", ".prisma");
copyIfDifferent(rootTarget);

if (exists(pnpmStore)) {
  for (const entry of fs.readdirSync(pnpmStore)) {
    if (!entry.startsWith("@prisma+client@")) continue;
    const target = path.join(pnpmStore, entry, "node_modules", ".prisma");
    copyIfDifferent(target);
  }
}

console.log(`Synced generated Prisma client payload to ${synced} location(s).`);
