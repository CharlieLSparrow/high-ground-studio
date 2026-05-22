"use client";

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

type LabState = {
  charlie: StudioCollaborationClient;
  homer: StudioCollaborationClient;
  revision: number;
  exportedSnapshotJson: string;
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
    lastAction: "Synthetic collaboration lab initialized.",
  };
}

const buttonClassName =
  "min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.8rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10";

const dangerButtonClassName =
  "min-h-10 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-3 py-2 text-[0.8rem] font-extrabold text-studio-danger transition hover:bg-studio-danger/15";

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
      <div className="mt-4 grid gap-3 md:grid-cols-4">
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

  function refresh(message: string, exportedSnapshotJson = lab.exportedSnapshotJson) {
    setLab((current) => ({
      ...current,
      revision: current.revision + 1,
      exportedSnapshotJson,
      lastAction: message,
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
                onClick={() => setLab(createInitialLabState())}
              >
                Reset lab
              </button>
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
      </section>
    </main>
  );
}
