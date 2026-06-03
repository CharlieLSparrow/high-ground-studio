// @ts-nocheck
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { DEFAULT_PROJECT_SLUG, projectConfig } from "../../../(app)/create/projectConfig";

const JOB_TYPES = new Set(["transcript", "file-triage", "sync-suggestion", "proxy-needed"]);
const JOB_STATUSES = new Set(["queued", "running", "completed", "failed", "canceled"]);

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sanitizeSegment(value: string) {
  return (value || "untitled")
    .replaceAll("..", "")
    .replaceAll("/", "_")
    .replaceAll("\\", "_")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "untitled";
}

function mediaAnalysisJobs(value: Record<string, unknown>) {
  return Array.isArray(value.mediaAnalysisJobs) ? value.mediaAnalysisJobs : [];
}

async function ensureProjectAndProduction(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string, episodeSlug: string) {
  const config = projectConfig(projectSlug);
  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: "tonight-pack" },
    update: {},
    create: { slug: "tonight-pack", name: "Tonight Pack Workspace" },
  });

  const project = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  }) ?? await prisma.studioProject.create({
    data: { workspaceId: workspace.id, slug: config.slug, name: config.name },
  });

  const document = await prisma.studioDocument.findUnique({
    where: { stableId: config.documentStableId },
  }) ?? await prisma.studioDocument.create({
    data: { projectId: project.id, stableId: config.documentStableId, title: config.documentTitle },
  });

  const title = episodeSlug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const production = await prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    update: {
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
    },
    create: {
      projectId: project.id,
      documentId: document.id,
      slug: episodeSlug,
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
      productionJson: {
        source: "quipsly-api-media-analysis-jobs.create",
        projectSlug: project.slug,
        episodeSlug,
        importedMedia: [],
        mediaAnalysisJobs: [],
      },
    },
  });

  return { production };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const projectSlug = sanitizeSegment(String(body.projectSlug ?? DEFAULT_PROJECT_SLUG));
    const episodeSlug = sanitizeSegment(String(body.episodeSlug ?? "current-episode"));
    const assetId = String(body.assetId ?? "").trim();
    const type = String(body.type ?? "").trim();
    const status = String(body.status ?? "queued").trim();

    if (!assetId) return NextResponse.json({ ok: false, error: "assetId is required." }, { status: 400 });
    if (!JOB_TYPES.has(type)) return NextResponse.json({ ok: false, error: "Unsupported media analysis job type." }, { status: 400 });
    if (!JOB_STATUSES.has(status)) return NextResponse.json({ ok: false, error: "Unsupported media analysis job status." }, { status: 400 });

    const now = new Date().toISOString();
    const prisma = getPrismaClient();
    const { production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
    const currentJson = asRecord(production.productionJson);
    const existingJobs = mediaAnalysisJobs(currentJson);
    const job = {
      id: String(body.id ?? randomUUID()),
      assetId,
      type,
      status,
      startedAt: String(body.startedAt ?? now),
      completedAt: status === "completed" || status === "failed" || status === "canceled" ? String(body.completedAt ?? now) : null,
      error: body.error ? String(body.error) : null,
      result: asRecord(body.result),
    };
    const productionJson = {
      ...currentJson,
      projectSlug,
      episodeSlug,
      mediaAnalysisJobs: [job, ...existingJobs].slice(0, 60),
      lastMediaAnalysisJobAt: now,
    };

    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: production.id },
      data: { productionJson },
    });

    return NextResponse.json({
      ok: true,
      job,
      productionJson,
      updatedAt: updated.updatedAt?.toISOString?.() ?? now,
    });
  } catch (error) {
    console.error("[episode-production media-analysis-jobs] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to save media analysis job." }, { status: 500 });
  }
}
