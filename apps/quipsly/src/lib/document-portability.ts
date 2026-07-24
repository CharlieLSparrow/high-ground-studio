import { createHash } from "node:crypto";

export const DOCUMENT_EXPORT_SCHEMA_VERSION = "quipsly-document-export-v1";

const MAX_BLOCKS = 10_000;
const MAX_SPANS = 100_000;
const MAX_CITATIONS = 100_000;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;

export type PortableDocumentSpan = {
  id: string;
  tagSlug: string;
  tagLabel: string;
  tagCategory: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
};

export type PortableDocumentCitation = {
  id: string;
  annotationId: string;
  useKind: string;
  citationKey: string;
  quoteSnapshot: string;
  citationLabel: string;
  sourceJson: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
};

export type PortableDocumentBlock = {
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
  spans: PortableDocumentSpan[];
  citations: PortableDocumentCitation[];
};

export type PortableDocumentSnapshot = {
  document: {
    id: string;
    stableId: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
    title: string;
    sourceLabel: string | null;
    sourcePath: string | null;
    projectionStatus: string;
    isPrivate: boolean;
  };
  blocks: PortableDocumentBlock[];
};

export type PortableDocumentBundle = {
  schemaVersion: typeof DOCUMENT_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  snapshot: PortableDocumentSnapshot;
  integrity: {
    algorithm: "sha256";
    snapshotSha256: string;
    blockCount: number;
    spanCount: number;
    citationCount: number;
  };
};

export type DocumentBundleValidationResult =
  | { ok: true; bundle: PortableDocumentBundle }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableDocumentJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableDocumentJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableDocumentJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function documentSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringValue(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && value.trim().length === 0)) return null;
  return value;
}

function nullableString(value: unknown, max: number) {
  if (value == null) return null;
  const parsed = stringValue(value, max, true);
  return parsed == null ? undefined : parsed;
}

function safeDate(value: unknown, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) return undefined;
  return value;
}

function safeProjectionStatus(value: unknown) {
  return typeof value === "string" && ["private", "draft", "review", "approved", "published", "not_public", "projection_not_approved"].includes(value)
    ? value
    : null;
}

export function validateDocumentBundle(input: unknown): DocumentBundleValidationResult {
  if (!isRecord(input) || input.schemaVersion !== DOCUMENT_EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: `Choose a Quipsly writing export using schema ${DOCUMENT_EXPORT_SCHEMA_VERSION}.` };
  }
  if (!safeDate(input.exportedAt) || !isRecord(input.snapshot) || !isRecord(input.snapshot.document) || !Array.isArray(input.snapshot.blocks)) {
    return { ok: false, error: "The writing export is incomplete." };
  }
  if (input.snapshot.blocks.length > MAX_BLOCKS || !isRecord(input.integrity)) {
    return { ok: false, error: "The writing export has invalid or unsafe record counts." };
  }

  const rawDocument = input.snapshot.document;
  const documentId = stringValue(rawDocument.id, 200);
  const documentStableId = stringValue(rawDocument.stableId, 500);
  const projectId = stringValue(rawDocument.projectId, 200);
  const projectSlug = stringValue(rawDocument.projectSlug, 200);
  const projectName = stringValue(rawDocument.projectName, 500);
  const title = stringValue(rawDocument.title, 500);
  const sourceLabel = nullableString(rawDocument.sourceLabel, 2_000);
  const sourcePath = nullableString(rawDocument.sourcePath, 4_000);
  const projectionStatus = safeProjectionStatus(rawDocument.projectionStatus);
  if (!documentId || !documentStableId || !projectId || !projectSlug || !projectName || !title
    || sourceLabel === undefined || sourcePath === undefined || !projectionStatus || typeof rawDocument.isPrivate !== "boolean") {
    return { ok: false, error: "The writing export document identity is incomplete." };
  }

  const blocks: PortableDocumentBlock[] = [];
  let textBytes = 0;
  let spanCount = 0;
  let citationCount = 0;
  const blockIds = new Set<string>();
  const stableIds = new Set<string>();
  const orders = new Set<number>();

  for (const rawBlock of input.snapshot.blocks) {
    if (!isRecord(rawBlock) || !Array.isArray(rawBlock.spans) || !Array.isArray(rawBlock.citations)) {
      return { ok: false, error: "A block in the writing export is invalid." };
    }
    const id = stringValue(rawBlock.id, 200);
    const stableId = stringValue(rawBlock.stableId, 500);
    const order = typeof rawBlock.order === "number" && Number.isSafeInteger(rawBlock.order) && rawBlock.order >= 0 ? rawBlock.order : null;
    const blockTitle = nullableString(rawBlock.title, 500);
    const body = stringValue(rawBlock.body, MAX_TEXT_BYTES, true);
    const blockSourceLabel = nullableString(rawBlock.sourceLabel, 2_000);
    const blockSourcePath = nullableString(rawBlock.sourcePath, 4_000);
    const externalId = nullableString(rawBlock.externalId, 2_000);
    const blockProjectionStatus = safeProjectionStatus(rawBlock.projectionStatus);
    if (!id || !stableId || order == null || blockTitle === undefined || body == null
      || blockSourceLabel === undefined || blockSourcePath === undefined || externalId === undefined
      || !blockProjectionStatus || typeof rawBlock.isPrivate !== "boolean") {
      return { ok: false, error: "A block in the writing export is incomplete." };
    }
    if (blockIds.has(id) || stableIds.has(stableId) || orders.has(order)) {
      return { ok: false, error: "The writing export repeats a block identity, stable identity, or order." };
    }
    blockIds.add(id);
    stableIds.add(stableId);
    orders.add(order);
    textBytes += Buffer.byteLength(body, "utf8");
    if (textBytes > MAX_TEXT_BYTES) return { ok: false, error: "The writing export contains too much text for this restore lane." };

    const spans: PortableDocumentSpan[] = [];
    for (const rawSpan of rawBlock.spans) {
      if (!isRecord(rawSpan)) return { ok: false, error: "A tagged span in the writing export is invalid." };
      const spanId = stringValue(rawSpan.id, 200);
      const tagSlug = stringValue(rawSpan.tagSlug, 200);
      const tagLabel = stringValue(rawSpan.tagLabel, 300);
      const tagCategory = stringValue(rawSpan.tagCategory, 100);
      const startOffset = typeof rawSpan.startOffset === "number" && Number.isSafeInteger(rawSpan.startOffset) && rawSpan.startOffset >= 0 ? rawSpan.startOffset : null;
      const endOffset = typeof rawSpan.endOffset === "number" && Number.isSafeInteger(rawSpan.endOffset) && rawSpan.endOffset >= 0 ? rawSpan.endOffset : null;
      const selectedText = stringValue(rawSpan.selectedText, MAX_TEXT_BYTES, true);
      if (!spanId || !tagSlug || !tagLabel || !tagCategory || startOffset == null || endOffset == null || endOffset < startOffset
        || endOffset > body.length || selectedText == null || body.slice(startOffset, endOffset) !== selectedText) {
        return { ok: false, error: "A tagged span no longer matches its writing block." };
      }
      spans.push({ id: spanId, tagSlug, tagLabel, tagCategory, startOffset, endOffset, selectedText });
    }
    spanCount += spans.length;
    if (spanCount > MAX_SPANS) return { ok: false, error: "The writing export contains too many tagged spans." };

    const citations: PortableDocumentCitation[] = [];
    for (const rawCitation of rawBlock.citations) {
      if (!isRecord(rawCitation)) return { ok: false, error: "A citation in the writing export is invalid." };
      const citationId = stringValue(rawCitation.id, 200);
      const annotationId = stringValue(rawCitation.annotationId, 200);
      const useKind = stringValue(rawCitation.useKind, 100);
      const citationKey = stringValue(rawCitation.citationKey, 500);
      const quoteSnapshot = stringValue(rawCitation.quoteSnapshot, MAX_TEXT_BYTES, true);
      const citationLabel = stringValue(rawCitation.citationLabel, 2_000, true);
      const archivedAt = safeDate(rawCitation.archivedAt, true);
      const createdAt = safeDate(rawCitation.createdAt);
      if (!citationId || !annotationId || !useKind || !citationKey || quoteSnapshot == null || citationLabel == null
        || archivedAt === undefined || !createdAt) {
        return { ok: false, error: "A citation in the writing export is incomplete." };
      }
      citations.push({
        id: citationId,
        annotationId,
        useKind,
        citationKey,
        quoteSnapshot,
        citationLabel,
        sourceJson: isRecord(rawCitation.sourceJson) ? rawCitation.sourceJson : {},
        archivedAt,
        createdAt,
      });
    }
    citationCount += citations.length;
    if (citationCount > MAX_CITATIONS) return { ok: false, error: "The writing export contains too many citations." };

    blocks.push({
      id, stableId, order, title: blockTitle, body,
      sourceLabel: blockSourceLabel, sourcePath: blockSourcePath, externalId,
      projectionStatus: blockProjectionStatus, isPrivate: rawBlock.isPrivate,
      spans, citations,
    });
  }

  const snapshot: PortableDocumentSnapshot = {
    document: {
      id: documentId, stableId: documentStableId, projectId, projectSlug, projectName, title,
      sourceLabel, sourcePath, projectionStatus, isPrivate: rawDocument.isPrivate,
    },
    blocks: blocks.sort((left, right) => left.order - right.order),
  };
  const expectedHash = stringValue(input.integrity.snapshotSha256, 64);
  const actualHash = documentSha256(stableDocumentJson(snapshot));
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== actualHash) {
    return { ok: false, error: "The writing export SHA-256 receipt does not match its contents. Nothing was restored." };
  }
  if (Number(input.integrity.blockCount) !== blocks.length
    || Number(input.integrity.spanCount) !== spanCount
    || Number(input.integrity.citationCount) !== citationCount) {
    return { ok: false, error: "The writing export counts do not match its integrity receipt." };
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: DOCUMENT_EXPORT_SCHEMA_VERSION,
      exportedAt: input.exportedAt as string,
      snapshot,
      integrity: { algorithm: "sha256", snapshotSha256: expectedHash, blockCount: blocks.length, spanCount, citationCount },
    },
  };
}
