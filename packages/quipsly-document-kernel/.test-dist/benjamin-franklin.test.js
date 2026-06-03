"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("node:assert/strict");
const node_test_1 = require("node:test");
const fixtures_1 = require("./fixtures");
const anchors_1 = require("./anchors");
const operations_1 = require("./operations");
const validation_1 = require("./validation");
(0, node_test_1.test)("quote annotation follows text when a paragraph is split before the quote", () => {
    const fixture = (0, fixtures_1.createBenjaminFranklinFixture)();
    const splitOffset = fixture.nodes[0].text.indexOf("Benjamin Franklin");
    const result = (0, operations_1.applyOperation)(fixture, {
        type: "splitNode",
        nodeId: "node-opening",
        offset: splitOffset,
        newNodeId: "node-franklin-quote",
    });
    assert.equal(result.document.nodes.length, 2);
    assert.equal(result.document.nodes[0].text, "A little setup before the quote. ");
    assert.ok(result.document.nodes[1].text.startsWith("Benjamin Franklin"));
    const annotation = result.document.annotations[0];
    const anchor = annotation.anchors.find(anchors_1.isTextAnchor);
    assert.ok(anchor);
    const textAnchor = anchor;
    assert.equal(textAnchor.nodeId, "node-franklin-quote");
    assert.equal(textAnchor.exact, "\"An investment in knowledge pays the best interest.\"");
    assert.equal(result.projection.blocks.length, 2);
    assert.equal(result.projection.taggedSpans.length, 1);
    assert.equal(result.projection.taggedSpans[0].blockStableId, "node-franklin-quote");
    assert.equal((0, validation_1.validateDocument)(result.document).ok, true);
});
(0, node_test_1.test)("chapter boundary keeps until-next-boundary behavior after split", () => {
    const fixture = (0, fixtures_1.createBenjaminFranklinFixture)();
    const result = (0, operations_1.applyOperation)(fixture, {
        type: "splitNode",
        nodeId: "node-opening",
        offset: fixture.nodes[0].text.indexOf("Benjamin Franklin"),
        newNodeId: "node-franklin-quote",
    });
    assert.equal(result.projection.boundaryRanges.length, 1);
    assert.deepEqual(result.projection.boundaryRanges[0].nodeIds, [
        "node-opening",
        "node-franklin-quote",
    ]);
});
(0, node_test_1.test)("chapter and episode boundaries compute independently", () => {
    const fixture = (0, fixtures_1.createBenjaminFranklinFixture)();
    const split = (0, operations_1.applyOperation)(fixture, {
        type: "splitNode",
        nodeId: "node-opening",
        offset: fixture.nodes[0].text.indexOf("Benjamin Franklin"),
        newNodeId: "node-franklin-quote",
    });
    const episode = (0, operations_1.applyOperation)(split.document, {
        type: "addBoundary",
        id: "boundary-episode-4",
        kind: "episode",
        nodeId: "node-franklin-quote",
        title: "Episode 4",
    });
    const chapterRange = episode.projection.boundaryRanges.find((range) => range.kind === "chapter");
    const episodeRange = episode.projection.boundaryRanges.find((range) => range.kind === "episode");
    assert.deepEqual(chapterRange?.nodeIds, [
        "node-opening",
        "node-franklin-quote",
    ]);
    assert.deepEqual(episodeRange?.nodeIds, ["node-franklin-quote"]);
});
