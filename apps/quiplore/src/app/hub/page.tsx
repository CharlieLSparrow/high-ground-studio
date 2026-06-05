import { Bookmark, Compass, Library } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { QuipCard } from "@/components/QuipCard";
import { starterNest, getAllQuipCards, lorelists } from "@high-ground/quipsly-domain/seed";

export const metadata = {
  title: "Your Nest - QuipLore",
};

export default function HubPage() {
  const allCards = getAllQuipCards();
  const savedCards = allCards.filter(card => starterNest.savedQuoteIds.includes(card.quote.id));
  
  return (
    <AppShell>
      <div className="page-head">
        <span className="section-label">
          <Library size={14} aria-hidden="true" />
          Personal Hub
        </span>
        <h1>Your Nest</h1>
        <p>
          Your collection of saved quotes, sorted and ready to be organized into Lorelists.
        </p>
        <div className="chip-row" style={{ marginTop: "0.85rem" }}>
          <Link href="/stream" className="button primary">
            <Compass size={16} aria-hidden="true" />
            Discover more
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        <section className="passport-block lorelist-items">
          <span className="section-label">
            <Bookmark size={14} aria-hidden="true" />
            Saved Quotes ({savedCards.length})
          </span>
          {savedCards.length === 0 ? (
            <div className="panel" style={{ marginTop: "0.85rem" }}>
              <p className="panel-copy">Your nest is empty. Head to the QuipStream to find quotes worth keeping.</p>
            </div>
          ) : (
            <div className="card-list" style={{ marginTop: "0.85rem" }}>
              {savedCards.map((card) => (
                <div className="lorelist-item" key={card.quote.id}>
                  <QuipCard card={card} />
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="stack">
          <section className="panel">
            <span className="section-label">Public Lorelists</span>
            <h2 className="panel-title">Your published collections</h2>
            <p className="panel-copy">
              Lorelists are public, curated trails of quotes. You can publish portions of your Nest for others to discover.
            </p>
            <div className="card-list" style={{ marginTop: "0.85rem" }}>
              {lorelists.map(list => (
                <Link key={list.id} href={`/lorelists/${list.slug}`} className="meta-item hover-card">
                  <strong>{list.title}</strong>
                  <p>{list.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
