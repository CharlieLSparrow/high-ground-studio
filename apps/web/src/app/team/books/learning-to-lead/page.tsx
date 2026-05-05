import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";
import LivingManuscriptViewerClient from "./LivingManuscriptViewerClient";
import {
  getLearningToLeadBookArrangement,
  getLearningToLeadManuscript,
  getLearningToLeadPodcastArrangement,
} from "@/lib/server/living-manuscript";

function formatLabel(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function LearningToLeadBookPage() {
  const manuscript = await getLearningToLeadManuscript();
  const bookArrangement = await getLearningToLeadBookArrangement(manuscript);
  const podcastArrangement = await getLearningToLeadPodcastArrangement(manuscript);
  const chapterCount = new Set(manuscript.blocks.map((block) => block.chapter)).size;
  const workflowStatus =
    typeof manuscript.frontmatter.workflowStatus === "string"
      ? manuscript.frontmatter.workflowStatus
      : null;
  const publicationStatus =
    typeof manuscript.frontmatter.publicationStatus === "string"
      ? manuscript.frontmatter.publicationStatus
      : null;
  const sourceDocument =
    typeof manuscript.frontmatter.sourceDocument === "string"
      ? manuscript.frontmatter.sourceDocument
      : null;

  return (
    <section className="space-y-8">
      <div>
        <BackLink href="/team">
          <span aria-hidden="true">←</span>
          <span>Back to Team Console</span>
        </BackLink>
      </div>

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>Books</PageEyebrow>
          <PageEyebrow>Internal</PageEyebrow>
          <PageEyebrow>Read Only</PageEyebrow>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="m-0 text-[clamp(2.1rem,4vw,3.5rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              {manuscript.title ?? "Learning to Lead"}
            </h1>

            <p className="mb-0 mt-4 max-w-[780px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This page reads the living manuscript file directly from disk and renders it as structured source text.
              Book View follows manuscript order. Episode View uses the podcast arrangement as a read-only production map over the same source blocks.
            </p>

            {manuscript.introNote ? (
              <div className="mt-5 rounded-3xl border border-white/10 bg-white/6 px-4 py-4 text-[rgba(245,239,230,0.9)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                  Manuscript Note
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-7">
                  {manuscript.introNote}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/6 px-4 py-4 text-sm text-[rgba(245,239,230,0.9)] sm:grid-cols-2 lg:min-w-[320px] lg:grid-cols-1">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                Source Document
              </div>
              <div className="mt-1 font-semibold text-[var(--text-light)]">
                {sourceDocument ?? "Unknown"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                Workflow Status
              </div>
              <div className="mt-1 font-semibold text-[var(--text-light)]">
                {workflowStatus ? formatLabel(workflowStatus) : "Unknown"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                Publication Status
              </div>
              <div className="mt-1 font-semibold text-[var(--text-light)]">
                {publicationStatus ? formatLabel(publicationStatus) : "Unknown"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.62)]">
                Viewer Summary
              </div>
              <div className="mt-1 font-semibold text-[var(--text-light)]">
                {manuscript.blocks.length} blocks · {chapterCount} chapters · {podcastArrangement.episodes.length} podcast episodes
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <LivingManuscriptViewerClient
        manuscript={manuscript}
        bookArrangement={bookArrangement}
        podcastArrangement={podcastArrangement}
      />
    </section>
  );
}
