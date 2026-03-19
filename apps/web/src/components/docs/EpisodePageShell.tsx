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
    <main className="min-h-screen bg-[linear-gradient(180deg,#0b2025_0%,#133238_16%,#22443f_38%,#6f5636_72%,#f3eadb_100%)]">
      <div className="mx-auto max-w-[1280px] px-6 pb-24 pt-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline transition hover:text-[var(--accent)]"
          >
            <span aria-hidden="true">←</span>
            <span>Back to High Ground Odyssey</span>
          </Link>
        </div>

        <section className="mb-10 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-end">
          <div className="text-[var(--text-light)]">
            <div className="mb-4 inline-block rounded-full border border-white/12 bg-white/10 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em]">
              Episode Companion
            </div>

            <h1 className="m-0 max-w-[900px] text-[clamp(2.8rem,6vw,5.5rem)] leading-[0.92] tracking-[-0.055em] text-[var(--text-light)]">
              {title}
            </h1>

            {description ? (
              <p className="mb-0 mt-5 max-w-[760px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.9)]">
                {description}
              </p>
            ) : null}
          </div>

          <aside className="h-fit rounded-[26px] border border-white/10 bg-[rgba(10,21,24,0.34)] p-6 text-[var(--text-light)] shadow-[0_20px_48px_rgba(0,0,0,0.20)] backdrop-blur-[10px]">
            <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
              Why this page exists
            </div>

            <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Every episode gets to live in more than one form here: video,
              written reflection, companion reading, and the ideas underneath
              the story.
            </p>
          </aside>
        </section>

        <section className="mb-12 overflow-hidden rounded-[32px] border border-white/10 bg-[rgba(10,21,24,0.38)] shadow-[0_30px_70px_rgba(0,0,0,0.24)] backdrop-blur-[10px]">
          <DocsVideoEmbed youtubeId={youtubeId} title={title} />
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,860px)_minmax(260px,1fr)]">
          <article className="min-w-0 rounded-[30px] border border-[rgba(32,32,32,0.06)] bg-[var(--paper-strong)] px-7 py-10 text-[var(--text-dark)] shadow-[0_24px_70px_rgba(0,0,0,0.16)] sm:px-10">
            <div className="mb-8 border-b border-[rgba(0,0,0,0.08)] pb-6">
              <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[rgba(125,91,52,0.85)]">
                Companion Article
              </div>

              <p className="m-0 max-w-[720px] text-[1rem] leading-7 text-[rgba(35,35,35,0.78)]">
                Read alongside the episode for additional context, reflection,
                and featured excerpts.
              </p>
            </div>

            <div className="prose-hgo">{children}</div>
          </article>

          <div className="space-y-6">
            <aside className="h-fit rounded-[24px] border border-white/10 bg-[rgba(10,21,24,0.34)] p-6 text-[var(--text-light)] shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-[10px] lg:sticky lg:top-6">
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                On this page
              </div>

              <ul className="m-0 list-disc space-y-3 pl-5 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                <li>Watch the full episode</li>
                <li>Read the companion writing</li>
                <li>Follow the leadership thread underneath the story</li>
              </ul>
            </aside>

            <aside className="rounded-[24px] border border-white/10 bg-[rgba(10,21,24,0.30)] p-6 text-[var(--text-light)] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[10px]">
              <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
                High Ground Odyssey
              </div>

              <p className="m-0 text-[0.98rem] leading-7 text-[rgba(245,239,230,0.88)]">
                Stories about leadership, legacy, risk, family, and becoming the
                kind of person who can carry something worthwhile uphill.
              </p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}