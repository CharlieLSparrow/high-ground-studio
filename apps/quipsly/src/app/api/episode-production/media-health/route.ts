import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket } from "@/lib/server/gcs";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";
import {
  authorizeConfiguredMediaVaultLocation,
  resolveAllowedLocalStudioMediaPath,
} from "@/lib/server/studio-media-location-security";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

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

type MediaHealthActor = {
  id: string;
  email: string;
  isStaff: boolean;
};

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

async function probeGcsUri(gcsUri: string) {
  const location = authorizeConfiguredMediaVaultLocation(gcsUri);
  if (location.kind !== "gcs") {
    return {
      reachable: false,
      statusCode: 0,
      method: "metadata",
      contentType: inferContentTypeFromPath(gcsUri),
      size: 0,
      note: location.kind === "rejected-gcs"
        ? location.error
        : "GCS URI could not be parsed.",
    };
  }

  const file = getMediaBucket(location.bucketName).file(
    location.objectName,
    location.generation ? { generation: location.generation as any } : undefined,
  );
  const [exists] = await file.exists();
  if (!exists) {
    return {
      reachable: false,
      statusCode: 404,
      method: "metadata",
      contentType: inferContentTypeFromPath(location.objectName),
      size: 0,
      note: "GCS object was not found.",
    };
  }

  const [metadata] = await file.getMetadata();
  return {
    reachable: true,
    statusCode: 200,
    method: "metadata",
    contentType: String(metadata.contentType || inferContentTypeFromPath(location.objectName)),
    size: numberValue(metadata.size, 0),
    note: "Vault object metadata is reachable without downloading media.",
  };
}

async function probeInternalMedia(sourceUrl: string, actor: MediaHealthActor) {
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

  const prisma = getPrismaClient() as any;
  const authorization = await authorizeStudioMediaSource({
    prisma,
    actor,
    sourceId,
  });
  if (!authorization.allowed) {
    return {
      reachable: false,
      statusCode: authorization.status,
      method: "metadata",
      contentType: "application/octet-stream",
      size: 0,
      note: authorization.error,
    };
  }
  const source = authorization.source;

  if (source.url && isHttpUrl(source.url)) {
    return {
      reachable: false,
      statusCode: 0,
      method: "not-probed",
      contentType: inferContentTypeFromPath(source.url),
      size: 0,
      note: "Remote server-side probing is disabled. Preview the authorized source in the client instead.",
    };
  }

  if (source.providerSourceId?.startsWith("gcs://")) {
    return probeGcsUri(source.providerSourceId);
  }

  if (source.providerSourceId) {
    try {
      const localPath = await resolveAllowedLocalStudioMediaPath(source.providerSourceId);
      if (!localPath) {
        return {
          reachable: false,
          statusCode: 409,
          method: "not-probed",
          contentType: inferContentTypeFromPath(source.providerSourceId),
          size: 0,
          note: "Local metadata probing is confined to configured Quipsly ingest roots.",
        };
      }
      const stat = await fs.stat(localPath);
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

async function checkOne(item: HealthRequestItem, actor: MediaHealthActor) {
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
      probe = await probeInternalMedia(sourceUrl, actor);
    } else if (sourceUrl.startsWith("gcs://")) {
      probe = {
        reachable: false,
        statusCode: 0,
        method: "not-probed",
        contentType: declaredContentType || inferContentTypeFromPath(sourceUrl),
        size: numberValue(item.size, 0),
        note: "Raw GCS URI probing is disabled. Use an authorized internal media source.",
      };
    } else if (isHttpUrl(sourceUrl)) {
      probe = {
        reachable: false,
        statusCode: 0,
        method: "not-probed",
        contentType: declaredContentType || inferContentTypeFromPath(sourceUrl),
        size: numberValue(item.size, 0),
        note: "Arbitrary remote server-side probing is disabled to protect private networks.",
      };
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
  const status: HealthStatus = probe.method === "not-probed"
    ? "unchecked"
    : !probe.reachable
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
    const session = await getQuipslySessionFromRequest(request);
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Sign in before checking episode media health." },
        { status: 401 },
      );
    }
    const projectSlug = stringValue(body.projectSlug).trim();
    if (!projectSlug) {
      return NextResponse.json(
        { ok: false, error: "Choose a Nest before checking episode media health." },
        { status: 400 },
      );
    }
    const prisma = getPrismaClient() as any;
    const projectAccess = await resolveStudioProjectAccess({
      projectSlug,
      email: session.user.primaryEmail,
      action: "read",
      prisma,
    });
    if (!projectAccess.allowed) {
      return NextResponse.json(
        { ok: false, error: "You do not have access to this Nest's media." },
        { status: 403 },
      );
    }
    const actor: MediaHealthActor = {
      id: session.user.id,
      email: session.user.primaryEmail,
      isStaff: session.user.isStaff,
    };
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

    const results = await Promise.all(normalizedItems.map((item) => checkOne(item, actor)));
    return NextResponse.json({
      ok: true,
      projectSlug,
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("[media-health] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to check media sources." }, { status: 500 });
  }
}
