import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const publishDir = path.join(repoRoot, "apps/web/content/publish");
const siteFile = path.join(repoRoot, "apps/web/src/lib/site.ts");
const readingFile = path.join(repoRoot, "apps/web/src/lib/reading.ts");

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    }),
  );

  return files.flat();
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return {};
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return {};
  }

  const frontmatter = content.slice(4, end).split("\n");
  const result = {};

  for (const line of frontmatter) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    result[key] = value;
  }

  return result;
}

function routeFromRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");

  if (normalized === "index.mdx" || normalized === "meta.json") {
    return null;
  }

  if (normalized.startsWith("book/")) {
    const slug = normalized.slice("book/".length).replace(/\.mdx$/, "");
    return `/episodes/book/${slug}`;
  }

  return `/episodes/${normalized.replace(/\.mdx$/, "")}`;
}

function extractArrayBody(fileContent, exportName) {
  const regex = new RegExp(
    `export const ${exportName}[\\s\\S]*?= \\[(?<body>[\\s\\S]*?)\\n\\];`,
  );
  const match = fileContent.match(regex);
  return match?.groups?.body ?? "";
}

function parseMetadataEntries(fileContent, exportName) {
  const body = extractArrayBody(fileContent, exportName);
  const entries = [];
  const entryRegex = /{\s*title:\s*"([^"]+)"([\s\S]*?)\n\s*},?/g;
  let match;

  while ((match = entryRegex.exec(body)) !== null) {
    const title = match[1];
    const block = match[0];
    const href = block.match(/href:\s*"([^"]+)"/)?.[1] ?? null;
    const pairingId = block.match(/pairingId:\s*"([^"]+)"/)?.[1] ?? null;

    if (!href) continue;

    entries.push({
      title,
      href,
      pairingId,
    });
  }

  return entries;
}

function toMap(items) {
  return new Map(items.map((item) => [item.href ?? item.route, item]));
}

function formatList(title, lines) {
  if (lines.length === 0) {
    return `${title}\n  none\n`;
  }

  return `${title}\n${lines.map((line) => `  - ${line}`).join("\n")}\n`;
}

async function main() {
  const publishFiles = (await walk(publishDir))
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".json"))
    .sort();

  const publishRecords = [];

  for (const file of publishFiles) {
    if (!file.endsWith(".mdx")) continue;

    const relativePath = path.relative(publishDir, file);
    const content = await fs.readFile(file, "utf8");
    const frontmatter = parseFrontmatter(content);
    const route = routeFromRelativePath(relativePath);

    if (!route) continue;

    publishRecords.push({
      relativePath: relativePath.replace(/\\/g, "/"),
      route,
      title: typeof frontmatter.title === "string" ? frontmatter.title : null,
      pairingId:
        typeof frontmatter.pairingId === "string" ? frontmatter.pairingId : null,
      contentType:
        typeof frontmatter.contentType === "string" ? frontmatter.contentType : null,
    });
  }

  const episodePages = publishRecords.filter(
    (record) =>
      !record.relativePath.startsWith("book/") &&
      record.contentType === "episode",
  );

  const readingPages = publishRecords.filter((record) =>
    record.relativePath.startsWith("book/"),
  );

  const additionalPublishedFiles = publishRecords.filter(
    (record) =>
      !record.relativePath.startsWith("book/") &&
      record.contentType !== "episode",
  );

  const siteContent = await fs.readFile(siteFile, "utf8");
  const readingContent = await fs.readFile(readingFile, "utf8");

  const episodeDiscoveryEntries = parseMetadataEntries(siteContent, "episodes");
  const readingDiscoveryEntries = parseMetadataEntries(readingContent, "bookSections");

  const episodePageMap = new Map(episodePages.map((record) => [record.route, record]));
  const readingPageMap = new Map(readingPages.map((record) => [record.route, record]));
  const episodeDiscoveryMap = toMap(episodeDiscoveryEntries);
  const readingDiscoveryMap = toMap(readingDiscoveryEntries);

  const hardProblems = [];

  const episodePagesMissingDiscovery = episodePages
    .filter((record) => !episodeDiscoveryMap.has(record.route))
    .map((record) => `${record.route} (${record.relativePath})`);

  const readingPagesMissingDiscovery = readingPages
    .filter((record) => !readingDiscoveryMap.has(record.route))
    .map((record) => `${record.route} (${record.relativePath})`);

  const episodeDiscoveryMissingPublished = episodeDiscoveryEntries
    .filter((entry) => !episodePageMap.has(entry.href))
    .map((entry) => `${entry.href} (site.ts: ${entry.title})`);

  const readingDiscoveryMissingPublished = readingDiscoveryEntries
    .filter((entry) => !readingPageMap.has(entry.href))
    .map((entry) => `${entry.href} (reading.ts: ${entry.title})`);

  const episodePairingMismatches = episodeDiscoveryEntries
    .map((entry) => {
      const page = episodePageMap.get(entry.href);
      if (!page || !page.pairingId || !entry.pairingId) return null;
      if (page.pairingId === entry.pairingId) return null;
      return `${entry.href} (publish: ${page.pairingId}, site.ts: ${entry.pairingId})`;
    })
    .filter(Boolean);

  const readingPairingMismatches = readingDiscoveryEntries
    .map((entry) => {
      const page = readingPageMap.get(entry.href);
      if (!page || !page.pairingId || !entry.pairingId) return null;
      if (page.pairingId === entry.pairingId) return null;
      return `${entry.href} (publish: ${page.pairingId}, reading.ts: ${entry.pairingId})`;
    })
    .filter(Boolean);

  hardProblems.push(
    ...episodePagesMissingDiscovery,
    ...readingPagesMissingDiscovery,
    ...episodeDiscoveryMissingPublished,
    ...readingDiscoveryMissingPublished,
    ...episodePairingMismatches,
    ...readingPairingMismatches,
  );

  const sections = [
    formatList("Published episode pages missing discovery entries:", episodePagesMissingDiscovery),
    formatList("Published reading pages missing discovery entries:", readingPagesMissingDiscovery),
    formatList("Episode discovery hrefs missing published pages:", episodeDiscoveryMissingPublished),
    formatList("Reading discovery hrefs missing published pages:", readingDiscoveryMissingPublished),
    formatList("Episode pairingId mismatches:", episodePairingMismatches),
    formatList("Reading pairingId mismatches:", readingPairingMismatches),
    formatList(
      "Additional published files not part of the current canonical discovery comparison:",
      additionalPublishedFiles.map(
        (record) =>
          `${record.route} (${record.relativePath}${record.contentType ? `, contentType=${record.contentType}` : ""})`,
      ),
    ),
  ];

  console.log("Published Discovery Verification\n");
  console.log(`Published episode pages checked: ${episodePages.length}`);
  console.log(`Published reading pages checked: ${readingPages.length}`);
  console.log(`Episode discovery entries checked: ${episodeDiscoveryEntries.length}`);
  console.log(`Reading discovery entries checked: ${readingDiscoveryEntries.length}\n`);
  console.log(sections.join("\n"));

  if (hardProblems.length > 0) {
    console.error("Verification failed: one or more likely alignment mismatches were found.");
    process.exit(1);
  }

  console.log("Verification passed: no likely published/discovery alignment mismatches found.");
}

main().catch((error) => {
  console.error("Verification failed with an unexpected error.");
  console.error(error);
  process.exit(1);
});
