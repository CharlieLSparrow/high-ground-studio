import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, Feather, Library, Mic2, Palette, Search, Sparkles } from "lucide-react";

const roles = [
  {
    title: "Research Quipslys",
    Icon: Search,
    image: "/images/quipsly-generated/scholarly_quipsly_verifying_sources.png",
    copy: "They fetch sources, compare evidence, build packets, track citations, and keep the provenance trail close to the work.",
  },
  {
    title: "Writing Quipslys",
    Icon: Feather,
    image: "/images/quipsly-generated/curious_quipsly_writing_wisdom_notes.png",
    copy: "They outline, summarize, draft, rewrite, annotate, and suggest structure. They can write with you, but they do not hide what changed.",
  },
  {
    title: "Producer Quipslys",
    Icon: Mic2,
    image: "/images/quipsly-generated/adorable_quipsly_podcast_planning.png",
    copy: "They wrangle episodes, clips, transcripts, show notes, media packets, platform copy, and review tasks.",
  },
  {
    title: "Teaching Quipslys",
    Icon: BookOpen,
    image: "/images/quipsly-generated/quipsly_teaching_nature_exploration.png",
    copy: "They turn hard-won knowledge into lessons, exercises, quizzes, flashcards, coaching prompts, and course outlines.",
  },
  {
    title: "Art Foundry Quipslys",
    Icon: Palette,
    image: "/images/quipsly-generated/cute_quipsly_inventor_drawing_machine.png",
    copy: "They help make images, cards, storyboards, visual systems, and brand assets without scattering prompts and source files everywhere.",
  },
  {
    title: "Tower Quipslys",
    Icon: Library,
    image: "/images/quipsly-generated/quipsly_photographer_navigator_adventure.png",
    copy: "They prepare publishing queues, metadata, receipts, analytics views, social packets, and platform checklists.",
  },
];

export default function QuipslysPage() {
  return (
    <main className="min-h-screen bg-[#f8efe0] px-5 py-8 text-[#342315] md:px-8">
      <section className="mx-auto max-w-7xl">
        <nav className="mb-8 flex items-center justify-between font-sans">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#6d4b22]">
            <ArrowLeft className="h-4 w-4" />
            Back to Quipsly
          </Link>
          <Link href="https://nest.quipsly.com/art-foundry" className="hidden rounded-full border border-[#d8b98e] bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#6d4b22] shadow-sm md:inline-flex">
            Operator Art Foundry
          </Link>
        </nav>

        <header className="overflow-hidden rounded-[3rem] border border-[#dbc295] bg-[#fffaf1] shadow-sm">
          <div className="grid gap-10 p-7 md:p-12 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d8b98e] bg-white/80 px-4 py-2 font-sans text-xs font-black uppercase tracking-[0.18em] text-[#6d4b22]">
                <Sparkles className="h-4 w-4 text-[#315d4f]" />
                Meet the Quipslys
              </div>
              <h1 className="mt-6 max-w-4xl font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                Helpful little minds for the margins.
              </h1>
              <p className="mt-6 max-w-3xl font-sans text-lg leading-8 text-[#745b3c]">
                Quipslys are enthusiastic research assistants, librarians, producers, curators, writing partners, and tiny keepers of context. They collect, organize, compare, retrieve, cite, draft, prepare, and package so creative people can see the work clearly and decide what comes next.
              </p>
              <p className="mt-4 max-w-3xl font-sans text-base leading-7 text-[#745b3c]">
                They are allowed to help write. The Quipsly promise is not silence or scolding. The promise is that sources, drafts, edits, and approvals stay visible.
              </p>
              <div className="mt-8 flex flex-col gap-3 font-sans sm:flex-row">
                <Link href="https://patreon.com/HighGroundOdyssey" className="inline-flex items-center justify-center rounded-2xl bg-[#315d4f] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#fff8ec] shadow-sm">
                  Support beta access
                </Link>
                <Link href="https://nest.quipsly.com/projects" className="inline-flex items-center justify-center rounded-2xl border border-[#b99052] bg-transparent px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#6d4b22]">
                  Visit the Nest
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 rotate-3 rounded-[2.5rem] bg-[#315d4f]/18 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2.5rem] border border-[#dbc295] bg-white p-3 shadow-xl">
                <Image src="/images/quipsly-generated/curious_quipsly_holding_magnifier.png" alt="A curious Quipsly holding a magnifier" width={720} height={720} priority className="aspect-square w-full rounded-[2rem] object-cover" />
              </div>
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <article key={role.title} className="overflow-hidden rounded-[2rem] border border-[#dbc295] bg-[#fffaf1] shadow-sm">
              <Image src={role.image} alt={role.title} width={720} height={720} className="aspect-[4/3] w-full object-cover" />
              <div className="p-6">
                <div className="mb-4 inline-flex rounded-2xl bg-[#315d4f] p-3 text-[#fff8ec]"><role.Icon className="h-5 w-5" /></div>
                <h2 className="font-serif text-3xl font-black">{role.title}</h2>
                <p className="mt-3 font-sans text-sm leading-7 text-[#745b3c]">{role.copy}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
