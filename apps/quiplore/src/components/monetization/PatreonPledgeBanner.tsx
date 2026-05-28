"use client";

import { Heart } from "lucide-react";

export default function PatreonPledgeBanner() {
  const isEnabled = process.env.NEXT_PUBLIC_DONATION_ENABLED === "true";
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL?.trim();
  const stripeUrl = process.env.NEXT_PUBLIC_DONATION_STRIPE_URL?.trim();

  if (!isEnabled || (!patreonUrl && !stripeUrl)) {
    return null;
  }

  return (
    <section className="panel" style={{ border: "1px solid rgba(251,191,36,0.3)", backgroundColor: "rgba(251,191,36,0.03)", display: "flex", flexDirection: "column", gap: "0.85rem", textAlign: "center", alignItems: "center" }}>
      <span className="section-label" style={{ color: "var(--accent)" }}>
        <Heart size={14} aria-hidden="true" />
        Pledge Support
      </span>

      <h3 className="panel-title" style={{ margin: 0 }}>Support QuipLore</h3>
      
      <p className="panel-copy" style={{ fontSize: "12px", margin: 0 }}>
        QuipLore is an independent historical quotes dictionary. Help us maintain our reference indexes and keep the passports free.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
        {patreonUrl && (
          <a
            href={patreonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button primary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%" }}
          >
            Become a Patron
          </a>
        )}
        
        {stripeUrl && (
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%" }}
          >
            One-time Donation
          </a>
        )}
      </div>
    </section>
  );
}
