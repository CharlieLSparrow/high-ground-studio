import { createHash } from "node:crypto";

export const RESEARCH_EXPORT_SCHEMA_VERSION = "quipsly-research-export-v1";

const MAX_SOURCES = 1_000;
const MAX_TAGS = 5_000;
const MAX_ANNOTATIONS = 20_000;
const MAX_WRITING_USES = 20_000;
const MAX_SOURCE_TEXT_BYTES = 25 * 1024 * 1024;

export type PortableResearchSource = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  sourceUrl: string | null;
  sourcePath: string | null;
  author: string | null;
  capturedAt: string | null;
  immutableText: string | null;
  immutableTextSha256: string | null;
  editableNotes: string | null;
  metadataJson: Record<string, unknown>;
};

export type PortableResearchTag = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  category: string;
  isPrivate: boolean;
};

export type PortableResearchAnnotation = {
  id: string;
  sourceUnitId: string;
  kind: string;
  status: string;
  visibility: string;
  body: string;
  selectorKind: string;
  startOffset: number | null;
  endOffset: number | null;
  exactText: string | null;
  prefixText: string | null;
  suffixText: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  sourceFingerprint: string | null;
  provenanceJson: Record<string, unknown>;
  tagIds: string[];
  revisions: unknown[];
};

export type PortableResearchWritingUse = {
  id: string;
  annotationId: string;
  documentId: string;
  blockId: string;
  useKind: string;
  citationKey: string;
  quoteSnapshot: string;
  citationLabel: string;
  sourceJson: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
};

export type PortableResearchWritingTarget = {
  useId: string;
  document: {
    id: string;
    stableId: string;
    title: string;
    sourceLabel: string | null;
    sourcePath: string | null;
    projectionStatus: string;
    isPrivate: boolean;
    updatedAt: string;
  };
  block: {
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
    updatedAt: string;
  };
};

export type ValidatedResearchBundle = {
  schemaVersion: typeof RESEARCH_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  project: { id: string; slug: string; name: string; updatedAt: string };
  sources: PortableResearchSource[];
  tags: PortableResearchTag[];
  annotations: PortableResearchAnnotation[];
  writingUses: PortableResearchWritingUse[];
  writingTargets: PortableResearchWritingTarget[];
  boundaries: Record<string, unknown>;
  manifestSha256: string;
};

export type ResearchBundleValidationResult =
  | { ok: true; bundle: ValidatedResearchBundle }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableResearchJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableResearchJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableResearchJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function researchSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringValue(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== "string") return null;
  if (value.length > max || (!allowEmpty && value.trim().length === 0)) return null;
  return value;
}

function nullableString(value: unknown, max: number) {
  if (value == null) return null;
  const parsed = stringValue(value, max, true);
  return parsed == null ? undefined : parsed;
}

function finiteNumberOrNull(value: unknown) {
  return value == null ? null : typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeDateString(value: unknown, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) return undefined;
  return value;
}

export function validateResearchBundle(input: unknown): ResearchBundleValidationResult {
  if (!isRecord(input) || input.schemaVersion !== RESEARCH_EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: "Choose a Quipsly research export using schema quipsly-research-export-v1." };
  }
  const integrity = isRecord(input.integrity) ? input.integrity : null;
  const expectedManifest = stringValue(integrity?.manifestSha256, 64);
  if (!expectedManifest || !/^[a-f0-9]{64}$/.test(expectedManifest)) {
    return { ok: false, error: "The research bundle is missing its SHA-256 manifest." };
  }
  const { integrity: _integrity, ...manifestPayload } = input;
  const actualManifest = researchSha256(stableResearchJson(manifestPayload));
  if (actualManifest !== expectedManifest) {
    return { ok: false, error: "The research bundle manifest does not match its contents. Nothing was restored." };
  }

  const project = isRecord(input.project) ? input.project : null;
  const projectId = stringValue(project?.id, 200);
  const projectSlug = stringValue(project?.slug, 160);
  const projectName = stringValue(project?.name, 300);
  const projectUpdatedAt = safeDateString(project?.updatedAt);
  const exportedAt = safeDateString(input.exportedAt);
  if (!projectId || !projectSlug || !projectName || !projectUpdatedAt || !exportedAt) {
    return { ok: false, error: "The research bundle project identity is incomplete." };
  }
  if (!Array.isArray(input.sources) || input.sources.length > MAX_SOURCES
    || !Array.isArray(input.tags) || input.tags.length > MAX_TAGS
    || !Array.isArray(input.annotations) || input.annotations.length > MAX_ANNOTATIONS
    || !Array.isArray(input.writingUses) || input.writingUses.length > MAX_WRITING_USES) {
    return { ok: false, error: "The research bundle has invalid or unsafe record counts." };
  }

  const sources: PortableResearchSource[] = [];
  let sourceTextBytes = 0;
  for (const raw of input.sources) {
    if (!isRecord(raw)) return { ok: false, error: "A source record in this bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const slug = stringValue(raw.slug, 200);
    const kind = stringValue(raw.kind, 100);
    const title = stringValue(raw.title, 500);
    const immutableText = nullableString(raw.immutableText, MAX_SOURCE_TEXT_BYTES);
    const immutableTextSha256 = nullableString(raw.immutableTextSha256, 64);
    const capturedAt = safeDateString(raw.capturedAt, true);
    const sourceUrl = nullableString(raw.sourceUrl, 4_000);
    const sourcePath = nullableString(raw.sourcePath, 4_000);
    const author = nullableString(raw.author, 500);
    const editableNotes = nullableString(raw.editableNotes, 100_000);
    if (!id || !slug || !kind || !title || immutableText === undefined || immutableTextSha256 === undefined || capturedAt === undefined
      || sourceUrl === undefined || sourcePath === undefined || author === undefined || editableNotes === undefined) {
      return { ok: false, error: "A source record in this bundle is incomplete." };
    }
    if ((immutableText == null) !== (immutableTextSha256 == null)
      || (immutableText != null && researchSha256(immutableText) !== immutableTextSha256)) {
      return { ok: false, error: `Source ${title} does not match its SHA-256 fingerprint.` };
    }
    sourceTextBytes += immutableText == null ? 0 : Buffer.byteLength(immutableText, "utf8");
    if (sourceTextBytes > MAX_SOURCE_TEXT_BYTES) {
      return { ok: false, error: "The research bundle contains more preserved text than this restore lane accepts." };
    }
    sources.push({
      id,
      slug,
      kind,
      title,
      sourceUrl,
      sourcePath,
      author,
      capturedAt,
      immutableText,
      immutableTextSha256,
      editableNotes,
      metadataJson: isRecord(raw.metadataJson) ? raw.metadataJson : {},
    });
  }
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    return { ok: false, error: "The research bundle repeats a source identity." };
  }

  const tags: PortableResearchTag[] = [];
  const supportedTagCategories = new Set(["meaning", "structure", "source", "projection", "review", "production_breakdown"]);
  for (const raw of input.tags) {
    if (!isRecord(raw)) return { ok: false, error: "A tag record in this bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const slug = stringValue(raw.slug, 200);
    const label = stringValue(raw.label, 300);
    const category = stringValue(raw.category, 100);
    const description = nullableString(raw.description, 2_000);
    if (!id || !slug || !label || !category || !supportedTagCategories.has(category) || description === undefined || typeof raw.isPrivate !== "boolean") {
      return { ok: false, error: "A tag record in this bundle is incomplete." };
    }
    tags.push({ id, slug, label, category, description, isPrivate: raw.isPrivate });
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const tagIds = new Set(tags.map((tag) => tag.id));
  const annotations: PortableResearchAnnotation[] = [];
  const supportedKinds = new Set(["highlight", "note", "question", "quote", "claim", "idea", "correction", "action"]);
  const supportedStatuses = new Set(["active", "resolved", "archived"]);
  const supportedVisibilities = new Set(["private", "project"]);
  for (const raw of input.annotations) {
    if (!isRecord(raw)) return { ok: false, error: "An annotation record in this bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const sourceUnitId = stringValue(raw.sourceUnitId, 200);
    const kind = stringValue(raw.kind, 40);
    const status = stringValue(raw.status, 20);
    const visibility = stringValue(raw.visibility, 20);
    const body = stringValue(raw.body, 20_000, true);
    const selectorKind = stringValue(raw.selectorKind, 60);
    const startOffset = finiteNumberOrNull(raw.startOffset);
    const endOffset = finiteNumberOrNull(raw.endOffset);
    const startSeconds = finiteNumberOrNull(raw.startSeconds);
    const endSeconds = finiteNumberOrNull(raw.endSeconds);
    const exactText = nullableString(raw.exactText, MAX_SOURCE_TEXT_BYTES);
    const prefixText = nullableString(raw.prefixText, MAX_SOURCE_TEXT_BYTES);
    const suffixText = nullableString(raw.suffixText, MAX_SOURCE_TEXT_BYTES);
    const sourceFingerprint = nullableString(raw.sourceFingerprint, 128);
    const source = sources.find((candidate) => candidate.id === sourceUnitId);
    const rawTagIds = Array.isArray(raw.tagIds) ? raw.tagIds.filter((value): value is string => typeof value === "string") : null;
    if (!id || !sourceUnitId || !sourceIds.has(sourceUnitId) || !kind || !supportedKinds.has(kind)
      || !status || !supportedStatuses.has(status) || !visibility || !supportedVisibilities.has(visibility) || body == null || !selectorKind
      || startOffset === undefined || endOffset === undefined || startSeconds === undefined || endSeconds === undefined
      || exactText === undefined || prefixText === undefined || suffixText === undefined || sourceFingerprint === undefined
      || !rawTagIds || rawTagIds.some((tagId) => !tagIds.has(tagId))) {
      return { ok: false, error: "An annotation record in this bundle is incomplete or references missing evidence." };
    }
    if (selectorKind === "text-quote") {
      if (!source?.immutableText || startOffset == null || endOffset == null || exactText == null
        || source.immutableText.slice(startOffset, endOffset) !== exactText) {
        return { ok: false, error: "A text annotation no longer matches the preserved source bytes in this bundle." };
      }
    }
    annotations.push({
      id, sourceUnitId, kind, status, visibility, body, selectorKind,
      startOffset, endOffset, exactText,
      prefixText,
      suffixText,
      startSeconds,
      endSeconds,
      sourceFingerprint,
      provenanceJson: isRecord(raw.provenanceJson) ? raw.provenanceJson : {},
      tagIds: rawTagIds,
      revisions: Array.isArray(raw.revisions) ? raw.revisions.slice(0, 10_000) : [],
    });
  }

  const annotationIds = new Set(annotations.map((annotation) => annotation.id));
  const writingUses: PortableResearchWritingUse[] = [];
  for (const raw of input.writingUses) {
    if (!isRecord(raw)) return { ok: false, error: "A writing-use record in this bundle is invalid." };
    const id = stringValue(raw.id, 200);
    const annotationId = stringValue(raw.annotationId, 200);
    const documentId = stringValue(raw.documentId, 200);
    const blockId = stringValue(raw.blockId, 200);
    const useKind = stringValue(raw.useKind, 100);
    const citationKey = stringValue(raw.citationKey, 500);
    const quoteSnapshot = stringValue(raw.quoteSnapshot, MAX_SOURCE_TEXT_BYTES, true);
    const citationLabel = stringValue(raw.citationLabel, 2_000, true);
    const archivedAt = safeDateString(raw.archivedAt, true);
    const createdAt = safeDateString(raw.createdAt);
    if (!id || !annotationId || !annotationIds.has(annotationId) || !documentId || !blockId || !useKind || !citationKey
      || quoteSnapshot == null || citationLabel == null || archivedAt === undefined || !createdAt) {
      return { ok: false, error: "A writing-use record is incomplete or references an unavailable annotation." };
    }
    writingUses.push({
      id,
      annotationId,
      documentId,
      blockId,
      useKind,
      citationKey,
      quoteSnapshot,
      citationLabel,
      sourceJson: isRecord(raw.sourceJson) ? raw.sourceJson : {},
      archivedAt,
      createdAt,
    });
  }
  if (new Set(writingUses.map((use) => use.id)).size !== writingUses.length) {
    return { ok: false, error: "The research bundle repeats a writing-use identity." };
  }

  const rawWritingTargets = input.writingTargets == null ? [] : input.writingTargets;
  if (!Array.isArray(rawWritingTargets) || rawWritingTargets.length > MAX_WRITING_USES) {
    return { ok: false, error: "The research bundle has invalid or unsafe writing-target counts." };
  }
  const writingUseById = new Map(writingUses.map((use) => [use.id, use]));
  const writingTargets: PortableResearchWritingTarget[] = [];
  for (const raw of rawWritingTargets) {
    if (!isRecord(raw) || !isRecord(raw.document) || !isRecord(raw.block)) {
      return { ok: false, error: "A writing-target snapshot in this bundle is invalid." };
    }
    const useId = stringValue(raw.useId, 200);
    const use = useId ? writingUseById.get(useId) : null;
    const documentId = stringValue(raw.document.id, 200);
    const documentStableId = stringValue(raw.document.stableId, 500);
    const documentTitle = stringValue(raw.document.title, 500);
    const documentSourceLabel = nullableString(raw.document.sourceLabel, 2_000);
    const documentSourcePath = nullableString(raw.document.sourcePath, 4_000);
    const documentProjectionStatus = stringValue(raw.document.projectionStatus, 100);
    const documentUpdatedAt = safeDateString(raw.document.updatedAt);
    const blockId = stringValue(raw.block.id, 200);
    const blockStableId = stringValue(raw.block.stableId, 500);
    const blockOrder = typeof raw.block.order === "number" && Number.isSafeInteger(raw.block.order) && raw.block.order >= 0
      ? raw.block.order
      : null;
    const blockTitle = nullableString(raw.block.title, 500);
    const blockBody = stringValue(raw.block.body, MAX_SOURCE_TEXT_BYTES, true);
    const blockSourceLabel = nullableString(raw.block.sourceLabel, 2_000);
    const blockSourcePath = nullableString(raw.block.sourcePath, 4_000);
    const blockExternalId = nullableString(raw.block.externalId, 2_000);
    const blockProjectionStatus = stringValue(raw.block.projectionStatus, 100);
    const blockArchivedAt = safeDateString(raw.block.archivedAt, true);
    const blockUpdatedAt = safeDateString(raw.block.updatedAt);
    if (!useId || !use || !documentId || documentId !== use.documentId || !documentStableId || !documentTitle
      || documentSourceLabel === undefined || documentSourcePath === undefined || !documentProjectionStatus
      || typeof raw.document.isPrivate !== "boolean" || !documentUpdatedAt || !blockId || blockId !== use.blockId
      || !blockStableId || blockOrder == null || blockTitle === undefined || blockBody == null
      || blockSourceLabel === undefined || blockSourcePath === undefined || blockExternalId === undefined
      || !blockProjectionStatus || typeof raw.block.isPrivate !== "boolean"
      || blockArchivedAt === undefined || !blockUpdatedAt) {
      return { ok: false, error: "A writing-target snapshot is incomplete or does not match its writing-use link." };
    }
    writingTargets.push({
      useId,
      document: {
        id: documentId,
        stableId: documentStableId,
        title: documentTitle,
        sourceLabel: documentSourceLabel,
        sourcePath: documentSourcePath,
        projectionStatus: documentProjectionStatus,
        isPrivate: raw.document.isPrivate,
        updatedAt: documentUpdatedAt,
      },
      block: {
        id: blockId,
        stableId: blockStableId,
        order: blockOrder,
        title: blockTitle,
        body: blockBody,
        sourceLabel: blockSourceLabel,
        sourcePath: blockSourcePath,
        externalId: blockExternalId,
        projectionStatus: blockProjectionStatus,
        isPrivate: raw.block.isPrivate,
        archivedAt: blockArchivedAt,
        updatedAt: blockUpdatedAt,
      },
    });
  }
  if (new Set(writingTargets.map((target) => target.useId)).size !== writingTargets.length) {
    return { ok: false, error: "The research bundle repeats a writing-target identity." };
  }

  const documentSnapshots = new Map<string, string>();
  for (const target of writingTargets) {
    const snapshot = stableResearchJson(target.document);
    const prior = documentSnapshots.get(target.document.id);
    if (prior && prior !== snapshot) {
      return { ok: false, error: "Writing-target links disagree about their shared document snapshot." };
    }
    documentSnapshots.set(target.document.id, snapshot);
  }

  if (Number(integrity?.sourceCount) !== sources.length
    || Number(integrity?.annotationCount) !== annotations.length
    || Number(integrity?.writingUseCount) !== writingUses.length
    || (input.writingTargets != null && Number(integrity?.writingTargetCount) !== writingTargets.length)) {
    return { ok: false, error: "The research bundle counts do not match its integrity manifest." };
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: RESEARCH_EXPORT_SCHEMA_VERSION,
      exportedAt,
      project: { id: projectId, slug: projectSlug, name: projectName, updatedAt: projectUpdatedAt },
      sources,
      tags,
      annotations,
      writingUses,
      writingTargets,
      boundaries: isRecord(input.boundaries) ? input.boundaries : {},
      manifestSha256: expectedManifest,
    },
  };
}
