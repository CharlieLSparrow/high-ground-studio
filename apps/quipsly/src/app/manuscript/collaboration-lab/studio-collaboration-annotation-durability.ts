export const STUDIO_ANNOTATION_DURABILITY_DECISION_VERSION =
  "studio-annotation-durability-decision-v1";

export type StudioAnnotationDurabilityOption =
  | "annotation-event-log"
  | "checkpoint-metadata"
  | "separate-annotation-store";

export type StudioAnnotationDurabilityCriterion =
  | "preservesSourceText"
  | "supportsRollback"
  | "supportsBranching"
  | "supportsRealTimeCollaboration"
  | "avoidsSnapshotBloat"
  | "keepsManualSnapshotsSacred"
  | "supportsModeration"
  | "supportsAuditTrail"
  | "supportsExport"
  | "implementationComplexity";

export type StudioAnnotationDurabilityCriterionScore = {
  criterion: StudioAnnotationDurabilityCriterion;
  score: number;
  explanation: string;
};

export type StudioAnnotationDurabilityOptionScore = {
  option: StudioAnnotationDurabilityOption;
  label: string;
  summary: string;
  scores: StudioAnnotationDurabilityCriterionScore[];
  totalScore: number;
  primaryStoreRisk: "low" | "medium" | "high";
};

export type StudioAnnotationDurabilityRecommendation = {
  recommendedPrimaryStore: StudioAnnotationDurabilityOption;
  recommendedOperationLog: StudioAnnotationDurabilityOption;
  avoidedPrimaryStore: StudioAnnotationDurabilityOption;
  checkpointMetadataPrimaryStore: false;
  rationale: string[];
  futurePath: string[];
};

export type StudioAnnotationDurabilityDecision = {
  decisionVersion: typeof STUDIO_ANNOTATION_DURABILITY_DECISION_VERSION;
  createdAt: string;
  scope: "synthetic-collaboration-lab";
  currentReviewNoteState: "react-state-only";
  options: StudioAnnotationDurabilityOptionScore[];
  recommendation: StudioAnnotationDurabilityRecommendation;
  safety: {
    syntheticDataOnly: true;
    sourceTextMutation: false;
    persistenceAdded: false;
    serverWrites: false;
    localStorage: false;
    dbSchema: false;
    productionManuscriptEditing: false;
    manualSnapshotMutation: false;
    autosave: false;
  };
  warnings: string[];
};

export type StudioAnnotationDurabilityDecisionValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const annotationDurabilityOptions: StudioAnnotationDurabilityOption[] = [
  "annotation-event-log",
  "checkpoint-metadata",
  "separate-annotation-store",
];

const knownCriteria: StudioAnnotationDurabilityCriterion[] = [
  "preservesSourceText",
  "supportsRollback",
  "supportsBranching",
  "supportsRealTimeCollaboration",
  "avoidsSnapshotBloat",
  "keepsManualSnapshotsSacred",
  "supportsModeration",
  "supportsAuditTrail",
  "supportsExport",
  "implementationComplexity",
];

const forbiddenDecisionMarkers = [
  "learning-to-lead.living",
  "real-manuscript-draft.docx",
  "apps/web/content",
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
  "apps/web/content/publish",
  "localStorageData",
  "sessionStorageData",
  "cookie",
  "auth-storage-state",
  "access_token",
  "refresh_token",
  "id_token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ManuscriptBlock",
  "StoryDraft",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createScore(
  criterion: StudioAnnotationDurabilityCriterion,
  score: number,
  explanation: string,
): StudioAnnotationDurabilityCriterionScore {
  return {
    criterion,
    score,
    explanation,
  };
}

function createOptionScore(input: {
  option: StudioAnnotationDurabilityOption;
  label: string;
  summary: string;
  primaryStoreRisk: StudioAnnotationDurabilityOptionScore["primaryStoreRisk"];
  scores: StudioAnnotationDurabilityCriterionScore[];
}): StudioAnnotationDurabilityOptionScore {
  return {
    ...input,
    totalScore: input.scores.reduce((total, score) => total + score.score, 0),
  };
}

export function listAnnotationDurabilityOptions(): StudioAnnotationDurabilityOption[] {
  return [...annotationDurabilityOptions];
}

export function scoreAnnotationDurabilityOption(
  option: StudioAnnotationDurabilityOption,
): StudioAnnotationDurabilityOptionScore {
  if (option === "annotation-event-log") {
    return createOptionScore({
      option,
      label: "Annotation event log",
      summary:
        "Durable review-note operations are appended as explicit annotation events.",
      primaryStoreRisk: "medium",
      scores: [
        createScore(
          "preservesSourceText",
          5,
          "Events attach to span ids and do not rewrite manuscript text.",
        ),
        createScore(
          "supportsRollback",
          5,
          "Events can be replayed to a chosen annotation version beside a manual snapshot.",
        ),
        createScore(
          "supportsBranching",
          5,
          "Branches can fork from event positions without copying source text.",
        ),
        createScore(
          "supportsRealTimeCollaboration",
          5,
          "Operations map well to collaborative note creation and status changes.",
        ),
        createScore(
          "avoidsSnapshotBloat",
          5,
          "Manual snapshots do not need to carry full comment history.",
        ),
        createScore(
          "keepsManualSnapshotsSacred",
          5,
          "Snapshots can reference annotation versions instead of becoming comment warehouses.",
        ),
        createScore(
          "supportsModeration",
          4,
          "Moderation can process events, though current-state queries need a materialized view.",
        ),
        createScore(
          "supportsAuditTrail",
          5,
          "The event stream is the audit trail.",
        ),
        createScore(
          "supportsExport",
          4,
          "Exports can include either selected events or a materialized note view.",
        ),
        createScore(
          "implementationComplexity",
          3,
          "Requires replay rules and compaction before production use.",
        ),
      ],
    });
  }

  if (option === "checkpoint-metadata") {
    return createOptionScore({
      option,
      label: "Checkpoint metadata",
      summary:
        "Review notes are embedded directly into collaboration checkpoints or manual snapshots.",
      primaryStoreRisk: "high",
      scores: [
        createScore(
          "preservesSourceText",
          4,
          "Notes can stay outside text nodes, but the boundary is easier to blur.",
        ),
        createScore(
          "supportsRollback",
          2,
          "Rollback becomes coupled to whichever comments happened to be in that checkpoint.",
        ),
        createScore(
          "supportsBranching",
          2,
          "Branching copies comment payloads and creates reconciliation pressure.",
        ),
        createScore(
          "supportsRealTimeCollaboration",
          2,
          "Bulk checkpoint payloads are a poor fit for live note operations.",
        ),
        createScore(
          "avoidsSnapshotBloat",
          1,
          "Long review threads would enlarge snapshots quickly.",
        ),
        createScore(
          "keepsManualSnapshotsSacred",
          1,
          "Manual snapshots would become comment warehouses instead of rollback anchors.",
        ),
        createScore(
          "supportsModeration",
          2,
          "Moderation would need to scan snapshot payloads.",
        ),
        createScore(
          "supportsAuditTrail",
          2,
          "Only checkpoint states are retained unless another log exists.",
        ),
        createScore(
          "supportsExport",
          3,
          "Exports are simple, but too tightly coupled to checkpoint shape.",
        ),
        createScore(
          "implementationComplexity",
          4,
          "Easiest to implement, but the simplicity creates product risk.",
        ),
      ],
    });
  }

  return createOptionScore({
    option,
    label: "Separate annotation store",
    summary:
      "Current review-note state is stored separately from source text and snapshots.",
    primaryStoreRisk: "low",
    scores: [
      createScore(
        "preservesSourceText",
        5,
        "Annotations remain linked to spans without mutating manuscript text.",
      ),
      createScore(
        "supportsRollback",
        4,
        "Snapshots can reference annotation state versions instead of embedding comments.",
      ),
      createScore(
        "supportsBranching",
        4,
        "Separate records can track branch or room identity.",
      ),
      createScore(
        "supportsRealTimeCollaboration",
        4,
        "Works well as a materialized current state fed by collaborative events.",
      ),
      createScore(
        "avoidsSnapshotBloat",
        5,
        "Manual snapshots stay focused on manuscript rollback data.",
      ),
      createScore(
        "keepsManualSnapshotsSacred",
        5,
        "Snapshots reference annotation state rather than carrying it by default.",
      ),
      createScore(
        "supportsModeration",
        5,
        "Current annotation records are straightforward to query and moderate.",
      ),
      createScore(
        "supportsAuditTrail",
        4,
        "Needs an operation log for full audit history.",
      ),
      createScore(
        "supportsExport",
        5,
        "Current annotation state can be exported beside a chosen checkpoint.",
      ),
      createScore(
        "implementationComplexity",
        4,
        "More deliberate than checkpoint metadata, but simpler to operate than event replay alone.",
      ),
    ],
  });
}

export function compareAnnotationDurabilityOptions(): StudioAnnotationDurabilityOptionScore[] {
  return listAnnotationDurabilityOptions()
    .map(scoreAnnotationDurabilityOption)
    .sort((first, second) => second.totalScore - first.totalScore);
}

export function recommendAnnotationDurabilityPath(): StudioAnnotationDurabilityRecommendation {
  return {
    recommendedPrimaryStore: "separate-annotation-store",
    recommendedOperationLog: "annotation-event-log",
    avoidedPrimaryStore: "checkpoint-metadata",
    checkpointMetadataPrimaryStore: false,
    rationale: [
      "Review notes should remain annotations attached to spans, not source text mutations.",
      "A separate annotation store is the cleanest current-state model for query, moderation, and export.",
      "An annotation event log should capture collaborative operations and audit history.",
      "Checkpoint metadata should not be the primary note store because it bloats rollback anchors and blurs manual snapshot semantics.",
    ],
    futurePath: [
      "Keep current lab review notes React-only until access control and persistence are designed.",
      "Introduce durable annotation events before production simultaneous editing stores real notes.",
      "Materialize current annotation state in a separate store for review UI and moderation.",
      "Let manual snapshots reference annotation state/version instead of embedding all comment bodies by default.",
    ],
  };
}

export function createAnnotationDurabilityDecisionRecord(): StudioAnnotationDurabilityDecision {
  return {
    decisionVersion: STUDIO_ANNOTATION_DURABILITY_DECISION_VERSION,
    createdAt: nowIso(),
    scope: "synthetic-collaboration-lab",
    currentReviewNoteState: "react-state-only",
    options: compareAnnotationDurabilityOptions(),
    recommendation: recommendAnnotationDurabilityPath(),
    safety: {
      syntheticDataOnly: true,
      sourceTextMutation: false,
      persistenceAdded: false,
      serverWrites: false,
      localStorage: false,
      dbSchema: false,
      productionManuscriptEditing: false,
      manualSnapshotMutation: false,
      autosave: false,
    },
    warnings: [
      "No annotation persistence is added by this decision record.",
      "Review notes remain React-only in the collaboration lab.",
      "Production Manuscript Desk save/load behavior is untouched.",
      "Manual snapshots remain rollback anchors, not comment warehouses.",
    ],
  };
}

export function validateAnnotationDurabilityDecisionRecord(
  record: unknown,
): StudioAnnotationDurabilityDecisionValidation {
  const errors: string[] = [];
  const warnings = [
    "Architecture decision only.",
    "No persistence, server route, schema, or production collaboration behavior is added.",
  ];

  if (!isRecord(record)) {
    return {
      ok: false,
      errors: ["Annotation durability decision record must be an object."],
      warnings,
    };
  }

  if (
    record.decisionVersion !== STUDIO_ANNOTATION_DURABILITY_DECISION_VERSION
  ) {
    errors.push("Decision record version is invalid.");
  }

  if (record.scope !== "synthetic-collaboration-lab") {
    errors.push("Decision record scope must be synthetic-collaboration-lab.");
  }

  if (record.currentReviewNoteState !== "react-state-only") {
    errors.push("Decision record must keep current review notes React-only.");
  }

  if (!Array.isArray(record.options)) {
    errors.push("Decision record options must be an array.");
  } else {
    const optionIds = record.options
      .map((option) => (isRecord(option) ? option.option : null))
      .filter(Boolean);

    for (const option of annotationDurabilityOptions) {
      if (!optionIds.includes(option)) {
        errors.push(`Decision record is missing option ${option}.`);
      }
    }

    for (const optionScore of record.options) {
      if (!isRecord(optionScore)) {
        errors.push("Decision record option score must be an object.");
        continue;
      }

      if (
        !annotationDurabilityOptions.includes(
          optionScore.option as StudioAnnotationDurabilityOption,
        )
      ) {
        errors.push("Decision record option score has an unknown option.");
      }

      if (
        typeof optionScore.totalScore !== "number" ||
        optionScore.totalScore <= 0
      ) {
        errors.push("Decision record option score must have a positive total.");
      }

      if (!Array.isArray(optionScore.scores)) {
        errors.push("Decision record option score must include criteria.");
      } else {
        const criteria = optionScore.scores.map((score) =>
          isRecord(score) ? score.criterion : null,
        );

        for (const criterion of knownCriteria) {
          if (!criteria.includes(criterion)) {
            errors.push(
              `Decision record option ${String(optionScore.option)} is missing ${criterion}.`,
            );
          }
        }
      }
    }
  }

  if (!isRecord(record.recommendation)) {
    errors.push("Decision record recommendation is required.");
  } else {
    if (
      record.recommendation.recommendedPrimaryStore !==
      "separate-annotation-store"
    ) {
      errors.push(
        "Decision record should recommend a separate annotation store as primary current state.",
      );
    }

    if (record.recommendation.recommendedOperationLog !== "annotation-event-log") {
      errors.push(
        "Decision record should recommend an annotation event log for operations.",
      );
    }

    if (record.recommendation.checkpointMetadataPrimaryStore !== false) {
      errors.push("Checkpoint metadata must not be the primary annotation store.");
    }
  }

  if (!isRecord(record.safety)) {
    errors.push("Decision record safety flags are required.");
  } else {
    const expectedSafetyFlags = {
      syntheticDataOnly: true,
      sourceTextMutation: false,
      persistenceAdded: false,
      serverWrites: false,
      localStorage: false,
      dbSchema: false,
      productionManuscriptEditing: false,
      manualSnapshotMutation: false,
      autosave: false,
    };

    for (const [key, expectedValue] of Object.entries(expectedSafetyFlags)) {
      if (record.safety[key] !== expectedValue) {
        errors.push(`Decision record safety.${key} must be ${expectedValue}.`);
      }
    }
  }

  const serialized = JSON.stringify(record);

  for (const marker of forbiddenDecisionMarkers) {
    if (serialized.includes(marker)) {
      errors.push(`Decision record contains forbidden marker: ${marker}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
