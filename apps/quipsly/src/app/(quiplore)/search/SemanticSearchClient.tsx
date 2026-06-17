"use client";

import { useState } from "react";
import { searchSemanticQuotes } from "../../actions/lore-actions";
import { Search, Loader2 } from "lucide-react";

export function SemanticSearchClient({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !projectId) return;

    setIsSearching(true);
    setError(null);
    try {
      const data = await searchSemanticQuotes(projectId, query, 10);
      setResults(data as any[]);
    } catch (err: any) {
      setError(err.message || "Failed to search.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-5 w-5 text-[#8c6b4a]" />
          <input
            type="text"
            className="w-full rounded-full border border-[#eadfca] bg-white py-3 pl-10 pr-4 text-[#3d3122] shadow-sm focus:border-[#d5b77d] focus:outline-none focus:ring-1 focus:ring-[#d5b77d]"
            placeholder="Search by meaning or concept (e.g. 'struggles of leadership')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !projectId}
          className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-6 py-3 text-xs font-black uppercase tracking-widest text-[#fffaf3] transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {isSearching ? <Loader2 className="animate-spin" size={14} /> : "Search"}
        </button>
      </form>

      {error && <div className="text-rose-600 font-bold">{error}</div>}
      {!projectId && <div className="text-amber-600 font-bold">Please provide a projectId in the URL (?project=ID) to search.</div>}

      <div className="space-y-4">
        {results.map((quote) => (
          <div key={quote.id} className="rounded-2xl border border-[#eadfca] bg-white p-5 shadow-sm transition hover:border-[#d5b77d] hover:bg-[#fff8eb]">
            <p className="font-serif text-xl font-bold text-[#3d3122]">"{quote.text}"</p>
            {quote.context && <p className="mt-2 text-sm text-[#7d6a50]">Context: {quote.context}</p>}
            <div className="mt-3 text-xs font-black uppercase tracking-widest text-[#8c6b4a]">
              ID: {quote.id}
            </div>
          </div>
        ))}
        {results.length === 0 && !isSearching && query && !error && (
          <div className="text-center text-[#8c6b4a] py-12">No conceptually similar quotes found.</div>
        )}
      </div>
    </div>
  );
}
