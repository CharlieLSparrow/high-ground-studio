import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { researchWritingUseVisibilitySql } from "@/lib/server/research-writing-privacy";
import { normalizeAccessEmail } from "@/lib/server/studio-project-access";

import { ResearchLibraryClient } from "./research-library-client";
import type {
  ResearchEvidenceRecord,
  ResearchLibrarySnapshot,
  ResearchPacketRecord,
  ResearchSourceRecord,
} from "./research-library-model";

export const dynamic = "force-dynamic";

function hasLineage(value: unknown) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && Object.keys(value as Record<string, unknown>).length > 0,
  );
}

function safeDatabaseMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The workspace database connection is unavailable.";
  }

  return "Quipsly could not read the research workspace.";
}

async function loadResearchLibrary(): Promise<ResearchLibrarySnapshot> {
  const session = await getQuipslySession();
  const signedInEmail = normalizeAccessEmail(
    session?.user?.primaryEmail || session?.user?.email,
  );
  const actorEmail = signedInEmail;

  if (!actorEmail) {
    return {
      state: "signed-out",
      message: "Sign in to read private sources and saved research packets.",
    };
  }

  const prisma = getPrismaClient();

  try {
    const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
    const projectIds = projects.map((project) => project.id);
    const projectWriteAccess = new Map(projects.map((project) => [
      project.id,
      Boolean(signedInEmail) && (project.role === "OWNER" || project.role === "EDITOR"),
    ]));

    if (projectIds.length === 0) {
      return {
        state: "ready",
        authState: "signed-in",
        accessibleNestCount: 0,
        projects: [],
        sources: [],
        packets: [],
        evidence: [],
      };
    }

    const [sourceRows, packetRows, evidenceRows] = await Promise.all([
      prisma.studioSourceUnit.findMany({
        where: {
          projectId: { in: projectIds },
          immutableText: { not: null },
        },
        select: {
          id: true,
          projectId: true,
          title: true,
          kind: true,
          author: true,
          sourceUrl: true,
          sourcePath: true,
          immutableText: true,
          updatedAt: true,
          personalSourceFiling: {
            select: {
              captureType: true,
              snippetId: true,
              bookmarkId: true,
              createdByUserId: true,
              createdAt: true,
            },
          },
          project: {
            select: {
              name: true,
              slug: true,
              tags: {
                where: { isActive: true },
                orderBy: { label: "asc" },
                select: { id: true, label: true, slug: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      prisma.studioOutputPacket.findMany({
        where: {
          projectId: { in: projectIds },
          kind: { contains: "research", mode: "insensitive" },
        },
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          lineageJson: true,
          approvedAt: true,
          updatedAt: true,
          project: {
            select: { name: true, slug: true },
          },
          document: {
            select: { title: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.studioKnowledgeNode.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          id: true,
          title: true,
          body: true,
          sourceText: true,
          sourceLabel: true,
          sourcePath: true,
          tagLabel: true,
          nodeType: true,
          reviewStatus: true,
          projectionStatus: true,
          updatedAt: true,
          project: {
            select: { name: true, slug: true },
          },
          document: {
            select: { title: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);

    const annotationRows = sourceRows.length > 0
      ? await prisma.$queryRaw<Array<{
          id: string;
          sourceUnitId: string;
          kind: string;
          status: string;
          visibility: string;
          body: string;
          exactText: string | null;
          startOffset: number | null;
          endOffset: number | null;
          createdByUserId: string | null;
          updatedAt: Date;
          tagLabels: string[];
        }>>(Prisma.sql`
          SELECT annotation."id", annotation."sourceUnitId", annotation."kind", annotation."status",
                 annotation."visibility", annotation."body", annotation."exactText", annotation."startOffset",
                 annotation."endOffset", annotation."createdByUserId", annotation."updatedAt",
                 COALESCE(array_agg(tag."label" ORDER BY tag."label") FILTER (WHERE tag."id" IS NOT NULL), ARRAY[]::text[]) AS "tagLabels"
          FROM "StudioSourceAnnotation" annotation
          LEFT JOIN "StudioSourceAnnotationTag" annotation_tag ON annotation_tag."annotationId" = annotation."id"
          LEFT JOIN "StudioTag" tag ON tag."id" = annotation_tag."tagId"
          WHERE annotation."sourceUnitId" IN (${Prisma.join(sourceRows.map((source) => source.id))})
            AND annotation."status" IN ('active', 'resolved')
            AND (annotation."visibility" = 'project' ${session?.user?.id ? Prisma.sql`OR annotation."createdByUserId" = ${session.user.id}` : Prisma.empty})
          GROUP BY annotation."id"
          ORDER BY annotation."updatedAt" DESC
        `)
      : [];
    const writingUseRows = annotationRows.length > 0
      ? await prisma.$queryRaw<Array<{
          id: string;
          annotationId: string;
          documentId: string;
          documentTitle: string;
          projectSlug: string;
        }>>(Prisma.sql`
          SELECT annotation_use."id", annotation_use."annotationId", document."id" AS "documentId",
                 document."title" AS "documentTitle", project."slug" AS "projectSlug"
          FROM "StudioSourceAnnotationUse" annotation_use
          JOIN "StudioDocument" document ON document."id" = annotation_use."documentId"
          JOIN "StudioProject" project ON project."id" = annotation_use."projectId"
          WHERE annotation_use."annotationId" IN (${Prisma.join(annotationRows.map((annotation) => annotation.id))})
            AND annotation_use."archivedAt" IS NULL
            AND ${researchWritingUseVisibilitySql(session?.user?.id)}
          ORDER BY annotation_use."createdAt" DESC
        `)
      : [];
    const writingUsesByAnnotation = new Map<string, typeof writingUseRows>();
    for (const writingUse of writingUseRows) {
      const rows = writingUsesByAnnotation.get(writingUse.annotationId) ?? [];
      rows.push(writingUse);
      writingUsesByAnnotation.set(writingUse.annotationId, rows);
    }
    const annotationsBySource = new Map<string, typeof annotationRows>();
    for (const annotation of annotationRows) {
      const rows = annotationsBySource.get(annotation.sourceUnitId) ?? [];
      rows.push(annotation);
      annotationsBySource.set(annotation.sourceUnitId, rows);
    }

    const sources: ResearchSourceRecord[] = sourceRows.flatMap((source) => {
      if (!source.immutableText) return [];
      const previewLimit = 18_000;
      return [{
        id: source.id,
        title: source.title,
        kind: source.kind,
        author: source.author,
        sourceUrl: source.sourceUrl,
        sourcePath: source.sourcePath,
        immutableText: source.immutableText.slice(0, previewLimit),
        contentTruncated: source.immutableText.length > previewLimit,
        projectName: source.project.name,
        projectSlug: source.project.slug,
        canWrite: projectWriteAccess.get(source.projectId) ?? false,
        tagCatalog: source.project.tags,
        annotations: (annotationsBySource.get(source.id) ?? []).flatMap((annotation) => {
          if (annotation.startOffset == null || annotation.endOffset == null || !annotation.exactText) return [];
          return [{
            id: annotation.id,
            kind: annotation.kind,
            status: annotation.status,
            visibility: annotation.visibility,
            body: annotation.body,
            exactText: annotation.exactText,
            startOffset: annotation.startOffset,
            endOffset: annotation.endOffset,
            tagLabels: annotation.tagLabels,
            createdByMe: annotation.createdByUserId === session?.user?.id,
            updatedAt: annotation.updatedAt.toISOString(),
            writingUses: (writingUsesByAnnotation.get(annotation.id) ?? []).map((writingUse) => ({
              id: writingUse.id,
              documentId: writingUse.documentId,
              documentTitle: writingUse.documentTitle,
              projectSlug: writingUse.projectSlug,
            })),
          }];
        }),
        personalCaptureOrigin: source.personalSourceFiling && (source.personalSourceFiling.captureType === "SNIPPET" || source.personalSourceFiling.captureType === "BOOKMARK")
          ? {
              captureType: source.personalSourceFiling.captureType,
              captureId: source.personalSourceFiling.captureType === "SNIPPET" ? source.personalSourceFiling.snippetId : source.personalSourceFiling.bookmarkId,
              filedAt: source.personalSourceFiling.createdAt.toISOString(),
              ownedByMe: source.personalSourceFiling.createdByUserId === session?.user?.id,
            }
          : null,
        updatedAt: source.updatedAt.toISOString(),
      }];
    });

    const packets: ResearchPacketRecord[] = packetRows.map((packet) => ({
      id: packet.id,
      title: packet.title,
      kind: packet.kind,
      status: packet.status,
      projectName: packet.project.name,
      projectSlug: packet.project.slug,
      documentTitle: packet.document?.title ?? null,
      hasLineage: hasLineage(packet.lineageJson),
      approvedAt: packet.approvedAt?.toISOString() ?? null,
      updatedAt: packet.updatedAt.toISOString(),
    }));

    const evidence: ResearchEvidenceRecord[] = evidenceRows.map((node) => ({
      id: node.id,
      title: node.title,
      excerpt: node.body.trim() || node.sourceText.trim(),
      sourceLabel: node.sourceLabel,
      sourcePath: node.sourcePath,
      tagLabel: node.tagLabel,
      nodeType: node.nodeType,
      reviewStatus: node.reviewStatus,
      projectionStatus: node.projectionStatus,
      projectName: node.project.name,
      projectSlug: node.project.slug,
      documentTitle: node.document.title,
      updatedAt: node.updatedAt.toISOString(),
    }));

    return {
      state: "ready",
      authState: "signed-in",
      accessibleNestCount: projects.length,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        canWrite: Boolean(signedInEmail) && (project.role === "OWNER" || project.role === "EDITOR"),
      })),
      sources,
      packets,
      evidence,
    };
  } catch (error) {
    console.error("[research] Failed to load research library", error);
    return {
      state: "unavailable",
      authState: "signed-in",
      message: safeDatabaseMessage(error),
    };
  }
}

export default async function ResearchPage({ searchParams }: { searchParams?: Promise<{ query?: string | string[]; source?: string | string[] }> } = {}) {
  const snapshot = await loadResearchLibrary();
  const params = await (searchParams ?? Promise.resolve<{ query?: string | string[]; source?: string | string[] }>({}));
  const initialQuery = typeof params.query === "string" ? params.query.trim().slice(0, 200) : "";
  const requestedSourceId = typeof params.source === "string" ? params.source.trim().slice(0, 200) : "";
  const initialSourceId = snapshot.state === "ready" && snapshot.sources.some((source) => source.id === requestedSourceId)
    ? requestedSourceId
    : null;
  return <ResearchLibraryClient snapshot={snapshot} initialQuery={initialQuery} initialSourceId={initialSourceId} />;
}
