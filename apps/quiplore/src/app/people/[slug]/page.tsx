import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Feather, LibraryBig, Network, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuipCard } from "@/components/QuipCard";
import { QuipslyPanel } from "@/components/QuipslyPanel";
import { QuipStreamExperience } from "@/components/QuipStreamExperience";
import { StatPanel } from "@/components/StatPanel";
import {
  getPersonBySlug,
  getPersonThemes,
  getQuotesForPersonSlug,
  getRelatedPeople,
  people,
  sourceWorks,
} from "@high-ground/quipsly-domain/seed";

export function generateStaticParams() {
  return people.map((person) => ({ slug: person.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const person = getPersonBySlug(slug);

  return {
    title: person ? `${person.displayName} Quotes` : "Quotable Person",
    description: person?.summary,
  };
}

export default async function PersonPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const person = getPersonBySlug(slug);

  if (!person) {
    notFound();
  }

  const cards = getQuotesForPersonSlug(person.slug);
  const themes = getPersonThemes(person);
  const relatedPeople = getRelatedPeople(person);
  const personSourceCount = new Set(cards.map((card) => card.sourceWork.id)).size;

  return (
    <AppShell>
      <section className="person-hero">
        <div>
          <span className="section-label">
            <UserRound size={14} aria-hidden="true" />
            Quotable person
          </span>
          <h1>{person.displayName}</h1>
          <p>{person.summary}</p>
          <div className="chip-row" style={{ marginTop: "0.85rem" }}>
            {person.dates ? <span className="chip">{person.dates}</span> : null}
            {person.domains.map((domain) => (
              <span className="chip" key={domain}>
                {domain}
              </span>
            ))}
          </div>
          <div className="person-fact-grid">
            <StatPanel
              items={[
                { label: "Quotes", value: cards.length },
                { label: "Sources", value: personSourceCount },
                { label: "Themes", value: themes.length },
                { label: "Related", value: relatedPeople.length },
              ]}
            />
          </div>
        </div>
        <div className="person-portrait" aria-label={person.visualPrompt}>
          <img
            alt=""
            src={
              person.slug === "albert-einstein"
                ? "/illustrations/einstein-quipsly-sprite-sheet.png"
                : "/illustrations/quipsly-character-model-sheet.png"
            }
          />
        </div>
      </section>

      <div className="detail-grid">
        <div className="stack">
          <section className="passport-block text-stack">
            <span className="section-label">
              <Feather size={14} aria-hidden="true" />
              Why this person is quotable
            </span>
            <p>{person.whyQuotable}</p>
            <div className="chip-row">
              {themes.map((theme) => (
                <span className="chip" key={theme.id}>
                  {theme.label}
                </span>
              ))}
            </div>
          </section>

          <section className="passport-block">
            <span className="section-label">
              <LibraryBig size={14} aria-hidden="true" />
              Top quote records
            </span>
            <div className="card-list" style={{ marginTop: "0.85rem" }}>
              {cards.length ? (
                cards.map((card) => <QuipCard card={card} key={card.quote.id} />)
              ) : (
                <p className="panel-copy">
                  This seed person has no attached quote cards yet.
                </p>
              )}
            </div>
          </section>
          {person.slug === "albert-einstein" ? (
            <section className="passport-block">
              <span className="section-label">Einstein stream test</span>
              <p className="panel-copy">
                This embeds the person-focused stream so the quote art, badges,
                and source posture can be judged together.
              </p>
              <div className="section-spacer">
                <QuipStreamExperience initialMode="by-person" />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="stack">
          <QuipslyPanel state={person.quipslyState} />

          <section className="panel">
            <span className="section-label">
              <Network size={14} aria-hidden="true" />
              Related people
            </span>
            <div className="card-list">
              {relatedPeople.map((related) => (
                <Link
                  className="meta-item"
                  href={`/people/${related.slug}`}
                  key={related.id}
                >
                  <span>{related.dates ?? "Dates unknown"}</span>
                  <strong>{related.displayName}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">Source works in seed set</h2>
            <div className="card-list">
              {sourceWorks
                .filter((source) =>
                  cards.some((card) => card.sourceWork.id === source.id),
                )
                .map((source) => (
                  <div className="meta-item" key={source.id}>
                    <span>{source.type}</span>
                    <strong>{source.title}</strong>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
