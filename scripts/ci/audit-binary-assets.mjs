#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_GROWTH_BYTES = 5 * 1024 * 1024;

const BINARY_ASSET_EXTENSIONS = new Set([
  ".7z",
  ".aac",
  ".aiff",
  ".ai",
  ".avif",
  ".avi",
  ".dmg",
  ".docx",
  ".fig",
  ".flac",
  ".gif",
  ".gz",
  ".heic",
  ".ico",
  ".insv",
  ".ipa",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".pkg",
  ".png",
  ".pptx",
  ".psd",
  ".sketch",
  ".tar",
  ".tif",
  ".tiff",
  ".wav",
  ".webp",
  ".woff",
  ".woff2",
  ".xlsx",
  ".zip",
]);

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

export function isBinaryAssetPath(filePath) {
  return BINARY_ASSET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function treeBlobSizes(ref) {
  const entries = runGit(["ls-tree", "-r", "-l", "-z", ref, "--"]).split("\0");
  const sizes = new Map();

  for (const entry of entries) {
    if (!entry) continue;
    const match = entry.match(/^\d+ blob [0-9a-f]+\s+(\d+)\t([\s\S]+)$/);
    if (!match) continue;
    sizes.set(match[2], Number(match[1]));
  }

  return sizes;
}

function changedPaths(base, head) {
  const fields = runGit([
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    base,
    head,
    "--",
  ]).split("\0");
  const changes = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) break;

    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push({
        status: status[0],
        oldPath: fields[index++],
        newPath: fields[index++],
      });
    } else {
      const filePath = fields[index++];
      changes.push({
        status: status[0],
        oldPath: status.startsWith("A") ? null : filePath,
        newPath: status.startsWith("D") ? null : filePath,
      });
    }
  }

  return changes;
}

export function auditBinaryChanges(
  changes,
  {
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxGrowthBytes = DEFAULT_MAX_GROWTH_BYTES,
  } = {},
) {
  const assets = changes
    .filter((change) => change.newPath && isBinaryAssetPath(change.newPath))
    .map((change) => {
      const oldSize = change.oldSize ?? 0;
      const newSize = change.newSize ?? 0;
      return {
        ...change,
        oldSize,
        newSize,
        growth: Math.max(0, newSize - oldSize),
      };
    })
    .sort((left, right) => right.growth - left.growth || left.newPath.localeCompare(right.newPath));

  const oversized = assets.filter((asset) => {
    if (asset.status === "R") return false;
    const addsCheckoutBytes = asset.status === "A" || asset.status === "C" || asset.growth > 0;
    return addsCheckoutBytes && asset.newSize > maxFileBytes;
  });
  const growthBytes = assets.reduce((total, asset) => total + asset.growth, 0);

  return {
    ok: oversized.length === 0 && growthBytes <= maxGrowthBytes,
    assets,
    oversized,
    growthBytes,
    maxFileBytes,
    maxGrowthBytes,
  };
}

function collectChanges(base, head) {
  const baseSizes = treeBlobSizes(base);
  const headSizes = treeBlobSizes(head);

  return changedPaths(base, head).map((change) => ({
    ...change,
    oldSize: change.oldPath ? baseSizes.get(change.oldPath) ?? 0 : 0,
    newSize: change.newPath ? headSizes.get(change.newPath) ?? 0 : 0,
  }));
}

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function byteLabel(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function runCli() {
  const args = process.argv.slice(2);
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  if (!base || !head) {
    throw new Error("Supply --base and --head.");
  }

  const audit = auditBinaryChanges(collectChanges(base, head));
  for (const asset of audit.assets) {
    const direction = asset.growth > 0 ? `+${byteLabel(asset.growth)}` : "no growth";
    console.log(`${asset.status} ${asset.newPath}: ${byteLabel(asset.newSize)} (${direction})`);
  }

  if (audit.oversized.length > 0) {
    console.error(
      `FAIL ${audit.oversized.length} changed binary asset(s) exceed the ${byteLabel(audit.maxFileBytes)} per-file budget.`,
    );
  }
  if (audit.growthBytes > audit.maxGrowthBytes) {
    console.error(
      `FAIL Binary checkout growth is ${byteLabel(audit.growthBytes)}; budget is ${byteLabel(audit.maxGrowthBytes)}.`,
    );
  }
  if (!audit.ok) {
    console.error("Optimize shipping assets or move source originals to the versioned asset store.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS ${audit.assets.length} changed binary asset(s); checkout growth ${byteLabel(audit.growthBytes)}.`,
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
