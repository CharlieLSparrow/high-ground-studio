#!/usr/bin/env node

/**
 * High Ground Studio Content Pipeline - CLI Publishing Runner
 * 
 * Usage:
 *   node scripts/publish-packet.mjs <path-to-packet.json> [options]
 * 
 * Options:
 *   --target=<app-override>     Force target app (e.g. ai-hub, photography-hub, video-hub, hgo, quiplore)
 *   --status=<draft|published>  Force output status (draft goes to staging/draft folders, published goes to live/public folders)
 *   --verbose                   Enable verbose logging
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, "..");

// Stylized terminal logging
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

const logger = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${colors.bold}${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg, err) => {
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`);
    if (err) console.error(err);
  },
  header: (msg) => console.log(`\n${colors.magenta}${colors.bold}=== ${msg} ===${colors.reset}\n`),
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    packetPath: null,
    target: null,
    status: null,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1].trim();
    } else if (arg.startsWith("--status=")) {
      options.status = arg.split("=")[1].trim();
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (!arg.startsWith("-") && !options.packetPath) {
      options.packetPath = arg;
    }
  }

  return options;
}

function yamlScalar(value) {
  if (value === undefined || value === null) return '""';
  // If it's a simple alphanumeric string, return it as is or double-quoted
  const str = String(value).trim();
  return JSON.stringify(str);
}

function yamlStringList(values) {
  if (!values || !values.length) {
    return "[]";
  }
  return `\n${values.map((value) => `  - ${yamlScalar(value)}`).join("\n")}`;
}

function mdxList(values) {
  if (!values || !values.length) {
    return "- None recorded.";
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function buildMdxFromHgoProjection(projection, frontmatter) {
  const frontmatterText = [
    "---",
    `title: ${yamlScalar(frontmatter.title || projection.title)}`,
    `subtitle: ${yamlScalar(frontmatter.subtitle || projection.subtitle)}`,
    `description: ${yamlScalar(frontmatter.description || projection.summary)}`,
    `contentType: ${yamlScalar(frontmatter.contentType || "episode")}`,
    `project: ${yamlScalar(frontmatter.project || "high-ground-odyssey")}`,
    `series: ${yamlScalar(frontmatter.series || "high-ground-odyssey")}`,
    `episodeNumber: ${yamlScalar(frontmatter.episodeNumber || projection.episodeNumber)}`,
    `access: ${yamlScalar(frontmatter.access || "public")}`,
    `status: ${yamlScalar(frontmatter.status || "published")}`,
    `date: ${yamlScalar(frontmatter.date || new Date().toISOString().split("T")[0])}`,
    `category: ${yamlScalar(frontmatter.category || "General")}`,
    `author: ${yamlScalar(frontmatter.author || "Charlie")}`,
    `scopes: ${yamlStringList(frontmatter.scopes || projection.scopes || [])}`,
    "---",
  ].join("\n");

  const beats = (projection.beats || []).map(
    (beat) =>
      `### ${beat.title}\n\n${beat.summary}\n\nScope: \`${beat.scope}\`${
        beat.timingHint ? `\n\nTiming: ${beat.timingHint}` : ""
      }`,
  );
  const voiceCards = (projection.voiceCards || []).map(
    (card) => `- **${card.speaker}:** ${card.summary}`,
  );
  const pullQuotes = (projection.pullQuotes || []).map(
    (quote) =>
      `- "${quote.text}" - ${quote.attribution} (\`${quote.citationState || "needs-review"}\`)`,
  );
  const sourceNotes = (projection.sourceNotes || []).map(
    (note) => `- **${note.label}:** ${note.detail} (\`${note.status || "needs-review"}\`)`,
  );
  const backstageNotes = (projection.backstageNotes || []).map(
    (note) => `- **${note.label}:** ${note.note}`,
  );

  return [
    frontmatterText,
    "",
    `# ${projection.title}`,
    "",
    projection.summary || "",
    "",
    "## Public Promise",
    "",
    projection.thesis || "",
    "",
    "## Episode Beats",
    "",
    beats.length ? beats.join("\n\n") : "No beats recorded.",
    "",
    "## Voice Cards",
    "",
    mdxList(voiceCards),
    "",
    "## Pull Quotes",
    "",
    mdxList(pullQuotes),
    "",
    "## Source Notes",
    "",
    mdxList(sourceNotes),
    "",
    "## Backstage Notes",
    "",
    mdxList(backstageNotes),
    "",
  ].join("\n");
}

function buildMdxFromStandardArticle(article) {
  const dateStr = article.publishedAt || article.date || new Date().toISOString().split("T")[0];
  const tagsList = Array.isArray(article.tags) ? article.tags : [];
  
  const frontmatterText = [
    "---",
    `title: ${yamlScalar(article.title)}`,
    `subtitle: ${yamlScalar(article.subtitle || "")}`,
    `description: ${yamlScalar(article.description || "")}`,
    `category: ${yamlScalar(article.category || "General")}`,
    `date: ${yamlScalar(dateStr)}`,
    `author: ${yamlScalar(article.author || "Charlie")}`,
    `readTime: ${yamlScalar(article.readTime || "5 min read")}`,
    `status: ${yamlScalar(article.status || "published")}`,
    `tags: ${yamlStringList(tagsList)}`,
    "---",
  ].join("\n");

  return [
    frontmatterText,
    "",
    article.body || `# ${article.title}\n\nContent pending compilation.`,
  ].join("\n");
}

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function main() {
  logger.header("High Ground Content Pipeline");

  const options = parseArgs();

  if (!options.packetPath) {
    logger.error("No publishing packet file specified.");
    console.log(`
Usage:
  node scripts/publish-packet.mjs <path-to-packet.json> [options]

Options:
  --target=<app-override>     Force target app (e.g. ai-hub, photography-hub, video-hub, hgo, quiplore)
  --status=<draft|published>  Force output status (draft goes to staging, published to public)
  --verbose                   Enable verbose logging
    `);
    process.exit(1);
  }

  const fullPacketPath = path.resolve(monorepoRoot, options.packetPath);
  if (!fs.existsSync(fullPacketPath)) {
    logger.error(`Publishing packet file not found at: ${fullPacketPath}`);
    process.exit(1);
  }

  logger.info(`Reading publishing packet: ${options.packetPath}`);
  let rawData;
  try {
    rawData = fs.readFileSync(fullPacketPath, "utf-8");
  } catch (err) {
    logger.error("Failed to read the packet file.", err);
    process.exit(1);
  }

  let packet;
  try {
    packet = JSON.parse(rawData);
  } catch (err) {
    logger.error("Failed to parse packet file as JSON. Ensure it is valid JSON format.", err);
    process.exit(1);
  }

  if (options.verbose) {
    console.log("Parsed packet metadata:", {
      kind: packet.kind || packet.packetKind,
      projectKind: packet.projectKind,
      workflow: packet.workflow,
      target: packet.target,
    });
  }

  // Determine Target Site & Status
  let targetSite = options.target || packet.target;
  let status = options.status || packet.status || "published";

  // Fallbacks if target is missing but we can infer it
  if (!targetSite) {
    if (packet.kind === "high-ground-content-studio-production-packet" || packet.packetKind === "hgo-episode-publish-draft-v1") {
      targetSite = "hgo";
    } else if (packet.workflow === "podcast-production" || packet.workflow === "hgo-episode-page") {
      targetSite = "hgo";
    }
  }

  if (!targetSite) {
    logger.warn("Target site not specified in packet or arguments. Defaulting to 'hgo' (High Ground Odyssey).");
    targetSite = "hgo";
  }

  targetSite = targetSite.toLowerCase().trim();
  status = status.toLowerCase().trim();

  logger.info(`Target Site identified: ${colors.magenta}${targetSite}${colors.reset}`);
  logger.info(`Publication Status: ${colors.yellow}${status}${colors.reset}`);

  let destinationPath = "";
  let fileContent = "";
  let slug = packet.slug || "";

  if (!slug) {
    const titleVal = packet.title || (packet.hgoProjectionDraft && packet.hgoProjectionDraft.title) || (packet.episodePage && packet.episodePage.slug) || "untitled-post";
    slug = titleVal
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9/-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // Normalize HGO/web targets
  if (targetSite === "web") targetSite = "hgo";

  if (targetSite === "hgo") {
    // High Ground Odyssey MDX compilation
    let projection = packet.hgoProjectionDraft || packet.projection || packet;
    let frontmatter = packet.frontmatter || {};

    if (packet.draftPacketJson && packet.draftPacketJson.hgoProjectionDraft) {
      projection = packet.draftPacketJson.hgoProjectionDraft;
    }
    if (packet.draftPacketJson && packet.draftPacketJson.frontmatter) {
      frontmatter = packet.draftPacketJson.frontmatter;
    }

    if (!projection.title) {
      projection.title = packet.projectTitle || "High Ground Odyssey Episode";
    }

    // Build the HGO specific MDX
    fileContent = buildMdxFromHgoProjection(projection, frontmatter);

    if (status === "draft") {
      destinationPath = path.join(monorepoRoot, "apps/web/content/_staging/hgo", `${slug}.mdx`);
    } else {
      destinationPath = path.join(monorepoRoot, "apps/web/content/publish", `${slug}.mdx`);
    }
  } 
  else if (["ai-hub", "photography-hub", "video-hub"].includes(targetSite)) {
    // Niche Portal MDX compilation
    const article = packet.article || packet;
    if (!article.title) {
      article.title = packet.projectTitle || `Article for ${targetSite}`;
    }

    fileContent = buildMdxFromStandardArticle(article);
    destinationPath = path.join(monorepoRoot, `apps/${targetSite}/src/content`, `${slug}.mdx`);
  } 
  else if (targetSite === "quiplore") {
    // QuipLore Data packet
    destinationPath = path.join(monorepoRoot, "apps/quiplore/src/data", `${slug}.json`);
    fileContent = JSON.stringify(packet, null, 2);
  } 
  else {
    logger.error(`Unsupported target site: '${targetSite}'`);
    process.exit(1);
  }

  logger.info(`Destination file: ${destinationPath}`);
  try {
    ensureDirectoryExistence(destinationPath);
    fs.writeFileSync(destinationPath, fileContent, "utf-8");
    logger.success(`Successfully published packet to: ${destinationPath}`);
  } catch (err) {
    logger.error("Failed to write the published content to disk.", err);
    process.exit(1);
  }
}

main();
