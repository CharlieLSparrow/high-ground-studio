import {
  createHgoEpisodePublishCandidatePacket,
  createHgoEpisodePublishReviewBrief,
  type HgoEpisodePublishCandidateRecord,
} from "./publish-candidate-packet";
import { createHgoEpisodePublishDraftPacket } from "./publish-draft-packet";
import type { HgoStagedProjectionArtifact } from "./staged-projection-artifact";

export type HgoEpisodePublishCandidateStoreSource =
  HgoEpisodePublishCandidateRecord & {
    id: string;
    ownerEmail: string;
    ownerUserId?: string | null;
  };

export type HgoEpisodePublishCandidateStoreRecordInput = {
  ownerUserId?: string | null;
  ownerEmail: string;
  candidateId: string;
  sourceStagedArtifactId: string;
  sourceRecordId: string;
  sourceArtifactId: string;
  sourceArtifactHash: string;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  proposedRoute: string;
  readinessState: string;
  candidateStatus: "private-review";
  packetJson: unknown;
  reviewBriefJson: unknown;
  draftPacketJson: unknown;
  frontmatterJson: unknown;
  mdxDraft: string;
  blockerCount: number;
  warningCount: number;
  containsRealContent: string;
  note: string;
  createdByEmail?: string | null;
};

export type HgoEpisodePublishCandidateStoreRecordBuildResult =
  | {
      ok: true;
      record: HgoEpisodePublishCandidateStoreRecordInput;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

function createCandidateId(recordId: string) {
  return `${recordId}-episode-publish-candidate`;
}

export function buildHgoEpisodePublishCandidateStoreRecordInput({
  artifact,
  createdByEmail,
  record,
  now = new Date().toISOString(),
}: {
  artifact: HgoStagedProjectionArtifact;
  createdByEmail?: string | null;
  record: HgoEpisodePublishCandidateStoreSource;
  now?: string;
}): HgoEpisodePublishCandidateStoreRecordBuildResult {
  const candidate = createHgoEpisodePublishCandidatePacket({
    record,
    createdAt: now,
  });
  const errors: string[] = [];

  if (candidate.readiness.state !== "ready-for-human-publish-review") {
    errors.push(
      `Publish candidate is ${candidate.readiness.state}; expected ready-for-human-publish-review.`,
    );
    errors.push(...candidate.readiness.blockers);
  }

  if (record.archivedAt) {
    errors.push("Archived staged artifacts cannot become publish candidates.");
  }

  if (artifact.artifactId !== record.artifactId) {
    errors.push("Stored artifact JSON does not match the staged artifact record.");
  }

  if (artifact.projection.id !== record.projectionId) {
    errors.push("Stored projection JSON does not match the staged artifact record.");
  }

  if (artifact.safety.published) {
    errors.push("Published staged artifacts cannot be used for private publish intent.");
  }

  if (artifact.safety.persisted) {
    errors.push("Persisted artifact JSON should remain immutable browser-source material.");
  }

  if (errors.length) {
    return {
      ok: false,
      errors,
      warnings: candidate.readiness.warnings,
    };
  }

  const reviewBrief = createHgoEpisodePublishReviewBrief({
    candidate,
    createdAt: now,
  });
  const draftPacket = createHgoEpisodePublishDraftPacket({
    artifact,
    candidate,
    createdAt: now,
  });

  return {
    ok: true,
    record: {
      ownerUserId: record.ownerUserId,
      ownerEmail: record.ownerEmail,
      candidateId: createCandidateId(record.recordId),
      sourceStagedArtifactId: record.id,
      sourceRecordId: record.recordId,
      sourceArtifactId: record.artifactId,
      sourceArtifactHash: record.artifactHash,
      projectionId: record.projectionId,
      projectionSlug: candidate.episodePage.slug,
      projectionTitle: candidate.episodePage.title,
      proposedRoute: candidate.episodePage.proposedRoute,
      readinessState: candidate.readiness.state,
      candidateStatus: "private-review",
      packetJson: candidate,
      reviewBriefJson: reviewBrief,
      draftPacketJson: draftPacket,
      frontmatterJson: draftPacket.frontmatter,
      mdxDraft: draftPacket.mdxDraft,
      blockerCount: candidate.readiness.blockers.length,
      warningCount: candidate.readiness.warnings.length,
      containsRealContent: record.containsRealContent,
      note:
        "Saved private episode publish intent. No public route, content file, provider call, or live publish occurred.",
      createdByEmail,
    },
    warnings: candidate.readiness.warnings,
  };
}
