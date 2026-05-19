import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBlockSummaries,
  collectSemanticHighlights,
  countWordsAndCharacters,
  ensureManuscriptBlockIds,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  safeManuscriptDraft,
  semanticHighlightDefinitions,
  summarizeAuthorMarkedSpans,
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
});

test("safeManuscriptDraft accepts a valid draft", () => {
  const draft = {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: "Book draft",
    sourceFileName: "source.docx",
    editorJson,
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-19T12:00:00.000Z",
  };

  assert.deepEqual(safeManuscriptDraft(draft), draft);
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

test("collectSemanticHighlights returns inline semantic marks", () => {
  const highlights = collectSemanticHighlights(editorJson);

  assert.equal(highlights.length, 1);
  assert.equal(highlights[0].highlightId, "semantic-1");
  assert.equal(highlights[0].tagType, "insight");
  assert.equal(highlights[0].note, "important");
});
