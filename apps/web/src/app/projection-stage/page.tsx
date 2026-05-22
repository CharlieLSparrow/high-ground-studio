import Link from "next/link";

import {
  getHgoProjectionRepositoryStats,
  listHgoEpisodeProjections,
  listHgoProjectionScopes,
  listHgoProjectionStatuses,
} from "@/lib/hgo/projection-repository";
import { createHgoProjectionReviewGate } from "@/lib/hgo/projection-review-gate";
import type {
  HgoProjectionStatus,
  HgoProjectionVisibility,
} from "@/lib/hgo/projection-types";

export const metadata = {
  title: "Projection Stage | High Ground Odyssey",
  description:
    "Synthetic-only staged HGO projection surface for review architecture testing.",
};

const statusStyles: Record<HgoProjectionStatus, string> = {
  synthetic: "border-sky-300/35 bg-sky-300/10 text-sky-100",
  staged: "border-amber-300/35 bg-amber-300/10 text-amber-100",
  live: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
  archived: "border-zinc-300/25 bg-zinc-300/8 text-zinc-200",
};

const visibilityStyles: Record<HgoProjectionVisibility, string> = {
  private: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  staged: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  public: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
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

export default function ProjectionStagePage() {
  const projections = listHgoEpisodeProjections();
  const stats = getHgoProjectionRepositoryStats();
  const statuses = listHgoProjectionStatuses();
  const scopes = listHgoProjectionScopes();

  return (
    <main className="min-h-screen bg-void text-subject" data-testid="hgo-stage-map">
      <section className="relative isolate overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_18%,rgba(255,122,24,0.22),transparent_31%),radial-gradient(circle_at_78%_20%,rgba(82,190,176,0.2),transparent_34%),linear-gradient(135deg,#050d10_0%,#10252a_56%,#1d1811_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-[linear-gradient(180deg,transparent,#051014)]" />
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-14 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:py-20">
          <div>
            <div className="mb-5 flex flex-wrap gap-2">
              <Pill className="border-flare/35 bg-flare/12 text-flare">
                Staged projection surface
              </Pill>
              <Pill className="border-white/15 bg-white/8 text-subject-muted">
                Synthetic-only
              </Pill>
              <Pill className="border-white/15 bg-white/8 text-subject-muted">
                {stats.total} projections
              </Pill>
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.96] text-subject md:text-7xl">
              HGO as the review stage before public release.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-subject-muted md:text-xl">
              This surface uses synthetic projection fixtures to show how Studio
              output can become browseable HGO review pages. It is not public
              publishing, does not replace `/episodes`, and does not use real
              HGO or manuscript content.
            </p>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-amber-300/25 bg-amber-300/10 p-6 shadow-glass backdrop-blur">
            <p className="text-sm font-black uppercase text-amber-100">
              Review boundary
            </p>
            <p className="text-base leading-7 text-amber-50">
              Future staged projections may contain real projection text. Until
              public-safety and citation review pass, staged pages remain
              private/review-only and must not be treated as live HGO pages.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {statuses.map((status) => (
                <div
                  key={status}
                  className="rounded-[18px] border border-white/10 bg-void-light/55 p-4"
                >
                  <p className="text-xs font-bold uppercase text-subject-muted">
                    {status}
                  </p>
                  <p className="mt-2 text-3xl font-black">
                    {stats.byStatus[status]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-8 md:px-8">
        <div className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <Pill
              key={scope}
              className="border-white/12 bg-white/8 text-subject-muted"
            >
              {scope}: {stats.byScope[scope]}
            </Pill>
          ))}
          <Link
            href="/projection-stage/review"
            className="inline-flex rounded-full border border-amber-300/35 bg-amber-300/12 px-4 py-2 text-sm font-bold text-amber-100 no-underline transition hover:bg-amber-300/18"
          >
            Review gate
          </Link>
          <Link
            href="/projection-preview/import"
            className="inline-flex rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
          >
            Import JSON preview
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-5 px-5 pb-16 md:grid-cols-2 md:px-8">
        {projections.map((projection) => {
          const reviewGate = createHgoProjectionReviewGate(projection);
          const topBlocker = reviewGate.issues.find(
            (issue) => issue.blocksLivePromotion,
          );

          return (
            <Link
              key={projection.id}
              href={`/projection-stage/${projection.slug}`}
              className="group rounded-[28px] border border-white/10 bg-white/7 p-5 text-subject no-underline shadow-glass transition hover:-translate-y-1 hover:border-flare/35"
            >
              <div className="flex flex-wrap gap-2">
                <Pill className={statusStyles[projection.status]}>
                  {projection.status}
                </Pill>
                <Pill className={visibilityStyles[projection.visibility]}>
                  {projection.visibility}
                </Pill>
                <Pill
                  className={
                    reviewGate.isLiveSafe
                      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                      : "border-amber-300/35 bg-amber-300/10 text-amber-100"
                  }
                >
                  {reviewGate.isLiveSafe ? "live-safe" : "blocked"}
                </Pill>
              </div>

              <p className="mt-5 text-xs font-bold uppercase text-flare">
                {projection.episodeNumber}
              </p>
              <h2 className="mt-3 text-2xl font-black leading-tight group-hover:text-flare">
                {projection.title}
              </h2>
              <p className="mt-4 text-sm leading-6 text-subject-muted">
                {projection.subtitle}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                  <p className="text-xs font-bold uppercase text-subject-muted">
                    Blockers
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {reviewGate.blockerCount}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                  <p className="text-xs font-bold uppercase text-subject-muted">
                    Warnings
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {reviewGate.warningCount}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-sm font-bold text-amber-100">
                {topBlocker
                  ? topBlocker.detail
                  : "No live-blocking issues under the current synthetic review gate."}
              </p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
