import type { StudioDocumentBlock } from "./ReadModeManuscript";

export type PersistedReadBlock = {
  stableId: string;
  title: string | null;
  body: string;
};

export function mapPersistedReadBlocks(
  blocks: PersistedReadBlock[],
): StudioDocumentBlock[] {
  return blocks.map((block) => ({
    id: block.stableId,
    type: block.title ? "heading" : "paragraph",
    content: block.title || block.body,
  }));
}
