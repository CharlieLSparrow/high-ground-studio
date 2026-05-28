import Link from "next/link";
import { Archive, BookOpen, Database, ListChecks, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuipCard } from "@/components/QuipCard";
import { QuipStreamExperience } from "@/components/QuipStreamExperience";
import { QuipslyPanel } from "@/components/QuipslyPanel";
import { StatPanel } from "@/components/StatPanel";
import {
  getAllQuipCards,
  getLorelistBySlug,
  getLorelistItems,
  people,
  quotes,
  sourceWorks,
  starterNest,
} from "@high-ground/quipsly-domain/seed";

export default function HomePage() {
  const cards = getAllQuipCards();
  const featured = cards.find(
    (card) => card.quote.slug === "imagination-more-important-than-knowledge",
  );
  const lorelist = getLorelistBySlug("curiosity-without-cliche");
  const lorelistItems = lorelist ? getLorelistItems(lorelist) : [];

  return (
    <AppShell>
      <div className="home-grid">
        <aside className="rail">
          <section className="panel">
            <span className="section-label">
              <Archive size={14} aria-hidden="true" />
              Active Nest
            </span>
            <h1 className="panel-title">Save first. Curate next.</h1>
            <p className="panel-copy">{starterNest.description}</p>
            <StatPanel
              items={[
                { label: "Seed quotes", value: quotes.length },
                { label: "People", value: people.length },
                { label: "Sources", value: sourceWorks.length },
                { label: "Saved", value: starterNest.savedQuoteIds.length },
              ]}
            />
          </section>

          <section className="panel">
            <span className="section-label">
              <Database size={14} aria-hidden="true" />
              API projection
            </span>
            <h2 className="panel-title">Cards are not source truth.</h2>
            <p className="panel-copy">
              Each card is a projection over quote, person, source, evidence,
              review state, variants, and themes. That keeps the future API
              honest while the app moves fast.
            </p>
            <Link className="button" href="/api" style={{ marginTop: "0.85rem" }}>
              <Database size={15} aria-hidden="true" />
              Open API Explorer
            </Link>
          </section>

          {featured ? (
            <section className="panel">
              <span className="section-label">
                <Sparkles size={14} aria-hidden="true" />
                Featured Passport
              </span>
              <QuipCard card={featured} />
            </section>
          ) : null}
        </aside>

        <div className="stream-column">
          <QuipStreamExperience initialMode="by-person" />
        </div>

        <aside className="rail right">
          <QuipslyPanel state="curious" />

          <section className="panel">
            <span className="section-label">
              <ListChecks size={14} aria-hidden="true" />
              Lorelist Builder
            </span>
            <h2 className="panel-title">{lorelist?.title}</h2>
            <p className="panel-copy">{lorelist?.description}</p>
            <div className="card-list" style={{ marginTop: "0.85rem" }}>
              {lorelistItems.slice(0, 2).map((item) => (
                <QuipCard
                  card={item.card}
                  curatorNote={item.curatorNote}
                  key={item.id}
                />
              ))}
            </div>
            <Link
              className="button primary"
              href="/lorelists/curiosity-without-cliche"
              style={{ marginTop: "0.85rem" }}
            >
              <BookOpen size={16} aria-hidden="true" />
              Open Lorelist
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
