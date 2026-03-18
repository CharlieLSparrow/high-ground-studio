"use client";

import { useEffect, useState } from "react";

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
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const heroImageTranslate = Math.min(scrollY * 0.18, 120);
  const heroGlowTranslate = Math.min(scrollY * 0.3, 180);
  const heroTextTranslate = Math.min(scrollY * 0.08, 60);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3eadb",
        color: "#1f1b17",
      }}
    >
      {/* HERO */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          overflow: "hidden",
          background:
            "linear-gradient(180deg, #0f252a 0%, #18363d 28%, #35554b 60%, #8f6337 100%)",
        }}
      >
        {/* Background image */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${heroImageTranslate}px) scale(1.08)`,
            transformOrigin: "center top",
            transition: "transform 0.08s linear",
            willChange: "transform",
          }}
        >
          <img
            src="/images/hero.jpg"
            alt="High Ground Odyssey hero"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 28%",
              display: "block",
              filter: "saturate(1.05) contrast(1.02)",
            }}
          />
        </div>

        {/* Dark teal wash */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(8,20,22,0.35) 0%, rgba(11,24,27,0.20) 24%, rgba(14,28,28,0.22) 56%, rgba(12,14,16,0.58) 100%)",
          }}
        />

        {/* Orange sunset glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${heroGlowTranslate}px)`,
            transition: "transform 0.08s linear",
            background:
              "radial-gradient(circle at 78% 24%, rgba(255,122,24,0.34) 0%, rgba(255,154,61,0.18) 20%, rgba(255,154,61,0.00) 42%)",
            pointerEvents: "none",
            willChange: "transform",
          }}
        />

        {/* Bottom fade into page */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 58%, rgba(8,13,15,0.28) 72%, rgba(243,234,219,1) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Nav */}
        <div
          style={{
            position: "relative",
            zIndex: 5,
            maxWidth: 1240,
            margin: "0 auto",
            padding: "24px 24px 0",
          }}
        >
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <a
              href="/"
              style={{
                color: "#f8f2e8",
                textDecoration: "none",
                fontWeight: 800,
                fontSize: 20,
                letterSpacing: "-0.03em",
              }}
            >
              High Ground Odyssey
            </a>

            <div
              style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <a
                href="#episodes"
                style={{
                  color: "rgba(248,242,232,0.9)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Episodes
              </a>
              <a
                href="#reading"
                style={{
                  color: "rgba(248,242,232,0.9)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Reading
              </a>
              <a
                href="/docs"
                style={{
                  color: "#ff9a3d",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Docs
              </a>
            </div>
          </nav>
        </div>

        {/* Hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 5,
            maxWidth: 1240,
            margin: "0 auto",
            minHeight: "calc(100vh - 88px)",
            display: "flex",
            alignItems: "flex-end",
            padding: "24px 24px 90px",
          }}
        >
          <div
            style={{
              maxWidth: 760,
              transform: `translateY(${heroTextTranslate}px)`,
              transition: "transform 0.08s linear",
              willChange: "transform",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#fff2df",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 18,
                backdropFilter: "blur(10px)",
              }}
            >
              Summer Blockbuster at Sunset
            </div>

            <h1
              style={{
                margin: 0,
                color: "#fff4e8",
                fontSize: "clamp(3.2rem, 8vw, 7rem)",
                lineHeight: 0.92,
                letterSpacing: "-0.06em",
                textWrap: "balance",
                textShadow: "0 8px 40px rgba(0,0,0,0.28)",
              }}
            >
              Leadership,
              <br />
              legacy,
              <br />
              and the climb.
            </h1>

            <p
              style={{
                marginTop: 20,
                marginBottom: 0,
                maxWidth: 680,
                color: "rgba(255,244,232,0.92)",
                fontSize: "clamp(1.05rem, 2vw, 1.24rem)",
                lineHeight: 1.75,
                textShadow: "0 6px 20px rgba(0,0,0,0.22)",
              }}
            >
              High Ground Odyssey is a storytelling project about family,
              courage, faith, memory, and the lessons hidden inside ordinary
              life. A podcast, a book, and a growing archive of stories worth
              carrying forward.
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
                  background: "#ff7a18",
                  color: "#fffaf3",
                  textDecoration: "none",
                  fontWeight: 800,
                  padding: "15px 22px",
                  borderRadius: 16,
                  boxShadow: "0 14px 34px rgba(255,122,24,0.30)",
                }}
              >
                Start Here
              </a>

              <a
                href="#episodes"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  color: "#fff4e8",
                  textDecoration: "none",
                  fontWeight: 700,
                  padding: "15px 22px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(10px)",
                }}
              >
                Watch Episodes
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* EPISODES */}
      <section
        id="episodes"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "30px 24px 70px",
        }}
      >
        <div
          style={{
            marginBottom: 26,
          }}
        >
          <div
            style={{
              color: "#c55e0c",
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            Featured Episodes
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "clamp(2.1rem, 4vw, 3.5rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.05em",
              color: "#17363d",
            }}
          >
            Watch the opening run
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gap: 24,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {featuredEpisodes.map((episode) => (
            <article
              key={episode.href}
              style={{
                background: "#fffaf4",
                border: "1px solid rgba(23,54,61,0.08)",
                borderRadius: 26,
                overflow: "hidden",
                boxShadow: "0 16px 34px rgba(0,0,0,0.08)",
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
                    color: "#17363d",
                    fontSize: 24,
                    lineHeight: 1.1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {episode.title}
                </h3>

                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 18,
                    lineHeight: 1.7,
                    color: "#52483f",
                  }}
                >
                  {episode.description}
                </p>

                <a
                  href={episode.href}
                  style={{
                    color: "#ff7a18",
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

      {/* READING */}
      <section
        id="reading"
        style={{
          background:
            "linear-gradient(180deg, #f1e8da 0%, #f7f0e6 100%)",
          padding: "24px 24px 90px",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            display: "grid",
            gap: 28,
            gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)",
          }}
        >
          <div>
            <div
              style={{
                color: "#c55e0c",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 800,
                marginBottom: 12,
              }}
            >
              Reading Path
            </div>

            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                fontSize: "clamp(2rem, 4vw, 3.4rem)",
                lineHeight: 0.96,
                letterSpacing: "-0.05em",
                color: "#17363d",
              }}
            >
              Read the opening sections
            </h2>

            <p
              style={{
                marginTop: 0,
                maxWidth: 620,
                color: "#554a41",
                lineHeight: 1.8,
                fontSize: "1.02rem",
              }}
            >
              Start with the preface, move into the introduction, then into
              Chapter Zero. These are the first trail markers of the larger
              story.
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
                  color: "#1d1a17",
                  background: "#fffaf4",
                  border: "1px solid rgba(23,54,61,0.08)",
                  borderRadius: 22,
                  padding: "20px 22px",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
                  fontWeight: 800,
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