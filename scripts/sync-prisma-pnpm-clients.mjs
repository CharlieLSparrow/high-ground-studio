#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const normalizeSchema = (schema) => schema.replace(/\r\n/g, "\n").trim();

/** Synchronize only a payload generated from this checkout's exact schema. */
export function syncPrismaClients(repoRoot = process.cwd()) {
  const schema = normalizeSchema(fs.readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8"));
  const targets = [path.join(repoRoot, "node_modules/.prisma/client")];
  const store = path.join(repoRoot, "node_modules/.pnpm");
  if (fs.existsSync(store)) {
    for (const entry of fs.readdirSync(store).sort()) {
      if (!entry.startsWith("@prisma+client@")) continue;
      const modules = path.join(store, entry, "node_modules");
      if (fs.existsSync(path.join(modules, "@prisma/client/package.json"))) {
        targets.push(path.join(modules, ".prisma/client"));
      }
    }
  }
  const source = targets.find((candidate) => {
    const generatedSchema = path.join(candidate, "schema.prisma");
    return fs.existsSync(generatedSchema) && fs.existsSync(path.join(candidate, "default.js"))
      && normalizeSchema(fs.readFileSync(generatedSchema, "utf8")) === schema;
  });
  if (!source) {
    throw new Error("No generated Prisma client matches prisma/schema.prisma. Run pnpm db:generate before synchronizing; stale clients were left untouched.");
  }
  const sourceRealPath = fs.realpathSync(source);
  let synced = 0;
  for (const target of targets) {
    if (fs.existsSync(target) && fs.realpathSync(target) === sourceRealPath) continue;
    fs.mkdirSync(target, {recursive: true});
    fs.cpSync(source, target, {recursive: true, force: true});
    synced += 1;
  }
  // Read back every destination, including aliases in pnpm's virtual store.
  for (const target of targets) {
    if (normalizeSchema(fs.readFileSync(path.join(target, "schema.prisma"), "utf8")) !== schema) {
      throw new Error(`Generated Prisma client did not synchronize: ${path.relative(repoRoot, target)}`);
    }
  }
  return {synced, source: path.relative(repoRoot, source), targets: targets.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = syncPrismaClients();
  console.log(`Verified ${result.targets} current-schema Prisma client location(s); synchronized ${result.synced}.`);
}
