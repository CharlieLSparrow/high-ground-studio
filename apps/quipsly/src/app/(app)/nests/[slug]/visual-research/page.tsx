import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  Database,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Layers3,
  Microscope,
  Play,
  ShieldCheck,
  Tags,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cookies, headers } from "next/headers";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { MAC_WEB_SESSION_COOKIE_NAME, verifyMacWebSessionToken } from "@/lib/server/mac-session-token";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
} from "@/lib/server/studio-project-access";
import { nestKindFromSourceLabel } from "@/lib/studio/project-registry";
import { createImageProxyToken } from "@/lib/reefball/image-proxy-token";
import { ImageFocusStage, type ImageFocusItem } from "./ImageFocusStage";
import { LocalNestPacketImport } from "./LocalNestPacketImport";

export const dynamic = "force-dynamic";

type VisualResearchPageProps = {
  params: Promise<{ slug: string }>;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function textValue(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function numberLabel(value: unknown) {
  return numberValue(value).toLocaleString();
}

function percentLabel(value: unknown) {
  const number = numberValue(value);
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function cleanWorkbenchUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const REEFBALL_PUBLIC_MEDIA_BASE_URL = process.env.REEFBALL_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_REEFBALL_PUBLIC_MEDIA_BASE_URL || "";
const REEFBALL_IMAGE_PROXY_BASE = process.env.REEFBALL_IMAGE_PROXY_BASE || process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BASE || "";
const REEFBALL_IMAGE_PROXY_BASE_PUBLIC = process.env.NEXT_PUBLIC_REEFBALL_IMAGE_PROXY_BASE || "";

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

function rewriteImageUrlForWorkbench(
  rawUrl: unknown,
  workbenchUrl: string,
  imageProxyToken?: string,
  imageProxyBase = cleanWorkbenchUrl(REEFBALL_IMAGE_PROXY_BASE),
) {
  if (typeof rawUrl !== "string") return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;

  const mediaBase = cleanWorkbenchUrl(REEFBALL_PUBLIC_MEDIA_BASE_URL);
  const proxyBase = cleanWorkbenchUrl(imageProxyBase);
  const hostBase = cleanWorkbenchUrl(workbenchUrl);

  const rawIsRelativePreview = trimmed.match(/^\/?previews-(\d+)\/([0-9]+)\.jpg(?:\?[^#\s]*)?$/i);
  if (rawIsRelativePreview) {
    const kind = "preview";
    const size = rawIsRelativePreview[1] || "1800";
    const seq = rawIsRelativePreview[2]?.padStart(4, "0") || "0001";
    const result = (() => {
      if (rawIsRelativePreview) {
        if (proxyBase) return addImageProxyAuth(`${proxyBase}?kind=${kind}&seq=${encodeURIComponent(seq)}&size=${encodeURIComponent(size)}`, imageProxyToken);
        if (workbenchUrl) return cleanWorkbenchUrl(`${workbenchUrl}${rawUrl}`);
        return rawUrl;
      }
      return rawUrl;
    })();
    if (seq === "0001" || seq === "0136") {
      console.log("[DEBUG REWRITE]", { seq, rawUrl, result, proxyBase, hasToken: !!imageProxyToken });
    }
    return result;
  }
  const rawIsRelativeThumb = trimmed.match(/^\/?thumbs\/([0-9]+)\.jpg(?:\?[^#\s]*)?$/i);
  if (rawIsRelativeThumb) {
    const seq = rawIsRelativeThumb[1]?.padStart(4, "0") || "0001";
    if (proxyBase) return addImageProxyAuth(`${proxyBase}?kind=thumb&seq=${encodeURIComponent(seq)}`, imageProxyToken);
    if (mediaBase) return `${mediaBase}/thumbs/${seq}.jpg`;
  }
  const rawIsRelativeMedia = trimmed.match(/^\/?media\/([0-9]+)\.jpg(?:\?[^#\s]*)?$/i);
  if (rawIsRelativeMedia) {
    const seq = rawIsRelativeMedia[1]?.padStart(4, "0") || "0001";
    if (proxyBase) return addImageProxyAuth(`${proxyBase}?kind=media&seq=${encodeURIComponent(seq)}`, imageProxyToken);
    if (mediaBase) return `${mediaBase}/media/${seq}.jpg`;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
    if (proxyBase && isLocal) {
      const localImage = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
      if (localImage) {
        const kind = localImage[1];
        const seq = localImage[2].padStart(4, "0");
        const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
        const maybeSize = size ? `&size=${encodeURIComponent(size)}` : "";
        return addImageProxyAuth(`${proxyBase}?kind=${encodeURIComponent(kind)}&seq=${encodeURIComponent(seq)}${maybeSize}`, imageProxyToken);
      }
      return addImageProxyAuth(`${proxyBase}?source=${encodeURIComponent(trimmed)}`, imageProxyToken);
    }
    if (mediaBase && isLocal) {
      const localPreview = parsed.pathname.match(/^\/(?:api\/)?(preview|thumb|media)\/([0-9]+)\.jpg$/);
      if (localPreview) {
        const kind = localPreview[1];
        const seq = localPreview[2].padStart(4, "0");
        const size = kind === "preview" ? parsed.searchParams.get("size") || "1800" : "";
        const path = kind === "thumb" ? "thumbs" : kind === "media" ? "media" : `previews-${size}`;
        return `${mediaBase}/${path}/${seq}.jpg`;
      }
      return `${mediaBase}/${trimmed.replace(/^\/+/, "").replace(/^api\//, "")}`;
    }
    if (isLocal && hostBase) return new URL(parsed.pathname + parsed.search + parsed.hash, hostBase).toString();
    if (isLocal) return trimmed;
    return trimmed;
  } catch {
    if (trimmed.startsWith("/")) {
      if (proxyBase) {
        if (trimmed.includes("image-proxy")) return addImageProxyAuth(trimmed, imageProxyToken);
        return addImageProxyAuth(`${proxyBase}?source=${encodeURIComponent(trimmed)}`, imageProxyToken);
      }
      if (mediaBase) return `${mediaBase}/${trimmed.replace(/^\/+/, "")}`;
      try {
        return hostBase ? new URL(trimmed, hostBase).toString() : trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
}

function hasLocalImageHost(value: unknown) {
  if (!value || typeof value !== "string") return false;
  const text = value.toLowerCase();
  return text.includes("://127.0.0.1") || text.includes("://localhost");
}

function ratioLabel(value: unknown, total: unknown) {
  return `${numberLabel(value)} / ${numberLabel(total)}`;
}

function progressPercent(value: unknown, total: unknown) {
  const numerator = numberValue(value);
  const denominator = numberValue(total);
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

function packetQueueCount(summary: JsonRecord, reviewQueues: JsonRecord, key: string, summaryKey: string) {
  const queue = asRecordArray(reviewQueues[key]);
  return queue.length || numberValue(summary[summaryKey]);
}

function packetPreviewTitle(item: JsonRecord) {
  const seq = numberValue(item.seq);
  const filename = textValue(item.filename);
  const label = textValue(item.label, "needs label");
  if (filename) return `${seq ? `${seq.toString().padStart(4, "0")} ` : ""}${filename}`;
  return `${label}${textValue(item.imageDate) ? ` · ${textValue(item.imageDate)}` : ""}`;
}

function packetPreviewMeta(item: JsonRecord) {
  const pieces = [
    textValue(item.label),
    textValue(item.imageDate),
    textValue(item.site),
    numberValue(item.workbookMatchCount) ? `${numberLabel(item.workbookMatchCount)} rows` : "",
    item.tileBoundaryPresent === true ? "tile traced" : "",
    numberValue(item.unknownPercent) ? `${percentLabel(item.unknownPercent)} unknown` : "",
  ].filter(Boolean);
  return pieces.join(" · ") || "Needs review";
}

function duplicateStackTitle(item: JsonRecord) {
  return `${textValue(item.label, "unknown tile")} · ${textValue(item.imageDate, "no date")}`;
}

function duplicateStackMeta(item: JsonRecord) {
  return `${numberLabel(item.count)} images · ${textValue(item.stackKey, "no stack key")}`;
}

function asImageFocusItem(
  item: JsonRecord,
  queueLabel: string,
  imageProxyBase: string,
  extra: JsonRecord = {},
  imageProxyToken?: string,
): ImageFocusItem {
  const workbenchUrl = cleanWorkbenchUrl(
    process.env.REEFBALL_WORKBENCH_URL ||
    process.env.NEXT_PUBLIC_REEFBALL_WORKBENCH_URL ||
    "",
  );
  return {
    ...item,
    ...extra,
    previewUrl: rewriteImageUrlForWorkbench(item.previewUrl, workbenchUrl, imageProxyToken, imageProxyBase),
    thumbUrl: rewriteImageUrlForWorkbench(item.thumbUrl, workbenchUrl, imageProxyToken, imageProxyBase),
    workbenchUrl: rewriteImageUrlForWorkbench(item.workbenchUrl, workbenchUrl, imageProxyToken, imageProxyBase),
    queueLabel,
  } as ImageFocusItem;
}

function focusItemsFromPacket(
  reviewQueues: JsonRecord,
  imageFocus: JsonRecord,
  imageProxyBase: string,
  imageProxyToken?: string,
): ImageFocusItem[] {
  const embeddedRecords = asRecordArray(imageFocus.records).map((item) =>
    asImageFocusItem(item, textValue(item.queueLabel, "Image focus"), imageProxyBase, {}, imageProxyToken),
  );
  const embeddedBySeq = new Map(
    embeddedRecords.map((item) => [textValue(item.seq), item]),
  );

  const queueCandidates: ImageFocusItem[] = [
    ...asRecordArray(reviewQueues.multiRowMatches).map((item) => asImageFocusItem(item, "Row match review", imageProxyBase, {}, imageProxyToken)),
    ...asRecordArray(reviewQueues.needsTileBoundary).map((item) => asImageFocusItem(item, "Needs tile trace", imageProxyBase, {}, imageProxyToken)),
    ...asRecordArray(reviewQueues.missingLabels).map((item) => asImageFocusItem(item, "Missing label", imageProxyBase, {}, imageProxyToken)),
    ...asRecordArray(reviewQueues.unmatchedImages).map((item) => asImageFocusItem(item, "No workbook match", imageProxyBase, {}, imageProxyToken)),
    ...asRecordArray(reviewQueues.duplicateStacks).flatMap((stack) =>
      asRecordArray(stack.records).map((record) =>
        asImageFocusItem(
          record,
          "Duplicate stack",
          imageProxyBase,
          {
            stackCount: stack.count,
            stackKey: stack.stackKey,
          },
          imageProxyToken,
        ),
      ),
    ),
  ];
  const candidates = [
    ...embeddedRecords,
    ...queueCandidates.map((item) => ({
      ...item,
      ...(embeddedBySeq.get(textValue(item.seq)) ?? {}),
    })),
  ];

  const seen = new Set<string>();
  const result: ImageFocusItem[] = [];
  for (const item of candidates) {
    const seq = textValue(item.seq);
    if (!seq || seen.has(seq)) continue;
    seen.add(seq);
    result.push(item);
    if (result.length >= 36) break;
  }
  return result;
}

function getWorkbenchUrl(projectSlug: string) {
  const configured =
    process.env.REEFBALL_WORKBENCH_URL ||
    process.env.NEXT_PUBLIC_REEFBALL_WORKBENCH_URL ||
    "";

  if (configured) return configured;
  if (projectSlug === "marine-biology-research" && process.env.NODE_ENV !== "production") {
    return "http://127.0.0.1:8765/";
  }

  return "";
}

function workbenchApiUrl(workbenchUrl: string, path: string) {
  if (!workbenchUrl) return "";
  try {
    return new URL(path, workbenchUrl).toString();
  } catch {
    return "";
  }
}

function statusTone(value: number) {
  if (value > 0) return "border-emerald-200 bg-emerald-50 text-emerald-950";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function StageCard({
  title,
  detail,
  icon: Icon,
  ready,
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
  ready: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ready ? "border-emerald-200 bg-emerald-50" : "border-[#eadfca] bg-white"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="rounded-xl border border-white/70 bg-white p-2 text-[#8c6b4a]">
          <Icon size={18} />
        </div>
        {ready ? <CheckCircle2 className="text-emerald-700" size={18} /> : null}
      </div>
      <h3 className="font-serif text-lg font-black text-[#3d3122]">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-[#6b5b45]">{detail}</p>
    </div>
  );
}

export default async function VisualResearchPage({ params }: VisualResearchPageProps) {
  const { slug } = await params;
  const session = await auth();
  const cookieStore = await cookies();
  const actorEmail = normalizeAccessEmail(
    session?.user?.primaryEmail
    || session?.user?.email
    || null
  );

  if (!actorEmail) {
    redirect(`/login?callbackUrl=/nests/${encodeURIComponent(slug)}/visual-research`);
  }

  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actorEmail,
    action: "read",
  });

  if (!access.allowed) notFound();

  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(slug, prisma);
  if (!project) notFound();

  const canWrite = access.role ? roleAllowsAction(access.role, "write") : false;
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("host") || "";
  const requestProto = requestHeaders.get("x-forwarded-proto") || (requestHost.includes("localhost") ? "http" : "https");
  const requestOrigin = requestHost ? `${requestProto}://${requestHost}` : "";
  const resolvedImageProxyBase = cleanWorkbenchUrl(
    REEFBALL_IMAGE_PROXY_BASE_PUBLIC
    || REEFBALL_IMAGE_PROXY_BASE
    || (requestOrigin
      ? `${requestOrigin}/api/nests/${project.slug}/visual-research/image-proxy`
      : `/api/nests/${project.slug}/visual-research/image-proxy`),
  );
  const nestKind = nestKindFromSourceLabel(project.sourceLabel);
  const workbenchUrl = getWorkbenchUrl(project.slug);
  const nestPacketSummaryUrl = workbenchApiUrl(workbenchUrl, "/api/nest-packet?summary=1");
  const nestPacketDownloadUrl = workbenchApiUrl(workbenchUrl, "/api/nest-packet?download=1");

  const [assetCount, imageAssetCount, sourceUnitCount, attachmentCount, recentAssets, queuedJobs, latestNestPacket] =
    await Promise.all([
      prisma.studioMediaAsset.count({
        where: { projects: { some: { id: project.id } } },
      }),
      prisma.studioMediaAsset.count({
        where: {
          projects: { some: { id: project.id } },
          mimeType: { startsWith: "image/" },
        },
      }),
      prisma.studioSourceUnit.count({
        where: { projectId: project.id },
      }),
      prisma.studioAssetAttachment.count({
        where: { projectId: project.id },
      }),
      prisma.studioMediaAsset.findMany({
        where: { projects: { some: { id: project.id } } },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          url: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.studioWorkflowJob.count({
        where: {
          projectId: project.id,
          type: { in: ["ml-labeling", "ml-training", "asset-thumbnail", "asset-probe"] },
          status: { in: ["queued", "running", "waiting"] },
        },
      }),
      prisma.studioSourceUnit.findFirst({
        where: {
          projectId: project.id,
          slug: "reef-ball-nest-packet-latest",
        },
        select: {
          id: true,
          title: true,
          capturedAt: true,
          updatedAt: true,
          metadataJson: true,
        },
      }),
    ]);

  const isReefBallNest = project.slug === "marine-biology-research";
  const latestPacketMetadata = asRecord(latestNestPacket?.metadataJson);
  const latestPacketSummary = asRecord(latestPacketMetadata.summary);
  const latestPacketReviewQueues = asRecord(latestPacketMetadata.reviewQueues);
  const latestPacketImageFocus = asRecord(latestPacketMetadata.imageFocus);
  const imageProxyToken = createImageProxyToken(project.slug);
  const latestPacketSource = asRecord(latestPacketMetadata.source);
  const latestPacketWorkbook = asRecord(latestPacketMetadata.workbook);
  const latestPacketImageFocusItems = latestNestPacket
    ? focusItemsFromPacket(latestPacketReviewQueues, latestPacketImageFocus, resolvedImageProxyBase, imageProxyToken)
    : [];
  const latestPacketImageHasLocalHost = latestPacketImageFocusItems.some((item) =>
    hasLocalImageHost(item.previewUrl) || hasLocalImageHost(item.thumbUrl) || hasLocalImageHost(item.workbenchUrl),
  );
  const latestPacketStats = latestNestPacket ? [
    { label: "images", value: numberLabel(latestPacketSummary.imageCount) },
    { label: "tied", value: numberLabel(latestPacketSummary.imagesExplicitlyTied) },
    { label: "rows", value: numberLabel(latestPacketSummary.workbookRowsExplicitlyTied) },
    { label: "reviews", value: numberLabel(latestPacketSummary.rowReviewNeededCount) },
  ] : [];
  const latestPacketTriage = latestNestPacket ? [
    {
      label: "Workbook bridge",
      value: ratioLabel(latestPacketSummary.imagesExplicitlyTied, latestPacketSummary.imageCount),
      detail: `${numberLabel(latestPacketSummary.workbookRowsExplicitlyTied)} workbook rows tied`,
      progress: progressPercent(latestPacketSummary.imagesExplicitlyTied, latestPacketSummary.imageCount),
    },
    {
      label: "Row choice review",
      value: numberLabel(latestPacketSummary.rowReviewNeededCount),
      detail: "date/label matches with more than one workbook row",
      progress: progressPercent(latestPacketSummary.rowReviewNeededCount, latestPacketSummary.imageCount),
    },
    {
      label: "Duplicate load",
      value: ratioLabel(latestPacketSummary.imagesInDuplicateStacks, latestPacketSummary.imageCount),
      detail: `${numberLabel(latestPacketSummary.duplicateStackCount)} duplicate stacks`,
      progress: progressPercent(latestPacketSummary.imagesInDuplicateStacks, latestPacketSummary.imageCount),
    },
  ] : [];
  const latestPacketCoverage = latestNestPacket ? [
    {
      label: "Tile boundaries",
      value: ratioLabel(latestPacketSummary.imagesWithTileBoundary, latestPacketSummary.imageCount),
      detail: "images with tile outline available for percent cover",
      progress: progressPercent(latestPacketSummary.imagesWithTileBoundary, latestPacketSummary.imageCount),
    },
    {
      label: "Masks and marks",
      value: ratioLabel(latestPacketSummary.imagesWithMarks, latestPacketSummary.imageCount),
      detail: "images with saved annotation geometry",
      progress: progressPercent(latestPacketSummary.imagesWithMarks, latestPacketSummary.imageCount),
    },
    {
      label: "Unmatched images",
      value: ratioLabel(latestPacketSummary.imagesWithoutWorkbookMatch, latestPacketSummary.imageCount),
      detail: "images still missing a workbook row bridge",
      progress: progressPercent(latestPacketSummary.imagesWithoutWorkbookMatch, latestPacketSummary.imageCount),
    },
  ] : [];
  const latestPacketImportedAt = textValue(latestPacketMetadata.importedAt)
    || (latestNestPacket ? (latestNestPacket.capturedAt ?? latestNestPacket.updatedAt).toLocaleString() : "");
  const latestPacketQueues = latestNestPacket ? [
    {
      key: "multiRowMatches",
      title: "Row matches",
      count: packetQueueCount(latestPacketSummary, latestPacketReviewQueues, "multiRowMatches", "rowReviewNeededCount"),
      detail: "Images where the label/date bridge still maps to multiple workbook rows.",
      items: asRecordArray(latestPacketReviewQueues.multiRowMatches).slice(0, 4),
    },
    {
      key: "duplicateStacks",
      title: "Review stacks",
      count: packetQueueCount(latestPacketSummary, latestPacketReviewQueues, "duplicateStacks", "duplicateStackCount"),
      detail: "Repeated shots of the same tile/date that need a keeper decision.",
      items: asRecordArray(latestPacketReviewQueues.duplicateStacks).slice(0, 4),
      duplicate: true,
    },
    {
      key: "missingLabels",
      title: "Missing labels",
      count: packetQueueCount(latestPacketSummary, latestPacketReviewQueues, "missingLabels", "imagesWithoutWorkbookMatch"),
      detail: "Images where the visible tile label still needs to be read or confirmed.",
      items: asRecordArray(latestPacketReviewQueues.missingLabels).slice(0, 4),
    },
    {
      key: "unmatchedImages",
      title: "No workbook match",
      count: packetQueueCount(latestPacketSummary, latestPacketReviewQueues, "unmatchedImages", "imagesWithoutWorkbookMatch"),
      detail: "Images that do not yet land on a workbook row.",
      items: asRecordArray(latestPacketReviewQueues.unmatchedImages).slice(0, 4),
    },
    {
      key: "needsTileBoundary",
      title: "Needs tile trace",
      count: packetQueueCount(latestPacketSummary, latestPacketReviewQueues, "needsTileBoundary", "imageCount"),
      detail: "Images where percent-cover work still needs a tile boundary.",
      items: asRecordArray(latestPacketReviewQueues.needsTileBoundary).slice(0, 4),
    },
  ] : [];
  const metricCards: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: "Assets", value: assetCount, Icon: Camera },
    { label: "Images", value: imageAssetCount, Icon: ImageIcon },
    { label: "Sources", value: sourceUnitCount, Icon: Database },
    { label: "Jobs", value: queuedJobs, Icon: Layers3 },
  ];

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/nests/${encodeURIComponent(project.slug)}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
          >
            <ArrowLeft size={14} />
            Back to Nest
          </Link>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-950">
            {nestKind} visual research
          </span>
        </div>

        <header className="overflow-hidden rounded-3xl border border-[#e8dcc4] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="p-6 md:p-8">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                Visual Research Lab
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                {project.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                A Nest-level workspace for evidence images, local manifests, source metadata, visual labels, human review, and model-ready exports.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={`/media?projectId=${encodeURIComponent(project.id)}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:-translate-y-0.5"
                >
                  <FolderOpen size={14} />
                  Media Vault
                </Link>
                <Link
                  href={`/create?project=${encodeURIComponent(project.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
                >
                  <BookOpen size={14} />
                  Research notebook
                </Link>
                {workbenchUrl ? (
                  <Link
                    href={workbenchUrl}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-950 shadow-sm transition hover:bg-cyan-100"
                  >
                    <Play size={14} />
                    Launch workbench
                  </Link>
                ) : null}
                <a
                  href="quipslymac://vision-lab/workbench"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-sm transition hover:bg-emerald-100"
                >
                  <HardDrive size={14} />
                  Open Mac workbench
                </a>
              </div>
            </div>

            <aside className="border-t border-[#eadfca] bg-[#fffaf3] p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-black">Access follows the Nest</h2>
                  <p className="mt-1 text-xs leading-5 text-[#7d6a50]">
                    Your role here is {access.role}. {canWrite ? "You can add and review visual research material." : "You can review what has been shared."}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {metricCards.map(({ label, value, Icon }) => (
                  <div key={label} className={`rounded-2xl border p-4 ${statusTone(value)}`}>
                    <Icon size={18} />
                    <div className="mt-3 text-[10px] font-black uppercase tracking-[0.14em]">{label}</div>
                    <div className="mt-1 font-serif text-2xl font-black">{value}</div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </header>

        {isReefBallNest ? (
          <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-cyan-100 bg-white p-3 text-cyan-900">
                <Microscope size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black text-cyan-950">Chula Vista reef-ball mode</h2>
                <p className="mt-2 max-w-4xl text-sm leading-7 text-cyan-950/80">
                  This Nest is tuned for tile photos held in front of reef-ball structures: preserve the photo batch, map filenames to workbook metadata, annotate coverage masks, track organism labels, and export reviewed evidence for later ML runs.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {isReefBallNest ? (
          <ImageFocusStage
            items={latestPacketImageFocusItems}
            workbenchUrl={workbenchUrl}
            imageProxyToken={imageProxyToken}
            imageProxyBase={resolvedImageProxyBase}
            publicMediaBase={REEFBALL_PUBLIC_MEDIA_BASE_URL}
            imageCount={numberLabel(latestPacketSummary.imageCount)}
            tiedCount={numberLabel(latestPacketSummary.imagesExplicitlyTied)}
            reviewCount={numberLabel(latestPacketSummary.rowReviewNeededCount)}
          />
        ) : null}

        {isReefBallNest && workbenchUrl ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm md:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-emerald-100 bg-white p-3 text-emerald-900">
                    <HardDrive size={22} />
                  </div>
                  <div>
                    <h2 className="font-serif text-2xl font-black text-emerald-950">Local Nest packet</h2>
                    <p className="mt-2 max-w-4xl text-sm leading-7 text-emerald-950/80">
                      Index workbook ties, masks, review queues, duplicate stacks, and model-ready records from the local workbench while raw media stays on the HDD.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {nestPacketSummaryUrl ? (
                    <a
                      href={nestPacketSummaryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-sm transition hover:bg-emerald-100"
                    >
                      <Database size={14} />
                      Open summary
                    </a>
                  ) : null}
                  {nestPacketDownloadUrl ? (
                    <a
                      href={nestPacketDownloadUrl}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-950 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:-translate-y-0.5"
                    >
                      <ShieldCheck size={14} />
                      Download packet
                    </a>
                  ) : null}
                  <a
                    href="quipslymac://vision-lab/workbench"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-950 shadow-sm transition hover:bg-emerald-200"
                  >
                    <Play size={14} />
                    Open Mac workbench
                  </a>
                </div>
              </div>
              {nestPacketSummaryUrl ? (
                <LocalNestPacketImport
                  projectSlug={project.slug}
                  summaryUrl={nestPacketSummaryUrl}
                  canWrite={canWrite}
                  latestImportedAt={latestNestPacket ? (latestNestPacket.capturedAt ?? latestNestPacket.updatedAt).toLocaleString() : null}
                  latestStats={latestPacketStats}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {isReefBallNest ? (
          <section className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                  <Database size={22} />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-black">Imported packet dashboard</h2>
                  <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                    {latestNestPacket
                      ? `Latest packet imported ${latestPacketImportedAt || "recently"}.`
                      : "No reef-ball packet has been imported into this Nest yet."}
                  </p>
                </div>
              </div>
              {latestNestPacket ? (
                <div className="grid min-w-[min(100%,420px)] grid-cols-2 gap-2 sm:grid-cols-4">
                  {latestPacketStats.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-cyan-950">
                      <div className="font-serif text-2xl font-black">{item.value}</div>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-900/70">{item.label}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {latestNestPacket ? (
              <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <h3 className="font-serif text-xl font-black">Packet source</h3>
                  <div className="mt-3 space-y-3 text-xs leading-5 text-[#6b5b45]">
                    <div>
                      <div className="font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Generated</div>
                      <div>{textValue(latestPacketMetadata.generatedAt, "Unknown")}</div>
                    </div>
                    <div>
                      <div className="font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Dataset</div>
                      <div className="break-all font-mono">{textValue(latestPacketSource.datasetRoot, "Not recorded")}</div>
                    </div>
                    <div>
                      <div className="font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Workbook Rows</div>
                      <div>{numberLabel(latestPacketWorkbook.rowCount)} rows · {numberLabel(latestPacketWorkbook.contextRowCount)} context rows</div>
                    </div>
                    <div>
                      <div className="font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Workbook Sheets</div>
                      <div>{numberLabel(asRecordArray(latestPacketWorkbook.sheets).length)} sheets indexed</div>
                    </div>
                  </div>
                </aside>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <div className="grid gap-3 lg:grid-cols-3">
                      {latestPacketTriage.map((item) => (
                        <article key={item.label} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-cyan-950 shadow-sm">
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-900/70">{item.label}</div>
                          <div className="mt-2 font-serif text-2xl font-black">{item.value}</div>
                          <div className="mt-1 min-h-10 text-xs leading-5 text-cyan-950/75">{item.detail}</div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-cyan-700" style={{ width: `${item.progress}%` }} />
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      {latestPacketCoverage.map((item) => (
                        <article key={item.label} className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4 shadow-sm">
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">{item.label}</div>
                          <div className="mt-2 font-serif text-2xl font-black">{item.value}</div>
                          <div className="mt-1 min-h-10 text-xs leading-5 text-[#7d6a50]">{item.detail}</div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-[#8c6b4a]" style={{ width: `${item.progress}%` }} />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  {latestPacketQueues.map((queue) => (
                    <article key={queue.key} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-serif text-xl font-black">{queue.title}</h3>
                          <p className="mt-1 text-xs leading-5 text-[#7d6a50]">{queue.detail}</p>
                        </div>
                        <div className="rounded-2xl border border-[#eadfca] bg-white px-3 py-2 text-right">
                          <div className="font-serif text-2xl font-black">{numberLabel(queue.count)}</div>
                          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">items</div>
                        </div>
                      </div>

                      {queue.items.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          {queue.items.map((item, index) => (
                            <div key={`${queue.key}-${index}`} className="rounded-xl border border-[#eadfca] bg-white p-3">
                              <div className="truncate text-sm font-black text-[#3d3122]" title={queue.duplicate ? duplicateStackTitle(item) : packetPreviewTitle(item)}>
                                {queue.duplicate ? duplicateStackTitle(item) : packetPreviewTitle(item)}
                              </div>
                              <div className="mt-1 truncate text-xs text-[#7d6a50]" title={queue.duplicate ? duplicateStackMeta(item) : packetPreviewMeta(item)}>
                                {queue.duplicate ? duplicateStackMeta(item) : packetPreviewMeta(item)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-[#eadfca] bg-white p-3 text-xs text-[#7d6a50]">
                          No queued examples in this packet.
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
                Import a local packet from Quipsly Mac or this browser to populate shared review queues.
              </div>
            )}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StageCard
            title="Media intake"
            detail="Attach image batches to the Nest through Media Vault or local-engine registration."
            icon={Camera}
            ready={assetCount > 0}
          />
          <StageCard
            title="Source metadata"
            detail="Connect images to workbook rows, manifests, field notes, and provenance records."
            icon={Database}
            ready={sourceUnitCount > 0 || attachmentCount > 0}
          />
          <StageCard
            title="Visual labels"
            detail="Use media tags and annotation layers for organism IDs, uncertainty, and review state."
            icon={Tags}
            ready={numberValue(latestPacketSummary.annotatedImageCount) > 0 || numberValue(latestPacketSummary.imagesWithMarks) > 0}
          />
          <StageCard
            title="Local heavy work"
            detail="Keep HDD folders, manifests, hashes, previews, and future training jobs in Quipsly Mac."
            icon={HardDrive}
            ready={queuedJobs > 0}
          />
        </section>

        {isReefBallNest && latestPacketImageHasLocalHost && !workbenchUrl ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-amber-200 bg-white p-3 text-amber-900">
                <ImageIcon size={18} />
              </div>
              <div>
                <h2 className="font-serif text-xl font-black text-amber-950">Local image links detected</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900/85">
                    This packet uses localhost image URLs. On nest.quipsly.com those links are not reachable, so set <span className="font-mono">REEFBALL_WORKBENCH_URL</span> (or <span className="font-mono">NEXT_PUBLIC_REEFBALL_WORKBENCH_URL</span>) to a publicly reachable host, or set <span className="font-mono">REEFBALL_PUBLIC_MEDIA_BASE_URL</span> to a public object-store prefix for derivative images.
                    {REEFBALL_IMAGE_PROXY_BASE ? " If you are using the image proxy, set it to the local Quipsly image proxy endpoint and keep workbench URLs private." : ""}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <ImageIcon size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Recent visual assets</h2>
                <p className="mt-1 text-sm text-[#7d6a50]">Images and media attached to this Nest.</p>
              </div>
            </div>

            {recentAssets.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recentAssets.map((asset) => (
                  <Link
                    key={asset.id}
                    href={`/media/${encodeURIComponent(asset.id)}`}
                    className="overflow-hidden rounded-2xl border border-[#eadfca] bg-[#fffdf9] shadow-sm transition hover:border-[#d5b77d] hover:bg-[#fff8eb]"
                  >
                    <div className="aspect-[4/3] bg-[#f3eadb]">
                      {asset.url ? (
                        <img
                          src={asset.url}
                          alt={asset.filename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#8c6b4a]">
                          <ImageIcon size={28} />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-sm font-black text-[#3d3122]" title={asset.filename}>
                        {asset.filename}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8c6b4a]">
                        {asset.mimeType || "media"} · {asset.createdAt.toLocaleDateString()}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
                <h3 className="font-serif text-xl font-black text-[#3d3122]">No visual assets are attached yet.</h3>
                <p className="mt-2">
                  The local reef-ball workbench can stay on the HDD while this Nest becomes the shared index, review, and export layer.
                </p>
                <Link
                  href={`/media?projectId=${encodeURIComponent(project.id)}`}
                  className="mt-4 inline-flex rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3]"
                >
                  Open Media Vault
                </Link>
              </div>
            )}
          </article>

          <aside className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <Layers3 size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Reusable pieces</h2>
                <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                  The reef-ball workflow should graduate into shared Quipsly tools only where the pattern repeats.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                "Nest access and collaborator review",
                "Media Vault attachment without file duplication",
                "Source-unit evidence records for images and workbook rows",
                "Mask annotation layers with normalized coordinates",
                "Reviewed training and evaluation manifests",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-3 text-sm leading-6 text-[#6b5b45]">
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
