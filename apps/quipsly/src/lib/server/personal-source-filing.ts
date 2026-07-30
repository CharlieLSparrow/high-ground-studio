import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const PERSONAL_SOURCE_CAPTURE_TYPES = ["SNIPPET", "BOOKMARK"] as const;
export type PersonalSourceCaptureType = (typeof PERSONAL_SOURCE_CAPTURE_TYPES)[number];

export type PersonalSourceFilingResult =
  | {
      ok: true;
      filingId: string;
      sourceUnitId: string;
      projectId: string;
      projectSlug: string;
      projectName: string;
      captureId: string;
      captureType: PersonalSourceCaptureType;
      reused: boolean;
      href: string;
    }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT"; message: string };

type FilingInput = {
  prisma: PrismaClient;
  actorUserId: string;
  actorEmail: string;
  projectId: string;
  captureId: string;
  captureType: string;
  clientRequestId: string;
  expectedCaptureUpdatedAt?: Date;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function capturedAtFromMetadata(value: unknown, fallback: Date) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = (value as Record<string, unknown>).capturedAt;
  if (typeof candidate !== "string") return fallback;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function sourceSlug(captureType: PersonalSourceCaptureType, captureId: string) {
  const safeId = captureId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `personal-${captureType.toLowerCase()}-${safeId || sha256(captureId).slice(0, 20)}`;
}

function isCaptureType(value: string): value is PersonalSourceCaptureType {
  return PERSONAL_SOURCE_CAPTURE_TYPES.includes(value as PersonalSourceCaptureType);
}

function resultFromFiling(filing: {
  id: string;
  sourceUnitId: string;
  projectId: string;
  snippetId: string | null;
  bookmarkId: string | null;
  captureType: string;
  project: { slug: string; name: string };
}, reused: boolean): PersonalSourceFilingResult {
  if (!isCaptureType(filing.captureType)) {
    return { ok: false, code: "CONFLICT", message: "The existing filing receipt has an unsupported capture type." };
  }
  const captureId = filing.captureType === "SNIPPET" ? filing.snippetId : filing.bookmarkId;
  if (!captureId) {
    return { ok: false, code: "CONFLICT", message: "The existing filing receipt no longer identifies its personal source." };
  }
  return {
    ok: true,
    filingId: filing.id,
    sourceUnitId: filing.sourceUnitId,
    projectId: filing.projectId,
    projectSlug: filing.project.slug,
    projectName: filing.project.name,
    captureId,
    captureType: filing.captureType,
    reused,
    href: `/research?source=${encodeURIComponent(filing.sourceUnitId)}`,
  };
}

async function findExistingCaptureFiling(
  prisma: PrismaClient,
  input: { actorUserId: string; projectId: string; captureId: string; captureType: PersonalSourceCaptureType },
) {
  return prisma.studioPersonalSourceFiling.findFirst({
    where: {
      createdByUserId: input.actorUserId,
      projectId: input.projectId,
      ...(input.captureType === "SNIPPET" ? { snippetId: input.captureId } : { bookmarkId: input.captureId }),
    },
    include: { project: { select: { slug: true, name: true } } },
  });
}

export async function filePersonalSourceIntoResearch(input: FilingInput): Promise<PersonalSourceFilingResult> {
  const actorEmail = text(input.actorEmail, 320).toLowerCase();
  const actorUserId = text(input.actorUserId, 160);
  const projectId = text(input.projectId, 160);
  const captureId = text(input.captureId, 200);
  const captureType = text(input.captureType, 20).toUpperCase();
  const clientRequestId = text(input.clientRequestId, 160);

  if (!actorEmail || !actorUserId || !projectId || !captureId || !clientRequestId || !isCaptureType(captureType)) {
    return { ok: false, code: "INVALID", message: "Choose one personal source and one destination Nest before filing." };
  }

  try {
    return await input.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findFirst({
        where: {
          id: actorUserId,
          OR: [
            { primaryEmail: actorEmail },
            { aliases: { some: { email: actorEmail } } },
          ],
        },
        select: { id: true, roles: { select: { role: true } } },
      });
      if (!actor) return { ok: false as const, code: "NOT_FOUND" as const, message: "The personal source owner is unavailable." };

      const project = await tx.studioProject.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          slug: true,
          name: true,
          workspace: { select: { ownerLabel: true } },
          accessGrants: {
            where: { email: actorEmail, status: "ACTIVE" },
            select: { role: true },
          },
        },
      });
      if (!project) return { ok: false as const, code: "NOT_FOUND" as const, message: "That destination Nest is unavailable." };
      const ownsWorkspace = text(project.workspace.ownerLabel, 320).toLowerCase() === actorEmail;
      const canWriteByGrant = project.accessGrants.some((grant) => grant.role === "OWNER" || grant.role === "EDITOR");
      const isOwner = actor.roles.some((role) => String(role.role) === "OWNER");
      if (!ownsWorkspace && !canWriteByGrant && !isOwner) {
        return { ok: false as const, code: "FORBIDDEN" as const, message: "Editor access to that Nest is required before filing research." };
      }

      const existingRequest = await tx.studioPersonalSourceFiling.findFirst({
        where: { createdByUserId: actorUserId, clientRequestId },
        include: { project: { select: { slug: true, name: true } } },
      });
      if (existingRequest) {
        const sameCapture = existingRequest.captureType === captureType
          && (captureType === "SNIPPET" ? existingRequest.snippetId === captureId : existingRequest.bookmarkId === captureId);
        if (existingRequest.projectId !== projectId || !sameCapture) {
          return { ok: false as const, code: "CONFLICT" as const, message: "That filing identity already belongs to another source or Nest." };
        }
        return resultFromFiling(existingRequest, true);
      }

      const existingCapture = await tx.studioPersonalSourceFiling.findFirst({
        where: {
          createdByUserId: actorUserId,
          projectId,
          ...(captureType === "SNIPPET" ? { snippetId: captureId } : { bookmarkId: captureId }),
        },
        include: { project: { select: { slug: true, name: true } } },
      });
      if (existingCapture) return resultFromFiling(existingCapture, true);

      const snippet = captureType === "SNIPPET"
        ? await tx.snippet.findFirst({
            where: { id: captureId, userId: actorUserId },
            select: {
              id: true,
              sourceTitle: true,
              sourceUrl: true,
              highlightedText: true,
              metadataJson: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { captureReceipts: true } },
              captureReceipts: { orderBy: { capturedAt: "asc" }, take: 1, select: { capturedAt: true } },
            },
          })
        : null;
      const bookmark = captureType === "BOOKMARK"
        ? await tx.bookmark.findFirst({
            where: { id: captureId, userId: actorUserId },
            select: {
              id: true,
              title: true,
              url: true,
              metadataJson: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { captureReceipts: true } },
              captureReceipts: { orderBy: { capturedAt: "asc" }, take: 1, select: { capturedAt: true } },
            },
          })
        : null;
      if (!snippet && !bookmark) {
        return { ok: false as const, code: "NOT_FOUND" as const, message: "That personal source is unavailable to the signed-in account." };
      }
      const captureUpdatedAt = snippet?.updatedAt ?? bookmark?.updatedAt;
      if (input.expectedCaptureUpdatedAt
          && captureUpdatedAt?.getTime() !== input.expectedCaptureUpdatedAt.getTime()) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          message: "This private source changed after the phone review. Refresh before filing it into Research.",
        };
      }

      const immutableText = snippet?.highlightedText ?? bookmark?.url ?? "";
      const sourceUrl = snippet?.sourceUrl ?? bookmark?.url ?? null;
      const title = text(snippet?.sourceTitle || bookmark?.title, 500)
        || (captureType === "SNIPPET" ? "Saved passage" : "Saved link");
      if (!immutableText || immutableText.length > 250_000) {
        return { ok: false as const, code: "INVALID" as const, message: "This capture has no bounded source evidence to file." };
      }
      if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
        } catch {
          return { ok: false as const, code: "INVALID" as const, message: "Review the source URL before filing it into Research." };
        }
      }

      const filingId = randomUUID();
      const sourceUnitId = randomUUID();
      const occurredAt = new Date();
      const capturedAt = snippet
        ? snippet.captureReceipts[0]?.capturedAt || capturedAtFromMetadata(snippet.metadataJson, snippet.createdAt)
        : bookmark
          ? bookmark.captureReceipts[0]?.capturedAt || capturedAtFromMetadata(bookmark.metadataJson, bookmark.createdAt)
          : occurredAt;
      const captureCountAtFiling = snippet?._count.captureReceipts || bookmark?._count.captureReceipts || 1;
      const captureSnapshotJson = {
        kind: "quipsly-personal-source-filing-v1",
        personalCaptureType: captureType,
        personalCaptureId: captureId,
        capturedAt: capturedAt.toISOString(),
        captureCountAtFiling,
        filedAt: occurredAt.toISOString(),
        title,
        sourceUrl,
        immutableTextSha256: sha256(immutableText),
        privateCaptureMutated: false,
        collaboratorsReceivePrivateCollectionAccess: false,
        externalSideEffects: false,
      } satisfies Prisma.InputJsonObject;
      const metadataJson = {
        kind: "quipsly-filed-personal-source-v1",
        filingReceiptId: filingId,
        filedFrom: "personal-inbox",
        personalCaptureType: captureType,
        privateCaptureMutated: false,
        pageContentImported: captureType === "SNIPPET",
        externalSideEffects: false,
      } satisfies Prisma.InputJsonObject;

      await tx.studioSourceUnit.create({
        data: {
          id: sourceUnitId,
          projectId,
          slug: sourceSlug(captureType, captureId),
          kind: captureType === "SNIPPET" ? "captured-passage" : "saved-web-link",
          title,
          sourceUrl,
          capturedAt,
          immutableText,
          metadataJson,
          createdByEmail: actorEmail,
        },
      });
      const filing = await tx.studioPersonalSourceFiling.create({
        data: {
          id: filingId,
          projectId,
          sourceUnitId,
          createdByUserId: actorUserId,
          createdByEmailSnapshot: actorEmail,
          captureType,
          snippetId: captureType === "SNIPPET" ? captureId : null,
          bookmarkId: captureType === "BOOKMARK" ? captureId : null,
          clientRequestId,
          captureSnapshotJson,
          createdAt: occurredAt,
        },
        include: { project: { select: { slug: true, name: true } } },
      });
      return resultFromFiling(filing, false);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExistingCaptureFiling(input.prisma, { actorUserId, projectId, captureId, captureType });
      if (existing) return resultFromFiling(existing, true);
      return { ok: false, code: "CONFLICT", message: "This source was filed elsewhere at the same moment. Refresh before deciding again." };
    }
    throw error;
  }
}
