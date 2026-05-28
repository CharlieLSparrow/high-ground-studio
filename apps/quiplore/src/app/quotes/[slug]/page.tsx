import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, BookOpen, Feather, ListPlus, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuipCard } from "@/components/QuipCard";
import { QuipVisual } from "@/components/QuipVisual";
import { QuipslyPanel } from "@/components/QuipslyPanel";
import { SourceBadge } from "@/components/SourceBadge";
import { StatPanel } from "@/components/StatPanel";
import { VerificationBadge } from "@/components/VerificationBadge";
import AdSenseBannerSlot from "@/components/monetization/AdSenseBannerSlot";
import AffiliateBookCard from "@/components/monetization/AffiliateBookCard";
import PatreonPledgeBanner from "@/components/monetization/PatreonPledgeBanner";
import {
  getQuotePassportBySlug,
  getQuoteStoryBySlug,
  getMerchConceptByQuoteSlug,
  quotes,
  getAllQuipCards,
} from "@high-ground/quipsly-domain/seed";

function formatLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function generateStaticParams() {
  return quotes.map((quote) => ({ slug: quote.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const passport = getQuotePassportBySlug(slug);

  return {
    title: passport ? `Quote Passport: ${passport.person.displayName}` : "Quote Passport",
    description: passport?.quote.text,
  };
}

export default async function QuotePassportPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const passport = getQuotePassportBySlug(slug);

  if (!passport) {
    notFound();
  }

  const allCards = getAllQuipCards();
  const story = getQuoteStoryBySlug(slug);
  const merch = getMerchConceptByQuoteSlug(slug);
  const relatedCards = passport.relatedQuotes
    .map((quote) => allCards.find((card) => card.quote.id === quote.id))
    .filter(Boolean);

  return (
    <AppShell>
      <div className="page-head">
        <span className="section-label">
          <BookOpen size={14} aria-hidden="true" />
          Quote Passport
        </span>
        <h1>Source-aware reference view</h1>
        <p>
          This page treats the quote as a projection over wording, attribution,
          source work, evidence, variants, review state, and useful context.
        </p>
      </div>

      <div className="detail-grid">
        <article className="passport-block stack">
          <div className="chip-row">
            <VerificationBadge status={passport.quote.verificationStatus} />
            <SourceBadge source={passport.sourceWork} />
            {passport.themes.map((theme) => (
              <span className="chip" key={theme.id}>
                {theme.label}
              </span>
            ))}
          </div>

          <blockquote className="passport-quote">{passport.quote.text}</blockquote>

          <div className="passport-visual-slot">
            <QuipVisual visual={passport.quote.visual} size="stream" />
          </div>

          <div className="meta-grid">
            <div className="meta-item">
              <span>Attribution</span>
              <strong>{passport.person.displayName}</strong>
            </div>
            <div className="meta-item">
              <span>Source work</span>
              <strong>{passport.sourceWork.title}</strong>
            </div>
            <div className="meta-item">
              <span>Confidence</span>
              <strong>{Math.round(passport.quote.confidence * 100)}%</strong>
            </div>
            <div className="meta-item">
              <span>Merch use</span>
              <strong>{passport.quote.merchEligibility}</strong>
            </div>
          </div>

          <section className="text-stack">
            <h2 className="panel-title">Context</h2>
            <p>{passport.quote.contextNote}</p>
            <p>{passport.quote.reviewNote}</p>
          </section>

          <section>
            <h2 className="panel-title">Evidence</h2>
            <ul className="evidence-list">
              {passport.evidence.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  {item.locator ? ` | ${item.locator}` : ""}
                  {item.excerpt ? <p>{item.excerpt}</p> : null}
                  <p>{item.evidenceNote}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="text-stack">
            <h2 className="panel-title">Variants and disputes</h2>
            {passport.variants.length ? (
              passport.variants.map((variant) => (
                <div className="meta-item" key={variant.id}>
                  <VerificationBadge status={variant.status} />
                  <strong>{variant.text}</strong>
                  <p>{variant.note}</p>
                </div>
              ))
            ) : (
              <p>No variants are attached to this seed record yet.</p>
            )}
          </section>

          {story ? (
            <section className="story-trail-block">
              <span className="section-label">
                <Feather size={14} aria-hidden="true" />
                Story trail
              </span>
              <h2 className="panel-title">{story.title}</h2>
              <p className="panel-copy">{story.deck}</p>
              <ol className="story-beat-list">
                {story.beats.map((beat) => (
                  <li key={beat.id}>
                    <strong>{beat.title}</strong>
                    <p>{beat.body}</p>
                    {beat.caution ? <small>{beat.caution}</small> : null}
                  </li>
                ))}
              </ol>
              <div className="meta-item">
                <span>Video seed</span>
                <strong>{story.recommendedRuntimeSeconds}s QuipLore short</strong>
                <p>{story.videoSeed}</p>
              </div>
            </section>
          ) : null}
        </article>

        <aside className="stack">
          <section className="panel">
            <span className="section-label">
              <UserRound size={14} aria-hidden="true" />
              Person
            </span>
            <h2 className="panel-title">{passport.person.displayName}</h2>
            <p className="panel-copy">{passport.person.summary}</p>
            <Link className="button" href={`/people/${passport.person.slug}`}>
              Open person page
            </Link>
          </section>

          <QuipslyPanel
            state={passport.person.quipslyState}
            note={passport.quote.quipslyNote}
          />

          <AdSenseBannerSlot slotId="quiplore-sidebar-ad" />

          {passport.sourceWork && (
            <AffiliateBookCard
              title={passport.sourceWork.title}
              author={passport.person.displayName}
              description="Explore the original context, footnotes, and surrounding commentary of this referenced work."
              amazonUrl={`https://www.amazon.com/s?k=${encodeURIComponent(passport.sourceWork.title)}`}
              bookshopUrl={`https://bookshop.org/search?keywords=${encodeURIComponent(passport.sourceWork.title)}`}
            />
          )}

          <PatreonPledgeBanner />

          {merch ? (
            <section className={`panel merch-panel ${merch.status}`}>
              <span className="section-label">
                <Archive size={14} aria-hidden="true" />
                Merch readiness
              </span>
              <div className="merch-heading">
                <h2 className="panel-title">{merch.title}</h2>
                <span className={`readiness-badge ${merch.status}`}>
                  {formatLabel(merch.status)}
                </span>
              </div>
              <p className="panel-copy">{merch.statusNote}</p>
              <div className="merch-product-grid" aria-label="Product concepts">
                {merch.productTypes.map((productType) => (
                  <span key={productType}>{formatLabel(productType)}</span>
                ))}
              </div>
              <div className="text-stack">
                <p>{merch.visualDirection}</p>
                <p>{merch.sourceRequirement}</p>
                <p>{merch.quipslyAngle}</p>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <span className="section-label">
              <Archive size={14} aria-hidden="true" />
              Passport stats
            </span>
            <StatPanel
              items={[
                { label: "Evidence", value: passport.evidence.length },
                { label: "Variants", value: passport.variants.length },
                { label: "Themes", value: passport.themes.length },
                { label: "Related", value: passport.relatedQuotes.length },
              ]}
            />
          </section>

          <section className="panel">
            <span className="section-label">
              <ListPlus size={14} aria-hidden="true" />
              Related
            </span>
            <div className="card-list">
              {relatedCards.map((card) =>
                card ? <QuipCard card={card} key={card.quote.id} /> : null,
              )}
            </div>
          </section>

          <section className="panel">
            <span className="section-label">
              <Feather size={14} aria-hidden="true" />
              Story hook
            </span>
            <p className="panel-copy">{passport.quote.storyHook}</p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
