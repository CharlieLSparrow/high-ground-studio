import assert from "node:assert/strict";
import { test } from "node:test";

import { createHgoProjectionReviewGate } from "../apps/web/src/lib/hgo/projection-review-gate.ts";
import { syntheticEpisodeProjection } from "../apps/web/src/lib/hgo/synthetic-episode-projection.ts";
import {
  createEmptyHgoStagedArtifactStoreLabState,
  createHgoStoreLabPromotionCandidate,
  getHgoStoreLabRecordById,
  importHgoArtifactIntoStoreLab,
  listHgoStoreLabRecordsByStatus,
  markHgoStoreLabRecordReviewed,
  archiveHgoStoreLabRecord,
  summarizeHgoStoreLabState,
} from "../apps/web/src/lib/hgo/staged-artifact-store-lab.ts";
import {
  createHgoStagedProjectionArtifact,
} from "../apps/web/src/lib/hgo/staged-projection-artifact.ts";
import { validateHgoEpisodeProjection } from "../apps/web/src/lib/hgo/projection-validation.ts";

function createSyntheticProjection(overrides = {}) {
  return {
    ...syntheticEpisodeProjection,
    ...overrides,
    projectionSource: {
      bridgeVersion: "studio-browser-v1",
      generatedAt: "2026-05-22T12:30:00.000Z",
      sourceFileName: "synthetic-store-lab-test.json",
      ...(overrides.projectionSource ?? {}),
    },
  };
}

function createArtifact({
  projection = createSyntheticProjection(),
  artifactId = "hgo-stage-store-lab-synthetic",
  createdAt = "2026-05-22T12:45:00.000Z",
} = {}) {
  const validation = validateHgoEpisodeProjection(projection);
  const reviewGate = createHgoProjectionReviewGate(projection);

  return createHgoStagedProjectionArtifact({
    projection,
    reviewGate,
    validationWarnings: validation.warnings,
    validationErrors: validation.errors,
    createdAt,
    artifactId,
  });
}

function createArtifactJson(options) {
  return JSON.stringify(createArtifact(options), null, 2);
}

function importSyntheticArtifact() {
  const state = createEmptyHgoStagedArtifactStoreLabState({
    now: "2026-05-22T13:00:00.000Z",
  });

  return importHgoArtifactIntoStoreLab(state, createArtifactJson(), {
    now: "2026-05-22T13:05:00.000Z",
    note: "Synthetic import.",
  });
}

function createCandidateArtifactJson() {
  const projection = createSyntheticProjection({
    id: "synthetic-candidate",
    status: "live",
    visibility: "public",
    slug: "synthetic-candidate",
    title: "Synthetic Candidate Projection",
    audio: {
      ...syntheticEpisodeProjection.audio,
      state: "published",
      placeholderLabel: "Synthetic published audio",
    },
    pullQuotes: syntheticEpisodeProjection.pullQuotes.map((quote) => ({
      ...quote,
      citationState: "verified",
    })),
    sourceNotes: syntheticEpisodeProjection.sourceNotes.map((sourceNote) => ({
      ...sourceNote,
      status: "verified",
    })),
  });

  return createArtifactJson({
    projection,
    artifactId: "hgo-stage-store-lab-candidate",
  });
}

test("empty Store Lab state has no records", () => {
  const state = createEmptyHgoStagedArtifactStoreLabState({
    now: "2026-05-22T13:00:00.000Z",
  });
  const summary = summarizeHgoStoreLabState(state);

  assert.equal(state.labVersion, "hgo-staged-artifact-store-lab-v1");
  assert.equal(summary.totalRecords, 0);
  assert.equal(summary.blocked, 0);
  assert.equal(summary.archived, 0);
});

test("Store Lab imports valid synthetic artifact JSON", () => {
  const result = importSyntheticArtifact();

  assert.equal(result.ok, true);
  assert.equal(result.state.records.length, 1);
  assert.equal(result.record?.reviewStatus, "needs-fixes");
  assert.equal(result.record?.promotionReadiness, "blocked");
  assert.equal(result.record?.artifact.safety.persisted, false);
  assert.equal(result.record?.artifact.safety.published, false);
  assert.equal(result.record?.events[0]?.type, "imported");
});

test("Store Lab rejects invalid artifact JSON", () => {
  const state = createEmptyHgoStagedArtifactStoreLabState();
  const result = importHgoArtifactIntoStoreLab(state, "{not-json");

  assert.equal(result.ok, false);
  assert.equal(result.state.records.length, 0);
  assert.match(result.errors.join("\n"), /Invalid JSON/i);
});

test("Store Lab rejects persisted or published artifacts", () => {
  const persistedArtifact = createArtifact();
  persistedArtifact.safety.persisted = true;
  const publishedArtifact = createArtifact();
  publishedArtifact.safety.published = true;
  const state = createEmptyHgoStagedArtifactStoreLabState();

  const persistedResult = importHgoArtifactIntoStoreLab(
    state,
    JSON.stringify(persistedArtifact),
  );
  const publishedResult = importHgoArtifactIntoStoreLab(
    state,
    JSON.stringify(publishedArtifact),
  );

  assert.equal(persistedResult.ok, false);
  assert.match(persistedResult.errors.join("\n"), /persisted must be false/i);
  assert.equal(publishedResult.ok, false);
  assert.match(publishedResult.errors.join("\n"), /published must be false/i);
});

test("Store Lab duplicate artifactId behavior is explicit", () => {
  const first = importSyntheticArtifact();
  const second = importHgoArtifactIntoStoreLab(
    first.state,
    createArtifactJson(),
    { now: "2026-05-22T13:06:00.000Z" },
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.state.records.length, 1);
  assert.match(second.errors.join("\n"), /already imported/i);
});

test("Store Lab marks records for human review and preserves event log", () => {
  const imported = importSyntheticArtifact();
  const recordId = imported.record.recordId;
  const marked = markHgoStoreLabRecordReviewed(
    imported.state,
    recordId,
    "human-review",
    {
      now: "2026-05-22T13:10:00.000Z",
      note: "Ready for human review.",
    },
  );

  assert.equal(marked.ok, true);
  assert.equal(marked.record?.reviewStatus, "human-review");
  assert.equal(marked.record?.promotionReadiness, "blocked");
  assert.equal(marked.record?.events.length, 2);
  assert.equal(marked.record?.events[0]?.type, "imported");
  assert.equal(marked.record?.events[1]?.type, "marked-reviewed");
});

test("Store Lab marks eligible records approved for future staging", () => {
  const state = createEmptyHgoStagedArtifactStoreLabState({
    now: "2026-05-22T13:00:00.000Z",
  });
  const imported = importHgoArtifactIntoStoreLab(
    state,
    createCandidateArtifactJson(),
    { now: "2026-05-22T13:05:00.000Z" },
  );
  const marked = markHgoStoreLabRecordReviewed(
    imported.state,
    imported.record.recordId,
    "approved-for-future-staging",
    { now: "2026-05-22T13:10:00.000Z" },
  );

  assert.equal(imported.ok, true);
  assert.equal(marked.ok, true);
  assert.equal(marked.record?.reviewStatus, "approved-for-future-staging");
  assert.equal(marked.record?.promotionReadiness, "candidate");
});

test("Store Lab creates simulated promotion candidate only when allowed", () => {
  const blocked = importSyntheticArtifact();
  const blockedCandidate = createHgoStoreLabPromotionCandidate(
    blocked.state,
    blocked.record.recordId,
    { now: "2026-05-22T13:12:00.000Z" },
  );

  assert.equal(blockedCandidate.ok, false);
  assert.match(blockedCandidate.errors.join("\n"), /blocked/i);
  assert.equal(blockedCandidate.record?.simulatedPromotionCandidate, undefined);
  assert.equal(
    blockedCandidate.record?.events.at(-1)?.type,
    "promotion-candidate-blocked",
  );

  const state = createEmptyHgoStagedArtifactStoreLabState({
    now: "2026-05-22T13:00:00.000Z",
  });
  const imported = importHgoArtifactIntoStoreLab(
    state,
    createCandidateArtifactJson(),
    { now: "2026-05-22T13:05:00.000Z" },
  );
  const approved = markHgoStoreLabRecordReviewed(
    imported.state,
    imported.record.recordId,
    "approved-for-future-staging",
    { now: "2026-05-22T13:10:00.000Z" },
  );
  const candidate = createHgoStoreLabPromotionCandidate(
    approved.state,
    approved.record.recordId,
    { now: "2026-05-22T13:12:00.000Z" },
  );

  assert.equal(candidate.ok, true);
  assert.equal(candidate.record?.simulatedPromotionCandidate?.simulatedOnly, true);
  assert.equal(candidate.record?.simulatedPromotionCandidate?.published, false);
  assert.equal(
    candidate.record?.simulatedPromotionCandidate?.publicRouteCreated,
    false,
  );
});

test("Store Lab archives records and summary counts lifecycle states", () => {
  const imported = importSyntheticArtifact();
  const archived = archiveHgoStoreLabRecord(
    imported.state,
    imported.record.recordId,
    {
      now: "2026-05-22T13:20:00.000Z",
      note: "Archive synthetic record.",
    },
  );
  const summary = summarizeHgoStoreLabState(archived.state);

  assert.equal(archived.ok, true);
  assert.equal(archived.record?.reviewStatus, "archived");
  assert.equal(archived.record?.promotionReadiness, "archived");
  assert.equal(archived.record?.artifact.safety.persisted, false);
  assert.equal(archived.record?.artifact.safety.published, false);
  assert.equal(summary.totalRecords, 1);
  assert.equal(summary.activeRecords, 0);
  assert.equal(summary.archived, 1);
});

test("Store Lab record lookup and status grouping are deterministic", () => {
  const imported = importSyntheticArtifact();
  const found = getHgoStoreLabRecordById(
    imported.state,
    imported.record.recordId,
  );
  const byStatus = listHgoStoreLabRecordsByStatus(imported.state);

  assert.equal(found?.recordId, imported.record.recordId);
  assert.equal(byStatus["needs-fixes"].length, 1);
  assert.equal(byStatus.imported.length, 0);
  assert.equal(byStatus.archived.length, 0);
});
