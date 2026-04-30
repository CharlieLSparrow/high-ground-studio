import { promises as fs } from "node:fs";
import path from "node:path";

export type ShowPrepSectionKey =
  | "episodeFraming"
  | "scottCore"
  | "charlieSection"
  | "researchNotes"
  | "clipNotes"
  | "editorialNotes"
  | "openDecisions"
  | "sourceProvenance"
  | "episodeNotes"
  | "clipIdeas"
  | "discussionQuestions"
  | "productionNotes"
  | "publicationStatus";

export type ShowPrepPacket = {
  title: string;
  slug: string;
  project: string;
  series: string;
  episodeNumber: number | null;
  workflowStatus: string;
  publicationStatus: string;
  publicTitle: string;
  publishSlug: string;
  youtube: string;
  description: string;
  confidence: string;
  packetPath: string;
  packetDirName: string;
  frontmatter: Record<string, unknown>;
  sectionHeadings: string[];
  sections: Record<ShowPrepSectionKey, string>;
  additionalSections: Array<{ heading: string; body: string }>;
  hasScottCore: boolean;
  hasCharlieMaterial: boolean;
  hasResearchNotes: boolean;
  hasClipNotes: boolean;
  hasYouTube: boolean;
  unresolvedQuestionCount: number;
  prepTags: string[];
  themeTags: string[];
  systemTags: string[];
  allTags: string[];
};

export type ShowPrepPacketSummary = {
  title: string;
  slug: string;
  episodeNumber: number | null;
  workflowStatus: string;
  publicationStatus: string;
  publicTitle: string;
  publishSlug: string;
  description: string;
  confidence: string;
  packetPath: string;
  hasScottCore: boolean;
  hasCharlieMaterial: boolean;
  hasResearchNotes: boolean;
  hasClipNotes: boolean;
  hasYouTube: boolean;
  unresolvedQuestionCount: number;
  prepTags: string[];
  themeTags: string[];
  systemTags: string[];
  allTags: string[];
};

export type ShowPrepSourceStatus = "missing" | "empty" | "present";

export type ShowPrepSourcePreview = {
  label: string;
  path: string;
  status: ShowPrepSourceStatus;
  preview: string;
};

export type ShowPrepCandidate = {
  slug: string;
  title: string;
  episodeNumber: number | null;
  stagingPath: string | null;
  inboxPath: string | null;
  manifestPath: string | null;
  packetSlug: string | null;
  hasCanonicalPacket: boolean;
  packetTitle: string;
  packetPath: string | null;
  confidence: string;
  needsReview: boolean | null;
  plannedReleaseDate: string;
  issues: string[];
  scottStatus: ShowPrepSourceStatus;
  charlieStatus: ShowPrepSourceStatus;
  researchStatus: ShowPrepSourceStatus;
  extrasStatus: ShowPrepSourceStatus;
  hasStaging: boolean;
  hasInbox: boolean;
  hasScottSource: boolean;
  hasCharlieSource: boolean;
  hasCharlieContent: boolean;
  hasResearch: boolean;
  hasExtras: boolean;
  recommendedNextAction:
    | "Already packeted"
    | "Create canonical packet"
    | "Review source material"
    | "Needs source cleanup";
  sourcePaths: string[];
  systemTags: string[];
  allTags: string[];
  scottSource: ShowPrepSourcePreview | null;
  charlieSources: ShowPrepSourcePreview[];
  researchSources: ShowPrepSourcePreview[];
  extraSources: ShowPrepSourcePreview[];
  inboxMainSources: ShowPrepSourcePreview[];
};

export type ShowPrepCandidateSummary = {
  slug: string;
  title: string;
  episodeNumber: number | null;
  stagingPath: string | null;
  inboxPath: string | null;
  manifestPath: string | null;
  packetSlug: string | null;
  hasCanonicalPacket: boolean;
  packetTitle: string;
  confidence: string;
  needsReview: boolean | null;
  scottStatus: ShowPrepSourceStatus;
  charlieStatus: ShowPrepSourceStatus;
  researchStatus: ShowPrepSourceStatus;
  extrasStatus: ShowPrepSourceStatus;
  hasStaging: boolean;
  hasInbox: boolean;
  hasScottSource: boolean;
  hasCharlieContent: boolean;
  hasResearch: boolean;
  hasExtras: boolean;
  recommendedNextAction:
    | "Already packeted"
    | "Create canonical packet"
    | "Review source material"
    | "Needs source cleanup";
  sourcePaths: string[];
  systemTags: string[];
  allTags: string[];
};

type StagingManifest = {
  type?: string;
  meta?: {
    episodeNumber?: number;
    title?: string;
    slug?: string;
    plannedReleaseDate?: string | null;
    needsReview?: boolean;
  };
  files?: Array<{
    file?: string;
    category?: string;
    target?: string;
    selectedAsMain?: boolean;
    empty?: boolean;
    skipped?: boolean;
  }>;
  issues?: string[];
  confidence?: string;
};

type RawCandidate = {
  key: string;
  slug: string;
  title: string;
  episodeNumber: number | null;
  stagingPath: string | null;
  inboxPath: string | null;
  manifestPath: string | null;
  confidence: string;
  needsReview: boolean | null;
  plannedReleaseDate: string;
  issues: string[];
  scottSource: ShowPrepSourcePreview | null;
  charlieSources: ShowPrepSourcePreview[];
  researchSources: ShowPrepSourcePreview[];
  extraSources: ShowPrepSourcePreview[];
  inboxMainSources: ShowPrepSourcePreview[];
};

const EPISODE_PACKET_ROOT = path.join(
  process.cwd(),
  "content",
  "episodes",
  "learning-to-lead",
);
const STAGING_EPISODE_ROOT = path.join(
  process.cwd(),
  "content",
  "_staging",
  "learning-to-lead",
  "episodes",
);
const INBOX_EPISODE_ROOT = path.join(
  process.cwd(),
  "content",
  "_inbox",
  "Podcast Year 1",
);

const PACKET_SOURCE_ROOT = "apps/web/content/episodes/learning-to-lead";
const STAGING_SOURCE_ROOT = "apps/web/content/_staging/learning-to-lead/episodes";
const INBOX_SOURCE_ROOT = "apps/web/content/_inbox/Podcast Year 1";

const SECTION_KEY_BY_HEADING: Record<string, ShowPrepSectionKey> = {
  "episode framing": "episodeFraming",
  "scott core": "scottCore",
  "charlie section": "charlieSection",
  "research notes": "researchNotes",
  "clip notes": "clipNotes",
  "editorial notes": "editorialNotes",
  "ambiguities unresolved questions": "openDecisions",
  "source provenance": "sourceProvenance",
  "episode notes": "episodeNotes",
  "clip ideas": "clipIdeas",
  "discussion questions": "discussionQuestions",
  "production notes": "productionNotes",
  "publication status": "publicationStatus",
  "references source map": "sourceProvenance",
};

const CHARLIE_EMPTY_PATTERNS = [
  /^no charlie material yet\.?$/i,
  /^no real charlie prose source exists yet/i,
  /^charlie material is not yet available/i,
];

function normalizeHeading(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function toTitleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toRepoPath(absolutePath: string) {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.startsWith("..") ? absolutePath : relative.replaceAll(path.sep, "/");
}

function previewText(content: string, limit = 1200) {
  const cleaned = content.trim();

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= limit) {
    return cleaned;
  }

  return `${cleaned.slice(0, limit).trimEnd()}\n\n…`;
}

function parseScalar(rawValue: string): unknown {
  const value = rawValue.trim();

  if (!value) return "";
  if (value === "[]") return [];
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

function normalizeTagValue(value: string) {
  return normalizeForMatch(value).trim();
}

function readStringTagArray(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map(normalizeTagValue)
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = normalizeTagValue(value);
    return normalized ? [normalized] : [];
  }

  return [];
}

function parseFrontmatter(frontmatterBlock: string) {
  const result: Record<string, unknown> = {};
  const lines = frontmatterBlock.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!match) {
      continue;
    }

    const [, key, inlineValue = ""] = match;

    if (inlineValue.trim()) {
      result[key] = parseScalar(inlineValue);
      continue;
    }

    const arrayValues: unknown[] = [];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const candidate = lines[cursor];
      const bulletMatch = candidate.match(/^\s+-\s+(.*)$/);

      if (!bulletMatch) {
        break;
      }

      arrayValues.push(parseScalar(bulletMatch[1]));
      cursor += 1;
    }

    if (arrayValues.length > 0) {
      result[key] = arrayValues;
      index = cursor - 1;
    } else {
      result[key] = "";
    }
  }

  return result;
}

function splitFrontmatter(raw: string) {
  if (!raw.startsWith("---\n")) {
    return {
      frontmatter: {} as Record<string, unknown>,
      body: raw,
    };
  }

  const endIndex = raw.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return {
      frontmatter: {} as Record<string, unknown>,
      body: raw,
    };
  }

  return {
    frontmatter: parseFrontmatter(raw.slice(4, endIndex)),
    body: raw.slice(endIndex + 5),
  };
}

function parseSections(body: string) {
  const sections = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (!currentHeading) {
      return;
    }

    sections.set(currentHeading, buffer.join("\n").trim());
  }

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);

    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      buffer = [];
      continue;
    }

    if (currentHeading) {
      buffer.push(line);
    }
  }

  flush();

  return sections;
}

function countBulletItems(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s+/.test(line.trim())).length;
}

function hasRealCharlieMaterial(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  return !CHARLIE_EMPTY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function readSourceStatus(sources: ShowPrepSourcePreview[]) {
  if (!sources.length) {
    return "missing" as ShowPrepSourceStatus;
  }

  if (sources.some((source) => source.status === "present")) {
    return "present" as ShowPrepSourceStatus;
  }

  if (sources.some((source) => source.status === "empty")) {
    return "empty" as ShowPrepSourceStatus;
  }

  return "missing" as ShowPrepSourceStatus;
}

function buildPacketRecord(packetDirName: string, raw: string): ShowPrepPacket {
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsedSections = parseSections(body);
  const sections = {} as Record<ShowPrepSectionKey, string>;
  const additionalSections: Array<{ heading: string; body: string }> = [];
  const sectionHeadings = Array.from(parsedSections.keys());

  for (const [heading, sectionBody] of parsedSections.entries()) {
    const key = SECTION_KEY_BY_HEADING[normalizeHeading(heading)];

    if (key) {
      if (!sections[key]) {
        sections[key] = sectionBody;
      }
      continue;
    }

    additionalSections.push({ heading, body: sectionBody });
  }

  const slug = String(frontmatter.slug || packetDirName);
  const episodeNumber =
    typeof frontmatter.episodeNumber === "number"
      ? frontmatter.episodeNumber
      : frontmatter.episodeNumber
        ? Number(frontmatter.episodeNumber)
        : null;

  const workflowStatus = String(frontmatter.workflowStatus || "unknown");
  const publicationStatus = String(frontmatter.publicationStatus || "unknown");
  const publicTitle = String(frontmatter.publicTitle || "");
  const publishSlug = String(frontmatter.publishSlug || "");
  const youtube = String(frontmatter.youtube || "");
  const description = String(frontmatter.description || "");
  const confidence = String(frontmatter.confidence || "");
  const prepTags = readStringTagArray(frontmatter.prepTags);
  const themeTags = readStringTagArray(frontmatter.themeTags);
  const hasScottCore = Boolean(sections.scottCore?.trim());
  const hasCharlieMaterial = hasRealCharlieMaterial(sections.charlieSection || "");
  const hasResearchNotes = Boolean(
    sections.researchNotes?.trim() || sections.episodeNotes?.trim(),
  );
  const hasClipNotes = Boolean(
    sections.clipNotes?.trim() || sections.clipIdeas?.trim(),
  );
  const hasYouTube = Boolean(youtube.trim());
  const unresolvedQuestionCount = countBulletItems(sections.openDecisions || "");
  const systemTags = Array.from(
    new Set(
      [
        "prep-ready",
        "already-packeted",
        hasScottCore ? "has-scott-core" : "missing-scott-core",
        hasCharlieMaterial ? "has-charlie-material" : "missing-charlie-material",
        hasResearchNotes ? "has-research" : "",
        hasClipNotes ? "has-clip-notes" : "",
        hasYouTube ? "has-youtube" : "missing-youtube",
        unresolvedQuestionCount > 0 ? "has-open-questions" : "",
      ].filter(Boolean),
    ),
  );
  const allTags = Array.from(new Set([...prepTags, ...themeTags, ...systemTags]));

  return {
    title: String(frontmatter.title || slug),
    slug,
    project: String(frontmatter.project || "learning-to-lead"),
    series: String(frontmatter.series || ""),
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
    workflowStatus,
    publicationStatus,
    publicTitle,
    publishSlug,
    youtube,
    description,
    confidence,
    packetPath: `${PACKET_SOURCE_ROOT}/${packetDirName}/packet.mdx`,
    packetDirName,
    frontmatter,
    sectionHeadings,
    sections,
    additionalSections,
    hasScottCore,
    hasCharlieMaterial,
    hasResearchNotes,
    hasClipNotes,
    hasYouTube,
    unresolvedQuestionCount,
    prepTags,
    themeTags,
    systemTags,
    allTags,
  };
}

function getPacketQualityScore(packet: ShowPrepPacket) {
  let score = 0;

  if (packet.sections.researchNotes) score += 3;
  if (packet.sections.editorialNotes) score += 3;
  if (packet.sections.openDecisions) score += 3;
  if (packet.sections.sourceProvenance) score += 3;
  if (packet.sections.episodeNotes) score += 1;
  if (packet.sections.productionNotes) score += 1;
  if (packet.sections.discussionQuestions) score += 1;
  if (packet.confidence) score += 1;

  return score;
}

function dedupeCanonicalPackets(packets: ShowPrepPacket[]) {
  const byKey = new Map<string, ShowPrepPacket>();

  for (const packet of packets) {
    const key = packet.episodeNumber ? `episode-${packet.episodeNumber}` : packet.slug;
    const existing = byKey.get(key);

    if (!existing || getPacketQualityScore(packet) > getPacketQualityScore(existing)) {
      byKey.set(key, packet);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.episodeNumber !== null && right.episodeNumber !== null) {
      return left.episodeNumber - right.episodeNumber;
    }

    if (left.episodeNumber !== null) return -1;
    if (right.episodeNumber !== null) return 1;

    return left.title.localeCompare(right.title);
  });
}

async function readPacketFiles() {
  const entries = await fs.readdir(EPISODE_PACKET_ROOT, { withFileTypes: true });
  const packets: ShowPrepPacket[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packetFile = path.join(EPISODE_PACKET_ROOT, entry.name, "packet.mdx");

    try {
      const raw = await fs.readFile(packetFile, "utf8");
      packets.push(buildPacketRecord(entry.name, raw));
    } catch {
      // A folder without packet.mdx is simply not prep-room-ready yet.
    }
  }

  return packets;
}

async function readSourcePreview(
  absolutePath: string,
  label: string,
): Promise<ShowPrepSourcePreview> {
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    const trimmed = content.trim();

    return {
      label,
      path: toRepoPath(absolutePath),
      status: trimmed ? "present" : "empty",
      preview: previewText(content),
    };
  } catch {
    return {
      label,
      path: toRepoPath(absolutePath),
      status: "missing",
      preview: "",
    };
  }
}

function buildCandidateKey(slug: string, episodeNumber: number | null, title: string) {
  if (episodeNumber !== null) {
    return `episode-${episodeNumber}`;
  }

  if (slug) {
    return `slug-${slug}`;
  }

  return `title-${normalizeForMatch(title)}`;
}

function pickScottStatus(
  scottSource: ShowPrepSourcePreview | null,
  inboxMainSources: ShowPrepSourcePreview[],
) {
  if (scottSource?.status === "present") return "present" as ShowPrepSourceStatus;
  if (scottSource?.status === "empty") return "empty" as ShowPrepSourceStatus;

  const inboxStatus = readSourceStatus(inboxMainSources);
  if (inboxStatus !== "missing") {
    return inboxStatus;
  }

  return "missing" as ShowPrepSourceStatus;
}

async function readStagingCandidates() {
  const entries = await fs.readdir(STAGING_EPISODE_ROOT, { withFileTypes: true });
  const candidates: RawCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const stagingDir = path.join(STAGING_EPISODE_ROOT, entry.name);
    const manifestFile = path.join(stagingDir, "manifest.json");
    let manifest: StagingManifest = {};

    try {
      manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as StagingManifest;
    } catch {
      manifest = {};
    }

    const meta = manifest.meta ?? {};
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const title = String(meta.title || toTitleFromSlug(entry.name));
    const slug = String(meta.slug || entry.name);
    const episodeNumber =
      typeof meta.episodeNumber === "number" ? meta.episodeNumber : null;
    const confidence = String(manifest.confidence || "");
    const needsReview =
      typeof meta.needsReview === "boolean" ? meta.needsReview : null;
    const plannedReleaseDate = String(meta.plannedReleaseDate || "");
    const issues = Array.isArray(manifest.issues)
      ? manifest.issues.filter((issue): issue is string => typeof issue === "string")
      : [];

    const selectedMain = files.find(
      (file) => file.category === "main" && file.selectedAsMain && file.target,
    );
    const scottFallback = path.join(stagingDir, "scott_main.md");
    const scottSource = selectedMain?.target
      ? await readSourcePreview(selectedMain.target, selectedMain.file || "Scott source")
      : await readSourcePreview(scottFallback, "Scott source");

    const charlieTargets = files.filter(
      (file) => file.category === "charlie" && file.target,
    );
    let charlieSources = await Promise.all(
      charlieTargets.map((file) =>
        readSourcePreview(file.target as string, file.file || "Charlie source"),
      ),
    );

    if (!charlieSources.length) {
      const charlieCandidates = [
        path.join(stagingDir, "charlie.md"),
        path.join(stagingDir, "Charlie.md"),
      ];
      const previews = await Promise.all(
        charlieCandidates.map((candidate) => readSourcePreview(candidate, path.basename(candidate))),
      );
      charlieSources = previews.filter((preview) => preview.status !== "missing");
    }

    if (!charlieSources.length && files.some((file) => file.category === "charlie" && file.empty)) {
      charlieSources = [
        {
          label: "Charlie source",
          path: `${STAGING_SOURCE_ROOT}/${entry.name}/Charlie.md`,
          status: "empty",
          preview: "",
        },
      ];
    }

    const researchTargets = files.filter(
      (file) => file.category === "research" && file.target,
    );
    let researchSources = await Promise.all(
      researchTargets.map((file) =>
        readSourcePreview(file.target as string, file.file || "Research source"),
      ),
    );

    if (!researchSources.length) {
      try {
        const researchDir = path.join(stagingDir, "research");
        const researchEntries = await fs.readdir(researchDir);
        researchSources = await Promise.all(
          researchEntries
            .filter((name) => name.toLowerCase().endsWith(".md"))
            .map((name) =>
              readSourcePreview(path.join(researchDir, name), name),
            ),
        );
      } catch {
        researchSources = [];
      }
    }

    const extraTargets = files.filter(
      (file) =>
        (file.category === "junk" || (file.category === "main" && !file.selectedAsMain)) &&
        file.target,
    );
    let extraSources = await Promise.all(
      extraTargets.map((file) =>
        readSourcePreview(file.target as string, file.file || "Extra source"),
      ),
    );

    if (!extraSources.length) {
      try {
        const extrasDir = path.join(stagingDir, "extras");
        const extraEntries = await fs.readdir(extrasDir);
        extraSources = await Promise.all(
          extraEntries
            .filter((name) => name.toLowerCase().endsWith(".md"))
            .map((name) => readSourcePreview(path.join(extrasDir, name), name)),
        );
      } catch {
        extraSources = [];
      }
    }

    candidates.push({
      key: buildCandidateKey(slug, episodeNumber, title),
      slug,
      title,
      episodeNumber,
      stagingPath: `${STAGING_SOURCE_ROOT}/${entry.name}`,
      inboxPath: null,
      manifestPath: toRepoPath(manifestFile),
      confidence,
      needsReview,
      plannedReleaseDate,
      issues,
      scottSource: scottSource.status === "missing" ? null : scottSource,
      charlieSources,
      researchSources,
      extraSources,
      inboxMainSources: [],
    });
  }

  return candidates;
}

function parseInboxFolderMetadata(folderName: string) {
  const match = folderName.match(/^(\d+)\s*-\s*(.+?)\s*-\s*(.+)$/);

  if (!match) {
    return null;
  }

  const episodeNumber = Number(match[1]);
  const title = match[3].trim();
  const slug = normalizeForMatch(title);

  return {
    episodeNumber: Number.isFinite(episodeNumber) ? episodeNumber : null,
    title,
    slug,
  };
}

async function readInboxCandidates() {
  const entries = await fs.readdir(INBOX_EPISODE_ROOT, { withFileTypes: true });
  const candidates: RawCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const parsed = parseInboxFolderMetadata(entry.name);
    if (!parsed) {
      continue;
    }

    const inboxDir = path.join(INBOX_EPISODE_ROOT, entry.name);
    const inboxEntries = await fs.readdir(inboxDir);
    const markdownFiles = inboxEntries.filter((name) => name.toLowerCase().endsWith(".md"));

    const charlieSources = await Promise.all(
      markdownFiles
        .filter((name) => /^charlie/i.test(name))
        .map((name) => readSourcePreview(path.join(inboxDir, name), name)),
    );

    const researchSources = await Promise.all(
      markdownFiles
        .filter((name) => /^research/i.test(name))
        .map((name) => readSourcePreview(path.join(inboxDir, name), name)),
    );

    const mainSources = await Promise.all(
      markdownFiles
        .filter((name) => !/^charlie/i.test(name) && !/^research/i.test(name))
        .map((name) => readSourcePreview(path.join(inboxDir, name), name)),
    );

    candidates.push({
      key: buildCandidateKey(parsed.slug, parsed.episodeNumber, parsed.title),
      slug: parsed.slug,
      title: parsed.title,
      episodeNumber: parsed.episodeNumber,
      stagingPath: null,
      inboxPath: `${INBOX_SOURCE_ROOT}/${entry.name}`,
      manifestPath: null,
      confidence: "",
      needsReview: null,
      plannedReleaseDate: "",
      issues: [],
      scottSource: null,
      charlieSources,
      researchSources,
      extraSources: [],
      inboxMainSources: mainSources,
    });
  }

  return candidates;
}

function mergeRawCandidate(
  existing: RawCandidate | undefined,
  incoming: RawCandidate,
): RawCandidate {
  if (!existing) {
    return incoming;
  }

  const title =
    existing.title !== toTitleFromSlug(existing.slug) ? existing.title : incoming.title;

  return {
    key: existing.key,
    slug: existing.slug || incoming.slug,
    title,
    episodeNumber: existing.episodeNumber ?? incoming.episodeNumber,
    stagingPath: existing.stagingPath ?? incoming.stagingPath,
    inboxPath: existing.inboxPath ?? incoming.inboxPath,
    manifestPath: existing.manifestPath ?? incoming.manifestPath,
    confidence: existing.confidence || incoming.confidence,
    needsReview:
      existing.needsReview !== null ? existing.needsReview : incoming.needsReview,
    plannedReleaseDate: existing.plannedReleaseDate || incoming.plannedReleaseDate,
    issues: Array.from(new Set([...existing.issues, ...incoming.issues])),
    scottSource: existing.scottSource ?? incoming.scottSource,
    charlieSources:
      existing.charlieSources.length > 0
        ? existing.charlieSources
        : incoming.charlieSources,
    researchSources:
      existing.researchSources.length > 0
        ? existing.researchSources
        : incoming.researchSources,
    extraSources:
      existing.extraSources.length > 0 ? existing.extraSources : incoming.extraSources,
    inboxMainSources:
      existing.inboxMainSources.length > 0
        ? existing.inboxMainSources
        : incoming.inboxMainSources,
  };
}

function recommendNextAction(input: {
  hasCanonicalPacket: boolean;
  scottStatus: ShowPrepSourceStatus;
  charlieStatus: ShowPrepSourceStatus;
  researchStatus: ShowPrepSourceStatus;
  extrasStatus: ShowPrepSourceStatus;
  issues: string[];
  hasStaging: boolean;
  hasInbox: boolean;
  hasResearch: boolean;
  hasExtras: boolean;
}) {
  if (input.hasCanonicalPacket) {
    return "Already packeted" as const;
  }

  if (input.scottStatus === "missing") {
    return input.hasResearch || input.hasExtras || input.charlieStatus !== "missing"
      ? ("Needs source cleanup" as const)
      : ("Review source material" as const);
  }

  if (input.issues.length > 0) {
    return "Needs source cleanup" as const;
  }

  if (input.hasStaging && input.hasInbox) {
    return "Create canonical packet" as const;
  }

  if (
    input.scottStatus === "present" &&
    (input.researchStatus !== "missing" || input.charlieStatus !== "missing")
  ) {
    return "Create canonical packet" as const;
  }

  return "Review source material" as const;
}

function buildCandidateSystemTags(input: {
  hasCanonicalPacket: boolean;
  hasScottSource: boolean;
  hasCharlieContent: boolean;
  hasResearch: boolean;
  hasExtras: boolean;
  recommendedNextAction: ShowPrepCandidate["recommendedNextAction"];
}) {
  return Array.from(
    new Set(
      [
        input.hasCanonicalPacket ? "already-packeted" : "needs-packet",
        input.hasScottSource ? "has-scott-source" : "missing-scott-source",
        input.hasCharlieContent
          ? "has-charlie-material"
          : "missing-charlie-material",
        input.hasResearch ? "has-research" : "",
        input.hasExtras ? "has-extras" : "",
        normalizeTagValue(input.recommendedNextAction),
      ].filter(Boolean),
    ),
  );
}

async function buildShowPrepCandidates() {
  const [packets, stagingCandidates, inboxCandidates] = await Promise.all([
    getShowPrepPackets(),
    readStagingCandidates(),
    readInboxCandidates(),
  ]);

  const merged = new Map<string, RawCandidate>();

  for (const candidate of [...stagingCandidates, ...inboxCandidates]) {
    merged.set(candidate.key, mergeRawCandidate(merged.get(candidate.key), candidate));
  }

  const packetByEpisode = new Map<number, ShowPrepPacket>();
  const packetBySlug = new Map<string, ShowPrepPacket>();

  for (const packet of packets) {
    if (packet.episodeNumber !== null) {
      packetByEpisode.set(packet.episodeNumber, packet);
    }
    packetBySlug.set(packet.slug, packet);
  }

  const candidates = Array.from(merged.values()).map((candidate): ShowPrepCandidate => {
    const matchedPacket =
      (candidate.episodeNumber !== null
        ? packetByEpisode.get(candidate.episodeNumber)
        : null) ?? packetBySlug.get(candidate.slug) ?? null;

    const scottStatus = pickScottStatus(candidate.scottSource, candidate.inboxMainSources);
    const charlieStatus = readSourceStatus(candidate.charlieSources);
    const researchStatus = readSourceStatus(candidate.researchSources);
    const extrasStatus = readSourceStatus(candidate.extraSources);
    const hasScottSource = scottStatus === "present";
    const hasCharlieSource = charlieStatus !== "missing";
    const hasCharlieContent = candidate.charlieSources.some(
      (source) => source.status === "present" && hasRealCharlieMaterial(source.preview),
    );
    const hasResearch = researchStatus === "present";
    const hasExtras = extrasStatus !== "missing" || candidate.inboxMainSources.length > 1;
    const recommendedNextAction = recommendNextAction({
      hasCanonicalPacket: Boolean(matchedPacket),
      scottStatus,
      charlieStatus,
      researchStatus,
      extrasStatus,
      issues: candidate.issues,
      hasStaging: Boolean(candidate.stagingPath),
      hasInbox: Boolean(candidate.inboxPath),
      hasResearch,
      hasExtras,
    });
    const systemTags = buildCandidateSystemTags({
      hasCanonicalPacket: Boolean(matchedPacket),
      hasScottSource,
      hasCharlieContent,
      hasResearch,
      hasExtras,
      recommendedNextAction,
    });

    return {
      slug: candidate.slug,
      title: candidate.title,
      episodeNumber: candidate.episodeNumber,
      stagingPath: candidate.stagingPath,
      inboxPath: candidate.inboxPath,
      manifestPath: candidate.manifestPath,
      packetSlug: matchedPacket?.slug ?? null,
      hasCanonicalPacket: Boolean(matchedPacket),
      packetTitle: matchedPacket?.title ?? "",
      packetPath: matchedPacket?.packetPath ?? null,
      confidence: candidate.confidence,
      needsReview: candidate.needsReview,
      plannedReleaseDate: candidate.plannedReleaseDate,
      issues: candidate.issues,
      scottStatus,
      charlieStatus,
      researchStatus,
      extrasStatus,
      hasStaging: Boolean(candidate.stagingPath),
      hasInbox: Boolean(candidate.inboxPath),
      hasScottSource,
      hasCharlieSource,
      hasCharlieContent,
      hasResearch,
      hasExtras,
      recommendedNextAction,
      sourcePaths: [candidate.stagingPath, candidate.inboxPath].filter(
        (value): value is string => Boolean(value),
      ),
      systemTags,
      allTags: [...systemTags],
      scottSource:
        candidate.scottSource?.status !== "missing"
          ? candidate.scottSource
          : candidate.inboxMainSources[0] ?? null,
      charlieSources: candidate.charlieSources,
      researchSources: candidate.researchSources,
      extraSources: [...candidate.extraSources, ...candidate.inboxMainSources.slice(1)],
      inboxMainSources: candidate.inboxMainSources,
    };
  });

  return candidates.sort((left, right) => {
    const packetOrder = Number(left.hasCanonicalPacket) - Number(right.hasCanonicalPacket);
    if (packetOrder !== 0) {
      return packetOrder;
    }

    if (left.episodeNumber !== null && right.episodeNumber !== null) {
      return left.episodeNumber - right.episodeNumber;
    }

    if (left.episodeNumber !== null) return -1;
    if (right.episodeNumber !== null) return 1;

    return left.title.localeCompare(right.title);
  });
}

// What this does:
// The prep room reads packet files directly from disk instead of going through
// the public Fumadocs loader. That keeps internal prep work independent from the
// public episode runtime and from any env flag meant to protect the public site.
export async function getShowPrepPackets() {
  const packets = await readPacketFiles();
  return dedupeCanonicalPackets(packets);
}

export async function getShowPrepPacket(slug: string) {
  const packets = await getShowPrepPackets();
  return packets.find((packet) => packet.slug === slug) ?? null;
}

export function toShowPrepPacketSummary(
  packet: ShowPrepPacket,
): ShowPrepPacketSummary {
  return {
    title: packet.title,
    slug: packet.slug,
    episodeNumber: packet.episodeNumber,
    workflowStatus: packet.workflowStatus,
    publicationStatus: packet.publicationStatus,
    publicTitle: packet.publicTitle,
    publishSlug: packet.publishSlug,
    description: packet.description,
    confidence: packet.confidence,
    packetPath: packet.packetPath,
    hasScottCore: packet.hasScottCore,
    hasCharlieMaterial: packet.hasCharlieMaterial,
    hasResearchNotes: packet.hasResearchNotes,
    hasClipNotes: packet.hasClipNotes,
    hasYouTube: packet.hasYouTube,
    unresolvedQuestionCount: packet.unresolvedQuestionCount,
    prepTags: [...packet.prepTags],
    themeTags: [...packet.themeTags],
    systemTags: [...packet.systemTags],
    allTags: [...packet.allTags],
  };
}

// What this does:
// Potential episodes are inventory. Canonical packets are still the working
// source of truth. This helper scans staging and inbox so the team can see the
// full field of possible episodes without promoting messy source folders into
// the canonical layer by accident.
export async function getShowPrepCandidates() {
  return buildShowPrepCandidates();
}

export async function getShowPrepCandidate(slug: string) {
  const candidates = await getShowPrepCandidates();
  return candidates.find((candidate) => candidate.slug === slug) ?? null;
}

export function toShowPrepCandidateSummary(
  candidate: ShowPrepCandidate,
): ShowPrepCandidateSummary {
  return {
    slug: candidate.slug,
    title: candidate.title,
    episodeNumber: candidate.episodeNumber,
    stagingPath: candidate.stagingPath,
    inboxPath: candidate.inboxPath,
    manifestPath: candidate.manifestPath,
    packetSlug: candidate.packetSlug,
    hasCanonicalPacket: candidate.hasCanonicalPacket,
    packetTitle: candidate.packetTitle,
    confidence: candidate.confidence,
    needsReview: candidate.needsReview,
    scottStatus: candidate.scottStatus,
    charlieStatus: candidate.charlieStatus,
    researchStatus: candidate.researchStatus,
    extrasStatus: candidate.extrasStatus,
    hasStaging: candidate.hasStaging,
    hasInbox: candidate.hasInbox,
    hasScottSource: candidate.hasScottSource,
    hasCharlieContent: candidate.hasCharlieContent,
    hasResearch: candidate.hasResearch,
    hasExtras: candidate.hasExtras,
    recommendedNextAction: candidate.recommendedNextAction,
    sourcePaths: [...candidate.sourcePaths],
    systemTags: [...candidate.systemTags],
    allTags: [...candidate.allTags],
  };
}
