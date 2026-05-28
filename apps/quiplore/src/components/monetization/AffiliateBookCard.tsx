"use client";

import { BookOpen, ExternalLink } from "lucide-react";

import { decorateAffiliateLink } from "../../lib/affiliate";

interface AffiliateBookCardProps {
  title: string;
  author?: string;
  description: string;
  price?: string;
  amazonUrl?: string;
  bookshopUrl?: string;
}

export default function AffiliateBookCard({
  title,
  author,
  description,
  price,
  amazonUrl,
  bookshopUrl,
}: AffiliateBookCardProps) {
  const finalAmazonUrl = amazonUrl ? decorateAffiliateLink(amazonUrl) : undefined;
  const finalBookshopUrl = bookshopUrl ? decorateAffiliateLink(bookshopUrl) : undefined;

  return (
    <section className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <span className="section-label">
        <BookOpen size={14} aria-hidden="true" />
        Literature Guide
      </span>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          {author && (
            <span style={{ fontSize: "10px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5 }}>
              By {author}
            </span>
          )}
          <h3 className="panel-title" style={{ margin: "0.25rem 0 0.5rem 0" }}>{title}</h3>
        </div>
        {price && (
          <span className="chip" style={{ fontSize: "11px", padding: "0.25rem 0.5rem", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" }}>
            {price}
          </span>
        )}
      </div>

      <p className="panel-copy" style={{ margin: 0 }}>{description}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
        {finalAmazonUrl && (
          <a
            href={finalAmazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button primary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", textAlign: "center" }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Buy on Amazon
          </a>
        )}

        {finalBookshopUrl && (
          <a
            href={finalBookshopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", textAlign: "center" }}
          >
            <BookOpen size={14} aria-hidden="true" />
            Buy on Bookshop.org
          </a>
        )}
      </div>
    </section>
  );
}
