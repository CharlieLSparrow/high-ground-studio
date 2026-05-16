const sources = [
  {
    title: "Learning to Lead",
    detail: "Living manuscript source with stable block IDs.",
  },
  {
    title: "Episode Prep",
    detail: "Packets, show notes, transcripts, and production context.",
  },
  {
    title: "Quote Library",
    detail: "Candidate quotes, citation status, and future Quiplore entries.",
  },
];

const nextSteps = [
  "Import or create one Studio document.",
  "Render stable source blocks with provenance.",
  "Identify a span and apply one semantic tag.",
  "Persist the tag/span relationship.",
  "Extract and display the first knowledge node.",
];

export default function StudioHomePage() {
  return (
    <main className="studio-shell">
      <div className="studio-frame">
        <header className="studio-topbar" aria-label="Studio status">
          <div className="studio-mark">
            <div className="studio-glyph" aria-hidden="true">
              S
            </div>
            <div>
              <h1 className="studio-title">High Ground Studio</h1>
              <p className="studio-subtitle">
                Private semantic workbench for writing, research, tags, nodes,
                provenance, and future projections.
              </p>
            </div>
          </div>

          <div className="studio-status">
            <span className="studio-chip" data-tone="source">
              Private shell
            </span>
            <span className="studio-chip" data-tone="tag">
              Tagging centered
            </span>
            <span className="studio-chip" data-tone="node">
              No writes yet
            </span>
          </div>
        </header>

        <section className="studio-workbench" aria-label="Studio workbench">
          <aside className="studio-panel" aria-label="Source lanes">
            <p className="studio-label">Source Lanes</p>
            <h2>Private material stays private until projected.</h2>
            <p>
              The Studio owns drafts, source trails, semantic tags, and
              knowledge nodes. Public apps consume approved projections later.
            </p>

            <div className="studio-source-list">
              {sources.map((source) => (
                <div className="studio-source-item" key={source.title}>
                  <strong>{source.title}</strong>
                  <span>{source.detail}</span>
                </div>
              ))}
            </div>
          </aside>

          <section className="studio-panel" aria-label="Semantic document sketch">
            <p className="studio-label">Semantic Spine</p>
            <h2>Document block to span to tag to node.</h2>

            <div className="studio-document">
              <article className="studio-block">
                <div className="studio-block-header">
                  <h3 className="studio-block-title">
                    Source block: the work begins with meaning in context
                  </h3>
                  <span className="studio-block-id">block:l2l-preface-01</span>
                </div>
                <p className="studio-block-body">
                  A source block becomes useful when a precise{" "}
                  <span className="studio-span">selected span</span> can carry a
                  semantic tag, produce a knowledge node, and keep its provenance
                  attached.
                </p>
              </article>

              <article className="studio-block">
                <div className="studio-block-header">
                  <h3 className="studio-block-title">
                    Tags are the interface for meaning
                  </h3>
                  <span className="studio-block-id">tag:source-aware</span>
                </div>
                <p className="studio-block-body">
                  Tags should describe the semantic role of text, not merely
                  decorate it. The first implementation slice should prove that
                  rule with one real document.
                </p>
              </article>
            </div>
          </section>

          <aside className="studio-panel" aria-label="Prepared next slice">
            <p className="studio-label">Prepared Next Slice</p>
            <h2>The next pass should make one tag real.</h2>

            <div className="studio-card-stack">
              <div className="studio-card">
                <h3>Knowledge node preview</h3>
                <p>
                  The first node should carry tag, source block, span offsets,
                  provenance, and review status.
                </p>
                <div className="studio-node-row">
                  <span className="studio-chip" data-tone="tag">
                    semantic tag
                  </span>
                  <span className="studio-chip" data-tone="node">
                    node
                  </span>
                  <span className="studio-chip" data-tone="source">
                    provenance
                  </span>
                </div>
              </div>

              <ul className="studio-next-list" aria-label="Next implementation steps">
                {nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
