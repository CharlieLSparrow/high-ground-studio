import { AppShell } from "@/components/AppShell";
import { QuipStreamExperience } from "@/components/QuipStreamExperience";

export const metadata = {
  title: "QuipStream",
};

export default function StreamPage() {
  return (
    <AppShell>
      <div className="page-head">
        <span className="section-label">Discovery</span>
        <h1>QuipStream</h1>
        <p>
          A vertical quote discovery loop that records the useful signals:
          impressions, saves, Lorelist adds, Quote Passport opens, and explicit
          feedback.
        </p>
      </div>
      <div className="detail-grid">
        <div className="stream-column" style={{ position: "static" }}>
          <QuipStreamExperience fullScreen />
        </div>
        <aside className="stack">
          <section className="panel">
            <h2 className="panel-title">Built for curation metrics.</h2>
            <p className="panel-copy">
              The stream borrows the one-card-at-a-time shape from short-form
              feeds, but the product score is usefulness: what got saved,
              opened, sourced, added, or rejected with a clear reason.
            </p>
          </section>
          <section className="panel">
            <h2 className="panel-title">Future ML path.</h2>
            <p className="panel-copy">
              Editorial rules first, semantic retrieval second, collaborative
              signals third, learned ranking only after enough trustworthy event
              volume exists.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
