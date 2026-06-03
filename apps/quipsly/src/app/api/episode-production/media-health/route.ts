import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket, parseGcsUri } from "@/lib/server/gcs";

type HealthKind = "audio" | "video" | "unknown";
type HealthStatus = "ok" | "warning" | "error" | "unchecked";

type HealthRequestItem = {
  id?: string;
  label?: string;
  sourceUrl?: string;
  expectedKind?: HealthKind;
  contentType?: string;
  size?: number;
};

type VideoSourceRecord = {
  id: string;
  providerSourceId: string | null;
  url: string | null;
  title: string | null;
};

type VideoSourcePrismaClient = ReturnType<typeof getPrismaClient> & {
  studioVideoSource: {
    findUnique: (input: {
      where: { id: string };
      select: { id: true; providerSourceId: true; url: true; title: true };
    }) => Promise<VideoSourceRecord | null>;
  };
};

const PROBE_TIMEOUT_MS = 4500;
const MAX_ITEMS = 80;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferKindFromContentType(contentType: string): HealthKind {
  const lower = contentType.toLowerCase();
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "unknown";
}

function inferContentTypeFromPath(value: string) {
  const ext = path.extname(value.split("?")[0] ?? "").toLowerCase();
  if ([".mp4", ".mov", ".m4v"].includes(ext)) return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

function inferKindFromSource(sourceUrl: string, contentType = ""): HealthKind {
  const fromContentType = inferKindFromContentType(contentType);
  if (fromContentType !== "unknown") return fromContentType;
  const lower = sourceUrl.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|m4v|mkv|m3u8|mpd)(\?|$)/i.test(lower)) return "video";
  if (/youtube\.com|youtu\.be/i.test(lower)) return "video";
  return "unknown";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isInternalMediaUrl(value: string) {
  return value.startsWith("/api/ingest/media/") || value.includes("/api/ingest/media/");
}

function sourceIdFromInternalMediaUrl(value: string) {
  const match = /\/api\/ingest\/media\/([^/?#]+)/.exec(value);
  return match ? decodeURIComponent(match[1]) : "";
}

function canPreviewSource(args: { sourceUrl: string; kind: HealthKind; reachable: boolean }) {
  if (!args.reachable) return false;
  if (/youtube\.com|youtu\.be/i.test(args.sourceUrl)) return true;
  return args.kind === "audio" || args.kind === "video";
}

function canRenderSource(args: { sourceUrl: string; kind: HealthKind; reachable: boolean }) {
  if (!args.reachable) return false;
  if (/youtube\.com|youtu\.be/i.test(args.sourceUrl)) return false;
  if (args.sourceUrl.startsWith("gcs://")) return false;
  return args.kind === "audio" || args.kind === "video";
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function probeRemoteUrl(sourceUrl: string) {
  const attempt = async (method: "HEAD" | "GET") => withTimeout(async (signal) => {
    const response = await fetch(sourceUrl, {
      method,
      signal,
      redirect: "follow",
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
    return response;
  });

  let response: Response;
  let method: "HEAD" | "GET" = "HEAD";
  try {
    response = await attempt("HEAD");
    if ([405, 403, 501].includes(response.status)) {
      method = "GET";
      response = await attempt("GET");
    }
  } catch {
    method = "GET";
    response = await attempt("GET");
  }

  const contentType = response.headers.get("content-type") || inferContentTypeFromPath(sourceUrl);
  const size = numberValue(response.headers.get("content-length"), 0);
  const reachable = response.ok || response.status === 206;
  return {
    reachable,
    statusCode: response.status,
    method,
    contentType,
    size,
    note: reachable ? "Remote source responded to a lightweight probe." : `Remote source returned HTTP ${response.status}.`,
  };
}

async function probeGcsUri(gcsUri: string) {
  const parsed = parseGcsUri(gcsUri);
  if (!parsed) {
    return {
      reachable: false,
      statusCode: 0,
      method: "metadata",
      contentType: inferContentTypeFromPath(gcsUri),
      size: 0,
      note: "GCS URI could not be parsed.",
    };
  }

  const file = getMediaBucket(parsed.bucketName).file(parsed.objectName);
  const [exists] = await file.exists();
  if (!exists) {
    return {
      reachable: false,
      statusCode: 404,
      method: "metadata",
      contentType: inferContentTypeFromPath(parsed.objectName),
      size: 0,
      note: "GCS object was not found.",
    };
  }

  const [metadata] = await file.getMetadata();
  return {
    reachable: true,
    statusCode: 200,
    method: "metadata",
    contentType: String(metadata.contentType || inferContentTypeFromPath(parsed.objectName)),
    size: numberValue(metadata.size, 0),
    note: "Vault object metadata is reachable without downloading media.",
  };
}

async function probeInternalMedia(sourceUrl: string) {
  const sourceId = sourceIdFromInternalMediaUrl(sourceUrl);
  if (!sourceId) {
    return {
      reachable: false,
      statusCode: 0,
      method: "metadata",
      contentType: "application/octet-stream",
      size: 0,
      note: "Internal media URL is missing a source id.",
    };
  }

  const prisma = getPrismaClient() as VideoSourcePrismaClient;
  const source = await prisma.studioVideoSource.findUnique({
    where: { id: sourceId },
    select: { id: true, providerSourceId: true, url: true, title: true },
  });

  if (!source) {
    return {
      reachable: false,
      statusCode: 404,
      method: "metadata",
      contentType: "application/octet-stream",
      size: 0,
      note: "Internal media source record was not found.",
    };
  }

  if (source.url && isHttpUrl(source.url)) {
    return probeRemoteUrl(source.url);
  }

  if (source.providerSourceId?.startsWith("gcs://")) {
    return probeGcsUri(source.providerSourceId);
  }

  if (source.providerSourceId) {
    try {
      const stat = await fs.stat(source.providerSourceId);
      return {
        reachable: true,
        statusCode: 200,
        method: "metadata",
        contentType: inferContentTypeFromPath(source.providerSourceId),
        size: stat.size,
        note: "Local source file metadata is reachable.",
      };
    } catch {
      return {
        reachable: false,
        statusCode: 404,
        method: "metadata",
        contentType: inferContentTypeFromPath(source.providerSourceId),
        size: 0,
        note: "Local source file was not found.",
      };
    }
  }

  return {
    reachable: false,
    statusCode: 404,
    method: "metadata",
    contentType: "application/octet-stream",
    size: 0,
    note: "Internal media source has no provider URL or file path.",
  };
}

async function checkOne(item: HealthRequestItem) {
  const id = stringValue(item.id, stringValue(item.sourceUrl, "unknown-source"));
  const sourceUrl = stringValue(item.sourceUrl).trim();
  const expectedKind = item.expectedKind === "audio" || item.expectedKind === "video" ? item.expectedKind : "unknown";
  const declaredContentType = stringValue(item.contentType);

  if (!sourceUrl) {
    const kind = expectedKind !== "unknown" ? expectedKind : inferKindFromContentType(declaredContentType);
    return {
      id,
      label: stringValue(item.label, id),
      sourceUrl,
      status: "error" satisfies HealthStatus,
      reachable: false,
      playable: false,
      previewUsable: false,
      renderUsable: false,
      kind,
      expectedKind,
      detectedKind: kind,
      contentType: declaredContentType || "application/octet-stream",
      size: numberValue(item.size, 0),
      method: "none",
      note: "No source URL is attached.",
    };
  }

  let probe;
  try {
    if (/youtube\.com|youtu\.be/i.test(sourceUrl)) {
      probe = {
        reachable: true,
        statusCode: 200,
        method: "url-pattern",
        contentType: "text/html",
        size: 0,
        note: "YouTube links can be previewed as embeds, but need source media before final render.",
      };
    } else if (isInternalMediaUrl(sourceUrl)) {
      probe = await probeInternalMedia(sourceUrl);
    } else if (sourceUrl.startsWith("gcs://")) {
      probe = await probeGcsUri(sourceUrl);
    } else if (isHttpUrl(sourceUrl)) {
      probe = await probeRemoteUrl(sourceUrl);
    } else {
      probe = {
        reachable: false,
        statusCode: 0,
        method: "none",
        contentType: declaredContentType || inferContentTypeFromPath(sourceUrl),
        size: numberValue(item.size, 0),
        note: "Source is not a reachable URL yet.",
      };
    }
  } catch (error) {
    probe = {
      reachable: false,
      statusCode: 0,
      method: "probe-error",
      contentType: declaredContentType || inferContentTypeFromPath(sourceUrl),
      size: numberValue(item.size, 0),
      note: error instanceof Error ? error.message : "Source probe failed.",
    };
  }

  const detectedKind = inferKindFromSource(sourceUrl, probe.contentType || declaredContentType);
  const kind = detectedKind !== "unknown" ? detectedKind : expectedKind;
  const kindMatches = expectedKind === "unknown" || kind === "unknown" || expectedKind === kind;
  const previewUsable = canPreviewSource({ sourceUrl, kind, reachable: probe.reachable });
  const renderUsable = canRenderSource({ sourceUrl, kind, reachable: probe.reachable });
  const playable = previewUsable || renderUsable;
  const status: HealthStatus = !probe.reachable
    ? "error"
    : !kindMatches || !renderUsable
      ? "warning"
      : "ok";

  return {
    id,
    label: stringValue(item.label, id),
    sourceUrl,
    status,
    reachable: probe.reachable,
    playable,
    previewUsable,
    renderUsable,
    kind,
    expectedKind,
    detectedKind,
    contentType: probe.contentType || declaredContentType || "application/octet-stream",
    size: probe.size || numberValue(item.size, 0),
    statusCode: probe.statusCode,
    method: probe.method,
    note: !kindMatches
      ? `Expected ${expectedKind}, but probe looks like ${kind}.`
      : probe.note,
  };
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await request.json());
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const normalizedItems = items.map((item) => {
      const record = asRecord(item);
      return {
        id: stringValue(record.id),
        label: stringValue(record.label),
        sourceUrl: stringValue(record.sourceUrl),
        expectedKind: stringValue(record.expectedKind) as HealthKind,
        contentType: stringValue(record.contentType),
        size: numberValue(record.size, 0),
      } satisfies HealthRequestItem;
    });

    const results = await Promise.all(normalizedItems.map(checkOne));
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("[media-health] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to check media sources." }, { status: 500 });
  }
}
