"use server";

import { revalidatePath } from "next/cache";

import { getStudioAccessState } from "@/lib/server/studio-access";
import {
  getStudioWritingDeskRoute,
  type StudioWritingDeskActionResult,
  updateStudioWritingDeskBlock,
} from "@/lib/server/studio-writing-desk";

type UpdateWritingDeskBlockActionInput = {
  documentStableId: string;
  blockStableId: string;
  title: string;
  body: string;
};

export async function updateWritingDeskBlockAction(
  input: UpdateWritingDeskBlockActionInput,
): Promise<StudioWritingDeskActionResult> {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false,
      message: "Sign in before saving Studio drafts.",
    };
  }

  if (!access.canAccess) {
    return {
      ok: false,
      message: "This account does not have Studio access.",
    };
  }

  const result = await updateStudioWritingDeskBlock({
    documentStableId: input.documentStableId,
    blockStableId: input.blockStableId,
    title: input.title,
    body: input.body,
  });

  revalidatePath(getStudioWritingDeskRoute());

  return result;
}
