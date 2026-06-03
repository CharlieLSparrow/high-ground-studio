import Link from "next/link";
import { getPrismaClient } from "@/lib/prisma";
import { createNotebook } from "./actions";

export const dynamic = "force-dynamic";

async function loadNotebooks() {
  const prisma = getPrismaClient();
  const workspace = await prisma.studioWorkspace.findUnique({
    where: { slug: "tonight-pack" },
    include: {
      projects: {
        include: {
          documents: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  return workspace?.projects ?? [];
}

export default async function NotebooksPage() {
  const notebooks = await loadNotebooks();

  return (
    <main className="min-h-screen bg-[#fdfaf6] px-6 py-10 text-[#3d3122]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
              Quipsly Live / Notebooks
            </div>
            <h1 className="mt-2 font-serif text-4xl font-bold">Start with a normal document. Add lenses later.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b5b45]">
              Use Quipsly for a book, episode, article, talk, class notes, or research packet. The core remains one readable manuscript with tags layered on selected passages.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
          >
            Tonight Pack
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <form action={createNotebook} className="rounded-2xl border border-[#e8dcc4] bg-white p-6 shadow-sm">
            <h2 className="font-serif text-2xl font-bold">New notebook</h2>
            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.16em] text-[#8a7659]">
              Title
            </label>
            <input
              name="title"
              placeholder="Article, book, talk, study notes..."
              className="mt-2 w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf9] px-4 py-3 text-sm outline-none focus:border-[#a36f2e]"
              required
            />
            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.16em] text-[#8a7659]">
              Kind
            </label>
            <select
              name="kind"
              className="mt-2 w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf9] px-4 py-3 text-sm outline-none focus:border-[#a36f2e]"
              defaultValue="Book"
            >
              <option>Book</option>
              <option>Podcast episode</option>
              <option>Article</option>
              <option>Talk</option>
              <option>Study notes</option>
              <option>Research packet</option>
            </select>
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-[#3d3122] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-sm transition-colors hover:bg-[#59442d]"
            >
              Create and open
            </button>
          </form>

          <section className="rounded-2xl border border-[#e8dcc4] bg-white p-6 shadow-sm">
            <h2 className="font-serif text-2xl font-bold">Open notebook</h2>
            <div className="mt-4 grid gap-3">
              {notebooks.map((project) => {
                const document = project.documents[0];
                return (
                  <Link
                    key={project.id}
                    href={`/?project=${encodeURIComponent(project.slug)}`}
                    className="rounded-xl border border-[#eadfca] bg-[#fffdf9] p-4 transition hover:border-[#d5b77d] hover:bg-[#f8f3e6]"
                  >
                    <div className="font-serif text-xl font-bold">{project.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8a7659]">
                      {document?.title ?? "Untitled document"}
                    </div>
                  </Link>
                );
              })}
              {notebooks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d9c7a5] bg-[#fffdf9] p-4 text-sm text-[#6b5b45]">
                  No notebooks yet. Create one on the left, or open the Tonight Pack.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
