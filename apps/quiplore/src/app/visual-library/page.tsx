import Link from "next/link";
import { Feather, Sparkles } from "lucide-react";
import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { VisualLibraryGrid } from "./VisualLibraryGrid";

export default function QuipLoreVisualLibraryPage() {
  return (
    <main className="min-h-screen bg-[#fdf1dc] px-6 py-10 text-[#4c331b]">
      <section className="mx-auto max-w-7xl">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 font-serif text-2xl font-black">
            <Feather className="h-6 w-6 text-[#ad6b35]" />
            QuipLore
          </Link>
          <Link
            href="/hub"
            className="rounded-full border border-[#e2b17b] bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#ad6b35]"
          >
            Explore Hub
          </Link>
        </nav>

        <header className="overflow-hidden rounded-[2.5rem] border border-[#e2b17b] bg-white/85 p-8 shadow-sm md:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e2b17b] bg-[#f8d9b0]/70 px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#ad6b35]">
            <Sparkles className="h-3.5 w-3.5" />
            Quipsly visual companions
          </div>
          <h1 className="mt-5 max-w-4xl font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            Little librarians for big ideas.
          </h1>
          <p className="mt-5 max-w-3xl font-sans text-lg leading-8 text-[#ad6b35]">
            QuipLore uses Quipsly companions to make quote discovery feel curated, cited, and alive. These approved and candidate images are the beginning of a public visual language for quote cards, lorelists, source passports, and social feeds.
          </p>
        </header>

        <VisualLibraryGrid items={generatedQuipslyArt} />
      </section>
    </main>
  );
}
