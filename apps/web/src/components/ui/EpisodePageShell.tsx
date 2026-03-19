import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import VideoFrame from "@/components/ui/VideoFrame";

type EpisodePageShellProps = {
  title: string;
  description?: string;
  youtubeId: string;
  children: React.ReactNode;
};

export default function EpisodePageShell({
  title,
  description,
  youtubeId,
  children,
}: EpisodePageShellProps) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_18%,#24443f_42%,#7d5b34_72%,#f3eadb_100%)]">
      <PageContainer className="pb-20 pt-7">
        <div className="mb-6">
          <BackLink href="/">← Back to High Ground Odyssey</BackLink>
        </div>

        <section className="mb-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-end">
            <div className="text-[var(--text-light)]">
              <PageEyebrow>Episode</PageEyebrow>

              <h1 className="m-0 max-w-[820px] text-[clamp(2.6rem,6vw,5rem)] leading-[0.94] tracking-[-0.055em] text-[var(--text-light)]">
                {title}
              </h1>

              {description ? (
                <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
                  {description}
                </p>
              ) : null}
            </div>

            <GlassPanel
              glow
              className="h-fit p-6 text-[var(--text-light)] lg:self-start"
            >
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                Episode Notes
              </div>

              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                This page pairs the episode video with its companion article so
                the story, reflection, and source material live together.
              </p>
            </GlassPanel>
          </div>
        </section>

        <section className="mb-10">
          <GlassPanel glow className="overflow-hidden rounded-[30px]">
            <VideoFrame youtubeId={youtubeId} title={title} />
          </GlassPanel>
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,820px)_minmax(260px,1fr)]">
          <PaperCard className="min-w-0">
            <div className="prose-hgo">{children}</div>
          </PaperCard>

          <div className="space-y-6">
            <GlassPanel className="p-6 text-[var(--text-light)]">
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                What you’ll find here
              </div>

              <ul className="m-0 space-y-3 pl-5 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <li>Companion writing for the episode</li>
                <li>Reflection, context, and source material</li>
                <li>A cleaner reading experience than show notes alone</li>
              </ul>
            </GlassPanel>

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                High Ground Odyssey
              </div>

              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                Stories about leadership, legacy, risk, family, and the road it
                takes to become who we’re meant to be.
              </p>
            </GlassPanel>
          </div>
        </section>
      </PageContainer>
    </main>
  );
}