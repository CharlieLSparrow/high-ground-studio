import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
    addStep("apply synthetic edits and tags on separate clients", "passed");

    const syncResult = syncCollaborationClients(charlie, homer);

    if (!syncResult.converged || !collaborationSummariesMatch(charlie, homer)) {
      throw new Error("Synthetic collaboration clients did not converge.");
    }

    addStep("sync clients and confirm convergence", "passed", {
      charlieSyncCount: summarizeCollaborationDocument(charlie).syncCount,
      homerSyncCount: summarizeCollaborationDocument(homer).syncCount,
    });

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

    const convergenceSummary = {
      charlie: summarizeCollaborationDocument(charlie),
      homer: summarizeCollaborationDocument(homer),
      imported: summarizeCollaborationDocument(imported),
      summariesMatch: collaborationSummariesMatch(charlie, homer),
    };
    const report = await writeReport("passed", {
      convergenceSummary,
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
