import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { resolveMacSessionActor } from "@/lib/server/mac-session-token";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
import { lookupStudioProjectDocument, projectConfig } from "../../../(app)/create/projectConfig";

type JsonRecord = Record<string, unknown>;

const PRESENCE_TTL_MS = 2 * 60 * 1000;
const EDIT_LEASE_TTL_MS = 90 * 1000;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanSlug(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().toLowerCase();
}

function cleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function actorName(actor: Awaited<ReturnType<typeof resolveActor>>) {
  return actor.name || actor.email || "Quipsly collaborator";
}

function readTimelineClips(timelineJson: unknown) {
  const record = asRecord(timelineJson);
  const direct = asArray(record.timelineClips);
  const nested = asArray(asRecord(record.timeline).timelineClips);
  const dataNested = asArray(asRecord(record.data).timelineClips);
  return (direct.length ? direct : nested.length ? nested : dataNested).map(asRecord);
}

function readContentFingerprint(timelineJson: unknown) {
  const record = asRecord(timelineJson);
  return cleanString(record.contentFingerprint);
}

function readImportedMedia(productionJson: unknown) {
  return asArray(asRecord(productionJson).importedMedia).map(asRecord);
}

function assetUrl(asset: JsonRecord) {
  return cleanString(asset.playbackUrl)
    || cleanString(asset.proxyUrl)
    || cleanString(asRecord(asset.proxy).proxyUrl)
    || cleanString(asset.gcsUri);
}

function buildAssetManifest(productionJson: unknown, timelineJson: unknown) {
  const importedMedia = readImportedMedia(productionJson);
  const timelineClips = readTimelineClips(timelineJson);
  const requiredIds = new Set(
    timelineClips
      .map((clip) => cleanString(clip.assetId))
      .filter(Boolean)
      .filter((assetId) => !assetId.startsWith("youtube:")),
  );

  const importedById = new Map(importedMedia.map((asset) => [cleanString(asset.id), asset]));
  const neededAssets = [...requiredIds].map((assetId) => {
    const asset = importedById.get(assetId);
    return {
      assetId,
      found: Boolean(asset),
      originalName: cleanString(asset?.originalName, assetId),
      kind: cleanString(asset?.kind, "unknown"),
      contentType: cleanString(asset?.contentType),
      size: typeof asset?.size === "number" ? asset.size : 0,
      role: cleanString(asset?.importRole),
      url: asset ? assetUrl(asset) : "",
      proxyUrl: cleanString(asRecord(asset?.proxy).proxyUrl),
      syncStatus: cleanString(asRecord(asset?.sync).status),
    };
  });

  return {
    requiredAssetIds: [...requiredIds],
    importedAssetCount: importedMedia.length,
    neededAssets,
    missingAssets: neededAssets.filter((asset) => !asset.found || !asset.url),
  };
}

function prunePresence(collaboration: JsonRecord) {
  const now = Date.now();
  const presence = asRecord(collaboration.presence);
  const activeEntries = Object.entries(presence).filter(([, value]) => {
    const at = Date.parse(cleanString(asRecord(value).lastSeenAt));
    return Number.isFinite(at) && now - at <= PRESENCE_TTL_MS;
  });
  return Object.fromEntries(activeEntries);
}

function activeCollaborators(collaboration: JsonRecord) {
  return Object.values(prunePresence(collaboration))
    .map(asRecord)
    .sort((left, right) => cleanString(right.lastSeenAt).localeCompare(cleanString(left.lastSeenAt)))
    .map((entry) => ({
      email: cleanString(entry.email),
      name: cleanString(entry.name, cleanString(entry.email)),
      app: cleanString(entry.app, "unknown"),
      route: cleanString(entry.route),
      editing: Boolean(entry.editing),
      lastSeenAt: cleanString(entry.lastSeenAt),
    }));
}

function editLease(collaboration: JsonRecord) {
  const lease = asRecord(collaboration.editLease);
  const expiresAt = Date.parse(cleanString(lease.expiresAt));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return {
    email: cleanString(lease.email),
    name: cleanString(lease.name, cleanString(lease.email)),
    acquiredAt: cleanString(lease.acquiredAt),
    expiresAt: cleanString(lease.expiresAt),
    app: cleanString(lease.app, "unknown"),
  };
}

async function resolveActor(request: NextRequest) {
  const session = await auth();
  const macActor = session?.user?.id ? null : resolveMacSessionActor(request);
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
      || session?.user?.email
      || macActor?.primaryEmail
      || macActor?.email,
  );
  return {
    id: cleanString(session?.user?.id || macActor?.id),
    email,
    name: cleanString(session?.user?.name || macActor?.name || email),
    source: session?.user?.id ? "embedded-cookie" : macActor ? macActor.source : "none",
  };
}

async function loadProduction(projectSlug: string, episodeSlug: string, action: "read" | "write", actorEmail: string) {
  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action,
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return { ok: false as const, status: action === "read" ? 404 : 403, error: `You do not have ${action} access to this Nest.` };
  }

  const { project, document } = await lookupStudioProjectDocument(prisma, projectConfig(projectSlug).slug);
  const production = await prisma.studioEpisodeProduction.upsert({
    where: { projectId_slug: { projectId: project.id, slug: episodeSlug } },
    update: {},
    create: {
      projectId: project.id,
      documentId: document.id,
      slug: episodeSlug,
      title: episodeSlug.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      boundaryLabel: episodeSlug,
      boundaryKind: "episode",
      productionJson: {
        projectSlug,
        episodeSlug,
        source: "episode-collaboration.ensure",
      },
    },
  });

  return { ok: true as const, prisma, access, project, document, production };
}

function serializeState(loaded: Extract<Awaited<ReturnType<typeof loadProduction>>, { ok: true }>) {
  const productionJson = asRecord(loaded.production.productionJson);
  const collaboration = asRecord(productionJson.collaboration);
  const manifest = buildAssetManifest(loaded.production.productionJson, loaded.production.timelineJson);
  const timelineClips = readTimelineClips(loaded.production.timelineJson);

  return {
    ok: true,
    projectSlug: loaded.project.slug,
    episodeSlug: loaded.production.slug,
    productionId: loaded.production.id,
    title: loaded.production.title,
    role: loaded.access.role,
    accessSource: loaded.access.source,
    updatedAt: loaded.production.updatedAt.toISOString(),
    timelineFingerprint: readContentFingerprint(loaded.production.timelineJson),
    timelineClipCount: timelineClips.length,
    transcriptBlockCount: asArray(asRecord(loaded.production.transcriptJson).transcript).length,
    assetManifest: manifest,
    activeCollaborators: activeCollaborators(collaboration),
    editLease: editLease(collaboration),
    recommendedPollSeconds: 4,
    guidance: {
      editSync: "Autosave pushes timeline changes to Nest. Idle collaborators pull fresh timeline state every few seconds. Unsaved local edits are never overwritten automatically.",
      assets: "The Mac app should download only needed assets from this manifest. Missing assets can be skipped for now and recovered later.",
      conflicts: "If two people save divergent timelines, the existing fingerprint guard returns a conflict instead of silently overwriting.",
    },
  };
}

export async function GET(request: NextRequest) {
  const projectSlug = cleanSlug(request.nextUrl.searchParams.get("projectSlug"));
  const episodeSlug = cleanSlug(request.nextUrl.searchParams.get("episodeSlug"), "current-episode");
  const actor = await resolveActor(request);

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }
  if (!actor.email) {
    return NextResponse.json({ ok: false, error: "Sign in to read episode collaboration state." }, { status: 401 });
  }

  const loaded = await loadProduction(projectSlug, episodeSlug, "read", actor.email);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });

  return NextResponse.json(serializeState(loaded));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectSlug = cleanSlug(body.projectSlug);
  const episodeSlug = cleanSlug(body.episodeSlug, "current-episode");
  const action = cleanString(body.action, "heartbeat");
  const actor = await resolveActor(request);

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }
  if (!actor.email) {
    return NextResponse.json({ ok: false, error: "Sign in to update episode collaboration state." }, { status: 401 });
  }

  const loaded = await loadProduction(projectSlug, episodeSlug, action === "heartbeat" ? "read" : "write", actor.email);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });

  const productionJson = asRecord(loaded.production.productionJson);
  const collaboration = asRecord(productionJson.collaboration);
  const now = new Date();
  const nowIso = now.toISOString();
  const presence = prunePresence(collaboration);
  const actorKey = actor.email;
  const currentLease = editLease(collaboration);

  presence[actorKey] = {
    email: actor.email,
    name: actorName(actor),
    app: cleanString(body.app, "quipsly-mac"),
    route: cleanString(body.route),
    editing: Boolean(body.editing),
    lastSeenAt: nowIso,
  };

  let nextLease: ReturnType<typeof editLease> | null = currentLease;
  if (action === "claim-edit-lease") {
    if (currentLease && currentLease.email !== actor.email) {
      return NextResponse.json({
        ...serializeState(loaded),
        ok: false,
        mode: "lease-held",
        message: `${currentLease.name || currentLease.email} is currently editing. You can still view; wait or coordinate in chat before taking over.`,
      }, { status: 409 });
    }

    nextLease = {
      email: actor.email,
      name: actorName(actor),
      acquiredAt: nowIso,
      expiresAt: new Date(now.getTime() + EDIT_LEASE_TTL_MS).toISOString(),
      app: cleanString(body.app, "quipsly-mac"),
    };
  } else if (action === "release-edit-lease") {
    nextLease = currentLease?.email === actor.email ? null : currentLease;
  }

  const updated = await loaded.prisma.studioEpisodeProduction.update({
    where: { id: loaded.production.id },
    data: {
      productionJson: {
        ...productionJson,
        collaboration: {
          ...collaboration,
          presence,
          editLease: nextLease,
          lastCollaborationAt: nowIso,
        },
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(serializeState({
    ...loaded,
    production: updated,
  }));
}
