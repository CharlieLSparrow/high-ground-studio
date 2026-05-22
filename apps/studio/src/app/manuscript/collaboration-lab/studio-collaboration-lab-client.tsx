"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  cardClassName,
  cn,
  labelClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  StudioChip,
} from "../../studio-ui";
import {
  createCollaborationCheckpointFromClient,
  importCollaborationCheckpointToClient,
  summarizeCollaborationCheckpoint,
  validateCollaborationCheckpoint,
  type StudioCollaborationCheckpointSummary,
} from "./studio-collaboration-checkpoint-bridge";
import {
  createCollaborationCheckpointFromSyntheticManuscriptDraft,
  createSyntheticManuscriptDraftFromCollaborationCheckpoint,
  validateSyntheticManuscriptDraftAdapterPayload,
  type StudioCollaborationManuscriptAdapterSummary,
} from "./studio-collaboration-manuscript-adapter";
import {
  applySyntheticTag,
  applySyntheticTextEdit,
  collaborationSummariesMatch,
  createCollaborationClients,
  createSyntheticCollaborationDocument,
  exportCollaborationSnapshot,
  summarizeCollaborationDocument,
  syncCollaborationClientToClient,
  syncCollaborationClients,
  type StudioCollaborationClient,
  type StudioCollaborationSummary,
} from "./studio-collaboration-lab-model";
import {
  applySyntheticSpanTag,
  summarizeSyntheticSpanTags,
  type StudioCollaborationSpanTag,
} from "./studio-collaboration-span-model";
import {
  createSyntheticPresenceState,
  listPresenceActors,
  listPresenceForBlock,
  listPresenceForSpan,
  markSyntheticPresenceForBlock,
  markSyntheticPresenceForSpan,
  summarizeSyntheticPresence,
  type StudioCollaborationPresenceActorId,
  type StudioCollaborationPresenceMode,
  type StudioCollaborationPresenceState,
} from "./studio-collaboration-presence-model";
import {
  addSyntheticReviewNote,
  createSyntheticReviewNote,
  createSyntheticReviewNoteState,
  listSyntheticReviewNotesForBlock,
  listSyntheticReviewNotesForSpan,
  summarizeSyntheticReviewNotes,
  updateSyntheticReviewNoteStatus,
  type StudioCollaborationReviewNoteAuthorId,
  type StudioCollaborationReviewNoteState,
  type StudioCollaborationReviewNoteStatus,
} from "./studio-collaboration-review-note-model";
import {
  createAnnotationDurabilityDecisionRecord,
} from "./studio-collaboration-annotation-durability";

type LabState = {
  charlie: StudioCollaborationClient;
  homer: StudioCollaborationClient;
  revision: number;
  exportedSnapshotJson: string;
  checkpointJson: string;
  checkpointSummary: StudioCollaborationCheckpointSummary | null;
  importedCheckpointSummary: StudioCollaborationSummary | null;
  adapterJson: string;
  adapterSummary: StudioCollaborationManuscriptAdapterSummary | null;
  adapterRoundtripSummary: StudioCollaborationSummary | null;
  lastAction: string;
};

function createInitialLabState(): LabState {
  const snapshot = createSyntheticCollaborationDocument();
  const [charlie, homer] = createCollaborationClients(
    ["Charlie", "Homer"],
    snapshot,
  );

  return {
    charlie,
    homer,
    revision: 0,
    exportedSnapshotJson: "",
    checkpointJson: "",
    checkpointSummary: null,
    importedCheckpointSummary: null,
    adapterJson: "",
    adapterSummary: null,
    adapterRoundtripSummary: null,
    lastAction: "Synthetic collaboration lab initialized.",
  };
}

const buttonClassName =
  "min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.8rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10";

const dangerButtonClassName =
  "min-h-10 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-3 py-2 text-[0.8rem] font-extrabold text-studio-danger transition hover:bg-studio-danger/15";

function renderTextWithSpans(
  block: { id: string; text: string },
  spans: StudioCollaborationSpanTag[],
  presenceState: StudioCollaborationPresenceState,
  reviewNoteState: StudioCollaborationReviewNoteState,
) {
  const blockSpans = spans
    .filter((span) => span.blockId === block.id)
    .sort(
      (first, second) =>
        first.startOffset - second.startOffset ||
        first.endOffset - second.endOffset ||
        first.spanId.localeCompare(second.spanId),
    );
  const pieces: ReactNode[] = [];
  let cursor = 0;

  blockSpans.forEach((span) => {
    if (span.startOffset < cursor) {
      return;
    }

    if (span.startOffset > cursor) {
      pieces.push(
        <span key={`${span.spanId}-before`}>
          {block.text.slice(cursor, span.startOffset)}
        </span>,
      );
    }

    pieces.push(
      <mark
        key={span.spanId}
        className={cn(
          "rounded-sm bg-studio-source/25 px-1 text-studio-ink ring-1 ring-studio-source/35",
          listPresenceForSpan(presenceState, span.spanId).length > 0 &&
            "bg-studio-review/20 ring-2 ring-studio-review/55",
          listSyntheticReviewNotesForSpan(reviewNoteState, span.spanId).some(
            (note) => note.status === "open",
          ) && "underline decoration-studio-tag decoration-2 underline-offset-4",
        )}
        title={`${span.label} - ${span.actor}`}
      >
        {block.text.slice(span.startOffset, span.endOffset)}
      </mark>,
    );
    cursor = span.endOffset;
  });

  if (cursor < block.text.length) {
    pieces.push(<span key={`${block.id}-tail`}>{block.text.slice(cursor)}</span>);
  }

  return pieces.length ? pieces : block.text;
}

function SharedManuscriptSurface({
  summary,
  spansMatch,
  presenceState,
  reviewNoteState,
}: {
  summary: StudioCollaborationSummary;
  spansMatch: boolean;
  presenceState: StudioCollaborationPresenceState;
  reviewNoteState: StudioCollaborationReviewNoteState;
}) {
  const presenceSummary = summarizeSyntheticPresence(presenceState);
  const reviewNoteSummary = summarizeSyntheticReviewNotes(reviewNoteState);

  return (
    <section
      className={panelClassName}
      data-testid="studio-collab-shared-manuscript-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={labelClassName}>Shared manuscript surface</p>
          <h2 className={panelTitleClassName}>
            One manuscript, many collaborators
          </h2>
          <p className={panelCopyClassName}>
            This is the direction: one long manuscript stream with semantic span
            overlays. The two-client panels below are scaffolding for local
            CRDT testing, not the intended final product shape.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StudioChip tone={spansMatch ? "tag" : "review"}>
            {spansMatch ? "span state synced" : "span state differs"}
          </StudioChip>
          <StudioChip tone="source">{summary.spanCount} spans</StudioChip>
          <StudioChip tone="review">
            {presenceSummary.activeBlockPresenceCount +
              presenceSummary.activeSpanPresenceCount}{" "}
            presence cues
          </StudioChip>
          <StudioChip tone="tag">
            {reviewNoteSummary.openCount} open review notes
          </StudioChip>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-xl border border-studio-line bg-studio-ink/5 p-3 md:grid-cols-2">
        <div>
          <p className={labelClassName}>Presence boundary</p>
          <p className="mt-1 text-xs font-bold leading-5 text-studio-muted">
            Presence is ephemeral. It is not saved in checkpoints, not
            manuscript content, and not provider-backed yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {listPresenceActors(presenceState).map((actor) => (
            <StudioChip key={actor.actorId} tone={actor.colorLabel}>
              {actor.displayName}: {actor.currentMode}
            </StudioChip>
          ))}
        </div>
      </div>

      <article className="mt-5 grid gap-4 rounded-xl border border-studio-line-strong bg-[#101611] p-4 leading-8 shadow-inner">
        {summary.blocks.map((block, index) => {
          const blockSpans = summary.spans.filter(
            (span) => span.blockId === block.id,
          );
          const blockPresence = listPresenceForBlock(presenceState, block.id);
          const blockReviewNotes = listSyntheticReviewNotesForBlock(
            reviewNoteState,
            block.id,
          );
          const spanPresence = blockSpans.flatMap((span) =>
            listPresenceForSpan(presenceState, span.spanId).map((actor) => ({
              actor,
              span,
            })),
          );
          const openBlockReviewNoteCount = blockReviewNotes.filter(
            (note) => note.status === "open",
          ).length;

          return (
            <section
              key={block.id}
              className="grid gap-3 border-b border-studio-line pb-4 last:border-b-0 last:pb-0 md:grid-cols-[8.5rem_1fr]"
            >
              <aside className="flex flex-wrap items-start gap-2 md:flex-col">
                {blockPresence.length || spanPresence.length ? (
                  <>
                    {blockPresence.map((actor) => (
                      <StudioChip
                        key={`${actor.actorId}-${block.id}`}
                        tone={actor.colorLabel}
                      >
                        {actor.displayName} here: {actor.currentMode}
                      </StudioChip>
                    ))}
                    {spanPresence.map(({ actor, span }) => (
                      <StudioChip
                        key={`${actor.actorId}-${span.spanId}`}
                        tone={actor.colorLabel}
                      >
                        {actor.displayName} on span: {span.label}
                      </StudioChip>
                    ))}
                  </>
                ) : (
                  <span className="text-xs font-bold text-studio-dim">
                    margin clear
                  </span>
                )}
                {blockReviewNotes.length ? (
                  <div className="grid gap-1">
                    <StudioChip tone={openBlockReviewNoteCount ? "tag" : "review"}>
                      {blockReviewNotes.length} span notes
                    </StudioChip>
                    {blockReviewNotes.slice(0, 2).map((note) => (
                      <span
                        key={note.noteId}
                        className="rounded-lg border border-studio-line bg-black/20 px-2 py-1 text-xs font-bold leading-5 text-studio-muted"
                      >
                        {note.authorId}: {note.status}
                      </span>
                    ))}
                  </div>
                ) : null}
              </aside>
              <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={labelClassName}>Block {index + 1}</span>
                <StudioChip>{block.id}</StudioChip>
                {blockSpans.map((span) => (
                  <StudioChip key={span.spanId} tone="tag">
                    {span.label}
                    {listSyntheticReviewNotesForSpan(reviewNoteState, span.spanId)
                      .length
                      ? ` - ${
                          listSyntheticReviewNotesForSpan(
                            reviewNoteState,
                            span.spanId,
                          ).length
                        } notes`
                      : ""}
                  </StudioChip>
                ))}
              </div>
              <p className="text-[1.05rem] font-semibold text-studio-ink">
                {renderTextWithSpans(
                  block,
                  summary.spans,
                  presenceState,
                  reviewNoteState,
                )}
              </p>
              </div>
            </section>
          );
        })}
      </article>
    </section>
  );
}

function SummaryGrid({
  charlieSummary,
  homerSummary,
  summariesMatch,
}: {
  charlieSummary: StudioCollaborationSummary;
  homerSummary: StudioCollaborationSummary;
  summariesMatch: boolean;
}) {
  return (
    <section className={panelClassName} data-testid="studio-collab-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={labelClassName}>Convergence summary</p>
          <h2 className={panelTitleClassName}>
            {summariesMatch ? "Clients match" : "Clients differ"}
          </h2>
          <p className={panelCopyClassName}>
            This compares the synthetic Yjs documents after local edits and
            manual sync. It is not autosave and does not write a server.
          </p>
        </div>
        <StudioChip tone={summariesMatch ? "tag" : "review"}>
          {summariesMatch ? "converged" : "not synced"}
        </StudioChip>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className={cardClassName}>
          <div className="p-3">
            <p className={labelClassName}>Blocks</p>
            <p className="mt-2 text-2xl font-black text-studio-ink">
              {charlieSummary.blockCount}
            </p>
          </div>
        </div>
        <div className={cardClassName}>
          <div className="p-3">
            <p className={labelClassName}>Charlie tags</p>
            <p className="mt-2 text-2xl font-black text-studio-ink">
              {charlieSummary.tagCount}
            </p>
          </div>
        </div>
        <div className={cardClassName}>
          <div className="p-3">
            <p className={labelClassName}>Homer tags</p>
            <p className="mt-2 text-2xl font-black text-studio-ink">
              {homerSummary.tagCount}
            </p>
          </div>
        </div>
        <div className={cardClassName}>
          <div className="p-3">
            <p className={labelClassName}>Spans</p>
            <p className="mt-2 text-2xl font-black text-studio-ink">
              {charlieSummary.spanCount}
            </p>
          </div>
        </div>
        <div className={cardClassName}>
          <div className="p-3">
            <p className={labelClassName}>Sync count</p>
            <p className="mt-2 text-2xl font-black text-studio-ink">
              {charlieSummary.syncCount + homerSummary.syncCount}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClientPanel({
  title,
  summary,
  onTextEdit,
}: {
  title: string;
  summary: StudioCollaborationSummary;
  onTextEdit: (blockId: string, nextText: string) => void;
}) {
  return (
    <section className={panelClassName} data-testid={`studio-collab-${title.toLowerCase()}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={labelClassName}>{title} synthetic client</p>
          <h2 className={panelTitleClassName}>Local Yjs document view</h2>
        </div>
        <StudioChip tone="source">{summary.updateCount} local edits</StudioChip>
      </div>
      <div className="mt-4 grid gap-3">
        {summary.blocks.map((block) => (
          <label key={block.id} className={cn(cardClassName, "block p-3")}>
            <span className={labelClassName}>{block.id}</span>
            <textarea
              className="mt-2 min-h-[96px] w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.9rem] leading-6 text-studio-ink outline-none focus:border-studio-source/55"
              data-testid={`studio-collab-${title.toLowerCase()}-${block.id}`}
              value={block.text}
              onChange={(event) => onTextEdit(block.id, event.currentTarget.value)}
            />
            <p className="mt-2 text-xs font-bold text-studio-muted">
              Tags: {block.tags.length ? block.tags.join(", ") : "none"}
            </p>
          </label>
        ))}
      </div>
    </section>
  );
}

export default function StudioCollaborationLabClient() {
  const [lab, setLab] = useState<LabState>(() => createInitialLabState());
  const [presence, setPresence] = useState<StudioCollaborationPresenceState>(() =>
    createSyntheticPresenceState(),
  );
  const [reviewNotes, setReviewNotes] =
    useState<StudioCollaborationReviewNoteState>(() =>
      createSyntheticReviewNoteState(),
    );
  const [spanForm, setSpanForm] = useState({
    actor: "Charlie",
    blockId: "synthetic-collab-block-1",
    startOffset: "10",
    endOffset: "22",
    label: "Synthetic span insight",
  });
  const [reviewNoteForm, setReviewNoteForm] = useState<{
    spanId: string;
    authorId: StudioCollaborationReviewNoteAuthorId;
    body: string;
  }>({
    spanId: "",
    authorId: "charlie",
    body: "Synthetic review note for this span.",
  });
  const charlieSummary = useMemo(
    () => summarizeCollaborationDocument(lab.charlie),
    [lab.charlie, lab.revision],
  );
  const homerSummary = useMemo(
    () => summarizeCollaborationDocument(lab.homer),
    [lab.homer, lab.revision],
  );
  const summariesMatch = useMemo(
    () => collaborationSummariesMatch(lab.charlie, lab.homer),
    [lab.charlie, lab.homer, lab.revision],
  );
  const charlieSpanSummary = useMemo(
    () => summarizeSyntheticSpanTags(lab.charlie),
    [lab.charlie, lab.revision],
  );
  const homerSpanSummary = useMemo(
    () => summarizeSyntheticSpanTags(lab.homer),
    [lab.homer, lab.revision],
  );
  const spansMatch = useMemo(
    () => JSON.stringify(charlieSummary.spans) === JSON.stringify(homerSummary.spans),
    [charlieSummary.spans, homerSummary.spans],
  );
  const presenceSummary = useMemo(
    () => summarizeSyntheticPresence(presence),
    [presence],
  );
  const reviewNoteSummary = useMemo(
    () => summarizeSyntheticReviewNotes(reviewNotes),
    [reviewNotes],
  );
  const annotationDecision = useMemo(
    () => createAnnotationDurabilityDecisionRecord(),
    [],
  );
  const availableSpans = useMemo(() => {
    const spansById = new Map<string, StudioCollaborationSpanTag>();

    for (const span of [...charlieSummary.spans, ...homerSummary.spans]) {
      spansById.set(span.spanId, span);
    }

    return [...spansById.values()];
  }, [charlieSummary.spans, homerSummary.spans]);
  const firstSpan = charlieSummary.spans[0] ?? homerSummary.spans[0] ?? null;
  const selectedReviewSpan =
    availableSpans.find((span) => span.spanId === reviewNoteForm.spanId) ??
    availableSpans[0] ??
    null;
  const selectedReviewNotes = selectedReviewSpan
    ? listSyntheticReviewNotesForSpan(reviewNotes, selectedReviewSpan.spanId)
    : [];

  function refresh(message: string, exportedSnapshotJson = lab.exportedSnapshotJson) {
    setLab((current) => ({
      ...current,
      revision: current.revision + 1,
      exportedSnapshotJson,
      lastAction: message,
    }));
  }

  function updatePresence(message: string, nextPresence: StudioCollaborationPresenceState) {
    setPresence(nextPresence);
    refresh(message);
  }

  function setPresenceForBlock(
    actorId: StudioCollaborationPresenceActorId,
    blockId: string,
    mode: StudioCollaborationPresenceMode,
    lastAction: string,
  ) {
    updatePresence(
      lastAction,
      markSyntheticPresenceForBlock(presence, actorId, blockId, mode, lastAction),
    );
  }

  function setPresenceForFirstSpan(
    actorId: StudioCollaborationPresenceActorId,
    mode: StudioCollaborationPresenceMode,
    lastAction: string,
  ) {
    if (!firstSpan) {
      refresh("Create a synthetic span before assigning span presence.");
      return;
    }

    updatePresence(
      lastAction,
      markSyntheticPresenceForSpan(presence, actorId, firstSpan.spanId, mode, lastAction),
    );
  }

  function addReviewNoteFromForm() {
    if (!selectedReviewSpan) {
      refresh("Create a synthetic span before adding a review note.");
      return;
    }

    const note = createSyntheticReviewNote(
      selectedReviewSpan,
      reviewNoteForm.authorId,
      reviewNoteForm.body,
    );

    if (!note) {
      refresh("Synthetic review note was rejected. Choose a span and add note text.");
      return;
    }

    const nextState = addSyntheticReviewNote(reviewNotes, note);
    const added = nextState.notes.length > reviewNotes.notes.length;

    setReviewNotes(nextState);
    refresh(
      added
        ? "Synthetic review note added. It is an annotation, not source text."
        : "Synthetic review note was not added. It may be invalid or a duplicate.",
    );
  }

  function updateReviewNoteStatus(
    noteId: string,
    status: StudioCollaborationReviewNoteStatus,
    actorId: StudioCollaborationReviewNoteAuthorId,
  ) {
    setReviewNotes((current) =>
      updateSyntheticReviewNoteStatus(current, noteId, status, actorId),
    );
    refresh(`Synthetic review note marked ${status}. No source text changed.`);
  }

  function updateCheckpointState(input: {
    message: string;
    checkpointJson?: string;
    checkpointSummary?: StudioCollaborationCheckpointSummary | null;
    importedCheckpointSummary?: StudioCollaborationSummary | null;
  }) {
    setLab((current) => ({
      ...current,
      revision: current.revision + 1,
      checkpointJson: input.checkpointJson ?? current.checkpointJson,
      checkpointSummary:
        input.checkpointSummary === undefined
          ? current.checkpointSummary
          : input.checkpointSummary,
      importedCheckpointSummary:
        input.importedCheckpointSummary === undefined
          ? current.importedCheckpointSummary
          : input.importedCheckpointSummary,
      lastAction: input.message,
    }));
  }

  function updateAdapterState(input: {
    message: string;
    adapterJson?: string;
    adapterSummary?: StudioCollaborationManuscriptAdapterSummary | null;
    adapterRoundtripSummary?: StudioCollaborationSummary | null;
    checkpointJson?: string;
    checkpointSummary?: StudioCollaborationCheckpointSummary | null;
  }) {
    setLab((current) => ({
      ...current,
      revision: current.revision + 1,
      adapterJson: input.adapterJson ?? current.adapterJson,
      adapterSummary:
        input.adapterSummary === undefined
          ? current.adapterSummary
          : input.adapterSummary,
      adapterRoundtripSummary:
        input.adapterRoundtripSummary === undefined
          ? current.adapterRoundtripSummary
          : input.adapterRoundtripSummary,
      checkpointJson: input.checkpointJson ?? current.checkpointJson,
      checkpointSummary:
        input.checkpointSummary === undefined
          ? current.checkpointSummary
          : input.checkpointSummary,
      lastAction: input.message,
    }));
  }

  function syncCharlieToHomer() {
    const update = syncCollaborationClientToClient(lab.charlie, lab.homer);
    refresh(
      update.converged
        ? "Charlie to Homer sync completed. Clients now converge."
        : "Charlie to Homer sync ran. Homer received Charlie state.",
    );
  }

  function syncHomerToCharlie() {
    const update = syncCollaborationClientToClient(lab.homer, lab.charlie);
    refresh(
      update.converged
        ? "Homer to Charlie sync completed. Clients now converge."
        : "Homer to Charlie sync ran. Charlie received Homer state.",
    );
  }

  function twoWaySync() {
    const update = syncCollaborationClients(lab.charlie, lab.homer);
    refresh(
      update.converged
        ? "Two-way Yjs sync completed. Charlie and Homer now converge."
        : "Yjs sync ran, but summaries still differ.",
    );
  }

  function exportSnapshot() {
    const snapshot = exportCollaborationSnapshot(lab.charlie);
    refresh(
      "Synthetic collaboration snapshot exported from Charlie client. No server write happened.",
      JSON.stringify(snapshot, null, 2),
    );
  }

  function createCheckpoint() {
    const checkpoint = createCollaborationCheckpointFromClient(lab.charlie);
    const validation = validateCollaborationCheckpoint(checkpoint);

    updateCheckpointState({
      message: validation.ok
        ? "Synthetic collaboration checkpoint created locally. Not a production snapshot."
        : `Checkpoint validation failed: ${validation.errors.join(" ")}`,
      checkpointJson: JSON.stringify(checkpoint, null, 2),
      checkpointSummary: validation.summary ?? summarizeCollaborationCheckpoint(checkpoint),
      importedCheckpointSummary: null,
    });
  }

  function importCheckpoint() {
    try {
      const parsed = JSON.parse(lab.checkpointJson) as unknown;
      const validation = validateCollaborationCheckpoint(parsed);

      if (!validation.ok || !validation.checkpoint) {
        updateCheckpointState({
          message: `Checkpoint import rejected: ${validation.errors.join(" ")}`,
        });
        return;
      }

      const imported = importCollaborationCheckpointToClient(
        validation.checkpoint,
        "Imported checkpoint client",
      );

      updateCheckpointState({
        message: imported.ok
          ? "Checkpoint imported into a new synthetic client. Production snapshots were not touched."
          : `Checkpoint import failed: ${imported.errors.join(" ")}`,
        checkpointSummary: validation.summary,
        importedCheckpointSummary: imported.summary,
      });
    } catch (error) {
      updateCheckpointState({
        message:
          error instanceof Error
            ? `Checkpoint JSON parse failed: ${error.message}`
            : "Checkpoint JSON parse failed.",
      });
    }
  }

  function clearCheckpoint() {
    updateCheckpointState({
      message: "Local checkpoint bridge state cleared.",
      checkpointJson: "",
      checkpointSummary: null,
      importedCheckpointSummary: null,
    });
  }

  function createAdapterPayloadFromCheckpoint() {
    try {
      const checkpoint = lab.checkpointJson
        ? JSON.parse(lab.checkpointJson)
        : createCollaborationCheckpointFromClient(lab.charlie);
      const checkpointValidation = validateCollaborationCheckpoint(checkpoint);

      if (!checkpointValidation.ok || !checkpointValidation.checkpoint) {
        updateAdapterState({
          message: `Adapter checkpoint rejected: ${checkpointValidation.errors.join(" ")}`,
        });
        return;
      }

      const adapterPayload =
        createSyntheticManuscriptDraftFromCollaborationCheckpoint(
          checkpointValidation.checkpoint,
        );
      const adapterValidation =
        validateSyntheticManuscriptDraftAdapterPayload(adapterPayload);

      updateAdapterState({
        message: adapterValidation.ok
          ? "Synthetic Manuscript adapter payload created. Not a production import."
          : `Adapter validation failed: ${adapterValidation.errors.join(" ")}`,
        adapterJson: JSON.stringify(adapterPayload, null, 2),
        adapterSummary: adapterValidation.summary,
        adapterRoundtripSummary: null,
        checkpointJson: JSON.stringify(checkpointValidation.checkpoint, null, 2),
        checkpointSummary: checkpointValidation.summary,
      });
    } catch (error) {
      updateAdapterState({
        message:
          error instanceof Error
            ? `Adapter creation failed: ${error.message}`
            : "Adapter creation failed.",
      });
    }
  }

  function validateAdapterPayload() {
    try {
      const parsed = JSON.parse(lab.adapterJson) as unknown;
      const validation = validateSyntheticManuscriptDraftAdapterPayload(parsed);

      updateAdapterState({
        message: validation.ok
          ? "Synthetic Manuscript adapter payload validated. No server write happened."
          : `Adapter validation rejected payload: ${validation.errors.join(" ")}`,
        adapterSummary: validation.summary,
        adapterRoundtripSummary: null,
      });
    } catch (error) {
      updateAdapterState({
        message:
          error instanceof Error
            ? `Adapter JSON parse failed: ${error.message}`
            : "Adapter JSON parse failed.",
      });
    }
  }

  function roundtripAdapterPayload() {
    try {
      const parsed = JSON.parse(lab.adapterJson) as unknown;
      const validation = validateSyntheticManuscriptDraftAdapterPayload(parsed);

      if (!validation.ok || !validation.payload) {
        updateAdapterState({
          message: `Adapter roundtrip rejected payload: ${validation.errors.join(" ")}`,
        });
        return;
      }

      const checkpoint =
        createCollaborationCheckpointFromSyntheticManuscriptDraft(
          validation.payload,
        );

      if (!checkpoint.ok || !checkpoint.checkpoint) {
        updateAdapterState({
          message: `Adapter checkpoint roundtrip failed: ${checkpoint.errors.join(" ")}`,
        });
        return;
      }

      const imported = importCollaborationCheckpointToClient(
        checkpoint.checkpoint,
        "Imported adapter bridge client",
      );

      updateAdapterState({
        message: imported.ok
          ? "Adapter payload converted back into a synthetic collaboration client. Production Manuscript Desk was untouched."
          : `Adapter client import failed: ${imported.errors.join(" ")}`,
        adapterSummary: validation.summary,
        adapterRoundtripSummary: imported.summary,
      });
    } catch (error) {
      updateAdapterState({
        message:
          error instanceof Error
            ? `Adapter roundtrip parse failed: ${error.message}`
            : "Adapter roundtrip parse failed.",
      });
    }
  }

  function clearAdapterPayload() {
    updateAdapterState({
      message: "Synthetic Manuscript adapter bridge state cleared.",
      adapterJson: "",
      adapterSummary: null,
      adapterRoundtripSummary: null,
    });
  }

  function applySpanFromForm() {
    const targetClient = spanForm.actor === "Homer" ? lab.homer : lab.charlie;
    const applied = applySyntheticSpanTag(
      targetClient,
      spanForm.blockId,
      Number(spanForm.startOffset),
      Number(spanForm.endOffset),
      spanForm.label,
    );

    refresh(
      applied
        ? `${spanForm.actor} added a synthetic semantic span. Use two-way sync to share it.`
        : "Synthetic span was rejected. Check block, offsets, and label.",
    );
  }

  return (
    <main
      className="min-h-screen bg-studio-bg px-5 py-6 text-studio-ink md:px-8"
      data-testid="studio-collaboration-lab"
    >
      <section className="mx-auto max-w-[1280px]">
        <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
          <div className={panelClassName}>
            <div className="flex flex-wrap gap-2">
              <StudioChip tone="tag">Local collaboration lab</StudioChip>
              <StudioChip>Synthetic data only</StudioChip>
              <StudioChip>No server writes</StudioChip>
              <StudioChip>No autosave</StudioChip>
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
              Two synthetic clients, one manuscript-shaped CRDT.
            </h1>
            <p className={panelCopyClassName}>
              This lab uses Yjs in the browser to model Charlie and Homer editing
              manuscript-like synthetic blocks. It does not touch the production
              Manuscript Desk, manual snapshots, server state, or localStorage.
            </p>
          </div>
          <div className={panelClassName}>
            <p className={labelClassName}>Safety boundary</p>
            <div className="mt-3 grid gap-2 text-sm font-bold leading-6 text-studio-muted">
              <p>No production manuscript editing.</p>
              <p>No real simultaneous editing yet.</p>
              <p>No localStorage or autosave.</p>
              <p>No DB, API route, server provider, or deploy.</p>
              <p>Manual snapshots remain separate rollback anchors.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5">
          <SharedManuscriptSurface
            summary={charlieSummary}
            spansMatch={spansMatch}
            presenceState={presence}
            reviewNoteState={reviewNotes}
          />

          <SummaryGrid
            charlieSummary={charlieSummary}
            homerSummary={homerSummary}
            summariesMatch={summariesMatch}
          />

          <section className={panelClassName}>
            <p className={labelClassName}>Lab controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-sync-charlie-homer"
                onClick={syncCharlieToHomer}
              >
                Sync Charlie to Homer
              </button>
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-sync-homer-charlie"
                onClick={syncHomerToCharlie}
              >
                Sync Homer to Charlie
              </button>
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-two-way-sync"
                onClick={twoWaySync}
              >
                Two-way sync
              </button>
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-charlie-tag"
                onClick={() => {
                  applySyntheticTag(
                    lab.charlie,
                    "synthetic-collab-block-1",
                    "Charlie lab tag",
                  );
                  refresh("Charlie added a synthetic tag.");
                }}
              >
                Add tag from Charlie
              </button>
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-homer-tag"
                onClick={() => {
                  applySyntheticTag(
                    lab.homer,
                    "synthetic-collab-block-1",
                    "Homer lab tag",
                  );
                  refresh("Homer added a synthetic tag.");
                }}
              >
                Add tag from Homer
              </button>
              <button
                type="button"
                className={buttonClassName}
                data-testid="studio-collab-export"
                onClick={exportSnapshot}
              >
                Export synthetic snapshot
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                data-testid="studio-collab-reset"
                onClick={() => {
                  setLab(createInitialLabState());
                  setPresence(createSyntheticPresenceState());
                  setReviewNotes(createSyntheticReviewNoteState());
                }}
              >
                Reset lab
              </button>
            </div>
            <div
              className="mt-4 grid gap-3 rounded-xl border border-studio-line-strong bg-studio-ink/5 p-3"
              data-testid="studio-collab-presence-controls"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={labelClassName}>Margin presence</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-studio-muted">
                    Presence is ephemeral React state. It is not saved in
                    checkpoints, not manuscript content, and future provider
                    broadcasts stay deferred.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StudioChip tone="source">
                    {presenceSummary.activeBlockPresenceCount} block cues
                  </StudioChip>
                  <StudioChip tone="review">
                    {presenceSummary.activeSpanPresenceCount} span cues
                  </StudioChip>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-charlie-block"
                  onClick={() =>
                    setPresenceForBlock(
                      "charlie",
                      spanForm.blockId,
                      "editing",
                      `Charlie is editing ${spanForm.blockId}.`,
                    )
                  }
                >
                  Set Charlie active block
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-homer-block"
                  onClick={() =>
                    setPresenceForBlock(
                      "homer",
                      spanForm.blockId,
                      "reading",
                      `Homer is reading ${spanForm.blockId}.`,
                    )
                  }
                >
                  Set Homer active block
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-charlie-span"
                  onClick={() =>
                    setPresenceForFirstSpan(
                      "charlie",
                      "tagging",
                      "Charlie is tagging the first synthetic span.",
                    )
                  }
                >
                  Set Charlie active span
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-homer-span"
                  onClick={() =>
                    setPresenceForFirstSpan(
                      "homer",
                      "reviewing",
                      "Homer is reviewing the first synthetic span.",
                    )
                  }
                >
                  Set Homer reviewing span
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-homer-reviewing"
                  onClick={() =>
                    setPresenceForBlock(
                      "homer",
                      spanForm.blockId,
                      "reviewing",
                      `Homer is reviewing ${spanForm.blockId}.`,
                    )
                  }
                >
                  Mark Homer reviewing
                </button>
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-presence-charlie-tagging"
                  onClick={() =>
                    setPresenceForBlock(
                      "charlie",
                      spanForm.blockId,
                      "tagging",
                      `Charlie is tagging ${spanForm.blockId}.`,
                    )
                  }
                >
                  Mark Charlie tagging
                </button>
              </div>
              <p
                className="text-xs font-bold leading-5 text-studio-muted"
                data-testid="studio-collab-presence-summary"
              >
                Presence actors: {presenceSummary.actorCount}. Active block
                cues: {presenceSummary.activeBlockPresenceCount}. Active span
                cues: {presenceSummary.activeSpanPresenceCount}. Presence is
                reported by the lab but excluded from document snapshots and
                adapter payloads.
              </p>
            </div>
            <div
              className="mt-4 grid gap-3 rounded-xl border border-studio-line-strong bg-studio-ink/5 p-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_auto]"
              data-testid="studio-collab-span-controls"
            >
              <label className="grid gap-1">
                <span className={labelClassName}>Block</span>
                <select
                  className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                  value={spanForm.blockId}
                  onChange={(event) =>
                    setSpanForm((current) => ({
                      ...current,
                      blockId: event.currentTarget.value,
                    }))
                  }
                >
                  {charlieSummary.blocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className={labelClassName}>Actor</span>
                <select
                  className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                  value={spanForm.actor}
                  onChange={(event) =>
                    setSpanForm((current) => ({
                      ...current,
                      actor: event.currentTarget.value,
                    }))
                  }
                >
                  <option value="Charlie">Charlie</option>
                  <option value="Homer">Homer</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className={labelClassName}>Start / end</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                    type="number"
                    value={spanForm.startOffset}
                    onChange={(event) =>
                      setSpanForm((current) => ({
                        ...current,
                        startOffset: event.currentTarget.value,
                      }))
                    }
                  />
                  <input
                    className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                    type="number"
                    value={spanForm.endOffset}
                    onChange={(event) =>
                      setSpanForm((current) => ({
                        ...current,
                        endOffset: event.currentTarget.value,
                      }))
                    }
                  />
                </div>
              </label>
              <label className="grid gap-1">
                <span className={labelClassName}>Span label</span>
                <input
                  className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                  value={spanForm.label}
                  onChange={(event) =>
                    setSpanForm((current) => ({
                      ...current,
                      label: event.currentTarget.value,
                    }))
                  }
                />
              </label>
              <div className="grid items-end">
                <button
                  type="button"
                  className={buttonClassName}
                  data-testid="studio-collab-apply-span"
                  onClick={applySpanFromForm}
                >
                  Apply span tag
                </button>
              </div>
            </div>
            <p
              className="mt-3 text-xs font-bold leading-5 text-studio-muted"
              data-testid="studio-collab-span-summary"
            >
              Charlie spans: {charlieSpanSummary.spanCount}; Homer spans:{" "}
              {homerSpanSummary.spanCount}. Span offsets are synthetic text
              offsets only; overlapping spans are flattened later by the adapter.
            </p>
            <div
              className="mt-4 grid gap-3 rounded-xl border border-studio-line-strong bg-studio-ink/5 p-3"
              data-testid="studio-collab-review-note-controls"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={labelClassName}>Span review notes</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-studio-muted">
                    Review notes are annotations, not source text. They are
                    synthetic, local-only, separate from presence, and not saved
                    to production Manuscript Desk.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StudioChip tone="tag">
                    {reviewNoteSummary.openCount} open
                  </StudioChip>
                  <StudioChip tone="review">
                    {reviewNoteSummary.addressedCount} addressed
                  </StudioChip>
                  <StudioChip>{reviewNoteSummary.archivedCount} archived</StudioChip>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1.3fr_0.7fr_1.5fr_auto]">
                <label className="grid gap-1">
                  <span className={labelClassName}>Span</span>
                  <select
                    className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                    value={selectedReviewSpan?.spanId ?? ""}
                    onChange={(event) =>
                      setReviewNoteForm((current) => ({
                        ...current,
                        spanId: event.currentTarget.value,
                      }))
                    }
                    disabled={!availableSpans.length}
                  >
                    {availableSpans.length ? (
                      availableSpans.map((span) => (
                        <option key={span.spanId} value={span.spanId}>
                          {span.label} - {span.blockId}
                        </option>
                      ))
                    ) : (
                      <option value="">Create a synthetic span first</option>
                    )}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className={labelClassName}>Author</span>
                  <select
                    className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 text-sm font-bold text-studio-ink"
                    value={reviewNoteForm.authorId}
                    onChange={(event) =>
                      setReviewNoteForm((current) => ({
                        ...current,
                        authorId: event.currentTarget
                          .value as StudioCollaborationReviewNoteAuthorId,
                      }))
                    }
                  >
                    <option value="charlie">Charlie</option>
                    <option value="homer">Homer</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className={labelClassName}>Note body</span>
                  <textarea
                    className="min-h-10 rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2 text-sm font-bold text-studio-ink"
                    value={reviewNoteForm.body}
                    onChange={(event) =>
                      setReviewNoteForm((current) => ({
                        ...current,
                        body: event.currentTarget.value,
                      }))
                    }
                  />
                </label>
                <div className="grid items-end">
                  <button
                    type="button"
                    className={buttonClassName}
                    data-testid="studio-collab-add-review-note"
                    onClick={addReviewNoteFromForm}
                    disabled={!selectedReviewSpan}
                  >
                    Add review note
                  </button>
                </div>
              </div>

              <div
                className="grid gap-2"
                data-testid="studio-collab-review-note-list"
              >
                {selectedReviewSpan ? (
                  <p className="text-xs font-bold leading-5 text-studio-muted">
                    Selected span: {selectedReviewSpan.label}. Future durable
                    annotation rules still need checkpoint and rollback design.
                  </p>
                ) : (
                  <p className="text-xs font-bold leading-5 text-studio-muted">
                    Add and sync a synthetic span before adding local review
                    notes.
                  </p>
                )}
                {selectedReviewNotes.length ? (
                  selectedReviewNotes.map((note) => (
                    <div
                      key={note.noteId}
                      className={cn(cardClassName, "grid gap-2 p-3")}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold leading-6 text-studio-ink">
                          {note.authorId}: {note.body}
                        </p>
                        <StudioChip
                          tone={note.status === "open" ? "tag" : "review"}
                        >
                          {note.status}
                        </StudioChip>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClassName}
                          onClick={() =>
                            updateReviewNoteStatus(
                              note.noteId,
                              "addressed",
                              "homer",
                            )
                          }
                        >
                          Mark addressed
                        </button>
                        <button
                          type="button"
                          className={dangerButtonClassName}
                          onClick={() =>
                            updateReviewNoteStatus(
                              note.noteId,
                              "archived",
                              "charlie",
                            )
                          }
                        >
                          Archive note
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-bold leading-5 text-studio-muted">
                    No local review notes for the selected span.
                  </p>
                )}
              </div>
            </div>
            <div
              className="mt-4 grid gap-3 rounded-xl border border-studio-line-strong bg-studio-ink/5 p-3"
              data-testid="studio-collab-annotation-durability"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={labelClassName}>
                    Annotation durability decision
                  </p>
                  <p className="mt-1 text-xs font-bold leading-5 text-studio-muted">
                    No persistence has been added. Review notes remain
                    React-only while the future durable model is kept separate
                    from source text and manual snapshots.
                  </p>
                </div>
                <StudioChip tone="review">
                  primary:{" "}
                  {annotationDecision.recommendation.recommendedPrimaryStore}
                </StudioChip>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {annotationDecision.options.map((option) => (
                  <div
                    key={option.option}
                    className="rounded-lg border border-studio-line bg-[#0f1512] p-3"
                  >
                    <p className="text-sm font-black text-studio-ink">
                      {option.label}
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-studio-muted">
                      {option.summary}
                    </p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-studio-source">
                      Score {option.totalScore} / risk {option.primaryStoreRisk}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs font-bold leading-5 text-studio-muted">
                Recommended path: use an annotation event log for operations and
                audit trail, a separate annotation store for current review
                state, and let manual snapshots reference annotation
                state/version instead of becoming comment warehouses.
              </p>
            </div>
            <p
              className="mt-3 text-sm font-bold text-studio-muted"
              data-testid="studio-collab-last-action"
            >
              {lab.lastAction}
            </p>
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <ClientPanel
            title="Charlie"
            summary={charlieSummary}
            onTextEdit={(blockId, nextText) => {
              applySyntheticTextEdit(lab.charlie, blockId, nextText);
              refresh(`Charlie edited ${blockId}.`);
            }}
          />
          <ClientPanel
            title="Homer"
            summary={homerSummary}
            onTextEdit={(blockId, nextText) => {
              applySyntheticTextEdit(lab.homer, blockId, nextText);
              refresh(`Homer edited ${blockId}.`);
            }}
          />
        </div>

        <section className={cn(panelClassName, "mt-5")}>
          <label className="grid gap-2">
            <span className={labelClassName}>Exported synthetic snapshot JSON</span>
            <textarea
              readOnly
              className="min-h-[260px] w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 font-mono text-xs leading-6 text-studio-ink"
              data-testid="studio-collab-exported-json"
              value={lab.exportedSnapshotJson}
              placeholder="Click Export synthetic snapshot to inspect the local-only checkpoint shape."
            />
          </label>
        </section>

        <section
          className={cn(panelClassName, "mt-5")}
          data-testid="studio-collab-checkpoint-bridge"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={labelClassName}>Local checkpoint bridge</p>
              <h2 className={panelTitleClassName}>
                Collaboration checkpoint roundtrip
              </h2>
              <p className={panelCopyClassName}>
                Create a synthetic checkpoint from the local Yjs lab, validate
                it, and import it into a new synthetic client. This is not a
                production manuscript snapshot, does not write server state,
                does not touch manual snapshots, and does not autosave.
              </p>
            </div>
            <StudioChip tone="review">not production snapshots</StudioChip>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClassName}
              data-testid="studio-collab-create-checkpoint"
              onClick={createCheckpoint}
            >
              Create synthetic checkpoint
            </button>
            <button
              type="button"
              className={buttonClassName}
              data-testid="studio-collab-import-checkpoint"
              onClick={importCheckpoint}
              disabled={!lab.checkpointJson}
            >
              Import checkpoint back into new synthetic client
            </button>
            <button
              type="button"
              className={dangerButtonClassName}
              data-testid="studio-collab-clear-checkpoint"
              onClick={clearCheckpoint}
            >
              Clear checkpoint
            </button>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Checkpoint blocks</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.checkpointSummary?.blockCount ?? 0}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Checkpoint tags</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.checkpointSummary?.tagCount ?? 0}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Production snapshot</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.checkpointSummary?.productionSnapshot ? "yes" : "no"}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Imported client tags</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.importedCheckpointSummary?.tagCount ?? 0}
                </p>
              </div>
            </div>
          </div>

          {lab.importedCheckpointSummary ? (
            <div
              className={cn(cardClassName, "mt-4 p-3")}
              data-testid="studio-collab-imported-checkpoint-summary"
            >
              <p className={labelClassName}>Imported-client summary</p>
              <p className="mt-2 text-sm font-bold leading-6 text-studio-muted">
                {lab.importedCheckpointSummary.clientName}:{" "}
                {lab.importedCheckpointSummary.blockCount} blocks,{" "}
                {lab.importedCheckpointSummary.tagCount} tags,{" "}
                {lab.importedCheckpointSummary.emptyBlockCount} empty blocks.
              </p>
            </div>
          ) : null}

          <label className="mt-4 grid gap-2">
            <span className={labelClassName}>Synthetic checkpoint JSON</span>
            <textarea
              className="min-h-[260px] w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 font-mono text-xs leading-6 text-studio-ink"
              data-testid="studio-collab-checkpoint-json"
              value={lab.checkpointJson}
              onChange={(event) =>
                updateCheckpointState({
                  message: "Local checkpoint JSON edited in browser state only.",
                  checkpointJson: event.currentTarget.value,
                  checkpointSummary: null,
                  importedCheckpointSummary: null,
                })
              }
              placeholder="Create a synthetic checkpoint to inspect the bridge shape."
              spellCheck={false}
            />
          </label>
        </section>

        <section
          className={cn(panelClassName, "mt-5")}
          data-testid="studio-collab-manuscript-adapter"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={labelClassName}>Manuscript adapter bridge</p>
              <h2 className={panelTitleClassName}>
                Synthetic Manuscript Desk draft subset
              </h2>
              <p className={panelCopyClassName}>
                Convert a local collaboration checkpoint into a synthetic
                Manuscript Desk-compatible draft subset, validate it, and
                convert it back into a synthetic collaboration checkpoint/client.
                This is not production Manuscript Desk import, does not write
                server state, does not touch manual snapshots, and does not
                autosave.
              </p>
            </div>
            <StudioChip tone="review">synthetic adapter only</StudioChip>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClassName}
              data-testid="studio-collab-create-adapter"
              onClick={createAdapterPayloadFromCheckpoint}
            >
              Create synthetic Manuscript adapter payload from checkpoint
            </button>
            <button
              type="button"
              className={buttonClassName}
              data-testid="studio-collab-validate-adapter"
              onClick={validateAdapterPayload}
              disabled={!lab.adapterJson}
            >
              Validate adapter payload
            </button>
            <button
              type="button"
              className={buttonClassName}
              data-testid="studio-collab-roundtrip-adapter"
              onClick={roundtripAdapterPayload}
              disabled={!lab.adapterJson}
            >
              Convert adapter back to collaboration client
            </button>
            <button
              type="button"
              className={dangerButtonClassName}
              data-testid="studio-collab-clear-adapter"
              onClick={clearAdapterPayload}
            >
              Clear adapter
            </button>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Adapter blocks</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.adapterSummary?.blockCount ?? 0}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Adapter tags</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.adapterSummary?.tagCount ?? 0}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Production import</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.adapterSummary?.productionImport ? "yes" : "no"}
                </p>
              </div>
            </div>
            <div className={cardClassName}>
              <div className="p-3">
                <p className={labelClassName}>Roundtrip tags</p>
                <p className="mt-2 text-2xl font-black text-studio-ink">
                  {lab.adapterRoundtripSummary?.tagCount ?? 0}
                </p>
              </div>
            </div>
          </div>

          {lab.adapterSummary ? (
            <div
              className={cn(cardClassName, "mt-4 p-3")}
              data-testid="studio-collab-adapter-summary"
            >
              <p className={labelClassName}>Adapter summary</p>
              <p className="mt-2 text-sm font-bold leading-6 text-studio-muted">
                {lab.adapterSummary.title}: {lab.adapterSummary.blockCount}{" "}
                blocks, {lab.adapterSummary.tagCount} tags,{" "}
                {lab.adapterSummary.emptyBlockCount} empty blocks. The adapted
                draft is a subset only: title, ordered blocks, block IDs, text,
                synthetic tags, and provenance metadata.
              </p>
              <p className="mt-2 text-xs font-bold leading-5 text-studio-muted">
                Gaps: {lab.adapterSummary.gaps.join(" ")}
              </p>
            </div>
          ) : null}

          {lab.adapterRoundtripSummary ? (
            <div
              className={cn(cardClassName, "mt-4 p-3")}
              data-testid="studio-collab-adapter-roundtrip-summary"
            >
              <p className={labelClassName}>Roundtrip synthetic client</p>
              <p className="mt-2 text-sm font-bold leading-6 text-studio-muted">
                {lab.adapterRoundtripSummary.clientName}:{" "}
                {lab.adapterRoundtripSummary.blockCount} blocks,{" "}
                {lab.adapterRoundtripSummary.tagCount} tags,{" "}
                {lab.adapterRoundtripSummary.emptyBlockCount} empty blocks.
              </p>
            </div>
          ) : null}

          <label className="mt-4 grid gap-2">
            <span className={labelClassName}>Synthetic Manuscript adapter JSON</span>
            <textarea
              className="min-h-[300px] w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 font-mono text-xs leading-6 text-studio-ink"
              data-testid="studio-collab-adapter-json"
              value={lab.adapterJson}
              onChange={(event) =>
                updateAdapterState({
                  message: "Synthetic adapter JSON edited in browser state only.",
                  adapterJson: event.currentTarget.value,
                  adapterSummary: null,
                  adapterRoundtripSummary: null,
                })
              }
              placeholder="Create a synthetic Manuscript adapter payload to inspect the safe subset."
              spellCheck={false}
            />
          </label>
        </section>
      </section>
    </main>
  );
}
