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
};

const EPISODE_PACKET_ROOT = path.join(
  process.cwd(),
  "content",
  "episodes",
  "learning-to-lead",
);

const SOURCE_ROOT = "apps/web/content/episodes/learning-to-lead";

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

function buildPacketRecord(packetDirName: string, raw: string): ShowPrepPacket {
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsedSections = parseSections(body);
  const sections = Object.create(null) as Record<ShowPrepSectionKey, string>;
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
    packetPath: `${SOURCE_ROOT}/${packetDirName}/packet.mdx`,
    packetDirName,
    frontmatter,
    sectionHeadings,
    sections,
    additionalSections,
    hasScottCore: Boolean(sections.scottCore?.trim()),
    hasCharlieMaterial: hasRealCharlieMaterial(sections.charlieSection || ""),
    hasResearchNotes: Boolean(
      sections.researchNotes?.trim() || sections.episodeNotes?.trim(),
    ),
    hasClipNotes: Boolean(sections.clipNotes?.trim() || sections.clipIdeas?.trim()),
    hasYouTube: Boolean(youtube.trim()),
    unresolvedQuestionCount: countBulletItems(sections.openDecisions || ""),
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
    const key = packet.episodeNumber
      ? `episode-${packet.episodeNumber}`
      : packet.slug;
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
