export const HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND =
  "hgo-episode-publish-candidate-v1" as const;

export type HgoEpisodePublishCandidateRecord = {
  recordId: string;
  artifactId: string;
  projectionId: string;
  projectionSlug: string;
  projectionTitle: string;
  projectionStatus: string;
  projectionVisibility: string;
  reviewStatus: string;
  promotionReadiness: string;
  artifactHash: string;
  blockerCount: number;
  warningCount: number;
  containsRealContent: string;
  recommendedNextAction: string;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type HgoEpisodePublishCandidatePacket = {
  packetKind: typeof HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND;
  createdAt: string;
  source: {
    recordId: string;
    artifactId: string;
    artifactHash: string;
    projectionId: string;
  };
  episodePage: {
    title: string;
    slug: string;
    proposedRoute: string;
    currentProjectionStatus: string;
    currentProjectionVisibility: string;
  };
  readiness: {
    state: "ready-for-human-publish-review" | "not-ready";
    blockers: string[];
    warnings: string[];
    requiredHumanActions: string[];
  };
  safety: {
    createsPublicRoute: false;
    mutatesDatabase: false;
    callsProviders: false;
    certifiesPublicSafety: false;
    usesImmutableStagedArtifact: true;
  };
  rollback: {
    publicRollbackRequired: false;
    artifactRollback: "archive-staged-artifact-or-mark-needs-fixes";
    notes: string[];
  };
};

function normalizeSlug(slug: string) {
  return (
    slug
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, "")
      .replace(/^episodes\//, "")
      .replace(/[^a-z0-9/-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/\/{2,}/g, "/")
      .replace(/^-+|-+$/g, "") || "pending-episode-slug"
  );
}

function containsRealContentFlag(value: string) {
  return ["true", "yes", "1"].includes(value.trim().toLowerCase());
}

export function createHgoEpisodePublishCandidatePacket({
  record,
  createdAt = new Date().toISOString(),
}: {
  record: HgoEpisodePublishCandidateRecord;
  createdAt?: string;
}): HgoEpisodePublishCandidatePacket {
  const slug = normalizeSlug(record.projectionSlug);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredHumanActions = [
    "Open the saved staged artifact and confirm the embedded projection still matches the intended episode page.",
    "Complete citation, source-note, and public-safety review before any public route is created.",
    "Choose the final public route and record the rollback target before publishing.",
  ];

  if (record.archivedAt || record.reviewStatus === "archived") {
    blockers.push("This staged artifact is archived.");
  }

  if (record.reviewStatus !== "approved-for-future-staging") {
    blockers.push(
      `Review status is ${record.reviewStatus}; expected approved-for-future-staging.`,
    );
  }

  if (record.promotionReadiness !== "candidate") {
    blockers.push(
      `Promotion readiness is ${record.promotionReadiness}; expected candidate.`,
    );
  }

  if (record.blockerCount > 0) {
    blockers.push(`Review gate still reports ${record.blockerCount} blocker(s).`);
  }

  if (record.recommendedNextAction === "do-not-use") {
    blockers.push("The staged artifact recommends do-not-use.");
  }

  if (record.warningCount > 0) {
    warnings.push(`Review gate still reports ${record.warningCount} warning(s).`);
  }

  if (containsRealContentFlag(record.containsRealContent)) {
    warnings.push(
      "Artifact indicates real content is present; require source, quote, and rights review before public publishing.",
    );
  }

  if (record.projectionVisibility !== "public") {
    warnings.push(
      `Projection visibility is ${record.projectionVisibility}; choose final public visibility deliberately.`,
    );
  }

  if (record.projectionStatus !== "live") {
    warnings.push(
      `Projection status is ${record.projectionStatus}; choose the final public lifecycle state deliberately.`,
    );
  }

  return {
    packetKind: HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND,
    createdAt,
    source: {
      recordId: record.recordId,
      artifactId: record.artifactId,
      artifactHash: record.artifactHash,
      projectionId: record.projectionId,
    },
    episodePage: {
      title: record.projectionTitle,
      slug,
      proposedRoute: `/episodes/${slug}`,
      currentProjectionStatus: record.projectionStatus,
      currentProjectionVisibility: record.projectionVisibility,
    },
    readiness: {
      state: blockers.length ? "not-ready" : "ready-for-human-publish-review",
      blockers,
      warnings,
      requiredHumanActions,
    },
    safety: {
      createsPublicRoute: false,
      mutatesDatabase: false,
      callsProviders: false,
      certifiesPublicSafety: false,
      usesImmutableStagedArtifact: true,
    },
    rollback: {
      publicRollbackRequired: false,
      artifactRollback: "archive-staged-artifact-or-mark-needs-fixes",
      notes: [
        "This packet is private planning metadata only.",
        "No public page, database mutation, provider call, or route file is created by generating it.",
      ],
    },
  };
}

export function createHgoEpisodePublishCandidateFileName(
  packet: HgoEpisodePublishCandidatePacket,
) {
  return `${packet.episodePage.slug}.hgo-episode-publish-candidate.json`;
}
