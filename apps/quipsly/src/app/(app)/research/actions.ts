"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import {
  createSourceAnnotation,
  createWritingDraftFromSourceAnnotation,
  setSourceAnnotationStatus,
  type SourceAnnotationDraftResult,
  type SourceAnnotationWriteResult,
} from "@/lib/server/source-annotations";
import {
  createResearchStudioHandoff,
  type ResearchStudioHandoffResult,
} from "@/lib/server/research-studio-handoff";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

type CreateSourceAnnotationActionInput = {
  projectSlug: string;
  sourceUnitId: string;
  clientRequestId: string;
  kind: string;
  visibility: string;
  body: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
  tagIds?: string[];
};

function signedOut(): SourceAnnotationWriteResult {
  return { ok: false, code: "NOT_FOUND", message: "Sign in before saving a private source annotation." };
}

export async function createWritingDraftFromAnnotationAction(input: {
  annotationId: string;
  projectSlug: string;
  clientRequestId: string;
  expectedUpdatedAt: string;
}): Promise<SourceAnnotationDraftResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "NOT_FOUND", message: "Sign in before starting a private draft." };
  }
  const email = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!email || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return { ok: false, code: "INVALID", message: "The writing handoff is missing its annotation revision." };
  }
  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({ projectSlug: input.projectSlug, email, action: "write", prisma });
  if (!access.allowed || !access.projectId) {
    return { ok: false, code: "NOT_FOUND", message: "This Nest is not writable by the signed-in account." };
  }
  const result = await createWritingDraftFromSourceAnnotation(prisma, {
    annotationId: input.annotationId,
    projectId: access.projectId,
    projectSlug: input.projectSlug,
    actorUserId: session.user.id,
    actorEmail: email,
    clientRequestId: input.clientRequestId,
    expectedUpdatedAt,
  });
  if (result.ok) {
    revalidatePath("/research");
    revalidatePath(result.href);
  }
  return result;
}

export async function createSourceAnnotationAction(
  input: CreateSourceAnnotationActionInput,
): Promise<SourceAnnotationWriteResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return signedOut();
  const email = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (!email) return signedOut();

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: input.projectSlug,
    email,
    action: "write",
    prisma,
  });
  if (!access.allowed || !access.projectId) {
    return { ok: false, code: "NOT_FOUND", message: "This Nest is not writable by the signed-in account." };
  }

  const result = await createSourceAnnotation(prisma, {
    ...input,
    projectId: access.projectId,
    actorUserId: session.user.id,
    actorEmail: email,
    surface: "nest-research",
  });
  if (result.ok) revalidatePath("/research");
  return result;
}

export async function setSourceAnnotationStatusAction(input: {
  annotationId: string;
  expectedUpdatedAt: string;
  nextStatus: string;
}): Promise<SourceAnnotationWriteResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) return signedOut();
  const email = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!email || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return { ok: false, code: "INVALID", message: "The annotation revision is missing or invalid." };
  }

  const prisma = getPrismaClient();
  const [annotation] = await prisma.$queryRaw<Array<{ projectSlug: string }>>(Prisma.sql`
    SELECT project."slug" AS "projectSlug"
    FROM "StudioSourceAnnotation" annotation
    JOIN "StudioProject" project ON project."id" = annotation."projectId"
    WHERE annotation."id" = ${input.annotationId}
    LIMIT 1
  `);
  if (!annotation) return { ok: false, code: "NOT_FOUND", message: "This annotation is unavailable." };
  const access = await resolveStudioProjectAccess({
    projectSlug: annotation.projectSlug,
    email,
    action: "write",
    prisma,
  });
  if (!access.allowed) {
    return { ok: false, code: "NOT_FOUND", message: "This annotation is unavailable to the signed-in account." };
  }

  const result = await setSourceAnnotationStatus(prisma, {
    annotationId: input.annotationId,
    actorUserId: session.user.id,
    expectedUpdatedAt,
    nextStatus: input.nextStatus,
  });
  if (result.ok) revalidatePath("/research");
  return result;
}

export async function createResearchStudioHandoffAction(input: {
  annotationId: string;
  projectSlug: string;
  expectedUpdatedAt: string;
}): Promise<ResearchStudioHandoffResult> {
  const session = await getQuipslySession();
  if (!session?.user?.id) {
    return { ok: false, code: "NOT_FOUND", message: "Sign in before sending evidence to Studio." };
  }
  const email = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!email || !Number.isFinite(expectedUpdatedAt.getTime())) {
    return { ok: false, code: "INVALID", message: "The Studio handoff is missing its annotation revision." };
  }

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: input.projectSlug,
    email,
    action: "write",
    prisma,
  });
  if (!access.allowed || !access.projectId) {
    return { ok: false, code: "NOT_FOUND", message: "This Nest is not writable by the signed-in account." };
  }

  const result = await createResearchStudioHandoff(prisma, {
    annotationId: input.annotationId,
    projectId: access.projectId,
    actorUserId: session.user.id,
    actorEmail: email,
    expectedUpdatedAt,
  });
  if (result.ok) {
    revalidatePath("/research");
    revalidatePath("/publishing");
  }
  return result;
}
