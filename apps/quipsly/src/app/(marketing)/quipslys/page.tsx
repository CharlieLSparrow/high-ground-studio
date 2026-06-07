import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Feather, Library, Sparkles, Wand2 } from "lucide-react";
import {
  generatedQuipslyArt,
  getGeneratedQuipslyArtByRole,
} from "@high-ground/quipsly-domain/generated-art";

const roleNotes = [
  {
    role: "hero",
    title: "Librarians",
    body: "They help you find the right example, remember where it came from, and keep your sources from wandering off into the shrubbery.",
  },
  {
    role: "writing",
    title: "Scribes",
    body: "They organize manuscript structure, headings, notes, and drafts while keeping the actual authorship in your hands.",
  },
  {
    role: "quote",
    title: "Curators",
    body: "They turn quote chaos into quote cards, attribution trails, collections, and shareable wisdom feeds.",
  },
  {
    role: "podcast",
    title: "Producers",
    body: "They keep show notes, clip cues, media assets, and publishing packets close to the episode you are actually making.",
  },
];

export default function QuipslysPage() {
  const hero = generatedQuipslyArt[0]!;
  const writing = getGeneratedQuipslyArtByRole("writing").slice(0, 2);
  const quote = getGeneratedQuipslyArtByRole("quote").slice(0, 1);
  const podcast = getGeneratedQuipslyArtByRole("podcast").slice(0, 1);
  const gallery = [...writing, ...quote, ...podcast, ...getGeneratedQuipslyArtByRole("generator").slice(0, 8)];

  return (
    <main className="min-h-screen bg-[#f6efe6] px-6 py-8 text-[#3d2618]">
      <section className="mx-auto max-w-7xl">
        <nav className="mb-8 flex items-center justify-between font-sans">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#a96735]">
            <ArrowLeft className="h-4 w-4" />
            Back to Quipsly
          </Link>
          <Link
            href="https://nest.quipsly.com/art-foundry"
            className="hidden rounded-full border border-[#d8b98e] bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#a96735] shadow-sm md:inline-flex"
          >
            Operator Art Foundry
          </Link>
        </nav>

        <header className="overflow-hidden rounded-[2.5rem] border border-[#e8d0b5] bg-white shadow-sm">
          <div className="grid gap-10 p-7 md:grid-cols-[1fr_420px] md:p-12">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e8d0b5] bg-[#fff8ec] px-4 py-1.5 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                <Feather className="h-3.5 w-3.5" />
                Meet the Quipslys
              </div>
              <h1 className="mt-6 max-w-4xl font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                Helpful little minds for the margins.
              </h1>
              <p className="mt-6 max-w-3xl font-sans text-lg leading-8 text-[#8c552e]">
                Quipslys are not replacement writers. They are enthusiastic research assistants, librarians, producers, curators, and tiny keepers of context. Their job is to collect, organize, compare, retrieve, cite, and prepare so humans can do the meaning-making.
              </p>
              <div className="mt-8 flex flex-col gap-3 font-sans sm:flex-row">
                <Link
                  href="https://patreon.com/HighGroundOdyssey"
                  className="inline-flex items-center justify-center rounded-xl bg-[#a96735] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#fdf5eb] shadow-sm"
                >
                  Support beta access
                </Link>
                <Link
                  href="https://nest.quipsly.com"
                  className="inline-flex items-center justify-center rounded-xl border border-[#a96735] bg-transparent px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#a96735]"
                >
                  Visit the Nest
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 rotate-3 rounded-[2rem] bg-[#f4dab0]/60 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-[#e8d0b5] bg-[#fffaf1] p-3 shadow-xl">
                <Image
                  src={hero.src}
                  alt={hero.alt}
                  width={720}
                  height={720}
                  priority
                  className="aspect-square w-full rounded-[1.5rem] object-cover"
                />
              </div>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {roleNotes.map((note) => (
            <article key={note.role} className="rounded-[1.5rem] border border-[#e8d0b5] bg-white/85 p-5 shadow-sm">
              <div className="mb-4 inline-flex rounded-full bg-[#fff8ec] p-3 text-[#a96735]">
                {note.role === "podcast" ? <Sparkles className="h-5 w-5" /> : note.role === "quote" ? <Library className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
              </div>
              <h2 className="font-serif text-2xl font-black">{note.title}</h2>
              <p className="mt-3 font-sans text-sm leading-6 text-[#8c552e]">{note.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-[2rem] border border-[#e8d0b5] bg-[#fffaf1] p-5 shadow-sm md:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-sans text-xs font-black uppercase tracking-[0.18em] text-[#a96735]">
                Visual field guide
              </div>
              <h2 className="mt-2 font-serif text-4xl font-black">A growing Marginalia of helpers</h2>
            </div>
            <p className="max-w-xl font-sans text-sm leading-6 text-[#8c552e]">
              These are early approved and candidate images. The private Art Foundry turns useful ideas into reusable prompts and manifest entries.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gallery.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[1.5rem] border border-[#e8d0b5] bg-white shadow-sm">
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={420}
                  height={420}
                  className="aspect-square w-full object-cover"
                />
                <div className="p-4">
                  <div className="font-sans text-[10px] font-black uppercase tracking-[0.16em] text-[#a96735]">{item.role}</div>
                  <h3 className="mt-1 truncate font-serif text-xl font-black">{item.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
