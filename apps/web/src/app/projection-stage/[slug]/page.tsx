import { notFound } from "next/navigation";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import { createHgoProjectionReviewGate } from "@/lib/hgo/projection-review-gate";
import {
  getHgoEpisodeProjectionBySlug,
  listHgoEpisodeProjections,
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
  const reviewGate = createHgoProjectionReviewGate(projection);
  const blockerIssues = reviewGate.issues.filter(
    (issue) => issue.blocksLivePromotion,
  );
  const warningIssues = reviewGate.issues.filter(
    (issue) => issue.severity === "warning",
  );

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
              Review gate and promotion readiness
            </p>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Can promote
                </p>
                <p className="mt-1 text-2xl font-black">
                  {reviewGate.canPromoteToLive ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Live-safe
                </p>
                <p className="mt-1 text-2xl font-black">
                  {reviewGate.isLiveSafe ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Blockers
                </p>
                <p className="mt-1 text-2xl font-black">
                  {reviewGate.blockerCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-amber-100">
                  Warnings
                </p>
                <p className="mt-1 text-2xl font-black">
                  {reviewGate.warningCount}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm font-black text-amber-100">
              No publish action is available here. Promote to live will require
              a later approved workflow.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase text-rose-100">
                  Blockers
                </p>
                {blockerIssues.length ? (
                  <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6">
                    {blockerIssues.map((issue) => (
                      <li key={issue.id}>{issue.title}: {issue.detail}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-6">
                    No live-blocking issues under the current synthetic gate.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-black uppercase text-amber-100">
                  Warnings
                </p>
                <ul className="mt-3 grid gap-2 pl-5 text-sm leading-6">
                  {warningIssues.map((issue) => (
                    <li key={issue.id}>{issue.title}: {issue.detail}</li>
                  ))}
                </ul>
              </div>
            </div>
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
