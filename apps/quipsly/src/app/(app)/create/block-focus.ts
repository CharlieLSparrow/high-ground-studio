export function resolveInitialFocusBlockId(
  blocks: ReadonlyArray<{ id: string }>,
  requestedBlockId: unknown,
): string | undefined {
  if (typeof requestedBlockId !== "string" || requestedBlockId.length === 0) return undefined;
  return blocks.some((block) => block.id === requestedBlockId) ? requestedBlockId : undefined;
}
