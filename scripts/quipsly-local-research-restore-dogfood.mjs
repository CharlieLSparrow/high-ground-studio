import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  RESEARCH_EXPORT_SCHEMA_VERSION,
  researchSha256,
  stableResearchJson,
  validateResearchBundle,
} from "../apps/quipsly/src/lib/research-portability.ts";
import {
  applyResearchRestore,
  buildResearchRestorePlan,
} from "../apps/quipsly/src/lib/server/research-restore.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");
const ACTOR_EMAIL = "dev@quipsly.com";
const SOURCE_PROJECT_SLUG = "quipsly-local-dogfood";
const TARGET_PROJECT_SLUG = "quipsly-local-restored-research";

function assertLocalDatabase(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to restore against non-local database host ${url.hostname}.`);
  }
}

async function buildBundle(prisma, project, actorUserId) {
  const [sources, tags, annotations, writingUses] = await Promise.all([
    prisma.studioSourceUnit.findMany({
      where: { projectId: project.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true, slug: true, kind: true, title: true, sourceUrl: true, sourcePath: true, author: true,
        capturedAt: true, immutableText: true, editableNotes: true, metadataJson: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.studioTag.findMany({
      where: { projectId: project.id, isActive: true },
      orderBy: [{ label: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, label: true, description: true, category: true, isPrivate: true, createdAt: true, updatedAt: true },
    }),
    prisma.$queryRaw(Prisma.sql`
      SELECT annotation."id", annotation."sourceUnitId", annotation."documentId", annotation."blockId",
             annotation."kind", annotation."status", annotation."visibility", annotation."body",
             annotation."selectorKind", annotation."startOffset", annotation."endOffset", annotation."exactText",
             annotation."prefixText", annotation."suffixText", annotation."startSeconds", annotation."endSeconds",
             annotation."sourceFingerprint", annotation."provenanceJson", annotation."createdAt", annotation."updatedAt",
             COALESCE((
               SELECT array_agg(annotation_tag."tagId" ORDER BY annotation_tag."tagId")
               FROM "StudioSourceAnnotationTag" annotation_tag
               WHERE annotation_tag."annotationId" = annotation."id"
             ), ARRAY[]::text[]) AS "tagIds",
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'revision', revision."revision", 'operation', revision."operation", 'snapshot', revision."snapshotJson", 'createdAt', revision."createdAt"
               ) ORDER BY revision."revision")
               FROM "StudioSourceAnnotationRevision" revision
               WHERE revision."annotationId" = annotation."id"
             ), '[]'::jsonb) AS "revisions"
      FROM "StudioSourceAnnotation" annotation
      WHERE annotation."projectId" = ${project.id}
        AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${actorUserId})
      ORDER BY annotation."createdAt" ASC, annotation."id" ASC
    `),
    prisma.$queryRaw(Prisma.sql`
      SELECT annotation_use."id", annotation_use."annotationId", annotation_use."documentId", annotation_use."blockId",
             annotation_use."useKind", annotation_use."citationKey", annotation_use."quoteSnapshot",
             annotation_use."citationLabel", annotation_use."sourceJson", annotation_use."archivedAt", annotation_use."createdAt"
      FROM "StudioSourceAnnotationUse" annotation_use
      JOIN "StudioSourceAnnotation" annotation ON annotation."id" = annotation_use."annotationId"
      WHERE annotation_use."projectId" = ${project.id}
        AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${actorUserId})
      ORDER BY annotation_use."createdAt" ASC, annotation_use."id" ASC
    `),
  ]);

  const payload = {
    schemaVersion: RESEARCH_EXPORT_SCHEMA_VERSION,
    exportedAt: project.updatedAt.toISOString(),
    project: { id: project.id, slug: project.slug, name: project.name, updatedAt: project.updatedAt.toISOString() },
    sources: sources.map((source) => ({
      ...source,
      capturedAt: source.capturedAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      immutableTextSha256: source.immutableText == null ? null : researchSha256(source.immutableText),
    })),
    tags: tags.map((tag) => ({ ...tag, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString() })),
    annotations: JSON.parse(JSON.stringify(annotations)),
    writingUses: JSON.parse(JSON.stringify(writingUses)),
    boundaries: {
      actorScoped: true,
      privateAnnotationsLimitedToExporter: true,
      immutableSourceTextIncluded: true,
      externalResourcesFetched: false,
      sourceMutated: false,
      providerMutated: false,
    },
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      manifestSha256: researchSha256(stableResearchJson(payload)),
      sourceCount: payload.sources.length,
      annotationCount: payload.annotations.length,
      writingUseCount: payload.writingUses.length,
    },
  };
}

async function main() {
  assertLocalDatabase(DATABASE_URL);
  if (!APPLY) {
    console.log(JSON.stringify({ ready: true, applyRequired: true, localOnly: true, sourceProject: SOURCE_PROJECT_SLUG, targetProject: TARGET_PROJECT_SLUG }, null, 2));
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL), log: ["error"] });
  try {
    const actor = await prisma.user.findUniqueOrThrow({ where: { primaryEmail: ACTOR_EMAIL } });
    const sourceProject = await prisma.studioProject.findFirstOrThrow({ where: { slug: SOURCE_PROJECT_SLUG }, orderBy: { updatedAt: "desc" } });
    const targetProject = await prisma.studioProject.upsert({
      where: { workspaceId_slug: { workspaceId: sourceProject.workspaceId, slug: TARGET_PROJECT_SLUG } },
      update: {},
      create: {
        workspaceId: sourceProject.workspaceId,
        slug: TARGET_PROJECT_SLUG,
        name: "Restored High Ground research dogfood",
        description: "Disposable local destination for verified research export/restore dogfood.",
        sourceLabel: "local-dogfood:research-restore",
        isPrivate: true,
      },
    });
    await prisma.studioProjectAccessGrant.upsert({
      where: { projectId_email: { projectId: targetProject.id, email: ACTOR_EMAIL } },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        projectId: targetProject.id,
        email: ACTOR_EMAIL,
        role: "OWNER",
        status: "ACTIVE",
        createdByUserId: actor.id,
        createdByEmail: ACTOR_EMAIL,
        note: "Local-only restore dogfood grant.",
      },
    });

    const rawBundle = await buildBundle(prisma, sourceProject, actor.id);
    const validation = validateResearchBundle(rawBundle);
    if (!validation.ok) throw new Error(validation.error);
    const beforePlan = await buildResearchRestorePlan(prisma, { projectId: targetProject.id, actorUserId: actor.id, bundle: validation.bundle });
    const first = await applyResearchRestore(prisma, {
      projectId: targetProject.id,
      actorUserId: actor.id,
      actorEmail: ACTOR_EMAIL,
      bundle: validation.bundle,
    });
    const second = await applyResearchRestore(prisma, {
      projectId: targetProject.id,
      actorUserId: actor.id,
      actorEmail: ACTOR_EMAIL,
      bundle: validation.bundle,
    });
    const afterPlan = await buildResearchRestorePlan(prisma, { projectId: targetProject.id, actorUserId: actor.id, bundle: validation.bundle });

    const [restoredSources, restoredAnnotations, restoredRevisions] = await Promise.all([
      prisma.studioSourceUnit.findMany({ where: { projectId: targetProject.id }, select: { id: true, immutableText: true, metadataJson: true } }),
      prisma.studioSourceAnnotation.findMany({ where: { projectId: targetProject.id }, select: { id: true, sourceUnitId: true, exactText: true, sourceFingerprint: true } }),
      prisma.studioSourceAnnotationRevision.findMany({
        where: { annotation: { projectId: targetProject.id } },
        select: { annotationId: true, operation: true },
      }),
    ]);
    const sourceById = new Map(restoredSources.map((source) => [source.id, source]));
    const readbackVerified = restoredSources.length === validation.bundle.sources.length
      && restoredAnnotations.length === validation.bundle.annotations.length
      && restoredAnnotations.every((annotation) => {
        const source = sourceById.get(annotation.sourceUnitId);
        return Boolean(source?.immutableText
          && annotation.exactText
          && source.immutableText.includes(annotation.exactText)
          && researchSha256(source.immutableText) === annotation.sourceFingerprint);
      })
      && restoredRevisions.length === validation.bundle.annotations.length
      && restoredRevisions.every((revision) => revision.operation === "restored-from-export")
      && afterPlan.sourceCreates === 0
      && afterPlan.annotationCreates === 0
      && second.plan.overwrites === 0;
    if (!readbackVerified) throw new Error("Restored research readback did not meet the immutable/idempotent acceptance bar.");

    console.log(JSON.stringify({
      applied: true,
      localOnly: true,
      sourceProject: { id: sourceProject.id, slug: sourceProject.slug },
      targetProject: { id: targetProject.id, slug: targetProject.slug },
      manifestSha256: validation.bundle.manifestSha256,
      beforePlan,
      firstApply: first.plan,
      secondApply: second.plan,
      afterPlan,
      readback: {
        sourceCount: restoredSources.length,
        annotationCount: restoredAnnotations.length,
        revisionCount: restoredRevisions.length,
        writingUsesDeferred: validation.bundle.writingUses.length,
        sourceMutated: false,
        overwroteExisting: false,
        idempotent: afterPlan.sourceCreates === 0 && afterPlan.annotationCreates === 0,
        verified: readbackVerified,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
