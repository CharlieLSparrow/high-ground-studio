import * as assert from "node:assert/strict";
import { test } from "node:test";

import { createBenjaminFranklinFixture } from "./fixtures";
import { isTextAnchor } from "./anchors";
import { applyOperation } from "./operations";
import { validateDocument } from "./validation";

test("quote annotation follows text when a paragraph is split before the quote", () => {
  const fixture = createBenjaminFranklinFixture();
  const splitOffset = fixture.nodes[0].text.indexOf("Benjamin Franklin");
  const result = applyOperation(fixture, {
    type: "splitNode",
    nodeId: "node-opening",
    offset: splitOffset,
    newNodeId: "node-franklin-quote",
  });

  assert.equal(result.document.nodes.length, 2);
  assert.equal(result.document.nodes[0].text, "A little setup before the quote. ");
  assert.ok(result.document.nodes[1].text.startsWith("Benjamin Franklin"));

  const annotation = result.document.annotations[0];
  const anchor = annotation.anchors.find(isTextAnchor);
  assert.ok(anchor);
  const textAnchor = anchor;
  assert.equal(textAnchor.nodeId, "node-franklin-quote");
  assert.equal(
    textAnchor.exact,
    "\"An investment in knowledge pays the best interest.\"",
  );

  assert.equal(result.projection.blocks.length, 2);
  assert.equal(result.projection.taggedSpans.length, 1);
  assert.equal(result.projection.taggedSpans[0].blockStableId, "node-franklin-quote");
  assert.equal(validateDocument(result.document).ok, true);
});

test("chapter boundary keeps until-next-boundary behavior after split", () => {
  const fixture = createBenjaminFranklinFixture();
  const result = applyOperation(fixture, {
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

test("chapter and episode boundaries compute independently", () => {
  const fixture = createBenjaminFranklinFixture();
  const split = applyOperation(fixture, {
    type: "splitNode",
    nodeId: "node-opening",
    offset: fixture.nodes[0].text.indexOf("Benjamin Franklin"),
    newNodeId: "node-franklin-quote",
  });
  const episode = applyOperation(split.document, {
    type: "addBoundary",
    id: "boundary-episode-4",
    kind: "episode",
    nodeId: "node-franklin-quote",
    title: "Episode 4",
  });

  const chapterRange = episode.projection.boundaryRanges.find(
    (range) => range.kind === "chapter",
  );
  const episodeRange = episode.projection.boundaryRanges.find(
    (range) => range.kind === "episode",
  );

  assert.deepEqual(chapterRange?.nodeIds, [
    "node-opening",
    "node-franklin-quote",
  ]);
  assert.deepEqual(episodeRange?.nodeIds, ["node-franklin-quote"]);
});
