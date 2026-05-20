import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBlockSummaries,
  collectSemanticHighlights,
  collectStructureRegionSummaries,
  countMissingBlockIds,
  countWordsAndCharacters,
  createBackupFileName,
  ensureManuscriptBlockIds,
  createManuscriptImportSummary,
  createStructureRegionDefaultTitle,
  hasMeaningfulManuscriptDraft,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  manuscriptStructureDefinitions,
  manuscriptStructureLabelPresets,
  safeManuscriptDraft,
  safeManuscriptStructureRegions,
  semanticHighlightDefinitions,
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
