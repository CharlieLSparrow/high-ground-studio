"use server";

import { revalidatePath } from "next/cache";

import {
  createStudioTaggedSpanWithNode,
  getStudioRoute,
  type StudioActionResult,
} from "@/lib/server/studio-data";

type CreateTaggedSpanActionInput = {
  documentStableId: string;
  blockStableId: string;
  tagId: string;
  startOffset: number;
  endOffset: number;
};

function normalizeOffset(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
}

export async function createStudioTaggedSpanAction(
  input: CreateTaggedSpanActionInput,
): Promise<StudioActionResult> {
  const result = await createStudioTaggedSpanWithNode({
    documentStableId: input.documentStableId,
    blockStableId: input.blockStableId,
    tagId: input.tagId,
    startOffset: normalizeOffset(input.startOffset),
    endOffset: normalizeOffset(input.endOffset),
  });

  revalidatePath(getStudioRoute());

  return result;
}
