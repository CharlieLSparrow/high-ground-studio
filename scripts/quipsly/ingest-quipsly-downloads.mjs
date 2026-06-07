#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseCount(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sourceDir = path.resolve(argValue("source", path.join(process.env.HOME || "/Users/wall-e", "Downloads")));
const count = parseCount(argValue("count", "12"), 12);
const globHint = argValue("hint", "ChatGPT Image").toLowerCase();
const targets = [
  path.join(repoRoot, "apps/quipsly/public/images/quipsly-generated"),
  path.join(repoRoot, "apps/quiplore/public/images/quipsly-generated"),
];

for (const target of targets) fs.mkdirSync(target, { recursive: true });

const candidates = fs.readdirSync(sourceDir)
  .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  .filter((name) => name.toLowerCase().includes(globHint))
  .map((name) => {
    const absolutePath = path.join(sourceDir, name);
    const stat = fs.statSync(absolutePath);
    return { name, absolutePath, mtimeMs: stat.mtimeMs, size: stat.size };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs)
  .slice(0, count);

if (candidates.length === 0) {
  console.error(`No matching images found in ${sourceDir} with hint "${globHint}".`);
  process.exit(1);
}

function nextIndex(target) {
  const existing = fs.readdirSync(target)
    .map((name) => name.match(/^quipsly-generated-(\d+)\.(png|jpe?g|webp)$/i)?.[1])
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

let startIndex = Math.max(...targets.map(nextIndex));
const copied = [];

for (const candidate of candidates) {
  const ext = path.extname(candidate.name).toLowerCase() || ".png";
  const index = String(startIndex).padStart(2, "0");
  const publicName = `quipsly-generated-${index}${ext}`;
  for (const target of targets) {
    fs.copyFileSync(candidate.absolutePath, path.join(target, publicName));
  }
  copied.push({ source: candidate.absolutePath, publicName, size: candidate.size });
  startIndex += 1;
}

const reportDir = path.join(repoRoot, "docs/quipsly/art/ingest-reports");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-ingest.json`);
fs.writeFileSync(reportPath, JSON.stringify({ sourceDir, countRequested: count, copied, targets }, null, 2));

console.log(JSON.stringify({ ok: true, copied: copied.length, reportPath, nextStep: "Review images, then add named entries to packages/quipsly-domain/src/generated-art.ts for approved assets." }, null, 2));
