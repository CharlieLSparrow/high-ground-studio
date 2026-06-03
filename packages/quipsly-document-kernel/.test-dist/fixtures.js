"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBenjaminFranklinFixture = createBenjaminFranklinFixture;
const document_1 = require("./document");
const anchors_1 = require("./anchors");
function createBenjaminFranklinFixture() {
    const document = (0, document_1.createQuipslyDocument)({
        id: "fixture-benjamin-franklin",
        title: "Benjamin Franklin Split Fixture",
        now: "2026-06-02T00:00:00.000Z",
        nodes: [
            {
                id: "node-opening",
                type: "paragraph",
                text: "A little setup before the quote. Benjamin Franklin supposedly said, \"An investment in knowledge pays the best interest.\" Then the paragraph keeps going.",
            },
        ],
    });
    document.boundaries.push({
        id: "boundary-chapter-1",
        kind: "chapter",
        nodeId: "node-opening",
        title: "Chapter 1",
    });
    document.annotations.push({
        id: "annotation-franklin-quote",
        kind: "quote",
        label: "Quote",
        anchors: [
            (0, anchors_1.createTextAnchor)({
                document,
                nodeId: "node-opening",
                startOffset: document.nodes[0].text.indexOf("\""),
                endOffset: document.nodes[0].text.lastIndexOf("\"") + 1,
            }),
        ],
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
    });
    return document;
}
