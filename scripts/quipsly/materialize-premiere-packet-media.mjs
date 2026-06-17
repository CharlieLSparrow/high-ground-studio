#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MEDIA_EXTENSIONS = new Set([
  ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm",
  ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
]);

function parseArgs(argv) {
  const args = {
    json: false,
    requestDownloads: false,
    maxItems: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--packet") {
      args.packet = next;
      index += 1;
    } else if (token === "--request-downloads") {
      args.requestDownloads = true;
    } else if (token === "--max-items") {
      args.maxItems = Math.max(0, Number.parseInt(next, 10) || 0);
      index += 1;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.packet) throw new Error("Missing --packet /path/to/episode.json");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/quipsly/materialize-premiere-packet-media.mjs \\
    --packet content/quipsly/premiere-imports/episode-2.json \\
    --json

Options:
  --request-downloads   Ask iCloud Drive to download missing placeholder files with brctl.
  --max-items 20        Limit items in output/action attempts.

This inspects only primary-sequence media from the Quipsly Premiere packet.
It does not relink, upload, delete, or mutate the packet.`);
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function isLikelyMediaPath(filePath) {
  return MEDIA_EXTENSIONS.has(path.extname(String(filePath || "")).toLowerCase());
}

function pathExistsButNotReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return false;
  } catch {
    return safeStat(filePath) != null;
  }
}

function classifyItem(item) {
  const rawPath = item.actualMediaFilePath || item.filePath || item.metadata?.localImport?.actualMediaFilePath || item.metadata?.localImport?.filePath || "";
  const filePath = rawPath ? path.resolve(rawPath) : "";
  const stat = filePath ? safeStat(filePath) : null;
  const exists = Boolean(stat);
  const size = stat?.size ?? item.health?.size ?? null;
  const healthNeedsDownload = item.health?.needsLocalDownload === true || item.metadata?.localImport?.needsLocalDownload === true;
  const iCloudHistory = item.health?.iCloudHistory === true || item.metadata?.localImport?.iCloudHistory === true;
  const readableButSuspicious = exists && stat?.isFile() && stat.size === 0;
  const unreadablePlaceholder = filePath ? pathExistsButNotReadable(filePath) : false;
  const name = item.originalName || item.displayName || path.basename(filePath || "") || item.id || "unknown media";
  const kind = item.kind || item.metadata?.kind || (isLikelyMediaPath(filePath) ? "media" : "unknown");

  let status = "missing";
  let action = "Relink this source or reconnect the drive that contains it.";
  let canRequestDownload = false;

  if (!filePath) {
    status = "missing-path";
    action = "This media item has no local path. Relink it from the Premiere packet or import it manually.";
  } else if (exists && stat?.isFile() && stat.size > 0 && !healthNeedsDownload) {
    status = "ready";
    action = "Ready for probe/proxy/upload.";
  } else if (exists && (healthNeedsDownload || iCloudHistory || readableButSuspicious || unreadablePlaceholder)) {
    status = "download-needed";
    action = "Ask iCloud/Finder to download this file locally, then refresh the packet.";
    canRequestDownload = true;
  } else if (exists && stat?.isDirectory()) {
    status = "folder";
    action = "This path is a folder, not a media file. Relink the actual file.";
  } else if (exists) {
    status = "blocked-local";
    action = "The path exists but is not ready as a usable local media file.";
    canRequestDownload = true;
  }

  return {
    assetId: item.id || null,
    originalName: name,
    kind,
    path: filePath,
    status,
    action,
    exists,
    size,
    modifiedAt: stat?.mtime ? stat.mtime.toISOString() : item.health?.modifiedAt ?? null,
    iCloudHistory,
    needsLocalDownload: healthNeedsDownload || status === "download-needed",
    canRequestDownload,
  };
}

function requestICloudDownload(filePath) {
  if (process.platform !== "darwin") {
    return { attempted: false, ok: false, message: "iCloud download requests are only available on macOS." };
  }

  if (!filePath) {
    return { attempted: false, ok: false, message: "No file path to request." };
  }

  const result = spawnSync("/usr/bin/brctl", ["download", filePath], {
    encoding: "utf8",
    timeout: 10000,
  });

  return {
    attempted: true,
    ok: result.status === 0,
    status: result.status,
    message: result.status === 0
      ? "Download requested. Finder/iCloud may still need time to finish materializing the file."
      : (result.stderr || result.stdout || "brctl could not request this download.").trim(),
  };
}

function summarize(items) {
  const counts = {};
  for (const item of items) counts[item.status] = (counts[item.status] || 0) + 1;
  const blockers = items.filter((item) => item.status !== "ready");
  return {
    total: items.length,
    ready: counts.ready || 0,
    blockers: blockers.length,
    downloadNeeded: counts["download-needed"] || 0,
    missing: (counts.missing || 0) + (counts["missing-path"] || 0),
    blockedLocal: counts["blocked-local"] || 0,
    counts,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packetPath = path.resolve(args.packet);
  const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  const primaryMedia = Array.isArray(packet.media) ? packet.media : [];
  const allItems = primaryMedia.map(classifyItem);
  const items = args.maxItems > 0 ? allItems.slice(0, args.maxItems) : allItems;
  const requestedDownloads = [];

  if (args.requestDownloads) {
    for (const item of items.filter((entry) => entry.canRequestDownload)) {
      requestedDownloads.push({
        assetId: item.assetId,
        originalName: item.originalName,
        path: item.path,
        ...requestICloudDownload(item.path),
      });
    }
  }

  const result = {
    ok: true,
    packetPath,
    projectSlug: packet.projectSlug || null,
    episodeSlug: packet.episodeSlug || null,
    scope: "primary-sequence-media-only",
    mutatesPacket: false,
    requestDownloads: args.requestDownloads,
    summary: summarize(allItems),
    items,
    requestedDownloads,
    warnings: [
      "This helper inspects packet.media only: primary-sequence assets needed by the edit.",
      "Download requests are best-effort. Refresh the packet after iCloud/Finder finishes materializing files.",
    ],
  };

  if (args.json) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`${result.projectSlug}/${result.episodeSlug} source readiness`);
  console.log(`Ready: ${result.summary.ready}/${result.summary.total}; blockers: ${result.summary.blockers}; download needed: ${result.summary.downloadNeeded}; missing: ${result.summary.missing}`);
  for (const item of items.filter((entry) => entry.status !== "ready")) {
    console.log(`- ${item.originalName}: ${item.status}`);
    console.log(`  ${item.path || "no path"}`);
    console.log(`  ${item.action}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: message }));
  } else {
    console.error(message);
  }
  process.exit(1);
}
