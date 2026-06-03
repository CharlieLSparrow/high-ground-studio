"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, BookOpen, ChevronRight, HelpCircle, ArrowLeft, ArrowUpRight, Sparkles, Loader2 } from "lucide-react";
import { bootstrapHelpDocsAction } from "./actions";

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  articles: Article[];
}

export function HelpClientPortal({
  initialCategories
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [searchQuery, setSearchQuery] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);

  // Trigger bootstrap automatically if categories list is empty
  useEffect(() => {
    if (categories.length === 0) {
      setBootstrapping(true);
      bootstrapHelpDocsAction()
        .then((res) => {
          if (res.ok) {
            // Reload page to fetch seeded data
            window.location.reload();
          }
        })
        .catch(console.error)
        .finally(() => setBootstrapping(false));
    }
  }, [categories]);

  // Client search algorithm
  const filteredCategories = categories.map(cat => {
    const matchedArticles = cat.articles.filter(art => 
      art.isPublished && (
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
    return { ...cat, articles: matchedArticles };
  }).filter(cat => cat.articles.length > 0);

  if (bootstrapping || categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-studio-ink text-center p-6">
        <Loader2 className="w-8 h-8 text-studio-tag animate-spin mb-4" />
        <h3 className="font-bold text-sm">Provisioning Quipsly Knowledge Base...</h3>
        <p className="text-xs text-studio-dim mt-1">Seeding default documentation templates in the database.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-12 px-4 flex flex-col gap-10 text-studio-ink">
      
      {/* Header Search Banner */}
      <header className="text-center flex flex-col items-center gap-6 py-6 border-b border-studio-line">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-studio-tag uppercase tracking-widest flex items-center justify-center gap-1.5">
            <HelpCircle size={12} /> Help Center
          </span>
          <h1 className="text-4xl font-black tracking-tight text-studio-ink">How can we help?</h1>
          <p className="text-sm text-studio-muted max-w-md mx-auto">
            Search our documentation repository or explore categories below for workflows and guides.
          </p>
        </div>

        {/* Big Search Bar */}
        <div className="relative w-full max-w-xl">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-studio-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for articles (e.g. 'storyboard', 'billing')..."
            className="w-full bg-[#032321] border border-studio-line rounded-2xl py-4 pl-12 pr-6 text-sm text-studio-ink placeholder:text-studio-dim/40 focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all shadow-md"
          />
        </div>
      </header>

      {/* Grid structure */}
      <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filteredCategories.map(cat => (
          <div key={cat.id} className="bg-[#032321]/50 border border-studio-line rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-sm text-[#f0b765] flex items-center gap-1.5">
                  <BookOpen size={16} />
                  {cat.name}
                </h3>
                <p className="text-xs text-studio-dim leading-relaxed">{cat.description || "Guides for this topic."}</p>
              </div>

              <div className="flex flex-col gap-2.5 mt-2">
                {cat.articles.map(art => (
                  <Link
                    key={art.id}
                    href={`/help/article/${art.slug}`}
                    className="p-3 bg-[#032321] border border-studio-line rounded-xl hover:border-studio-line-strong transition-all flex justify-between items-center group"
                  >
                    <span className="text-xs font-bold text-studio-ink truncate mr-2 group-hover:text-studio-tag transition-colors">
                      {art.title}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-studio-dim group-hover:text-studio-ink transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="col-span-3 text-center py-16 text-studio-dim italic text-sm border border-dashed border-studio-line rounded-3xl">
            No help articles matching your query was found. Try different terms.
          </div>
        )}
      </main>

      {/* Footer support call-out */}
      <footer className="mt-8 p-6 bg-[#032321]/30 border border-studio-line rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
        <div>
          <h4 className="font-bold text-sm text-studio-ink">Still need assistance?</h4>
          <p className="text-xs text-studio-muted mt-1">If you didn't find your answer, open a support ticket in settings.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard" className="px-5 py-2.5 bg-studio-ink/5 border border-studio-line hover:bg-studio-ink/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1">
            Dashboard <ArrowUpRight size={14} />
          </Link>
          <Link href="/settings" className="px-5 py-2.5 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] rounded-xl text-xs font-black transition-all flex items-center gap-1">
            Support Portal <ChevronRight size={14} />
          </Link>
        </div>
      </footer>

    </div>
  );
}
