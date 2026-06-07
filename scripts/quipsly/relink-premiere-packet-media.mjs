#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_RESULTS = 8;
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "Library",
  "Caches",
  ".Trash",
  "DerivedData",
]);

function parseArgs(argv) {
  const args = {
    searchRoots: [],
    apply: false,
    json: false,
    maxResults: DEFAULT_MAX_RESULTS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--packet") {
      args.packet = next;
      index += 1;
    } else if (token === "--search-root") {
      args.searchRoots.push(next);
      index += 1;
    } else if (token === "--out") {
      args.out = next;
      index += 1;
    } else if (token === "--max-results") {
      args.maxResults = Math.max(1, Number.parseInt(next, 10) || DEFAULT_MAX_RESULTS);
      index += 1;
    } else if (token === "--apply") {
      args.apply = true;
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
  if (!args.searchRoots.length) throw new Error("Missing --search-root /folder/to/search");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/quipsly/relink-premiere-packet-media.mjs \\
    --packet content/quipsly/premiere-imports/episode-1.json \\
    --search-root /Users/wall-e/Desktop/Podcast \\
    --apply

Searches only missing primary-sequence media in a Quipsly Premiere packet.
Project-wide Premiere inventory is not staged or relinked by default.`);
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function isMissingPrimaryMedia(item) {
  return item && item.health?.exists !== true;
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function pathSegments(filePath) {
  return normalize(filePath)
    .split(/[\\/]+/)
    .filter(Boolean)
    .filter((part) => !["users", "wall-e", "desktop", "volumes"].includes(part));
}

function scoreCandidate(media, candidatePath, stat) {
  const wantedName = normalize(media.originalName || path.basename(media.filePath || ""));
  const candidateName = normalize(path.basename(candidatePath));
  const wantedExt = normalize(path.extname(wantedName));
  const candidateExt = normalize(path.extname(candidateName));
  let score = 0;

  if (candidateName === wantedName) score += 100;
  if (wantedExt && wantedExt === candidateExt) score += 20;
  if (media.kind && normalize(candidatePath).includes(normalize(media.kind))) score += 3;

  const expectedSize = Number(media.health?.size || 0);
  if (expectedSize > 0 && stat?.size === expectedSize) score += 35;

  const originalSegments = new Set(pathSegments(media.filePath));
  for (const segment of pathSegments(candidatePath)) {
    if (originalSegments.has(segment)) score += 2;
  }

  return score;
}

function walkForBasenames(searchRoots, targetBasenames) {
  const candidatesByBasename = new Map();
  const resolvedRoots = searchRoots.map((root) => path.resolve(root));
  const stack = [...resolvedRoots];
  let scannedFiles = 0;
  let scannedDirs = 0;
  const warnings = [];

  while (stack.length) {
    const current = stack.pop();
    const stat = safeStat(current);
    if (!stat) {
      warnings.push(`Could not read ${current}`);
      continue;
    }

    if (stat.isFile()) {
      scannedFiles += 1;
      const basename = normalize(path.basename(current));
      if (targetBasenames.has(basename)) {
        if (!candidatesByBasename.has(basename)) candidatesByBasename.set(basename, []);
        candidatesByBasename.get(basename).push({ path: current, stat });
      }
      continue;
    }

    if (!stat.isDirectory()) continue;
    scannedDirs += 1;
    if (SKIP_DIRS.has(path.basename(current))) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      warnings.push(`Could not list ${current}`);
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      stack.push(path.join(current, entry.name));
    }
  }

  return {
    candidatesByBasename,
    scannedFiles,
    scannedDirs,
    warnings,
  };
}

function chooseUnambiguousCandidate(candidates) {
  if (!candidates.length) return null;
  const best = candidates[0];
  const second = candidates[1];
  if (!second) return best;
  return best.score > second.score ? best : null;
}

function healthForPath(filePath, previousHealth = {}) {
  const stat = safeStat(filePath);
  return {
    ...previousHealth,
    exists: Boolean(stat),
    size: stat?.size ?? previousHealth.size ?? null,
    modifiedAt: stat?.mtime ? stat.mtime.toISOString() : previousHealth.modifiedAt ?? null,
    needsLocalDownload: false,
  };
}

function patchImportedMedia(packet, media, selectedPath, relinkedAt) {
  const importedMedia = packet.quipslyEpisodeProductionPatch?.importedMedia;
  if (!Array.isArray(importedMedia)) return;

  const imported = importedMedia.find((item) => item.id === media.id);
  if (!imported) return;

  imported.metadata = imported.metadata || {};
  imported.metadata.localImport = imported.metadata.localImport || {};
  imported.metadata.localImport.relinkedFrom = imported.metadata.localImport.filePath || media.filePath;
  imported.metadata.localImport.filePath = selectedPath;
  imported.metadata.localImport.actualMediaFilePath = selectedPath;
  imported.metadata.localImport.exists = true;
  imported.metadata.localImport.needsLocalDownload = false;
  imported.metadata.localImport.relinkedAt = relinkedAt;

  imported.sync = imported.sync || {};
  imported.sync.status = "ready-to-sync";
  imported.sync.note = "Relinked locally and ready for probe/proxy/upload.";
  imported.sync.suggestionReason = "Premiere media was missing at the remembered path, then relinked to an available local file.";
}

function patchSpineCandidates(packet, assetId) {
  const candidates = packet.quipslyEpisodeProductionPatch?.premiereSuggestedSpineAudioCandidates;
  if (!Array.isArray(candidates)) return;
  for (const candidate of candidates) {
    if (candidate.assetId === assetId) candidate.exists = true;
  }
}

function applyRelinks(packet, itemResults, outputPath, packetPath) {
  const relinkedAt = new Date().toISOString();
  let relinkedCount = 0;

  for (const result of itemResults) {
    if (result.status !== "relinked" || !result.selectedPath) continue;
    const media = packet.media.find((item) => item.id === result.assetId);
    if (!media) continue;

    const originalFilePath = media.filePath;
    media.filePath = result.selectedPath;
    media.actualMediaFilePath = result.selectedPath;
    media.health = healthForPath(result.selectedPath, media.health);
    media.relink = {
      status: "relinked",
      originalFilePath,
      relinkedAt,
      method: "filename-search-primary-sequence-media",
    };

    const inventoryItem = Array.isArray(packet.projectMediaInventory)
      ? packet.projectMediaInventory.find((item) => item.id === media.id)
      : null;
    if (inventoryItem) {
      inventoryItem.filePath = result.selectedPath;
      inventoryItem.actualMediaFilePath = result.selectedPath;
      inventoryItem.health = healthForPath(result.selectedPath, inventoryItem.health);
      inventoryItem.relink = media.relink;
    }

    patchImportedMedia(packet, media, result.selectedPath, relinkedAt);
    patchSpineCandidates(packet, media.id);
    relinkedCount += 1;
  }

  packet.summary = packet.summary || {};
  packet.summary.missingMediaCount = packet.media.filter((item) => item.health?.exists !== true).length;
  packet.summary.iCloudHistoryCount = packet.media.filter((item) => item.health?.iCloudHistory === true).length;
  packet.summary.mediaCount = packet.media.length;
  packet.summary.importMediaCount = packet.media.length;
  packet.summary.primarySequenceMediaCount = packet.media.length;
  if (Array.isArray(packet.projectMediaInventory)) {
    packet.summary.projectMissingMediaCount = packet.projectMediaInventory.filter((item) => item.health?.exists !== true).length;
    packet.summary.projectICloudHistoryCount = packet.projectMediaInventory.filter((item) => item.health?.iCloudHistory === true).length;
  }

  packet.premiere = packet.premiere || {};
  packet.premiere.relinkHistory = Array.isArray(packet.premiere.relinkHistory) ? packet.premiere.relinkHistory : [];
  packet.premiere.relinkHistory.push({
    relinkedAt,
    packetPath,
    outputPath,
    relinkedCount,
    scope: "primary-sequence-media-only",
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
  return relinkedCount;
}

function buildSummary(packet, outputPath) {
  const spine = packet.quipslyEpisodeProductionPatch?.premiereSuggestedSpineAudioCandidates?.[0];
  return {
    episodeSlug: packet.episodeSlug,
    outputPath,
    ok: true,
    message: "Packet relink scan complete.",
    projectSlug: packet.projectSlug,
    mediaCount: packet.summary?.mediaCount ?? packet.media?.length ?? 0,
    importMediaCount: packet.summary?.importMediaCount ?? packet.summary?.mediaCount ?? packet.media?.length ?? 0,
    projectMediaCount: packet.summary?.projectMediaCount ?? packet.projectMediaInventory?.length ?? packet.media?.length ?? 0,
    skippedProjectMediaCount: packet.summary?.skippedProjectMediaCount ?? packet.skippedProjectMedia?.length ?? 0,
    missingMediaCount: packet.summary?.missingMediaCount ?? packet.media?.filter((item) => item.health?.exists !== true).length ?? 0,
    projectMissingMediaCount: packet.summary?.projectMissingMediaCount ?? packet.projectMediaInventory?.filter((item) => item.health?.exists !== true).length ?? 0,
    iCloudHistoryCount: packet.summary?.iCloudHistoryCount ?? 0,
    projectICloudHistoryCount: packet.summary?.projectICloudHistoryCount ?? 0,
    primarySequenceName: packet.summary?.primarySequenceName ?? "none",
    primaryTimelineClipCount: packet.summary?.primaryTimelineClipCount ?? packet.quipslyEpisodeProductionPatch?.timelineClips?.length ?? 0,
    deactivatedCandidateCount: packet.quipslyEpisodeProductionPatch?.premiereDeactivatedSourceCandidates?.length ?? 0,
    topSpineName: spine?.originalName ?? "none",
    topSpineExists: spine?.exists ?? null,
    topSpineUsedTimelineSeconds: spine?.usedTimelineSeconds ?? 0,
    topSpineRecommendation: spine?.recommendation ?? "",
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packetPath = path.resolve(args.packet);
  const outputPath = path.resolve(args.out || packetPath);
  const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  const missingPrimaryMedia = (packet.media || []).filter(isMissingPrimaryMedia);
  const targetBasenames = new Set(
    missingPrimaryMedia.map((item) => normalize(item.originalName || path.basename(item.filePath || ""))).filter(Boolean),
  );
  const search = walkForBasenames(args.searchRoots, targetBasenames);

  const results = missingPrimaryMedia.map((media) => {
    const basename = normalize(media.originalName || path.basename(media.filePath || ""));
    const candidates = (search.candidatesByBasename.get(basename) || [])
      .map((candidate) => ({
        path: candidate.path,
        size: candidate.stat.size,
        modifiedAt: candidate.stat.mtime.toISOString(),
        score: scoreCandidate(media, candidate.path, candidate.stat),
      }))
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, args.maxResults);
    const selected = chooseUnambiguousCandidate(candidates);

    return {
      assetId: media.id,
      originalName: media.originalName || path.basename(media.filePath || ""),
      oldPath: media.filePath,
      kind: media.kind,
      status: selected ? "relinked" : candidates.length ? "ambiguous" : "not-found",
      selectedPath: selected?.path ?? null,
      candidateCount: candidates.length,
      candidates,
    };
  });

  const relinkedCount = args.apply ? applyRelinks(packet, results, outputPath, packetPath) : 0;
  const updatedPacket = args.apply ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : packet;
  const result = {
    ok: true,
    packetPath,
    outputPath,
    applied: args.apply,
    searchRoots: args.searchRoots.map((root) => path.resolve(root)),
    scannedFiles: search.scannedFiles,
    scannedDirs: search.scannedDirs,
    missingBefore: missingPrimaryMedia.length,
    missingAfter: updatedPacket.media.filter((item) => item.health?.exists !== true).length,
    relinkedCount,
    unresolvedCount: results.filter((item) => item.status === "not-found").length,
    ambiguousCount: results.filter((item) => item.status === "ambiguous").length,
    results,
    warnings: [
      ...search.warnings,
      "Only packet.media primary-sequence assets were searched/relinked. Project inventory references were left alone.",
    ],
    summary: buildSummary(updatedPacket, outputPath),
  };

  if (args.json) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`Relink scan complete for ${packet.projectSlug}/${packet.episodeSlug}`);
  console.log(`Missing before: ${result.missingBefore}; relinked: ${result.relinkedCount}; missing after: ${result.missingAfter}`);
  for (const item of results) {
    console.log(`- ${item.originalName}: ${item.status}${item.selectedPath ? ` -> ${item.selectedPath}` : ""}`);
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
