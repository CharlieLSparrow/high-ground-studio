import Link from "next/link";

export const metadata = {
  title: "High Ground Odyssey",
  description: "High Ground Odyssey — Leadership, legacy, and storytelling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#f3eadb",
          color: "#1e1d1a",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            backdropFilter: "blur(12px)",
            background: "rgba(16, 40, 45, 0.82)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
            }}
          >
            <Link
              href="/"
              style={{
                color: "#f5efe6",
                textDecoration: "none",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              High Ground Odyssey
            </Link>

            <nav
              style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Link
                href="/"
                style={{
                  color: "rgba(245,239,230,0.88)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Home
              </Link>
              <Link
                href="/docs"
                style={{
                  color: "rgba(245,239,230,0.88)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Docs
              </Link>
              <Link
                href="/docs/preface"
                style={{
                  color: "rgba(245,239,230,0.88)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Preface
              </Link>
              <Link
                href="/docs/episode-001"
                style={{
                  color: "rgba(245,239,230,0.88)",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                Episode 1
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}