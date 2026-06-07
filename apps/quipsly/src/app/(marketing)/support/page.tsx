const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL || "https://www.patreon.com/c/HighGroundOdyssey";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#fdf6ea] px-6 py-12 text-[#3d3122]">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border border-[#ead9bc] bg-white shadow-[0_30px_100px_rgba(74,45,18,0.12)]">
        <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b36b24]">
              Support Quipsly beta
            </p>
            <h1 className="mt-4 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
              Help build the world&apos;s most enthusiastic research librarian.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#6b5b45]">
              Quipsly is being built for writers, authors, researchers, teachers, creators, and gloriously overcommitted humans who need their work to stay connected from source to story to publishable output.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={patreonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex justify-center rounded-full bg-[#ff424d] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_18px_50px_rgba(255,66,77,0.28)] transition hover:-translate-y-0.5 hover:bg-[#ff5962]"
              >
                Join on Patreon
              </a>
              <a
                href="https://nest.quipsly.com/projects"
                className="inline-flex justify-center rounded-full border border-[#d8bd8e] bg-[#fffaf2] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#6b451b] transition hover:-translate-y-0.5 hover:bg-[#fff3d8]"
              >
                Open the Nest
              </a>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[#ead9bc] bg-[#fff9ef] p-6">
            <h2 className="font-serif text-2xl font-black">How beta access works</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-[#6b5b45]">
              <p>
                Any active paid Patreon tier is intended to qualify for early beta access while we harden Quipsly.
              </p>
              <p>
                Patreon is evidence, not the app brain: Quipsly ingests provider events, reconciles them into app-owned membership records, and uses those records for access.
              </p>
              <p>
                That means we can support Patreon now without trapping the product in one billing provider forever.
              </p>
            </div>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-950">
              Beta promise: Quipslys collect, organize, compare, retrieve, cite, and prepare. Humans author and approve.
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
