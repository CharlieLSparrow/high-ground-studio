import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import DocsVideoEmbed from "./DocsVideoEmbed";
import PairedReadingCard from "@/components/docs/PairedReadingCard";
import FeaturedQuoteCard from "@/components/docs/FeaturedQuoteCard";
import type { LayoutVariant } from "@/lib/layout-variant";

type RelatedContent = {
  eyebrow: string;
  href: string;
  title: string;
  description?: string;
};

type MetaGroup = {
  label: string;
  items: string[];
};

type EpisodePageShellProps = {
  title: string;
  subtitle?: string;
  description?: string;
  youtubeId: string;
  featuredQuote?: string;
  pairedContent?: RelatedContent;
  metaGroups?: MetaGroup[];
  accessLabel?: string;
  statusLabel?: string;
  layoutVariant?: LayoutVariant;
  internalNotice?: React.ReactNode;
  children: React.ReactNode;
};

function formatMetaValue(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function EpisodePageShell({
  title,
  subtitle,
  description,
  youtubeId,
  featuredQuote,
  pairedContent,
  metaGroups = [],
  accessLabel,
  statusLabel,
  layoutVariant = "cinematic",
  internalNotice,
  children,
}: EpisodePageShellProps) {
  const visibleMetaGroups = metaGroups.filter((group) => group.items.length > 0);

  return (
    <main
      className={[
        "min-h-screen",
        layoutVariant === "editorial"
          ? "bg-[linear-gradient(180deg,#1a130f_0%,#402e23_24%,#735338_64%,#f0e4d0_100%)]"
          : layoutVariant === "signal"
            ? "bg-[linear-gradient(180deg,#0c1519_0%,#14252d_22%,#243640_52%,#dce4e6_100%)]"
            : "bg-[linear-gradient(180deg,#0b2025_0%,#133238_16%,#22443f_38%,#6f5636_72%,#f3eadb_100%)]",
      ].join(" ")}
    >
      <PageContainer className="pb-24 pt-8">
        <div className="mb-8">
          <BackLink href="/">
            <span aria-hidden="true">←</span>
            <span>Back to High Ground Odyssey</span>
          </BackLink>
        </div>

        {internalNotice ? <div className="mb-8">{internalNotice}</div> : null}

        <section className="mb-10 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-end">
          <div className="text-[var(--text-light)]">
            <div className="mb-4 flex flex-wrap gap-3">
              <PageEyebrow>Episode</PageEyebrow>
              {accessLabel ? <PageEyebrow>{accessLabel}</PageEyebrow> : null}
              {statusLabel ? <PageEyebrow>{statusLabel}</PageEyebrow> : null}
            </div>

            <h1 className="m-0 max-w-[900px] text-[clamp(2.8rem,6vw,5.5rem)] leading-[0.92] tracking-[-0.055em] text-[var(--text-light)]">
              {title}
            </h1>

            {subtitle ? (
              <p className="mb-0 mt-4 text-[0.95rem] font-semibold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                {subtitle}
              </p>
            ) : null}

            {description ? (
              <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
                {description}
              </p>
            ) : null}
          </div>

          <GlassPanel
            glow={layoutVariant !== "signal"}
            className="h-fit p-6 text-[var(--text-light)] lg:self-start"
          >
            <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
              Episode Companion
            </div>

            <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This page is the cinematic companion layer: the video, the curated
              context, and the paired reading that anchors the episode to the
              deeper written work.
            </p>
          </GlassPanel>
        </section>

        <section className="mb-12 overflow-hidden rounded-[32px] border border-white/10 bg-[rgba(10,21,24,0.38)] shadow-[0_30px_70px_rgba(0,0,0,0.24)] backdrop-blur-[10px]">
          <DocsVideoEmbed youtubeId={youtubeId} title={title} />
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,860px)_minmax(260px,1fr)]">
          <PaperCard className="min-w-0 sm:px-10">
            <div className="mb-8 border-b border-[rgba(0,0,0,0.08)] pb-6">
              <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(125,91,52,0.85)]">
                Companion Article
              </div>

              <p className="m-0 max-w-[720px] text-[1rem] leading-7 text-[rgba(35,35,35,0.78)]">
                This is the editorial reading layer for the episode — the part
                that slows the moment down, names the through-line, and helps
                the story land.
              </p>
            </div>

            <div className="prose-hgo">{children}</div>
          </PaperCard>

          <div className="space-y-6">
            {pairedContent ? (
              <PairedReadingCard
                eyebrow={pairedContent.eyebrow}
                title={pairedContent.title}
                href={pairedContent.href}
                description={pairedContent.description}
                ctaLabel="Read companion →"
              />
            ) : null}

            {featuredQuote ? <FeaturedQuoteCard quote={featuredQuote} /> : null}

            {visibleMetaGroups.length ? (
              <GlassPanel className="p-6 text-[var(--text-light)]">
                <div className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                  Story Map
                </div>

                <div className="space-y-5">
                  {visibleMetaGroups.map((group) => (
                    <div key={group.label}>
                      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.72)]">
                        {group.label}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => (
                          <span
                            key={`${group.label}-${item}`}
                            className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.82rem] text-[rgba(245,239,230,0.9)]"
                          >
                            {formatMetaValue(item)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ) : null}

            <GlassPanel className="p-6 text-[var(--text-light)]">
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                High Ground Odyssey
              </div>

              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                Stories about leadership, legacy, family, risk, and the long
                climb toward becoming the kind of person who can carry
                something worthwhile uphill.
              </p>
            </GlassPanel>
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
