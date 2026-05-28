import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListChecks, Share2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QuipCard } from "@/components/QuipCard";
import { QuipslyPanel } from "@/components/QuipslyPanel";
import { StatPanel } from "@/components/StatPanel";
import {
  getLorelistBySlug,
  getLorelistItems,
  getThemeById,
  lorelists,
} from "@high-ground/quipsly-domain/seed";

export function generateStaticParams() {
  return lorelists.map((lorelist) => ({ slug: lorelist.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lorelist = getLorelistBySlug(slug);

  return {
    title: lorelist ? lorelist.title : "Lorelist",
    description: lorelist?.description,
  };
}

export default async function LorelistPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const lorelist = getLorelistBySlug(slug);

  if (!lorelist) {
    notFound();
  }

  const items = getLorelistItems(lorelist);
  const coverTheme = getThemeById(lorelist.coverThemeId);
  const uniquePeople = new Set(items.map((item) => item.card.person.id)).size;
  const highTrustItems = items.filter(
    (item) =>
      item.card.quote.verificationStatus === "verified" ||
      item.card.quote.verificationStatus === "attributed",
  ).length;

  return (
    <AppShell>
      <section className="lorelist-hero">
        <div>
          <span className="section-label">
            <ListChecks size={14} aria-hidden="true" />
            Lorelist
          </span>
          <h1>{lorelist.title}</h1>
          <p>{lorelist.description}</p>
          <div className="chip-row" style={{ marginTop: "0.85rem" }}>
            <span className="chip">{lorelist.visibility}</span>
            <span className="chip">{coverTheme.label}</span>
            <span className="chip">{lorelist.arcLabel}</span>
          </div>
        </div>
        <div className="panel">
          <span className="section-label">
            <Sparkles size={14} aria-hidden="true" />
            Collection arc
          </span>
          <p className="panel-copy">
            Lorelists are playlist-style quote collections. Trails can later add
            commentary, story beats, and source-led narration between items.
          </p>
          <StatPanel
            items={[
              { label: "Items", value: items.length },
              { label: "People", value: uniquePeople },
              { label: "High trust", value: highTrustItems },
              { label: "Curator", value: "seed" },
            ]}
          />
        </div>
      </section>

      <div className="detail-grid">
        <section className="passport-block lorelist-items">
          <span className="section-label">Ordered quotes</span>
          <div className="card-list" style={{ marginTop: "0.85rem" }}>
            {items.map((item) => (
              <div className="lorelist-item" key={item.id}>
                <QuipCard card={item.card} curatorNote={item.curatorNote} />
              </div>
            ))}
          </div>
        </section>

        <aside className="stack">
          <QuipslyPanel
            state="nesting"
            note="Quipsly treats collections as working memory, not just pretty playlists."
          />
          <section className="panel">
            <span className="section-label">
              <Share2 size={14} aria-hidden="true" />
              Share posture
            </span>
            <h2 className="panel-title">Public, but still source-aware.</h2>
            <p className="panel-copy">
              A public Lorelist should inherit the quote card review states, so
              a disputed item remains visibly disputed inside the collection.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
