/** @jest-environment node */

import { researchSha256, stableResearchJson, validateResearchBundle } from "./research-portability";

function bundle(overrides: Record<string, unknown> = {}) {
  const payload = {
    schemaVersion: "quipsly-research-export-v1",
    exportedAt: "2026-07-18T20:00:00.000Z",
    project: { id: "project-source", slug: "source-nest", name: "Source Nest", updatedAt: "2026-07-18T19:00:00.000Z" },
    sources: [{
      id: "source-1", slug: "source-one", kind: "article", title: "Source one", sourceUrl: null, sourcePath: "source.md",
      author: "Charlie", capturedAt: null, immutableText: "Preserved evidence.",
      immutableTextSha256: researchSha256("Preserved evidence."), editableNotes: null, metadataJson: {},
    }],
    tags: [{ id: "tag-1", slug: "episode-seed", label: "Episode seed", description: null, category: "meaning", isPrivate: false }],
    annotations: [{
      id: "annotation-1", sourceUnitId: "source-1", kind: "claim", status: "active", visibility: "project", body: "Use this.",
      selectorKind: "text-quote", startOffset: 0, endOffset: 19, exactText: "Preserved evidence.", prefixText: "", suffixText: "",
      startSeconds: null, endSeconds: null, sourceFingerprint: researchSha256("Preserved evidence."), provenanceJson: {}, tagIds: ["tag-1"],
      revisions: [{ revision: 1, operation: "created" }],
    }],
    writingUses: [],
    writingTargets: [],
    boundaries: { actorScoped: true, sourceMutated: false },
    ...overrides,
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      manifestSha256: researchSha256(stableResearchJson(payload)),
      sourceCount: payload.sources.length,
      annotationCount: payload.annotations.length,
      writingUseCount: payload.writingUses.length,
      writingTargetCount: payload.writingTargets.length,
    },
  };
}

describe("research portability validation", () => {
  it("accepts a self-consistent immutable source bundle", () => {
    const result = validateResearchBundle(bundle());
    expect(result).toMatchObject({
      ok: true,
      bundle: {
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sources: [{ immutableText: "Preserved evidence." }],
        annotations: [{ exactText: "Preserved evidence." }],
      },
    });
  });

  it("rejects content changed after the manifest was created", () => {
    const input = bundle();
    input.sources[0].immutableText = "Changed evidence.";
    const result = validateResearchBundle(input);
    expect(result).toEqual({ ok: false, error: "The research bundle manifest does not match its contents. Nothing was restored." });
  });

  it("rejects an anchor that does not match preserved source text even with a recomputed manifest", () => {
    const input = bundle({
      annotations: [{
        id: "annotation-1", sourceUnitId: "source-1", kind: "claim", status: "active", visibility: "project", body: "Use this.",
        selectorKind: "text-quote", startOffset: 1, endOffset: 19, exactText: "Preserved evidence.", prefixText: "", suffixText: "",
        startSeconds: null, endSeconds: null, sourceFingerprint: researchSha256("Preserved evidence."), provenanceJson: {}, tagIds: ["tag-1"], revisions: [],
      }],
    });
    const result = validateResearchBundle(input);
    expect(result).toEqual({ ok: false, error: "A text annotation no longer matches the preserved source bytes in this bundle." });
  });

  it("accepts a verified writing-use target snapshot", () => {
    const writingUses = [{
      id: "use-1", annotationId: "annotation-1", documentId: "document-1", blockId: "block-1",
      useKind: "evidence", citationKey: "source-1", quoteSnapshot: "Preserved evidence.", citationLabel: "Source one",
      sourceJson: { sourceMutated: false }, archivedAt: null, createdAt: "2026-07-18T19:30:00.000Z",
    }];
    const writingTargets = [{
      useId: "use-1",
      document: {
        id: "document-1", stableId: "draft-1", title: "Draft one", sourceLabel: null, sourcePath: null,
        projectionStatus: "draft", isPrivate: true, updatedAt: "2026-07-18T19:40:00.000Z",
      },
      block: {
        id: "block-1", stableId: "opening-1", order: 1, title: "Opening", body: "A source-backed paragraph.",
        sourceLabel: "Source one", sourcePath: null, externalId: "annotation:annotation-1",
        projectionStatus: "draft", isPrivate: true, archivedAt: null, updatedAt: "2026-07-18T19:40:00.000Z",
      },
    }];
    const result = validateResearchBundle(bundle({ writingUses, writingTargets }));
    expect(result).toMatchObject({
      ok: true,
      bundle: { writingUses: [{ id: "use-1" }], writingTargets: [{ useId: "use-1", block: { id: "block-1" } }] },
    });
  });

  it("rejects a writing target rebound to a different block", () => {
    const writingUses = [{
      id: "use-1", annotationId: "annotation-1", documentId: "document-1", blockId: "block-1",
      useKind: "evidence", citationKey: "source-1", quoteSnapshot: "Preserved evidence.", citationLabel: "Source one",
      sourceJson: {}, archivedAt: null, createdAt: "2026-07-18T19:30:00.000Z",
    }];
    const writingTargets = [{
      useId: "use-1",
      document: { id: "document-1", stableId: "draft-1", title: "Draft one", sourceLabel: null, sourcePath: null, projectionStatus: "draft", isPrivate: true, updatedAt: "2026-07-18T19:40:00.000Z" },
      block: { id: "other-block", stableId: "opening-1", order: 1, title: null, body: "Body", sourceLabel: null, sourcePath: null, externalId: null, projectionStatus: "draft", isPrivate: true, archivedAt: null, updatedAt: "2026-07-18T19:40:00.000Z" },
    }];
    const result = validateResearchBundle(bundle({ writingUses, writingTargets }));
    expect(result).toEqual({ ok: false, error: "A writing-target snapshot is incomplete or does not match its writing-use link." });
  });
});
