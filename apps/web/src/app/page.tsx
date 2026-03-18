export default function Home() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 40 }}>
      <h1 style={{ marginBottom: 8 }}>High Ground Odyssey</h1>
      <p style={{ opacity: 0.8, fontSize: 18, lineHeight: 1.5 }}>
        Leadership, family, legacy, and the stories that shape us.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2>Start Here</h2>
        <ul style={{ lineHeight: 1.9 }}>
          <li><a href="/docs/preface">Preface</a></li>
          <li><a href="/docs/episode-001">Episode 001 — Preface Pilot Episode</a></li>
          <li><a href="/docs/introduction">Introduction — It’s a Metaphor!</a></li>
          <li><a href="/docs/episode-002">Episode 002 — It’s a Metaphor!</a></li>
          <li><a href="/docs/chapter-zero-in-the-beginning">Chapter Zero — In the Beginning</a></li>
          <li><a href="/docs/episode-003">Episode 003 — In the Beginning</a></li>
        </ul>
      </section>
    </main>
  );
}