import Link from "next/link";

import {
  getFilteredSyntheticEpisodeProjections,
  getSyntheticProjectionMapStats,
  syntheticEpisodeProjections,
} from "@/lib/hgo/synthetic-episode-projection";
import {
  HGO_PROJECTION_FILTERS,
  type HgoProjectionFilter,
  type HgoProjectionStatus,
  type HgoProjectionVisibility,
} from "@/lib/hgo/projection-types";

export const metadata = {
  title: "Projection Preview Map | High Ground Odyssey",
  description:
    "Synthetic-only High Ground Odyssey projection map for staged episode and book page previews.",
};

type SearchParams = Promise<{
  scope?: string;
}>;

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

function normalizeFilter(filter?: string): HgoProjectionFilter {
  const allowed = new Set(HGO_PROJECTION_FILTERS.map((item) => item.id));

  return allowed.has(filter as HgoProjectionFilter)
    ? (filter as HgoProjectionFilter)
    : "all";
}

function MiniPill({
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

export default async function ProjectionPreviewMapPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { scope } = await searchParams;
  const activeFilter = normalizeFilter(scope);
  const filteredProjections = getFilteredSyntheticEpisodeProjections(activeFilter);
  const stats = getSyntheticProjectionMapStats();
  const activeFilterMeta =
    HGO_PROJECTION_FILTERS.find((filter) => filter.id === activeFilter) ??
    HGO_PROJECTION_FILTERS[0];

  return (
    <main className="min-h-screen bg-void text-subject">
      <section className="relative isolate overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_20%,rgba(255,122,24,0.24),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(82,190,176,0.18),transparent_34%),linear-gradient(135deg,#050d10_0%,#10252a_54%,#1d1811_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-[linear-gradient(180deg,transparent,#051014)]" />
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-14 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:py-20">
          <div>
            <div className="mb-5 flex flex-wrap gap-2">
              <MiniPill className="border-flare/35 bg-flare/12 text-flare">
                Synthetic projection system
              </MiniPill>
              <MiniPill className="border-white/15 bg-white/8 text-subject-muted">
                {stats.total} pages
              </MiniPill>
              <MiniPill className="border-white/15 bg-white/8 text-subject-muted">
                Studio-driven
              </MiniPill>
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.96] text-subject md:text-7xl">
              Book and episode work, visible before release.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-subject-muted md:text-xl">
              This map demonstrates HGO as the staged/public projection surface
              for Studio. Every card is fake data, but the lifecycle, filters,
              and renderer contract are the system shape.
            </p>
          </div>

          <div className="rounded-[32px] border border-white/12 bg-white/9 p-6 shadow-glass backdrop-blur">
            <p className="text-sm font-bold uppercase text-flare">Current filter</p>
            <h2 className="mt-3 text-3xl font-black text-subject">
              {activeFilterMeta.label}
            </h2>
            <p className="mt-3 text-sm leading-6 text-subject-muted">
              {activeFilterMeta.description}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                <p className="text-xs font-bold uppercase text-subject-muted">Staged</p>
                <p className="mt-2 text-3xl font-black">{stats.byStatus.staged}</p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                <p className="text-xs font-bold uppercase text-subject-muted">Live</p>
                <p className="mt-2 text-3xl font-black">{stats.byStatus.live}</p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                <p className="text-xs font-bold uppercase text-subject-muted">Internal</p>
                <p className="mt-2 text-3xl font-black">{stats.byScope.internal}</p>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-void-light/55 p-4">
                <p className="text-xs font-bold uppercase text-subject-muted">Both</p>
                <p className="mt-2 text-3xl font-black">
                  {stats.byScope["book-and-episode"]}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {HGO_PROJECTION_FILTERS.map((filter) => {
            const href =
              filter.id === "all"
                ? "/projection-preview"
                : `/projection-preview?scope=${filter.id}`;
            const isActive = filter.id === activeFilter;

            return (
              <Link
                key={filter.id}
                href={href}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-bold no-underline transition",
                  isActive
                    ? "border-flare/40 bg-flare/18 text-flare"
                    : "border-white/12 bg-white/7 text-subject-muted hover:border-flare/35 hover:text-flare",
                ].join(" ")}
              >
                {filter.label}
              </Link>
            );
          })}
          <Link
            href="/projection-preview/import"
            className="rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare no-underline transition hover:bg-flare/18"
          >
            Import JSON
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-5 px-5 pb-14 md:grid-cols-2 md:px-8 xl:grid-cols-4">
        {filteredProjections.map((projection) => (
          <Link
            key={projection.id}
            href={`/projection-preview/${projection.slug}`}
            className="group rounded-[28px] border border-white/10 bg-white/7 p-5 text-subject no-underline shadow-glass transition hover:-translate-y-1 hover:border-flare/35"
          >
            <div className="flex flex-wrap gap-2">
              <MiniPill className={statusStyles[projection.status]}>
                {projection.status}
              </MiniPill>
              <MiniPill className={visibilityStyles[projection.visibility]}>
                {projection.visibility}
              </MiniPill>
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
            <div className="mt-5 flex flex-wrap gap-2">
              {projection.scopes.map((scopeItem) => (
                <MiniPill
                  key={scopeItem}
                  className="border-white/12 bg-white/8 text-subject-muted"
                >
                  {scopeItem}
                </MiniPill>
              ))}
            </div>
          </Link>
        ))}
      </section>

      <section className="border-y border-white/8 bg-paper text-[#211912]">
        <div className="mx-auto max-w-[1200px] px-5 py-12 md:px-8">
          <p className="text-xs font-bold uppercase text-[#9a4514]">Series map</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-black leading-[1.02] md:text-5xl">
            One manuscript world, different public and staged lenses.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {syntheticEpisodeProjections.map((projection, index) => (
              <div
                key={projection.id}
                className="rounded-[22px] border border-[#211912]/10 bg-white/55 p-5 shadow-[0_18px_40px_rgba(33,25,18,0.14)]"
              >
                <p className="text-xs font-bold uppercase text-[#9a4514]">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-xl font-black leading-tight">
                  {projection.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#514337]">
                  {projection.lifecycleNote}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
