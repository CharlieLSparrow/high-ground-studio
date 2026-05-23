import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareAnnotationDurabilityOptions,
  createAnnotationDurabilityDecisionRecord,
  listAnnotationDurabilityOptions,
  recommendAnnotationDurabilityPath,
  scoreAnnotationDurabilityOption,
  validateAnnotationDurabilityDecisionRecord,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-annotation-durability.ts";

const expectedOptions = [
  "annotation-event-log",
  "checkpoint-metadata",
  "separate-annotation-store",
];

const forbiddenMarkers = [
  "learning-to-lead.living",
  "real-manuscript-draft.docx",
  "apps/web/content",
  "access_token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ManuscriptBlock",
  "StoryDraft",
];

function scoreFor(option, criterion) {
  const optionScore = scoreAnnotationDurabilityOption(option);
  const criterionScore = optionScore.scores.find(
    (score) => score.criterion === criterion,
  );

  assert.ok(criterionScore, `${option} should score ${criterion}`);

  return criterionScore.score;
}

test("lists all annotation durability options", () => {
  assert.deepEqual(listAnnotationDurabilityOptions().sort(), expectedOptions);
});

test("scores each option with explicit criteria and explanations", () => {
  for (const option of expectedOptions) {
    const optionScore = scoreAnnotationDurabilityOption(option);

    assert.equal(optionScore.option, option);
    assert.equal(optionScore.scores.length, 10);
    assert.ok(optionScore.totalScore > 0);
    assert.ok(optionScore.summary.length > 20);
    assert.ok(
      optionScore.scores.every(
        (score) => score.score >= 1 && score.score <= 5 && score.explanation,
      ),
    );
  }
});

test("checkpoint metadata scores lower for snapshot bloat and manual snapshot risk", () => {
  const checkpoint = scoreAnnotationDurabilityOption("checkpoint-metadata");
  const eventLog = scoreAnnotationDurabilityOption("annotation-event-log");
  const separateStore = scoreAnnotationDurabilityOption(
    "separate-annotation-store",
  );

  assert.equal(checkpoint.primaryStoreRisk, "high");
  assert.equal(scoreFor("checkpoint-metadata", "avoidsSnapshotBloat"), 1);
  assert.equal(scoreFor("checkpoint-metadata", "keepsManualSnapshotsSacred"), 1);
  assert.ok(checkpoint.totalScore < eventLog.totalScore);
  assert.ok(checkpoint.totalScore < separateStore.totalScore);
});

test("annotation event log scores high for audit trail and real-time collaboration", () => {
  assert.equal(scoreFor("annotation-event-log", "supportsAuditTrail"), 5);
  assert.equal(
    scoreFor("annotation-event-log", "supportsRealTimeCollaboration"),
    5,
  );
  assert.equal(scoreFor("annotation-event-log", "supportsRollback"), 5);
});

test("separate annotation store scores high for current-state review work", () => {
  assert.equal(scoreFor("separate-annotation-store", "supportsModeration"), 5);
  assert.equal(scoreFor("separate-annotation-store", "supportsExport"), 5);
  assert.equal(scoreFor("separate-annotation-store", "avoidsSnapshotBloat"), 5);
});

test("recommendation is deterministic and avoids checkpoint metadata as primary store", () => {
  const first = recommendAnnotationDurabilityPath();
  const second = recommendAnnotationDurabilityPath();

  assert.deepEqual(first, second);
  assert.equal(first.recommendedPrimaryStore, "separate-annotation-store");
  assert.equal(first.recommendedOperationLog, "annotation-event-log");
  assert.equal(first.avoidedPrimaryStore, "checkpoint-metadata");
  assert.equal(first.checkpointMetadataPrimaryStore, false);
});

test("decision record validates and carries no persistence flags", () => {
  const record = createAnnotationDurabilityDecisionRecord();
  const validation = validateAnnotationDurabilityDecisionRecord(record);

  assert.equal(validation.ok, true);
  assert.equal(record.safety.persistenceAdded, false);
  assert.equal(record.safety.serverWrites, false);
  assert.equal(record.safety.localStorage, false);
  assert.equal(record.safety.dbSchema, false);
  assert.equal(record.safety.productionManuscriptEditing, false);
  assert.equal(record.safety.manualSnapshotMutation, false);
});

test("decision record contains no real content or secret markers", () => {
  const serialized = JSON.stringify(createAnnotationDurabilityDecisionRecord());

  for (const marker of forbiddenMarkers) {
    assert.equal(serialized.includes(marker), false, marker);
  }
});

test("invalid decision record safety flags fail validation", () => {
  const record = createAnnotationDurabilityDecisionRecord();
  const unsafe = {
    ...record,
    safety: {
      ...record.safety,
      dbSchema: true,
    },
  };
  const validation = validateAnnotationDurabilityDecisionRecord(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join("\n"), /safety\.dbSchema/);
});

test("comparison orders risky checkpoint metadata below the preferred stores", () => {
  const comparison = compareAnnotationDurabilityOptions();

  assert.equal(comparison.at(-1)?.option, "checkpoint-metadata");
  assert.ok(
    comparison.find((score) => score.option === "separate-annotation-store")
      ?.totalScore >
      (comparison.find((score) => score.option === "checkpoint-metadata")
        ?.totalScore ?? 0),
  );
});
