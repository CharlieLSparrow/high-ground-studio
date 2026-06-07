#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROJECT_SLUG = "high-ground-odyssey-manuscript";
const DEFAULT_OUTPUT_DIR = "content/quipsly/premiere-imports";

const KNOWN_EPISODES = [
  {
    episodeSlug: "episode-1",
    input: "/Users/wall-e/Desktop/Podcast/1/Episode1.prproj",
  },
  {
    episodeSlug: "episode-2",
    input: "/Users/wall-e/Desktop/Podcast/2/Episode2.prproj",
  },
  {
    episodeSlug: "episode-3",
    input: "/Users/wall-e/Desktop/Podcast/3/Episode3.prproj",
  },
];

function parseArgs(argv) {
  const args = {
    projectSlug: DEFAULT_PROJECT_SLUG,
    outDir: DEFAULT_OUTPUT_DIR,
    only: new Set(),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--project" || token === "-p") {
      args.projectSlug = next;
      index += 1;
    } else if (token === "--out-dir") {
      args.outDir = next;
      index += 1;
    } else if (token === "--only") {
      args.only.add(next);
      index += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--help" || token === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/quipsly/import-known-premiere-projects.mjs

Options:
  --project high-ground-odyssey-manuscript
  --out-dir content/quipsly/premiere-imports
  --only episode-2
  --dry-run

Regenerates Quipsly Premiere import packets for the known Episode 1-3
Premiere project files on this Mac.`);
}

function repoRoot() {
  const current = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(current, "..", "..");
}

function summarizePacket(outputPath) {
  const packet = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const patch = packet.quipslyEpisodeProductionPatch ?? {};
  const spine = patch.premiereSuggestedSpineAudioCandidates?.[0];
  return {
    episodeSlug: packet.episodeSlug,
    mediaCount: packet.summary?.mediaCount ?? 0,
    importMediaCount: packet.summary?.importMediaCount ?? packet.summary?.mediaCount ?? 0,
    projectMediaCount: packet.summary?.projectMediaCount ?? packet.summary?.mediaCount ?? 0,
    skippedProjectMediaCount: packet.summary?.skippedProjectMediaCount ?? 0,
    missingMediaCount: packet.summary?.missingMediaCount ?? 0,
    projectMissingMediaCount: packet.summary?.projectMissingMediaCount ?? packet.summary?.missingMediaCount ?? 0,
    iCloudHistoryCount: packet.summary?.iCloudHistoryCount ?? 0,
    projectICloudHistoryCount: packet.summary?.projectICloudHistoryCount ?? packet.summary?.iCloudHistoryCount ?? 0,
    primarySequenceName: packet.summary?.primarySequenceName ?? "none",
    primaryTimelineClipCount: packet.summary?.primaryTimelineClipCount ?? 0,
    deactivatedCandidateCount: patch.premiereDeactivatedSourceCandidates?.length ?? 0,
    topSpineName: spine?.originalName ?? "none",
    topSpineExists: spine?.exists ?? null,
    topSpineUsedTimelineSeconds: spine?.usedTimelineSeconds ?? 0,
    outputPath,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const importerPath = path.join(root, "scripts", "quipsly", "import-premiere-project.mjs");
  const jobs = args.only.size
    ? KNOWN_EPISODES.filter((job) => args.only.has(job.episodeSlug))
    : KNOWN_EPISODES;

  if (!jobs.length) {
    throw new Error(`No known Premiere jobs matched --only ${[...args.only].join(", ")}`);
  }

  const summaries = [];
  for (const job of jobs) {
    const outputPath = path.resolve(root, args.outDir, `${job.episodeSlug}.json`);
    const commandArgs = [
      importerPath,
      "--input",
      job.input,
      "--project",
      args.projectSlug,
      "--episode",
      job.episodeSlug,
      "--out",
      outputPath,
    ];

    if (args.dryRun) {
      console.log(`Would run: node ${commandArgs.map((part) => JSON.stringify(part)).join(" ")}`);
      continue;
    }

    const result = spawnSync(process.execPath, commandArgs, {
      cwd: root,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      throw new Error(`Premiere import failed for ${job.episodeSlug} with exit code ${result.status}`);
    }

    summaries.push(summarizePacket(outputPath));
  }

  if (summaries.length) {
    console.log("\nPremiere packet summary:");
    for (const summary of summaries) {
      console.log(
        [
          summary.episodeSlug,
          `needed=${summary.mediaCount}`,
          `projectMedia=${summary.projectMediaCount}`,
          `skipped=${summary.skippedProjectMediaCount}`,
          `missing=${summary.missingMediaCount}`,
          `iCloud=${summary.iCloudHistoryCount}`,
          `clips=${summary.primaryTimelineClipCount}`,
          `inactiveCandidates=${summary.deactivatedCandidateCount}`,
          `topSpine=${summary.topSpineName}`,
          `topSpineExists=${summary.topSpineExists}`,
          `topSpineUsed=${summary.topSpineUsedTimelineSeconds}s`,
        ].join(" | "),
      );
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
