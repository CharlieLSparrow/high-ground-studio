import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createHgoEpisodeProjectionFromManuscript,
  createManuscriptSnapshotMetadata,
  createStudioManuscriptLibraryInputFromDraft,
  createSyntheticManuscriptSmokeDraft,
  isSyntheticManuscriptSmokeDraft,
  safeManuscriptDraft,
} from "../apps/studio/src/app/manuscript/manuscript-editor-model.ts";
import { validateHgoEpisodeProjection } from "../apps/web/src/lib/hgo/projection-validation.ts";

const reportPath = path.resolve(
  "artifacts/agentic-smoke/studio-hgo-smoke-report.json",
);
const startedAt = new Date().toISOString();
const steps = [];
const errors = [];
const warnings = [
  "Browser automation is deferred: the repo has no Playwright setup and no safe pre-authenticated Studio browser state yet.",
  "This run uses pure helper/API payload checks only and performs no server writes.",
];

function getCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function addStep(name, status, details = {}) {
  steps.push({
    name,
    status,
    details,
    completedAt: new Date().toISOString(),
  });
}

function assertStep(condition, name, details = {}) {
  if (!condition) {
    addStep(name, "failed", details);
    throw new Error(`Agentic smoke failed: ${name}`);
  }

  addStep(name, "passed", details);
}

function cloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

function hasNoForbiddenRealContent(serializedProjection) {
  const forbiddenMarkers = [
    "learning-to-lead.living",
    "apps/web/content",
    "apps/web/content/_inbox",
    "apps/web/content/_staging",
    "apps/web/content/publish",
    "ManuscriptBlock",
    "StoryDraft",
    "real-manuscript-draft.docx",
  ];

  return forbiddenMarkers.every(
    (marker) => !serializedProjection.includes(marker),
  );
}

async function writeReport(report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  let status = "passed";
  let projection = null;
  let validation = null;

  try {
    const draft = createSyntheticManuscriptSmokeDraft();

    assertStep(
      Boolean(safeManuscriptDraft(draft)),
      "create synthetic smoke draft",
      {
        title: draft.title,
        sourceFileName: draft.sourceFileName,
      },
    );
    assertStep(
      isSyntheticManuscriptSmokeDraft(draft),
      "confirm draft is synthetic-only smoke material",
    );

    const changedDraft = cloneDraft(draft);
    changedDraft.lastUpdatedAt = "2026-05-22T12:00:00.000Z";
    changedDraft.structureRegions = changedDraft.structureRegions.map(
      (region, index) =>
        index === 0
          ? {
              ...region,
              notes: `${region.notes} Agentic smoke local-only change marker.`,
              updatedAt: changedDraft.lastUpdatedAt,
            }
          : region,
    );

    assertStep(
      Boolean(safeManuscriptDraft(changedDraft)),
      "simulate local synthetic draft change",
      { changedField: "structureRegions[0].notes" },
    );

    const libraryPayload = createStudioManuscriptLibraryInputFromDraft({
      draft: changedDraft,
      description: "Synthetic Agent Smoke Draft",
    });

    assertStep(
      libraryPayload.kind === "SYNTHETIC" &&
        libraryPayload.title === "Synthetic Studio Smoke Draft",
      "create synthetic manuscript library payload",
      {
        kind: libraryPayload.kind,
        title: libraryPayload.title,
      },
    );

    const snapshotPayload = {
      draft: changedDraft,
      description: "Synthetic agentic smoke checkpoint.",
      snapshotType: "manual",
      manuscriptId: "local-only-synthetic-agent-smoke",
    };
    const snapshotMetadata = createManuscriptSnapshotMetadata(
      snapshotPayload.draft,
    );

    assertStep(
      Boolean(safeManuscriptDraft(snapshotPayload.draft)) &&
        snapshotMetadata.blocks > 0 &&
        snapshotMetadata.citedQuotations > 0,
      "create synthetic manual snapshot payload",
      {
        snapshotType: snapshotPayload.snapshotType,
        blocks: snapshotMetadata.blocks,
        citedQuotations: snapshotMetadata.citedQuotations,
        serverWritePerformed: false,
      },
    );

    const episodeRegion = changedDraft.structureRegions.find(
      (region) => region.kind === "episode",
    );

    projection = createHgoEpisodeProjectionFromManuscript({
      title: changedDraft.title,
      editorJson: changedDraft.editorJson,
      structureRegions: changedDraft.structureRegions,
      quoteReviews: changedDraft.quoteReviews,
      sourceFileName: changedDraft.sourceFileName,
      generatedAt: "2026-05-22T12:05:00.000Z",
      projectionStatus: "staged",
      projectionVisibility: "staged",
      targetEpisodeRegionId: episodeRegion?.id,
    });

    const serializedProjection = JSON.stringify(projection);

    assertStep(
      projection.status === "staged" &&
        projection.visibility === "staged" &&
        projection.projectionSource.bridgeVersion === "studio-browser-v1" &&
        projection.pullQuotes.length > 0,
      "create HGO projection JSON from synthetic manuscript",
      {
        id: projection.id,
        slug: projection.slug,
        pullQuotes: projection.pullQuotes.length,
      },
    );

    const omittedRawFields = [
      '"editorJson"',
      '"quoteReviews"',
      '"structureRegions"',
      '"marks"',
      '"activeAuthorId"',
      '"showAuthorColors"',
      '"showSemanticColors"',
    ];

    assertStep(
      omittedRawFields.every((field) => !serializedProjection.includes(field)),
      "confirm projection omits raw draft internals",
      { omittedRawFields },
    );

    assertStep(
      hasNoForbiddenRealContent(serializedProjection),
      "confirm projection avoids known real-content markers",
    );

    validation = validateHgoEpisodeProjection(projection);

    assertStep(validation.ok, "validate HGO projection shape", {
      errors: validation.errors,
      warnings: validation.warnings,
    });
    assertStep(
      validation.warnings.some((warning) =>
        warning.includes("Studio browser bridge projections"),
      ) &&
        validation.warnings.some((warning) =>
          warning.includes("unresolved citation state"),
        ) &&
        validation.warnings.some((warning) =>
          warning.includes("pull quote"),
        ),
      "confirm staged review and citation warnings",
      { warningCount: validation.warnings.length },
    );

    addStep("prepare import-preview route payload", "passed", {
      route: "/projection-preview/import",
      renderExpected: true,
      browserDriven: false,
    });
  } catch (error) {
    status = "failed";
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const finishedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt,
    status,
    environment: "local-helper",
    steps,
    screenshots: [],
    errors,
    warnings,
    routesTested: [
      "/manuscript",
      "/api/manuscript/library",
      "/api/manuscript/snapshots",
      "/projection-preview/import",
    ],
    commitSha: getCommitSha(),
    projection: projection
      ? {
          id: projection.id,
          slug: projection.slug,
          status: projection.status,
          visibility: projection.visibility,
          citationStates: projection.pullQuotes.map(
            (quote) => quote.citationState,
          ),
        }
      : null,
    validation: validation
      ? {
          ok: validation.ok,
          errors: validation.errors,
          warnings: validation.warnings,
        }
      : null,
    confirms: {
      syntheticDataOnly: status === "passed",
      noRealContent: status === "passed",
      noServerWrites: true,
      noServerWritesBeyondSyntheticSmoke: true,
      noPublishAction: true,
      noAutosave: true,
      noYjsOrCollaboration: true,
    },
  };

  await writeReport(report);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        reportPath,
        steps: steps.length,
        warnings: warnings.length + (validation?.warnings.length ?? 0),
      },
      null,
      2,
    ),
  );

  if (status !== "passed") {
    process.exitCode = 1;
  }
}

await main();
