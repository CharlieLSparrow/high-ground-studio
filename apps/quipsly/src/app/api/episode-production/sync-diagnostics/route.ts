import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { lookupStudioProjectDocument, projectConfig } from "../../../(app)/create/projectConfig";

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

function packetArray(productionJson: Record<string, unknown>) {
  return Array.isArray(productionJson.syncDiagnosticsPackets) ? productionJson.syncDiagnosticsPackets : [];
}

async function ensureProjectAndProduction(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string, episodeSlug: string) {
  const { project, document } = await lookupStudioProjectDocument(prisma, projectConfig(projectSlug).slug);
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
        source: "quipsly-api-sync-diagnostics.create",
        projectSlug: project.slug,
        episodeSlug,
        syncDiagnosticsPackets: [],
      },
    },
  });

  return { production };
}

export async function POST(request: Request) {
  try {
    const body = asRecord(await request.json());
    const rawPacket = asRecord(body.packet ?? body);
    const rawProjectSlug = String(rawPacket.projectSlug ?? body.projectSlug ?? "").trim();

    if (!rawProjectSlug) {
      return NextResponse.json({ ok: false, error: "projectSlug is required in diagnostics packet." }, { status: 400 });
    }

    const projectSlug = sanitizeSegment(rawProjectSlug);
    const episodeSlug = sanitizeSegment(String(rawPacket.episodeSlug ?? body.episodeSlug ?? "current-episode"));
    const importedAt = new Date().toISOString();
    const prisma = getPrismaClient();

    if (!(prisma as any).studioEpisodeProduction) {
      return NextResponse.json({
        ok: false,
        error: "Episode production persistence is not available in this deployment.",
      }, { status: 503 });
    }

    const { production } = await ensureProjectAndProduction(prisma, projectSlug, episodeSlug);
    const currentJson = asRecord(production.productionJson);
    const packet = {
      ...rawPacket,
      projectSlug,
      episodeSlug,
      importedAt,
      importedBy: "quipsly-sync-diagnostics-api",
    };
    const syncDiagnosticsPackets = [packet, ...packetArray(currentJson)].slice(0, 25);
    const productionJson = {
      ...currentJson,
      projectSlug,
      episodeSlug,
      syncDiagnosticsPackets,
      lastSyncDiagnosticsImportedAt: importedAt,
      source: "quipsly-api-sync-diagnostics",
    };

    const updated = await prisma.studioEpisodeProduction.update({
      where: { id: production.id },
      data: { productionJson },
    });

    return NextResponse.json({
      ok: true,
      packetCount: syncDiagnosticsPackets.length,
      importedAt,
      updatedAt: updated.updatedAt?.toISOString?.() ?? importedAt,
    });
  } catch (error) {
    console.error("[episode-production sync-diagnostics] failed", error);
    return NextResponse.json({ ok: false, error: "Failed to import sync diagnostics packet." }, { status: 500 });
  }
}
