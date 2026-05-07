import "server-only";

import { access, readFile } from "node:fs/promises";
import path from "node:path";

export const EPISODE_LIFECYCLE_STATUSES = [
  "Brainstorm",
  "Rough Draft",
  "Ready to Record",
  "Recorded",
  "Edited",
  "Live",
] as const;

export type EpisodeLifecycleStatus =
  (typeof EPISODE_LIFECYCLE_STATUSES)[number];

export type EpisodeProductionDraftSelectedItem = {
  label: string;
  kind: string;
  source: string | null;
  classification: string | null;
  notes: string | null;
};

export type EpisodeProductionFileReference = {
  path: string;
  exists: boolean;
  warning: string | null;
};

export type EpisodeProductionEpisode = {
  key: string;
  episodeNumber: number | null;
  title: string;
  lifecycleStatus: EpisodeLifecycleStatus;
  recordingStatus: string;
  publicSlug: string | null;
  sourceConfidence: string;
  intakeFiles: string[];
  intakeFileStatuses: EpisodeProductionFileReference[];
  arrangementKeys: string[];
  draftStatus: string;
  draftSelectedItems: EpisodeProductionDraftSelectedItem[];
  recordingNotes: string[];
  showNotes: string[];
  unresolvedDecisions: string[];
  warnings: string[];
  sourceWarnings: string[];
  nextAction: string;
};

export type SeasonOneEpisodeProductionState = {
  sourceLabel: string | null;
  episodes: EpisodeProductionEpisode[];
  warnings: string[];
};

type RawEpisodeProductionEpisode = {
  key: string;
  values: Record<string, unknown>;
};

const EPISODE_PRODUCTION_RELATIVE_PATH = [
  "content",
  "books",
  "learning-to-lead",
  "episode-production",
  "season-one.yml",
] as const;

export const EPISODE_PRODUCTION_SOURCE_LABEL =
  EPISODE_PRODUCTION_RELATIVE_PATH.join("/");

const CONTENT_ROOT_RELATIVE_PATH = ["content"] as const;

const BOOK_ROOT_RELATIVE_PATH = [
  "content",
  "books",
  "learning-to-lead",
] as const;

const ARRAY_FIELDS = new Set([
  "intakeFiles",
  "arrangementKeys",
  "draftSelectedItems",
  "recordingNotes",
  "showNotes",
  "unresolvedDecisions",
  "warnings",
]);

const OBJECT_ARRAY_FIELDS = new Set(["draftSelectedItems"]);

async function resolveRepoRelativePath(
  relativePath: readonly string[],
): Promise<string | null> {
  const directPath = path.join(process.cwd(), ...relativePath);
  const repoPath = path.join(process.cwd(), "apps", "web", ...relativePath);

  for (const candidate of [directPath, repoPath]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next likely location.
    }
  }

  return null;
}

function parseScalarString(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "null") {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseScalarValue(value: string) {
  const parsed = parseScalarString(value);

  if (/^-?\d+$/.test(parsed)) {
    return Number(parsed);
  }

  return parsed;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  if (!normalized || normalized === "TBD") {
    return null;
  }

  return normalized;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter(Boolean);
}

function readEpisodeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(readString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function readLifecycleStatus(
  value: unknown,
  key: string,
  sourceWarnings: string[],
): EpisodeLifecycleStatus {
  const normalized = readString(value);

  if (EPISODE_LIFECYCLE_STATUSES.includes(normalized as EpisodeLifecycleStatus)) {
    return normalized as EpisodeLifecycleStatus;
  }

  sourceWarnings.push(
    `Episode ${key} has missing or invalid lifecycleStatus; defaulted to Brainstorm.`,
  );

  return "Brainstorm";
}

function readDraftSelectedItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const label = readString(record.label);

      if (!label) {
        return null;
      }

      return {
        label,
        kind: readString(record.kind) || "candidate",
        source: readNullableString(record.source),
        classification: readNullableString(record.classification),
        notes: readNullableString(record.notes),
      } satisfies EpisodeProductionDraftSelectedItem;
    })
    .filter((entry): entry is EpisodeProductionDraftSelectedItem => Boolean(entry));
}

function parseSeasonOneProductionYaml(source: string) {
  const lines = source.split(/\r?\n/);
  const rawEpisodes: RawEpisodeProductionEpisode[] = [];
  let inEpisodes = false;
  let currentEpisode: RawEpisodeProductionEpisode | null = null;
  let currentArrayField: string | null = null;
  let currentObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (!inEpisodes) {
      if (trimmed === "episodes:") {
        inEpisodes = true;
      }

      continue;
    }

    const episodeMatch = line.match(/^  ([A-Za-z0-9-]+):\s*$/);
    if (episodeMatch) {
      currentEpisode = {
        key: episodeMatch[1],
        values: {},
      };
      rawEpisodes.push(currentEpisode);
      currentArrayField = null;
      currentObject = null;
      continue;
    }

    if (!currentEpisode) {
      continue;
    }

    const objectArrayItemMatch = line.match(
      /^      -\s+([A-Za-z0-9_-]+):\s*(.*)$/,
    );
    if (
      currentArrayField &&
      OBJECT_ARRAY_FIELDS.has(currentArrayField) &&
      objectArrayItemMatch
    ) {
      currentObject = {
        [objectArrayItemMatch[1]]: parseScalarValue(objectArrayItemMatch[2]),
      };
      const existingValue = currentEpisode.values[currentArrayField];
      const items = Array.isArray(existingValue) ? existingValue : [];
      items.push(currentObject);
      currentEpisode.values[currentArrayField] = items;
      continue;
    }

    const objectFieldMatch = line.match(/^        ([A-Za-z0-9_-]+):\s*(.*)$/);
    if (currentObject && objectFieldMatch) {
      currentObject[objectFieldMatch[1]] = parseScalarValue(objectFieldMatch[2]);
      continue;
    }

    const arrayItemMatch = line.match(/^      -\s+(.*)$/);
    if (
      currentArrayField &&
      !OBJECT_ARRAY_FIELDS.has(currentArrayField) &&
      arrayItemMatch
    ) {
      const existingValue = currentEpisode.values[currentArrayField];
      const items = Array.isArray(existingValue) ? existingValue : [];
      items.push(parseScalarValue(arrayItemMatch[1]));
      currentEpisode.values[currentArrayField] = items;
      currentObject = null;
      continue;
    }

    const fieldMatch = line.match(/^    ([A-Za-z0-9_-]+):\s*(.*)$/);
    if (fieldMatch) {
      const [, key, rawValue] = fieldMatch;
      const trimmedValue = rawValue.trim();
      currentObject = null;

      if (!trimmedValue && ARRAY_FIELDS.has(key)) {
        currentEpisode.values[key] = [];
        currentArrayField = key;
        continue;
      }

      currentEpisode.values[key] = parseScalarValue(rawValue);
      currentArrayField = null;
    }
  }

  return rawEpisodes;
}

async function resolveProductionReferencePath(reference: string) {
  const contentRoot = await resolveRepoRelativePath(CONTENT_ROOT_RELATIVE_PATH);
  const bookRoot = await resolveRepoRelativePath(BOOK_ROOT_RELATIVE_PATH);

  if (reference.startsWith("_inbox/")) {
    return contentRoot ? path.join(contentRoot, reference) : null;
  }

  return bookRoot ? path.join(bookRoot, reference) : null;
}

async function checkIntakeFiles(
  episodeKey: string,
  intakeFiles: string[],
): Promise<{
  statuses: EpisodeProductionFileReference[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const statuses = await Promise.all(
    intakeFiles.map(async (reference) => {
      const resolvedPath = await resolveProductionReferencePath(reference);

      if (!resolvedPath) {
        const warning = `Episode ${episodeKey} reference could not be resolved: ${reference}`;
        warnings.push(warning);
        return {
          path: reference,
          exists: false,
          warning,
        } satisfies EpisodeProductionFileReference;
      }

      try {
        await access(resolvedPath);
        return {
          path: reference,
          exists: true,
          warning: null,
        } satisfies EpisodeProductionFileReference;
      } catch {
        const warning = `Episode ${episodeKey} reference is missing on disk: ${reference}`;
        warnings.push(warning);
        return {
          path: reference,
          exists: false,
          warning,
        } satisfies EpisodeProductionFileReference;
      }
    }),
  );

  return { statuses, warnings };
}

async function normalizeEpisode(
  rawEpisode: RawEpisodeProductionEpisode,
): Promise<EpisodeProductionEpisode> {
  const sourceWarnings: string[] = [];
  const values = rawEpisode.values;
  const intakeFiles = readStringArray(values.intakeFiles);
  const intakeFileCheck = await checkIntakeFiles(rawEpisode.key, intakeFiles);
  sourceWarnings.push(...intakeFileCheck.warnings);

  const title = readString(values.title);
  if (!title) {
    sourceWarnings.push(`Episode ${rawEpisode.key} is missing a title.`);
  }

  const episodeNumber = readEpisodeNumber(values.episodeNumber);
  if (episodeNumber === null) {
    sourceWarnings.push(`Episode ${rawEpisode.key} is missing episodeNumber.`);
  }

  return {
    key: rawEpisode.key,
    episodeNumber,
    title: title || rawEpisode.key,
    lifecycleStatus: readLifecycleStatus(
      values.lifecycleStatus,
      rawEpisode.key,
      sourceWarnings,
    ),
    recordingStatus: readString(values.recordingStatus) || "unknown",
    publicSlug: readNullableString(values.publicSlug),
    sourceConfidence: readString(values.sourceConfidence) || "unknown",
    intakeFiles,
    intakeFileStatuses: intakeFileCheck.statuses,
    arrangementKeys: readStringArray(values.arrangementKeys),
    draftStatus: readString(values.draftStatus) || "unknown",
    draftSelectedItems: readDraftSelectedItems(values.draftSelectedItems),
    recordingNotes: readStringArray(values.recordingNotes),
    showNotes: readStringArray(values.showNotes),
    unresolvedDecisions: readStringArray(values.unresolvedDecisions),
    warnings: readStringArray(values.warnings),
    sourceWarnings,
    nextAction: readString(values.nextAction) || "No next action recorded.",
  };
}

function getSeasonOneProductionStateShapeWarnings(
  episodes: EpisodeProductionEpisode[],
) {
  const warnings: string[] = [];
  const seenKeys = new Set<string>();
  const seenEpisodeNumbers = new Map<number, string>();

  for (const episode of episodes) {
    if (seenKeys.has(episode.key)) {
      warnings.push(`Duplicate episode production key found: ${episode.key}`);
      continue;
    }

    seenKeys.add(episode.key);

    if (episode.episodeNumber !== null) {
      const existingKey = seenEpisodeNumbers.get(episode.episodeNumber);

      if (existingKey) {
        warnings.push(
          `Duplicate episodeNumber ${episode.episodeNumber} found on ${existingKey} and ${episode.key}.`,
        );
      } else {
        seenEpisodeNumbers.set(episode.episodeNumber, episode.key);
      }
    }
  }

  const requiredBaseEpisodeKeys = [
    "episode-01",
    "episode-02",
    "episode-03",
    "episode-04",
    "episode-05",
    "episode-06",
  ];

  for (const key of requiredBaseEpisodeKeys) {
    if (!seenKeys.has(key)) {
      warnings.push(`Season One production state is missing ${key}.`);
    }
  }

  const episodeFive = episodes.find((episode) => episode.key === "episode-05");
  const episodeSix = episodes.find((episode) => episode.key === "episode-06");

  if (episodeFive && episodeFive.draftSelectedItems.length !== 6) {
    warnings.push(
      `Episode 5 expected 6 draft selected items but parsed ${episodeFive.draftSelectedItems.length}.`,
    );
  }

  if (episodeSix && episodeSix.draftSelectedItems.length !== 5) {
    warnings.push(
      `Episode 6 expected 5 draft selected items but parsed ${episodeSix.draftSelectedItems.length}.`,
    );
  }

  return warnings;
}

export async function getLearningToLeadEpisodeProductionState(): Promise<SeasonOneEpisodeProductionState> {
  const sourcePath = await resolveRepoRelativePath(EPISODE_PRODUCTION_RELATIVE_PATH);

  if (!sourcePath) {
    return {
      sourceLabel: null,
      episodes: [],
      warnings: [
        "Episode production state file not found at content/books/learning-to-lead/episode-production/season-one.yml.",
      ],
    };
  }

  const rawSource = await readFile(sourcePath, "utf8");
  const rawEpisodes = parseSeasonOneProductionYaml(rawSource);
  const episodes = await Promise.all(rawEpisodes.map(normalizeEpisode));
  const parserWarnings = [
    ...episodes.flatMap((episode) => episode.sourceWarnings),
    ...getSeasonOneProductionStateShapeWarnings(episodes),
  ];

  return {
    sourceLabel: EPISODE_PRODUCTION_SOURCE_LABEL,
    episodes,
    warnings: parserWarnings,
  };
}
