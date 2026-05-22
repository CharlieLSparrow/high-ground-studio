import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createCollaborationCheckpointFromClient,
  importCollaborationCheckpointToClient,
  summarizeCollaborationCheckpoint,
  validateCollaborationCheckpoint,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  compareCollaborationCheckpointToManuscriptDraft,
  createCollaborationCheckpointFromSyntheticManuscriptDraft,
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
  summarizeSyntheticManuscriptDraftAdapterPayload,
  validateSyntheticManuscriptDraftAdapterPayload,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
import {
  applySyntheticTag,
  applySyntheticTextEdit,
  assertSyntheticCollaborationSnapshot,
  collaborationSummariesMatch,
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  importCollaborationSnapshot,
  summarizeCollaborationDocument,
  syncCollaborationClients,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  summarizeSyntheticSpanTags,
} from "../apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-span-model.ts";

const reportPath = path.resolve(
  "artifacts/agentic-smoke/studio-collab-lab-report.json",
);
const startedAt = new Date().toISOString();
const steps = [];
const errors = [];
const warnings = [];

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

async function writeReport(status, extra = {}) {
  const finishedAt = new Date().toISOString();
  const report = {
    startedAt,
    finishedAt,
    status,
    steps,
    errors,
    warnings,
    commitSha: getCommitSha(),
    syntheticDataOnly: true,
    noServerWrites: true,
    noAutosave: true,
    noRealContent: status === "passed",
    confirms: {
      syntheticDataOnly: true,
      noServerWrites: true,
      noAutosave: true,
      noRealContent: status === "passed",
      noLocalStorage: true,
      noProductionManuscriptEditing: true,
      noYjsProviderServer: true,
    },
    ...extra,
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return report;
}

async function runSmoke() {
  try {
    const initialSnapshot = createSyntheticCollaborationDocument();
    const [charlie, homer] = createCollaborationClients(
      ["Charlie", "Homer"],
      initialSnapshot,
    );

    addStep("create two synthetic Studio collaboration clients", "passed", {
      blocks: initialSnapshot.blocks.length,
    });

    applySyntheticTextEdit(
      charlie,
      "synthetic-collab-block-1",
      "Synthetic Charlie agentic smoke edit.",
    );
    applySyntheticTextEdit(
      homer,
      "synthetic-collab-block-2",
      "Synthetic Homer agentic smoke edit.",
    );
    applySyntheticTag(
      charlie,
      "synthetic-collab-block-1",
      "Charlie agent tag",
    );
    applySyntheticTag(homer, "synthetic-collab-block-1", "Homer agent tag");
    applySyntheticSpanTag(
      charlie,
      "synthetic-collab-block-1",
      10,
      22,
      "Charlie agent span",
    );
    addStep("apply synthetic edits and tags on separate clients", "passed");

    const syncResult = syncCollaborationClients(charlie, homer);

    if (!syncResult.converged || !collaborationSummariesMatch(charlie, homer)) {
      throw new Error("Synthetic collaboration clients did not converge.");
    }

    addStep("sync clients and confirm convergence", "passed", {
      charlieSyncCount: summarizeCollaborationDocument(charlie).syncCount,
      homerSyncCount: summarizeCollaborationDocument(homer).syncCount,
      spanCount: summarizeSyntheticSpanTags(homer).spanCount,
    });

    if (summarizeSyntheticSpanTags(homer).spanCount !== 1) {
      throw new Error("Synthetic span did not sync to Homer.");
    }

    const exportedSnapshot = exportCollaborationSnapshot(charlie);
    const safety = assertSyntheticCollaborationSnapshot(exportedSnapshot);

    if (!safety.ok) {
      throw new Error(
        `Synthetic collaboration snapshot failed safety check: ${safety.forbiddenMarkers.join(", ")}`,
      );
    }

    addStep("export synthetic collaboration snapshot", "passed", {
      blocks: exportedSnapshot.blocks.length,
      tags: exportedSnapshot.blocks.reduce(
        (count, block) => count + block.tags.length,
        0,
      ),
      spans: exportedSnapshot.spans?.length ?? 0,
    });

    const imported = importCollaborationSnapshot(
      exportedSnapshot,
      "Imported synthetic smoke client",
    );

    if (
      JSON.stringify(summarizeCollaborationDocument(imported).blocks) !==
      JSON.stringify(summarizeCollaborationDocument(charlie).blocks)
    ) {
      throw new Error("Imported collaboration snapshot summary did not match.");
    }

    addStep("import synthetic snapshot into third client", "passed");

    const checkpoint = createCollaborationCheckpointFromClient(charlie);
    const checkpointValidation = validateCollaborationCheckpoint(checkpoint);

    if (!checkpointValidation.ok || !checkpointValidation.summary) {
      throw new Error(
        `Collaboration checkpoint validation failed: ${checkpointValidation.errors.join(" ")}`,
      );
    }

    addStep("create and validate collaboration checkpoint", "passed", {
      checkpointVersion: checkpoint.checkpointVersion,
      blocks: checkpointValidation.summary.blockCount,
      tags: checkpointValidation.summary.tagCount,
      spans: checkpointValidation.summary.spanCount,
    });

    const checkpointImport = importCollaborationCheckpointToClient(
      checkpoint,
      "Imported checkpoint smoke client",
    );

    if (!checkpointImport.ok || !checkpointImport.client || !checkpointImport.summary) {
      throw new Error(
        `Collaboration checkpoint import failed: ${checkpointImport.errors.join(" ")}`,
      );
    }

    const importedSummaryMatches =
      JSON.stringify(checkpointImport.summary.blocks) ===
      JSON.stringify(summarizeCollaborationDocument(charlie).blocks);

    if (!importedSummaryMatches) {
      throw new Error("Imported checkpoint client summary did not match source.");
    }

    addStep("import checkpoint into third synthetic client", "passed", {
      importedSummaryMatches,
    });

    const adapterPayload =
      createSyntheticManuscriptDraftFromCollaborationCheckpoint(checkpoint);
    const adapterValidation =
      validateSyntheticManuscriptDraftAdapterPayload(adapterPayload);

    if (!adapterValidation.ok || !adapterValidation.summary) {
      throw new Error(
        `Synthetic Manuscript adapter validation failed: ${adapterValidation.errors.join(" ")}`,
      );
    }

    addStep("convert checkpoint to synthetic Manuscript adapter payload", "passed", {
      adapterVersion: adapterPayload.adapterVersion,
      blocks: adapterValidation.summary.blockCount,
      tags: adapterValidation.summary.tagCount,
      spans: adapterValidation.summary.spanCount,
      semanticMarks: adapterValidation.summary.semanticMarkCount,
    });

    if (adapterValidation.summary.semanticMarkCount !== 1) {
      throw new Error("Synthetic Manuscript adapter did not create a span semantic mark.");
    }

    const adapterComparison = compareCollaborationCheckpointToManuscriptDraft(
      checkpoint,
      adapterPayload,
    );

    if (!adapterComparison.matches) {
      throw new Error(
        `Synthetic Manuscript adapter comparison failed: ${adapterComparison.details.join(" ")}`,
      );
    }

    const adapterRoundtrip =
      createCollaborationCheckpointFromSyntheticManuscriptDraft(adapterPayload);

    if (!adapterRoundtrip.ok || !adapterRoundtrip.checkpoint) {
      throw new Error(
        `Synthetic Manuscript adapter checkpoint roundtrip failed: ${adapterRoundtrip.errors.join(" ")}`,
      );
    }

    const adapterImported = importCollaborationCheckpointToClient(
      adapterRoundtrip.checkpoint,
      "Imported adapter smoke client",
    );

    if (!adapterImported.ok || !adapterImported.summary) {
      throw new Error(
        `Synthetic Manuscript adapter client import failed: ${adapterImported.errors.join(" ")}`,
      );
    }

    const adapterRoundtripMatches =
      JSON.stringify(adapterImported.summary.blocks) ===
      JSON.stringify(summarizeCollaborationDocument(charlie).blocks);

    if (!adapterRoundtripMatches) {
      throw new Error("Synthetic Manuscript adapter roundtrip summary mismatch.");
    }

    addStep("roundtrip synthetic Manuscript adapter back to collaboration client", "passed", {
      adapterRoundtripMatches,
    });

    const checkpointSummary = summarizeCollaborationCheckpoint(checkpoint);
    const adapterSummary =
      summarizeSyntheticManuscriptDraftAdapterPayload(adapterPayload);
    const convergenceSummary = {
      charlie: summarizeCollaborationDocument(charlie),
      homer: summarizeCollaborationDocument(homer),
      imported: summarizeCollaborationDocument(imported),
      checkpointImported: checkpointImport.summary,
      adapterImported: adapterImported.summary,
      summariesMatch: collaborationSummariesMatch(charlie, homer),
    };
    const report = await writeReport("passed", {
      convergenceSummary,
      checkpointRoundtrip: true,
      checkpointVersion: checkpoint.checkpointVersion,
      checkpointBlockCount: checkpointSummary.blockCount,
      checkpointTagCount: checkpointSummary.tagCount,
      importedSummaryMatches,
      adapterRoundtrip: true,
      adapterVersion: adapterPayload.adapterVersion,
      adapterBlockCount: adapterSummary.blockCount,
      adapterTagCount: adapterSummary.tagCount,
      adapterRoundtripMatches,
      spanRoundtrip: true,
      spanCount: adapterSummary.spanCount,
      semanticMarkCount: adapterSummary.semanticMarkCount,
      manuscriptFirstSurface: true,
      noServerWrites: true,
      noProductionManuscriptEditing: true,
      noLocalStorage: true,
      routesTested: [],
      reportPath,
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          steps: steps.length,
          summariesMatch: convergenceSummary.summariesMatch,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);

    const report = await writeReport("failed", {
      routesTested: [],
      reportPath,
    });

    console.log(
      JSON.stringify(
        {
          status: report.status,
          reportPath,
          errors,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

await runSmoke();
