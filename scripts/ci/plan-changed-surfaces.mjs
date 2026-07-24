#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  loadReleaseManifests,
  planChangedSurfaces as planFromReleaseManifests,
} from "../../packages/repository-governance/src/release-manifest.ts";
import {
  runReleaseManifestCli,
} from "../../packages/repository-governance/src/release-manifest-cli.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseManifests = loadReleaseManifests(repositoryRoot);

export function planChangedSurfaces(inputPaths) {
  return planFromReleaseManifests(inputPaths, releaseManifests);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runReleaseManifestCli(["plan", ...process.argv.slice(2)]);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
