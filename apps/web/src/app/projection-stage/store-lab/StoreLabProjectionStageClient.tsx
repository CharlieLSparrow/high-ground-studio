"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import ProjectionReviewGatePanel from "@/components/hgo/projection/ProjectionReviewGatePanel";
import {
  archiveHgoStoreLabRecord,
  createEmptyHgoStagedArtifactStoreLabState,
  createHgoStoreLabPromotionCandidate,
  getHgoStoreLabRecordById,
  importHgoArtifactIntoStoreLab,
  markHgoStoreLabRecordReviewed,
  summarizeHgoStoreLabState,
  type HgoStagedArtifactStoreLabResult,
  type HgoStagedArtifactStoreRecord,
  type HgoStagedArtifactStoreState,
} from "@/lib/hgo/staged-artifact-store-lab";

type ActionResult = {
  message: string;
  errors: string[];
  warnings: string[];
};

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function SummaryCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warning" | "blocker" | "candidate";
}) {
  const toneClassName =
    tone === "blocker"
      ? "border-rose-300/25 bg-rose-300/10"
      : tone === "warning"
        ? "border-amber-300/25 bg-amber-300/10"
        : tone === "candidate"
          ? "border-emerald-300/25 bg-emerald-300/10"
          : "border-white/10 bg-void-light/55";

  return (
    <div className={`rounded-[18px] border p-4 ${toneClassName}`}>
      <p className="text-xs font-bold uppercase text-subject-muted">{label}</p>
      <div className="mt-2 break-words text-2xl font-black">{value}</div>
    </div>
  );
}

function ResultPanel({ result }: { result: ActionResult | null }) {
  if (!result) {
    return null;
  }

  return (
    <div
      className="rounded-[20px] border border-white/12 bg-void-light/65 p-4 text-sm"
      data-testid="hgo-stage-store-lab-action-result"
    >
      <p className="font-black text-subject">{result.message}</p>
      {result.errors.length ? (
        <ul className="mt-3 grid gap-2 pl-5 text-rose-100">
          {result.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {result.warnings.length ? (
        <ul className="mt-3 grid gap-2 pl-5 text-amber-100">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RecordCard({
  record,
  isSelected,
  onSelect,
}: {
  record: HgoStagedArtifactStoreRecord;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-[24px] border p-5 text-left text-subject shadow-glass transition ${
        isSelected
          ? "border-flare/45 bg-flare/12"
          : "border-white/10 bg-white/7 hover:border-flare/30"
      }`}
      data-testid="hgo-stage-store-lab-record"
      onClick={onSelect}
    >
      <div className="flex flex-wrap gap-2">
        <Pill className="border-white/12 bg-white/8 text-subject-muted">
          {record.reviewStatus}
        </Pill>
        <Pill
          className={
            record.promotionReadiness === "candidate"
              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
              : record.promotionReadiness === "blocked"
                ? "border-rose-300/35 bg-rose-300/10 text-rose-100"
                : record.promotionReadiness === "archived"
                  ? "border-zinc-300/25 bg-zinc-300/8 text-zinc-200"
                  : "border-amber-300/35 bg-amber-300/10 text-amber-100"
          }
        >
          {record.promotionReadiness}
        </Pill>
      </div>
      <h3 className="mt-4 text-xl font-black leading-tight">
        {record.artifact.projection.title}
      </h3>
      <p className="mt-2 break-all font-mono text-xs text-subject-muted">
        {record.artifact.artifactId}
      </p>
      <p className="mt-3 text-sm font-bold text-subject-muted">
        {record.artifact.projection.slug}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[16px] border border-rose-300/20 bg-rose-300/10 p-3">
          <p className="text-xs font-bold uppercase text-rose-100">Blockers</p>
          <p className="mt-1 text-2xl font-black">{record.artifact.reviewGate.blockerCount}</p>
        </div>
        <div className="rounded-[16px] border border-amber-300/20 bg-amber-300/10 p-3">
          <p className="text-xs font-bold uppercase text-amber-100">Warnings</p>
          <p className="mt-1 text-2xl font-black">{record.artifact.reviewGate.warningCount}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[16px] border border-white/10 bg-void-light/55 p-3">
          <p className="text-xs font-bold uppercase text-subject-muted">
            Persisted
          </p>
          <p className="mt-1 text-xl font-black">
            {record.artifact.safety.persisted ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-[16px] border border-white/10 bg-void-light/55 p-3">
          <p className="text-xs font-bold uppercase text-subject-muted">
            Published
          </p>
          <p className="mt-1 text-xl font-black">
            {record.artifact.safety.published ? "Yes" : "No"}
          </p>
        </div>
      </div>
    </button>
  );
}

function EventLog({ record }: { record: HgoStagedArtifactStoreRecord }) {
  return (
    <div
      className="rounded-[24px] border border-white/10 bg-white/7 p-5"
      data-testid="hgo-stage-store-lab-event-log"
    >
      <p className="text-sm font-black uppercase text-flare">Event log</p>
      <div className="mt-4 grid gap-3">
        {record.events.map((event) => (
          <div
            key={event.eventId}
            className="rounded-[18px] border border-white/10 bg-void-light/55 p-4 text-sm"
          >
            <div className="flex flex-wrap gap-2">
              <Pill className="border-white/12 bg-white/8 text-subject-muted">
                {event.type}
              </Pill>
              <Pill className="border-white/12 bg-white/8 text-subject-muted">
                {event.reviewStatus}
              </Pill>
              <Pill className="border-white/12 bg-white/8 text-subject-muted">
                {event.promotionReadiness}
              </Pill>
            </div>
            <p className="mt-3 font-bold text-subject">{event.note}</p>
            <p className="mt-2 font-mono text-xs text-subject-muted">
              {event.createdAt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectedRecordPanel({
  record,
  onHumanReview,
  onApproved,
  onPromotionCandidate,
  onArchive,
}: {
  record: HgoStagedArtifactStoreRecord;
  onHumanReview: () => void;
  onApproved: () => void;
  onPromotionCandidate: () => void;
  onArchive: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-[1200px] px-5 py-10 md:px-8"
      data-testid="hgo-stage-store-lab-selected-record"
    >
      <div className="rounded-[28px] border border-sky-300/25 bg-sky-300/10 p-5 shadow-glass">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-black uppercase text-sky-100">
              Selected session record
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight">
              {record.artifact.projection.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-subject-muted">
              This session record wraps a browser artifact with temporary lab
              metadata. The embedded artifact still says persisted false and
              published false.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-amber-300/35 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-300/18"
              data-testid="hgo-stage-store-lab-mark-human-review"
              onClick={onHumanReview}
            >
              Mark human-review
            </button>
            <button
              type="button"
              className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-4 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/18"
              data-testid="hgo-stage-store-lab-mark-approved"
              onClick={onApproved}
            >
              Mark approved-for-future-staging
            </button>
            <button
              type="button"
              className="rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-sky-300/18"
              data-testid="hgo-stage-store-lab-create-candidate"
              onClick={onPromotionCandidate}
            >
              Create simulated promotion candidate
            </button>
            <button
              type="button"
              className="rounded-full border border-rose-300/35 bg-rose-300/12 px-4 py-2 text-sm font-bold text-rose-100 transition hover:bg-rose-300/18"
              data-testid="hgo-stage-store-lab-archive"
              onClick={onArchive}
            >
              Archive
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
          <SummaryCell label="Review status" value={record.reviewStatus} />
          <SummaryCell
            label="Promotion readiness"
            value={record.promotionReadiness}
            tone={
              record.promotionReadiness === "candidate"
                ? "candidate"
                : record.promotionReadiness === "blocked"
                  ? "blocker"
                  : "warning"
            }
          />
          <SummaryCell
            label="Persisted"
            value={record.artifact.safety.persisted ? "Yes" : "No"}
          />
          <SummaryCell
            label="Published"
            value={record.artifact.safety.published ? "Yes" : "No"}
          />
          <SummaryCell
            label="Artifact hash"
            value={<span className="font-mono text-xs">{record.artifactHash}</span>}
          />
          <SummaryCell
            label="Record id"
            value={<span className="font-mono text-xs">{record.recordId}</span>}
          />
          <SummaryCell
            label="Real content"
            value={record.artifact.safety.containsRealContent}
            tone="warning"
          />
          <SummaryCell
            label="Candidate"
            value={
              record.simulatedPromotionCandidate
                ? "simulated only"
                : "not created"
            }
          />
        </div>

        {record.simulatedPromotionCandidate ? (
          <p className="mt-5 rounded-[18px] border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm font-bold leading-6 text-emerald-100">
            Simulated promotion candidate created. This is not public publishing,
            did not create a public route, and remains session-only.
          </p>
        ) : (
          <p className="mt-5 rounded-[18px] border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-bold leading-6 text-amber-100">
            Create promotion candidate is simulated only and blocked unless the
            record is approved and has no live-blocking issues.
          </p>
        )}
      </div>
    </section>
  );
}

export default function StoreLabProjectionStageClient() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [rawArtifactJson, setRawArtifactJson] = useState("");
  const [storeState, setStoreState] = useState<HgoStagedArtifactStoreState>(() =>
    createEmptyHgoStagedArtifactStoreLabState(),
  );
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const summary = useMemo(
    () => summarizeHgoStoreLabState(storeState),
    [storeState],
  );
  const selectedRecord =
    selectedRecordId ? getHgoStoreLabRecordById(storeState, selectedRecordId) : null;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function applyResult(result: HgoStagedArtifactStoreLabResult, message: string) {
    setStoreState(result.state);
    setActionResult({
      message,
      errors: result.errors,
      warnings: result.warnings,
    });

    if (result.record) {
      setSelectedRecordId(result.record.recordId);
    }
  }

  function importArtifact() {
    const result = importHgoArtifactIntoStoreLab(storeState, rawArtifactJson, {
      note: "Imported into browser session store lab. No persistence or publish action occurred.",
    });

    applyResult(
      result,
      result.ok
        ? "Artifact imported into session store lab. No persistence happened."
        : "Artifact import was rejected by the session store lab.",
    );
  }

  function selectedRecordAction(
    action: (recordId: string) => HgoStagedArtifactStoreLabResult,
    successMessage: string,
    failureMessage: string,
  ) {
    if (!selectedRecord) {
      setActionResult({
        message: "Select a Store Lab record first.",
        errors: ["No session record is selected."],
        warnings: [],
      });
      return;
    }

    const result = action(selectedRecord.recordId);

    applyResult(result, result.ok ? successMessage : failureMessage);
  }

  return (
    <div className="min-h-screen bg-void text-subject">
      {isHydrated ? (
        <span className="sr-only" data-testid="hgo-stage-store-lab-hydrated">
          Staged artifact store lab is ready for browser input.
        </span>
      ) : null}

      <section
        className="border-b border-white/8 bg-[radial-gradient(circle_at_16%_15%,rgba(82,190,176,0.22),transparent_31%),linear-gradient(135deg,#050d10_0%,#10252a_58%,#1d1811_100%)]"
        data-testid="hgo-stage-store-lab"
      >
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-16">
          <div>
            <p className="text-xs font-bold uppercase text-flare">
              Session store lab
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] md:text-6xl">
              Model a private staged artifact store without persistence.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-subject-muted md:text-lg">
              Paste a staged artifact JSON packet to simulate how a future
              private store might import, review, archive, and mark promotion
              candidates. This route is browser-session only.
            </p>
            <div className="mt-5 grid gap-3 rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5 text-sm font-bold leading-6 text-amber-100">
              <p>Session-only store lab.</p>
              <p>No persistence. No localStorage. No server writes.</p>
              <p>No publish action. No public route is created.</p>
              <p>Future private store may use this lifecycle shape later.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/projection-stage"
                className="inline-flex rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
              >
                Back to staged map
              </Link>
              <Link
                href="/projection-stage/import"
                className="inline-flex rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 no-underline transition hover:bg-sky-300/18"
              >
                Create staged artifact JSON
              </Link>
              <Link
                href="/projection-stage/artifact"
                className="inline-flex rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 no-underline transition hover:bg-sky-300/18"
              >
                Inspect staged artifact JSON
              </Link>
              <Link
                href="/projection-stage/review"
                className="inline-flex rounded-full border border-amber-300/35 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 no-underline transition hover:bg-amber-300/18"
              >
                Review fixture gate
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-glass backdrop-blur">
            <label className="grid gap-2">
              <span className="text-sm font-black uppercase text-flare">
                Staged artifact JSON
              </span>
              <textarea
                className="min-h-[280px] w-full resize-y rounded-[18px] border border-white/12 bg-void-light/80 px-4 py-3 font-mono text-xs leading-6 text-subject outline-none focus:border-flare/45"
                data-testid="hgo-stage-store-lab-artifact-json"
                value={rawArtifactJson}
                onChange={(event) => setRawArtifactJson(event.target.value)}
                onInput={(event) =>
                  setRawArtifactJson(event.currentTarget.value)
                }
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare transition hover:bg-flare/18"
              data-testid="hgo-stage-store-lab-import"
              onClick={importArtifact}
            >
              Import artifact into session store
            </button>
            <ResultPanel result={actionResult} />
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-[1200px] px-5 py-8 md:px-8"
        data-testid="hgo-stage-store-lab-summary"
      >
        <div className="grid gap-3 text-sm md:grid-cols-5">
          <SummaryCell label="Total records" value={summary.totalRecords} />
          <SummaryCell
            label="Blocked"
            value={summary.blocked}
            tone="blocker"
          />
          <SummaryCell
            label="Review-needed"
            value={summary.reviewNeeded}
            tone="warning"
          />
          <SummaryCell
            label="Candidate"
            value={summary.candidate}
            tone="candidate"
          />
          <SummaryCell label="Archived" value={summary.archived} />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-5 px-5 pb-10 md:grid-cols-2 md:px-8">
        {storeState.records.length ? (
          storeState.records.map((record) => (
            <RecordCard
              key={record.recordId}
              record={record}
              isSelected={selectedRecordId === record.recordId}
              onSelect={() => setSelectedRecordId(record.recordId)}
            />
          ))
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/7 p-5 text-sm font-bold leading-6 text-subject-muted">
            No session artifacts imported yet. Paste a browser-created staged
            artifact JSON packet to model the future private store lifecycle.
          </div>
        )}
      </section>

      {selectedRecord ? (
        <>
          <SelectedRecordPanel
            record={selectedRecord}
            onHumanReview={() =>
              selectedRecordAction(
                (recordId) =>
                  markHgoStoreLabRecordReviewed(
                    storeState,
                    recordId,
                    "human-review",
                    {
                      note: "Marked human-review in session store lab.",
                    },
                  ),
                "Record marked human-review in session store lab.",
                "Record could not be marked human-review.",
              )
            }
            onApproved={() =>
              selectedRecordAction(
                (recordId) =>
                  markHgoStoreLabRecordReviewed(
                    storeState,
                    recordId,
                    "approved-for-future-staging",
                    {
                      note: "Marked approved-for-future-staging in session store lab.",
                    },
                  ),
                "Record marked approved-for-future-staging in session store lab.",
                "Record could not be marked approved-for-future-staging.",
              )
            }
            onPromotionCandidate={() =>
              selectedRecordAction(
                (recordId) =>
                  createHgoStoreLabPromotionCandidate(storeState, recordId, {
                    note: "Simulated promotion candidate attempted. This is not public publishing.",
                  }),
                "Simulated promotion candidate created. Not public and not published.",
                "Simulated promotion candidate blocked. Not public and not published.",
              )
            }
            onArchive={() =>
              selectedRecordAction(
                (recordId) =>
                  archiveHgoStoreLabRecord(storeState, recordId, {
                    note: "Archived in session store lab.",
                  }),
                "Record archived in session store lab.",
                "Record could not be archived.",
              )
            }
          />

          <section className="mx-auto grid max-w-[1200px] gap-5 px-5 pb-10 md:grid-cols-[0.9fr_1.1fr] md:px-8">
            <EventLog record={selectedRecord} />
            <ProjectionReviewGatePanel
              gate={selectedRecord.artifact.reviewGate}
              testId="hgo-stage-store-lab-review-gate"
            />
          </section>

          <div data-testid="hgo-stage-store-lab-rendered-projection">
            <EpisodeProjectionView
              key={selectedRecord.artifact.projection.id}
              projection={selectedRecord.artifact.projection}
              allProjections={[selectedRecord.artifact.projection]}
              projectionBasePath="/projection-stage"
              projectionMapHref="/projection-stage"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
