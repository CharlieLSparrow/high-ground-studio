import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

// What this file does:
// This is the persistence layer for the internal kanban board, and it is
// intentionally gloriously small. The board lives in JSON on disk, and this
// file is the clerk that reads, normalizes, sorts, and rewrites that ledger.
//
// Why this matters:
// Not every planning tool deserves a database, optimistic concurrency, and a
// minor religious schism about event sourcing. Right now the board is a shared
// corkboard, not a kingdom. File-backed state is enough, and "enough" is a
// very respectable engineering word.
//
// Best practice (the "textbook" version):
// Multi-user planning tools usually end up with:
// - transactional storage
// - optimistic locking or row versioning
// - edit history
// - access audit
// - richer querying
//
// What we are doing instead (and why):
// A file-backed ledger because the board is internal, low-volume, and used by a
// small trusted team. The complexity budget is better spent on the product and
// content engine than on building tiny Jira in a waistcoat.
//
// Tradeoff:
// We gain immediate usefulness and extreme inspectability.
// We sacrifice concurrency guarantees, granular history, and fancy querying.
//
// Question for Future Charlie:
// Is "just use JSON" a hack?
//
// Answer:
// Sometimes. Here it is a deliberate scope choice. A hack is usually a thing
// pretending to be permanent. This file is quite open about being temporary if
// the pressure changes.
//
// First assumption that breaks:
// "One person at a time will usually be editing the board."
//
// Source of truth:
// The JSON file is canonical. The UI is merely a window with opinions.
//
// What it looks like now:
// One board file, whole-file reads and writes, straightforward normalization,
// and modest card volume.
//
// What it turns into later:
// Possibly a database or append-only event model once concurrency, history, or
// richer querying become real pain instead of hypothetical theater.
//
// Signal to evolve it:
// Frequent write collisions, need for per-card edit history, painful grep-based
// analytics, or board size large enough that whole-file rewrites feel silly.
//
// Footnote:
// A database is a grand marble archive. This board is a well-kept corkboard in
// the war room. You do not pour foundations for a palace when what you need is
// a wall, a pin, and the humility to revisit the decision later.
export const KANBAN_STATUSES = [
  "backlog",
  "todo",
  "doing",
  "done",
] as const;

export const KANBAN_PRIORITIES = ["low", "medium", "high"] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number];

export type KanbanLink = {
  label: string;
  href: string;
};

export type KanbanCard = {
  id: string;
  title: string;
  status: KanbanStatus;
  type: string;
  area: string;
  priority: KanbanPriority;
  owner: string;
  summary: string;
  nextStep: string;
  links: KanbanLink[];
  tags: string[];
  updatedAt: string;
};

export type KanbanBoard = {
  updatedAt: string;
  cards: KanbanCard[];
};

export type CreateKanbanCardInput = {
  title: string;
  status: KanbanStatus;
  type: string;
  area: string;
  priority: KanbanPriority;
  owner: string;
  summary: string;
  nextStep: string;
  tags: string[];
  links: KanbanLink[];
};

// Future Chuck note:
// process.cwd() resolves relative to the running web app, so this lands on
// apps/web/content/internal/kanban/board.json in normal local usage.
//
// Smell test:
// If this path ever starts feeling mysterious, the real problem is probably not
// the path. It is that the source of truth stopped being obvious.
const boardFilePath = path.join(
  process.cwd(),
  "content",
  "internal",
  "kanban",
  "board.json",
);

// Sorting rule:
// urgent things float upward, then newer edits break ties. This keeps the board
// useful without pretending we have a full prioritization science department.
const priorityRank: Record<KanbanPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function isKanbanStatus(value: string): value is KanbanStatus {
  return KANBAN_STATUSES.includes(value as KanbanStatus);
}

function isKanbanPriority(value: string): value is KanbanPriority {
  return KANBAN_PRIORITIES.includes(value as KanbanPriority);
}

// Normalization is doing the tedious but holy work of taking messy human input
// and producing a predictable in-memory shape before anything else reasons
// about it.
//
// Best practice (the "textbook" version):
// Validate at boundaries. Always. Even when the boundary is "our own JSON."
function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Tags are kept unique because repeated labels teach no one anything except
// that entropy is patient.
function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

// Links are permissive by design: route, URL, or plain repo path. The UI can
// decide later how best to display each one.
function normalizeLinks(value: unknown): KanbanLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const label = normalizeString((entry as { label?: unknown }).label);
      const href = normalizeString((entry as { href?: unknown }).href);

      if (!label || !href) {
        return null;
      }

      return { label, href };
    })
    .filter((entry): entry is KanbanLink => Boolean(entry));
}

// What this does:
// Converts unknown JSON into a trusted KanbanCard shape or drops it.
//
// Why this matters:
// JSON files are editable by humans and AI, which is excellent for velocity and
// terrible for assuming perfect structure. This function is the customs desk.
// Malformed luggage does not board the train.
//
// What we are doing instead (and why):
// Soft normalization with invalid-card dropping, not a hard schema crash.
// That keeps the board usable even if one card is malformed.
//
// Tradeoff:
// We gain resilience.
// We sacrifice immediate loudness about bad data.
//
// Signal to evolve it:
// If silent dropping becomes risky, add explicit validation reporting rather
// than letting malformed cards vanish like suspicious uncles at tax time.
function normalizeCard(value: unknown): KanbanCard | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const title = normalizeString(record.title);
  const statusValue = normalizeString(record.status);
  const priorityValue = normalizeString(record.priority);
  const updatedAt = normalizeString(record.updatedAt);

  if (!id || !title || !isKanbanStatus(statusValue)) {
    return null;
  }

  return {
    id,
    title,
    status: statusValue,
    type: normalizeString(record.type) || "task",
    area: normalizeString(record.area) || "general",
    priority: isKanbanPriority(priorityValue) ? priorityValue : "medium",
    owner: normalizeString(record.owner),
    summary: normalizeString(record.summary),
    nextStep: normalizeString(record.nextStep),
    links: normalizeLinks(record.links),
    tags: normalizeTags(record.tags),
    updatedAt: updatedAt || new Date(0).toISOString(),
  };
}

// A board is more useful when it arrives pre-sorted instead of asking every
// caller to invent its own priority cosmology.
function sortCards(cards: KanbanCard[]): KanbanCard[] {
  return [...cards].sort((left, right) => {
    const priorityDelta =
      priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

// All writes go through one little altar. That keeps JSON formatting, ordering,
// and updatedAt handling from drifting into folklore.
// Future complexity wearing a fake mustache:
// "I am just one more write path from somewhere else in the app." Resist that.
// The moment writes are duplicated, the corkboard grows extra mouths.
//
// Best practice (the "textbook" version):
// One mutation boundary per aggregate, or at least one canonical writer.
//
// What we are doing instead (and why):
// Exactly one local writer function. No repository fanfare. Just discipline.
async function writeBoard(board: KanbanBoard) {
  await fs.mkdir(path.dirname(boardFilePath), { recursive: true });

  await fs.writeFile(
    boardFilePath,
    `${JSON.stringify(
      {
        updatedAt: board.updatedAt,
        cards: board.cards,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

// What this does:
// Reads the board file, normalizes every card, then returns a sorted board.
//
// Interview lens:
// This is a nice example of "treat file input like external input." Even if
// the file lives in your repo, assume it can be malformed and make recovery
// behavior explicit.
//
// Failure lens:
// How would this break in production?
// Two concurrent writes could stomp each other because this is whole-file
// read-modify-write, not row-level locking. That risk is acceptable now and
// should be named out loud rather than hidden under optimism.
export async function getKanbanBoard(): Promise<KanbanBoard> {
  const raw = await fs.readFile(boardFilePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const cards = Array.isArray(parsed.cards)
    ? parsed.cards.map(normalizeCard).filter((entry): entry is KanbanCard => Boolean(entry))
    : [];

  return {
    updatedAt: normalizeString(parsed.updatedAt) || new Date(0).toISOString(),
    cards: sortCards(cards),
  };
}

// This is the smallest possible mutation ritual: load canonical board, change
// one card's status, stamp updatedAt, write the whole board back.
//
// Best practice (the "textbook" version):
// Optimistic locking, per-record updates, or append-only events.
//
// What we are doing instead (and why):
// Whole-board rewrite because the data set is tiny and the mental model is
// simple enough that Charlie can understand it in one sitting.
//
// If ignored:
// If usage grows and this never evolves, one day two people move two cards at
// once and the second save politely erases the first like an overhelpful imp.
export async function updateKanbanCardStatus(
  cardId: string,
  status: KanbanStatus,
) {
  const board = await getKanbanBoard();
  const now = new Date().toISOString();

  const cards = board.cards.map((card) =>
    card.id === cardId ? { ...card, status, updatedAt: now } : card,
  );

  await writeBoard({
    updatedAt: now,
    cards,
  });
}

// The ID is deliberately human-ish and timestamped. It is not trying to be a
// forever primary key for a distributed empire; it just needs to be stable and
// readable on a team corkboard.
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// What this does:
// Creates a new normalized card and prepends it to the board.
//
// Why this matters:
// Notice the pattern: the UI may collect the form, but this server utility
// owns the actual write shape. That keeps the source of truth in one place
// instead of scattering card-creation lore across components like tavern
// rumors.
//
// Best practice (the "textbook" version):
// Validation schema plus domain object creation plus durable storage boundary.
//
// What we are doing instead (and why):
// Lightweight normalization inside the persistence helper. Good enough while
// the card model is small and the team is trusted.
//
// Signal to evolve it:
// If card creation needs richer validation rules, edit history, or more than a
// couple of mutation entry points, centralizing creation in a shared domain
// service becomes more valuable than "just keep trimming strings here forever."
export async function createKanbanCard(input: CreateKanbanCardInput) {
  const board = await getKanbanBoard();
  const now = new Date().toISOString();
  const timestamp = now.replace(/[-:TZ.]/g, "").slice(0, 14);
  const titleBase = slugify(input.title) || "kanban-card";

  const card: KanbanCard = {
    id: `${titleBase}-${timestamp}`,
    title: input.title.trim(),
    status: input.status,
    type: input.type.trim() || "task",
    area: input.area.trim() || "general",
    priority: input.priority,
    owner: input.owner.trim(),
    summary: input.summary.trim(),
    nextStep: input.nextStep.trim(),
    links: input.links,
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    updatedAt: now,
  };

  await writeBoard({
    updatedAt: now,
    cards: sortCards([card, ...board.cards]),
  });
}
