import Link from "next/link";
import DocsVideoEmbed from "@/components/docs/DocsVideoEmbed";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";

export default function EpisodePageShell({
  title,
  description,
  youtubeId,
  children,
}: {
  title: string;
  description?: string;
  youtubeId: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]">
      <PageContainer className="pb-20 pt-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline transition hover:text-[var(--accent)]"
          >
            ← Back to High Ground Odyssey
          </Link>
        </div>

        <header className="mb-8 max-w-[820px] text-[var(--text-light)]">
          <PageEyebrow>Episode</PageEyebrow>

          <h1 className="m-0 text-[clamp(2.6rem,6vw,5rem)] leading-[0.94] tracking-[-0.05em] text-[var(--text-light)]">
            {title}
          </h1>

          {description ? (
            <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
              {description}
            </p>
          ) : null}
        </header>

        <section className="mb-10">
          <GlassPanel className="overflow-hidden">
            <DocsVideoEmbed youtubeId={youtubeId} title={title} />
          </GlassPanel>
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,820px)_minmax(240px,1fr)]">
          <PaperCard>
            <div className="prose-hgo">{children}</div>
          </PaperCard>

          <GlassPanel className="h-fit p-6 text-[var(--text-light)]">
            <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
              Episode Notes
            </div>

            <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This page pairs the episode video with its companion article so the
              story, reflection, and source material live together.
            </p>
          </GlassPanel>
        </section>
      </PageContainer>
    </main>
  );
}