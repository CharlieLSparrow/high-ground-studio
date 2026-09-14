#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncPrismaClients } from "./sync-prisma-pnpm-clients.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generate = spawnSync(path.join(repoRoot, "node_modules/.bin/prisma"), [
  "generate", "--schema", path.join(repoRoot, "prisma/schema.prisma"),
], {cwd: repoRoot, stdio: "inherit", env: process.env});

if (generate.error) throw generate.error;
if (generate.status !== 0) process.exit(generate.status || 1);
const result = syncPrismaClients(repoRoot);
console.log(`Verified ${result.targets} current-schema Prisma client location(s); synchronized ${result.synced}.`);
