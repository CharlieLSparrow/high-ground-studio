import Image from "next/image";
import {
  Feather,
  ImageIcon,
  TerminalSquare,
  Wand2,
} from "lucide-react";
import { generatedQuipslyArt } from "@high-ground/quipsly-domain/generated-art";
import { ArtBriefBuilder } from "./ArtBriefBuilder";
import { ArtLibraryGrid } from "./ArtLibraryGrid";

export default function ArtFoundryPage() {
  const featured = generatedQuipslyArt.slice(0, 5);
  const studies = generatedQuipslyArt.slice(5);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <section className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white shadow-sm">
          <div className="grid gap-8 p-6 md:grid-cols-[1fr_420px] md:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <Wand2 size={14} />
                Quipsly Art Foundry
              </div>
              <h1 className="mt-5 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
                Generate the right little helper for the job.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-[#6b5b45] md:text-lg">
                This is the operator-side library for Quipsly character art. Use prompt briefs for ComfyUI or another generator, ingest approved images into both Quipsly and QuipLore, then give each keeper a semantic manifest entry.
              </p>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                    <TerminalSquare size={14} />
                    Create brief
                  </div>
                  <code className="mt-3 block rounded-xl bg-[#2f2318] p-3 text-xs leading-5 text-[#fdf5eb]">
                    pnpm quipsly:art:brief -- --role librarian --subject &quot;finding examples in a writer&apos;s source library&quot;
                  </code>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                    <TerminalSquare size={14} />
                    Ingest Downloads
                  </div>
                  <code className="mt-3 block rounded-xl bg-[#2f2318] p-3 text-xs leading-5 text-[#fdf5eb]">
                    pnpm quipsly:art:ingest -- --count 12 --hint &quot;ChatGPT Image&quot;
                  </code>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {featured.map((item, index) => (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-[1.5rem] border border-[#eadfca] bg-[#fffaf3] p-2 shadow-sm ${
                    index === 0 ? "col-span-2" : ""
                  }`}
                >
                  <Image
                    src={item.src}
                    alt={item.alt}
                    width={500}
                    height={500}
                    className="aspect-square w-full rounded-[1.1rem] object-cover"
                    priority={index === 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </header>

        <ArtBriefBuilder />

        <section className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
              <Feather size={14} />
              Rules of the aviary
            </div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-[#6b5b45]">
              <p>
                Every keeper needs a role, prompt seed, alt text, and intended surface.
              </p>
              <p>
                Useful art graduates from Downloads into the shared manifest. Random art stays in the sandbox.
              </p>
              <p>
                Quipsly and QuipLore currently duplicate public images because each Next app serves its own public directory.
              </p>
            </div>
          </aside>

          <div className="rounded-[2rem] border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8c6b4a]">
                  <ImageIcon size={14} />
                  Current generated library
                </div>
                <h2 className="mt-2 font-serif text-3xl font-black">Approved and candidate Quipslys</h2>
              </div>
              <span className="rounded-full border border-[#e8dcc4] bg-[#fff8ec] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                {generatedQuipslyArt.length} images
              </span>
            </div>
            <ArtLibraryGrid items={studies} />
          </div>
        </section>
      </section>
    </main>
  );
}
