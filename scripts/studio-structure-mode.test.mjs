import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createStarterSampleCards,
  createStructureOutlineMarkdown,
  safeStructureDraft,
  STARTER_SAMPLE_TEXT,
  starterSampleCards,
} from "../apps/quipsly/src/app/(app)/structure/structure-mode-model.ts";

const createdAt = "2026-05-19T12:00:00.000Z";

const validCard = {
  id: "highlight-1",
  selectedText: "One idea",
  startOffset: 0,
  endOffset: 8,
  semanticType: "insight",
  note: "note here",
  sourceTitle: "Test Source",
  sourceType: "notes",
  createdAt,
  laneId: "opening",
};

test("safeStructureDraft accepts a valid browser-local draft", () => {
  const draft = {
    sourceTitle: "Test Source",
    sourceType: "notes",
    sourceText: "One idea with source context.",
    cards: [validCard],
  };

  assert.deepEqual(safeStructureDraft(draft), draft);
});

test("safeStructureDraft rejects an invalid draft envelope", () => {
  assert.equal(
    safeStructureDraft({
      sourceTitle: "Test Source",
      sourceType: "invalid",
      sourceText: "One idea with source context.",
      cards: [validCard],
    }),
    null,
  );
});

test("createStructureOutlineMarkdown groups cards by lane", () => {
  const markdown = createStructureOutlineMarkdown({
    sourceTitle: "Test Source",
    cards: [
      {
        ...validCard,
        semanticType: "insight",
        laneId: "opening",
      },
      {
        ...validCard,
        id: "highlight-2",
        selectedText: "Second proof",
        semanticType: "research",
        note: "",
        laneId: "evidence",
      },
    ],
  });

  assert.equal(
    markdown,
    [
      "# Structure: Test Source",
      "",
      "## Opening",
      "",
      "- [Insight] One idea",
      "  Note: note here",
      "",
      "## Evidence",
      "",
      "- [Research] Second proof",
    ].join("\n"),
  );
});

test("createStarterSampleCards keeps selected text offsets valid", () => {
  let index = 0;
  const cards = createStarterSampleCards(
    () => `sample-${(index += 1)}`,
    () => createdAt,
  );

  assert.equal(cards.length, starterSampleCards.length);

  for (const card of cards) {
    assert.equal(
      STARTER_SAMPLE_TEXT.slice(card.startOffset, card.endOffset),
      card.selectedText,
    );
    assert.match(card.id, /^sample-\d$/);
    assert.equal(card.createdAt, createdAt);
  }
});
