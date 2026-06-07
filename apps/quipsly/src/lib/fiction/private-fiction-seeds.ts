import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export const PRIVATE_FICTION_OWNER_SLUG = "charlie-l-sparrow";

export const PRIVATE_FICTION_SERIES_SLUG =
  "my-heart-is-a-junkyard-starship";

export const PRIVATE_FICTION_ISSUE_SLUG =
  "issue-001-tenderness-of-unlawful-design";

export const PRIVATE_FICTION_ARTIFACT_FILES = {
  issue: "issue.json",
  storyBible: "story-bible-seed.json",
  storyboard: "storyboard-seed.json",
  scroll: "scroll-seed.json",
  source: "source.md",
  summary: "heartward-spiral-summary.md",
} as const;

export type PrivateFictionArtifactKey =
  keyof typeof PRIVATE_FICTION_ARTIFACT_FILES;

export function isPrivateFictionArtifactKey(
  value: string | null,
): value is PrivateFictionArtifactKey {
  return Boolean(value && value in PRIVATE_FICTION_ARTIFACT_FILES);
}

export function isKnownPrivateFictionSeed(
  seriesSlug: string,
  issueSlug: string,
) {
  return (
    seriesSlug === PRIVATE_FICTION_SERIES_SLUG &&
    issueSlug === PRIVATE_FICTION_ISSUE_SLUG
  );
}

export function getPrivateFictionSeedDir(
  seriesSlug: string,
  issueSlug: string,
) {
  if (!isKnownPrivateFictionSeed(seriesSlug, issueSlug)) {
    throw new Error("PRIVATE_FICTION_SEED_NOT_FOUND");
  }

  return path.join(
    process.cwd(),
    "content/private/fiction",
    PRIVATE_FICTION_OWNER_SLUG,
    seriesSlug,
    issueSlug,
  );
}

export async function readPrivateFictionArtifact(
  seriesSlug: string,
  issueSlug: string,
  artifact: PrivateFictionArtifactKey,
) {
  const seedDir = getPrivateFictionSeedDir(seriesSlug, issueSlug);
  const fileName = PRIVATE_FICTION_ARTIFACT_FILES[artifact];
  return readFile(path.join(seedDir, fileName), "utf8");
}

export async function readPrivateFictionJson<T>(
  seriesSlug: string,
  issueSlug: string,
  artifact: Exclude<PrivateFictionArtifactKey, "source" | "summary">,
) {
  const raw = await readPrivateFictionArtifact(seriesSlug, issueSlug, artifact);
  return JSON.parse(raw) as T;
}

export async function loadPrivateFictionIssueBundle(
  seriesSlug: string,
  issueSlug: string,
) {
  const [issueData, storyBibleData] = await Promise.all([
    readPrivateFictionJson<any>(seriesSlug, issueSlug, "issue"),
    readPrivateFictionJson<any>(seriesSlug, issueSlug, "storyBible"),
  ]);

  return { issueData, storyBibleData };
}
