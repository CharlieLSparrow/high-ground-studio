#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_STORY_PATH = "apps/web/content/internal/progress-story.json";

function printHelp() {
  console.log(`Add an entry to the public build journal.

Usage:
  pnpm progress:story:add -- --title "Title" --summary "Short summary" [options]

Options:
  --body "Paragraph"       Add a body paragraph. Repeat for multiple paragraphs.
  --commit "sha=Label"     Add a commit chip. Defaults to current HEAD.
  --date YYYY-MM-DD        Entry date. Defaults to today.
  --dry-run                Print the entry JSON without writing.
  --file PATH              Progress story JSON path.
  --id slug                Stable entry id. Defaults from date + title.
  --kicker "Short text"    Small label above the entry title.
  --link "Label=href"      Add a trail link. Repeat for multiple links.
  --mood "Short mood"      Short mood label.
  --replace                Replace an existing entry with the same id.
  --tag "Tag"              Add a tag. Repeat for multiple tags.

Example:
  pnpm progress:story:add -- \\
    --title "The build journal is live" \\
    --summary "The public updates page now shows readable progress." \\
    --body "Homer, Mako, and Melissa can follow the work without terminal logs." \\
    --tag Updates \\
    --link "Build updates=https://app.highgroundodyssey.com/updates"
`);
}

function parseArgs(argv) {
  const options = {
    body: [],
    commits: [],
    dryRun: false,
    file: DEFAULT_STORY_PATH,
    links: [],
    replace: false,
    tags: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--replace") {
      options.replace = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--body":
        options.body.push(nextValue());
        break;
      case "--commit":
        options.commits.push(parsePair(nextValue(), "commit"));
        break;
      case "--date":
        options.date = nextValue();
        break;
      case "--file":
        options.file = nextValue();
        break;
      case "--id":
        options.id = nextValue();
        break;
      case "--kicker":
        options.kicker = nextValue();
        break;
      case "--link":
        options.links.push(parsePair(nextValue(), "link"));
        break;
      case "--mood":
        options.mood = nextValue();
        break;
      case "--summary":
        options.summary = nextValue();
        break;
      case "--tag":
        options.tags.push(nextValue());
        break;
      case "--title":
        options.title = nextValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parsePair(value, label) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`--${label} must use "left=right" format.`);
  }

  const left = value.slice(0, separatorIndex).trim();
  const right = value.slice(separatorIndex + 1).trim();
  if (!left || !right) {
    throw new Error(`--${label} must include both sides of "left=right".`);
  }

  return { left, right };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getGitValue(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function defaultCommit() {
  const sha = getGitValue(["rev-parse", "--short", "HEAD"]);
  const label = getGitValue(["log", "-1", "--pretty=%s"]);

  if (!sha || !label) {
    throw new Error("Could not read the current git commit. Pass --commit.");
  }

  return { sha, label };
}

function assertStoryShape(story) {
  if (
    !story ||
    typeof story !== "object" ||
    typeof story.updatedAt !== "string" ||
    typeof story.intro !== "string" ||
    !Array.isArray(story.entries)
  ) {
    throw new Error("Progress story JSON is malformed.");
  }
}

function createEntry(options) {
  if (!options.title) {
    throw new Error("--title is required.");
  }

  if (!options.summary) {
    throw new Error("--summary is required.");
  }

  const now = new Date();
  const date = options.date || now.toISOString().slice(0, 10);
  const id = options.id || `${date}-${slugify(options.title)}`;
  const commits =
    options.commits.length > 0
      ? options.commits.map(({ left, right }) => ({ sha: left, label: right }))
      : [defaultCommit()];

  return {
    id,
    date,
    title: options.title,
    kicker: options.kicker || "Progress update",
    mood: options.mood || "Shipped and traceable",
    summary: options.summary,
    body: options.body.length > 0 ? options.body : [options.summary],
    commits,
    links: options.links.map(({ left, right }) => ({ label: left, href: right })),
    tags: options.tags.length > 0 ? options.tags : ["Progress"],
  };
}

function formatStory(story) {
  return `${JSON.stringify(story, null, 2).replace(
    /\n {6}"tags": \[\n((?: {8}"(?:[^"\\]|\\.)*",?\n)+) {6}\]/g,
    (match, tagLines) => {
      const tags = tagLines
        .trim()
        .split("\n")
        .map((line) => line.trim().replace(/,$/, ""))
        .join(", ");

      return `\n      "tags": [${tags}]`;
    },
  )}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const entry = createEntry(options);

  if (options.dryRun) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  const story = JSON.parse(readFileSync(options.file, "utf8"));
  assertStoryShape(story);

  const existingEntry = story.entries.find((item) => item.id === entry.id);
  if (existingEntry && !options.replace) {
    throw new Error(
      `Progress story already has entry id "${entry.id}". Pass --replace to update it.`,
    );
  }

  const nextEntries = story.entries.filter((item) => item.id !== entry.id);
  story.updatedAt = new Date().toISOString();
  story.entries = [entry, ...nextEntries];

  writeFileSync(options.file, formatStory(story));
  console.log(`Added progress story entry: ${entry.id}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
