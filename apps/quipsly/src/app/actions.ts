"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  createStudioTaggedSpanWithNode,
  getStudioRoute,
  type StudioActionResult,
} from "@/lib/server/studio-data";
import { canAccessStudio } from "@/lib/studio-authz";

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
  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];

  if (!session?.user?.id) {
    return {
      ok: false,
      message: "Sign in before applying Studio tags.",
    };
  }

  if (!canAccessStudio(roles)) {
    return {
      ok: false,
      message: "This account does not have Studio access.",
    };
  }

  const result = await createStudioTaggedSpanWithNode(
    {
      documentStableId: input.documentStableId,
      blockStableId: input.blockStableId,
      tagId: input.tagId,
      startOffset: normalizeOffset(input.startOffset),
      endOffset: normalizeOffset(input.endOffset),
    },
    {
      actorLabel:
        session.user.primaryEmail || session.user.email || session.user.id,
    },
  );

  revalidatePath(getStudioRoute());

  return result;
}
