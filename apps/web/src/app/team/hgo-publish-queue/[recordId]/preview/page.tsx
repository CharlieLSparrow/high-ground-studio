import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileJson, ShieldCheck } from "lucide-react";

import EpisodeProjectionView from "@/components/hgo/projection/EpisodeProjectionView";
import ProjectionReviewGatePanel from "@/components/hgo/projection/ProjectionReviewGatePanel";
import { resolveTeamAccess } from "@/lib/content-access";
import { createHgoEpisodePublishCandidatePacket } from "@/lib/hgo/publish-candidate-packet";
import { createHgoEpisodePublishDraftPacket } from "@/lib/hgo/publish-draft-packet";
import { validateHgoStagedProjectionArtifact } from "@/lib/hgo/staged-projection-artifact";
import { getHgoStagedArtifactForOwner } from "@/lib/server/hgo-staged-artifacts";

function getOwnerEmail(access: Awaited<ReturnType<typeof resolveTeamAccess>>) {
  return (
    access.session?.user?.primaryEmail?.trim().toLowerCase() ||
    access.email?.trim().toLowerCase() ||
    ""
  );
}

export default async function TeamHgoPublishQueuePreviewPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const access = await resolveTeamAccess();
  const ownerEmail = getOwnerEmail(access);

  if (!ownerEmail) {
    notFound();
  }

  const record = await getHgoStagedArtifactForOwner({
    ownerEmail,
    recordId: decodeURIComponent(recordId),
  });

  if (!record) {
    notFound();
  }

  const parsedArtifact = validateHgoStagedProjectionArtifact(record.artifactJson);

  if (!parsedArtifact.artifact) {
    notFound();
  }

  const candidate = createHgoEpisodePublishCandidatePacket({
    record,
    createdAt: record.updatedAt,
  });
  const draft = createHgoEpisodePublishDraftPacket({
    artifact: parsedArtifact.artifact,
    candidate,
    createdAt: record.updatedAt,
  });
  const detailHref = `/team/hgo-publish-queue/${encodeURIComponent(record.recordId)}`;

  return (
    <>
      <section className="border-b border-amber-200/20 bg-[rgba(6,16,20,0.94)] px-5 py-4 text-amber-50 md:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Link
              className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-amber-50 no-underline transition hover:border-[rgba(255,122,24,0.35)] hover:text-[var(--accent)]"
              href={detailHref}
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Review Detail
            </Link>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-1 text-xs font-semibold">
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                Private render preview
              </span>
              <span className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold">
                {draft.reviewState.readinessState}
              </span>
              <span className="inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold">
                {draft.frontmatter.citationReview}
              </span>
            </div>
            <h1 className="m-0 mt-3 text-2xl font-black leading-tight text-[var(--text-light)] md:text-4xl">
              {draft.episodePage.title}
            </h1>
            <p className="m-0 mt-3 text-sm leading-6 text-amber-50/82">
              This preview renders the saved staged artifact through the shared
              HGO projection renderer. It is not a public episode page, does not
              write files, does not replace `/episodes`, and does not certify
              citation or public-safety review.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-amber-100/75">
              <FileJson aria-hidden="true" className="h-4 w-4" />
              Draft target
            </div>
            <code className="block max-w-[360px] break-all text-amber-50">
              {draft.proposedFiles.privateDraftPath}
            </code>
          </div>
        </div>
      </section>

      <EpisodeProjectionView
        allProjections={[parsedArtifact.artifact.projection]}
        projection={parsedArtifact.artifact.projection}
        projectionBasePath={`/team/hgo-publish-queue/${encodeURIComponent(
          record.recordId,
        )}/preview`}
        projectionMapHref={detailHref}
      />

      <section className="bg-void px-5 pb-12 md:px-8">
        <div className="mx-auto max-w-[1200px]">
          <ProjectionReviewGatePanel
            gate={parsedArtifact.artifact.reviewGate}
            testId="hgo-publish-preview-review-gate"
          />
        </div>
      </section>
    </>
  );
}
