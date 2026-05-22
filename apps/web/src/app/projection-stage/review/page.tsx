import Link from "next/link";

import {
  groupHgoProjectionsByReviewState,
  type HgoProjectionReviewGate,
  type HgoProjectionReviewIssue,
} from "@/lib/hgo/projection-review-gate";
import { listHgoEpisodeProjections } from "@/lib/hgo/projection-repository";

export const metadata = {
  title: "Projection Review Gate | High Ground Odyssey",
  description:
    "Synthetic-only staged projection review gate for promotion-readiness testing.",
};

const issueStyles: Record<HgoProjectionReviewIssue["severity"], string> = {
  blocker: "border-rose-300/35 bg-rose-300/10 text-rose-100",
  warning: "border-amber-300/35 bg-amber-300/10 text-amber-100",
  info: "border-sky-300/35 bg-sky-300/10 text-sky-100",
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

function IssueList({
  issues,
}: {
  issues: HgoProjectionReviewIssue[];
}) {
  if (!issues.length) {
    return (
      <p className="mt-4 text-sm font-bold text-emerald-100">
        No blocking issues in this group.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {issues.map((issue) => (
        <div
          key={issue.id}
          className={`rounded-[18px] border p-4 ${issueStyles[issue.severity]}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill className={issueStyles[issue.severity]}>
              {issue.severity}
            </Pill>
            {issue.blocksLivePromotion ? (
              <Pill className="border-rose-300/35 bg-rose-300/10 text-rose-100">
                blocks live
              </Pill>
            ) : null}
          </div>
          <h4 className="mt-3 text-base font-black">{issue.title}</h4>
          <p className="mt-2 text-sm leading-6 opacity-90">{issue.detail}</p>
        </div>
      ))}
    </div>
  );
}

function ProjectionGateCard({
  gate,
}: {
  gate: HgoProjectionReviewGate;
}) {
  const topBlockers = gate.issues
    .filter((issue) => issue.blocksLivePromotion)
    .slice(0, 3);
  const topWarnings = gate.issues
    .filter((issue) => issue.severity === "warning")
    .slice(0, 2);

  return (
    <article className="rounded-[26px] border border-white/10 bg-white/7 p-5 shadow-glass">
      <div className="flex flex-wrap gap-2">
        <Pill className="border-white/12 bg-white/8 text-subject-muted">
          {gate.status}
        </Pill>
        <Pill className="border-white/12 bg-white/8 text-subject-muted">
          {gate.visibility}
        </Pill>
        <Pill
          className={
            gate.canPromoteToLive
              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/35 bg-amber-300/10 text-amber-100"
          }
        >
          {gate.canPromoteToLive ? "promotion-ready" : "promotion blocked"}
        </Pill>
      </div>
      <h3 className="mt-4 text-2xl font-black leading-tight">
        {gate.projection.title}
      </h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
          <p className="text-xs font-bold uppercase text-subject-muted">Blockers</p>
          <p className="mt-2 text-3xl font-black">{gate.blockerCount}</p>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
          <p className="text-xs font-bold uppercase text-subject-muted">Warnings</p>
          <p className="mt-2 text-3xl font-black">{gate.warningCount}</p>
        </div>
      </div>
      <IssueList issues={topBlockers.length ? topBlockers : topWarnings} />
      <Link
        href={`/projection-stage/${gate.projection.slug}`}
        className="mt-5 inline-flex rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
      >
        Open staged page
      </Link>
    </article>
  );
}

function ReviewGroup({
  id,
  title,
  description,
  gates,
}: {
  id: string;
  title: string;
  description: string;
  gates: HgoProjectionReviewGate[];
}) {
  return (
    <section
      className="mx-auto max-w-[1200px] px-5 py-8 md:px-8"
      data-testid={`hgo-review-group-${id}`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-flare">{title}</p>
          <h2 className="mt-2 text-3xl font-black text-subject">
            {gates.length.toLocaleString()} projection{gates.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-subject-muted">
            {description}
          </p>
        </div>
      </div>

      {gates.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {gates.map((gate) => (
            <ProjectionGateCard key={gate.projection.id} gate={gate} />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-white/10 bg-white/7 p-5 text-sm font-bold text-subject-muted">
          No projections are in this group yet.
        </div>
      )}
    </section>
  );
}

export default function ProjectionStageReviewPage() {
  const groups = groupHgoProjectionsByReviewState(listHgoEpisodeProjections());
  const totalBlocked = groups.blocked.reduce(
    (count, gate) => count + gate.blockerCount,
    0,
  );
  const totalWarnings = [
    ...groups.blocked,
    ...groups.needsReview,
    ...groups.liveSafe,
  ].reduce((count, gate) => count + gate.warningCount, 0);

  return (
    <main
      className="min-h-screen bg-void text-subject"
      data-testid="hgo-stage-review-gate"
    >
      <section className="border-b border-white/8 bg-[radial-gradient(circle_at_16%_18%,rgba(255,122,24,0.22),transparent_31%),linear-gradient(135deg,#050d10_0%,#10252a_56%,#1d1811_100%)]">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-14 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:py-20">
          <div>
            <div className="mb-5 flex flex-wrap gap-2">
              <Pill className="border-flare/35 bg-flare/12 text-flare">
                Review gate
              </Pill>
              <Pill className="border-white/15 bg-white/8 text-subject-muted">
                Synthetic-only
              </Pill>
              <Pill className="border-white/15 bg-white/8 text-subject-muted">
                No publish action
              </Pill>
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.96] text-subject md:text-7xl">
              Promotion readiness without publishing.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-subject-muted md:text-xl">
              This synthetic review gate groups staged HGO projections by
              blocker state and live-safety readiness. It prepares the future
              staged-to-live workflow, but it does not publish, persist, or
              replace public `/episodes`.
            </p>
            <p className="mt-5 max-w-2xl text-sm font-black leading-6 text-amber-100">
              Promote to live will require a later approved workflow.
            </p>
            <Link
              href="/projection-stage/import"
              className="mt-5 inline-flex rounded-full border border-sky-300/35 bg-sky-300/12 px-4 py-2 text-sm font-bold text-sky-100 no-underline transition hover:bg-sky-300/18"
            >
              Review pasted projection JSON
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill className="border-sky-300/25 bg-sky-300/8 text-sky-100">
                No persistence
              </Pill>
              <Pill className="border-sky-300/25 bg-sky-300/8 text-sky-100">
                No publish action
              </Pill>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-glass backdrop-blur">
            <p className="text-sm font-black uppercase text-flare">
              Gate summary
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 p-4">
                <p className="text-xs font-bold uppercase text-rose-100">
                  Blocked
                </p>
                <p className="mt-2 text-3xl font-black">{groups.blocked.length}</p>
              </div>
              <div className="rounded-[18px] border border-amber-300/20 bg-amber-300/10 p-4">
                <p className="text-xs font-bold uppercase text-amber-100">
                  Needs review
                </p>
                <p className="mt-2 text-3xl font-black">
                  {groups.needsReview.length}
                </p>
              </div>
              <div className="rounded-[18px] border border-emerald-300/20 bg-emerald-300/10 p-4">
                <p className="text-xs font-bold uppercase text-emerald-100">
                  Live-safe
                </p>
                <p className="mt-2 text-3xl font-black">{groups.liveSafe.length}</p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                <p className="text-xs font-bold uppercase text-subject-muted">
                  Issues
                </p>
                <p className="mt-2 text-3xl font-black">
                  {totalBlocked + totalWarnings}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ReviewGroup
        id="blocked"
        title="Blocked"
        description="These synthetic projections have blocker issues that must prevent live promotion."
        gates={groups.blocked}
      />
      <ReviewGroup
        id="needs-review"
        title="Needs review"
        description="These projections have non-blocking warnings and still need human review before any future workflow should promote them."
        gates={groups.needsReview}
      />
      <ReviewGroup
        id="live-safe"
        title="Live-safe"
        description="These projections have no live-blocking issues under the current synthetic rules. Promotion still requires a later approved workflow."
        gates={groups.liveSafe}
      />
    </main>
  );
}
