import assert from "node:assert/strict";
import { test } from "node:test";

import { createHgoProjectionReviewGate } from "../apps/web/src/lib/hgo/projection-review-gate.ts";
import { syntheticEpisodeProjection } from "../apps/web/src/lib/hgo/synthetic-episode-projection.ts";
import {
  createHgoStagedProjectionArtifact,
  createHgoStagedProjectionArtifactFileName,
  listKnownHgoStagedArtifactNextActions,
  listKnownHgoStagedArtifactStatuses,
  parseHgoStagedProjectionArtifactJson,
  summarizeHgoStagedProjectionArtifactImport,
  validateHgoStagedProjectionArtifact,
} from "../apps/web/src/lib/hgo/staged-projection-artifact.ts";
import { validateHgoEpisodeProjection } from "../apps/web/src/lib/hgo/projection-validation.ts";

function createSyntheticArtifact() {
  const projection = {
    ...syntheticEpisodeProjection,
    projectionSource: {
      bridgeVersion: "studio-browser-v1",
      generatedAt: "2026-05-22T12:30:00.000Z",
      sourceFileName: "synthetic-hgo-artifact-test.json",
    },
  };
  const projectionValidation = validateHgoEpisodeProjection(projection);
  const reviewGate = createHgoProjectionReviewGate(projection);

  return createHgoStagedProjectionArtifact({
    projection,
    reviewGate,
    validationWarnings: projectionValidation.warnings,
    validationErrors: projectionValidation.errors,
    createdAt: "2026-05-22T12:45:00.000Z",
    artifactId: "hgo-stage-synthetic-artifact-test",
  });
}

function cloneArtifact() {
  return structuredClone(createSyntheticArtifact());
}

test("known staged artifact contract enums are stable", () => {
  assert.deepEqual(listKnownHgoStagedArtifactStatuses(), [
    "draft",
    "review-blocked",
    "review-ready",
    "live-candidate",
  ]);
  assert.deepEqual(listKnownHgoStagedArtifactNextActions(), [
    "fix-blockers",
    "human-review",
    "candidate-for-future-staging",
    "do-not-use",
  ]);
});

test("synthetic staged artifact validates with warnings and summary", () => {
  const artifact = createSyntheticArtifact();
  const result = validateHgoStagedProjectionArtifact(artifact);

  assert.equal(result.ok, true);
  assert.equal(result.state, "warning");
  assert.equal(result.artifact?.artifactVersion, "hgo-staged-artifact-v1");
  assert.equal(result.summary?.artifactId, artifact.artifactId);
  assert.equal(result.summary?.projectionSlug, artifact.projection.slug);
  assert.equal(result.summary?.persisted, false);
  assert.equal(result.summary?.published, false);
  assert.match(result.warnings.join("\n"), /does not persist/i);
  assert.match(result.warnings.join("\n"), /not source material/i);
});

test("staged artifact JSON parser returns validation state and summary", () => {
  const artifact = createSyntheticArtifact();
  const result = parseHgoStagedProjectionArtifactJson(
    JSON.stringify(artifact, null, 2),
  );

  assert.equal(result.ok, true);
  assert.equal(result.state, "warning");
  assert.equal(result.summary?.artifactVersion, "hgo-staged-artifact-v1");
  assert.equal(result.summary?.containsRealContent, "unknown");
});

test("invalid staged artifact version fails", () => {
  const artifact = cloneArtifact();
  artifact.artifactVersion = "wrong-version";
  const result = validateHgoStagedProjectionArtifact(artifact);

  assert.equal(result.ok, false);
  assert.equal(result.state, "invalid");
  assert.equal(result.artifact, null);
  assert.match(result.errors.join("\n"), /version/i);
});

test("persisted or published staged artifacts fail browser-only validation", () => {
  const persistedArtifact = cloneArtifact();
  persistedArtifact.safety.persisted = true;
  const persistedResult = validateHgoStagedProjectionArtifact(persistedArtifact);

  assert.equal(persistedResult.ok, false);
  assert.match(persistedResult.errors.join("\n"), /persisted must be false/i);

  const publishedArtifact = cloneArtifact();
  publishedArtifact.safety.published = true;
  const publishedResult = validateHgoStagedProjectionArtifact(publishedArtifact);

  assert.equal(publishedResult.ok, false);
  assert.match(publishedResult.errors.join("\n"), /published must be false/i);
});

test("missing projection fails staged artifact validation", () => {
  const artifact = cloneArtifact();
  delete artifact.projection;
  const result = validateHgoStagedProjectionArtifact(artifact);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /projection must be an object/i);
});

test("review gate identity mismatches fail staged artifact validation", () => {
  const artifact = cloneArtifact();
  artifact.reviewGate.projection.slug = "different-slug";
  artifact.reviewGate.projection.title = "Different Title";
  artifact.reviewGate.status = "live";
  artifact.reviewGate.visibility = "public";
  const result = validateHgoStagedProjectionArtifact(artifact);
  const errors = result.errors.join("\n");

  assert.equal(result.ok, false);
  assert.match(errors, /slug/i);
  assert.match(errors, /title/i);
  assert.match(errors, /status/i);
  assert.match(errors, /visibility/i);
});

test("browser storage and credential-like keys fail staged artifact validation", () => {
  const artifact = {
    ...cloneArtifact(),
    cookies: [],
  };
  const result = validateHgoStagedProjectionArtifact(artifact);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /browser storage|cookie|credential/i);
});

test("staged artifact file name is deterministic and safe", () => {
  const artifact = createSyntheticArtifact();
  const fileName = createHgoStagedProjectionArtifactFileName(artifact);

  assert.equal(
    fileName,
    "synthetic-episode-2026-05-22t12-45-00-000z.hgo-staged-artifact.json",
  );
});

test("import summary returns expected staged artifact fields", () => {
  const artifact = createSyntheticArtifact();
  const summary = summarizeHgoStagedProjectionArtifactImport(artifact);

  assert.equal(summary.sourceKind, "browser-import");
  assert.equal(summary.sourceBridgeVersion, "studio-browser-v1");
  assert.equal(summary.projectionStatus, artifact.projection.status);
  assert.equal(summary.projectionVisibility, artifact.projection.visibility);
  assert.equal(summary.validationWarningCount, artifact.validationWarnings.length);
  assert.equal(summary.validationErrorCount, artifact.validationErrors.length);
});
