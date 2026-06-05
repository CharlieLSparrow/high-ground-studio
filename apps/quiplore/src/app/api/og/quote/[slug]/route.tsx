import { ImageResponse } from "next/og";
import { getQuotePassportBySlug } from "@high-ground/quipsly-domain/seed";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const passport = getQuotePassportBySlug(slug);

  if (!passport) {
    return new Response("Not found", { status: 404 });
  }

  // Simplified OpenGraph image response simulating a Quipsly-branded share card
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8efdf", // Parchment background
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            backgroundColor: "#fffaf1",
            padding: "40px",
            borderRadius: "16px",
            boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
            <span style={{ fontSize: 24, fontWeight: "bold", color: "#b7733c", marginRight: "12px" }}>
              QuipLore
            </span>
            <span
              style={{
                backgroundColor: "#e0f2fe",
                color: "#0284c7",
                padding: "4px 12px",
                borderRadius: "999px",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {passport.quote.verificationStatus === "verified" || passport.quote.verificationStatus === "attributed"
                ? "✓ Source Verified"
                : "ℹ Context Required"}
            </span>
          </div>

          <p style={{ fontSize: 42, color: "#3d2618", lineHeight: 1.4, marginBottom: "30px", fontStyle: "italic" }}>
            "{passport.quote.text}"
          </p>

          <div style={{ display: "flex", flexDirection: "column", color: "#4a2e1c" }}>
            <strong style={{ fontSize: 28 }}>{passport.person.displayName}</strong>
            <span style={{ fontSize: 20, marginTop: "8px", opacity: 0.8 }}>
              {passport.sourceWork.title}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
