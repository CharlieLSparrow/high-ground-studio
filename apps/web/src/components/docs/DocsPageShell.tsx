import BackLink from "@/components/ui/BackLink";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import PaperCard from "@/components/ui/PaperCard";
import PairedReadingCard from "@/components/docs/PairedReadingCard";
import FeaturedQuoteCard from "@/components/docs/FeaturedQuoteCard";
import type { LayoutVariant } from "@/lib/layout-variant";
import { getLayoutSurfaceBackground } from "@/lib/layout-variant-styles";

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

type DocsPageShellProps = {
  title: string;
  subtitle?: string;
  description?: string;
  eyebrow?: string;
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

export default function DocsPageShell({
  title,
  subtitle,
  description,
  eyebrow = "Reading",
  featuredQuote,
  pairedContent,
  metaGroups = [],
  accessLabel,
  statusLabel,
  layoutVariant = "cinematic",
  internalNotice,
  children,
}: DocsPageShellProps) {
  const visibleMetaGroups = metaGroups.filter((group) => group.items.length > 0);
  const hasAside =
    Boolean(pairedContent) ||
    Boolean(featuredQuote) ||
    visibleMetaGroups.length > 0;

  return (
    <main
      className={[
        "min-h-screen pb-20 pt-7",
        getLayoutSurfaceBackground(layoutVariant, "docs"),
      ].join(" ")}
    >
      <PageContainer className="pb-20 pt-7">
        <div className="mb-6">
          <BackLink href="/">
            <span aria-hidden="true">←</span>
            <span>Back to High Ground Odyssey</span>
          </BackLink>
        </div>

        {internalNotice ? <div className="mb-8">{internalNotice}</div> : null}

        <header className="mb-8 text-[var(--text-light)]">
          <div className="mb-4 flex flex-wrap gap-3">
            <PageEyebrow>{eyebrow}</PageEyebrow>
            {accessLabel ? <PageEyebrow>{accessLabel}</PageEyebrow> : null}
            {statusLabel ? <PageEyebrow>{statusLabel}</PageEyebrow> : null}
          </div>

          <h1 className="m-0 max-w-[860px] text-[clamp(2.2rem,5vw,4rem)] leading-[1.02] tracking-[-0.03em]">
            {title}
          </h1>

          {subtitle ? (
            <p className="mb-0 mt-4 text-[0.98rem] font-bold uppercase tracking-[0.08em] text-[rgba(255,186,120,0.96)]">
              {subtitle}
            </p>
          ) : null}

          {description ? (
            <p className="mb-0 mt-4 max-w-[760px] text-[1.12rem] leading-8 text-[rgba(245,239,230,0.95)]">
              {description}
            </p>
          ) : null}
        </header>

        {hasAside ? (
          <section className="grid gap-8 lg:grid-cols-[minmax(0,860px)_minmax(260px,1fr)]">
            <PaperCard className="min-w-0">
              <div className="prose-hgo">{children}</div>
            </PaperCard>

            <div className="space-y-6">
              {pairedContent ? (
                <PairedReadingCard
                  eyebrow={pairedContent.eyebrow}
                  title={pairedContent.title}
                  href={pairedContent.href}
                  description={pairedContent.description}
                  ctaLabel="Open companion →"
                />
              ) : null}

              {featuredQuote ? <FeaturedQuoteCard quote={featuredQuote} /> : null}

              {visibleMetaGroups.length ? (
                <GlassPanel className="border-white/12 bg-[rgba(8,18,22,0.62)] p-6 text-[var(--text-light)]">
                  <div className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(255,186,120,0.96)]">
                    Reading Map
                  </div>

                  <div className="space-y-5">
                    {visibleMetaGroups.map((group) => (
                      <div key={group.label}>
                        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.84)]">
                          {group.label}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {group.items.map((item) => (
                            <span
                              key={`${group.label}-${item}`}
                              className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[0.82rem] font-medium text-[rgba(245,239,230,0.94)]"
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
            </div>
          </section>
        ) : (
          <PaperCard className="max-w-[860px]">
            <div className="prose-hgo">{children}</div>
          </PaperCard>
        )}
      </PageContainer>
    </main>
  );
}
