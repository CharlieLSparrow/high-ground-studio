"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert/strict");
const node_test_1 = require("node:test");
const operations_1 = require("./operations");
const studioProjection_1 = require("./studioProjection");
(0, node_test_1.test)("current studio block/span shape can roundtrip through the kernel", () => {
    const document = (0, studioProjection_1.createDocumentFromStudioProjection)({
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
    const split = (0, operations_1.applyOperation)(document, {
        type: "splitNode",
        nodeId: "block-1",
        offset: 20,
        newNodeId: "block-quote",
    });
    const studioProjection = (0, studioProjection_1.projectDocumentToStudioProjection)(split.document);
    assert.equal(studioProjection.blocks.length, 2);
    assert.equal(studioProjection.taggedSpans.length, 1);
    assert.equal(studioProjection.taggedSpans[0].blockStableId, "block-quote");
});
