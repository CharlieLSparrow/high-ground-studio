import { access, readFile } from "node:fs/promises";
import path from "node:path";

export type LivingManuscriptFrontmatterValue =
  | string
  | boolean
  | number
  | string[]
  | null;

export type LivingManuscriptFrontmatter = Record<
  string,
  LivingManuscriptFrontmatterValue
>;

export type LivingManuscriptBlock = {
  id: string;
  title: string;
  type: string;
  voice: string;
  status: string;
  chapter: string;
  tags: string[];
  source: string;
  pairsWith: string[];
  quoteRefs: string[];
  notes: string | null;
  body: string;
  wordCount: number;
  order: number;
};

export type LivingManuscriptDocument = {
  sourcePath: string;
  frontmatter: LivingManuscriptFrontmatter;
  title: string | null;
  introNote: string | null;
  blocks: LivingManuscriptBlock[];
};

const MANUSCRIPT_RELATIVE_PATH = [
  "content",
  "books",
  "learning-to-lead",
  "manuscript",
  "learning-to-lead.living.mdx",
] as const;

const FRONTMATTER_BOUNDARY = "---";
const BLOCK_OPEN_TOKEN = "<ManuscriptBlock";
const BLOCK_CLOSE_TOKEN = "</ManuscriptBlock>";

function countWords(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.split(" ").length : 0;
}

function normalizeBlockBody(value: string) {
  return value.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function parseScalarValue(rawValue: string): LivingManuscriptFrontmatterValue {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map(String) : trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function parseFrontmatter(source: string) {
  if (
    !source.startsWith(`${FRONTMATTER_BOUNDARY}\n`) &&
    !source.startsWith(`${FRONTMATTER_BOUNDARY}\r\n`)
  ) {
    return {
      frontmatter: {} as LivingManuscriptFrontmatter,
      body: source,
    };
  }

  const lines = source.split(/\r?\n/);
  const frontmatter: LivingManuscriptFrontmatter = {};
  let index = 1;

  while (index < lines.length) {
    const line = lines[index];

    if (line === FRONTMATTER_BOUNDARY) {
      index += 1;
      break;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!match) {
      index += 1;
      continue;
    }

    const [, key, rawValue] = match;

    if (rawValue.trim() === "") {
      const items: string[] = [];
      let lookahead = index + 1;

      while (lookahead < lines.length) {
        const nextLine = lines[lookahead];
        const itemMatch = nextLine.match(/^\s*-\s+(.*)$/);

        if (!itemMatch) {
          break;
        }

        items.push(String(parseScalarValue(itemMatch[1])));
        lookahead += 1;
      }

      frontmatter[key] = items;
      index = lookahead;
      continue;
    }

    frontmatter[key] = parseScalarValue(rawValue);
    index += 1;
  }

  return {
    frontmatter,
    body: lines.slice(index).join("\n"),
  };
}

function stripHtmlComments(value: string) {
  return value.replace(/<!--([\s\S]*?)-->/g, "").trim();
}

function extractIntroNote(value: string) {
  const withoutComments = stripHtmlComments(value);

  if (!withoutComments) {
    return null;
  }

  const withoutHeading = withoutComments.replace(/^#\s+.+$/m, "").trim();

  if (!withoutHeading) {
    return null;
  }

  return withoutHeading.replace(/^>\s?/gm, "").trim();
}

function readStringProp(openingTag: string, prop: string) {
  const match = openingTag.match(
    new RegExp(`${prop}\\s*=\\s*"([^"]*)"`, "m"),
  );

  return match?.[1]?.trim() ?? "";
}

function readArrayProp(openingTag: string, prop: string) {
  const match = openingTag.match(
    new RegExp(`${prop}\\s*=\\s*\\{\\s*(\\[[\\s\\S]*?\\])\\s*\\}`, "m"),
  );

  if (!match) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    throw new Error(`Unable to parse ${prop} array on ManuscriptBlock.`);
  }
}

function findOpeningTagEnd(source: string, startIndex: number) {
  let quote: '"' | "'" | null = null;
  let braceDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (character === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "{") {
      braceDepth += 1;
      continue;
    }

    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (character === ">" && braceDepth === 0) {
      return index;
    }
  }

  return -1;
}

function validateRequiredProps(block: LivingManuscriptBlock) {
  const requiredStringFields: Array<keyof LivingManuscriptBlock> = [
    "id",
    "title",
    "type",
    "voice",
    "status",
    "chapter",
    "source",
  ];

  for (const field of requiredStringFields) {
    const value = block[field];

    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`ManuscriptBlock is missing required field: ${field}`);
    }
  }

  if (!Array.isArray(block.tags)) {
    throw new Error(`ManuscriptBlock ${block.id || "<unknown>"} is missing tags.`);
  }
}

function validateUniqueIds(blocks: LivingManuscriptBlock[]) {
  const seen = new Set<string>();

  for (const block of blocks) {
    if (seen.has(block.id)) {
      throw new Error(`Duplicate ManuscriptBlock id found: ${block.id}`);
    }

    seen.add(block.id);
  }
}

function parseBlocks(body: string) {
  const blocks: LivingManuscriptBlock[] = [];
  let cursor = 0;
  let order = 0;

  while (cursor < body.length) {
    const startIndex = body.indexOf(BLOCK_OPEN_TOKEN, cursor);

    if (startIndex === -1) {
      break;
    }

    const openingTagEnd = findOpeningTagEnd(
      body,
      startIndex + BLOCK_OPEN_TOKEN.length,
    );

    if (openingTagEnd === -1) {
      throw new Error("Unclosed ManuscriptBlock opening tag.");
    }

    const closingTagIndex = body.indexOf(BLOCK_CLOSE_TOKEN, openingTagEnd + 1);

    if (closingTagIndex === -1) {
      throw new Error("Unclosed ManuscriptBlock body.");
    }

    const openingTag = body.slice(startIndex, openingTagEnd + 1);
    const rawBody = body.slice(openingTagEnd + 1, closingTagIndex);
    const normalizedBody = normalizeBlockBody(rawBody);

    const block: LivingManuscriptBlock = {
      id: readStringProp(openingTag, "id"),
      title: readStringProp(openingTag, "title"),
      type: readStringProp(openingTag, "type"),
      voice: readStringProp(openingTag, "voice"),
      status: readStringProp(openingTag, "status"),
      chapter: readStringProp(openingTag, "chapter"),
      source: readStringProp(openingTag, "source"),
      tags: readArrayProp(openingTag, "tags"),
      pairsWith: readArrayProp(openingTag, "pairsWith"),
      quoteRefs: readArrayProp(openingTag, "quoteRefs"),
      notes: readStringProp(openingTag, "notes") || null,
      body: normalizedBody,
      wordCount: countWords(normalizedBody),
      order,
    };

    validateRequiredProps(block);
    blocks.push(block);

    order += 1;
    cursor = closingTagIndex + BLOCK_CLOSE_TOKEN.length;
  }

  validateUniqueIds(blocks);

  return blocks;
}

async function resolveManuscriptPath() {
  const directPath = path.join(process.cwd(), ...MANUSCRIPT_RELATIVE_PATH);
  const repoPath = path.join(process.cwd(), "apps", "web", ...MANUSCRIPT_RELATIVE_PATH);

  for (const candidate of [directPath, repoPath]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next likely location.
    }
  }

  throw new Error("Unable to locate learning-to-lead.living.mdx.");
}

export async function getLearningToLeadManuscript(): Promise<LivingManuscriptDocument> {
  const sourcePath = await resolveManuscriptPath();
  const rawSource = await readFile(sourcePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(rawSource);
  const firstBlockIndex = body.indexOf(BLOCK_OPEN_TOKEN);
  const leadingContent = firstBlockIndex >= 0 ? body.slice(0, firstBlockIndex) : body;
  const blocks = parseBlocks(body);

  return {
    sourcePath,
    frontmatter,
    title: typeof frontmatter.title === "string" ? frontmatter.title : null,
    introNote: extractIntroNote(leadingContent),
    blocks,
  };
}
