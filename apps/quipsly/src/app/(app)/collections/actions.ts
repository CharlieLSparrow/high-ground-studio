"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  filePersonalSourceIntoResearch,
  type PersonalSourceFilingResult,
} from "@/lib/server/personal-source-filing";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export async function filePersonalSourceIntoResearchAction(input: {
  captureId: string;
  captureType: string;
  projectSlug: string;
  clientRequestId: string;
}): Promise<PersonalSourceFilingResult> {
  const session = await auth();
  const actorEmail = (session?.user?.primaryEmail || session?.user?.email || "").trim().toLowerCase();
  if (!session?.user?.id || !actorEmail) {
    return { ok: false, code: "NOT_FOUND", message: "Sign in before filing a private capture into Research." };
  }

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: input.projectSlug,
    email: actorEmail,
    action: "write",
    prisma,
  });
  if (!access.allowed || !access.projectId) {
    return { ok: false, code: "FORBIDDEN", message: "Editor access to that Nest is required before filing research." };
  }

  const result = await filePersonalSourceIntoResearch({
    prisma,
    actorUserId: session.user.id,
    actorEmail,
    projectId: access.projectId,
    captureId: input.captureId,
    captureType: input.captureType,
    clientRequestId: input.clientRequestId,
  });
  if (result.ok) {
    revalidatePath("/inbox");
    revalidatePath("/collections");
    revalidatePath("/library");
    revalidatePath("/research");
    revalidatePath(`/nests/${result.projectSlug}`);
  }
  return result;
}
