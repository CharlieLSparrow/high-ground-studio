import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHgoStagedArtifactStoreRecordInput } from "../apps/web/src/lib/hgo/staged-artifact-store-record.ts";
import { createHgoProjectionReviewGate } from "../apps/web/src/lib/hgo/projection-review-gate.ts";
import { validateHgoEpisodeProjection } from "../apps/web/src/lib/hgo/projection-validation.ts";
import { syntheticEpisodeProjection } from "../apps/web/src/lib/hgo/synthetic-episode-projection.ts";
import { createHgoStagedProjectionArtifact } from "../apps/web/src/lib/hgo/staged-projection-artifact.ts";
import {
  createHgoEpisodePublishCandidateFileName,
  createHgoEpisodePublishCandidatePacket,
  createHgoEpisodePublishQueue,
  createHgoEpisodePublishReviewBrief,
  createHgoEpisodePublishReviewBriefFileName,
  HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND,
  HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND,
} from "../apps/web/src/lib/hgo/publish-candidate-packet.ts";
import {
  createHgoEpisodePublishDraftFileName,
  createHgoEpisodePublishDraftFrontmatterFileName,
  createHgoEpisodePublishDraftMdxFileName,
  createHgoEpisodePublishDraftPacket,
  HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND,
} from "../apps/web/src/lib/hgo/publish-draft-packet.ts";

function createCandidateProjection(overrides = {}) {
  return {
    ...syntheticEpisodeProjection,
    id: "synthetic-candidate-projection",
    slug: "Synthetic Candidate Projection",
    title: "Synthetic Candidate Projection",
    status: "live",
    visibility: "public",
    audio: {
      ...syntheticEpisodeProjection.audio,
      state: "published",
      placeholderLabel: "Synthetic published audio",
    },
    projectionSource: {
      bridgeVersion: "studio-browser-v1",
      generatedAt: "2026-05-24T12:00:00.000Z",
      sourceFileName: "synthetic-candidate-projection.json",
    },
    ...(overrides ?? {}),
  };
}

function createStoredRecord(overrides = {}) {
  const projection = createCandidateProjection(overrides.projection ?? {});
  const validation = validateHgoEpisodeProjection(projection);
  const reviewGate = createHgoProjectionReviewGate(projection);
  const artifact = createHgoStagedProjectionArtifact({
    projection,
    reviewGate,
    validationWarnings: validation.warnings,
    validationErrors: validation.errors,
    createdAt: "2026-05-24T12:05:00.000Z",
    artifactId: "synthetic-candidate-artifact",
  });
  const built = buildHgoStagedArtifactStoreRecordInput({
    artifactJson: JSON.stringify(artifact),
    ownerEmail: "charlie@example.test",
    ownerUserId: "user-synthetic",
    now: "2026-05-24T12:10:00.000Z",
  });

  assert.equal(built.ok, true);

  return {
    ...built.record,
    id: "synthetic-db-id",
    reviewStatus: "approved-for-future-staging",
    promotionReadiness: "candidate",
    blockerCount: 0,
    warningCount: 0,
    containsRealContent: "false",
    eventCount: 1,
    reviewedAt: "2026-05-24T12:15:00.000Z",
    reviewedByEmail: "charlie@example.test",
    archivedAt: null,
    createdAt: "2026-05-24T12:10:00.000Z",
    updatedAt: "2026-05-24T12:15:00.000Z",
    ...(overrides.record ?? {}),
  };
}

function createArtifactAndRecord(overrides = {}) {
  const projection = createCandidateProjection(overrides.projection ?? {});
  const validation = validateHgoEpisodeProjection(projection);
  const reviewGate = createHgoProjectionReviewGate(projection);
  const artifact = createHgoStagedProjectionArtifact({
    projection,
    reviewGate,
    validationWarnings: validation.warnings,
    validationErrors: validation.errors,
    createdAt: "2026-05-24T12:05:00.000Z",
    artifactId: "synthetic-candidate-artifact",
  });
  const built = buildHgoStagedArtifactStoreRecordInput({
    artifactJson: JSON.stringify(artifact),
    ownerEmail: "charlie@example.test",
    ownerUserId: "user-synthetic",
    now: "2026-05-24T12:10:00.000Z",
  });

  assert.equal(built.ok, true);

  return {
    artifact,
    record: {
      ...built.record,
      id: "synthetic-db-id",
      reviewStatus: "approved-for-future-staging",
      promotionReadiness: "candidate",
      blockerCount: 0,
      warningCount: 0,
      containsRealContent: "false",
      eventCount: 1,
      reviewedAt: "2026-05-24T12:15:00.000Z",
      reviewedByEmail: "charlie@example.test",
      archivedAt: null,
      createdAt: "2026-05-24T12:10:00.000Z",
      updatedAt: "2026-05-24T12:15:00.000Z",
      ...(overrides.record ?? {}),
    },
  };
}

test("creates a private publish-candidate packet for approved HGO artifacts", () => {
  const packet = createHgoEpisodePublishCandidatePacket({
    record: createStoredRecord(),
    createdAt: "2026-05-24T12:20:00.000Z",
  });

  assert.equal(packet.packetKind, HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND);
  assert.equal(packet.episodePage.slug, "synthetic-candidate-projection");
  assert.equal(packet.episodePage.proposedRoute, "/episodes/synthetic-candidate-projection");
  assert.equal(packet.readiness.state, "ready-for-human-publish-review");
  assert.deepEqual(packet.readiness.blockers, []);
  assert.equal(packet.safety.createsPublicRoute, false);
  assert.equal(packet.safety.mutatesDatabase, false);
  assert.equal(packet.safety.callsProviders, false);
  assert.equal(packet.safety.certifiesPublicSafety, false);
  assert.equal(packet.safety.usesImmutableStagedArtifact, true);
  assert.equal(
    createHgoEpisodePublishCandidateFileName(packet),
    "synthetic-candidate-projection.hgo-episode-publish-candidate.json",
  );
});

test("keeps non-candidate artifacts blocked from publish review", () => {
  const packet = createHgoEpisodePublishCandidatePacket({
    record: createStoredRecord({
      record: {
        reviewStatus: "human-review",
        promotionReadiness: "review-needed",
        blockerCount: 1,
      },
    }),
    createdAt: "2026-05-24T12:20:00.000Z",
  });

  assert.equal(packet.readiness.state, "not-ready");
  assert.match(
    packet.readiness.blockers.join("\n"),
    /expected approved-for-future-staging/,
  );
  assert.match(packet.readiness.blockers.join("\n"), /expected candidate/);
  assert.match(packet.readiness.blockers.join("\n"), /1 blocker/);
  assert.equal(packet.safety.createsPublicRoute, false);
});

test("creates a private publish-review brief from a candidate packet", () => {
  const candidate = createHgoEpisodePublishCandidatePacket({
    record: createStoredRecord({
      record: {
        reviewStatus: "needs-fixes",
        promotionReadiness: "blocked",
        blockerCount: 1,
      },
    }),
    createdAt: "2026-05-24T12:20:00.000Z",
  });
  const brief = createHgoEpisodePublishReviewBrief({
    candidate,
    createdAt: "2026-05-24T12:25:00.000Z",
  });

  assert.equal(brief.packetKind, HGO_EPISODE_PUBLISH_REVIEW_BRIEF_KIND);
  assert.equal(brief.createdAt, "2026-05-24T12:25:00.000Z");
  assert.equal(
    brief.source.publishCandidatePacketKind,
    HGO_EPISODE_PUBLISH_CANDIDATE_PACKET_KIND,
  );
  assert.equal(brief.episodePage.proposedRoute, "/episodes/synthetic-candidate-projection");
  assert.equal(brief.reviewState.readinessState, "not-ready");
  assert.match(
    brief.reviewState.blockers.join("\n"),
    /expected approved-for-future-staging/,
  );
  assert.equal(brief.safety.createsPublicRoute, false);
  assert.equal(brief.safety.writesContentFiles, false);
  assert.equal(brief.safety.mutatesDatabase, false);
  assert.equal(brief.safety.callsProviders, false);
  assert.equal(brief.safety.publishesLivePage, false);
  assert.equal(brief.safety.certifiesPublicSafety, false);
  assert.equal(brief.safety.mutatesStagedArtifact, false);
  assert.equal(brief.safety.usesImmutableStagedArtifact, true);
  assert.ok(
    brief.proposedWork.files.some((file) =>
      file.path.includes("synthetic-candidate-projection"),
    ),
  );
  assert.equal(
    createHgoEpisodePublishReviewBriefFileName(brief),
    "synthetic-candidate-projection.hgo-episode-publish-review-brief.json",
  );
});

test("creates a private publish-draft packet without public side effects", () => {
  const { artifact, record } = createArtifactAndRecord();
  const candidate = createHgoEpisodePublishCandidatePacket({
    record,
    createdAt: "2026-05-24T12:20:00.000Z",
  });
  const packet = createHgoEpisodePublishDraftPacket({
    artifact,
    candidate,
    createdAt: "2026-05-24T12:30:00.000Z",
  });

  assert.equal(packet.packetKind, HGO_EPISODE_PUBLISH_DRAFT_PACKET_KIND);
  assert.equal(packet.createdAt, "2026-05-24T12:30:00.000Z");
  assert.equal(packet.episodePage.proposedRoute, "/episodes/synthetic-candidate-projection");
  assert.equal(
    packet.proposedFiles.privateDraftPath,
    "apps/web/content/_staging/hgo/synthetic-candidate-projection.mdx",
  );
  assert.equal(
    packet.proposedFiles.deferredPublicPath,
    "apps/web/content/publish/synthetic-candidate-projection.mdx",
  );
  assert.equal(packet.frontmatter.access, "private-review");
  assert.equal(packet.frontmatter.status, "draft");
  assert.equal(packet.frontmatter.citationReview, "not-certified");
  assert.equal(packet.frontmatter.publicSafetyReview, "not-certified");
  assert.match(packet.mdxDraft, /# Synthetic Candidate Projection/);
  assert.match(packet.mdxDraft, /## Episode Beats/);
  assert.match(packet.mdxDraft, /Citation review and public-safety review are not certified/);
  assert.equal(packet.safety.writesContentFiles, false);
  assert.equal(packet.safety.createsPublicRoute, false);
  assert.equal(packet.safety.publishesLivePage, false);
  assert.equal(packet.safety.mutatesDatabase, false);
  assert.equal(packet.safety.callsProviders, false);
  assert.equal(packet.safety.certifiesCitationReview, false);
  assert.equal(packet.safety.certifiesPublicSafety, false);
  assert.equal(packet.safety.mutatesStagedArtifact, false);
  assert.equal(
    createHgoEpisodePublishDraftFileName(packet),
    "synthetic-candidate-projection.hgo-episode-publish-draft.json",
  );
  assert.equal(
    createHgoEpisodePublishDraftMdxFileName(packet),
    "synthetic-candidate-projection.private-review.mdx",
  );
  assert.equal(
    createHgoEpisodePublishDraftFrontmatterFileName(packet),
    "synthetic-candidate-projection.frontmatter.json",
  );
});

test("warns when real content or non-public lifecycle state needs human review", () => {
  const packet = createHgoEpisodePublishCandidatePacket({
    record: createStoredRecord({
      record: {
        containsRealContent: "true",
        projectionStatus: "staged",
        projectionVisibility: "team",
        warningCount: 2,
      },
    }),
    createdAt: "2026-05-24T12:20:00.000Z",
  });

  assert.equal(packet.readiness.state, "ready-for-human-publish-review");
  assert.match(packet.readiness.warnings.join("\n"), /2 warning/);
  assert.match(packet.readiness.warnings.join("\n"), /real content/);
  assert.match(packet.readiness.warnings.join("\n"), /visibility is team/);
  assert.match(packet.readiness.warnings.join("\n"), /status is staged/);
});

test("summarizes a private episode publish queue from staged records", () => {
  const queue = createHgoEpisodePublishQueue([
    createStoredRecord(),
    createStoredRecord({
      record: {
        recordId: "synthetic-blocked-record",
        reviewStatus: "needs-fixes",
        promotionReadiness: "blocked",
        blockerCount: 2,
      },
    }),
    createStoredRecord({
      record: {
        recordId: "synthetic-archived-record",
        reviewStatus: "archived",
        promotionReadiness: "archived",
        archivedAt: "2026-05-24T12:30:00.000Z",
      },
    }),
  ]);

  assert.equal(queue.totals.all, 3);
  assert.equal(queue.totals.ready, 1);
  assert.equal(queue.totals.notReady, 1);
  assert.equal(queue.totals.archived, 1);
  assert.equal(queue.totals.blockers, 3);
  assert.equal(queue.ready[0].packet.episodePage.proposedRoute, "/episodes/synthetic-candidate-projection");
  assert.equal(queue.notReady[0].record.recordId, "synthetic-blocked-record");
  assert.equal(queue.archived[0].record.recordId, "synthetic-archived-record");
});
