"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Check, Copy, ImageIcon, Search } from "lucide-react";
import {
  type GeneratedQuipslyArt,
  type GeneratedQuipslyArtRole,
} from "@high-ground/quipsly-domain/generated-art";

function CopyPill({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#e8dcc4] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-[#8c6b4a] transition hover:bg-[#fff8ec]"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ArtLibraryGrid({ items }: { items: readonly GeneratedQuipslyArt[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<GeneratedQuipslyArtRole | "all">("all");

  const roles = useMemo(
    () => Array.from(new Set(items.map((item) => item.role))).sort() as GeneratedQuipslyArtRole[],
    [items],
  );

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const roleMatch = role === "all" || item.role === role;
      const queryMatch =
        needle.length === 0 ||
        item.title.toLowerCase().includes(needle) ||
        item.alt.toLowerCase().includes(needle) ||
        item.promptSeed.toLowerCase().includes(needle);
      return roleMatch && queryMatch;
    });
  }, [items, query, role]);

  return (
    <div>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a96735]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search role, prompt seed, or title..."
            className="w-full rounded-2xl border border-[#e8dcc4] bg-[#fffaf3] py-3 pl-10 pr-4 text-sm font-bold text-[#3d3122] outline-none focus:border-amber-500"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRole("all")}
            className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${
              role === "all"
                ? "border-[#3d3122] bg-[#3d3122] text-white"
                : "border-[#e8dcc4] bg-white text-[#8c6b4a]"
            }`}
          >
            All
          </button>
          {roles.map((itemRole) => (
            <button
              key={itemRole}
              type="button"
              onClick={() => setRole(itemRole)}
              className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${
                role === itemRole
                  ? "border-[#3d3122] bg-[#3d3122] text-white"
                  : "border-[#e8dcc4] bg-white text-[#8c6b4a]"
              }`}
            >
              {itemRole}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dec9a5] bg-[#fffaf3] p-8 text-center text-sm font-bold leading-6 text-[#7d6a50]">
          No Quipslys match that filter yet. Good news: the Art Foundry exists now, so we can make the missing bird.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-[#eadfca] bg-[#fffdf9] shadow-sm">
              <Image
                src={item.src}
                alt={item.alt}
                width={320}
                height={320}
                className="aspect-square w-full object-cover"
              />
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#a96735]">
                    <ImageIcon size={12} />
                    {item.role}
                  </div>
                  <CopyPill value={item.src} label="Copy path" />
                </div>
                <h3 className="mt-2 truncate font-serif text-lg font-black">{item.title}</h3>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#7d6a50]">
                  {item.promptSeed}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyPill value={item.alt} label="Alt" />
                  <CopyPill value={JSON.stringify(item, null, 2)} label="JSON" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
