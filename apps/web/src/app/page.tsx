const featuredEpisodes = [
  {
    title: "Preface Pilot Episode",
    href: "/docs/episode-001",
    youtubeId: "96LN__TA-T8",
    description:
      "The opening preface to Learning to Lead — why this story exists, and why it matters.",
  },
  {
    title: "It’s a Metaphor!",
    href: "/docs/episode-002",
    youtubeId: "7Rn4rV2cLy4",
    description:
      "Finding life lessons in ordinary things, and learning to make good meaning.",
  },
  {
    title: "In the Beginning",
    href: "/docs/episode-003",
    youtubeId: "rf3L1xki_Nk",
    description:
      "Family history, legacy, and the power of knowing where you came from.",
  },
];

const readingLinks = [
  { href: "/docs/preface", label: "Read the Preface" },
  { href: "/docs/introduction", label: "Read the Introduction" },
  {
    href: "/docs/chapter-zero-in-the-beginning",
    label: "Read Chapter Zero",
  },
  { href: "/docs", label: "Browse All Published Pages" },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #0d2328 0%, #16353a 22%, #2b4a43 48%, #7d5b34 76%, #f3eadb 100%)",
        color: "#f5efe6",
      }}
    >
      {/* HERO */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px 20px 60px",
        }}
      >
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 32,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              letterSpacing: "-0.03em",
              fontSize: 20,
            }}
          >
            High Ground Odyssey
          </div>

          <div
            style={{
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <a
              href="/docs"
              style={{
                color: "rgba(245,239,230,0.92)",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Articles
            </a>
            <a
              href="#episodes"
              style={{
                color: "rgba(245,239,230,0.92)",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Episodes
            </a>
            <a
              href="#start-reading"
              style={{
                color: "rgba(245,239,230,0.92)",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Start Reading
            </a>
          </div>
        </nav>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 28,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 18,
              }}
            >
              Summer Blockbuster at Sunset
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "clamp(3rem, 7vw, 6rem)",
                lineHeight: 0.94,
                letterSpacing: "-0.05em",
                textWrap: "balance",
              }}
            >
              Stories of leadership,
              <br />
              legacy, and the climb.
            </h1>

            <p
              style={{
                maxWidth: 720,
                marginTop: 20,
                marginBottom: 0,
                fontSize: "clamp(1.05rem, 2vw, 1.2rem)",
                lineHeight: 1.75,
                color: "rgba(245,239,230,0.90)",
              }}
            >
              High Ground Odyssey is a storytelling project about family,
              courage, memory, faith, and the lessons hidden inside ordinary
              life. Part podcast, part book, part campfire conversation.
            </p>

            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                marginTop: 30,
              }}
            >
              <a
                href="/docs/preface"
                style={{
                  background: "#ff7a18",
                  color: "#fffaf4",
                  textDecoration: "none",
                  fontWeight: 800,
                  padding: "14px 22px",
                  borderRadius: 16,
                  boxShadow: "0 10px 30px rgba(255, 122, 24, 0.30)",
                }}
              >
                Start Here
              </a>

              <a
                href="#episodes"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  color: "#f5efe6",
                  textDecoration: "none",
                  fontWeight: 700,
                  padding: "14px 22px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                Watch Episodes
              </a>
            </div>
          </div>

          <div>
            <div
              style={{
                position: "relative",
                borderRadius: 30,
                overflow: "hidden",
                boxShadow: "0 28px 70px rgba(0,0,0,0.28)",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <img
                src="/images/hero.jpg"
                alt="High Ground Odyssey hero"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(255,122,24,0.05) 0%, rgba(0,0,0,0.00) 35%, rgba(0,0,0,0.18) 100%)",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED EPISODES */}
      <section
        id="episodes"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 20px 56px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                color: "#ff9a3d",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 10,
                fontWeight: 700,
              }}
            >
              Featured Episodes
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 4vw, 3rem)",
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              Watch the opening run
            </h2>
          </div>

          <a
            href="/docs"
            style={{
              color: "#f5efe6",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Browse all published pages →
          </a>
        </div>

        <div
          style={{
            display: "grid",
            gap: 22,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          }}
        >
          {featuredEpisodes.map((episode) => (
            <article
              key={episode.href}
              style={{
                background: "rgba(10, 21, 24, 0.35)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 26,
                overflow: "hidden",
                backdropFilter: "blur(10px)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  position: "relative",
                  paddingTop: "56.25%",
                  background: "#111",
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${episode.youtubeId}`}
                  title={episode.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                  }}
                />
              </div>

              <div style={{ padding: 22 }}>
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: 10,
                    fontSize: 22,
                    lineHeight: 1.15,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {episode.title}
                </h3>

                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 18,
                    color: "rgba(245,239,230,0.86)",
                    lineHeight: 1.7,
                  }}
                >
                  {episode.description}
                </p>

                <a
                  href={episode.href}
                  style={{
                    color: "#ff9a3d",
                    textDecoration: "none",
                    fontWeight: 800,
                  }}
                >
                  Read companion page →
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* READING PATH */}
      <section
        id="start-reading"
        style={{
          background: "#f3eadb",
          color: "#241f1a",
          padding: "70px 20px 90px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: 26,
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                color: "#c45f0d",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 12,
                fontWeight: 800,
              }}
            >
              Reading Path
            </div>

            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                fontSize: "clamp(2rem, 4vw, 3.2rem)",
                lineHeight: 0.98,
                letterSpacing: "-0.05em",
                color: "#16353a",
              }}
            >
              Read the published sections
            </h2>

            <p
              style={{
                marginTop: 0,
                lineHeight: 1.8,
                color: "#4e463f",
                maxWidth: 620,
              }}
            >
              These are the first published pages from the book and podcast
              project. Start with the preface, then move into the opening
              reflections on metaphor, ancestry, and legacy.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {readingLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "#1d1b18",
                  background: "#fffaf4",
                  border: "1px solid rgba(22,53,58,0.08)",
                  borderRadius: 22,
                  padding: "20px 22px",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
                  fontWeight: 700,
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}