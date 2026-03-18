import Link from "next/link";
import DocsVideoEmbed from "./DocsVideoEmbed";

export default function EpisodePageShell({
  title,
  description,
  youtubeId,
  children,
}: {
  title: string;
  description?: string;
  youtubeId: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]">
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline hover:text-[var(--accent)]"
          >
            ← Back to High Ground Odyssey
          </Link>
        </div>

        <header className="mb-8 max-w-[820px] text-[var(--text-light)]">
          <div className="mb-4 inline-block rounded-full border border-white/12 bg-white/10 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em]">
            Episode
          </div>

          <h1 className="m-0 text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
            {title}
          </h1>

          {description ? (
            <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
              {description}
            </p>
          ) : null}
        </header>

        <section className="mb-10 overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(10,21,24,0.34)] shadow-[0_28px_60px_rgba(0,0,0,0.22)] backdrop-blur-[10px]">
          <DocsVideoEmbed youtubeId={youtubeId} title={title} />
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,820px)_minmax(240px,1fr)]">
          <article className="rounded-[28px] border border-[rgba(32,32,32,0.06)] bg-[var(--paper-strong)] px-[30px] py-10 text-[var(--text-dark)] shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
            <div className="prose-hgo">{children}</div>
          </article>

          <aside className="h-fit rounded-[24px] border border-white/10 bg-[rgba(10,21,24,0.34)] p-6 text-[var(--text-light)] shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-[10px]">
            <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
              Episode Notes
            </div>

            <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
              This page pairs the episode video with its companion article so the
              story, reflection, and source material live together.
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}