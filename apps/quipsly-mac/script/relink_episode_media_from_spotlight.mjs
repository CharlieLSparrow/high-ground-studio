#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const [projectSlug, episodeSlug, maybeApply] = process.argv.slice(2);
const apply = maybeApply === "--apply";

if (!projectSlug || !episodeSlug) {
  console.error("Usage: relink_episode_media_from_spotlight.mjs <projectSlug> <episodeSlug> [--apply]");
  process.exit(2);
}

const appSupport = join(
  process.env.HOME,
  "Library/Application Support/QuipslyMac/local-episode-edits",
  projectSlug
);
const sessionPath = join(appSupport, `${episodeSlug}.json`);

if (!existsSync(sessionPath)) {
  console.error(`No local episode draft found at ${sessionPath}`);
  process.exit(1);
}

const episodeNumber = episodeSlug.match(/episode-(\d+)/i)?.[1] ?? "";
const preferredNeedles = [
  episodeNumber ? `/Podcast/Episode ${episodeNumber}/` : "",
  episodeNumber ? `/Podcast/${episodeNumber}/` : "",
  "/Shared drives/HighGroundDrive/",
].filter(Boolean);

function spotlightCandidates(fileName) {
  try {
    const output = execFileSync("/usr/bin/mdfind", ["-name", fileName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((candidate) => basename(candidate).toLowerCase() === fileName.toLowerCase())
      .filter((candidate) => existsSync(candidate))
      .filter((candidate) => !candidate.includes("/Adobe/Common/Peak Files/"))
      .filter((candidate) => !candidate.includes("/Adobe/Common/Media Cache Files/"))
      .filter((candidate) => !candidate.match(/\.(pek|cfa)$/i));
  } catch {
    return [];
  }
}

function scoreCandidate(candidate) {
  let score = 0;
  for (const needle of preferredNeedles) {
    if (candidate.includes(needle)) score += 50;
  }
  if (candidate.includes("/Other/")) score -= 10;
  if (candidate.includes("/Volumes/")) score -= 5;
  if (candidate.includes("/Library/CloudStorage/")) score += 5;
  return score;
}

const session = JSON.parse(readFileSync(sessionPath, "utf8"));
const clips = Array.isArray(session.clips) ? session.clips : [];
const missingPaths = [...new Set(
  clips
    .map((clip) => clip.localMediaPath)
    .filter((path) => path && !existsSync(path))
)];

const resolutions = new Map();
const unresolved = [];

for (const missingPath of missingPaths) {
  const fileName = basename(missingPath);
  const candidates = spotlightCandidates(fileName)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || a.localeCompare(b));

  if (candidates.length === 0) {
    unresolved.push({ missingPath, fileName, reason: "no exact filename candidate found" });
    continue;
  }

  resolutions.set(missingPath, candidates[0]);
}

let changedClips = 0;

if (apply && resolutions.size > 0) {
  mkdirSync(dirname(sessionPath), { recursive: true });
  const backupPath = `${sessionPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  writeFileSync(backupPath, JSON.stringify(session, null, 2));

  for (const clip of clips) {
    const current = clip.localMediaPath;
    const replacement = resolutions.get(current);
    if (!replacement) continue;

    clip.originalLocalMediaPath ??= current;
    clip.localMediaPath = replacement;
    clip.mediaExists = true;
    clip.localRelinkedAt = new Date().toISOString();
    clip.localRelinkedBy = "apps/quipsly-mac/script/relink_episode_media_from_spotlight.mjs";
    changedClips += 1;
  }

  session.updatedAt = new Date().toISOString();
  session.localRelinkedAt = new Date().toISOString();
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

console.log(JSON.stringify({
  ok: unresolved.length === 0,
  dryRun: !apply,
  projectSlug,
  episodeSlug,
  sessionPath,
  missingUniquePaths: missingPaths.length,
  resolvedUniquePaths: resolutions.size,
  unresolved,
  changedClips,
  resolutions: [...resolutions.entries()].map(([from, to]) => ({ from, to })),
}, null, 2));

if (!apply && resolutions.size > 0) {
  console.log("Run again with --apply to update the local draft after writing a backup.");
}

process.exit(unresolved.length === 0 ? 0 : 1);
