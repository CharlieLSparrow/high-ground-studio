"use client";

const episodes = [
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

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #0d2328 0%, #16353a 20%, #2b4a43 42%, #7d5b34 72%, #f3eadb 100%)",
        color: "#f5efe6",
      }}
    >
      {/* HERO INTRO */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "42px 24px 40px",
        }}
      >
        <div
          style={{
            maxWidth: 780,
          }}
        >
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
            High Ground Odyssey
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(3rem, 7vw, 6rem)",
              lineHeight: 0.92,
              letterSpacing: "-0.06em",
              textWrap: "balance",
              color: "#fff4e8",
            }}
          >
            Stories worth
            <br />
            climbing for.
          </h1>

          <p
            style={{
              marginTop: 20,
              marginBottom: 0,
              maxWidth: 700,
              color: "rgba(245,239,230,0.92)",
              fontSize: "clamp(1.04rem, 2vw, 1.18rem)",
              lineHeight: 1.8,
            }}
          >
            High Ground Odyssey is a podcast and storytelling project about
            leadership, legacy, family, and the lessons hidden inside ordinary
            life. Start with the opening episodes below.
          </p>
        </div>
      </section>

      {/* FEATURED VIDEO HERO */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px 36px",
        }}
      >
        <article
          style={{
            background: "rgba(10, 21, 24, 0.34)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 30,
            overflow: "hidden",
            backdropFilter: "blur(10px)",
            boxShadow: "0 28px 60px rgba(0,0,0,0.22)",
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
              src={`https://www.youtube.com/embed/${episodes[0].youtubeId}`}
              title={episodes[0].title}
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

          <div style={{ padding: "26px 26px 28px" }}>
            <div
              style={{
                color: "#ff9a3d",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 800,
                marginBottom: 12,
              }}
            >
              Featured Episode
            </div>

            <h2
              style={{
                marginTop: 0,
                marginBottom: 12,
                fontSize: "clamp(2rem, 4vw, 3rem)",
                lineHeight: 1,
                letterSpacing: "-0.05em",
                color: "#fff4e8",
              }}
            >
              {episodes[0].title}
            </h2>

            <p
              style={{
                marginTop: 0,
                marginBottom: 18,
                maxWidth: 760,
                color: "rgba(245,239,230,0.88)",
                lineHeight: 1.8,
                fontSize: "1.04rem",
              }}
            >
              {episodes[0].description}
            </p>

            <OrangeLink href={episodes[0].href}>
              Read companion article →
            </OrangeLink>
          </div>
        </article>
      </section>

      {/* EPISODE FEED */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px 90px",
        }}
      >
        <div
          style={{
            marginBottom: 22,
          }}
        >
          <div
            style={{
              color: "#ff9a3d",
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            Episode Feed
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "clamp(2rem, 4vw, 3.2rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.05em",
              color: "#fff4e8",
            }}
          >
            Start with the opening run
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gap: 24,
          }}
        >
          {episodes.slice(1).map((episode) => (
            <article
              key={episode.href}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
                gap: 0,
                background: "rgba(10, 21, 24, 0.30)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 28,
                overflow: "hidden",
                backdropFilter: "blur(10px)",
                boxShadow: "0 18px 38px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  padding: "28px 28px 30px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: 12,
                    fontSize: "clamp(1.8rem, 3vw, 2.5rem)",
                    lineHeight: 1,
                    letterSpacing: "-0.05em",
                    color: "#fff4e8",
                  }}
                >
                  {episode.title}
                </h3>

                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 18,
                    color: "rgba(245,239,230,0.88)",
                    lineHeight: 1.8,
                    fontSize: "1.02rem",
                    maxWidth: 620,
                  }}
                >
                  {episode.description}
                </p>

                <OrangeLink href={episode.href}>
                  Read companion article →
                </OrangeLink>
              </div>

              <div
                style={{
                  position: "relative",
                  minHeight: 280,
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
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function OrangeLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        color: "#f5efe6",
        textDecoration: "none",
        fontWeight: 800,
        fontSize: 15,
        transition: "color 160ms ease, text-shadow 160ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "#ff7a18";
        e.currentTarget.style.textShadow = "0 0 18px rgba(255,122,24,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "#f5efe6";
        e.currentTarget.style.textShadow = "none";
      }}
    >
      {children}
    </a>
  );
}