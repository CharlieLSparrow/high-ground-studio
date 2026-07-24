import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { RESEARCH_EXPORT_SCHEMA_VERSION, researchSha256, stableResearchJson } from "@/lib/research-portability";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { researchWritingUseVisibilitySql } from "@/lib/server/research-writing-privacy";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Sign in before exporting private research." }, { status: 401 });
  }
  const url = new URL(request.url);
  const projectSlug = (url.searchParams.get("project") || "").trim().slice(0, 160);
  if (!projectSlug) return NextResponse.json({ ok: false, error: "Choose one Nest to export." }, { status: 400 });
  const actorEmail = (session.user.primaryEmail || session.user.email || "").trim().toLowerCase();
  if (!actorEmail) return NextResponse.json({ ok: false, error: "The signed-in account has no verified email identity." }, { status: 401 });

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({ projectSlug, email: actorEmail, action: "read", prisma });
  if (!access.allowed || !access.projectId) {
    return NextResponse.json({ ok: false, error: "That Nest is unavailable to the signed-in account." }, { status: 404 });
  }

  try {
    const project = await prisma.studioProject.findUnique({
      where: { id: access.projectId },
      select: { id: true, slug: true, name: true, updatedAt: true },
    });
    if (!project) return NextResponse.json({ ok: false, error: "That Nest no longer exists." }, { status: 404 });

    const [sources, tags, annotations, uses] = await Promise.all([
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
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
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
          AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${session.user.id})
        ORDER BY annotation."createdAt" ASC, annotation."id" ASC
      `),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT annotation_use."id", annotation_use."annotationId", annotation_use."documentId", annotation_use."blockId",
               annotation_use."useKind", annotation_use."citationKey", annotation_use."quoteSnapshot",
               annotation_use."citationLabel", annotation_use."sourceJson", annotation_use."archivedAt", annotation_use."createdAt",
               jsonb_build_object(
                 'useId', annotation_use."id",
                 'document', jsonb_build_object(
                   'id', document."id", 'stableId', document."stableId", 'title', document."title",
                   'sourceLabel', document."sourceLabel", 'sourcePath', document."sourcePath",
                   'projectionStatus', document."projectionStatus", 'isPrivate', document."isPrivate",
                   'updatedAt', document."updatedAt"
                 ),
                 'block', jsonb_build_object(
                   'id', block."id", 'stableId', block."stableId", 'order', block."order", 'title', block."title",
                   'body', block."body", 'sourceLabel', block."sourceLabel", 'sourcePath', block."sourcePath",
                   'externalId', block."externalId", 'projectionStatus', block."projectionStatus",
                   'isPrivate', block."isPrivate", 'archivedAt', block."archivedAt", 'updatedAt', block."updatedAt"
                 )
               ) AS "writingTarget"
        FROM "StudioSourceAnnotationUse" annotation_use
        JOIN "StudioSourceAnnotation" annotation ON annotation."id" = annotation_use."annotationId"
        JOIN "StudioDocument" document ON document."id" = annotation_use."documentId"
        JOIN "StudioDocumentBlock" block ON block."id" = annotation_use."blockId"
        WHERE annotation_use."projectId" = ${project.id}
          AND (annotation."visibility" = 'project' OR annotation."createdByUserId" = ${session.user.id})
          AND ${researchWritingUseVisibilitySql(session.user.id)}
        ORDER BY annotation_use."createdAt" ASC, annotation_use."id" ASC
      `),
    ]);

    const exportedAt = new Date().toISOString();
    const portableAnnotations = JSON.parse(JSON.stringify(annotations)) as Array<Record<string, unknown>>;
    const portableUseRows = JSON.parse(JSON.stringify(uses)) as Array<Record<string, unknown>>;
    const portableUses = portableUseRows.map(({ writingTarget: _writingTarget, ...use }) => use);
    const writingTargets = portableUseRows.flatMap((use) => (
      use.writingTarget && typeof use.writingTarget === "object" && !Array.isArray(use.writingTarget)
        ? [use.writingTarget as Record<string, unknown>]
        : []
    ));
    const payload = {
      schemaVersion: RESEARCH_EXPORT_SCHEMA_VERSION,
      exportedAt,
      project: { id: project.id, slug: project.slug, name: project.name, updatedAt: project.updatedAt.toISOString() },
      sources: sources.map((source) => ({
        ...source,
        capturedAt: source.capturedAt?.toISOString() ?? null,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString(),
        immutableTextSha256: source.immutableText == null ? null : researchSha256(source.immutableText),
      })),
      tags: tags.map((tag) => ({ ...tag, createdAt: tag.createdAt.toISOString(), updatedAt: tag.updatedAt.toISOString() })),
      annotations: portableAnnotations,
      writingUses: portableUses,
      writingTargets,
      boundaries: {
        actorScoped: true,
        privateAnnotationsLimitedToExporter: true,
        privateWritingTargetsLimitedToCreator: true,
        writingTargetSnapshotsIncluded: true,
        immutableSourceTextIncluded: true,
        externalResourcesFetched: false,
        sourceMutated: false,
        providerMutated: false,
      },
    };
    const manifestSha256 = researchSha256(stableResearchJson(payload));
    const output = {
      ...payload,
      integrity: {
        algorithm: "sha256",
        manifestSha256,
        sourceCount: payload.sources.length,
        annotationCount: portableAnnotations.length,
        writingUseCount: portableUses.length,
        writingTargetCount: writingTargets.length,
      },
    };
    const filename = `quipsly-${project.slug}-research-${exportedAt.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(output, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[research-export] failed", error);
    return NextResponse.json({ ok: false, error: "Quipsly could not verify and export this private research bundle." }, { status: 503 });
  }
}
