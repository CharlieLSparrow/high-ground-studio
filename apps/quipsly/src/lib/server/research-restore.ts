import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { researchSha256, stableResearchJson, type ValidatedResearchBundle } from "@/lib/research-portability";
import {
  extractImportedKeywords,
  recordImportedTagCandidatesInTransaction,
} from "@/lib/server/work-tag-candidates";
import { workTagSlug } from "@/lib/server/work-tags";

type RestoreClient = PrismaClient | Prisma.TransactionClient;

export type ResearchRestorePlan = {
  manifestSha256: string;
  sourceCount: number;
  sourceCreates: number;
  sourceReuses: number;
  sourceSlugCollisions: number;
  tagCount: number;
  tagCreates: number;
  tagReuses: number;
  importedKeywordCount: number;
  keywordCandidateCreates: number;
  keywordCandidateReuses: number;
  annotationCount: number;
  annotationCreates: number;
  annotationReuses: number;
  writingUseCount: number;
  writingUseCreates: number;
  writingUseReuses: number;
  writingUsesDeferred: number;
  writingTargetDocumentCreates: number;
  writingTargetDocumentReuses: number;
  writingTargetBlockCreates: number;
  writingTargetBlockReuses: number;
  sourceMutations: 0;
  overwrites: 0;
};

function annotationOriginKey(originalProjectId: string, originalAnnotationId: string) {
  return `${originalProjectId}:${originalAnnotationId}`;
}

function annotationRequestId(originalProjectId: string, originalAnnotationId: string) {
  return `research-restore:${researchSha256(annotationOriginKey(originalProjectId, originalAnnotationId)).slice(0, 52)}`;
}

function writingUseRequestId(
  bundle: ValidatedResearchBundle,
  use: ValidatedResearchBundle["writingUses"][number],
) {
  const target = bundle.writingTargets.find((candidate) => candidate.useId === use.id) ?? null;
  const snapshotDigest = researchSha256(stableResearchJson({ use, target }));
  return `research-restore-use:${researchSha256(`${bundle.project.id}:${use.id}:${snapshotDigest}`).slice(0, 48)}`;
}

type WritingTarget = ValidatedResearchBundle["writingTargets"][number];

type WritingTargetGroup = {
  originalDocumentId: string;
  document: WritingTarget["document"];
  targets: WritingTarget[];
  restoredStableId: string;
};

function writingTargetGroups(bundle: ValidatedResearchBundle): WritingTargetGroup[] {
  const grouped = new Map<string, WritingTarget[]>();
  for (const target of bundle.writingTargets) {
    const targets = grouped.get(target.document.id) ?? [];
    targets.push(target);
    grouped.set(target.document.id, targets);
  }
  return [...grouped.entries()].map(([originalDocumentId, targets]) => {
    const uniqueBlockTargets = [...new Map(targets.map((target) => [target.block.id, target])).values()];
    const sortedTargets = uniqueBlockTargets.sort((left, right) => (
      left.block.order - right.block.order || left.block.id.localeCompare(right.block.id)
    ));
    const digest = researchSha256(stableResearchJson({
      document: sortedTargets[0].document,
      blocks: sortedTargets.map((target) => target.block),
    }));
    return {
      originalDocumentId,
      document: sortedTargets[0].document,
      targets: sortedTargets,
      restoredStableId: `research-restore-doc-${researchSha256(`${bundle.project.id}:${originalDocumentId}:${digest}`).slice(0, 52)}`,
    };
  });
}

function restoredBlockStableId(bundle: ValidatedResearchBundle, target: WritingTarget) {
  return `research-restore-block-${researchSha256(`${bundle.project.id}:${target.document.id}:${target.block.id}`).slice(0, 50)}`;
}

function collisionSlug(slug: string, sourceHash: string | null, originalId: string) {
  const suffix = (sourceHash || researchSha256(originalId)).slice(0, 12);
  return `${slug.slice(0, 170)}-restored-${suffix}`;
}

async function findTargetSource(client: RestoreClient, projectId: string, source: ValidatedResearchBundle["sources"][number]) {
  const original = await client.studioSourceUnit.findUnique({
    where: { projectId_slug: { projectId, slug: source.slug } },
    select: { id: true, slug: true, immutableText: true },
  });
  if (!original || original.immutableText === source.immutableText) {
    return { existing: original, targetSlug: source.slug, collision: false };
  }
  const targetSlug = collisionSlug(source.slug, source.immutableTextSha256, source.id);
  const versioned = await client.studioSourceUnit.findUnique({
    where: { projectId_slug: { projectId, slug: targetSlug } },
    select: { id: true, slug: true, immutableText: true },
  });
  if (versioned && versioned.immutableText !== source.immutableText) {
    throw new Error(`A versioned restore source already exists with different immutable content (${targetSlug}).`);
  }
  return { existing: versioned, targetSlug, collision: true };
}

export async function buildResearchRestorePlan(
  prisma: RestoreClient,
  input: { projectId: string; actorUserId: string; bundle: ValidatedResearchBundle },
): Promise<ResearchRestorePlan> {
  let sourceCreates = 0;
  let sourceReuses = 0;
  let sourceSlugCollisions = 0;
  for (const source of input.bundle.sources) {
    const target = await findTargetSource(prisma, input.projectId, source);
    if (target.existing) sourceReuses += 1;
    else sourceCreates += 1;
    if (target.collision) sourceSlugCollisions += 1;
  }

  const existingTags = input.bundle.tags.length > 0
    ? await prisma.studioTag.findMany({
        where: { projectId: input.projectId, slug: { in: input.bundle.tags.map((tag) => tag.slug) } },
        select: { slug: true },
      })
    : [];
  const existingTagSlugs = new Set(existingTags.map((tag) => tag.slug));
  const importedKeywordSlugs = new Set(
    input.bundle.sources.flatMap((source) => extractImportedKeywords(source.metadataJson))
      .map(workTagSlug),
  );
  const existingCandidates = importedKeywordSlugs.size > 0
    ? await prisma.studioTagCandidate.findMany({
        where: { projectId: input.projectId, slug: { in: [...importedKeywordSlugs] } },
        select: { slug: true },
      })
    : [];
  const existingCandidateSlugs = new Set(existingCandidates.map((candidate) => candidate.slug));
  const requestIds = input.bundle.annotations.map((annotation) => annotationRequestId(input.bundle.project.id, annotation.id));
  const existingAnnotations = requestIds.length > 0
    ? await prisma.$queryRaw<Array<{ clientRequestId: string | null; provenanceJson: Record<string, unknown> }>>(Prisma.sql`
        SELECT "clientRequestId", "provenanceJson"
        FROM "StudioSourceAnnotation"
        WHERE "projectId" = ${input.projectId} AND "createdByUserId" = ${input.actorUserId}
      `)
    : [];
  const existingRequestIds = new Set(existingAnnotations.map((annotation) => annotation.clientRequestId).filter(Boolean));
  const existingOriginKeys = new Set(existingAnnotations.map((annotation) => {
    const restore = annotation.provenanceJson && typeof annotation.provenanceJson === "object"
      ? (annotation.provenanceJson.restore as Record<string, unknown> | undefined)
      : undefined;
    return typeof restore?.originalProjectId === "string" && typeof restore?.originalAnnotationId === "string"
      ? annotationOriginKey(restore.originalProjectId, restore.originalAnnotationId)
      : "";
  }).filter(Boolean));
  const annotationExists = (annotation: ValidatedResearchBundle["annotations"][number], requestId: string) => (
    existingRequestIds.has(requestId) || existingOriginKeys.has(annotationOriginKey(input.bundle.project.id, annotation.id))
  );

  let writingTargetDocumentCreates = 0;
  let writingTargetDocumentReuses = 0;
  let writingTargetBlockCreates = 0;
  let writingTargetBlockReuses = 0;
  for (const group of writingTargetGroups(input.bundle)) {
    const existingDocument = await prisma.studioDocument.findUnique({
      where: { stableId: group.restoredStableId },
      select: { id: true, projectId: true },
    });
    if (!existingDocument) {
      writingTargetDocumentCreates += 1;
      writingTargetBlockCreates += group.targets.length;
      continue;
    }
    if (existingDocument.projectId !== input.projectId) {
      throw new Error("A portable writing-target identity belongs to another destination Nest.");
    }
    writingTargetDocumentReuses += 1;
    const existingBlocks = await prisma.studioDocumentBlock.findMany({
      where: {
        documentId: existingDocument.id,
        stableId: { in: group.targets.map((target) => restoredBlockStableId(input.bundle, target)) },
      },
      select: { stableId: true },
    });
    const existingStableIds = new Set(existingBlocks.map((block) => block.stableId));
    writingTargetBlockReuses += group.targets.filter((target) => existingStableIds.has(restoredBlockStableId(input.bundle, target))).length;
    writingTargetBlockCreates += group.targets.filter((target) => !existingStableIds.has(restoredBlockStableId(input.bundle, target))).length;
  }

  const writingTargetUseIds = new Set(input.bundle.writingTargets.map((target) => target.useId));
  const restorableUses = input.bundle.writingUses.filter((use) => writingTargetUseIds.has(use.id));
  const writingUseRequestIds = restorableUses.map((use) => writingUseRequestId(input.bundle, use));
  const existingWritingUses = writingUseRequestIds.length > 0
    ? await prisma.studioSourceAnnotationUse.findMany({
        where: { createdByUserId: input.actorUserId, clientRequestId: { in: writingUseRequestIds } },
        select: { clientRequestId: true },
      })
    : [];
  const existingWritingUseRequestIds = new Set(existingWritingUses.map((use) => use.clientRequestId).filter(Boolean));
  const writingUseReuses = writingUseRequestIds.filter((requestId) => existingWritingUseRequestIds.has(requestId)).length;

  return {
    manifestSha256: input.bundle.manifestSha256,
    sourceCount: input.bundle.sources.length,
    sourceCreates,
    sourceReuses,
    sourceSlugCollisions,
    tagCount: input.bundle.tags.length,
    tagCreates: input.bundle.tags.filter((tag) => !existingTagSlugs.has(tag.slug)).length,
    tagReuses: input.bundle.tags.filter((tag) => existingTagSlugs.has(tag.slug)).length,
    importedKeywordCount: input.bundle.sources.reduce(
      (count, source) => count + extractImportedKeywords(source.metadataJson).length,
      0,
    ),
    keywordCandidateCreates: [...importedKeywordSlugs].filter((slug) => !existingCandidateSlugs.has(slug)).length,
    keywordCandidateReuses: [...importedKeywordSlugs].filter((slug) => existingCandidateSlugs.has(slug)).length,
    annotationCount: input.bundle.annotations.length,
    annotationCreates: input.bundle.annotations.filter((annotation, index) => !annotationExists(annotation, requestIds[index])).length,
    annotationReuses: input.bundle.annotations.filter((annotation, index) => annotationExists(annotation, requestIds[index])).length,
    writingUseCount: input.bundle.writingUses.length,
    writingUseCreates: restorableUses.length - writingUseReuses,
    writingUseReuses,
    writingUsesDeferred: input.bundle.writingUses.length - restorableUses.length,
    writingTargetDocumentCreates,
    writingTargetDocumentReuses,
    writingTargetBlockCreates,
    writingTargetBlockReuses,
    sourceMutations: 0,
    overwrites: 0,
  };
}

export async function applyResearchRestore(
  prisma: PrismaClient,
  input: {
    projectId: string;
    actorUserId: string;
    actorEmail: string;
    bundle: ValidatedResearchBundle;
  },
) {
  return prisma.$transaction(async (tx) => {
    const plan = await buildResearchRestorePlan(tx, input);
    const sourceIds = new Map<string, string>();
    for (const source of input.bundle.sources) {
      const target = await findTargetSource(tx, input.projectId, source);
      const restored = target.existing ?? await tx.studioSourceUnit.create({
        data: {
          projectId: input.projectId,
          slug: target.targetSlug,
          kind: source.kind,
          title: source.title,
          sourceUrl: source.sourceUrl,
          sourcePath: source.sourcePath,
          author: source.author,
          capturedAt: source.capturedAt ? new Date(source.capturedAt) : null,
          immutableText: source.immutableText,
          editableNotes: source.editableNotes,
          metadataJson: {
            ...source.metadataJson,
            quipslyRestore: {
              kind: "quipsly-research-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalProjectId: input.bundle.project.id,
              originalSourceUnitId: source.id,
              originalSlug: source.slug,
              restoredAt: new Date().toISOString(),
              sourceMutated: false,
            },
          },
          createdByEmail: input.actorEmail,
        },
        select: { id: true },
      });
      sourceIds.set(source.id, restored.id);
      await recordImportedTagCandidatesInTransaction(tx, {
        projectId: input.projectId,
        sourceKind: "research-source-metadata",
        sourceIdentity: `${input.bundle.manifestSha256}:${source.id}`,
        labels: extractImportedKeywords(source.metadataJson),
        provenanceJson: {
          manifestSha256: input.bundle.manifestSha256,
          originalProjectId: input.bundle.project.id,
          originalSourceUnitId: source.id,
          restoredSourceUnitId: restored.id,
          metadataField: "keywords",
          sourceMutated: false,
        },
      });
    }

    const tagIds = new Map<string, string>();
    for (const tag of input.bundle.tags) {
      let restored = await tx.studioTag.findUnique({
        where: { projectId_slug: { projectId: input.projectId, slug: tag.slug } },
        select: { id: true },
      });
      if (!restored) {
        restored = await tx.studioTag.create({
          data: {
            projectId: input.projectId,
            slug: tag.slug,
            label: tag.label,
            description: tag.description,
            category: tag.category as never,
            nodeType: "source_note",
            isPrivate: tag.isPrivate,
            isActive: true,
          },
          select: { id: true },
        });
      }
      tagIds.set(tag.id, restored.id);
    }

    const restoredAnnotationIds = new Map<string, string>();
    for (const annotation of input.bundle.annotations) {
      const clientRequestId = annotationRequestId(input.bundle.project.id, annotation.id);
      const [existing] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "StudioSourceAnnotation"
        WHERE "projectId" = ${input.projectId}
          AND "createdByUserId" = ${input.actorUserId}
          AND (
            "clientRequestId" = ${clientRequestId}
            OR (
              "provenanceJson"->'restore'->>'originalProjectId' = ${input.bundle.project.id}
              AND "provenanceJson"->'restore'->>'originalAnnotationId' = ${annotation.id}
            )
          )
        LIMIT 1
      `);
      if (existing) {
        restoredAnnotationIds.set(annotation.id, existing.id);
        continue;
      }
      const sourceUnitId = sourceIds.get(annotation.sourceUnitId);
      if (!sourceUnitId) throw new Error(`Restore source mapping is missing for annotation ${annotation.id}.`);
      const restoredTagIds = annotation.tagIds.map((tagId) => tagIds.get(tagId)).filter((tagId): tagId is string => Boolean(tagId));
      if (restoredTagIds.length !== annotation.tagIds.length) {
        throw new Error(`Restore tag mapping is missing for annotation ${annotation.id}.`);
      }
      const id = randomUUID();
      const now = new Date();
      const provenanceJson = JSON.stringify({
        ...annotation.provenanceJson,
        restore: {
          kind: "quipsly-research-restore-v1",
          manifestSha256: input.bundle.manifestSha256,
          originalProjectId: input.bundle.project.id,
          originalAnnotationId: annotation.id,
          restoredAt: now.toISOString(),
          sourceMutated: false,
          overwroteExisting: false,
        },
      });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "StudioSourceAnnotation" (
          "id", "projectId", "sourceUnitId", "createdByUserId", "createdByEmailSnapshot",
          "kind", "status", "visibility", "body", "selectorKind", "startOffset", "endOffset",
          "exactText", "prefixText", "suffixText", "startSeconds", "endSeconds", "sourceFingerprint",
          "clientRequestId", "provenanceJson", "archivedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${input.projectId}, ${sourceUnitId}, ${input.actorUserId}, ${input.actorEmail},
          ${annotation.kind}, ${annotation.status}, ${annotation.visibility}, ${annotation.body}, ${annotation.selectorKind},
          ${annotation.startOffset}, ${annotation.endOffset}, ${annotation.exactText}, ${annotation.prefixText}, ${annotation.suffixText},
          ${annotation.startSeconds}, ${annotation.endSeconds}, ${annotation.sourceFingerprint}, ${clientRequestId},
          ${provenanceJson}::jsonb, ${annotation.status === "archived" ? now : null}, ${now}, ${now}
        )
      `);
      for (const tagId of restoredTagIds) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "StudioSourceAnnotationTag" ("annotationId", "tagId", "createdAt")
          VALUES (${id}, ${tagId}, ${now})
        `);
      }
      const snapshotJson = JSON.stringify({
        kind: annotation.kind,
        status: annotation.status,
        visibility: annotation.visibility,
        body: annotation.body,
        selectorKind: annotation.selectorKind,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
        exactText: annotation.exactText,
        prefixText: annotation.prefixText,
        suffixText: annotation.suffixText,
        sourceFingerprint: annotation.sourceFingerprint,
        tagIds: restoredTagIds,
        restoreManifestSha256: input.bundle.manifestSha256,
        exportedRevisionHistory: annotation.revisions,
      });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "StudioSourceAnnotationRevision" (
          "id", "annotationId", "revision", "operation", "actorUserId", "snapshotJson", "createdAt"
        ) VALUES (${randomUUID()}, ${id}, 1, 'restored-from-export', ${input.actorUserId}, ${snapshotJson}::jsonb, ${now})
      `);
      restoredAnnotationIds.set(annotation.id, id);
    }

    const restoredWritingTargetDocumentIds = new Map<string, string>();
    const restoredWritingTargetBlockIds = new Map<string, string>();
    for (const group of writingTargetGroups(input.bundle)) {
      let document = await tx.studioDocument.findUnique({
        where: { stableId: group.restoredStableId },
        select: { id: true, projectId: true },
      });
      let documentCreated = false;
      if (document && document.projectId !== input.projectId) {
        throw new Error("A portable writing-target identity belongs to another destination Nest.");
      }
      if (!document) {
        document = await tx.studioDocument.create({
          data: {
            projectId: input.projectId,
            stableId: group.restoredStableId,
            title: `Restored excerpt — ${group.document.title}`.slice(0, 500),
            sourceLabel: "Portable research writing excerpt",
            sourcePath: group.document.sourcePath,
            projectionStatus: "private",
            isPrivate: true,
          },
          select: { id: true, projectId: true },
        });
        documentCreated = true;
      }
      restoredWritingTargetDocumentIds.set(group.originalDocumentId, document.id);

      const restoredBlockStableIds: string[] = [];
      for (const target of group.targets) {
        const stableId = restoredBlockStableId(input.bundle, target);
        restoredBlockStableIds.push(stableId);
        let block = await tx.studioDocumentBlock.findUnique({
          where: { documentId_stableId: { documentId: document.id, stableId } },
          select: { id: true, body: true },
        });
        if (block && block.body !== target.block.body) {
          throw new Error("A restored writing block identity no longer matches its portable snapshot.");
        }
        if (!block) {
          block = await tx.studioDocumentBlock.create({
            data: {
              documentId: document.id,
              stableId,
              order: target.block.order,
              title: target.block.title,
              body: target.block.body,
              sourceLabel: target.block.sourceLabel ?? target.document.title,
              sourcePath: target.block.sourcePath ?? target.document.sourcePath,
              externalId: `research-restore:${input.bundle.project.id}:${target.block.id}`.slice(0, 2_000),
              projectionStatus: "private",
              isPrivate: true,
              archivedAt: target.block.archivedAt ? new Date(target.block.archivedAt) : null,
              archivedByLabel: target.block.archivedAt ? "Restored portable snapshot" : null,
            },
            select: { id: true, body: true },
          });
        }
        restoredWritingTargetBlockIds.set(`${target.document.id}:${target.block.id}`, block.id);
      }

      if (documentCreated) {
        await tx.studioDocumentOperation.create({
          data: {
            projectId: input.projectId,
            documentId: document.id,
            actorEmail: input.actorEmail,
            origin: "human",
            operationType: "restore-research-writing-excerpt",
            status: "applied",
            afterJson: { documentStableId: group.restoredStableId, blockStableIds: restoredBlockStableIds },
            payloadJson: {
              schema: "quipsly-research-writing-target-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalProjectId: input.bundle.project.id,
              originalDocumentId: group.originalDocumentId,
              originalDocumentStableId: group.document.stableId,
              snapshotKind: "referenced-blocks-only",
              restoredPrivate: true,
              overwroteExisting: false,
            },
            reversible: true,
          },
        });
      }
    }

    const writingTargetByUseId = new Map(input.bundle.writingTargets.map((target) => [target.useId, target]));
    const restoredWritingUseIds = new Map<string, string>();
    for (const use of input.bundle.writingUses) {
      const target = writingTargetByUseId.get(use.id);
      if (!target) continue;
      const annotationId = restoredAnnotationIds.get(use.annotationId);
      const documentId = restoredWritingTargetDocumentIds.get(target.document.id);
      const blockId = restoredWritingTargetBlockIds.get(`${target.document.id}:${target.block.id}`);
      if (!annotationId || !documentId || !blockId) {
        throw new Error(`Restore writing mapping is incomplete for use ${use.id}.`);
      }
      const clientRequestId = writingUseRequestId(input.bundle, use);
      const existingByRequest = await tx.studioSourceAnnotationUse.findFirst({
        where: { createdByUserId: input.actorUserId, clientRequestId },
        select: { id: true },
      });
      if (existingByRequest) {
        restoredWritingUseIds.set(use.id, existingByRequest.id);
        continue;
      }
      const existingByTarget = await tx.studioSourceAnnotationUse.findUnique({
        where: { annotationId_blockId_useKind: { annotationId, blockId, useKind: use.useKind } },
        select: { id: true },
      });
      if (existingByTarget) {
        restoredWritingUseIds.set(use.id, existingByTarget.id);
        continue;
      }
      const restored = await tx.studioSourceAnnotationUse.create({
        data: {
          annotationId,
          projectId: input.projectId,
          documentId,
          blockId,
          createdByUserId: input.actorUserId,
          clientRequestId,
          useKind: use.useKind,
          citationKey: use.citationKey,
          quoteSnapshot: use.quoteSnapshot,
          citationLabel: use.citationLabel,
          sourceJson: {
            ...use.sourceJson,
            restore: {
              kind: "quipsly-research-writing-use-restore-v1",
              manifestSha256: input.bundle.manifestSha256,
              originalProjectId: input.bundle.project.id,
              originalUseId: use.id,
              originalDocumentId: use.documentId,
              originalBlockId: use.blockId,
              originalCreatedAt: use.createdAt,
              snapshotKind: "referenced-block-only",
              targetRestoredPrivate: true,
              overwroteExisting: false,
            },
          },
          archivedAt: use.archivedAt ? new Date(use.archivedAt) : null,
        },
        select: { id: true },
      });
      restoredWritingUseIds.set(use.id, restored.id);
    }

    return {
      plan,
      restoredSourceIds: Object.fromEntries(sourceIds),
      restoredAnnotationIds: Object.fromEntries(restoredAnnotationIds),
      restoredWritingTargetDocumentIds: Object.fromEntries(restoredWritingTargetDocumentIds),
      restoredWritingUseIds: Object.fromEntries(restoredWritingUseIds),
      boundaries: {
        sourceMutated: false,
        overwroteExisting: false,
        externalResourcesFetched: false,
        providerMutated: false,
        writingTargetsRestoredPrivate: true,
        writingTargetSnapshotKind: "referenced-blocks-only",
        writingUsesDeferred: plan.writingUsesDeferred,
      },
    };
  });
}
