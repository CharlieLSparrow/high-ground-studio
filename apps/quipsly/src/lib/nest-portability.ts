import { documentSha256, stableDocumentJson } from "@/lib/document-portability";

export const NEST_EXPORT_SCHEMA_VERSION = "quipsly-nest-export-v1" as const;

const MAX_TAGS = 5_000;
const MAX_ALIASES = 10_000;
const MAX_NOTES = 5_000;
const MAX_BLOCKS = 20_000;
const MAX_SPANS = 100_000;
const MAX_TASKS = 20_000;
const MAX_TASK_EVIDENCE_RECEIPTS = 100_000;
const MAX_GOALS = 10_000;
const MAX_PROGRESS_RECEIPTS = 100_000;
const MAX_LINKS = 100_000;
const MAX_PLAN_BLOCKS = 50_000;
const MAX_TEXT_BYTES = 30 * 1024 * 1024;

const TAG_CATEGORIES = new Set([
  "meaning",
  "structure",
  "source",
  "projection",
  "review",
  "production_breakdown",
]);
const TAG_NODE_TYPES = new Set([
  "principle",
  "story",
  "quote",
  "question",
  "projection_candidate",
  "source_note",
  "production_element",
]);
const PROJECTION_STATUSES = new Set([
  "private",
  "draft",
  "review",
  "approved",
  "published",
  "not_public",
  "projection_not_approved",
]);
const TASK_STATUSES = new Set(["OPEN", "DONE", "CANCELED"]);
const GOAL_STATUSES = new Set(["ACTIVE", "PAUSED", "ACHIEVED", "ARCHIVED"]);
const GOAL_TASK_RELATIONSHIPS = new Set(["CONTRIBUTES", "BLOCKS", "OUTCOME"]);
const PLAN_BLOCK_STATUSES = new Set(["PLANNED", "COMPLETED", "SKIPPED", "CANCELED"]);

export type PortableNestTagAlias = {
  id: string;
  slug: string;
  label: string;
  provenanceJson: Record<string, unknown>;
  createdAt: string;
};

export type PortableNestTag = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  category: string;
  nodeType: string;
  isPrivate: boolean;
  isActive: boolean;
  archivedAt: string | null;
  mergedIntoTagId: string | null;
  aliases: PortableNestTagAlias[];
  revisions: Array<{
    revision: number;
    operation: string;
    snapshotJson: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestTaggedSpan = {
  id: string;
  tagId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  noteBody: string | null;
  createdAt: string;
};

export type PortableNestNoteBlock = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  externalId: string | null;
  projectionStatus: string;
  isPrivate: boolean;
  archivedAt: string | null;
  spans: PortableNestTaggedSpan[];
  createdAt: string;
  updatedAt: string;
};

export type PortableNestNote = {
  id: string;
  stableId: string;
  title: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  projectionStatus: string;
  isPrivate: boolean;
  personal: boolean;
  tagIds: string[];
  blocks: PortableNestNoteBlock[];
  createdAt: string;
  updatedAt: string;
};

export type PortableNestTask = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  sourceJson: Record<string, unknown>;
  tagIds: string[];
  reminderSnapshot: null | {
    id: string;
    remindAt: string;
    status: string;
    sourceJson: Record<string, unknown>;
    updatedAt: string;
  };
  recurrenceSnapshot: null | {
    seriesId: string;
    occurrenceKey: string;
    scheduledLocalDate: string;
    scheduledFor: string;
    status: string;
    series: Record<string, unknown>;
  };
  evidenceReceipts: Array<{
    id: string;
    kind: string;
    note: string | null;
    evidenceJson: Record<string, unknown>;
    occurredAt: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestGoal = {
  id: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  status: string;
  targetAt: string | null;
  achievedAt: string | null;
  sourceJson: Record<string, unknown>;
  tagIds: string[];
  progressReceipts: Array<{
    id: string;
    kind: string;
    progressPercent: number | null;
    note: string | null;
    evidenceJson: Record<string, unknown>;
    occurredAt: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestGoalTaskLink = {
  goalId: string;
  taskId: string;
  relationship: string;
  sourceJson: Record<string, unknown>;
  createdAt: string;
};

export type PortableNestPlanBlock = {
  id: string;
  taskId: string | null;
  goalId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  completedAt: string | null;
  actualMinutes: number | null;
  sourceJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PortableNestBundlePayload = {
  schemaVersion: typeof NEST_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  sourceNest: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    sourceLabel: string | null;
    updatedAt: string;
  };
  tags: PortableNestTag[];
  notes: PortableNestNote[];
  tasks: PortableNestTask[];
  goals: PortableNestGoal[];
  goalTaskLinks: PortableNestGoalTaskLink[];
  planBlocks: PortableNestPlanBlock[];
  boundaries: {
    ownerAuthorized: true;
    actorScopedWork: true;
    noteDocumentsIncluded: true;
    mediaBytesIncluded: false;
    sessionsIncluded: false;
    collaboratorAssignmentsIncluded: false;
    remindersRestoredActive: false;
    recurrenceRestoredActive: false;
    planBlocksRestoreAsCanceled: true;
    externalResourcesFetched: false;
    externalSideEffects: false;
  };
};

export type PortableNestBundle = PortableNestBundlePayload & {
  integrity: {
    algorithm: "sha256";
    manifestSha256: string;
    tagCount: number;
    aliasCount: number;
    noteCount: number;
    blockCount: number;
    spanCount: number;
    taskCount: number;
    taskEvidenceReceiptCount: number;
    goalCount: number;
    progressReceiptCount: number;
    goalTaskLinkCount: number;
    planBlockCount: number;
  };
};

export type ValidatedNestBundle = PortableNestBundlePayload & {
  manifestSha256: string;
};

export type NestBundleValidationResult =
  | { ok: true; bundle: ValidatedNestBundle }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && value.trim().length === 0)) {
    return null;
  }
  return value;
}

function nullableString(value: unknown, max: number) {
  if (value == null) return null;
  const parsed = stringValue(value, max, true);
  return parsed == null ? undefined : parsed;
}

function dateString(value: unknown, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) return undefined;
  return value;
}

function safeInteger(value: unknown, minimum = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function stringArray(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function jsonRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function addTextBytes(total: number, value: string | null) {
  return total + (value == null ? 0 : Buffer.byteLength(value, "utf8"));
}

export function nestManifestSha256(payload: PortableNestBundlePayload) {
  return documentSha256(stableDocumentJson(payload));
}

export function createPortableNestBundle(payload: PortableNestBundlePayload): PortableNestBundle {
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      manifestSha256: nestManifestSha256(payload),
      tagCount: payload.tags.length,
      aliasCount: payload.tags.reduce((count, tag) => count + tag.aliases.length, 0),
      noteCount: payload.notes.length,
      blockCount: payload.notes.reduce((count, note) => count + note.blocks.length, 0),
      spanCount: payload.notes.reduce(
        (count, note) => count + note.blocks.reduce((blockCount, block) => blockCount + block.spans.length, 0),
        0,
      ),
      taskCount: payload.tasks.length,
      taskEvidenceReceiptCount: payload.tasks.reduce((count, task) => count + task.evidenceReceipts.length, 0),
      goalCount: payload.goals.length,
      progressReceiptCount: payload.goals.reduce((count, goal) => count + goal.progressReceipts.length, 0),
      goalTaskLinkCount: payload.goalTaskLinks.length,
      planBlockCount: payload.planBlocks.length,
    },
  };
}

export function validateNestBundle(input: unknown): NestBundleValidationResult {
  if (!isRecord(input) || input.schemaVersion !== NEST_EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: `Choose a Quipsly Nest export using schema ${NEST_EXPORT_SCHEMA_VERSION}.` };
  }
  const integrity = isRecord(input.integrity) ? input.integrity : null;
  const expectedManifest = stringValue(integrity?.manifestSha256, 64);
  if (!expectedManifest || !/^[a-f0-9]{64}$/.test(expectedManifest)) {
    return { ok: false, error: "The Nest bundle is missing its SHA-256 verification manifest." };
  }
  const { integrity: _integrity, ...rawPayload } = input;
  if (documentSha256(stableDocumentJson(rawPayload)) !== expectedManifest) {
    return { ok: false, error: "The Nest bundle manifest does not match its contents. Nothing was restored." };
  }

  const exportedAt = dateString(input.exportedAt);
  const sourceNest = isRecord(input.sourceNest) ? input.sourceNest : null;
  const sourceNestId = stringValue(sourceNest?.id, 200);
  const sourceNestSlug = stringValue(sourceNest?.slug, 200);
  const sourceNestName = stringValue(sourceNest?.name, 500);
  const sourceNestDescription = nullableString(sourceNest?.description, 10_000);
  const sourceNestLabel = nullableString(sourceNest?.sourceLabel, 2_000);
  const sourceNestUpdatedAt = dateString(sourceNest?.updatedAt);
  if (!exportedAt || !sourceNestId || !sourceNestSlug || !sourceNestName
    || sourceNestDescription === undefined || sourceNestLabel === undefined || !sourceNestUpdatedAt) {
    return { ok: false, error: "The Nest bundle source identity is incomplete." };
  }
  if (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS
    || !Array.isArray(input.notes) || input.notes.length > MAX_NOTES
    || !Array.isArray(input.tasks) || input.tasks.length > MAX_TASKS
    || !Array.isArray(input.goals) || input.goals.length > MAX_GOALS
    || !Array.isArray(input.goalTaskLinks) || input.goalTaskLinks.length > MAX_LINKS
    || !Array.isArray(input.planBlocks) || input.planBlocks.length > MAX_PLAN_BLOCKS) {
    return { ok: false, error: "The Nest bundle has invalid or unsafe record counts." };
  }

  const tags: PortableNestTag[] = [];
  const aliasIds = new Set<string>();
  const aliasSlugs = new Set<string>();
  let aliasCount = 0;
  for (const raw of input.tags) {
    if (!isRecord(raw) || !Array.isArray(raw.aliases) || !Array.isArray(raw.revisions)) {
      return { ok: false, error: "A tag record in the Nest bundle is invalid." };
    }
    const id = stringValue(raw.id, 200);
    const slug = stringValue(raw.slug, 200);
    const label = stringValue(raw.label, 300);
    const description = nullableString(raw.description, 2_000);
    const category = stringValue(raw.category, 100);
    const nodeType = stringValue(raw.nodeType, 100);
    const archivedAt = dateString(raw.archivedAt, true);
    const mergedIntoTagId = nullableString(raw.mergedIntoTagId, 200);
    const createdAt = dateString(raw.createdAt);
    const updatedAt = dateString(raw.updatedAt);
    if (!id || !slug || !label || description === undefined || !category || !TAG_CATEGORIES.has(category)
      || !nodeType || !TAG_NODE_TYPES.has(nodeType) || typeof raw.isPrivate !== "boolean"
      || typeof raw.isActive !== "boolean" || archivedAt === undefined || mergedIntoTagId === undefined
      || !createdAt || !updatedAt) {
      return { ok: false, error: "A tag record in the Nest bundle is incomplete." };
    }
    const aliases: PortableNestTagAlias[] = [];
    for (const rawAlias of raw.aliases) {
      if (!isRecord(rawAlias)) return { ok: false, error: "A tag alias in the Nest bundle is invalid." };
      const aliasId = stringValue(rawAlias.id, 200);
      const aliasSlug = stringValue(rawAlias.slug, 200);
      const aliasLabel = stringValue(rawAlias.label, 300);
      const aliasCreatedAt = dateString(rawAlias.createdAt);
      if (!aliasId || !aliasSlug || !aliasLabel || !aliasCreatedAt) {
        return { ok: false, error: "A tag alias in the Nest bundle is incomplete." };
      }
      if (aliasIds.has(aliasId) || aliasSlugs.has(aliasSlug)) {
        return { ok: false, error: "The Nest bundle repeats a tag alias identity or slug." };
      }
      aliasIds.add(aliasId);
      aliasSlugs.add(aliasSlug);
      aliases.push({
        id: aliasId,
        slug: aliasSlug,
        label: aliasLabel,
        provenanceJson: jsonRecord(rawAlias.provenanceJson),
        createdAt: aliasCreatedAt,
      });
    }
    aliasCount += aliases.length;
    if (aliasCount > MAX_ALIASES) return { ok: false, error: "The Nest bundle contains too many tag aliases." };
    if (raw.revisions.length > 10_000) {
      return { ok: false, error: "A tag contains too many revision receipts." };
    }
    const revisions: PortableNestTag["revisions"] = [];
    const revisionNumbers = new Set<number>();
    for (const rawRevision of raw.revisions) {
      if (!isRecord(rawRevision)) return { ok: false, error: "A tag revision in the Nest bundle is invalid." };
      const revision = safeInteger(rawRevision.revision, 1);
      const operation = stringValue(rawRevision.operation, 200);
      const revisionCreatedAt = dateString(rawRevision.createdAt);
      if (revision == null || !operation || !revisionCreatedAt) {
        return { ok: false, error: "A tag revision in the Nest bundle is incomplete." };
      }
      if (revisionNumbers.has(revision)) {
        return { ok: false, error: "A tag repeats a revision number." };
      }
      revisionNumbers.add(revision);
      revisions.push({
        revision,
        operation,
        snapshotJson: jsonRecord(rawRevision.snapshotJson),
        createdAt: revisionCreatedAt,
      });
    }
    tags.push({
      id,
      slug,
      label,
      description,
      category,
      nodeType,
      isPrivate: raw.isPrivate,
      isActive: raw.isActive,
      archivedAt,
      mergedIntoTagId,
      aliases,
      revisions,
      createdAt,
      updatedAt,
    });
  }
  const tagIds = new Set(tags.map((tag) => tag.id));
  if (tagIds.size !== tags.length || new Set(tags.map((tag) => tag.slug)).size !== tags.length) {
    return { ok: false, error: "The Nest bundle repeats a tag identity or canonical slug." };
  }
  if (tags.some((tag) => tag.mergedIntoTagId && !tagIds.has(tag.mergedIntoTagId))) {
    return { ok: false, error: "A merged tag points outside the exported Nest vocabulary." };
  }

  const notes: PortableNestNote[] = [];
  const blockIds = new Set<string>();
  const blockStableIds = new Set<string>();
  const spanIds = new Set<string>();
  let blockCount = 0;
  let spanCount = 0;
  let textBytes = 0;
  for (const raw of input.notes) {
    if (!isRecord(raw) || !Array.isArray(raw.blocks)) {
      return { ok: false, error: "A note document in the Nest bundle is invalid." };
    }
    const id = stringValue(raw.id, 200);
    const stableId = stringValue(raw.stableId, 500);
    const title = stringValue(raw.title, 500);
    const sourceLabel = nullableString(raw.sourceLabel, 2_000);
    const sourcePath = nullableString(raw.sourcePath, 4_000);
    const projectionStatus = stringValue(raw.projectionStatus, 100);
    // Bundles created before the explicit owner boundary had only isPrivate.
    // Restore those legacy private notes to the importing actor instead of
    // silently widening them to every collaborator in the destination Nest.
    const personal =
      raw.personal === true
      || (raw.personal === undefined && raw.isPrivate === true);
    const documentTagIds = stringArray(raw.tagIds ?? [], MAX_TAGS);
    const createdAt = dateString(raw.createdAt);
    const updatedAt = dateString(raw.updatedAt);
    if (!id || !stableId || !title || sourceLabel === undefined || sourcePath === undefined
      || !projectionStatus || !PROJECTION_STATUSES.has(projectionStatus) || !documentTagIds
      || documentTagIds.some((tagId) => !tagIds.has(tagId))
      || typeof raw.isPrivate !== "boolean" || !createdAt || !updatedAt) {
      return { ok: false, error: "A note document in the Nest bundle is incomplete." };
    }
    if (new Set(documentTagIds).size !== documentTagIds.length) {
      return { ok: false, error: "A note document repeats a document-level tag reference." };
    }
    const blocks: PortableNestNoteBlock[] = [];
    for (const rawBlock of raw.blocks) {
      if (!isRecord(rawBlock) || !Array.isArray(rawBlock.spans)) {
        return { ok: false, error: "A note block in the Nest bundle is invalid." };
      }
      const blockId = stringValue(rawBlock.id, 200);
      const blockStableId = stringValue(rawBlock.stableId, 500);
      const order = safeInteger(rawBlock.order);
      const blockTitle = nullableString(rawBlock.title, 500);
      const body = stringValue(rawBlock.body, MAX_TEXT_BYTES, true);
      const blockSourceLabel = nullableString(rawBlock.sourceLabel, 2_000);
      const blockSourcePath = nullableString(rawBlock.sourcePath, 4_000);
      const externalId = nullableString(rawBlock.externalId, 2_000);
      const blockProjectionStatus = stringValue(rawBlock.projectionStatus, 100);
      const archivedAt = dateString(rawBlock.archivedAt, true);
      const blockCreatedAt = dateString(rawBlock.createdAt);
      const blockUpdatedAt = dateString(rawBlock.updatedAt);
      if (!blockId || !blockStableId || order == null || blockTitle === undefined || body == null
        || blockSourceLabel === undefined || blockSourcePath === undefined || externalId === undefined
        || !blockProjectionStatus || !PROJECTION_STATUSES.has(blockProjectionStatus)
        || typeof rawBlock.isPrivate !== "boolean" || archivedAt === undefined || !blockCreatedAt || !blockUpdatedAt) {
        return { ok: false, error: "A note block in the Nest bundle is incomplete." };
      }
      if (blockIds.has(blockId) || blockStableIds.has(blockStableId)) {
        return { ok: false, error: "The Nest bundle repeats a note-block identity or stable identity." };
      }
      blockIds.add(blockId);
      blockStableIds.add(blockStableId);
      textBytes = addTextBytes(textBytes, body);
      const spans: PortableNestTaggedSpan[] = [];
      for (const rawSpan of rawBlock.spans) {
        if (!isRecord(rawSpan)) return { ok: false, error: "A note tag anchor in the Nest bundle is invalid." };
        const spanId = stringValue(rawSpan.id, 200);
        const tagId = stringValue(rawSpan.tagId, 200);
        const startOffset = safeInteger(rawSpan.startOffset);
        const endOffset = safeInteger(rawSpan.endOffset);
        const selectedText = stringValue(rawSpan.selectedText, MAX_TEXT_BYTES, true);
        const noteBody = nullableString(rawSpan.noteBody, 20_000);
        const spanCreatedAt = dateString(rawSpan.createdAt);
        if (!spanId || !tagId || !tagIds.has(tagId) || startOffset == null || endOffset == null
          || endOffset < startOffset || endOffset > body.length || selectedText == null
          || body.slice(startOffset, endOffset) !== selectedText || noteBody === undefined || !spanCreatedAt) {
          return { ok: false, error: "A note tag anchor no longer matches its block or vocabulary." };
        }
        if (spanIds.has(spanId)) {
          return { ok: false, error: "The Nest bundle repeats a note tag-anchor identity." };
        }
        spanIds.add(spanId);
        textBytes = addTextBytes(textBytes, noteBody);
        spans.push({ id: spanId, tagId, startOffset, endOffset, selectedText, noteBody, createdAt: spanCreatedAt });
      }
      spanCount += spans.length;
      blockCount += 1;
      if (blockCount > MAX_BLOCKS || spanCount > MAX_SPANS || textBytes > MAX_TEXT_BYTES) {
        return { ok: false, error: "The Nest bundle contains too much note content for this restore lane." };
      }
      blocks.push({
        id: blockId,
        stableId: blockStableId,
        order,
        title: blockTitle,
        body,
        sourceLabel: blockSourceLabel,
        sourcePath: blockSourcePath,
        externalId,
        projectionStatus: blockProjectionStatus,
        isPrivate: rawBlock.isPrivate,
        archivedAt,
        spans,
        createdAt: blockCreatedAt,
        updatedAt: blockUpdatedAt,
      });
    }
    if (new Set(blocks.map((block) => block.id)).size !== blocks.length
      || new Set(blocks.map((block) => block.stableId)).size !== blocks.length
      || new Set(blocks.map((block) => block.order)).size !== blocks.length) {
      return { ok: false, error: "A note repeats a block identity, stable identity, or order." };
    }
    notes.push({
      id,
      stableId,
      title,
      sourceLabel,
      sourcePath,
      projectionStatus,
      isPrivate: raw.isPrivate,
      personal,
      tagIds: documentTagIds,
      blocks,
      createdAt,
      updatedAt,
    });
  }
  if (new Set(notes.map((note) => note.id)).size !== notes.length
    || new Set(notes.map((note) => note.stableId)).size !== notes.length) {
    return { ok: false, error: "The Nest bundle repeats a note identity." };
  }

  const tasks: PortableNestTask[] = [];
  const reminderIds = new Set<string>();
  const taskEvidenceReceiptIds = new Set<string>();
  let taskEvidenceReceiptCount = 0;
  for (const raw of input.tasks) {
    if (!isRecord(raw)) return { ok: false, error: "A task in the Nest bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const title = stringValue(raw.title, 500);
    const detail = nullableString(raw.detail, 20_000);
    const status = stringValue(raw.status, 40);
    const dueAt = dateString(raw.dueAt, true);
    const completedAt = dateString(raw.completedAt, true);
    const tagIdsForTask = stringArray(raw.tagIds, MAX_TAGS);
    const createdAt = dateString(raw.createdAt);
    const updatedAt = dateString(raw.updatedAt);
    if (!id || !title || detail === undefined || !status || !TASK_STATUSES.has(status)
      || dueAt === undefined || completedAt === undefined || !tagIdsForTask
      || tagIdsForTask.some((tagId) => !tagIds.has(tagId)) || !createdAt || !updatedAt) {
      return { ok: false, error: "A task in the Nest bundle is incomplete or references a missing tag." };
    }
    if (new Set(tagIdsForTask).size !== tagIdsForTask.length) {
      return { ok: false, error: "A task repeats a tag reference." };
    }
    let reminderSnapshot: PortableNestTask["reminderSnapshot"] = null;
    if (raw.reminderSnapshot != null) {
      if (!isRecord(raw.reminderSnapshot)) return { ok: false, error: "A task reminder snapshot is invalid." };
      const reminderId = stringValue(raw.reminderSnapshot.id, 200);
      const remindAt = dateString(raw.reminderSnapshot.remindAt);
      const reminderStatus = stringValue(raw.reminderSnapshot.status, 40);
      const reminderUpdatedAt = dateString(raw.reminderSnapshot.updatedAt);
      if (!reminderId || !remindAt || !reminderStatus || !reminderUpdatedAt) {
        return { ok: false, error: "A task reminder snapshot is incomplete." };
      }
      if (reminderIds.has(reminderId)) {
        return { ok: false, error: "The Nest bundle repeats a reminder identity." };
      }
      reminderIds.add(reminderId);
      reminderSnapshot = {
        id: reminderId,
        remindAt,
        status: reminderStatus,
        sourceJson: jsonRecord(raw.reminderSnapshot.sourceJson),
        updatedAt: reminderUpdatedAt,
      };
    }
    let recurrenceSnapshot: PortableNestTask["recurrenceSnapshot"] = null;
    if (raw.recurrenceSnapshot != null) {
      if (!isRecord(raw.recurrenceSnapshot)) return { ok: false, error: "A task recurrence snapshot is invalid." };
      const seriesId = stringValue(raw.recurrenceSnapshot.seriesId, 200);
      const occurrenceKey = stringValue(raw.recurrenceSnapshot.occurrenceKey, 500);
      const scheduledLocalDate = stringValue(raw.recurrenceSnapshot.scheduledLocalDate, 40);
      const scheduledFor = dateString(raw.recurrenceSnapshot.scheduledFor);
      const recurrenceStatus = stringValue(raw.recurrenceSnapshot.status, 40);
      if (!seriesId || !occurrenceKey || !scheduledLocalDate || !scheduledFor || !recurrenceStatus) {
        return { ok: false, error: "A task recurrence snapshot is incomplete." };
      }
      recurrenceSnapshot = {
        seriesId,
        occurrenceKey,
        scheduledLocalDate,
        scheduledFor,
        status: recurrenceStatus,
        series: jsonRecord(raw.recurrenceSnapshot.series),
      };
    }
    const rawEvidenceReceipts = raw.evidenceReceipts === undefined ? [] : raw.evidenceReceipts;
    if (!Array.isArray(rawEvidenceReceipts)) {
      return { ok: false, error: "A task evidence ledger in the Nest bundle is invalid." };
    }
    const evidenceReceipts: PortableNestTask["evidenceReceipts"] = [];
    for (const rawReceipt of rawEvidenceReceipts) {
      if (!isRecord(rawReceipt)) return { ok: false, error: "A task evidence receipt is invalid." };
      const receiptId = stringValue(rawReceipt.id, 200);
      const kind = stringValue(rawReceipt.kind, 200);
      const note = nullableString(rawReceipt.note, 20_000);
      const occurredAt = dateString(rawReceipt.occurredAt);
      const receiptCreatedAt = dateString(rawReceipt.createdAt);
      if (!receiptId || !kind || note === undefined || !occurredAt || !receiptCreatedAt) {
        return { ok: false, error: "A task evidence receipt is incomplete." };
      }
      if (taskEvidenceReceiptIds.has(receiptId)) {
        return { ok: false, error: "The Nest bundle repeats a task evidence-receipt identity." };
      }
      taskEvidenceReceiptIds.add(receiptId);
      evidenceReceipts.push({
        id: receiptId,
        kind,
        note,
        evidenceJson: jsonRecord(rawReceipt.evidenceJson),
        occurredAt,
        createdAt: receiptCreatedAt,
      });
      textBytes = addTextBytes(textBytes, note);
    }
    taskEvidenceReceiptCount += evidenceReceipts.length;
    if (taskEvidenceReceiptCount > MAX_TASK_EVIDENCE_RECEIPTS) {
      return { ok: false, error: "The Nest bundle contains too many task evidence receipts." };
    }
    textBytes = addTextBytes(addTextBytes(textBytes, title), detail);
    tasks.push({
      id,
      title,
      detail,
      status,
      dueAt,
      completedAt,
      sourceJson: jsonRecord(raw.sourceJson),
      tagIds: tagIdsForTask,
      reminderSnapshot,
      recurrenceSnapshot,
      evidenceReceipts,
      createdAt,
      updatedAt,
    });
  }
  const taskIds = new Set(tasks.map((task) => task.id));
  if (taskIds.size !== tasks.length) return { ok: false, error: "The Nest bundle repeats a task identity." };

  const goals: PortableNestGoal[] = [];
  const progressReceiptIds = new Set<string>();
  let progressReceiptCount = 0;
  for (const raw of input.goals) {
    if (!isRecord(raw) || !Array.isArray(raw.progressReceipts)) {
      return { ok: false, error: "A goal in the Nest bundle is invalid." };
    }
    const id = stringValue(raw.id, 200);
    const parentGoalId = nullableString(raw.parentGoalId, 200);
    const title = stringValue(raw.title, 500);
    const description = nullableString(raw.description, 20_000);
    const status = stringValue(raw.status, 40);
    const targetAt = dateString(raw.targetAt, true);
    const achievedAt = dateString(raw.achievedAt, true);
    const tagIdsForGoal = stringArray(raw.tagIds, MAX_TAGS);
    const createdAt = dateString(raw.createdAt);
    const updatedAt = dateString(raw.updatedAt);
    if (!id || parentGoalId === undefined || !title || description === undefined || !status || !GOAL_STATUSES.has(status)
      || targetAt === undefined || achievedAt === undefined || !tagIdsForGoal
      || tagIdsForGoal.some((tagId) => !tagIds.has(tagId)) || !createdAt || !updatedAt) {
      return { ok: false, error: "A goal in the Nest bundle is incomplete or references a missing tag." };
    }
    if (new Set(tagIdsForGoal).size !== tagIdsForGoal.length) {
      return { ok: false, error: "A goal repeats a tag reference." };
    }
    const progressReceipts: PortableNestGoal["progressReceipts"] = [];
    for (const rawReceipt of raw.progressReceipts) {
      if (!isRecord(rawReceipt)) return { ok: false, error: "A goal progress receipt is invalid." };
      const receiptId = stringValue(rawReceipt.id, 200);
      const kind = stringValue(rawReceipt.kind, 200);
      const progressPercent = rawReceipt.progressPercent == null
        ? null
        : safeInteger(rawReceipt.progressPercent);
      const note = nullableString(rawReceipt.note, 20_000);
      const occurredAt = dateString(rawReceipt.occurredAt);
      const receiptCreatedAt = dateString(rawReceipt.createdAt);
      if (
        !receiptId
        || !kind
        || (progressPercent === null && rawReceipt.progressPercent != null)
        || (progressPercent != null && progressPercent > 100)
        || note === undefined
        || !occurredAt
        || !receiptCreatedAt
      ) {
        return { ok: false, error: "A goal progress receipt is incomplete." };
      }
      if (progressReceiptIds.has(receiptId)) {
        return { ok: false, error: "The Nest bundle repeats a goal progress-receipt identity." };
      }
      progressReceiptIds.add(receiptId);
      progressReceipts.push({
        id: receiptId,
        kind,
        progressPercent,
        note,
        evidenceJson: jsonRecord(rawReceipt.evidenceJson),
        occurredAt,
        createdAt: receiptCreatedAt,
      });
    }
    progressReceiptCount += progressReceipts.length;
    if (progressReceiptCount > MAX_PROGRESS_RECEIPTS) {
      return { ok: false, error: "The Nest bundle contains too many goal progress receipts." };
    }
    textBytes = addTextBytes(addTextBytes(textBytes, title), description);
    goals.push({
      id,
      parentGoalId,
      title,
      description,
      status,
      targetAt,
      achievedAt,
      sourceJson: jsonRecord(raw.sourceJson),
      tagIds: tagIdsForGoal,
      progressReceipts,
      createdAt,
      updatedAt,
    });
  }
  const goalIds = new Set(goals.map((goal) => goal.id));
  if (goalIds.size !== goals.length) return { ok: false, error: "The Nest bundle repeats a goal identity." };
  if (goals.some((goal) => goal.parentGoalId && !goalIds.has(goal.parentGoalId))) {
    return { ok: false, error: "A goal parent points outside the exported Nest work graph." };
  }

  const goalTaskLinks: PortableNestGoalTaskLink[] = [];
  for (const raw of input.goalTaskLinks) {
    if (!isRecord(raw)) return { ok: false, error: "A goal-task link in the Nest bundle is invalid." };
    const goalId = stringValue(raw.goalId, 200);
    const taskId = stringValue(raw.taskId, 200);
    const relationship = stringValue(raw.relationship, 40);
    const createdAt = dateString(raw.createdAt);
    if (!goalId || !goalIds.has(goalId) || !taskId || !taskIds.has(taskId)
      || !relationship || !GOAL_TASK_RELATIONSHIPS.has(relationship) || !createdAt) {
      return { ok: false, error: "A goal-task link points outside the exported work graph." };
    }
    goalTaskLinks.push({ goalId, taskId, relationship, sourceJson: jsonRecord(raw.sourceJson), createdAt });
  }
  if (new Set(goalTaskLinks.map((link) => `${link.goalId}:${link.taskId}`)).size !== goalTaskLinks.length) {
    return { ok: false, error: "The Nest bundle repeats a goal-task link." };
  }

  const planBlocks: PortableNestPlanBlock[] = [];
  for (const raw of input.planBlocks) {
    if (!isRecord(raw)) return { ok: false, error: "A focus block in the Nest bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const taskId = nullableString(raw.taskId, 200);
    const goalId = nullableString(raw.goalId, 200);
    const startsAt = dateString(raw.startsAt);
    const endsAt = dateString(raw.endsAt);
    const timezone = stringValue(raw.timezone, 200);
    const status = stringValue(raw.status, 40);
    const completedAt = dateString(raw.completedAt, true);
    const actualMinutes = raw.actualMinutes == null ? null : safeInteger(raw.actualMinutes, 1);
    const createdAt = dateString(raw.createdAt);
    const updatedAt = dateString(raw.updatedAt);
    if (!id || taskId === undefined || goalId === undefined || Boolean(taskId) === Boolean(goalId)
      || (taskId && !taskIds.has(taskId)) || (goalId && !goalIds.has(goalId))
      || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)
      || !timezone || !status || !PLAN_BLOCK_STATUSES.has(status)
      || completedAt === undefined || (raw.actualMinutes != null && (actualMinutes === null || actualMinutes > 1_440))
      || !createdAt || !updatedAt) {
      return { ok: false, error: "A focus block is incomplete or points outside the exported work graph." };
    }
    planBlocks.push({
      id,
      taskId,
      goalId,
      startsAt,
      endsAt,
      timezone,
      status,
      completedAt,
      actualMinutes,
      sourceJson: jsonRecord(raw.sourceJson),
      createdAt,
      updatedAt,
    });
  }
  if (new Set(planBlocks.map((block) => block.id)).size !== planBlocks.length) {
    return { ok: false, error: "The Nest bundle repeats a focus-block identity." };
  }
  if (textBytes > MAX_TEXT_BYTES) {
    return { ok: false, error: "The Nest bundle contains too much text for this restore lane." };
  }

  const boundaries = isRecord(input.boundaries) ? input.boundaries : null;
  if (!boundaries || boundaries.ownerAuthorized !== true || boundaries.actorScopedWork !== true
    || boundaries.noteDocumentsIncluded !== true || boundaries.mediaBytesIncluded !== false
    || boundaries.sessionsIncluded !== false || boundaries.collaboratorAssignmentsIncluded !== false
    || boundaries.remindersRestoredActive !== false || boundaries.recurrenceRestoredActive !== false
    || boundaries.planBlocksRestoreAsCanceled !== true || boundaries.externalResourcesFetched !== false
    || boundaries.externalSideEffects !== false) {
    return { ok: false, error: "The Nest bundle safety boundaries are missing or unsupported." };
  }

  const counts = {
    tagCount: tags.length,
    aliasCount,
    noteCount: notes.length,
    blockCount,
    spanCount,
    taskCount: tasks.length,
    taskEvidenceReceiptCount,
    goalCount: goals.length,
    progressReceiptCount,
    goalTaskLinkCount: goalTaskLinks.length,
    planBlockCount: planBlocks.length,
  };
  if (Object.entries(counts).some(([key, value]) => (
    key === "taskEvidenceReceiptCount" && integrity?.[key] === undefined
      ? value !== 0
      : Number(integrity?.[key]) !== value
  ))) {
    return { ok: false, error: "The Nest bundle counts do not match its integrity manifest." };
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: NEST_EXPORT_SCHEMA_VERSION,
      exportedAt,
      sourceNest: {
        id: sourceNestId,
        slug: sourceNestSlug,
        name: sourceNestName,
        description: sourceNestDescription,
        sourceLabel: sourceNestLabel,
        updatedAt: sourceNestUpdatedAt,
      },
      tags,
      notes,
      tasks,
      goals,
      goalTaskLinks,
      planBlocks,
      boundaries: {
        ownerAuthorized: true,
        actorScopedWork: true,
        noteDocumentsIncluded: true,
        mediaBytesIncluded: false,
        sessionsIncluded: false,
        collaboratorAssignmentsIncluded: false,
        remindersRestoredActive: false,
        recurrenceRestoredActive: false,
        planBlocksRestoreAsCanceled: true,
        externalResourcesFetched: false,
        externalSideEffects: false,
      },
      manifestSha256: expectedManifest,
    },
  };
}
