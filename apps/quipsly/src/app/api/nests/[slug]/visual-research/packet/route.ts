import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

export const dynamic = "force-dynamic";

const REEF_BALL_PACKET_SCHEMA = "quipsly.reefball.nest-packet.v1";
const LATEST_SOURCE_UNIT_SLUG = "reef-ball-nest-packet-latest";
const REEFBALL_WORKBENCH_URL = process.env.REEFBALL_WORKBENCH_URL || process.env.NEXT_PUBLIC_REEFBALL_WORKBENCH_URL || "";
const REEFBALL_PUBLIC_MEDIA_BASE_URL = process.env.REEFBALL_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_REEFBALL_PUBLIC_MEDIA_BASE_URL || "";
const REEFBALL_IMAGE_PROXY_BASE = process.env.REEFBALL_IMAGE_PROXY_BASE || process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BASE || "";

function cleanWorkbenchUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function addImageProxyAuth(url: string, imageProxyToken?: string) {
  if (!imageProxyToken) return url;
  try {
    const parsed = new URL(url, "http://dummy");
    parsed.searchParams.set("token", imageProxyToken);
    return url.startsWith("http") ? parsed.toString() : parsed.pathname + parsed.search + parsed.hash;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(imageProxyToken)}`;
  }
}

function rewriteImageUrl(rawUrl: unknown, workbenchUrl: string, imageProxyToken?: string) {
  if (typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;

  const base = cleanWorkbenchUrl(workbenchUrl);
  if (!base) return trimmed;

  try {
    const parsed = new URL(trimmed);
  const host = parsed.hostname.toLowerCase();
  const mediaBase = cleanWorkbenchUrl(REEFBALL_PUBLIC_MEDIA_BASE_URL);
  const proxyBase = cleanWorkbenchUrl(REEFBALL_IMAGE_PROXY_BASE);

  if (proxyBase && (host === "127.0.0.1" || host === "localhost" || host === "[::1]")) {
    const localImage = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
    if (localImage) {
      const kind = localImage[1];
      const seq = localImage[2].padStart(4, "0");
      const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
      const maybeSize = size ? `&size=${encodeURIComponent(size)}` : "";
      return addImageProxyAuth(`${proxyBase}?kind=${encodeURIComponent(kind)}&seq=${encodeURIComponent(seq)}${maybeSize}`, imageProxyToken);
    }

    const localRelativeImage = parsed.pathname.match(/^\/previews-([0-9]+)\/([0-9]+)\.jpg$/);
    if (localRelativeImage) {
      const seq = localRelativeImage[2].padStart(4, "0");
      const size = localRelativeImage[1] || "1800";
      return addImageProxyAuth(`${proxyBase}?kind=preview&seq=${encodeURIComponent(seq)}&size=${encodeURIComponent(size)}`, imageProxyToken);
    }

    const localRelativeThumb = parsed.pathname.match(/^\/thumbs\/([0-9]+)\.jpg$/);
    if (localRelativeThumb) {
      const seq = localRelativeThumb[1].padStart(4, "0");
      return addImageProxyAuth(`${proxyBase}?kind=thumb&seq=${encodeURIComponent(seq)}`, imageProxyToken);
    }

    const localRelativeMedia = parsed.pathname.match(/^\/media\/([0-9]+)\.jpg$/);
    if (localRelativeMedia) {
      const seq = localRelativeMedia[1].padStart(4, "0");
      return addImageProxyAuth(`${proxyBase}?kind=media&seq=${encodeURIComponent(seq)}`, imageProxyToken);
    }
    return addImageProxyAuth(`${proxyBase}?source=${encodeURIComponent(trimmed)}`, imageProxyToken);
  }

  if ((host === "127.0.0.1" || host === "localhost" || host === "[::1]") && mediaBase) {
    const localPreview = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
    if (localPreview) {
      const kind = localPreview[1];
      const seq = localPreview[2].padStart(4, "0");
      const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
      const path = kind === "thumb" ? "thumbs" : kind === "media" ? "media" : `previews-${size}`;
      return `${mediaBase}/${path}/${seq}.jpg`;
    }

    const localRelativePreview = parsed.pathname.match(/^\/previews-([0-9]+)\/([0-9]+)\.jpg$/);
    if (localRelativePreview) {
      const seq = localRelativePreview[2].padStart(4, "0");
      const size = localRelativePreview[1] || "1800";
      return `${mediaBase}/previews-${size}/${seq}.jpg`;
    }

    const localRelativeThumb = parsed.pathname.match(/^\/thumbs\/([0-9]+)\.jpg$/);
    if (localRelativeThumb) {
      const seq = localRelativeThumb[1].padStart(4, "0");
      return `${mediaBase}/thumbs/${seq}.jpg`;
    }

    const localRelativeMedia = parsed.pathname.match(/^\/media\/([0-9]+)\.jpg$/);
    if (localRelativeMedia) {
      const seq = localRelativeMedia[1].padStart(4, "0");
      return `${mediaBase}/media/${seq}.jpg`;
    }
  }

  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") {
    return new URL(parsed.pathname + parsed.search + parsed.hash, base).toString();
  }
    return trimmed;
  } catch {
    if (trimmed.startsWith("/")) {
      try {
        return new URL(trimmed, base).toString();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
}

function rewriteImageFocusRecord(record: Record<string, unknown>, imageProxyToken?: string) {
  const host = cleanWorkbenchUrl(REEFBALL_WORKBENCH_URL);
  if (!host) return record;
  return {
    ...record,
    previewUrl: rewriteImageUrl(record.previewUrl, host, imageProxyToken),
    thumbUrl: rewriteImageUrl(record.thumbUrl, host, imageProxyToken),
    workbenchUrl: rewriteImageUrl(record.workbenchUrl, host, imageProxyToken),
  };
}

function rewriteImageFocusMetadata(metadata: Record<string, unknown>, imageProxyToken?: string) {
  const imageFocus = metadata.imageFocus;
  if (!imageFocus || typeof imageFocus !== "object") return metadata;
  const rawRecords: unknown[] = Array.isArray((imageFocus as Record<string, unknown>).records)
    ? ((imageFocus as Record<string, unknown>).records as unknown[])
    : [];
  const rewrittenRecords = rawRecords
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    )
    .map((record) => rewriteImageFocusRecord(record, imageProxyToken));
  return {
    ...metadata,
    imageFocus: {
      ...imageFocus,
      records: rewrittenRecords,
    },
  };
}

type ReefBallPacket = {
  schema?: string;
  generatedAt?: string;
  project?: {
    nestSlug?: string;
    name?: string;
    visualResearchUrl?: string;
  };
  privacy?: Record<string, unknown>;
  source?: {
    datasetRoot?: string;
    manifestPath?: string;
    annotationsPath?: string;
    workbookPath?: string;
  };
  summary?: Record<string, unknown>;
  reviewQueues?: Record<string, unknown[]>;
  imageFocus?: Record<string, unknown>;
  workbook?: Record<string, unknown>;
  trainingManifest?: Record<string, unknown>;
  records?: unknown[];
};

function packetResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function queueCount(packet: ReefBallPacket, key: string) {
  const queue = packet.reviewQueues?.[key];
  return Array.isArray(queue) ? queue.length : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function queueCountFromMetadata(metadata: Record<string, unknown>, key: string) {
  const reviewQueues = recordValue(metadata.reviewQueues);
  const queue = reviewQueues[key];
  return Array.isArray(queue) ? queue.length : 0;
}

function generatedStamp(packet: ReefBallPacket) {
  const date = packet.generatedAt ? new Date(packet.generatedAt) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
}

function capturedDate(packet: ReefBallPacket) {
  const date = packet.generatedAt ? new Date(packet.generatedAt) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function packetSummaryMarkdown(packet: ReefBallPacket) {
  const summary = packet.summary ?? {};
  const lines = [
    `# ${packet.project?.name || "Chula Vista Reef Ball Research"} Packet`,
    "",
    `Generated: ${packet.generatedAt || "unknown"}`,
    `Schema: ${packet.schema || "unknown"}`,
    "",
    "## Coverage",
    `- Media: ${numberValue(summary.mediaCount)} total, ${numberValue(summary.imageCount)} images, ${numberValue(summary.videoCount)} videos`,
    `- Images tied to workbook rows: ${numberValue(summary.imagesExplicitlyTied)}`,
    `- Workbook rows tied: ${numberValue(summary.workbookRowsExplicitlyTied)} of ${numberValue(summary.workbookRowCount)}`,
    `- Images with marks: ${numberValue(summary.imagesWithMarks)}`,
    `- Images with tile boundary: ${numberValue(summary.imagesWithTileBoundary)}`,
    "",
    "## Review Queues",
    `- Missing labels: ${queueCount(packet, "missingLabels")}`,
    `- Unmatched images: ${queueCount(packet, "unmatchedImages")}`,
    `- Multi-row matches: ${queueCount(packet, "multiRowMatches")}`,
    `- Scientist row review: ${queueCount(packet, "scientistRowReview")}`,
    `- Needs tile boundary: ${queueCount(packet, "needsTileBoundary")}`,
    `- Duplicate stacks: ${queueCount(packet, "duplicateStacks")}`,
    "",
    "## Local Source",
    `- Dataset root: ${packet.source?.datasetRoot || "unknown"}`,
    `- Workbook: ${packet.source?.workbookPath || "unknown"}`,
    `- Annotations: ${packet.source?.annotationsPath || "unknown"}`,
  ];
      return lines.join("\n");
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

async function resolveActor(request: NextRequest) {
  const session = await auth();
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
      || session?.user?.email,
  );
  return {
    email,
    name: session?.user?.name || email,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const actor = await resolveActor(request);
  if (!actor.email) {
    return packetResponse({ ok: false, error: "Sign in required." }, 401);
  }

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actor.email,
    action: "read",
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return packetResponse({ ok: false, error: "Read access required." }, 403);
  }

  const project = await prisma.studioProject.findUnique({
    where: { id: access.projectId },
    select: { id: true, slug: true, name: true },
  });

  if (!project) {
    return packetResponse({ ok: false, error: "Nest not found." }, 404);
  }

  const latestUnit = await prisma.studioSourceUnit.findUnique({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: LATEST_SOURCE_UNIT_SLUG,
      },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      sourceUrl: true,
      sourcePath: true,
      author: true,
      capturedAt: true,
      updatedAt: true,
      metadataJson: true,
    },
  });

  if (!latestUnit) {
    return packetResponse({
      ok: true,
      project,
      access: { role: access.role ?? null },
      latest: null,
    });
  }

  const metadata = recordValue(latestUnit.metadataJson);
  const summary = recordValue(metadata.summary);
  const imageProxyToken = new URL(request.url).searchParams.get("token") || "";

  return packetResponse({
    ok: true,
    project,
      access: { role: access.role ?? null },
      latest: {
        id: latestUnit.id,
      slug: latestUnit.slug,
      title: latestUnit.title,
      sourceUrl: latestUnit.sourceUrl,
      sourcePath: latestUnit.sourcePath,
      author: latestUnit.author,
      capturedAt: latestUnit.capturedAt?.toISOString() ?? null,
      updatedAt: latestUnit.updatedAt.toISOString(),
      schema: metadata.schema ?? null,
      generatedAt: metadata.generatedAt ?? null,
      importedAt: metadata.importedAt ?? null,
      importedByEmail: metadata.importedByEmail ?? null,
      project: metadata.project ?? {},
      privacy: metadata.privacy ?? {},
      source: metadata.source ?? {},
      summary,
      imageFocus: rewriteImageFocusMetadata(recordValue(metadata.imageFocus ?? {}), imageProxyToken) as Record<string, unknown>,
      workbook: metadata.workbook ?? {},
      trainingManifest: metadata.trainingManifest ?? {},
      recordsIncluded: Boolean(metadata.recordsIncluded),
      recordCount: numberValue(metadata.recordCount),
      reviewQueueCounts: {
        missingLabels: queueCountFromMetadata(metadata, "missingLabels"),
        unmatchedImages: queueCountFromMetadata(metadata, "unmatchedImages"),
        multiRowMatches: queueCountFromMetadata(metadata, "multiRowMatches"),
        scientistRowReview: queueCountFromMetadata(metadata, "scientistRowReview"),
        needsTileBoundary: queueCountFromMetadata(metadata, "needsTileBoundary"),
        duplicateStacks: queueCountFromMetadata(metadata, "duplicateStacks"),
      },
    },
  });
}

function packetMetadata(packet: ReefBallPacket, importedByEmail: string): Record<string, unknown> {
  return {
    schema: packet.schema,
    generatedAt: packet.generatedAt ?? null,
    importedAt: new Date().toISOString(),
    importedByEmail,
    project: packet.project ?? {},
    privacy: packet.privacy ?? {},
    source: packet.source ?? {},
    summary: packet.summary ?? {},
    reviewQueues: packet.reviewQueues ?? {},
    imageFocus: packet.imageFocus ?? {},
    workbook: packet.workbook ?? {},
    trainingManifest: packet.trainingManifest ?? {},
    recordsIncluded: Array.isArray(packet.records) && packet.records.length > 0,
    recordCount: Array.isArray(packet.records) ? packet.records.length : 0,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const actor = await resolveActor(request);
  if (!actor.email) {
    return packetResponse({ ok: false, error: "Sign in required." }, 401);
  }

  let packet: ReefBallPacket;
  try {
    packet = await request.json();
  } catch {
    return packetResponse({ ok: false, error: "Invalid JSON packet." }, 400);
  }

  if (packet.schema !== REEF_BALL_PACKET_SCHEMA) {
    return packetResponse({
      ok: false,
      error: "Unsupported reef-ball packet schema.",
      expected: REEF_BALL_PACKET_SCHEMA,
      received: packet.schema ?? null,
    }, 400);
  }

  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actor.email,
    action: "write",
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return packetResponse({ ok: false, error: "Write access required." }, 403);
  }

  const project = await prisma.studioProject.findUnique({
    where: { id: access.projectId },
    include: {
      documents: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!project) {
    return packetResponse({ ok: false, error: "Nest not found." }, 404);
  }

  const imageProxyToken = new URL(request.url).searchParams.get("token") || "";
  const metadata = rewriteImageFocusMetadata(packetMetadata(packet, actor.email), imageProxyToken);
  const immutableText = packetSummaryMarkdown(packet);
  const stamp = generatedStamp(packet);
  const historySlug = `reef-ball-nest-packet-${stamp}`;
  const latestMetadata = {
    ...metadata,
    latestHistorySlug: historySlug,
  };
  const title = `Reef Ball Nest Packet ${stamp.toUpperCase()}`;
  const documentId = project.documents[0]?.id ?? null;
  const capturedAt = capturedDate(packet);

  const [historyUnit, latestUnit] = await prisma.$transaction([
    prisma.studioSourceUnit.upsert({
      where: {
        projectId_slug: {
          projectId: project.id,
          slug: historySlug,
        },
      },
      create: {
        projectId: project.id,
        documentId,
        slug: historySlug,
        kind: "reef-ball-nest-packet",
        title,
        sourceUrl: packet.project?.visualResearchUrl ?? null,
        sourcePath: packet.source?.datasetRoot ?? null,
        author: actor.name || actor.email,
        capturedAt,
        immutableText,
        editableNotes: "Imported from local Reef Ball Image Workbench.",
        metadataJson: toPrismaJson(metadata),
        createdByEmail: actor.email,
      },
      update: {
        documentId,
        title,
        sourceUrl: packet.project?.visualResearchUrl ?? null,
        sourcePath: packet.source?.datasetRoot ?? null,
        author: actor.name || actor.email,
        capturedAt,
        immutableText,
        metadataJson: toPrismaJson(metadata),
      },
    }),
    prisma.studioSourceUnit.upsert({
      where: {
        projectId_slug: {
          projectId: project.id,
          slug: LATEST_SOURCE_UNIT_SLUG,
        },
      },
      create: {
        projectId: project.id,
        documentId,
        slug: LATEST_SOURCE_UNIT_SLUG,
        kind: "reef-ball-nest-packet-latest",
        title: "Latest Reef Ball Nest Packet",
        sourceUrl: packet.project?.visualResearchUrl ?? null,
        sourcePath: packet.source?.datasetRoot ?? null,
        author: actor.name || actor.email,
        capturedAt,
        immutableText,
        editableNotes: `Latest imported packet: ${historySlug}`,
        metadataJson: toPrismaJson(latestMetadata),
        createdByEmail: actor.email,
      },
      update: {
        documentId,
        sourceUrl: packet.project?.visualResearchUrl ?? null,
        sourcePath: packet.source?.datasetRoot ?? null,
        author: actor.name || actor.email,
        capturedAt,
        immutableText,
        editableNotes: `Latest imported packet: ${historySlug}`,
        metadataJson: toPrismaJson(latestMetadata),
      },
    }),
  ]);

  return packetResponse({
    ok: true,
    importedAt: new Date().toISOString(),
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
    },
    sourceUnits: {
      latest: {
        id: latestUnit.id,
        slug: latestUnit.slug,
        title: latestUnit.title,
        capturedAt: latestUnit.capturedAt?.toISOString() ?? null,
      },
      history: {
        id: historyUnit.id,
        slug: historyUnit.slug,
        title: historyUnit.title,
        capturedAt: historyUnit.capturedAt?.toISOString() ?? null,
      },
    },
    summary: packet.summary ?? {},
    reviewQueueCounts: {
      missingLabels: queueCount(packet, "missingLabels"),
      unmatchedImages: queueCount(packet, "unmatchedImages"),
      multiRowMatches: queueCount(packet, "multiRowMatches"),
      scientistRowReview: queueCount(packet, "scientistRowReview"),
      needsTileBoundary: queueCount(packet, "needsTileBoundary"),
      duplicateStacks: queueCount(packet, "duplicateStacks"),
    },
  });
}
