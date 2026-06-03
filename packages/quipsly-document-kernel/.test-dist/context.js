"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentVisibleContext = getAgentVisibleContext;
const anchors_1 = require("./anchors");
const projections_1 = require("./projections");
function getAgentVisibleContext(document, cursor) {
    const node = document.nodes.find((candidate) => candidate.id === cursor.nodeId);
    if (!node) {
        throw new Error(`Document node not found: ${cursor.nodeId}`);
    }
    const activeBoundaries = (0, projections_1.computeBoundaryRanges)(document)
        .filter((range) => range.nodeIds.includes(cursor.nodeId))
        .map((range) => ({
        id: range.boundaryId,
        kind: range.kind,
        title: range.title,
    }));
    const activeRegionIds = new Set((0, projections_1.computeRegionRanges)(document)
        .filter((range) => range.nodeIds.includes(cursor.nodeId))
        .map((range) => range.regionId));
    const activeRegions = document.regions.filter((region) => activeRegionIds.has(region.id));
    const nearbyAnnotations = document.annotations.filter((annotation) => annotation.anchors.some((anchor) => {
        if (!(0, anchors_1.isTextAnchor)(anchor))
            return false;
        if (anchor.nodeId !== cursor.nodeId)
            return false;
        if (typeof cursor.offset !== "number")
            return true;
        return cursor.offset >= anchor.startOffset && cursor.offset <= anchor.endOffset;
    }));
    return {
        nodeId: node.id,
        nodeText: node.text,
        activeBoundaries,
        activeRegions,
        nearbyAnnotations,
    };
}
