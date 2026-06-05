import { NextResponse } from "next/server";

import { HGO_STARTER_PUBLIC_EPISODES, type HgoStarterPublicEpisodePacket } from "@/lib/hgo/starterHgoPublicEpisodes";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_OWNER_EMAIL = "quipsly-publisher@highgroundodyssey.com";
const SOURCE_BRIDGE_VERSION = "quipsly-nest-hgo-public-episodes-v1";

function asJsonInput(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

function routeFor(packet: HgoStarterPublicEpisodePacket) {
  return `/episodes/${packet.slug}`;
}

function publicUrlFor(packet: HgoStarterPublicEpisodePacket) {
  const siteUrl = (process.env.HGO_SITE_URL || "https://highgroundodyssey.com").replace(/\/$/, "");
  return `${siteUrl}${routeFor(packet)}`;
}

function artifactRecordId(packet: HgoStarterPublicEpisodePacket) {
  return `quipsly-hgo-public-${packet.slug}`;
}

async function publishPacket(packet: HgoStarterPublicEpisodePacket, input: { ownerEmail: string; projectSlug: string }) {
  const prisma = getPrismaClient();
  const recordId = artifactRecordId(packet);
  const proposedRoute = routeFor(packet);
  const frontmatter = {
    title: packet.title,
    subtitle: packet.subtitle ?? null,
    episodeNumber: packet.episodeNumber,
    summary: packet.summary,
    slug: packet.slug,
    youtubeId: packet.media.youtubeId ?? null,
    projectSlug: input.projectSlug,
    source: SOURCE_BRIDGE_VERSION,
  };
  const reviewBrief = {
    status: "published",
    source: SOURCE_BRIDGE_VERSION,
    checked: [
      "public packet has no private operator notes",
      "episode page route is deterministic",
      "YouTube embed ID is stored instead of raw player state",
    ],
  };

  const stagedArtifact = await prisma.hgoStagedProjectionArtifact.upsert({
    where: {
      ownerEmail_recordId: {
        ownerEmail: input.ownerEmail,
        recordId,
      },
    },
    update: {
      artifactVersion: packet.packetKind,
      artifactId: packet.id,
      projectionId: packet.id,
      projectionSlug: packet.slug,
      projectionTitle: packet.title,
      projectionStatus: "published",
      projectionVisibility: "public",
      sourceBridgeVersion: SOURCE_BRIDGE_VERSION,
      artifactStatus: "published",
      recommendedNextAction: "live-on-highgroundodyssey",
      reviewStatus: "published",
      promotionReadiness: "published",
      artifactHash: packet.provenance.sourceArtifactHash,
      artifactJson: asJsonInput(packet),
      artifactSummaryJson: asJsonInput(frontmatter),
      eventLogJson: asJsonInput([
        {
          type: "published-from-quipsly-nest",
          at: new Date().toISOString(),
          route: proposedRoute,
          projectSlug: input.projectSlug,
        },
      ]),
      blockerCount: 0,
      warningCount: 0,
      containsRealContent: "true",
      note: "Public starter episode page published from Quipsly Nest.",
      reviewedAt: new Date(),
      reviewedByEmail: input.ownerEmail,
      archivedAt: null,
    },
    create: {
      ownerEmail: input.ownerEmail,
      recordId,
      artifactVersion: packet.packetKind,
      artifactId: packet.id,
      projectionId: packet.id,
      projectionSlug: packet.slug,
      projectionTitle: packet.title,
      projectionStatus: "published",
      projectionVisibility: "public",
      sourceBridgeVersion: SOURCE_BRIDGE_VERSION,
      artifactStatus: "published",
      recommendedNextAction: "live-on-highgroundodyssey",
      reviewStatus: "published",
      promotionReadiness: "published",
      artifactHash: packet.provenance.sourceArtifactHash,
      artifactJson: asJsonInput(packet),
      artifactSummaryJson: asJsonInput(frontmatter),
      eventLogJson: asJsonInput([
        {
          type: "published-from-quipsly-nest",
          at: new Date().toISOString(),
          route: proposedRoute,
          projectSlug: input.projectSlug,
        },
      ]),
      blockerCount: 0,
      warningCount: 0,
      containsRealContent: "true",
      note: "Public starter episode page published from Quipsly Nest.",
      reviewedAt: new Date(),
      reviewedByEmail: input.ownerEmail,
    },
  });

  const candidateId = `candidate-${packet.slug}`;
  const candidate = await prisma.hgoEpisodePublishCandidate.upsert({
    where: {
      ownerEmail_sourceRecordId: {
        ownerEmail: input.ownerEmail,
        sourceRecordId: recordId,
      },
    },
    update: {
      candidateId,
      sourceStagedArtifact: { connect: { id: stagedArtifact.id } },
      sourceArtifactId: packet.id,
      sourceArtifactHash: packet.provenance.sourceArtifactHash,
      projectionId: packet.id,
      projectionSlug: packet.slug,
      projectionTitle: packet.title,
      proposedRoute,
      readinessState: "ready",
      candidateStatus: "published",
      packetJson: asJsonInput(packet),
      reviewBriefJson: asJsonInput(reviewBrief),
      draftPacketJson: asJsonInput(packet),
      frontmatterJson: asJsonInput(frontmatter),
      mdxDraft: packet.essayVersion,
      blockerCount: 0,
      warningCount: 0,
      containsRealContent: "true",
      note: "Published from Quipsly Nest starter episode bridge.",
      createdByEmail: input.ownerEmail,
      approvedAt: new Date(),
      approvedByEmail: input.ownerEmail,
      archivedAt: null,
    },
    create: {
      ownerEmail: input.ownerEmail,
      candidateId,
      sourceStagedArtifact: { connect: { id: stagedArtifact.id } },
      sourceRecordId: recordId,
      sourceArtifactId: packet.id,
      sourceArtifactHash: packet.provenance.sourceArtifactHash,
      projectionId: packet.id,
      projectionSlug: packet.slug,
      projectionTitle: packet.title,
      proposedRoute,
      readinessState: "ready",
      candidateStatus: "published",
      packetJson: asJsonInput(packet),
      reviewBriefJson: asJsonInput(reviewBrief),
      draftPacketJson: asJsonInput(packet),
      frontmatterJson: asJsonInput(frontmatter),
      mdxDraft: packet.essayVersion,
      blockerCount: 0,
      warningCount: 0,
      containsRealContent: "true",
      note: "Published from Quipsly Nest starter episode bridge.",
      createdByEmail: input.ownerEmail,
      approvedAt: new Date(),
      approvedByEmail: input.ownerEmail,
    },
  });

  return {
    id: candidate.id,
    title: packet.title,
    episodeNumber: packet.episodeNumber,
    slug: packet.slug,
    proposedRoute,
    publicUrl: publicUrlFor(packet),
    youtubeUrl: packet.media.youtubeId ? `https://youtu.be/${packet.media.youtubeId}` : null,
    destinations: [
      {
        label: "HighGroundOdyssey.com",
        status: "published",
        url: publicUrlFor(packet),
      },
      ...(packet.media.youtubeId
        ? [{
            label: "YouTube source",
            status: "linked",
            url: `https://youtu.be/${packet.media.youtubeId}`,
          }]
        : []),
      {
        label: "Patreon CTA",
        status: "linked",
        url: process.env.NEXT_PUBLIC_PATREON_URL || "https://www.patreon.com/c/HighGroundOdyssey",
      },
    ],
    candidateStatus: candidate.candidateStatus,
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ownerEmail = typeof body.ownerEmail === "string" && body.ownerEmail.trim()
    ? body.ownerEmail.trim()
    : DEFAULT_OWNER_EMAIL;
  const projectSlug = typeof body.projectSlug === "string" && body.projectSlug.trim()
    ? body.projectSlug.trim()
    : "high-ground-odyssey-manuscript";

  try {
    const episodes = [];
    for (const packet of HGO_STARTER_PUBLIC_EPISODES) {
      episodes.push(await publishPacket(packet, { ownerEmail, projectSlug }));
    }

    return NextResponse.json({
      ok: true,
      source: SOURCE_BRIDGE_VERSION,
      message: "Episodes 1-3 are published to the HGO public episode packet bridge.",
      episodes,
    });
  } catch (error) {
    console.error("Failed to publish HGO starter episodes from Quipsly Nest.", error);
    return NextResponse.json(
      {
        ok: false,
        source: SOURCE_BRIDGE_VERSION,
        message: "Could not publish starter episodes. The static HGO packets may still be available after web deploy.",
      },
      { status: 500 },
    );
  }
}
