import { Prisma } from "@prisma/client";

import fs from "node:fs/promises";
import path from "node:path";

import {
  buildHgoEpisodePublishCandidateStoreRecordInput,
  type HgoEpisodePublishCandidateStoreRecordInput,
} from "@/lib/hgo/publish-candidate-store-record";
import { validateHgoStagedProjectionArtifact } from "@/lib/hgo/staged-projection-artifact";
import { prisma } from "@/lib/prisma";
import { HgoPublicEpisodePacket, HGO_PUBLIC_EPISODE_PACKET_KIND, HgoPublicEpisodeIndexEntry } from "@/lib/hgo/public-episode-packet";

export type HgoEpisodePublishCandidateDto = {
  id: string;
  ownerEmail: string;
  candidateId: string;
  sourceRecordId: string;
  sourceArtifactId: string;
  sourceArtifactHash: string;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  proposedRoute: string;
  readinessState: string;
  candidateStatus: string;
  packetJson: Prisma.JsonValue;
  reviewBriefJson: Prisma.JsonValue;
  draftPacketJson: Prisma.JsonValue;
  frontmatterJson: Prisma.JsonValue;
  mdxDraft: string;
  blockerCount: number;
  warningCount: number;
  containsRealContent: string;
  note: string | null;
  createdByEmail: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveHgoEpisodePublishCandidateResult =
  | {
      ok: true;
      created: boolean;
      candidate: HgoEpisodePublishCandidateDto;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

type HgoEpisodePublishCandidateModel = Awaited<
  ReturnType<typeof prisma.hgoEpisodePublishCandidate.findFirst>
> extends infer T
  ? NonNullable<T>
  : never;

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDto(
  record: HgoEpisodePublishCandidateModel,
): HgoEpisodePublishCandidateDto {
  return {
    id: record.id,
    ownerEmail: record.ownerEmail,
    candidateId: record.candidateId,
    sourceRecordId: record.sourceRecordId,
    sourceArtifactId: record.sourceArtifactId,
    sourceArtifactHash: record.sourceArtifactHash,
    projectionId: record.projectionId,
    projectionSlug: record.projectionSlug,
    projectionTitle: record.projectionTitle,
    proposedRoute: record.proposedRoute,
    readinessState: record.readinessState,
    candidateStatus: record.candidateStatus,
    packetJson: record.packetJson,
    reviewBriefJson: record.reviewBriefJson,
    draftPacketJson: record.draftPacketJson,
    frontmatterJson: record.frontmatterJson,
    mdxDraft: record.mdxDraft,
    blockerCount: record.blockerCount,
    warningCount: record.warningCount,
    containsRealContent: record.containsRealContent,
    note: record.note,
    createdByEmail: record.createdByEmail,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    approvedByEmail: record.approvedByEmail,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toCreateData(
  input: HgoEpisodePublishCandidateStoreRecordInput,
): Prisma.HgoEpisodePublishCandidateCreateInput {
  return {
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    candidateId: input.candidateId,
    sourceStagedArtifact: {
      connect: {
        id: input.sourceStagedArtifactId,
      },
    },
    sourceRecordId: input.sourceRecordId,
    sourceArtifactId: input.sourceArtifactId,
    sourceArtifactHash: input.sourceArtifactHash,
    projectionId: input.projectionId,
    projectionSlug: input.projectionSlug,
    projectionTitle: input.projectionTitle,
    proposedRoute: input.proposedRoute,
    readinessState: input.readinessState,
    candidateStatus: input.candidateStatus,
    packetJson: toJsonInput(input.packetJson),
    reviewBriefJson: toJsonInput(input.reviewBriefJson),
    draftPacketJson: toJsonInput(input.draftPacketJson),
    frontmatterJson: toJsonInput(input.frontmatterJson),
    mdxDraft: input.mdxDraft,
    blockerCount: input.blockerCount,
    warningCount: input.warningCount,
    containsRealContent: input.containsRealContent,
    note: input.note,
    createdByEmail: input.createdByEmail,
  };
}

export async function getHgoEpisodePublishCandidateForOwner({
  ownerEmail,
  sourceRecordId,
}: {
  ownerEmail: string;
  sourceRecordId: string;
}) {
  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: {
      ownerEmail_sourceRecordId: {
        ownerEmail,
        sourceRecordId,
      },
    },
  });

  return candidate ? toDto(candidate) : null;
}

export async function listHgoEpisodePublishCandidatesForOwner({
  ownerEmail,
  includeArchived = false,
  take = 25,
}: {
  ownerEmail: string;
  includeArchived?: boolean;
  take?: number;
}) {
  const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
    where: {
      ownerEmail,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ updatedAt: "desc" }],
    take,
  });

  return candidates.map(toDto);
}

export async function saveHgoEpisodePublishCandidateForOwner({
  createdByEmail,
  ownerEmail,
  recordId,
}: {
  createdByEmail: string;
  ownerEmail: string;
  recordId: string;
}): Promise<SaveHgoEpisodePublishCandidateResult> {
  const stagedArtifact = await prisma.hgoStagedProjectionArtifact.findUnique({
    where: {
      ownerEmail_recordId: {
        ownerEmail,
        recordId,
      },
    },
  });

  if (!stagedArtifact) {
    return {
      ok: false,
      errors: ["Staged artifact record was not found."],
      warnings: [],
    };
  }

  const parsedArtifact = validateHgoStagedProjectionArtifact(
    stagedArtifact.artifactJson,
  );

  if (!parsedArtifact.artifact) {
    return {
      ok: false,
      errors: parsedArtifact.errors.length
        ? parsedArtifact.errors
        : ["Stored staged artifact JSON is not valid."],
      warnings: parsedArtifact.warnings,
    };
  }

  const built = buildHgoEpisodePublishCandidateStoreRecordInput({
    artifact: parsedArtifact.artifact,
    createdByEmail,
    record: {
      id: stagedArtifact.id,
      ownerEmail: stagedArtifact.ownerEmail,
      ownerUserId: stagedArtifact.ownerUserId,
      recordId: stagedArtifact.recordId,
      artifactId: stagedArtifact.artifactId,
      projectionId: stagedArtifact.projectionId,
      projectionSlug: stagedArtifact.projectionSlug,
      projectionTitle: stagedArtifact.projectionTitle,
      projectionStatus: stagedArtifact.projectionStatus,
      projectionVisibility: stagedArtifact.projectionVisibility,
      reviewStatus: stagedArtifact.reviewStatus,
      promotionReadiness: stagedArtifact.promotionReadiness,
      artifactHash: stagedArtifact.artifactHash,
      blockerCount: stagedArtifact.blockerCount,
      warningCount: stagedArtifact.warningCount,
      containsRealContent: stagedArtifact.containsRealContent,
      recommendedNextAction: stagedArtifact.recommendedNextAction,
      reviewedAt: stagedArtifact.reviewedAt?.toISOString() ?? null,
      reviewedByEmail: stagedArtifact.reviewedByEmail,
      archivedAt: stagedArtifact.archivedAt?.toISOString() ?? null,
      updatedAt: stagedArtifact.updatedAt.toISOString(),
    },
  });

  if (!built.ok) {
    return built;
  }

  const existing = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: {
      ownerEmail_sourceRecordId: {
        ownerEmail,
        sourceRecordId: built.record.sourceRecordId,
      },
    },
  });

  if (existing) {
    return {
      ok: true,
      created: false,
      candidate: toDto(existing),
      warnings: [
        ...built.warnings,
        "A private publish intent already exists for this staged artifact.",
      ],
    };
  }

  const candidate = await prisma.hgoEpisodePublishCandidate.create({
    data: toCreateData(built.record),
  });

  return {
    ok: true,
    created: true,
    candidate: toDto(candidate),
    warnings: built.warnings,
  };
}

export async function executeHgoEpisodePublishCandidate({
  candidateId,
  executedByEmail,
}: {
  candidateId: string;
  executedByEmail: string;
}) {
  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    return { ok: false, error: "Candidate not found." };
  }

  if (candidate.candidateStatus === "published") {
    return { ok: false, error: "Candidate is already published." };
  }

  if (candidate.archivedAt) {
    return { ok: false, error: "Archived candidates cannot be published." };
  }

  const stagedArtifactRecord = await prisma.hgoStagedProjectionArtifact.findUnique({
    where: { id: candidate.sourceStagedArtifactId },
  });

  if (!stagedArtifactRecord) {
    return { ok: false, error: "Source staged artifact not found." };
  }

  const parsedArtifact = validateHgoStagedProjectionArtifact(stagedArtifactRecord.artifactJson);
  if (!parsedArtifact.ok || !parsedArtifact.artifact) {
    return { ok: false, error: "Source staged artifact JSON is invalid." };
  }

  const projection = parsedArtifact.artifact.projection;

  // Build the public-safe packet
  const publicPacket: HgoPublicEpisodePacket = {
    packetKind: HGO_PUBLIC_EPISODE_PACKET_KIND,
    id: candidate.id,
    slug: candidate.projectionSlug,
    title: projection.title,
    subtitle: projection.hero.eyebrow, // Using eyebrow as subtitle if any
    episodeNumber: projection.episodeNumber,
    summary: projection.summary,
    publishStatus: "live",
    hero: {
      eyebrow: projection.hero.eyebrow,
      colorMood: projection.hero.colorMood,
    },
    media: {
      heroImageUrl: (projection.hero as any).assetUrl || undefined, // Note: assuming assetUrl might be added to hero
      audioUrl: projection.audio.state === "published" ? projection.audio.url : undefined,
    },
    showNotes: {
      beats: projection.beats.map(b => ({
        title: b.title,
        summary: b.summary,
        timingHint: b.timingHint,
      })),
      voiceCards: projection.voiceCards.map(vc => ({
        speaker: vc.speaker,
        summary: vc.summary,
      })),
    },
    quotes: projection.pullQuotes
      .filter(q => q.citationState === "verified")
      .map(q => ({
        text: q.text,
        attribution: q.attribution,
      })),
    essayVersion: candidate.mdxDraft,
    provenance: {
      sourceArtifactHash: candidate.sourceArtifactHash,
      publishedAt: new Date().toISOString(),
    }
  };

  // Determine the file path for the new episode packet
  const contentDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "publish", "hgo-episodes");
  const filePath = path.join(contentDir, `${candidate.projectionSlug}.json`);
  const indexPath = path.join(contentDir, `episodes-index.json`);

  try {
    // Ensure the episodes directory exists
    await fs.mkdir(contentDir, { recursive: true });

    // Write the JSON packet directly to disk
    await fs.writeFile(filePath, JSON.stringify(publicPacket, null, 2), "utf8");

    // Maintain the index
    let index: Record<string, HgoPublicEpisodeIndexEntry> = {};
    try {
      const indexContent = await fs.readFile(indexPath, "utf8");
      index = JSON.parse(indexContent);
    } catch (e) {
      // Index might not exist yet, that's fine
    }

    index[publicPacket.slug] = {
      id: publicPacket.id,
      slug: publicPacket.slug,
      title: publicPacket.title,
      episodeNumber: publicPacket.episodeNumber,
      summary: publicPacket.summary,
      publishedAt: publicPacket.provenance.publishedAt,
    };

    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");

  } catch (error) {
    return { 
      ok: false, 
      error: `Failed to write JSON packet or index to disk: ${error instanceof Error ? error.message : String(error)}` 
    };
  }

  // Update candidate status to published
  const updatedCandidate = await prisma.hgoEpisodePublishCandidate.update({
    where: { id: candidate.id },
    data: {
      candidateStatus: "published",
      note: `Published JSON packet to ${filePath} by ${executedByEmail}.`,
    },
  });

  // Also mark the original staged artifact as published
  await prisma.hgoStagedProjectionArtifact.update({
    where: { id: candidate.sourceStagedArtifactId },
    data: {
      projectionStatus: "published",
    },
  });

  return {
    ok: true,
    candidate: toDto(updatedCandidate),
  };
}
