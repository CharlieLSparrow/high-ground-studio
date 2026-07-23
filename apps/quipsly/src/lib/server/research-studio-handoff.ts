import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export const RESEARCH_STUDIO_HANDOFF_SCHEMA = "quipsly-research-studio-handoff-v1";
export const RESEARCH_STUDIO_HANDOFF_KIND = "research-studio-handoff";

export type ResearchStudioHandoffResult =
  | {
      ok: true;
      packetId: string;
      packetSlug: string;
      revision: number;
      reused: boolean;
    }
  | {
      ok: false;
      code: "INVALID" | "NOT_FOUND" | "CONFLICT" | "PRIVATE";
      message: string;
    };

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function packetDigest(value: unknown) {
  return sha256(JSON.stringify(stableValue(value)));
}

export async function createResearchStudioHandoff(
  prisma: PrismaClient,
  input: {
    annotationId: string;
    projectId: string;
    actorUserId: string;
    actorEmail: string;
    expectedUpdatedAt: Date;
  },
): Promise<ResearchStudioHandoffResult> {
  if (!input.annotationId.trim() || !input.projectId.trim() || !input.actorUserId.trim()) {
    return { ok: false, code: "INVALID", message: "The Studio handoff is missing its source identity." };
  }
  if (!Number.isFinite(input.expectedUpdatedAt.getTime())) {
    return { ok: false, code: "INVALID", message: "The Studio handoff is missing its annotation revision." };
  }

  return prisma.$transaction(async (tx) => {
    const annotation = await tx.studioSourceAnnotation.findFirst({
      where: {
        id: input.annotationId,
        projectId: input.projectId,
        archivedAt: null,
      },
      include: {
        project: { select: { id: true, slug: true, name: true } },
        sourceUnit: {
          select: {
            id: true,
            slug: true,
            kind: true,
            title: true,
            sourceUrl: true,
            sourcePath: true,
            author: true,
            immutableText: true,
            documentId: true,
          },
        },
        revisions: { orderBy: { revision: "asc" } },
        tags: {
          include: {
            tag: { select: { id: true, slug: true, label: true, category: true } },
          },
          orderBy: { tag: { label: "asc" } },
        },
        uses: {
          where: { archivedAt: null },
          include: {
            document: { select: { id: true, stableId: true, title: true, isPrivate: true } },
            block: { select: { id: true, stableId: true, externalId: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!annotation?.sourceUnit.immutableText) {
      return { ok: false as const, code: "NOT_FOUND" as const, message: "This preserved annotation is unavailable." };
    }
    if (annotation.visibility !== "project") {
      return {
        ok: false as const,
        code: "PRIVATE" as const,
        message: "Private notes stay private. Share the annotation with this Nest before sending it to Studio.",
      };
    }
    if (annotation.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "This annotation changed elsewhere. Refresh before sending a pinned revision to Studio.",
      };
    }

    const { immutableText } = annotation.sourceUnit;
    const startOffset = annotation.startOffset;
    const endOffset = annotation.endOffset;
    if (
      startOffset == null
      || endOffset == null
      || !annotation.exactText
      || startOffset < 0
      || endOffset <= startOffset
      || immutableText.slice(startOffset, endOffset) !== annotation.exactText
    ) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "The exact source anchor no longer verifies. Repair it before sending anything to Studio.",
      };
    }

    const latestRevision = annotation.revisions.at(-1);
    if (!latestRevision) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "This annotation has no revision receipt, so Studio cannot trust it yet.",
      };
    }

    const sourceFingerprint = sha256(immutableText);
    if (annotation.sourceFingerprint && annotation.sourceFingerprint !== sourceFingerprint) {
      return {
        ok: false as const,
        code: "CONFLICT" as const,
        message: "The preserved source fingerprint no longer matches the annotation receipt.",
      };
    }

    const packetSlug = `research-annotation-${annotation.id}-r${latestRevision.revision}`;
    const existing = await tx.studioOutputPacket.findUnique({
      where: { projectId_slug: { projectId: annotation.projectId, slug: packetSlug } },
      select: { id: true, kind: true, packetJson: true },
    });
    if (existing) {
      const existingSchema = existing.packetJson && typeof existing.packetJson === "object" && !Array.isArray(existing.packetJson)
        ? (existing.packetJson as Record<string, unknown>).schema
        : null;
      if (existing.kind !== RESEARCH_STUDIO_HANDOFF_KIND || existingSchema !== RESEARCH_STUDIO_HANDOFF_SCHEMA) {
        return {
          ok: false as const,
          code: "CONFLICT" as const,
          message: "That Studio packet identity is already occupied by an incompatible record.",
        };
      }
      return {
        ok: true as const,
        packetId: existing.id,
        packetSlug,
        revision: latestRevision.revision,
        reused: true,
      };
    }

    const publicWritingUses = annotation.uses.filter((use) => !use.document.isPrivate);
    const privateWritingUseCount = annotation.uses.length - publicWritingUses.length;
    const preparedAt = new Date();
    const payloadWithoutDigest = {
      schema: RESEARCH_STUDIO_HANDOFF_SCHEMA,
      preparedAt: preparedAt.toISOString(),
      purpose: "Give Quipsly Studio a source-verifiable editorial brief without changing source media or private writing.",
      project: {
        id: annotation.project.id,
        slug: annotation.project.slug,
        name: annotation.project.name,
      },
      source: {
        id: annotation.sourceUnit.id,
        slug: annotation.sourceUnit.slug,
        kind: annotation.sourceUnit.kind,
        title: annotation.sourceUnit.title,
        author: annotation.sourceUnit.author,
        sourceUrl: annotation.sourceUnit.sourceUrl,
        sourcePath: annotation.sourceUnit.sourcePath,
        contentSha256: sourceFingerprint,
        immutable: true,
      },
      annotation: {
        id: annotation.id,
        revision: latestRevision.revision,
        revisionOperation: latestRevision.operation,
        kind: annotation.kind,
        status: annotation.status,
        visibility: annotation.visibility,
        body: annotation.body,
        exactText: annotation.exactText,
        selector: {
          kind: annotation.selectorKind,
          startOffset,
          endOffset,
          prefixText: annotation.prefixText,
          suffixText: annotation.suffixText,
        },
        tags: annotation.tags.map(({ tag }) => tag),
        updatedAt: annotation.updatedAt.toISOString(),
      },
      writing: {
        publicUses: publicWritingUses.map((use) => ({
          id: use.id,
          useKind: use.useKind,
          citationKey: use.citationKey,
          quoteSha256: sha256(use.quoteSnapshot),
          document: {
            id: use.document.id,
            stableId: use.document.stableId,
            title: use.document.title,
          },
          block: {
            id: use.block.id,
            stableId: use.block.stableId,
            externalId: use.block.externalId,
          },
        })),
        privateUseCount: privateWritingUseCount,
        privacyTruth: privateWritingUseCount > 0
          ? "Private writing exists but its document, block, title, and body are deliberately omitted."
          : "No private writing-use metadata was included.",
      },
      safety: {
        sourceMutated: false,
        mediaMutated: false,
        privateWritingDisclosed: false,
        publishAuthorized: false,
        humanReviewRequired: true,
      },
    };
    const digest = packetDigest(payloadWithoutDigest);
    const packetJson = {
      ...payloadWithoutDigest,
      integrity: { algorithm: "sha256", digest },
    } satisfies Prisma.InputJsonObject;
    const lineageJson = {
      schema: RESEARCH_STUDIO_HANDOFF_SCHEMA,
      sourceUnitId: annotation.sourceUnit.id,
      sourceContentSha256: sourceFingerprint,
      annotationId: annotation.id,
      annotationRevision: latestRevision.revision,
      annotationRevisionId: latestRevision.id,
      annotationUpdatedAt: annotation.updatedAt.toISOString(),
      sourceMutated: false,
      privateWritingDisclosed: false,
    } satisfies Prisma.InputJsonObject;

    const packet = await tx.studioOutputPacket.create({
      data: {
        projectId: annotation.projectId,
        documentId: annotation.sourceUnit.documentId,
        slug: packetSlug,
        kind: RESEARCH_STUDIO_HANDOFF_KIND,
        title: `Studio evidence · ${annotation.sourceUnit.title}`,
        status: "ready-for-studio",
        packetJson,
        lineageJson,
        createdByEmail: input.actorEmail.trim().toLowerCase().slice(0, 320),
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      packetId: packet.id,
      packetSlug,
      revision: latestRevision.revision,
      reused: false,
    };
  });
}
