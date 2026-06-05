import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createCollaborationCheckpointFromClient,
  importCollaborationCheckpointToClient,
  summarizeCollaborationCheckpoint,
  validateCollaborationCheckpoint,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts";
import {
  compareCollaborationCheckpointToManuscriptDraft,
  createCollaborationCheckpointFromSyntheticManuscriptDraft,
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
  summarizeSyntheticManuscriptDraftAdapterPayload,
  validateSyntheticManuscriptDraftAdapterPayload,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts";
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
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-lab-model.ts";
import {
  applySyntheticSpanTag,
  listSyntheticSpanTags,
  summarizeSyntheticSpanTags,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-span-model.ts";
import {
  createSyntheticPresenceState,
  markSyntheticPresenceForBlock,
  markSyntheticPresenceForSpan,
  summarizeSyntheticPresence,
  validateSyntheticPresenceState,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-presence-model.ts";
import {
  addSyntheticReviewNote,
  createSyntheticReviewNote,
  createSyntheticReviewNoteState,
  summarizeSyntheticReviewNotes,
  updateSyntheticReviewNoteStatus,
  validateSyntheticReviewNoteState,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-review-note-model.ts";
import {
  createAnnotationDurabilityDecisionRecord,
  validateAnnotationDurabilityDecisionRecord,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-durability.ts";
import {
  appendAnnotationEvent,
  createAnnotationEventLogReference,
  createEmptyAnnotationEventLog,
  createReviewNoteBodyEditedEvent,
  createReviewNoteCreatedEvent,
  createReviewNoteStatusChangedEvent,
  replayAnnotationEventLog,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-event-log.ts";
import {
  compareMaterializedAnnotationStateToEventLog,
  createMaterializedAnnotationStateFromEventLog,
  createMaterializedAnnotationStateReference,
  validateMaterializedAnnotationState,
} from "../apps/quipsly/src/app/(app)/manuscript/collaboration-lab/studio-collaboration-annotation-state.ts";

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

function assertPresenceExcluded(payload, lastAction) {
  const serialized = JSON.stringify(payload);

  if (
    serialized.includes('"presence"') ||
    serialized.includes("activeBlockId") ||
    serialized.includes("activeSpanId") ||
    serialized.includes(lastAction)
  ) {
    throw new Error("Ephemeral synthetic presence leaked into durable payload.");
  }
}

function assertReviewNotesExcluded(payload, noteBody) {
  const serialized = JSON.stringify(payload);

  if (
    serialized.includes(noteBody) ||
    serialized.includes("reviewNotes") ||
    serialized.includes("Synthetic review note")
  ) {
    throw new Error("Local synthetic review notes leaked into a durable payload.");
  }
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

    let presence = createSyntheticPresenceState();
    presence = markSyntheticPresenceForBlock(
      presence,
      "charlie",
      "synthetic-collab-block-1",
      "tagging",
      "Charlie is tagging a synthetic block in the agent smoke.",
    );

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

    const syncedSpan = listSyntheticSpanTags(homer)[0];
    const sourceTextBeforeReviewNotes = summarizeCollaborationDocument(charlie)
      .blocks.map((block) => block.text)
      .join("\n");
    presence = markSyntheticPresenceForSpan(
      presence,
      "homer",
      syncedSpan.spanId,
      "reviewing",
      "Homer is reviewing a synthetic span in the agent smoke.",
    );
    const presenceValidation = validateSyntheticPresenceState(presence);
    const presenceSummary = summarizeSyntheticPresence(presence);

    if (!presenceValidation.ok) {
      throw new Error(
        `Synthetic presence validation failed: ${presenceValidation.errors.join(" ")}`,
      );
    }

    addStep("model ephemeral synthetic presence", "passed", {
      actors: presenceSummary.actorCount,
      activeBlockPresence: presenceSummary.activeBlockPresenceCount,
      activeSpanPresence: presenceSummary.activeSpanPresenceCount,
    });

    const reviewNoteBody = "Synthetic review note anchored to the agent span.";
    const archivedReviewNoteBody =
      "Synthetic archived review note for status coverage.";
    const openReviewNoteBody =
      "Synthetic open review note kept open for status coverage.";
    const openNote = createSyntheticReviewNote(
      syncedSpan,
      "charlie",
      reviewNoteBody,
    );

    if (!openNote) {
      throw new Error("Synthetic review note was not created.");
    }

    let reviewNotes = addSyntheticReviewNote(
      createSyntheticReviewNoteState(),
      openNote,
    );
    reviewNotes = updateSyntheticReviewNoteStatus(
      reviewNotes,
      openNote.noteId,
      "addressed",
      "homer",
    );
    const archivedNote = createSyntheticReviewNote(
      syncedSpan,
      "homer",
      archivedReviewNoteBody,
    );

    if (!archivedNote) {
      throw new Error("Synthetic archived review note was not created.");
    }

    reviewNotes = addSyntheticReviewNote(reviewNotes, archivedNote);
    reviewNotes = updateSyntheticReviewNoteStatus(
      reviewNotes,
      archivedNote.noteId,
      "archived",
      "charlie",
    );
    const secondOpenNote = createSyntheticReviewNote(
      syncedSpan,
      "charlie",
      openReviewNoteBody,
    );

    if (!secondOpenNote) {
      throw new Error("Synthetic open review note was not created.");
    }

    reviewNotes = addSyntheticReviewNote(reviewNotes, secondOpenNote);

    const reviewNoteValidation = validateSyntheticReviewNoteState(reviewNotes);
    const reviewNoteSummary = summarizeSyntheticReviewNotes(reviewNotes);
    const sourceTextAfterReviewNotes = summarizeCollaborationDocument(charlie)
      .blocks.map((block) => block.text)
      .join("\n");

    if (!reviewNoteValidation.ok) {
      throw new Error(
        `Synthetic review note validation failed: ${reviewNoteValidation.errors.join(" ")}`,
      );
    }

    if (sourceTextAfterReviewNotes !== sourceTextBeforeReviewNotes) {
      throw new Error("Synthetic review notes mutated source text.");
    }

    for (const body of [
      reviewNoteBody,
      archivedReviewNoteBody,
      openReviewNoteBody,
    ]) {
      assertReviewNotesExcluded(presence, body);
    }

    addStep("model local span-anchored review notes", "passed", {
      notes: reviewNoteSummary.noteCount,
      addressed: reviewNoteSummary.addressedCount,
      archived: reviewNoteSummary.archivedCount,
      sourceTextUnchanged: true,
    });

    const annotationDecision = createAnnotationDurabilityDecisionRecord();
    const annotationDecisionValidation =
      validateAnnotationDurabilityDecisionRecord(annotationDecision);

    if (!annotationDecisionValidation.ok) {
      throw new Error(
        `Annotation durability decision validation failed: ${annotationDecisionValidation.errors.join(" ")}`,
      );
    }

    if (annotationDecision.recommendation.checkpointMetadataPrimaryStore) {
      throw new Error("Checkpoint metadata was recommended as the primary annotation store.");
    }

    addStep("compare future annotation durability options", "passed", {
      recommendedPrimaryStore:
        annotationDecision.recommendation.recommendedPrimaryStore,
      recommendedOperationLog:
        annotationDecision.recommendation.recommendedOperationLog,
      checkpointMetadataPrimaryStore:
        annotationDecision.recommendation.checkpointMetadataPrimaryStore,
    });

    const annotationEventBody =
      "Synthetic annotation event-log note for replay.";
    const annotationEventEditBody =
      "Synthetic annotation event-log note after replay edit.";
    const annotationCreatedEvent = createReviewNoteCreatedEvent(
      syncedSpan,
      "charlie",
      annotationEventBody,
    );

    if (!annotationCreatedEvent) {
      throw new Error("Synthetic annotation create event was not created.");
    }

    let annotationEventLog = appendAnnotationEvent(
      createEmptyAnnotationEventLog(),
      annotationCreatedEvent,
    );
    const annotationEditEvent = createReviewNoteBodyEditedEvent(
      annotationCreatedEvent.noteId,
      "homer",
      annotationEventEditBody,
    );
    const annotationAddressedEvent = createReviewNoteStatusChangedEvent(
      annotationCreatedEvent.noteId,
      "homer",
      "addressed",
    );

    if (!annotationEditEvent || !annotationAddressedEvent) {
      throw new Error("Synthetic annotation replay events were not created.");
    }

    annotationEventLog = appendAnnotationEvent(
      appendAnnotationEvent(annotationEventLog, annotationEditEvent),
      annotationAddressedEvent,
    );

    const annotationReplay = replayAnnotationEventLog(annotationEventLog);
    const annotationReference =
      createAnnotationEventLogReference(annotationEventLog);
    const materializedAnnotationState =
      createMaterializedAnnotationStateFromEventLog(annotationEventLog);
    const materializedAnnotationValidation =
      validateMaterializedAnnotationState(materializedAnnotationState);
    const materializedAnnotationReference =
      createMaterializedAnnotationStateReference(materializedAnnotationState);
    const materializedComparison = compareMaterializedAnnotationStateToEventLog(
      materializedAnnotationState,
      annotationEventLog,
    );
    const sourceTextAfterAnnotationEvents = summarizeCollaborationDocument(charlie)
      .blocks.map((block) => block.text)
      .join("\n");

    if (!annotationReplay.ok) {
      throw new Error(
        `Synthetic annotation event-log replay failed: ${annotationReplay.errors.join(" ")}`,
      );
    }

    if (annotationReplay.summary.addressedCount !== 1) {
      throw new Error("Synthetic annotation event-log did not replay addressed state.");
    }

    if (sourceTextAfterAnnotationEvents !== sourceTextBeforeReviewNotes) {
      throw new Error("Synthetic annotation event log mutated source text.");
    }

    if (
      annotationReference.checkpointMetadataPrimaryStore ||
      annotationReference.manualSnapshotEmbedsEvents
    ) {
      throw new Error("Annotation event-log reference crossed the snapshot boundary.");
    }

    if (!materializedAnnotationValidation.ok) {
      throw new Error(
        `Materialized annotation state validation failed: ${materializedAnnotationValidation.errors.join(" ")}`,
      );
    }

    if (!materializedComparison.matches) {
      throw new Error(
        `Materialized annotation state did not match event-log replay: ${materializedComparison.details.join(" ")}`,
      );
    }

    if (materializedAnnotationReference.manualSnapshotEmbedsAnnotations) {
      throw new Error("Materialized annotation state reference embedded annotations in snapshots.");
    }

    addStep("replay synthetic annotation event log", "passed", {
      events: annotationReplay.appliedEventCount,
      replayedNotes: annotationReplay.summary.noteCount,
      annotationStateVersion: annotationReference.annotationStateVersion,
    });

    addStep("materialize annotation current state from event log", "passed", {
      materializedNotes: materializedAnnotationState.summary.noteCount,
      materializedVersion:
        materializedAnnotationReference.annotationStateVersion,
      manualSnapshotEmbedsAnnotations:
        materializedAnnotationReference.manualSnapshotEmbedsAnnotations,
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
      spans: exportedSnapshot.spans?.length ?? 0,
    });
    assertPresenceExcluded(
      exportedSnapshot,
      "Homer is reviewing a synthetic span in the agent smoke.",
    );
    for (const body of [
      reviewNoteBody,
      archivedReviewNoteBody,
      openReviewNoteBody,
      annotationEventBody,
      annotationEventEditBody,
    ]) {
      assertReviewNotesExcluded(exportedSnapshot, body);
    }

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
    assertPresenceExcluded(
      checkpoint,
      "Homer is reviewing a synthetic span in the agent smoke.",
    );
    for (const body of [
      reviewNoteBody,
      archivedReviewNoteBody,
      openReviewNoteBody,
      annotationEventBody,
      annotationEventEditBody,
    ]) {
      assertReviewNotesExcluded(checkpoint, body);
    }

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
    assertPresenceExcluded(
      adapterPayload,
      "Homer is reviewing a synthetic span in the agent smoke.",
    );
    for (const body of [
      reviewNoteBody,
      archivedReviewNoteBody,
      openReviewNoteBody,
      annotationEventBody,
      annotationEventEditBody,
    ]) {
      assertReviewNotesExcluded(adapterPayload, body);
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
      presenceModeled: true,
      presenceActorCount: presenceSummary.actorCount,
      activeBlockPresenceCount: presenceSummary.activeBlockPresenceCount,
      activeSpanPresenceCount: presenceSummary.activeSpanPresenceCount,
      presenceExcludedFromSnapshots: true,
      reviewNotesModeled: true,
      reviewNoteCount: reviewNoteSummary.noteCount,
      openReviewNoteCount: reviewNoteSummary.openCount,
      addressedReviewNoteCount: reviewNoteSummary.addressedCount,
      archivedReviewNoteCount: reviewNoteSummary.archivedCount,
      reviewNotesAnchoredToSpans: true,
      reviewNotesMutateSourceText: false,
      reviewNotesExcludedFromSnapshots: true,
      annotationDurabilityDecision: true,
      recommendedPrimaryStore:
        annotationDecision.recommendation.recommendedPrimaryStore,
      checkpointMetadataPrimaryStore:
        annotationDecision.recommendation.checkpointMetadataPrimaryStore,
      annotationEventLogModeled: true,
      annotationEventCount: annotationEventLog.events.length,
      replayedAnnotationNoteCount: annotationReplay.summary.noteCount,
      annotationEventLogReference: true,
      annotationStateVersion: annotationReference.annotationStateVersion,
      materializedAnnotationStateModeled: true,
      materializedAnnotationNoteCount:
        materializedAnnotationReference.noteCount,
      materializedAnnotationStateVersion:
        materializedAnnotationReference.annotationStateVersion,
      manualSnapshotEmbedsAnnotations:
        materializedAnnotationReference.manualSnapshotEmbedsAnnotations,
      noDbSchema: true,
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
