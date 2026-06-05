"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  createStudioTaggedSpanWithNode,
  getStudioRoute,
  type StudioActionResult,
} from "@/lib/server/studio-data";
import { requireProjectAccess } from "@/lib/server/access";
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

  const prisma = getPrismaClient();
  const document = await prisma.studioDocument.findUnique({
    where: { stableId: input.documentStableId },
    include: { project: true },
  });

  if (!document?.project) {
    return {
      ok: false,
      message: "Studio project/document not found.",
    };
  }

  try {
    await requireProjectAccess(document.project.slug, "write");
  } catch (err: any) {
    return {
      ok: false,
      message: err.message,
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
