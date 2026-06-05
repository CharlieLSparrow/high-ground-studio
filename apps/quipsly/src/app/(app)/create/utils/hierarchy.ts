import { Block } from "../Tagger";

export type BlockHierarchyNode = {
  blockId: string;
  chapterId: string | null;
  episodeId: string | null;
  // Index in the overall linear array
  globalIndex: number;
};

export type HierarchyMap = Map<string, BlockHierarchyNode>;

/**
 * Sweeps through the flat array of blocks and assigns a hierarchical context
 * (chapter, episode) to each block based on the preceding structural tags.
 */
export function buildBlockHierarchy(blocks: Block[]): HierarchyMap {
  const map: HierarchyMap = new Map();
  let currentChapterId: string | null = null;
  let currentEpisodeId: string | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const tags = block.tags || [];

    if (tags.includes("chapter")) {
      currentChapterId = block.id;
      // Depending on rules, a new chapter might clear the episode
      // currentEpisodeId = null; 
    }
    if (tags.includes("episode")) {
      currentEpisodeId = block.id;
    }

    map.set(block.id, {
      blockId: block.id,
      chapterId: currentChapterId,
      episodeId: currentEpisodeId,
      globalIndex: i,
    });
  }

  return map;
}

/**
 * Extracts a subset of blocks that belong to a given parent boundary (e.g. dragging a chapter).
 */
export function getBoundaryBlockIds(blocks: Block[], boundaryBlockId: string): string[] {
  const hierarchy = buildBlockHierarchy(blocks);
  const ids: string[] = [];
  
  // A boundary block itself might be a chapter or episode
  const boundaryBlock = blocks.find(b => b.id === boundaryBlockId);
  if (!boundaryBlock) return ids;

  const isChapter = boundaryBlock.tags.includes("chapter");
  const isEpisode = boundaryBlock.tags.includes("episode");

  if (!isChapter && !isEpisode) return [boundaryBlockId];

  // Include the boundary block itself
  ids.push(boundaryBlockId);

  // Find all children until the next boundary of the SAME level
  let startIndex = blocks.findIndex(b => b.id === boundaryBlockId) + 1;
  
  for (let i = startIndex; i < blocks.length; i++) {
    const b = blocks[i];
    if (isChapter && b.tags.includes("chapter")) break; // Next chapter starts
    if (isEpisode && b.tags.includes("episode")) break; // Next episode starts

    ids.push(b.id);
  }

  return ids;
}
