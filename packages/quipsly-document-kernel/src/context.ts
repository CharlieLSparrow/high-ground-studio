import type {
  InlineAnnotation,
  QuipslyDocument,
  Region,
} from "./document";
import { isTextAnchor } from "./anchors";
import { computeBoundaryRanges, computeRegionRanges } from "./projections";

export type KernelCursor = {
  nodeId: string;
  offset?: number;
};

export type AgentVisibleContext = {
  nodeId: string;
  nodeText: string;
  activeBoundaries: Array<{
    id: string;
    kind: string;
    title: string;
  }>;
  activeRegions: Region[];
  nearbyAnnotations: InlineAnnotation[];
};

export function getAgentVisibleContext(
  document: QuipslyDocument,
  cursor: KernelCursor,
): AgentVisibleContext {
  const node = document.nodes.find((candidate) => candidate.id === cursor.nodeId);
  if (!node) {
    throw new Error(`Document node not found: ${cursor.nodeId}`);
  }

  const activeBoundaries = computeBoundaryRanges(document)
    .filter((range) => range.nodeIds.includes(cursor.nodeId))
    .map((range) => ({
      id: range.boundaryId,
      kind: range.kind,
      title: range.title,
    }));

  const activeRegionIds = new Set(
    computeRegionRanges(document)
      .filter((range) => range.nodeIds.includes(cursor.nodeId))
      .map((range) => range.regionId),
  );

  const activeRegions = document.regions.filter((region) =>
    activeRegionIds.has(region.id),
  );

  const nearbyAnnotations = document.annotations.filter((annotation) =>
    annotation.anchors.some((anchor) => {
      if (!isTextAnchor(anchor)) return false;
      if (anchor.nodeId !== cursor.nodeId) return false;
      if (typeof cursor.offset !== "number") return true;
      return cursor.offset >= anchor.startOffset && cursor.offset <= anchor.endOffset;
    }),
  );

  return {
    nodeId: node.id,
    nodeText: node.text,
    activeBoundaries,
    activeRegions,
    nearbyAnnotations,
  };
}
