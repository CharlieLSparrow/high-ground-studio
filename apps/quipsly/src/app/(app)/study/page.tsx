import Link from "next/link";

const studyFlows = [
  {
    title: "Imported book or article",
    body: "Keep the original source text intact, then highlight, tag, summarize, question, and add your own notes on top.",
  },
  {
    title: "Course-page capture",
    body: "Future Chrome capture can append each visited Udacity, Google Cloud, school, or docs page into the active Study Nest as you work through a course.",
  },
  {
    title: "Fiction and nonfiction analysis",
    body: "Use the same tagging spine to mark characters, themes, claims, quotes, scenes, arguments, and examples without turning the source into a spreadsheet.",
  },
  {
    title: "Research assistant sidebar",
    body: "Quipslys should retrieve, compare, organize, cite, and prepare packets. They should not silently rewrite the human's notes or manuscript.",
  },
];

const comparisonRows = [
  ["Writing document", "Original content", "Books, talks, scripts, episode manuscripts, articles"],
  ["Study document", "Source-first markup", "Imported books, school pages, research articles, course notes"],
  ["Production document", "Show and media coordination", "Recording notes, clip cues, transcripts, publishing packets"],
];

export default function StudyPage() {
  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-8 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-3xl border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
            Study Documents
          </div>
          <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
            Read, capture, mark up, and learn without losing the source.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#6b5b45]">
            A Study Nest is not a dumping ground. It is a living source document where Quipsly can keep the original text, your highlights, your notes, your tags, and your assistant research in one place.
            The same one-document model still applies; the intent changes from authoring to studying.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/projects"
              className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition-colors hover:bg-[#59442d]"
            >
              Create a Study Nest
            </Link>
            <Link
              href="/create"
              className="rounded-full border border-[#d9c7a5] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#5e4b33] shadow-sm transition-colors hover:bg-[#f8f3e6]"
            >
              Open writing document
            </Link>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {studyFlows.map((flow) => (
            <div key={flow.title} className="rounded-2xl border border-[#eadfca] bg-white p-5 shadow-sm">
              <h2 className="font-serif text-2xl font-black">{flow.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#6b5b45]">{flow.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-[#e8dcc4] bg-white p-6 shadow-sm md:p-8">
          <h2 className="font-serif text-3xl font-black">Document shapes</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#eadfca]">
            {comparisonRows.map(([label, purpose, examples], index) => (
              <div
                key={label}
                className={`grid gap-2 px-4 py-4 text-sm md:grid-cols-[190px_190px_1fr] ${index === 0 ? "" : "border-t border-[#eadfca]"} bg-[#fffdf9]`}
              >
                <div className="font-black text-[#342618]">{label}</div>
                <div className="font-bold text-[#9a5f13]">{purpose}</div>
                <div className="leading-6 text-[#6b5b45]">{examples}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
