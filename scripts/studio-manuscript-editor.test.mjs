import assert from "node:assert/strict";
import { test } from "node:test";

import {
  manuscriptHelpNotes,
} from "../apps/studio/src/app/manuscript/manuscript-help-notes.ts";
import {
  collectBlockSummaries,
  collectCitedQuotationHighlights,
  collectManuscriptBlockDetails,
  collectSemanticHighlights,
  collectStructureRegionSummaries,
  countMissingBlockIds,
  countWordsAndCharacters,
  createBackupFileName,
  createBlockFilterOptions,
  createBlockRangeSummary,
  createCitedQuotationMarkdown,
  createDefaultManuscriptQuoteReview,
  ensureManuscriptBlockIds,
  createManuscriptDraftCheckpointKey,
  createFilteredBlockListMarkdown,
  createFocusVisibleBlockIds,
  createManuscriptImportSummary,
  createManuscriptSnapshotMetadata,
  createAuthorContributionMarkdown,
  createChapterEpisodeExportOptions,
  createPublishingPacketMarkdown,
  createPublishReadinessReport,
  createQuoteReviewAppendixMarkdown,
  createRealManuscriptReadinessGate,
  createRecordingHandoffMarkdown,
  createStructureRegionDefaultTitle,
  createStructureOutlineMarkdown,
  createSyntheticManuscriptSmokeDraft,
  filterCitedQuotationsByReviewStatus,
  filterManuscriptBlocks,
  hasMeaningfulManuscriptDraft,
  isSyntheticManuscriptSmokeDraft,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  manuscriptFilterVisualModeDefinitions,
  manuscriptQuoteReviewStatusFilterDefinitions,
  manuscriptQuoteReviewStatusDefinitions,
  manuscriptQuoteSourceTypeDefinitions,
  manuscriptStructureDefinitions,
  manuscriptStructureLabelPresets,
  moveManuscriptStructureRegionWithinKind,
  removeManuscriptQuoteReview,
  safeManuscriptDraft,
  safeManuscriptQuoteReviews,
  safeManuscriptStructureRegions,
  semanticHighlightDefinitions,
  suggestBookStructureRegionsFromHeadings,
  summarizeBlockFilterResults,
  summarizeCitedQuotationReviewProgress,
  summarizeAuthorMarkedSpans,
  updateManuscriptQuoteReview,
  updateManuscriptStructureRegion,
  validateEditorJsonShape,
} from "../apps/studio/src/app/manuscript/manuscript-editor-model.ts";

const editorJson = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: {
        blockId: "block-1",
      },
      content: [
        {
          type: "text",
          text: "Homer wrote this first.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "homer",
                authorLabel: "Homer / Scott",
              },
            },
          ],
        },
        {
          type: "text",
          text: " Charlie added this insight.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "charlie",
                authorLabel: "Charlie",
              },
            },
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "semantic-1",
                tagType: "insight",
                label: "Insight",
                colorKey: "insight",
                note: "important",
                createdAt: "2026-05-19T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
  ],
};

test("manuscript storage key is stable", () => {
  assert.equal(MANUSCRIPT_STORAGE_KEY, "high-ground-studio.manuscript-editor.v1");
  assert.equal(MANUSCRIPT_SCHEMA_VERSION, 1);
});

test("manuscript help notes cover the confusing desk concepts", () => {
  const requiredNoteIds = [
    "browser-local-draft",
    "full-draft-json-backup",
    "server-snapshot",
    "save-snapshot",
    "load-latest-snapshot",
    "load-selected-snapshot",
    "local-changes-since-server-save",
    "recording-reading-mode",
    "focus-view",
    "author-marks",
    "semantic-meaning-tags",
    "cited-quotation",
    "quote-review-metadata",
    "structure-region",
    "chapter-book-region",
    "episode-region",
    "backup-mode",
    "mark-mode",
    "find-mode",
    "quotes-mode",
    "publish-mode",
    "publishing-packet",
    "recording-handoff-packet",
    "publish-readiness-report",
    "quote-review-appendix",
    "author-contribution-export",
    "synthetic-smoke-draft",
    "real-manuscript-readiness-gate",
    "phone-load-smoke",
    "first-real-manuscript-import",
  ];

  for (const id of requiredNoteIds) {
    const note = manuscriptHelpNotes[id];

    assert.equal(note.id, id);
    assert.ok(note.label.length > 0);
    assert.ok(note.title.length > 0);
    assert.ok(note.body.length > 24);
  }

  assert.match(manuscriptHelpNotes["server-snapshot"].whatItDoesNot ?? "", /not autosave/i);
  assert.match(manuscriptHelpNotes["focus-view"].whatItDoesNot ?? "", /does not delete/i);
});

test("author and semantic definitions contain the MVP options", () => {
  assert.deepEqual(
    manuscriptAuthorDefinitions.map((author) => author.id),
    ["charlie", "homer", "unassigned"],
  );
  assert.deepEqual(
    semanticHighlightDefinitions.map((tag) => tag.id),
    [
      "quote",
      "cited-quotation",
      "quote-candidate",
      "story",
      "insight",
      "research",
      "question",
      "needs-review",
      "thesis",
      "transition",
    ],
  );
  assert.deepEqual(
    manuscriptStructureDefinitions.map((definition) => definition.id),
    ["chapter", "episode", "section"],
  );
  assert.deepEqual(
    manuscriptStructureLabelPresets.map((preset) => preset.id),
    [
      "preface",
      "introduction",
      "chapter-0",
      "chapter",
      "interlude",
      "appendix",
      "custom",
    ],
  );
  assert.deepEqual(
    manuscriptQuoteReviewStatusDefinitions.map((status) => status.id),
    ["needs-source", "needs-verification", "verified", "do-not-use"],
  );
  assert.deepEqual(
    manuscriptQuoteReviewStatusFilterDefinitions.map((status) => status.id),
    [
      "needs-source",
      "needs-verification",
      "verified",
      "do-not-use",
      "no-review-metadata",
    ],
  );
  assert.deepEqual(
    manuscriptQuoteSourceTypeDefinitions.map((sourceType) => sourceType.id),
    ["book", "article", "speech", "interview", "scripture", "unknown", "other"],
  );
  assert.deepEqual(
    manuscriptFilterVisualModeDefinitions.map((mode) => mode.id),
    ["highlight-matches", "dim-nonmatches", "hide-nonmatches"],
  );
});

test("safeManuscriptDraft accepts a valid draft", () => {
  const draft = {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: "Book draft",
    sourceFileName: "source.docx",
    importSummary: {
      sourceFileName: "source.docx",
      words: 8,
      characters: 52,
      blocks: 1,
      importedAt: "2026-05-19T12:00:00.000Z",
    },
    structureRegions: [
      {
        id: "structure-1",
        kind: "chapter",
        title: "Chapter 1",
        startBlockId: "block-1",
        endBlockId: "block-1",
        order: 1,
        colorKey: "chapter",
        notes: "Synthetic chapter example.",
        createdAt: "2026-05-19T12:00:00.000Z",
        updatedAt: "2026-05-19T12:00:00.000Z",
      },
    ],
    quoteReviews: {
      "semantic-1": {
        highlightId: "semantic-1",
        attributedTo: "Synthetic thinker",
        sourceTitle: "Synthetic Source",
        sourceType: "book",
        locator: "p. 12",
        citationText: "Synthetic Source, p. 12",
        reviewStatus: "needs-verification",
        rightsNote: "Synthetic rights note.",
        editorNote: "Synthetic editor note.",
        updatedAt: "2026-05-19T12:00:00.000Z",
      },
    },
    editorJson,
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-19T12:00:00.000Z",
  };

  assert.deepEqual(safeManuscriptDraft(draft), draft);
});

test("createManuscriptSnapshotMetadata summarizes a synthetic draft", () => {
  const draft = {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: " Snapshot draft ",
    sourceFileName: "synthetic.docx",
    importSummary: null,
    structureRegions: [
      {
        id: "structure-1",
        kind: "chapter",
        title: "Chapter One",
        startBlockId: "block-1",
        endBlockId: "block-1",
        order: 1,
        colorKey: "chapter",
        notes: "",
        createdAt: "2026-05-20T12:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
    ],
    quoteReviews: {
      "semantic-quote-1": {
        highlightId: "semantic-quote-1",
        attributedTo: "Synthetic speaker",
        sourceTitle: "Synthetic Source",
        sourceType: "book",
        locator: "p. 1",
        citationText: "Synthetic citation",
        reviewStatus: "verified",
        rightsNote: "",
        editorNote: "",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
    },
    editorJson: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            blockId: "block-1",
          },
          content: [
            {
              type: "text",
              text: "Synthetic quote text.",
              marks: [
                {
                  type: "semanticHighlightMark",
                  attrs: {
                    highlightId: "semantic-quote-1",
                    tagType: "cited-quotation",
                    label: "Cited quotation",
                    colorKey: "cited-quotation",
                    note: "Synthetic source note",
                    createdAt: "2026-05-20T12:00:00.000Z",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-20T12:05:00.000Z",
  };

  assert.deepEqual(createManuscriptSnapshotMetadata(draft), {
    title: "Snapshot draft",
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    sourceFileName: "synthetic.docx",
    clientUpdatedAt: "2026-05-20T12:05:00.000Z",
    words: 3,
    characters: 21,
    blocks: 1,
    structureRegions: 1,
    citedQuotations: 1,
    quoteReviews: 1,
  });
});

test("createManuscriptDraftCheckpointKey ignores local save timestamp churn", () => {
  const draft = {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: "Checkpoint draft",
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
    quoteReviews: {},
    editorJson,
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-20T12:05:00.000Z",
  };

  assert.equal(
    createManuscriptDraftCheckpointKey(draft),
    createManuscriptDraftCheckpointKey({
      ...draft,
      lastUpdatedAt: "2026-05-20T12:10:00.000Z",
    }),
  );
  assert.notEqual(
    createManuscriptDraftCheckpointKey(draft),
    createManuscriptDraftCheckpointKey({
      ...draft,
      title: "Changed checkpoint draft",
    }),
  );
});

test("safeManuscriptDraft defaults older drafts to no structure regions", () => {
  const parsed = safeManuscriptDraft({
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: "Older draft",
    sourceFileName: null,
    importSummary: null,
    editorJson,
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: null,
  });

  assert.deepEqual(parsed?.structureRegions, []);
  assert.deepEqual(parsed?.quoteReviews, {});
});

test("safeManuscriptDraft rejects invalid draft envelopes", () => {
  assert.equal(
    safeManuscriptDraft({
      schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
      title: "Book draft",
      sourceFileName: "source.docx",
      editorJson,
      activeAuthorId: "invalid",
      showAuthorColors: true,
      showSemanticColors: true,
      lastUpdatedAt: null,
    }),
    null,
  );

  assert.equal(
    safeManuscriptDraft({
      schemaVersion: 999,
      title: "Book draft",
      sourceFileName: null,
      editorJson,
      activeAuthorId: "homer",
      showAuthorColors: true,
      showSemanticColors: true,
      lastUpdatedAt: null,
    }),
    null,
  );

  assert.equal(
    safeManuscriptDraft({
      schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
      title: "Book draft",
      sourceFileName: null,
      importSummary: null,
      structureRegions: [],
      quoteReviews: {
        "semantic-1": {
          highlightId: "semantic-1",
          attributedTo: "",
          sourceTitle: "",
          sourceType: "unknown",
          locator: "",
          citationText: "",
          reviewStatus: "invented-status",
          rightsNote: "",
          editorNote: "",
          updatedAt: "2026-05-19T12:00:00.000Z",
        },
      },
      editorJson,
      activeAuthorId: "homer",
      showAuthorColors: true,
      showSemanticColors: true,
      lastUpdatedAt: null,
    }),
    null,
  );
});

test("validateEditorJsonShape rejects malformed editor JSON", () => {
  assert.equal(validateEditorJsonShape(editorJson), true);
  assert.equal(
    validateEditorJsonShape({
      type: "doc",
      content: [{ type: 123 }],
    }),
    false,
  );
});

test("countWordsAndCharacters handles manuscript JSON", () => {
  assert.deepEqual(countWordsAndCharacters(editorJson), {
    words: 8,
    characters: 52,
  });
});

test("createManuscriptImportSummary calculates first-use import facts", () => {
  assert.deepEqual(
    createManuscriptImportSummary({
      sourceFileName: "source.docx",
      editorJson,
      importedAt: "2026-05-19T12:00:00.000Z",
    }),
    {
      sourceFileName: "source.docx",
      words: 8,
      characters: 52,
      blocks: 1,
      importedAt: "2026-05-19T12:00:00.000Z",
    },
  );
});

test("createBackupFileName generates safe timestamped names", () => {
  assert.equal(
    createBackupFileName({
      title: "Scott / Homer Draft",
      kind: "full draft",
      extension: ".json",
      timestamp: "2026-05-19T12:34:56.789Z",
    }),
    "scott-homer-draft-full-draft-2026-05-19T12-34-56-789Z.json",
  );
});

test("hasMeaningfulManuscriptDraft detects drafts worth protecting", () => {
  assert.equal(
    hasMeaningfulManuscriptDraft({
      title: "Untitled manuscript",
      sourceFileName: null,
      importSummary: null,
      editorJson: { type: "doc", content: [{ type: "paragraph" }] },
    }),
    false,
  );
  assert.equal(
    hasMeaningfulManuscriptDraft({
      title: "Untitled manuscript",
      sourceFileName: "source.docx",
      importSummary: null,
      editorJson: { type: "doc", content: [{ type: "paragraph" }] },
    }),
    true,
  );
  assert.equal(
    hasMeaningfulManuscriptDraft({
      title: "Untitled manuscript",
      sourceFileName: null,
      importSummary: null,
      structureRegions: [
        {
          id: "structure-empty",
          kind: "episode",
          title: "Episode A",
          startBlockId: "block-1",
          endBlockId: "block-1",
          order: 1,
          colorKey: "episode",
          notes: "",
          createdAt: "2026-05-19T12:00:00.000Z",
          updatedAt: "2026-05-19T12:00:00.000Z",
        },
      ],
      editorJson: { type: "doc", content: [{ type: "paragraph" }] },
    }),
    true,
  );
});

test("summarizeAuthorMarkedSpans separates Charlie and Homer spans", () => {
  const summaries = summarizeAuthorMarkedSpans(editorJson);
  const charlie = summaries.find((summary) => summary.authorId === "charlie");
  const homer = summaries.find((summary) => summary.authorId === "homer");

  assert.equal(charlie?.spans, 1);
  assert.equal(charlie?.words, 4);
  assert.equal(homer?.spans, 1);
  assert.equal(homer?.words, 4);
});

test("ensureManuscriptBlockIds adds missing durable IDs", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "First" }] },
      { type: "heading", content: [{ type: "text", text: "Second" }] },
    ],
  };

  const withIds = ensureManuscriptBlockIds(
    doc,
    (nodeType, index) => `block-${nodeType}-${index}`,
  );

  assert.deepEqual(
    collectBlockSummaries(withIds).map((block) => block.blockId),
    ["block-paragraph-1", "block-heading-2"],
  );
});

test("countMissingBlockIds reports block ID gaps", () => {
  assert.equal(
    countMissingBlockIds({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { blockId: "block-1" } },
        { type: "heading" },
      ],
    }),
    1,
  );
});

test("collectSemanticHighlights returns inline semantic marks", () => {
  const highlights = collectSemanticHighlights(editorJson);

  assert.equal(highlights.length, 1);
  assert.equal(highlights[0].highlightId, "semantic-1");
  assert.equal(highlights[0].tagType, "insight");
  assert.equal(highlights[0].note, "important");
});

test("structure regions summarize block ranges without inline marks", () => {
  const threeBlockDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { blockId: "block-a" },
        content: [{ type: "text", text: "Synthetic opening" }],
      },
      {
        type: "paragraph",
        attrs: { blockId: "block-b" },
        content: [{ type: "text", text: "Synthetic middle paragraph" }],
      },
      {
        type: "paragraph",
        attrs: { blockId: "block-c" },
        content: [{ type: "text", text: "Synthetic closing paragraph" }],
      },
    ],
  };
  const regions = [
    {
      id: "structure-episode-1",
      kind: "episode",
      title: "Episode 1",
      startBlockId: "block-a",
      endBlockId: "block-c",
      order: 2,
      colorKey: "episode",
      notes: "Synthetic episode range.",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    {
      id: "structure-chapter-1",
      kind: "chapter",
      title: "Chapter 1",
      startBlockId: "block-a",
      endBlockId: "block-b",
      order: 1,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
  ];

  assert.deepEqual(safeManuscriptStructureRegions(regions), [
    regions[1],
    regions[0],
  ]);

  const summaries = collectStructureRegionSummaries({
    json: threeBlockDoc,
    regions,
  });

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].kind, "chapter");
  assert.deepEqual(summaries[0].blockIds, ["block-a", "block-b"]);
  assert.equal(summaries[1].kind, "episode");
  assert.deepEqual(summaries[1].blockIds, [
    "block-a",
    "block-b",
    "block-c",
  ]);
  assert.equal(collectSemanticHighlights(threeBlockDoc).length, 0);
});

test("structure region presets create book-specific default titles", () => {
  const existingRegions = [
    {
      id: "structure-preface",
      kind: "chapter",
      title: "Preface",
      labelPreset: "preface",
      startBlockId: "block-a",
      endBlockId: "block-a",
      order: 1,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    {
      id: "structure-chapter-one",
      kind: "chapter",
      title: "Chapter One",
      labelPreset: "chapter",
      startBlockId: "block-b",
      endBlockId: "block-c",
      order: 2,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
  ];

  assert.equal(
    createStructureRegionDefaultTitle({
      kind: "chapter",
      labelPreset: "preface",
      existingRegions: [],
    }),
    "Preface",
  );
  assert.equal(
    createStructureRegionDefaultTitle({
      kind: "chapter",
      labelPreset: "introduction",
      existingRegions: [],
    }),
    "Introduction",
  );
  assert.equal(
    createStructureRegionDefaultTitle({
      kind: "chapter",
      labelPreset: "chapter-0",
      existingRegions: [],
    }),
    "Chapter 0",
  );
  assert.equal(
    createStructureRegionDefaultTitle({
      kind: "chapter",
      labelPreset: "chapter",
      existingRegions,
    }),
    "Chapter Two",
  );
  assert.equal(
    createStructureRegionDefaultTitle({
      kind: "episode",
      existingRegions: [
        {
          id: "structure-episode-one",
          kind: "episode",
          title: "Episode 1",
          startBlockId: "block-a",
          endBlockId: "block-b",
          order: 3,
          colorKey: "episode",
          notes: "",
          createdAt: "2026-05-19T12:00:00.000Z",
          updatedAt: "2026-05-19T12:00:00.000Z",
        },
      ],
    }),
    "Episode 2",
  );
});

test("structure region updates edit title kind preset and notes", () => {
  const regions = [
    {
      id: "structure-1",
      kind: "chapter",
      title: "Chapter One",
      labelPreset: "chapter",
      startBlockId: "block-a",
      endBlockId: "block-c",
      order: 1,
      colorKey: "chapter",
      notes: "Original notes",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
  ];

  const updated = updateManuscriptStructureRegion({
    regions,
    regionId: "structure-1",
    kind: "chapter",
    title: "Preface",
    labelPreset: "preface",
    notes: "Edited notes",
    updatedAt: "2026-05-19T13:00:00.000Z",
  });

  assert.equal(updated[0].title, "Preface");
  assert.equal(updated[0].kind, "chapter");
  assert.equal(updated[0].labelPreset, "preface");
  assert.equal(updated[0].notes, "Edited notes");
  assert.equal(updated[0].updatedAt, "2026-05-19T13:00:00.000Z");

  const changedLayer = updateManuscriptStructureRegion({
    regions: updated,
    regionId: "structure-1",
    kind: "episode",
    title: "Episode 1",
    labelPreset: "preface",
    notes: "Episode notes",
    updatedAt: "2026-05-19T14:00:00.000Z",
  });

  assert.equal(changedLayer[0].kind, "episode");
  assert.equal(changedLayer[0].title, "Episode 1");
  assert.equal(changedLayer[0].colorKey, "episode");
  assert.equal(changedLayer[0].labelPreset, undefined);
});

test("structure region parser keeps old regions and normalizes invalid presets", () => {
  const parsed = safeManuscriptStructureRegions([
    {
      id: "structure-old",
      kind: "chapter",
      title: "Chapter One",
      startBlockId: "block-a",
      endBlockId: "block-b",
      order: 1,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    {
      id: "structure-invalid-preset",
      kind: "chapter",
      title: "Introduction",
      labelPreset: "front-matter",
      startBlockId: "block-c",
      endBlockId: "block-d",
      order: 2,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
  ]);

  assert.equal(parsed?.[0].labelPreset, undefined);
  assert.equal(parsed?.[0].title, "Chapter One");
  assert.equal(parsed?.[1].labelPreset, undefined);
  assert.equal(parsed?.[1].title, "Introduction");
});

test("quote review helpers parse update and remove browser-local metadata", () => {
  const defaultReview = createDefaultManuscriptQuoteReview({
    highlightId: "semantic-cited-1",
    citationText: " Synthetic source note ",
    updatedAt: "2026-05-19T12:00:00.000Z",
  });
  const updated = updateManuscriptQuoteReview({
    reviews: {},
    review: {
      ...defaultReview,
      attributedTo: " Synthetic Person ",
      sourceTitle: " Synthetic Book ",
      sourceType: "book",
      locator: " p. 7 ",
      citationText: " Synthetic Book, p. 7 ",
      reviewStatus: "verified",
      rightsNote: " Public domain check ",
      editorNote: " Use in review packet ",
      updatedAt: "2026-05-19T13:00:00.000Z",
    },
  });
  const parsed = safeManuscriptQuoteReviews(updated);

  assert.equal(defaultReview.reviewStatus, "needs-source");
  assert.equal(defaultReview.sourceType, "unknown");
  assert.equal(defaultReview.citationText, "Synthetic source note");
  assert.equal(parsed?.["semantic-cited-1"].attributedTo, "Synthetic Person");
  assert.equal(parsed?.["semantic-cited-1"].sourceTitle, "Synthetic Book");
  assert.equal(parsed?.["semantic-cited-1"].sourceType, "book");
  assert.equal(parsed?.["semantic-cited-1"].locator, "p. 7");
  assert.equal(parsed?.["semantic-cited-1"].reviewStatus, "verified");
  assert.deepEqual(
    removeManuscriptQuoteReview({
      reviews: updated,
      highlightId: "semantic-cited-1",
    }),
    {},
  );
  assert.equal(
    safeManuscriptQuoteReviews({
      "semantic-cited-1": {
        ...updated["semantic-cited-1"],
        reviewStatus: "invalid",
      },
    }),
    null,
  );
});

test("block range summary normalizes pending start and end blocks", () => {
  const blocks = [
    { blockId: "block-a", type: "heading", preview: "Synthetic Preface" },
    { blockId: "block-b", type: "paragraph", preview: "Synthetic setup" },
    { blockId: "block-c", type: "paragraph", preview: "Synthetic close" },
  ];

  const summary = createBlockRangeSummary({
    blocks,
    startBlockId: "block-c",
    endBlockId: "block-a",
  });

  assert.equal(summary?.isRangeComplete, true);
  assert.equal(summary?.startIndex, 2);
  assert.equal(summary?.endIndex, 0);
  assert.equal(summary?.blockCount, 3);
  assert.deepEqual(summary?.blockIds, ["block-a", "block-b", "block-c"]);

  const partialSummary = createBlockRangeSummary({
    blocks,
    startBlockId: "block-a",
    endBlockId: null,
  });

  assert.equal(partialSummary?.isRangeComplete, false);
  assert.equal(partialSummary?.startPreview, "Synthetic Preface");
  assert.equal(partialSummary?.endPreview, "No end block set");
});

test("structure outline markdown groups regions with previews and notes", () => {
  const syntheticDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { blockId: "block-preface" },
        content: [{ type: "text", text: "Synthetic Preface" }],
      },
      {
        type: "paragraph",
        attrs: { blockId: "block-preface-body" },
        content: [{ type: "text", text: "Synthetic front matter" }],
      },
      {
        type: "heading",
        attrs: { blockId: "block-episode" },
        content: [{ type: "text", text: "Synthetic Episode" }],
      },
    ],
  };
  const summaries = collectStructureRegionSummaries({
    json: syntheticDoc,
    regions: [
      {
        id: "structure-preface",
        kind: "chapter",
        title: "Preface",
        labelPreset: "preface",
        startBlockId: "block-preface",
        endBlockId: "block-preface-body",
        order: 1,
        colorKey: "chapter",
        notes: "Synthetic note.",
        createdAt: "2026-05-19T12:00:00.000Z",
        updatedAt: "2026-05-19T12:00:00.000Z",
      },
      {
        id: "structure-episode",
        kind: "episode",
        title: "Episode 1",
        startBlockId: "block-episode",
        endBlockId: "block-episode",
        order: 2,
        colorKey: "episode",
        notes: "",
        createdAt: "2026-05-19T12:00:00.000Z",
        updatedAt: "2026-05-19T12:00:00.000Z",
      },
    ],
  });
  const markdown = createStructureOutlineMarkdown({ regions: summaries });

  assert.match(markdown, /^# Manuscript Structure/);
  assert.match(markdown, /## Chapter \/ book/);
  assert.match(markdown, /1\. Preface/);
  assert.match(markdown, /- Kind: Chapter \/ book/);
  assert.match(markdown, /- Blocks: 2/);
  assert.match(markdown, /- Start: Synthetic Preface/);
  assert.match(markdown, /- End: Synthetic front matter/);
  assert.match(markdown, /- Notes: Synthetic note\./);
  assert.match(markdown, /## Episodes/);
  assert.match(markdown, /1\. Episode 1/);
});

test("heading suggestions create book regions for synthetic front matter and chapters", () => {
  const suggestions = suggestBookStructureRegionsFromHeadings({
    blocks: [
      { blockId: "block-preface", type: "heading", preview: "Preface" },
      {
        blockId: "block-preface-body",
        type: "paragraph",
        preview: "Synthetic front matter.",
      },
      {
        blockId: "block-introduction",
        type: "heading",
        preview: "Introduction",
      },
      {
        blockId: "block-introduction-body",
        type: "paragraph",
        preview: "Synthetic introduction body.",
      },
      { blockId: "block-chapter-zero", type: "heading", preview: "Chapter 0" },
      {
        blockId: "block-chapter-zero-body",
        type: "paragraph",
        preview: "Synthetic chapter zero body.",
      },
      { blockId: "block-chapter-one", type: "heading", preview: "Chapter One" },
      {
        blockId: "block-chapter-one-body",
        type: "paragraph",
        preview: "Synthetic chapter one body.",
      },
      { blockId: "block-chapter-two", type: "heading", preview: "Chapter 2" },
      {
        blockId: "block-chapter-two-body",
        type: "paragraph",
        preview: "Synthetic chapter two body.",
      },
    ],
  });

  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.title),
    ["Preface", "Introduction", "Chapter 0", "Chapter One", "Chapter 2"],
  );
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.labelPreset),
    ["preface", "introduction", "chapter-0", "chapter", "chapter"],
  );
  assert.deepEqual(
    suggestions.map((suggestion) => [
      suggestion.startBlockId,
      suggestion.endBlockId,
    ]),
    [
      ["block-preface", "block-preface-body"],
      ["block-introduction", "block-introduction-body"],
      ["block-chapter-zero", "block-chapter-zero-body"],
      ["block-chapter-one", "block-chapter-one-body"],
      ["block-chapter-two", "block-chapter-two-body"],
    ],
  );

  const zeroWordSuggestions = suggestBookStructureRegionsFromHeadings({
    blocks: [
      { blockId: "block-zero-word", type: "heading", preview: "Chapter Zero" },
    ],
  });

  assert.equal(zeroWordSuggestions[0].labelPreset, "chapter-0");
});

test("heading suggestions ignore non-heading-like synthetic blocks", () => {
  assert.deepEqual(
    suggestBookStructureRegionsFromHeadings({
      blocks: [
        {
          blockId: "block-body",
          type: "paragraph",
          preview:
            "This synthetic paragraph mentions Chapter One but is too long to be a heading.",
        },
      ],
    }),
    [],
  );
});

test("structure region move helper reorders only within the same kind", () => {
  const timestamp = "2026-05-19T15:00:00.000Z";
  const regions = [
    {
      id: "structure-chapter-one",
      kind: "chapter",
      title: "Chapter One",
      startBlockId: "block-a",
      endBlockId: "block-a",
      order: 1,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    {
      id: "structure-episode-one",
      kind: "episode",
      title: "Episode 1",
      startBlockId: "block-a",
      endBlockId: "block-b",
      order: 2,
      colorKey: "episode",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
    {
      id: "structure-chapter-two",
      kind: "chapter",
      title: "Chapter Two",
      startBlockId: "block-b",
      endBlockId: "block-c",
      order: 3,
      colorKey: "chapter",
      notes: "",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    },
  ];

  const moved = moveManuscriptStructureRegionWithinKind({
    regions,
    regionId: "structure-chapter-two",
    direction: "up",
    updatedAt: timestamp,
  });

  assert.deepEqual(
    moved.map((region) => region.id),
    ["structure-chapter-two", "structure-episode-one", "structure-chapter-one"],
  );
  assert.equal(moved[0].updatedAt, timestamp);
  assert.equal(moved[1].updatedAt, "2026-05-19T12:00:00.000Z");
  assert.equal(moved[2].updatedAt, timestamp);
});

const filterDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { blockId: "block-preface" },
      content: [
        {
          type: "text",
          text: "Synthetic Preface",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "homer",
                authorLabel: "Homer / Scott",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "block-charlie" },
      content: [
        {
          type: "text",
          text: "Charlie synthetic reflection",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "charlie",
                authorLabel: "Charlie",
              },
            },
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "semantic-filter-1",
                tagType: "insight",
                label: "Insight",
                colorKey: "insight",
                note: "",
                createdAt: "2026-05-19T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "block-question" },
      content: [
        {
          type: "text",
          text: "Unmarked synthetic question",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "semantic-filter-2",
                tagType: "question",
                label: "Question",
                colorKey: "question",
                note: "",
                createdAt: "2026-05-19T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "block-cited" },
      content: [
        {
          type: "text",
          text: "A synthetic cited saying for review.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "charlie",
                authorLabel: "Charlie",
              },
            },
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "semantic-cited-1",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note",
                createdAt: "2026-05-19T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "block-loose" },
      content: [{ type: "text", text: "Loose synthetic note" }],
    },
  ],
};

const filterRegions = [
  {
    id: "structure-preface",
    kind: "chapter",
    title: "Preface",
    labelPreset: "preface",
    startBlockId: "block-preface",
    endBlockId: "block-charlie",
    order: 1,
    colorKey: "chapter",
    notes: "",
    createdAt: "2026-05-19T12:00:00.000Z",
    updatedAt: "2026-05-19T12:00:00.000Z",
  },
  {
    id: "structure-episode",
    kind: "episode",
    title: "Episode 1",
    startBlockId: "block-charlie",
    endBlockId: "block-cited",
    order: 2,
    colorKey: "episode",
    notes: "",
    createdAt: "2026-05-19T12:00:00.000Z",
    updatedAt: "2026-05-19T12:00:00.000Z",
  },
];

const quoteReviewMap = {
  "semantic-cited-1": {
    highlightId: "semantic-cited-1",
    attributedTo: "Synthetic author",
    sourceTitle: "Synthetic Collected Works",
    sourceType: "book",
    locator: "p. 42",
    citationText: "Synthetic Collected Works, p. 42",
    reviewStatus: "verified",
    rightsNote: "Synthetic rights review complete.",
    editorNote: "Synthetic editor note.",
    updatedAt: "2026-05-19T13:00:00.000Z",
  },
};

test("block details extract text marks and covering structures", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });
  const charlieBlock = details.find((block) => block.blockId === "block-charlie");
  const options = createBlockFilterOptions(details);

  assert.equal(details.length, 5);
  assert.equal(charlieBlock?.text, "Charlie synthetic reflection");
  assert.deepEqual(charlieBlock?.authorIds, ["charlie"]);
  assert.deepEqual(charlieBlock?.semanticTagTypes, ["insight"]);
  assert.deepEqual(
    charlieBlock?.structureRegions.map((region) => region.id),
    ["structure-preface", "structure-episode"],
  );
  assert.deepEqual(options.blockTypes, ["heading", "paragraph"]);
  assert.deepEqual(options.authorIds, ["charlie", "homer"]);
  assert.deepEqual(options.semanticTagTypes, [
    "cited-quotation",
    "insight",
    "question",
  ]);
});

test("block filters match text query author semantic and structure criteria", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });

  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { textQuery: "reflection" },
    }).map((block) => block.blockId),
    ["block-charlie"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { authorId: "charlie" },
    }).map((block) => block.blockId),
    ["block-charlie", "block-cited"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { semanticTagType: "insight" },
    }).map((block) => block.blockId),
    ["block-charlie"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { structureRegionId: "structure-preface" },
    }).map((block) => block.blockId),
    ["block-preface", "block-charlie"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { structureKind: "episode" },
    }).map((block) => block.blockId),
    ["block-charlie", "block-question", "block-cited"],
  );
});

test("block filters support unstructured semantic-present and no-author lenses", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });

  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { onlyUnstructured: true },
    }).map((block) => block.blockId),
    ["block-loose"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { onlyWithSemanticHighlights: true },
    }).map((block) => block.blockId),
    ["block-charlie", "block-question", "block-cited"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { onlyWithoutAuthor: true },
    }).map((block) => block.blockId),
    ["block-question", "block-loose"],
  );
});

test("filtered block markdown includes filters counts previews and structures", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });
  const filtered = filterManuscriptBlocks({
    blocks: details,
    criteria: { semanticTagType: "insight" },
  });
  const summary = summarizeBlockFilterResults({
    blocks: details,
    filteredBlocks: filtered,
    criteria: { semanticTagType: "insight" },
  });
  const markdown = createFilteredBlockListMarkdown({
    blocks: details,
    criteria: { semanticTagType: "insight" },
  });

  assert.equal(summary.matchingBlocks, 1);
  assert.equal(summary.totalBlocks, 5);
  assert.deepEqual(summary.activeFilterLabels, ["Semantic: Insight"]);
  assert.match(markdown, /^# Manuscript Filtered Blocks/);
  assert.match(markdown, /Matching blocks: 1 of 5/);
  assert.match(markdown, /- Semantic: Insight/);
  assert.match(markdown, /1\. Charlie synthetic reflection/);
  assert.match(markdown, /- Type: paragraph/);
  assert.match(markdown, /- Block ID: block-charlie/);
  assert.match(markdown, /- Structure: Preface, Episode 1/);
});

test("cited quotation marks are extracted with block and structure context", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });
  const citedBlock = details.find((block) => block.blockId === "block-cited");
  const quotations = collectCitedQuotationHighlights({
    json: filterDoc,
    regions: filterRegions,
    quoteReviews: quoteReviewMap,
  });

  assert.deepEqual(citedBlock?.authorIds, ["charlie"]);
  assert.deepEqual(citedBlock?.semanticTagTypes, ["cited-quotation"]);
  assert.equal(citedBlock?.citedQuotations.length, 1);
  assert.equal(quotations.length, 1);
  assert.equal(quotations[0].tagType, "cited-quotation");
  assert.equal(quotations[0].note, "Synthetic source note");
  assert.equal(quotations[0].blockId, "block-cited");
  assert.equal(quotations[0].review.reviewStatus, "verified");
  assert.equal(quotations[0].review.attributedTo, "Synthetic author");
  assert.equal(quotations[0].review.sourceTitle, "Synthetic Collected Works");
  assert.deepEqual(
    quotations[0].structureRegions.map((region) => region.title),
    ["Episode 1"],
  );
});

test("cited quotation extraction falls back to semantic note for review metadata", () => {
  const quotations = collectCitedQuotationHighlights({
    json: filterDoc,
    regions: filterRegions,
  });

  assert.equal(quotations.length, 1);
  assert.equal(quotations[0].review.reviewStatus, "needs-source");
  assert.equal(quotations[0].review.sourceType, "unknown");
  assert.equal(quotations[0].review.citationText, "Synthetic source note");
});

test("block filters can show blocks containing cited quotations", () => {
  const details = collectManuscriptBlockDetails({
    json: filterDoc,
    regions: filterRegions,
  });

  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: { semanticTagType: "cited-quotation" },
    }).map((block) => block.blockId),
    ["block-cited"],
  );
});

test("cited quotation markdown includes source notes and structure labels", () => {
  const quotations = collectCitedQuotationHighlights({
    json: filterDoc,
    regions: filterRegions,
    quoteReviews: quoteReviewMap,
  });
  const markdown = createCitedQuotationMarkdown({ quotations });

  assert.match(markdown, /^# Cited Quotations/);
  assert.match(markdown, /Total cited quotations: 1/);
  assert.match(markdown, /A synthetic cited saying for review\./);
  assert.match(markdown, /- Type: Cited quotation/);
  assert.match(markdown, /- Block ID: block-cited/);
  assert.match(markdown, /- Structure: Episode 1/);
  assert.match(markdown, /- Source note: Synthetic source note/);
  assert.match(markdown, /- Review status: Verified/);
  assert.match(markdown, /- Attributed to: Synthetic author/);
  assert.match(markdown, /- Source title: Synthetic Collected Works/);
  assert.match(markdown, /- Source type: Book/);
  assert.match(markdown, /- Locator: p\. 42/);
  assert.match(markdown, /- Citation: Synthetic Collected Works, p\. 42/);
  assert.match(markdown, /- Rights note: Synthetic rights review complete\./);
  assert.match(markdown, /- Editor note: Synthetic editor note\./);
});

const quoteFocusDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "focus-before" },
      content: [{ type: "text", text: "Synthetic setup before quotes." }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "focus-needs-source" },
      content: [
        {
          type: "text",
          text: "Synthetic quotation needing source.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "focus-quote-needs-source",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "",
                createdAt: "2026-05-20T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "focus-between" },
      content: [{ type: "text", text: "Synthetic bridge between quotes." }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "focus-verified" },
      content: [
        {
          type: "text",
          text: "Synthetic verified quotation.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "focus-quote-verified",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "",
                createdAt: "2026-05-20T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "focus-no-metadata" },
      content: [
        {
          type: "text",
          text: "Synthetic quotation without review metadata.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "focus-quote-no-metadata",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "",
                createdAt: "2026-05-20T12:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "focus-after" },
      content: [{ type: "text", text: "Synthetic closing after quotes." }],
    },
  ],
};

const quoteFocusReviews = {
  "focus-quote-needs-source": {
    highlightId: "focus-quote-needs-source",
    attributedTo: "",
    sourceTitle: "",
    sourceType: "unknown",
    locator: "",
    citationText: "",
    reviewStatus: "needs-source",
    rightsNote: "",
    editorNote: "",
    updatedAt: "2026-05-20T12:00:00.000Z",
  },
  "focus-quote-verified": {
    highlightId: "focus-quote-verified",
    attributedTo: "Synthetic verified author",
    sourceTitle: "Synthetic verified source",
    sourceType: "book",
    locator: "p. 9",
    citationText: "Synthetic verified source, p. 9",
    reviewStatus: "verified",
    rightsNote: "",
    editorNote: "",
    updatedAt: "2026-05-20T12:00:00.000Z",
  },
};

const publishingDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { blockId: "publish-heading" },
      content: [{ type: "text", text: "Synthetic Chapter One" }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "publish-homer" },
      content: [
        {
          type: "text",
          text: "Homer synthetic opening material.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "homer",
                authorLabel: "Homer / Scott",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "publish-charlie" },
      content: [
        {
          type: "text",
          text: "Charlie synthetic bridge.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "charlie",
                authorLabel: "Charlie",
              },
            },
          ],
        },
        {
          type: "text",
          text: " Synthetic quote needing source.",
          marks: [
            {
              type: "authorMark",
              attrs: {
                authorId: "charlie",
                authorLabel: "Charlie",
              },
            },
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "publish-quote-needs-source",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note A",
                createdAt: "2026-05-21T01:00:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "publish-episode" },
      content: [
        {
          type: "text",
          text: "Synthetic quote needing verification.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "publish-quote-needs-verification",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note B",
                createdAt: "2026-05-21T01:05:00.000Z",
              },
            },
          ],
        },
        {
          type: "text",
          text: " Synthetic verified quotation.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "publish-quote-verified",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note C",
                createdAt: "2026-05-21T01:10:00.000Z",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { blockId: "publish-unassigned" },
      content: [
        {
          type: "text",
          text: "Synthetic unassigned ending.",
        },
        {
          type: "text",
          text: " Synthetic do-not-use quotation.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "publish-quote-do-not-use",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note D",
                createdAt: "2026-05-21T01:15:00.000Z",
              },
            },
          ],
        },
        {
          type: "text",
          text: " Synthetic quote without metadata.",
          marks: [
            {
              type: "semanticHighlightMark",
              attrs: {
                highlightId: "publish-quote-no-metadata",
                tagType: "cited-quotation",
                label: "Cited quotation",
                colorKey: "cited-quotation",
                note: "Synthetic source note E",
                createdAt: "2026-05-21T01:20:00.000Z",
              },
            },
          ],
        },
      ],
    },
  ],
};

const publishingRegions = [
  {
    id: "publish-chapter",
    kind: "chapter",
    title: "Chapter One",
    labelPreset: "chapter",
    startBlockId: "publish-heading",
    endBlockId: "publish-unassigned",
    order: 1,
    colorKey: "chapter",
    notes: "Synthetic chapter notes.",
    createdAt: "2026-05-21T01:00:00.000Z",
    updatedAt: "2026-05-21T01:00:00.000Z",
  },
  {
    id: "publish-episode",
    kind: "episode",
    title: "Episode 1",
    startBlockId: "publish-homer",
    endBlockId: "publish-episode",
    order: 2,
    colorKey: "episode",
    notes: "Synthetic recording range.",
    createdAt: "2026-05-21T01:00:00.000Z",
    updatedAt: "2026-05-21T01:00:00.000Z",
  },
  {
    id: "publish-section",
    kind: "section",
    title: "Synthetic Review Section",
    startBlockId: "publish-charlie",
    endBlockId: "publish-unassigned",
    order: 3,
    colorKey: "section",
    notes: "",
    createdAt: "2026-05-21T01:00:00.000Z",
    updatedAt: "2026-05-21T01:00:00.000Z",
  },
];

const publishingQuoteReviews = {
  "publish-quote-needs-source": {
    highlightId: "publish-quote-needs-source",
    attributedTo: "Synthetic source seeker",
    sourceTitle: "Synthetic Missing Source",
    sourceType: "unknown",
    locator: "",
    citationText: "Synthetic missing citation",
    reviewStatus: "needs-source",
    rightsNote: "",
    editorNote: "Synthetic source still needed.",
    updatedAt: "2026-05-21T01:30:00.000Z",
  },
  "publish-quote-needs-verification": {
    highlightId: "publish-quote-needs-verification",
    attributedTo: "Synthetic verifier",
    sourceTitle: "Synthetic Verification Source",
    sourceType: "book",
    locator: "p. 7",
    citationText: "Synthetic Verification Source, p. 7",
    reviewStatus: "needs-verification",
    rightsNote: "Synthetic rights check pending.",
    editorNote: "",
    updatedAt: "2026-05-21T01:30:00.000Z",
  },
  "publish-quote-verified": {
    highlightId: "publish-quote-verified",
    attributedTo: "Synthetic verified voice",
    sourceTitle: "Synthetic Verified Source",
    sourceType: "article",
    locator: "section 2",
    citationText: "Synthetic Verified Source, section 2",
    reviewStatus: "verified",
    rightsNote: "Synthetic rights note.",
    editorNote: "Synthetic editor note.",
    updatedAt: "2026-05-21T01:30:00.000Z",
  },
  "publish-quote-do-not-use": {
    highlightId: "publish-quote-do-not-use",
    attributedTo: "Synthetic risky voice",
    sourceTitle: "Synthetic Risk Source",
    sourceType: "speech",
    locator: "timestamp 00:01",
    citationText: "Synthetic Risk Source, 00:01",
    reviewStatus: "do-not-use",
    rightsNote: "Synthetic do not use rights note.",
    editorNote: "Synthetic remove before publishing.",
    updatedAt: "2026-05-21T01:30:00.000Z",
  },
};

const publishingExportInput = {
  title: "Synthetic Publishing Draft",
  sourceFileName: "synthetic-publishing.docx",
  editorJson: publishingDoc,
  structureRegions: publishingRegions,
  quoteReviews: publishingQuoteReviews,
  generatedAt: "2026-05-21T02:00:00.000Z",
  snapshotState: {
    serverConnectionState: "connected",
    latestSnapshotTime: "2026-05-21T01:45:00.000Z",
    lastSnapshotId: "snapshot-synthetic",
    hasLocalChangesSinceServerSave: true,
  },
};

test("quote review status filtering supports focus controls and no metadata", () => {
  const details = collectManuscriptBlockDetails({
    json: quoteFocusDoc,
    quoteReviews: quoteFocusReviews,
  });
  const quotations = collectCitedQuotationHighlights({
    json: quoteFocusDoc,
    quoteReviews: quoteFocusReviews,
  });
  const verifiedQuotations = filterCitedQuotationsByReviewStatus({
    quotations,
    reviewStatus: "verified",
  });
  const noMetadataQuotations = filterCitedQuotationsByReviewStatus({
    quotations,
    reviewStatus: "no-review-metadata",
  });

  assert.deepEqual(
    verifiedQuotations.map((quotation) => quotation.highlightId),
    ["focus-quote-verified"],
  );
  assert.deepEqual(
    noMetadataQuotations.map((quotation) => quotation.highlightId),
    ["focus-quote-no-metadata"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: {
        semanticTagType: "cited-quotation",
        quoteReviewStatus: "needs-source",
      },
    }).map((block) => block.blockId),
    ["focus-needs-source", "focus-no-metadata"],
  );
  assert.deepEqual(
    filterManuscriptBlocks({
      blocks: details,
      criteria: {
        semanticTagType: "cited-quotation",
        quoteReviewStatus: "no-review-metadata",
      },
    }).map((block) => block.blockId),
    ["focus-no-metadata"],
  );

  const markdown = createCitedQuotationMarkdown({
    quotations: verifiedQuotations,
  });

  assert.match(markdown, /Total cited quotations: 1/);
  assert.match(markdown, /Synthetic verified quotation\./);
  assert.doesNotMatch(markdown, /Synthetic quotation needing source\./);
});

test("quote review progress summary counts synthetic review states", () => {
  const progress = summarizeCitedQuotationReviewProgress(
    collectCitedQuotationHighlights({
      json: quoteFocusDoc,
      quoteReviews: quoteFocusReviews,
    }),
  );

  assert.deepEqual(progress, {
    total: 3,
    needsSource: 2,
    needsVerification: 0,
    verified: 1,
    doNotUse: 0,
    noReviewMetadata: 1,
  });
});

test("focus visible block helper adds context without changing matches", () => {
  const details = collectManuscriptBlockDetails({
    json: quoteFocusDoc,
    quoteReviews: quoteFocusReviews,
  });
  const matchingBlocks = filterManuscriptBlocks({
    blocks: details,
    criteria: {
      semanticTagType: "cited-quotation",
      quoteReviewStatus: "verified",
    },
  });
  const focus = createFocusVisibleBlockIds({
    blocks: details,
    matchingBlocks,
    contextBlocks: 1,
  });

  assert.deepEqual(focus.matchingBlockIds, ["focus-verified"]);
  assert.deepEqual(focus.contextBlockIds, [
    "focus-between",
    "focus-no-metadata",
  ]);
  assert.deepEqual(focus.visibleBlockIds, [
    "focus-between",
    "focus-verified",
    "focus-no-metadata",
  ]);
});

test("publish readiness report counts stats structures and quote statuses", () => {
  const report = createPublishReadinessReport({
    ...publishingExportInput,
    includeRecordingChecks: true,
  });

  assert.equal(report.title, "Synthetic Publishing Draft");
  assert.equal(report.stats.blocks, 5);
  assert.equal(report.structure.chapterRegions, 1);
  assert.equal(report.structure.episodeRegions, 1);
  assert.equal(report.structure.sectionRegions, 1);
  assert.equal(report.structure.uncoveredBlocks, 0);
  assert.deepEqual(report.quoteReview, {
    total: 5,
    needsSource: 1,
    needsVerification: 1,
    verified: 1,
    doNotUse: 1,
    noReviewMetadata: 1,
  });
  assert.ok(
    report.issues.some(
      (issue) =>
        issue.id === "quotes-need-source" && issue.severity === "blocker",
    ),
  );
  assert.ok(
    report.issues.some(
      (issue) =>
        issue.id === "snapshot-caution" && issue.severity === "warning",
    ),
  );
});

test("publish readiness report detects missing structure", () => {
  const report = createPublishReadinessReport({
    ...publishingExportInput,
    structureRegions: [],
    includeRecordingChecks: true,
    snapshotState: {
      serverConnectionState: "unchecked",
      hasLocalChangesSinceServerSave: null,
    },
  });

  assert.equal(report.structure.chapterRegions, 0);
  assert.equal(report.structure.episodeRegions, 0);
  assert.equal(report.structure.uncoveredBlocks, 5);
  assert.ok(report.issues.some((issue) => issue.id === "no-chapter-structure"));
  assert.ok(report.issues.some((issue) => issue.id === "no-episode-structure"));
});

test("publishing packet Markdown includes title stats structure and warnings", () => {
  const markdown = createPublishingPacketMarkdown(publishingExportInput);

  assert.match(markdown, /# Publishing Packet/);
  assert.match(markdown, /Synthetic Publishing Draft/);
  assert.match(markdown, /Words:/);
  assert.match(markdown, /Chapter One/);
  assert.match(markdown, /BLOCKER/);
  assert.match(markdown, /Quote Review Appendix/);
  assert.match(markdown, /Synthetic quote needing source/);
});

test("recording handoff Markdown includes episode and chapter outlines", () => {
  const markdown = createRecordingHandoffMarkdown(publishingExportInput);

  assert.match(markdown, /# Recording Handoff/);
  assert.match(markdown, /Episode 1/);
  assert.match(markdown, /Chapter One/);
  assert.match(markdown, /Before Recording Checklist/);
  assert.match(markdown, /Homer \/ Scott/);
});

test("quote appendix Markdown includes review metadata", () => {
  const markdown = createQuoteReviewAppendixMarkdown(publishingExportInput);

  assert.match(markdown, /Synthetic verified voice/);
  assert.match(markdown, /Synthetic Verified Source/);
  assert.match(markdown, /section 2/);
  assert.match(markdown, /Synthetic rights note/);
  assert.match(markdown, /publish-episode/);
});

test("author contribution Markdown includes author labels", () => {
  const markdown = createAuthorContributionMarkdown(publishingExportInput);

  assert.match(markdown, /Charlie:/);
  assert.match(markdown, /Homer \/ Scott:/);
  assert.match(markdown, /Unassigned:/);
  assert.match(markdown, /not legal authorship truth/i);
});

test("chapter and episode export options summarize handoff regions", () => {
  const options = createChapterEpisodeExportOptions({
    regions: collectStructureRegionSummaries({
      json: publishingDoc,
      regions: publishingRegions,
    }),
  });

  assert.deepEqual(
    options.map((option) => option.kind),
    ["chapter", "episode"],
  );
  assert.equal(options[0].title, "Chapter One");
  assert.equal(options[1].title, "Episode 1");
});

test("synthetic smoke draft parses and includes expected structures", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const parsed = safeManuscriptDraft(draft);

  assert.ok(parsed);
  assert.ok(isSyntheticManuscriptSmokeDraft(parsed));
  assert.equal(parsed.title, "Synthetic Studio Smoke Draft");
  assert.equal(parsed.sourceFileName, "synthetic-studio-smoke.docx");
  assert.equal(collectBlockSummaries(parsed.editorJson).length, 10);
  assert.deepEqual(
    parsed.structureRegions.map((region) => region.kind),
    ["chapter", "episode", "section"],
  );
});

test("synthetic smoke draft has Charlie Homer and unassigned author material", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const authors = summarizeAuthorMarkedSpans(draft.editorJson);
  const semanticTags = collectSemanticHighlights(draft.editorJson).map(
    (highlight) => highlight.tagType,
  );

  assert.ok(authors.find((author) => author.authorId === "charlie").words > 0);
  assert.ok(authors.find((author) => author.authorId === "homer").words > 0);
  assert.ok(
    authors.find((author) => author.authorId === "unassigned").words > 0,
  );
  assert.ok(semanticTags.includes("story"));
  assert.ok(semanticTags.includes("insight"));
  assert.ok(semanticTags.includes("question"));
  assert.ok(semanticTags.includes("transition"));
});

test("synthetic smoke draft covers cited quote review statuses", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const quotations = collectCitedQuotationHighlights({
    json: draft.editorJson,
    regions: draft.structureRegions,
    quoteReviews: draft.quoteReviews,
  });
  const progress = summarizeCitedQuotationReviewProgress(quotations);
  const explicitStatuses = quotations
    .filter((quotation) => quotation.hasReviewMetadata)
    .map((quotation) => quotation.review.reviewStatus)
    .sort();

  assert.equal(quotations.length, 5);
  assert.equal(progress.total, 5);
  assert.equal(progress.noReviewMetadata, 1);
  assert.deepEqual(explicitStatuses, [
    "do-not-use",
    "needs-source",
    "needs-verification",
    "verified",
  ]);
});

test("publish readiness report detects synthetic smoke quote statuses", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const report = createPublishReadinessReport({
    title: draft.title,
    sourceFileName: draft.sourceFileName,
    editorJson: draft.editorJson,
    structureRegions: draft.structureRegions,
    quoteReviews: draft.quoteReviews,
    generatedAt: "2026-05-21T13:00:00.000Z",
    includeRecordingChecks: true,
  });

  assert.equal(report.stats.blocks, 10);
  assert.equal(report.structure.chapterRegions, 1);
  assert.equal(report.structure.episodeRegions, 1);
  assert.equal(report.structure.sectionRegions, 1);
  assert.equal(report.quoteReview.needsSource, 1);
  assert.equal(report.quoteReview.needsVerification, 1);
  assert.equal(report.quoteReview.verified, 1);
  assert.equal(report.quoteReview.doNotUse, 1);
  assert.equal(report.quoteReview.noReviewMetadata, 1);
});

test("synthetic smoke publishing and recording Markdown exports work", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const exportInput = {
    title: draft.title,
    sourceFileName: draft.sourceFileName,
    editorJson: draft.editorJson,
    structureRegions: draft.structureRegions,
    quoteReviews: draft.quoteReviews,
    generatedAt: "2026-05-21T13:05:00.000Z",
    includeRecordingChecks: true,
  };
  const packet = createPublishingPacketMarkdown(exportInput);
  const handoff = createRecordingHandoffMarkdown(exportInput);

  assert.match(packet, /Synthetic Studio Smoke Draft/);
  assert.match(packet, /Synthetic Chapter One/);
  assert.match(packet, /Quote Review Appendix/);
  assert.match(handoff, /Synthetic Episode One/);
  assert.match(handoff, /Before Recording Checklist/);
});

test("real manuscript readiness gate requires manual smoke confirmations", () => {
  const draft = createSyntheticManuscriptSmokeDraft();
  const report = createPublishReadinessReport({
    title: draft.title,
    sourceFileName: draft.sourceFileName,
    editorJson: draft.editorJson,
    structureRegions: draft.structureRegions,
    quoteReviews: draft.quoteReviews,
    generatedAt: "2026-05-21T13:10:00.000Z",
    includeRecordingChecks: true,
  });
  const notReady = createRealManuscriptReadinessGate({
    currentDraft: draft,
    publishReadinessReport: report,
  });
  const ready = createRealManuscriptReadinessGate({
    currentDraft: draft,
    publishReadinessReport: report,
    manualSignals: {
      publishingPacketGenerated: true,
      recordingHandoffGenerated: true,
      quoteAppendixGenerated: true,
      serverSnapshotSaved: true,
      phoneOrSecondBrowserLoaded: true,
      fullDraftJsonBackupDownloaded: true,
    },
  });

  assert.equal(notReady.isReadyForRealManuscript, false);
  assert.equal(notReady.status, "not-ready");
  assert.ok(
    notReady.checklistItems.some(
      (item) =>
        item.id === "server-snapshot-saved" && item.isComplete === false,
    ),
  );
  assert.equal(ready.isReadyForRealManuscript, true);
  assert.equal(ready.status, "ready");
  assert.equal(ready.warnings.length, 0);
});
