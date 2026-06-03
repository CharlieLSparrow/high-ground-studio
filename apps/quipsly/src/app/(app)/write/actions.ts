"use server";

import { revalidatePath } from "next/cache";

import { getStudioAccessState } from "@/lib/server/studio-access";
import {
  archiveStudioWritingDeskBlock,
  createStudioWritingDeskBlock,
  getStudioWritingDeskRoute,
  moveStudioWritingDeskBlock,
  type StudioWritingDeskActionResult,
  updateStudioWritingDeskBlock,
} from "@/lib/server/studio-writing-desk";

type UpdateWritingDeskBlockActionInput = {
  documentStableId: string;
  blockStableId: string;
  title: string;
  body: string;
};

type CreateWritingDeskBlockActionInput = {
  documentStableId: string;
  title: string;
  body: string;
};

type MoveWritingDeskBlockActionInput = {
  documentStableId: string;
  blockStableId: string;
  direction: "up" | "down";
};

type ArchiveWritingDeskBlockActionInput = {
  documentStableId: string;
  blockStableId: string;
};

async function getAuthorizedWritingDeskActor(): Promise<
  | {
      ok: true;
      actorLabel: string;
    }
  | {
      ok: false;
      result: StudioWritingDeskActionResult;
    }
> {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "Sign in before changing Studio drafts.",
      },
    };
  }

  if (!access.canAccess) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "This account does not have Studio access.",
      },
    };
  }

  return {
    ok: true,
    actorLabel: access.actorLabel,
  };
}

export async function updateWritingDeskBlockAction(
  input: UpdateWritingDeskBlockActionInput,
): Promise<StudioWritingDeskActionResult> {
  const actor = await getAuthorizedWritingDeskActor();

  if (!actor.ok) {
    return actor.result;
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

export async function createWritingDeskBlockAction(
  input: CreateWritingDeskBlockActionInput,
): Promise<StudioWritingDeskActionResult> {
  const actor = await getAuthorizedWritingDeskActor();

  if (!actor.ok) {
    return actor.result;
  }

  const result = await createStudioWritingDeskBlock({
    documentStableId: input.documentStableId,
    title: input.title,
    body: input.body,
  });

  revalidatePath(getStudioWritingDeskRoute());

  return result;
}

export async function moveWritingDeskBlockAction(
  input: MoveWritingDeskBlockActionInput,
): Promise<StudioWritingDeskActionResult> {
  const actor = await getAuthorizedWritingDeskActor();

  if (!actor.ok) {
    return actor.result;
  }

  const result = await moveStudioWritingDeskBlock({
    documentStableId: input.documentStableId,
    blockStableId: input.blockStableId,
    direction: input.direction,
  });

  revalidatePath(getStudioWritingDeskRoute());

  return result;
}

export async function archiveWritingDeskBlockAction(
  input: ArchiveWritingDeskBlockActionInput,
): Promise<StudioWritingDeskActionResult> {
  const actor = await getAuthorizedWritingDeskActor();

  if (!actor.ok) {
    return actor.result;
  }

  const result = await archiveStudioWritingDeskBlock(
    {
      documentStableId: input.documentStableId,
      blockStableId: input.blockStableId,
    },
    {
      actorLabel: actor.actorLabel,
    },
  );

  revalidatePath(getStudioWritingDeskRoute());

  return result;
}
