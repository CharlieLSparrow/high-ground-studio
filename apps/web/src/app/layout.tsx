import "./globals.css";
import Link from "next/link";
import { Facebook, Instagram, Heart } from "lucide-react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            backdropFilter: "blur(14px)",
            background: "rgba(10, 21, 24, 0.55)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* LEFT: Brand */}
            <Link
              href="/"
              style={{
                textDecoration: "none",
                color: "#fff4e8",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                fontSize: 18,
              }}
            >
              High Ground Odyssey
            </Link>

            {/* RIGHT: Social Icons */}
            <div
              style={{
                display: "flex",
                gap: 20,
                alignItems: "center",
              }}
            >
              <SocialIcon
                href="https://www.facebook.com/HighGroundOdyssey"
                label="Facebook"
              >
                <Facebook size={20} />
              </SocialIcon>

              <SocialIcon
                href="https://www.instagram.com/highgroundodyssey/"
                label="Instagram"
              >
                <Instagram size={20} />
              </SocialIcon>

              <SocialIcon
                href="https://www.patreon.com/c/HighGroundOdyssey"
                label="Patreon"
              >
                <Heart size={20} />
              </SocialIcon>
            </div>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}

function SocialIcon({
  href,
  children,
  label,
}: {
  href: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{
        color: "#fff4e8",
        opacity: 0.85,
        transition: "all 0.2s ease",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.color = "#ff7a18";
        e.currentTarget.style.filter =
          "drop-shadow(0 0 10px rgba(255,122,24,0.6))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        e.currentTarget.style.opacity = "0.85";
        e.currentTarget.style.color = "#fff4e8";
        e.currentTarget.style.filter = "none";
      }}
    >
      {children}
    </a>
  );
}