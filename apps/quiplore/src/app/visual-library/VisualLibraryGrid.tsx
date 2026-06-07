"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import {
  type GeneratedQuipslyArt,
  type GeneratedQuipslyArtRole,
} from "@high-ground/quipsly-domain/generated-art";

export function VisualLibraryGrid({ items }: { items: readonly GeneratedQuipslyArt[] }) {
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
    <section className="mt-8">
      <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#ad6b35]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search visual companions..."
            className="w-full rounded-2xl border border-[#e2b17b] bg-white/80 py-3 pl-11 pr-4 font-sans text-sm font-bold text-[#4c331b] outline-none focus:border-[#ad6b35]"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRole("all")}
            className={`rounded-full border px-3 py-2 font-sans text-xs font-black uppercase tracking-[0.12em] ${
              role === "all"
                ? "border-[#4c331b] bg-[#4c331b] text-white"
                : "border-[#e2b17b] bg-white/70 text-[#ad6b35]"
            }`}
          >
            All
          </button>
          {roles.map((itemRole) => (
            <button
              key={itemRole}
              type="button"
              onClick={() => setRole(itemRole)}
              className={`rounded-full border px-3 py-2 font-sans text-xs font-black uppercase tracking-[0.12em] ${
                role === itemRole
                  ? "border-[#4c331b] bg-[#4c331b] text-white"
                  : "border-[#e2b17b] bg-white/70 text-[#ad6b35]"
              }`}
            >
              {itemRole}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#e2b17b] bg-white/70 p-10 text-center font-sans text-sm font-bold leading-6 text-[#ad6b35]">
          No visual companions match that search yet.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="group overflow-hidden rounded-[2rem] border border-[#e2b17b] bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <Image
                src={item.src}
                alt={item.alt}
                width={500}
                height={500}
                className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-[#e2b17b] bg-[#fdf1dc] px-2 py-1 font-sans text-[10px] font-black uppercase tracking-[0.14em] text-[#ad6b35]">
                    {item.role}
                  </span>
                  <Sparkles className="h-4 w-4 text-[#ad6b35]" />
                </div>
                <h2 className="mt-3 truncate font-serif text-xl font-black">{item.title}</h2>
                <p className="mt-2 line-clamp-3 font-sans text-xs leading-5 text-[#8d5a2b]">
                  {item.promptSeed}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
