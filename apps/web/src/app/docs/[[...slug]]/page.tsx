import Link from "next/link";
import { source } from "@/lib/source";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];

  const page = source.getPage(segments);
  if (!page) return notFound();

  const MDX = page.data.body;

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #10282d 0%, #17363d 24%, #284840 60%, #f3eadb 60%, #f3eadb 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 20px 80px",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/"
            style={{
              color: "rgba(255,255,255,0.82)",
              textDecoration: "none",
              fontSize: 14,
              letterSpacing: "0.04em",
            }}
          >
            ← Back to High Ground Odyssey
          </Link>
        </div>

        <header
          style={{
            marginBottom: 28,
            color: "#f5efe6",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 12px",
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
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              lineHeight: 1.02,
              textWrap: "balance",
            }}
          >
            {page.data.title}
          </h1>

          {"description" in page.data && page.data.description ? (
            <p
              style={{
                maxWidth: 760,
                marginTop: 16,
                marginBottom: 0,
                fontSize: "1.08rem",
                lineHeight: 1.7,
                color: "rgba(245,239,230,0.88)",
              }}
            >
              {page.data.description}
            </p>
          ) : null}
        </header>

        <article
          style={{
            maxWidth: 820,
            background: "#fffdf8",
            color: "#2a2926",
            borderRadius: 28,
            padding: "40px 30px",
            boxShadow: "0 24px 70px rgba(0,0,0,0.16)",
            border: "1px solid rgba(32,32,32,0.06)",
          }}
        >
          <div
            style={{
              fontSize: "1.08rem",
              lineHeight: 1.9,
            }}
          >
            <style>{`
              article h1,
              article h2,
              article h3,
              article h4 {
                color: #17363d;
                line-height: 1.15;
                margin-top: 2.2rem;
                margin-bottom: 0.8rem;
                letter-spacing: -0.02em;
              }

              article h1 { font-size: 2.3rem; }
              article h2 { font-size: 1.8rem; }
              article h3 { font-size: 1.35rem; }

              article p {
                margin: 1rem 0;
              }

              article ul,
              article ol {
                margin: 1rem 0 1.25rem 1.2rem;
                padding: 0;
              }

              article li {
                margin: 0.45rem 0;
              }

              article a {
                color: #1f5f66;
                text-decoration-thickness: 2px;
                text-underline-offset: 3px;
              }

              article blockquote {
                margin: 1.8rem 0;
                padding: 0.4rem 0 0.4rem 1rem;
                border-left: 4px solid #c79654;
                color: #5b5147;
                font-style: italic;
                background: rgba(199, 150, 84, 0.08);
                border-radius: 0 12px 12px 0;
              }

              article hr {
                border: none;
                border-top: 1px solid rgba(32,32,32,0.12);
                margin: 2rem 0;
              }

              article strong {
                color: #1d1b18;
              }

              article code {
                background: rgba(23, 54, 61, 0.08);
                padding: 0.15rem 0.35rem;
                border-radius: 6px;
                font-size: 0.95em;
              }
            `}</style>
            <MDX />
          </div>
        </article>
      </div>
    </main>
  );
}