#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();

function parseArgs(argv) {
  const options = {
    proxyRoot: path.join(os.homedir(), "Library/Application Support/Quipsly/MediaVault/proxy"),
    exportRoot: "/Volumes/My Passport/Episode_and_Shorts_Test",
    projectSlug: "unattached",
    episodeSlug: "unassigned",
    write: false,
    out: "",
    json: false,
    includeProxies: true,
    includeExports: true,
    summaryOnly: false,
    limit: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--proxy-root" && next) {
      options.proxyRoot = next;
      i += 1;
    } else if (arg === "--export-root" && next) {
      options.exportRoot = next;
      i += 1;
    } else if (arg === "--project" && next) {
      options.projectSlug = next;
      i += 1;
    } else if (arg === "--episode" && next) {
      options.episodeSlug = next;
      i += 1;
    } else if (arg === "--out" && next) {
      options.out = next;
      i += 1;
    } else if (arg === "--write") {
      options.write = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--proxies-only") {
      options.includeProxies = true;
      options.includeExports = false;
    } else if (arg === "--exports-only") {
      options.includeProxies = false;
      options.includeExports = true;
    } else if (arg === "--summary-only") {
      options.summaryOnly = true;
    } else if (arg === "--limit" && next) {
      const parsed = Number(next);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Quipsly local media-vault inventory

Dry-run inventory for local proxy derivatives and release/export artifacts.
It does not upload, delete, move, or register media. It creates evidence for
the next safe cloud-vault migration step.

Usage:
  node scripts/quipsly-local-media-vault-inventory.mjs --json
  node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --summary-only --json
  node scripts/quipsly-local-media-vault-inventory.mjs --write
  node scripts/quipsly-local-media-vault-inventory.mjs --project high-ground-odyssey-manuscript --episode episode-4 --write
  node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --project high-ground-odyssey-manuscript --episode episode-4 --limit 25 --write

Important:
  Unattached proxies are intentionally marked held-unattached. Upload/register
  them only after a raw StudioMediaAsset, RecordingAsset, or episode source
  association proves what the derivative belongs to.`);
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safePathPart(value, fallback = "item") {
  return text(value, fallback)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || fallback;
}

function stableId(filePath) {
  return crypto.createHash("sha256").update(filePath).digest("hex").slice(0, 16);
}

function walkFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const found = [];
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          found.push({ path: fullPath, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
        } catch {
          // Skip unreadable files without turning the whole inventory into a failure.
        }
      }
    }
  }
  return found;
}

function classifyExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".m4v", ".webm", ".insv"].includes(ext)) return "video";
  if ([".wav", ".m4a", ".mp3", ".aac", ".flac"].includes(ext)) return "audio";
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "image";
  if ([".json", ".md", ".txt", ".csv"].includes(ext)) return "packet";
  return "other";
}

function objectPathFor(kind, options, item) {
  const filename = safePathPart(path.basename(item.path), "media.bin");
  const project = safePathPart(options.projectSlug, "unattached");
  const episode = safePathPart(options.episodeSlug, "unassigned");
  const id = safePathPart(item.cacheKey || stableId(item.path), "local-file");
  if (kind === "proxy") return `media-vault/proxy/${project}/${episode}/${id}/${filename}`;
  if (kind === "export") return `media-vault/exports/${project}/${episode}/local-review/${id}/${filename}`;
  return `media-vault/review/${project}/${episode}/${id}/${filename}`;
}

function proxyItems(options) {
  return walkFiles(options.proxyRoot).map((file) => {
    const cacheKey = safePathPart(path.basename(path.dirname(file.path)), stableId(file.path));
    return {
      localKind: "proxy",
      mediaKind: classifyExtension(file.path),
      path: file.path,
      bytes: file.bytes,
      modifiedAt: file.modifiedAt,
      cacheKey,
      plannedBucket: "high-ground-odyssey-media",
      plannedObjectPath: objectPathFor("proxy", options, { ...file, cacheKey }),
      migrationStatus: "held-unattached",
      reason:
        "Local proxy derivative needs a raw StudioMediaAsset, RecordingAsset, or episode source association before upload/register.",
      safeNextAction:
        "Use /api/media-vault/inventory or Studio session metadata to identify the raw asset, then upload/register as a proxy derivative.",
    };
  });
}

function exportItems(options) {
  return walkFiles(options.exportRoot).map((file) => ({
    localKind: "export-or-review-artifact",
    mediaKind: classifyExtension(file.path),
    path: file.path,
    bytes: file.bytes,
    modifiedAt: file.modifiedAt,
    plannedBucket: "high-ground-odyssey-media",
    plannedObjectPath: objectPathFor("export", options, file),
    migrationStatus: "held-review-artifact",
    reason:
      "Release/export artifacts are products or review evidence. Upload only through Tower/review packet flow so version and receipt truth remain explicit.",
    safeNextAction:
      "Keep local package versioned; prepare a Tower upload packet or review manifest before any cloud copy.",
  }));
}

function summarize(items) {
  const byKind = {};
  let bytes = 0;
  for (const item of items) {
    bytes += item.bytes || 0;
    byKind[item.localKind] = byKind[item.localKind] || { files: 0, bytes: 0 };
    byKind[item.localKind].files += 1;
    byKind[item.localKind].bytes += item.bytes || 0;
  }
  return {
    files: items.length,
    bytes,
    gib: Number((bytes / 1024 / 1024 / 1024).toFixed(2)),
    byKind,
  };
}

function defaultOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(root, "docs/quipsly/current-state", `media-vault-local-inventory-${stamp}.json`);
}

const options = parseArgs(process.argv.slice(2));
const rawItems = [
  ...(options.includeProxies ? proxyItems(options) : []),
  ...(options.includeExports ? exportItems(options) : []),
];
const items = options.limit > 0 ? rawItems.slice(0, options.limit) : rawItems;
const rawSummary = summarize(rawItems);
const manifest = {
  kind: "quipsly-local-media-vault-inventory-v1",
  generatedAt: new Date().toISOString(),
  dryRun: true,
  partial: options.limit > 0 || options.summaryOnly,
  sourceRoots: {
    proxyRoot: options.proxyRoot,
    exportRoot: options.exportRoot,
  },
  filters: {
    includeProxies: options.includeProxies,
    includeExports: options.includeExports,
    summaryOnly: options.summaryOnly,
    limit: options.limit,
  },
  policy: {
    primaryBucket: "high-ground-odyssey-media",
    proxyPrefix: "media-vault/proxy",
    exportPrefix: "media-vault/exports",
    sourceOfTruth:
      "This manifest does not make storage truth. Quipsly app records attach meaning, access, review state, and receipts.",
    noUploads: true,
    noDeletes: true,
    noOriginalMutation: true,
  },
  summary: rawSummary,
  emittedSummary: summarize(items),
  omittedItemCount: Math.max(rawItems.length - items.length, 0),
  items: options.summaryOnly ? [] : items,
  itemSample: options.summaryOnly ? rawItems.slice(0, Math.min(rawItems.length, 20)) : [],
};

if (options.write) {
  const outPath = options.out ? path.resolve(options.out) : defaultOutPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote dry-run local media-vault inventory: ${outPath}`);
}

if (options.json || !options.write) {
  console.log(JSON.stringify(options.json ? manifest : { ok: true, summary: manifest.summary }, null, 2));
}
