import Link from "next/link";

const uses = [
  "Tag a passage as a quote without copying it out of the document.",
  "Filter a long manuscript down to one episode, chapter, talk, or article.",
  "Mark study notes, questions, sources, and follow-up ideas in the same writing flow.",
  "Turn one body of work into many outputs without losing the original context.",
];

export default function StudyPage() {
  return (
    <main className="min-h-screen bg-[#fdfaf6] px-6 py-10 text-[#3d3122]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 rounded-3xl border border-[#e8dcc4] bg-white p-8 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
            Quipsly Live / Study Notes
          </div>
          <h1 className="mt-3 font-serif text-4xl font-bold">The same editor works for writing and studying.</h1>
          <p className="mt-4 text-base leading-7 text-[#6b5b45]">
            Quipsly is useful beyond High Ground Odyssey because tags are lenses, not folders. A book, article, class note, sermon, podcast, or research packet can stay as one readable document while views focus it down to what you need right now.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
            >
              Open Manuscript
            </Link>
            <Link
              href="/files"
              className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-bold text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
            >
              Media Files
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8dcc4] bg-white p-6 shadow-sm">
          <h2 className="font-serif text-2xl font-bold">Why Homer should care</h2>
          <ul className="mt-4 space-y-3">
            {uses.map((use) => (
              <li key={use} className="rounded-xl bg-[#f8f3e6] px-4 py-3 text-sm leading-6 text-[#5d4a32]">
                {use}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
