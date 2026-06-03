"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDocument = validateDocument;
const document_1 = require("./document");
const anchors_1 = require("./anchors");
function validateTextAnchor(document, anchor, path, errors, warnings) {
    const node = document.nodes.find((candidate) => candidate.id === anchor.nodeId);
    if (!node) {
        errors.push({
            code: "anchor-node-missing",
            message: `Text anchor points at missing node ${anchor.nodeId}.`,
            path,
        });
        return;
    }
    if (anchor.startOffset < 0 || anchor.endOffset > node.text.length) {
        errors.push({
            code: "anchor-offset-out-of-range",
            message: "Text anchor offsets are outside the node text.",
            path,
        });
    }
    if (anchor.startOffset >= anchor.endOffset) {
        warnings.push({
            code: "anchor-empty",
            message: "Text anchor does not cover any characters.",
            path,
        });
    }
    const currentExact = node.text.slice(anchor.startOffset, anchor.endOffset);
    if (anchor.exact !== currentExact) {
        warnings.push({
            code: "anchor-exact-drift",
            message: "Text anchor snapshot differs from current source text.",
            path,
        });
    }
}
function validateDocument(document) {
    const errors = [];
    const warnings = [];
    const nodeIds = new Set();
    document.nodes.forEach((node, index) => {
        if (!node.id.trim()) {
            errors.push({
                code: "node-id-missing",
                message: "Document node id is required.",
                path: `nodes.${index}.id`,
            });
        }
        if (nodeIds.has(node.id)) {
            errors.push({
                code: "node-id-duplicate",
                message: `Duplicate document node id: ${node.id}.`,
                path: `nodes.${index}.id`,
            });
        }
        nodeIds.add(node.id);
    });
    document.boundaries.forEach((boundary, index) => {
        if ((0, document_1.getNodeIndex)(document, boundary.nodeId) < 0) {
            errors.push({
                code: "boundary-node-missing",
                message: `Boundary ${boundary.id} points at missing node ${boundary.nodeId}.`,
                path: `boundaries.${index}.nodeId`,
            });
        }
    });
    document.regions.forEach((region, index) => {
        const startIndex = (0, document_1.getNodeIndex)(document, region.startNodeId);
        const endIndex = (0, document_1.getNodeIndex)(document, region.endNodeId);
        if (startIndex < 0) {
            errors.push({
                code: "region-start-node-missing",
                message: `Region ${region.id} points at missing start node ${region.startNodeId}.`,
                path: `regions.${index}.startNodeId`,
            });
        }
        if (endIndex < 0) {
            errors.push({
                code: "region-end-node-missing",
                message: `Region ${region.id} points at missing end node ${region.endNodeId}.`,
                path: `regions.${index}.endNodeId`,
            });
        }
    });
    document.annotations.forEach((annotation, annotationIndex) => {
        annotation.anchors.forEach((anchor, anchorIndex) => {
            if ((0, anchors_1.isTextAnchor)(anchor)) {
                validateTextAnchor(document, anchor, `annotations.${annotationIndex}.anchors.${anchorIndex}`, errors, warnings);
            }
        });
    });
    document.entityReferences.forEach((reference, referenceIndex) => {
        reference.anchors.forEach((anchor, anchorIndex) => {
            if ((0, anchors_1.isTextAnchor)(anchor)) {
                validateTextAnchor(document, anchor, `entityReferences.${referenceIndex}.anchors.${anchorIndex}`, errors, warnings);
            }
        });
    });
    return {
        ok: errors.length === 0,
        errors,
        warnings,
    };
}
