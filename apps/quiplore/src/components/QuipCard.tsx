"use client";

import Link from "next/link";
import { Bookmark, ExternalLink, ListPlus, Share2 } from "lucide-react";
import type { QuipCardProjection } from "@high-ground/quipsly-domain";
import { QuipVisual } from "./QuipVisual";
import { SourceBadge } from "./SourceBadge";
import { VerificationBadge } from "./VerificationBadge";

export function QuipCard({
  card,
  curatorNote,
}: {
  readonly card: QuipCardProjection;
  readonly curatorNote?: string;
}) {
  return (
    <article className="quip-card">
      <QuipVisual visual={card.quote.visual} />
      <div className="chip-row" aria-label="Quote metadata">
        <VerificationBadge status={card.quote.verificationStatus} />
        <SourceBadge source={card.sourceWork} />
        {card.themes.slice(0, 2).map((theme) => (
          <span className="chip" key={theme.id}>
            {theme.label}
          </span>
        ))}
      </div>
      <blockquote>{card.quote.text}</blockquote>
      <footer>
        <strong>{card.person.displayName}</strong>
        <span> | {card.sourceWork.title}</span>
        {curatorNote ? <p>{curatorNote}</p> : null}
      </footer>
      <div className="quip-card-actions">
        <Link className="button" href={`/quotes/${card.quote.slug}`}>
          <ExternalLink size={15} aria-hidden="true" />
          Passport
        </Link>
        <button 
          className="button" 
          type="button" 
          title="Save to Nest coming soon (local save only)"
        >
          <Bookmark size={15} aria-hidden="true" />
          Save
        </button>
        <button className="button" type="button">
          <ListPlus size={15} aria-hidden="true" />
          Add
        </button>
        <button 
          className="button" 
          type="button" 
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(`"${card.quote.text}" - ${card.person.displayName}`);
            }
          }}
        >
          <Share2 size={15} aria-hidden="true" />
          Share
        </button>
      </div>
    </article>
  );
}
