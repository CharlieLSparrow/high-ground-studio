const links = [
  { href: "/docs/preface", label: "Preface" },
  { href: "/docs/episode-001", label: "Episode 001 — Preface Pilot Episode" },
  { href: "/docs/introduction", label: "Introduction — It’s a Metaphor!" },
  { href: "/docs/episode-002", label: "Episode 002 — It’s a Metaphor!" },
  { href: "/docs/chapter-zero-in-the-beginning", label: "Chapter Zero — In the Beginning" },
  { href: "/docs/episode-003", label: "Episode 003 — In the Beginning" },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        color: "#f5efe6",
        background:
          "linear-gradient(180deg, #0e2a2f 0%, #173b42 28%, #315a4d 55%, #8f6b3d 82%, #d1a56a 100%)",
      }}
    >
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "72px 24px 40px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.14)",
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          High Ground Odyssey
        </div>

        <h1
          style={{
            fontSize: "clamp(2.8rem, 7vw, 5.5rem)",
            lineHeight: 0.95,
            margin: "0 0 18px",
            maxWidth: 900,
            textWrap: "balance",
          }}
        >
          Stories, leadership,
          <br />
          legacy, and the climb.
        </h1>

        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            lineHeight: 1.7,
            maxWidth: 760,
            margin: 0,
            color: "rgba(245,239,230,0.9)",
          }}
        >
          High Ground Odyssey is a storytelling project about family, courage,
          leadership, and the lessons hidden inside ordinary life. These first
          published pages are the opening trail markers.
        </p>

        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 28,
          }}
        >
          <a
            href="/docs/preface"
            style={{
              padding: "14px 20px",
              borderRadius: 14,
              background: "#f5efe6",
              color: "#16353a",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Start with the Preface
          </a>

          <a
            href="/docs"
            style={{
              padding: "14px 20px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#f5efe6",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Browse All Published Pages
          </a>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "8px 24px 72px",
          display: "grid",
          gap: 20,
          gridTemplateColumns: "1.2fr 0.8fr",
        }}
      >
        <div
          style={{
            borderRadius: 28,
            padding: 28,
            background: "rgba(8, 20, 22, 0.34)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 28 }}>Published Now</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  textDecoration: "none",
                  color: "#f5efe6",
                  padding: "16px 18px",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "block",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 17 }}>{link.label}</div>
              </a>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 20,
          }}
        >
          <div
            style={{
              borderRadius: 28,
              padding: 24,
              background: "rgba(8, 20, 22, 0.34)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(8px)",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 22 }}>Current Focus</h3>
            <p
              style={{
                marginBottom: 0,
                lineHeight: 1.7,
                color: "rgba(245,239,230,0.9)",
              }}
            >
              The opening episodes and the first sections of the book are now
              live. This site will keep growing as more chapters, episodes,
              research, and reflections are added.
            </p>
          </div>

          <div
            style={{
              borderRadius: 28,
              padding: 24,
              background: "rgba(8, 20, 22, 0.34)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(8px)",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 22 }}>What This Is</h3>
            <p
              style={{
                marginBottom: 0,
                lineHeight: 1.7,
                color: "rgba(245,239,230,0.9)",
              }}
            >
              A home for the podcast, the book, and the deeper ideas behind
              both—built one story at a time.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}