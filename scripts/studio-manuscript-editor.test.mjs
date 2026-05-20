import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBlockSummaries,
  collectSemanticHighlights,
  collectStructureRegionSummaries,
  countMissingBlockIds,
  countWordsAndCharacters,
  createBackupFileName,
  createBlockRangeSummary,
  ensureManuscriptBlockIds,
  createManuscriptImportSummary,
  createStructureRegionDefaultTitle,
  createStructureOutlineMarkdown,
  hasMeaningfulManuscriptDraft,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  manuscriptStructureDefinitions,
  manuscriptStructureLabelPresets,
  moveManuscriptStructureRegionWithinKind,
  safeManuscriptDraft,
  safeManuscriptStructureRegions,
  semanticHighlightDefinitions,
  suggestBookStructureRegionsFromHeadings,
  summarizeAuthorMarkedSpans,
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

test("author and semantic definitions contain the MVP options", () => {
  assert.deepEqual(
    manuscriptAuthorDefinitions.map((author) => author.id),
    ["charlie", "homer", "unassigned"],
  );
  assert.deepEqual(
    semanticHighlightDefinitions.map((tag) => tag.id),
    [
      "quote",
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
    editorJson,
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-19T12:00:00.000Z",
  };

  assert.deepEqual(safeManuscriptDraft(draft), draft);
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
