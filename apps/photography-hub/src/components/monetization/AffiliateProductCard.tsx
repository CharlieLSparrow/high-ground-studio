"use client";

import { ShoppingBag, BookOpen, ExternalLink, Camera } from "lucide-react";

interface AffiliateProductCardProps {
  title: string;
  brandOrAuthor?: string;
  description: string;
  price?: string;
  amazonUrl?: string;
  bookshopUrl?: string;
  category?: "book" | "gear" | "course";
}

export default function AffiliateProductCard({
  title,
  brandOrAuthor,
  description,
  price,
  amazonUrl,
  bookshopUrl,
  category = "gear",
}: AffiliateProductCardProps) {
  const amazonTag = process.env.NEXT_PUBLIC_AFFILIATE_AMAZON_TAG?.trim();
  const bookshopTag = process.env.NEXT_PUBLIC_AFFILIATE_BOOKSHOP_TAG?.trim();

  let finalAmazonUrl = amazonUrl;
  if (amazonUrl && amazonTag) {
    const separator = amazonUrl.includes("?") ? "&" : "?";
    finalAmazonUrl = `${amazonUrl}${separator}tag=${encodeURIComponent(amazonTag)}`;
  }

  let finalBookshopUrl = bookshopUrl;
  if (bookshopUrl && bookshopTag) {
    const separator = bookshopUrl.includes("?") ? "&" : "?";
    finalBookshopUrl = `${bookshopUrl}${separator}partner=${encodeURIComponent(bookshopTag)}`;
  }

  const Icon = category === "book" ? BookOpen : Camera;

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-stone-900 bg-stone-900/20 p-6 shadow-sm transition-all duration-300 hover:border-stone-800 hover:bg-stone-900/40">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-400/0 via-transparent to-amber-400/3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 group-hover:bg-amber-400/20 transition-colors">
            <Icon className="size-5" />
          </span>
          {price && (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-400">
              {price}
            </span>
          )}
        </div>

        {brandOrAuthor && (
          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest block mb-1 font-mono">
            {brandOrAuthor}
          </span>
        )}
        
        <h4 className="font-serif text-base font-bold text-stone-150 mb-2 group-hover:text-amber-300 transition-colors">
          {title}
        </h4>
        
        <p className="text-xs leading-relaxed text-stone-400 mb-6">
          {description}
        </p>
      </div>

      <div className="space-y-2 mt-4">
        {finalAmazonUrl && (
          <a
            href={finalAmazonUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 py-2.5 text-xs font-bold text-stone-950 transition-all hover:bg-amber-300 hover:shadow-[0_0_16px_rgba(251,191,36,0.25)]"
          >
            <ExternalLink className="size-3.5" /> Buy on Amazon
          </a>
        )}

        {category === "book" && finalBookshopUrl && (
          <a
            href={finalBookshopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-850 bg-stone-900/40 py-2.5 text-xs font-semibold text-stone-200 transition-all hover:bg-stone-900"
          >
            <BookOpen className="size-3.5 text-amber-400" /> Buy on Bookshop.org
          </a>
        )}
      </div>
    </article>
  );
}
