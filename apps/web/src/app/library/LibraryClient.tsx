"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Sparkles, Trash2, Calendar, FileText } from "lucide-react";
import GlassPanel from "@/components/ui/GlassPanel";
import QuoteCardModal from "@/components/hgo/public/QuoteCardModal";
import { deleteSnippetAction } from "./actions";

interface Snippet {
  id: string;
  userId: string;
  highlightedText: string;
  note: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LibraryClientProps {
  snippets: Snippet[];
}

const LIBRARY_TIME_ZONE = "America/Denver";

function formatLibraryDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: LIBRARY_TIME_ZONE,
  }).format(new Date(value));
}

export default function LibraryClient({ snippets }: LibraryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter snippets based on query
  const filteredSnippets = snippets.filter((s) => {
    const query = searchQuery.toLowerCase();
    const textMatch = s.highlightedText.toLowerCase().includes(query);
    const noteMatch = s.note ? s.note.toLowerCase().includes(query) : false;
    const sourceMatch = s.sourceTitle ? s.sourceTitle.toLowerCase().includes(query) : false;
    return textMatch || noteMatch || sourceMatch;
  });

  const handleDelete = (snippetId: string) => {
    if (confirm("Are you sure you want to delete this highlight?")) {
      startTransition(async () => {
        const formData = new FormData();
        formData.append("snippetId", snippetId);
        try {
          await deleteSnippetAction(formData);
        } catch (error) {
          alert(error instanceof Error ? error.message : "Deletion failed");
        }
      });
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Search and Filters Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search snippets, notes, or episodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-zinc-950/40 py-3.5 pl-12 pr-4 text-sm text-white placeholder-zinc-500 backdrop-blur-md outline-none transition focus:border-amber-500/40 focus:bg-zinc-950/60"
        />
      </div>

      {filteredSnippets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-12 text-center text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
          <p className="mb-4">No highlights found matching your search.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredSnippets.map((snippet) => (
            <GlassPanel
              key={snippet.id}
              className="flex flex-col justify-between p-6 text-[var(--text-light)] hover:border-white/15 transition-all duration-300"
            >
              <div>
                <blockquote className="border-l-2 border-amber-400 pl-4 text-sm italic text-zinc-200">
                  "{snippet.highlightedText}"
                </blockquote>
                {snippet.note && (
                  <div className="mt-3 text-xs text-zinc-400 bg-black/20 px-3 py-2 rounded-lg flex items-start gap-2">
                    <FileText className="h-4 w-4 text-amber-500/80 shrink-0 mt-0.5" />
                    <div>
                      <strong>Note:</strong> {snippet.note}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4 text-xs text-zinc-400">
                <div className="space-y-1">
                  <div>
                    Saved from{" "}
                    {snippet.sourceUrl ? (
                      <Link
                        href={snippet.sourceUrl}
                        className="font-semibold text-amber-400 hover:underline"
                      >
                        {snippet.sourceTitle || "Episode"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-zinc-300">
                        {snippet.sourceTitle || "Episode"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-mono text-zinc-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatLibraryDate(snippet.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Share button */}
                  <button
                    onClick={() => setSelectedSnippet(snippet)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-amber-200 transition hover:bg-amber-500/20"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Share Card
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(snippet.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-red-200 transition hover:bg-red-500/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* Quote card designer modal portal */}
      {selectedSnippet && (
        <QuoteCardModal
          snippet={selectedSnippet}
          onClose={() => setSelectedSnippet(null)}
        />
      )}
    </div>
  );
}
