import { notFound } from "next/navigation";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import {
  getHgoEpisodeProjectionBySlug,
  listHgoEpisodeProjections,
  summarizeHgoProjectionReadiness,
} from "@/lib/hgo/projection-repository";

export function generateStaticParams() {
  return listHgoEpisodeProjections().map((projection) => ({
    slug: projection.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projection = getHgoEpisodeProjectionBySlug(slug);

  if (!projection) {
    return {
      title: "Staged Projection Not Found | High Ground Odyssey",
    };
  }

  return {
    title: `${projection.title} | HGO Projection Stage`,
    description: projection.subtitle,
  };
}

export default async function ProjectionStageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const projection = getHgoEpisodeProjectionBySlug(slug);

  if (!projection) {
    notFound();
  }

  const allProjections = listHgoEpisodeProjections();
  const readiness = summarizeHgoProjectionReadiness(projection);

  return (
    <>
      <section
        className="border-b border-amber-300/20 bg-[linear-gradient(135deg,#050d10_0%,#15282c_56%,#22170f_100%)] text-subject"
        data-testid="hgo-stage-review-banner"
      >
        <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-7 md:grid-cols-[0.75fr_1.25fr] md:px-8">
          <div>
            <p className="text-xs font-black uppercase text-amber-100">
              Staged review surface
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-subject">
              Not a public HGO page.
            </h2>
            <p className="mt-3 text-sm leading-6 text-subject-muted">
              This route uses the shared projection renderer for synthetic
              staged review architecture. It does not publish, persist, or
              replace `/episodes`.
            </p>
          </div>

          <div
            className="rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5 text-amber-50"
            data-testid="hgo-stage-readiness-warnings"
          >
            <p className="text-sm font-black uppercase text-amber-100">
              Citation and public-safety readiness
            </p>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Unresolved quotes
                </p>
                <p className="mt-1 text-2xl font-black">
                  {readiness.unresolvedPullQuoteCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Needs source
                </p>
                <p className="mt-1 text-2xl font-black">
                  {readiness.needsSourceCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Needs review
                </p>
                <p className="mt-1 text-2xl font-black">
                  {readiness.needsReviewCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Do not use
                </p>
                <p className="mt-1 text-2xl font-black">
                  {readiness.doNotUseCount}
                </p>
              </div>
            </div>
            <ul className="mt-4 grid gap-2 pl-5 text-sm leading-6">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <EpisodeProjectionView
        projection={projection}
        allProjections={allProjections}
        projectionBasePath="/projection-stage"
        projectionMapHref="/projection-stage"
      />
    </>
  );
}
