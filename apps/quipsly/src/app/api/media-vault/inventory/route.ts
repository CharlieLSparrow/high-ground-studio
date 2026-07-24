import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaVaultReadiness } from "@/lib/server/media-vault";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicBigInt(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function publicVariant(variant: any) {
  return {
    id: variant.id,
    kind: variant.kind,
    url: variant.url,
    mimeType: variant.mimeType,
    width: variant.width,
    height: variant.height,
    duration: variant.duration,
    sizeBytes: publicBigInt(variant.sizeBytes),
    metadataJson: jsonObject(variant.metadataJson),
    updatedAt: variant.updatedAt?.toISOString?.() ?? null,
  };
}

function publicJob(job: any) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    source: job.source,
    error: job.error,
    inputJson: jsonObject(job.inputJson),
    resultJson: jsonObject(job.resultJson),
    createdAt: job.createdAt?.toISOString?.() ?? null,
    updatedAt: job.updatedAt?.toISOString?.() ?? null,
    completedAt: job.completedAt?.toISOString?.() ?? null,
  };
}

function publicAttachment(attachment: any) {
  return {
    id: attachment.id,
    projectId: attachment.projectId,
    nestSlug: attachment.project?.slug ?? null,
    nestTitle: attachment.project?.title ?? null,
    role: attachment.role,
    source: attachment.source,
    metadataJson: jsonObject(attachment.metadataJson),
    updatedAt: attachment.updatedAt?.toISOString?.() ?? null,
  };
}

function publicAsset(asset: any, proxies: any[] = []): any {
  const variants = Array.isArray(asset.variants) ? asset.variants.map(publicVariant) : [];
  const jobs = Array.isArray(asset.workflowJobs) ? asset.workflowJobs.map(publicJob) : [];
  const attachments = Array.isArray(asset.assetAttachments) ? asset.assetAttachments.map(publicAttachment) : [];
  const proxyAssets: any[] = proxies.map((proxy: any) => publicAsset(proxy, []));

  return {
    id: asset.id,
    filename: asset.filename,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: publicBigInt(asset.sizeBytes),
    isProxy: asset.isProxy,
    rawAssetId: asset.rawAssetId,
    cloudProvider: asset.cloudProvider,
    duration: asset.duration,
    resolution: asset.resolution,
    fps: asset.fps,
    thumbnailUrl: asset.thumbnailUrl,
    createdAt: asset.createdAt?.toISOString?.() ?? null,
    updatedAt: asset.updatedAt?.toISOString?.() ?? null,
    attachments,
    variants,
    jobs,
    proxyAssets,
    readiness: {
      hasProxy: proxyAssets.length > 0 || variants.some((variant: any) => String(variant.kind || "").includes("proxy")),
      hasThumbnail: Boolean(asset.thumbnailUrl) || variants.some((variant: any) => String(variant.kind || "").includes("thumb")),
      hasWorkflowJobs: jobs.length > 0,
      sourceSafe: asset.isProxy !== true,
    },
  };
}

async function loadAssetInventory(prisma: any, rawAssetId: string) {
  const rawAsset = await prisma.studioMediaAsset.findUnique({
    where: { id: rawAssetId },
    include: {
      variants: { orderBy: { updatedAt: "desc" } },
      workflowJobs: { orderBy: { createdAt: "desc" }, take: 12 },
      assetAttachments: {
        include: { project: { select: { id: true, slug: true, title: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!rawAsset) return null;

  const proxies = await prisma.studioMediaAsset.findMany({
    where: { rawAssetId: rawAsset.id, isProxy: true },
    include: {
      variants: { orderBy: { updatedAt: "desc" } },
      workflowJobs: { orderBy: { createdAt: "desc" }, take: 8 },
      assetAttachments: {
        include: { project: { select: { id: true, slug: true, title: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });

  return publicAsset(rawAsset, proxies);
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before inspecting the media vault inventory." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const rawAssetId = text(url.searchParams.get("rawAssetId") || url.searchParams.get("assetId"));
  const nestSlug = text(url.searchParams.get("nestSlug") || url.searchParams.get("projectSlug"));
  const prisma = getPrismaClient() as any;

  if (!rawAssetId && !nestSlug) {
    return NextResponse.json(
      { ok: false, error: "Provide rawAssetId or nestSlug to inspect media inventory." },
      { status: 400 },
    );
  }

  let project: any = null;
  if (nestSlug) {
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug: nestSlug,
      action: "read",
      prisma,
    });
    if (!access.allowed) {
      return NextResponse.json({
        ok: false,
        code: access.code,
        error: access.error,
        actorSource: access.actor.source,
      }, { status: access.status });
    }

    project = await prisma.studioProject.findUnique({
      where: { slug: nestSlug },
      select: { id: true, slug: true, title: true },
    });
  }

  if (rawAssetId) {
    const asset = await loadAssetInventory(prisma, rawAssetId);
    if (!asset) {
      return NextResponse.json({ ok: false, error: "Media asset was not found." }, { status: 404 });
    }

    if (!session.user.isStaff && project && !asset.attachments.some((attachment: any) => attachment.projectId === project.id)) {
      return NextResponse.json(
        { ok: false, error: "This asset is not attached to the requested Nest." },
        { status: 403 },
      );
    }

    if (!session.user.isStaff && !project) {
      return NextResponse.json(
        { ok: false, error: "Choose a Nest when inspecting a specific media asset." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      mediaVault: getMediaVaultReadiness(),
      project,
      asset,
      actions: {
        registerProxy: "/api/media-vault/proxies/register",
        uploadProxy: "/api/upload/presigned",
        playbackBoundary: "Use asset.url for preview; use proxyAssets or proxy variants when present.",
      },
      boundaries: {
        sideEffectFree: true,
        noOriginalMutation: true,
        inventoryOnly: true,
      },
    });
  }

  const attachments = await prisma.studioAssetAttachment.findMany({
    where: { projectId: project.id },
    include: {
      project: { select: { id: true, slug: true, title: true } },
      asset: {
        include: {
          variants: { orderBy: { updatedAt: "desc" } },
          workflowJobs: { orderBy: { createdAt: "desc" }, take: 8 },
          assetAttachments: {
            include: { project: { select: { id: true, slug: true, title: true } } },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
  const rawAssets = attachments
    .map((attachment: any) => attachment.asset)
    .filter((asset: any) => asset && asset.isProxy !== true);
  const proxies = await prisma.studioMediaAsset.findMany({
    where: {
      isProxy: true,
      rawAssetId: { in: rawAssets.map((asset: any) => asset.id) },
    },
    include: {
      variants: { orderBy: { updatedAt: "desc" } },
      workflowJobs: { orderBy: { createdAt: "desc" }, take: 8 },
      assetAttachments: {
        include: { project: { select: { id: true, slug: true, title: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 160,
  });
  const proxiesByRawId = new Map<string, any[]>();
  for (const proxy of proxies) {
    const key = text(proxy.rawAssetId);
    if (!key) continue;
    proxiesByRawId.set(key, [...(proxiesByRawId.get(key) || []), proxy]);
  }

  const assets = rawAssets.map((asset: any) => publicAsset(asset, proxiesByRawId.get(asset.id) || []));
  return NextResponse.json({
    ok: true,
    mediaVault: getMediaVaultReadiness(),
    project,
    summary: {
      rawAssetCount: assets.length,
      proxyAssetCount: proxies.length,
      proxyReadyCount: assets.filter((asset: any) => asset.readiness.hasProxy).length,
      needsProxyCount: assets.filter((asset: any) => !asset.readiness.hasProxy && String(asset.mimeType || "").startsWith("video/")).length,
    },
    assets,
    actions: {
      registerProxy: "/api/media-vault/proxies/register",
      uploadProxy: "/api/upload/presigned",
    },
    boundaries: {
      sideEffectFree: true,
      noOriginalMutation: true,
      inventoryOnly: true,
    },
  });
}
