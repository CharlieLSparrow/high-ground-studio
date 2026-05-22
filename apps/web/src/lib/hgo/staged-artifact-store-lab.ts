import type {
  HgoStagedProjectionArtifact,
  HgoStagedProjectionArtifactImportSummary,
} from "./staged-projection-artifact";
import { parseHgoStagedProjectionArtifactJson } from "./staged-projection-artifact";

export type HgoStagedArtifactReviewStatus =
  | "imported"
  | "needs-fixes"
  | "human-review"
  | "approved-for-future-staging"
  | "archived";

export type HgoStagedArtifactPromotionReadiness =
  | "blocked"
  | "review-needed"
  | "candidate"
  | "archived";

export type HgoStagedArtifactStoreEventType =
  | "imported"
  | "marked-reviewed"
  | "promotion-candidate-created"
  | "promotion-candidate-blocked"
  | "archived";

export type HgoStagedArtifactStoreEvent = {
  eventId: string;
  type: HgoStagedArtifactStoreEventType;
  createdAt: string;
  reviewStatus: HgoStagedArtifactReviewStatus;
  promotionReadiness: HgoStagedArtifactPromotionReadiness;
  note: string;
};

export type HgoStagedArtifactPromotionCandidate = {
  candidateId: string;
  createdAt: string;
  note: string;
  simulatedOnly: true;
  published: false;
  publicRouteCreated: false;
};

export type HgoStagedArtifactStoreRecord = {
  recordId: string;
  artifact: HgoStagedProjectionArtifact;
  artifactSummary: HgoStagedProjectionArtifactImportSummary;
  artifactHash: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  reviewStatus: HgoStagedArtifactReviewStatus;
  promotionReadiness: HgoStagedArtifactPromotionReadiness;
  note: string;
  simulatedPromotionCandidate?: HgoStagedArtifactPromotionCandidate;
  events: HgoStagedArtifactStoreEvent[];
};

export type HgoStagedArtifactStoreState = {
  labVersion: "hgo-staged-artifact-store-lab-v1";
  createdAt: string;
  updatedAt: string;
  records: HgoStagedArtifactStoreRecord[];
};

export type HgoStagedArtifactStoreAction =
  | {
      type: "import-artifact";
      artifactJson: string;
      note?: string;
      now?: string;
    }
  | {
      type: "archive-record";
      recordId: string;
      note?: string;
      now?: string;
    }
  | {
      type: "mark-reviewed";
      recordId: string;
      reviewStatus: HgoStagedArtifactReviewStatus;
      note?: string;
      now?: string;
    }
  | {
      type: "create-promotion-candidate";
      recordId: string;
      note?: string;
      now?: string;
    };

export type HgoStagedArtifactStoreLabResult = {
  ok: boolean;
  state: HgoStagedArtifactStoreState;
  record: HgoStagedArtifactStoreRecord | null;
  errors: string[];
  warnings: string[];
};

export type HgoStagedArtifactStoreLabSummary = {
  totalRecords: number;
  activeRecords: number;
  blocked: number;
  reviewNeeded: number;
  candidate: number;
  archived: number;
  simulatedPromotionCandidates: number;
};

export type HgoStagedArtifactStoreRecordsByStatus = Record<
  HgoStagedArtifactReviewStatus,
  HgoStagedArtifactStoreRecord[]
>;

type StoreLabMetadata = {
  now?: string;
  note?: string;
};

const reviewStatuses: HgoStagedArtifactReviewStatus[] = [
  "imported",
  "needs-fixes",
  "human-review",
  "approved-for-future-staging",
  "archived",
];

function getTimestamp(now?: string) {
  return now ?? new Date().toISOString();
}

function cloneArtifact(artifact: HgoStagedProjectionArtifact) {
  return JSON.parse(JSON.stringify(artifact)) as HgoStagedProjectionArtifact;
}

function createStableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createRecordId(artifact: HgoStagedProjectionArtifact, hash: string) {
  const artifactId = normalizeIdPart(artifact.artifactId);

  return `hgo-store-lab-${artifactId || "artifact"}-${hash.slice(0, 8)}`;
}

function createEvent({
  record,
  type,
  now,
  note,
  reviewStatus,
  promotionReadiness,
}: {
  record: Pick<HgoStagedArtifactStoreRecord, "recordId" | "events">;
  type: HgoStagedArtifactStoreEventType;
  now: string;
  note: string;
  reviewStatus: HgoStagedArtifactReviewStatus;
  promotionReadiness: HgoStagedArtifactPromotionReadiness;
}): HgoStagedArtifactStoreEvent {
  return {
    eventId: `${record.recordId}-${type}-${record.events.length + 1}`,
    type,
    createdAt: now,
    reviewStatus,
    promotionReadiness,
    note,
  };
}

function getInitialReviewStatus(
  artifact: HgoStagedProjectionArtifact,
): HgoStagedArtifactReviewStatus {
  if (
    artifact.reviewGate.blockerCount > 0 ||
    artifact.status === "draft" ||
    artifact.status === "review-blocked" ||
    artifact.recommendedNextAction === "fix-blockers" ||
    artifact.recommendedNextAction === "do-not-use"
  ) {
    return "needs-fixes";
  }

  return "imported";
}

function getPromotionReadiness({
  artifact,
  reviewStatus,
}: {
  artifact: HgoStagedProjectionArtifact;
  reviewStatus: HgoStagedArtifactReviewStatus;
}): HgoStagedArtifactPromotionReadiness {
  if (reviewStatus === "archived") {
    return "archived";
  }

  if (
    artifact.reviewGate.blockerCount > 0 ||
    artifact.recommendedNextAction === "do-not-use" ||
    reviewStatus === "needs-fixes"
  ) {
    return "blocked";
  }

  if (reviewStatus === "approved-for-future-staging") {
    return "candidate";
  }

  return "review-needed";
}

function updateRecord(
  state: HgoStagedArtifactStoreState,
  record: HgoStagedArtifactStoreRecord,
) {
  return {
    ...state,
    updatedAt: record.updatedAt,
    records: state.records.map((existingRecord) =>
      existingRecord.recordId === record.recordId ? record : existingRecord,
    ),
  };
}

export function createEmptyHgoStagedArtifactStoreLabState(
  metadata: StoreLabMetadata = {},
): HgoStagedArtifactStoreState {
  const now = getTimestamp(metadata.now);

  return {
    labVersion: "hgo-staged-artifact-store-lab-v1",
    createdAt: now,
    updatedAt: now,
    records: [],
  };
}

export function importHgoArtifactIntoStoreLab(
  state: HgoStagedArtifactStoreState,
  artifactJson: string,
  metadata: StoreLabMetadata = {},
): HgoStagedArtifactStoreLabResult {
  const validation = parseHgoStagedProjectionArtifactJson(artifactJson);

  if (!validation.ok || !validation.artifact || !validation.summary) {
    return {
      ok: false,
      state,
      record: null,
      errors: validation.errors.length
        ? validation.errors
        : ["Artifact JSON did not pass staged artifact validation."],
      warnings: validation.warnings,
    };
  }

  const duplicate = state.records.find(
    (record) =>
      record.artifact.artifactId === validation.artifact?.artifactId &&
      record.reviewStatus !== "archived",
  );

  if (duplicate) {
    return {
      ok: false,
      state,
      record: duplicate,
      errors: [
        `Artifact ${validation.artifact.artifactId} is already imported in this session store lab.`,
      ],
      warnings: validation.warnings,
    };
  }

  const now = getTimestamp(metadata.now);
  const artifact = cloneArtifact(validation.artifact);
  const artifactHash = createStableHash(JSON.stringify(artifact));
  const reviewStatus = getInitialReviewStatus(artifact);
  const promotionReadiness = getPromotionReadiness({
    artifact,
    reviewStatus,
  });
  const recordSeed = {
    recordId: createRecordId(artifact, artifactHash),
    events: [] as HgoStagedArtifactStoreEvent[],
  };
  const note =
    metadata.note ??
    "Imported into browser session store lab. No persistence or publish action occurred.";
  const event = createEvent({
    record: recordSeed,
    type: "imported",
    now,
    note,
    reviewStatus,
    promotionReadiness,
  });
  const record: HgoStagedArtifactStoreRecord = {
    recordId: recordSeed.recordId,
    artifact,
    artifactSummary: validation.summary,
    artifactHash,
    createdAt: now,
    updatedAt: now,
    reviewStatus,
    promotionReadiness,
    note,
    events: [event],
  };

  return {
    ok: true,
    state: {
      ...state,
      updatedAt: now,
      records: [...state.records, record],
    },
    record,
    errors: [],
    warnings: validation.warnings,
  };
}

export function getHgoStoreLabRecordById(
  state: HgoStagedArtifactStoreState,
  recordId: string,
) {
  return state.records.find((record) => record.recordId === recordId) ?? null;
}

export function markHgoStoreLabRecordReviewed(
  state: HgoStagedArtifactStoreState,
  recordId: string,
  reviewStatus: HgoStagedArtifactReviewStatus,
  metadata: StoreLabMetadata = {},
): HgoStagedArtifactStoreLabResult {
  const record = getHgoStoreLabRecordById(state, recordId);

  if (!record) {
    return {
      ok: false,
      state,
      record: null,
      errors: [`Record ${recordId} was not found in the session store lab.`],
      warnings: [],
    };
  }

  if (!reviewStatuses.includes(reviewStatus)) {
    return {
      ok: false,
      state,
      record,
      errors: [`Review status ${reviewStatus} is not supported.`],
      warnings: [],
    };
  }

  if (reviewStatus === "archived") {
    return archiveHgoStoreLabRecord(state, recordId, metadata);
  }

  if (record.reviewStatus === "archived") {
    return {
      ok: false,
      state,
      record,
      errors: ["Archived records cannot be moved back into review in the lab."],
      warnings: [],
    };
  }

  const now = getTimestamp(metadata.now);
  const promotionReadiness = getPromotionReadiness({
    artifact: record.artifact,
    reviewStatus,
  });
  const note = metadata.note ?? `Review status marked ${reviewStatus}.`;
  const nextRecord: HgoStagedArtifactStoreRecord = {
    ...record,
    updatedAt: now,
    reviewStatus,
    promotionReadiness,
    note,
    events: [
      ...record.events,
      createEvent({
        record,
        type: "marked-reviewed",
        now,
        note,
        reviewStatus,
        promotionReadiness,
      }),
    ],
  };

  return {
    ok: true,
    state: updateRecord(state, nextRecord),
    record: nextRecord,
    errors: [],
    warnings: [],
  };
}

export function archiveHgoStoreLabRecord(
  state: HgoStagedArtifactStoreState,
  recordId: string,
  metadata: StoreLabMetadata = {},
): HgoStagedArtifactStoreLabResult {
  const record = getHgoStoreLabRecordById(state, recordId);

  if (!record) {
    return {
      ok: false,
      state,
      record: null,
      errors: [`Record ${recordId} was not found in the session store lab.`],
      warnings: [],
    };
  }

  const now = getTimestamp(metadata.now);
  const note = metadata.note ?? "Archived in session store lab.";
  const nextRecord: HgoStagedArtifactStoreRecord = {
    ...record,
    updatedAt: now,
    archivedAt: now,
    reviewStatus: "archived",
    promotionReadiness: "archived",
    note,
    events: [
      ...record.events,
      createEvent({
        record,
        type: "archived",
        now,
        note,
        reviewStatus: "archived",
        promotionReadiness: "archived",
      }),
    ],
  };

  return {
    ok: true,
    state: updateRecord(state, nextRecord),
    record: nextRecord,
    errors: [],
    warnings: [],
  };
}

export function createHgoStoreLabPromotionCandidate(
  state: HgoStagedArtifactStoreState,
  recordId: string,
  metadata: StoreLabMetadata = {},
): HgoStagedArtifactStoreLabResult {
  const record = getHgoStoreLabRecordById(state, recordId);

  if (!record) {
    return {
      ok: false,
      state,
      record: null,
      errors: [`Record ${recordId} was not found in the session store lab.`],
      warnings: [],
    };
  }

  const now = getTimestamp(metadata.now);

  if (
    record.reviewStatus !== "approved-for-future-staging" ||
    record.promotionReadiness !== "candidate"
  ) {
    const note =
      metadata.note ??
      "Simulated promotion candidate blocked. This does not publish or create a public route.";
    const nextRecord: HgoStagedArtifactStoreRecord = {
      ...record,
      updatedAt: now,
      note,
      events: [
        ...record.events,
        createEvent({
          record,
          type: "promotion-candidate-blocked",
          now,
          note,
          reviewStatus: record.reviewStatus,
          promotionReadiness: record.promotionReadiness,
        }),
      ],
    };

    return {
      ok: false,
      state: updateRecord(state, nextRecord),
      record: nextRecord,
      errors: [
        "Promotion candidate is blocked until review status is approved and live-blocking issues are cleared.",
      ],
      warnings: [
        "No public page was created. Store Lab promotion candidates are simulated only.",
      ],
    };
  }

  if (record.simulatedPromotionCandidate) {
    return {
      ok: false,
      state,
      record,
      errors: ["A simulated promotion candidate already exists for this record."],
      warnings: [
        "No public page was created. Store Lab promotion candidates are simulated only.",
      ],
    };
  }

  const note =
    metadata.note ??
    "Simulated promotion candidate created. This is not public publishing.";
  const candidate: HgoStagedArtifactPromotionCandidate = {
    candidateId: `${record.recordId}-candidate`,
    createdAt: now,
    note,
    simulatedOnly: true,
    published: false,
    publicRouteCreated: false,
  };
  const nextRecord: HgoStagedArtifactStoreRecord = {
    ...record,
    updatedAt: now,
    note,
    simulatedPromotionCandidate: candidate,
    events: [
      ...record.events,
      createEvent({
        record,
        type: "promotion-candidate-created",
        now,
        note,
        reviewStatus: record.reviewStatus,
        promotionReadiness: record.promotionReadiness,
      }),
    ],
  };

  return {
    ok: true,
    state: updateRecord(state, nextRecord),
    record: nextRecord,
    errors: [],
    warnings: [
      "No public page was created. Store Lab promotion candidates are simulated only.",
    ],
  };
}

export function summarizeHgoStoreLabState(
  state: HgoStagedArtifactStoreState,
): HgoStagedArtifactStoreLabSummary {
  const summary: HgoStagedArtifactStoreLabSummary = {
    totalRecords: state.records.length,
    activeRecords: 0,
    blocked: 0,
    reviewNeeded: 0,
    candidate: 0,
    archived: 0,
    simulatedPromotionCandidates: 0,
  };

  for (const record of state.records) {
    if (record.reviewStatus !== "archived") {
      summary.activeRecords += 1;
    }

    if (record.simulatedPromotionCandidate) {
      summary.simulatedPromotionCandidates += 1;
    }

    if (record.promotionReadiness === "blocked") {
      summary.blocked += 1;
    }

    if (record.promotionReadiness === "review-needed") {
      summary.reviewNeeded += 1;
    }

    if (record.promotionReadiness === "candidate") {
      summary.candidate += 1;
    }

    if (record.promotionReadiness === "archived") {
      summary.archived += 1;
    }
  }

  return summary;
}

export function listHgoStoreLabRecordsByStatus(
  state: HgoStagedArtifactStoreState,
): HgoStagedArtifactStoreRecordsByStatus {
  return {
    imported: state.records.filter(
      (record) => record.reviewStatus === "imported",
    ),
    "needs-fixes": state.records.filter(
      (record) => record.reviewStatus === "needs-fixes",
    ),
    "human-review": state.records.filter(
      (record) => record.reviewStatus === "human-review",
    ),
    "approved-for-future-staging": state.records.filter(
      (record) => record.reviewStatus === "approved-for-future-staging",
    ),
    archived: state.records.filter(
      (record) => record.reviewStatus === "archived",
    ),
  };
}
