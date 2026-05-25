export const HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND =
  "hgo-episode-publish-candidate-v1" as const;
export const HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND =
  "hgo-episode-publish-review-brief-v1" as const;
export const HGO_EPISODE_PUBLISH_OPERATOR_HANDOFF_KIND =
  "hgo-episode-publish-operator-handoff-v1" as const;

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

export type HgoEpisodePublishReviewBrief = {
  packetKind: typeof HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND;
  createdAt: string;
  source: HgoEpisodePublishCandidatePacket["source"] & {
    publishCandidatePacketKind: typeof HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND;
  };
  episodePage: HgoEpisodePublishCandidatePacket["episodePage"];
  reviewState: {
    readinessState: HgoEpisodePublishCandidatePacket["readiness"]["state"];
    blockers: string[];
    warnings: string[];
    requiredHumanActions: string[];
  };
  proposedWork: {
    files: {
      path: string;
      purpose: string;
      status: "proposed-not-created" | "deferred-public-target";
    }[];
    validationCommands: string[];
  };
  safety: {
    createsPublicRoute: false;
    writesContentFiles: false;
    mutatesDatabase: false;
    callsProviders: false;
    publishesLivePage: false;
    certifiesPublicSafety: false;
    mutatesStagedArtifact: false;
    usesImmutableStagedArtifact: true;
  };
  rollback: {
    currentPacketRollback: string;
    futurePublishRollback: string[];
  };
};

export type HgoEpisodePublishOperatorHandoff = {
  packetKind: typeof HGO_EPISODE_PUBLISH_OPERATOR_HANDOFF_KIND;
  createdAt: string;
  source: HgoEpisodePublishCandidatePacket["source"] & {
    publishCandidatePacketKind: typeof HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND;
    publishReviewBriefPacketKind: typeof HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND;
  };
  episodePage: HgoEpisodePublishCandidatePacket["episodePage"];
  readiness: {
    state: HgoEpisodePublishCandidatePacket["readiness"]["state"];
    blockers: string[];
    warnings: string[];
    publicPublishApproval: "required-not-granted";
    approvalStop: string;
  };
  preflight: {
    routeCollisionChecks: string[];
    validationCommands: string[];
    requiredReviewEvidence: string[];
  };
  proposedPromotion: {
    privateReviewSource: string;
    deferredPublicTarget: string;
    route: string;
    publicWriteTargets: string[];
    operatorSteps: string[];
  };
  safety: {
    createsPublicRoute: false;
    writesContentFiles: false;
    mutatesDatabase: false;
    callsProviders: false;
    publishesLivePage: false;
    certifiesCitationReview: false;
    certifiesPublicSafety: false;
    requiresExplicitPublicPublishApproval: true;
  };
  rollback: {
    beforePublicPublish: string[];
    afterPublicPublish: string[];
    currentPacketRollback: string;
  };
};

export type HgoEpisodePublishQueueItem<TRecord extends HgoEpisodePublishCandidateRecord> = {
  record: TRecord;
  packet: HgoEpisodePublishCandidatePacket;
};

export type HgoEpisodePublishQueue<TRecord extends HgoEpisodePublishCandidateRecord> = {
  items: HgoEpisodePublishQueueItem<TRecord>[];
  ready: HgoEpisodePublishQueueItem<TRecord>[];
  notReady: HgoEpisodePublishQueueItem<TRecord>[];
  archived: HgoEpisodePublishQueueItem<TRecord>[];
  totals: {
    all: number;
    ready: number;
    notReady: number;
    archived: number;
    blockers: number;
    warnings: number;
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

export function createHgoEpisodePublishReviewBrief({
  candidate,
  createdAt = candidate.createdAt,
}: {
  candidate: HgoEpisodePublishCandidatePacket;
  createdAt?: string;
}): HgoEpisodePublishReviewBrief {
  const { slug } = candidate.episodePage;

  return {
    packetKind: HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND,
    createdAt,
    source: {
      ...candidate.source,
      publishCandidatePacketKind: candidate.packetKind,
    },
    episodePage: candidate.episodePage,
    reviewState: {
      readinessState: candidate.readiness.state,
      blockers: [...candidate.readiness.blockers],
      warnings: [...candidate.readiness.warnings],
      requiredHumanActions: [...candidate.readiness.requiredHumanActions],
    },
    proposedWork: {
      files: [
        {
          path: `apps/web/content/_staging/hgo/${slug}.json`,
          purpose:
            "Private staging source for the reviewed episode-page projection.",
          status: "proposed-not-created",
        },
        {
          path: `apps/web/content/_staging/hgo/${slug}.mdx`,
          purpose:
            "Private editorial draft if the episode page needs prose before public publishing.",
          status: "proposed-not-created",
        },
        {
          path: `apps/web/content/publish/${slug}.mdx`,
          purpose:
            "Deferred public publishing target after source, quote, route, and rollback review.",
          status: "deferred-public-target",
        },
      ],
      validationCommands: [
        "pnpm hgo:publish-candidate:test",
        "pnpm --filter web build",
        "pnpm --filter web exec next build --webpack",
        "pnpm web:cloudrun:test",
      ],
    },
    safety: {
      createsPublicRoute: false,
      writesContentFiles: false,
      mutatesDatabase: false,
      callsProviders: false,
      publishesLivePage: false,
      certifiesPublicSafety: false,
      mutatesStagedArtifact: false,
      usesImmutableStagedArtifact: true,
    },
    rollback: {
      currentPacketRollback:
        "Delete or ignore this generated brief; it is private planning metadata only.",
      futurePublishRollback: [
        "Record the pre-publish commit SHA before creating any public route.",
        "Keep the staged artifact immutable and restore the previous route/content diff if the public page is backed out.",
        "Record the Cloud Run rollback revision after the future publish deploy.",
      ],
    },
  };
}

export function createHgoEpisodePublishReviewBriefFileName(
  brief: HgoEpisodePublishReviewBrief,
) {
  return `${brief.episodePage.slug}.hgo-episode-publish-review-brief.json`;
}

export function createHgoEpisodePublishOperatorHandoff({
  candidate,
  reviewBrief,
  createdAt = reviewBrief.createdAt,
}: {
  candidate: HgoEpisodePublishCandidatePacket;
  reviewBrief: HgoEpisodePublishReviewBrief;
  createdAt?: string;
}): HgoEpisodePublishOperatorHandoff {
  const { slug, proposedRoute } = candidate.episodePage;
  const privateReviewSource = `apps/web/content/_staging/hgo/${slug}.mdx`;
  const deferredPublicTarget = `apps/web/content/publish/${slug}.mdx`;

  return {
    packetKind: HGO_EPISODE_PUBLISH_OPERATOR_HANDOFF_KIND,
    createdAt,
    source: {
      ...candidate.source,
      publishCandidatePacketKind: candidate.packetKind,
      publishReviewBriefPacketKind: reviewBrief.packetKind,
    },
    episodePage: candidate.episodePage,
    readiness: {
      state: candidate.readiness.state,
      blockers: [...candidate.readiness.blockers],
      warnings: [...candidate.readiness.warnings],
      publicPublishApproval: "required-not-granted",
      approvalStop:
        "Stop here until the owner explicitly approves a public publish action for this exact route and artifact hash.",
    },
    preflight: {
      routeCollisionChecks: [
        `test ! -e ${deferredPublicTarget}`,
        `rg -n "href=\\\"${proposedRoute}\\\"|${proposedRoute}" apps/web/src apps/web/content/publish`,
      ],
      validationCommands: [
        ...reviewBrief.proposedWork.validationCommands,
        "git diff --check",
      ],
      requiredReviewEvidence: [
        "Artifact hash matches the saved staged artifact record.",
        "Citation/source-note review is complete and recorded outside this packet.",
        "Public-safety review is complete and recorded outside this packet.",
        "The proposed route has no collision with existing published content.",
        "Rollback commit or Cloud Run revision is recorded before deployment.",
      ],
    },
    proposedPromotion: {
      privateReviewSource,
      deferredPublicTarget,
      route: proposedRoute,
      publicWriteTargets: [deferredPublicTarget],
      operatorSteps: [
        "Export the private MDX draft and frontmatter from the publish-review detail page.",
        "After explicit approval, create the public content diff in a separate publish change.",
        "Run the preflight commands and both web build paths before deploy.",
        "Record deploy and rollback revisions in a new docs/sessions result note.",
      ],
    },
    safety: {
      createsPublicRoute: false,
      writesContentFiles: false,
      mutatesDatabase: false,
      callsProviders: false,
      publishesLivePage: false,
      certifiesCitationReview: false,
      certifiesPublicSafety: false,
      requiresExplicitPublicPublishApproval: true,
    },
    rollback: {
      beforePublicPublish: [
        "Discard this handoff packet or regenerate it from the saved staged artifact.",
        "Archive or mark the staged artifact needs-fixes if review fails.",
      ],
      afterPublicPublish: [
        `Remove or revert ${deferredPublicTarget}.`,
        "Revert any discovery, route, or metadata diffs from the public publish change.",
        "Roll Cloud Run traffic back to the recorded previous revision if the deploy is already live.",
      ],
      currentPacketRollback:
        "This packet is private handoff metadata only; deleting or ignoring it has no public effect.",
    },
  };
}

export function createHgoEpisodePublishOperatorHandoffFileName(
  handoff: HgoEpisodePublishOperatorHandoff,
) {
  return `${handoff.episodePage.slug}.hgo-episode-publish-operator-handoff.json`;
}

export function createHgoEpisodePublishQueue<
  TRecord extends HgoEpisodePublishCandidateRecord,
>(records: readonly TRecord[]): HgoEpisodePublishQueue<TRecord> {
  const items = records.map((record) => ({
    record,
    packet: createHgoEpisodePublishCandidatePacket({
      record,
      createdAt: record.updatedAt,
    }),
  }));
  const archived = items.filter(
    ({ record }) => Boolean(record.archivedAt) || record.reviewStatus === "archived",
  );
  const active = items.filter((item) => !archived.includes(item));
  const ready = active.filter(
    ({ packet }) => packet.readiness.state === "ready-for-human-publish-review",
  );
  const notReady = active.filter(
    ({ packet }) => packet.readiness.state === "not-ready",
  );

  return {
    items,
    ready,
    notReady,
    archived,
    totals: {
      all: items.length,
      ready: ready.length,
      notReady: notReady.length,
      archived: archived.length,
      blockers: active.reduce(
        (total, item) => total + item.packet.readiness.blockers.length,
        0,
      ),
      warnings: active.reduce(
        (total, item) => total + item.packet.readiness.warnings.length,
        0,
      ),
    },
  };
}
