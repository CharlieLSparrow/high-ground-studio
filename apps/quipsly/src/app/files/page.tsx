import Link from "next/link";

const cards = [
  {
    title: "Ingest recordings",
    description: "Bring in source media, transcripts, and captures before turning them into scenes, clips, or manuscript material.",
    href: "/ingest",
  },
  {
    title: "Asset manager",
    description: "Browse the working media library for the project and keep video assets next to the manuscript.",
    href: "/asset-manager",
  },
  {
    title: "Media pipeline",
    description: "Track the production handoff from raw files to edited material.",
    href: "/media-pipeline",
  },
  {
    title: "Video editor",
    description: "Cut the episode while the book editor stays the source of truth for story, quotes, and tags.",
    href: "/editor",
  },
];

export default function FilesPage() {
  return (
    <main className="min-h-screen bg-[#fdfaf6] px-6 py-10 text-[#3d3122]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
              Quipsly Live / Files
            </div>
            <h1 className="mt-2 font-serif text-4xl font-bold">Media files live beside the manuscript.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b5b45]">
              The file workflow should feel normal: source files come in, the manuscript remains editable, and tags connect words to clips, quotes, episodes, talks, articles, and study material.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
          >
            Back to Manuscript
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-[#e8dcc4] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d5b77d] hover:shadow-md"
            >
              <h2 className="font-serif text-2xl font-bold">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b5b45]">{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
