import * as assert from "node:assert/strict";
import { test } from "node:test";

import { applyOperation } from "./operations";
import {
  createDocumentFromStudioProjection,
  projectDocumentToStudioProjection,
} from "./studioProjection";

test("current studio block/span shape can roundtrip through the kernel", () => {
  const document = createDocumentFromStudioProjection({
    documentId: "studio-doc",
    title: "Studio Projection Fixture",
    now: "2026-06-02T00:00:00.000Z",
    blocks: [
      {
        id: "block-1",
        text: "Setup before quote. Benjamin Franklin quote goes here.",
        order: 0,
      },
    ],
    spans: [
      {
        id: "span-quote",
        blockId: "block-1",
        tagSlug: "quote",
        startOffset: 20,
        endOffset: 52,
      },
    ],
  });

  const split = applyOperation(document, {
    type: "splitNode",
    nodeId: "block-1",
    offset: 20,
    newNodeId: "block-quote",
  });

  const studioProjection = projectDocumentToStudioProjection(split.document);

  assert.equal(studioProjection.blocks.length, 2);
  assert.equal(studioProjection.taggedSpans.length, 1);
  assert.equal(studioProjection.taggedSpans[0].blockStableId, "block-quote");
});
