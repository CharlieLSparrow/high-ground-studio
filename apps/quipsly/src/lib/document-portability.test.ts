/** @jest-environment node */

import {
  DOCUMENT_EXPORT_SCHEMA_VERSION,
  documentSha256,
  stableDocumentJson,
  validateDocumentBundle,
} from "./document-portability";

function bundle(overrides: Record<string, unknown> = {}) {
  const snapshot = {
    document: {
      id: "document-1",
      stableId: "document-stable-1",
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      projectName: "High Ground Odyssey",
      title: "Episode evidence draft",
      sourceLabel: "document-kind:draft",
      sourcePath: null,
      projectionStatus: "private",
      isPrivate: true,
    },
    blocks: [{
      id: "block-1",
      stableId: "block-stable-1",
      order: 0,
      title: "Opening",
      body: "Preserved evidence supports this draft.",
      sourceLabel: "Source one",
      sourcePath: null,
      externalId: "annotation:annotation-1",
      projectionStatus: "private",
      isPrivate: true,
      spans: [{
        id: "span-1",
        tagSlug: "quote",
        tagLabel: "Quote",
        tagCategory: "meaning",
        startOffset: 0,
        endOffset: 18,
        selectedText: "Preserved evidence",
      }],
      citations: [{
        id: "use-1",
        annotationId: "annotation-1",
        useKind: "evidence",
        citationKey: "source-1",
        quoteSnapshot: "Preserved evidence",
        citationLabel: "Source one",
        sourceJson: { immutable: true },
        archivedAt: null,
        createdAt: "2026-07-19T18:00:00.000Z",
      }],
    }],
  };
  const payload = {
    schemaVersion: DOCUMENT_EXPORT_SCHEMA_VERSION,
    exportedAt: "2026-07-19T19:00:00.000Z",
    snapshot,
    integrity: {
      algorithm: "sha256",
      snapshotSha256: documentSha256(stableDocumentJson(snapshot)),
      blockCount: 1,
      spanCount: 1,
      citationCount: 1,
    },
    ...overrides,
  };
  return payload;
}

describe("writing document portability", () => {
  it("accepts a stable document with exact tags and citation receipts", () => {
    expect(validateDocumentBundle(bundle())).toMatchObject({
      ok: true,
      bundle: {
        snapshot: { blocks: [{ id: "block-1", citations: [{ id: "use-1" }] }] },
        integrity: { blockCount: 1, spanCount: 1, citationCount: 1 },
      },
    });
  });

  it("rejects edited content after the SHA-256 receipt was issued", () => {
    const input = bundle();
    input.snapshot.blocks[0].body = "Changed after export.";
    expect(validateDocumentBundle(input)).toEqual({
      ok: false,
      error: "A tagged span no longer matches its writing block.",
    });
  });

  it("rejects duplicate stable block identities", () => {
    const input = bundle();
    const second = { ...input.snapshot.blocks[0], id: "block-2", order: 1, spans: [], citations: [] };
    input.snapshot.blocks.push(second);
    input.integrity.snapshotSha256 = documentSha256(stableDocumentJson(input.snapshot));
    input.integrity.blockCount = 2;
    expect(validateDocumentBundle(input)).toEqual({
      ok: false,
      error: "The writing export repeats a block identity, stable identity, or order.",
    });
  });

  it("rejects a citation-count receipt that disagrees with the payload", () => {
    const input = bundle();
    input.integrity.citationCount = 0;
    expect(validateDocumentBundle(input)).toEqual({
      ok: false,
      error: "The writing export counts do not match its integrity receipt.",
    });
  });
});
