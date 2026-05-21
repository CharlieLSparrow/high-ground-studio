import Link from "next/link";

import { syntheticEpisodeProjection } from "@/lib/hgo/synthetic-episode-projection";

export const metadata = {
  title: "Synthetic Episode Projection | High Ground Odyssey",
  description:
    "A synthetic-only preview of a visual, Studio-driven High Ground Odyssey episode page.",
};

const statusStyles = {
  "verified-synthetic":
    "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
  "needs-source-synthetic": "border-amber-300/35 bg-amber-300/10 text-amber-100",
  "needs-verification-synthetic":
    "border-sky-300/35 bg-sky-300/10 text-sky-100",
  "do-not-use-synthetic": "border-rose-300/35 bg-rose-300/10 text-rose-100",
} as const;

const statusLabels = {
  "verified-synthetic": "Synthetic verified",
  "needs-source-synthetic": "Needs source",
  "needs-verification-synthetic": "Needs verification",
  "do-not-use-synthetic": "Do not use",
} as const;

function ProjectionSection({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto w-full max-w-[1200px] px-5 py-12 md:px-8 ${className}`}>
      <p className="mb-3 text-xs font-bold uppercase text-flare">{eyebrow}</p>
      <h2 className="max-w-3xl text-3xl font-black leading-[1.05] text-subject md:text-5xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusPill({
  status,
}: {
  status: keyof typeof statusStyles;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export default function SyntheticEpisodeProjectionPage() {
  const projection = syntheticEpisodeProjection;

  return (
    <main className="min-h-screen overflow-hidden bg-void text-subject">
      <section className="relative isolate min-h-[calc(100vh-76px)] overflow-hidden">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_18%,rgba(255,122,24,0.28),transparent_32%),radial-gradient(circle_at_78%_22%,rgba(70,180,170,0.22),transparent_34%),linear-gradient(135deg,#050d10_0%,#10252a_48%,#1d1811_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-[45%] bg-[linear-gradient(180deg,transparent_0%,rgba(5,16,20,0.88)_72%,#051014_100%)]" />
        <div className="absolute left-1/2 top-[16%] -z-10 h-[360px] w-[680px] -translate-x-1/2 rounded-[999px] border border-flare/20 bg-[linear-gradient(90deg,rgba(255,122,24,0.2),rgba(245,239,230,0.07),rgba(82,190,176,0.18))] blur-[1px] md:top-[18%]" />
        <div className="absolute left-[6%] top-[18%] hidden h-[380px] w-[280px] rotate-[-10deg] rounded-[24px] border border-white/10 bg-paper/10 shadow-glass backdrop-blur md:block" />
        <div className="absolute right-[7%] top-[23%] hidden h-[320px] w-[220px] rotate-[8deg] rounded-[24px] border border-white/10 bg-flora-light/25 shadow-glass backdrop-blur lg:block" />
        <div className="absolute inset-x-0 bottom-[18%] -z-10 h-24 bg-[repeating-linear-gradient(90deg,rgba(255,122,24,0.0)_0px,rgba(255,122,24,0.0)_18px,rgba(255,122,24,0.36)_19px,rgba(255,122,24,0.0)_22px)] opacity-50" />

        <div className="mx-auto flex min-h-[calc(100vh-76px)] max-w-[1200px] flex-col justify-end px-5 pb-10 pt-20 md:px-8 md:pb-14">
          <div className="max-w-5xl">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-flare/35 bg-flare/12 px-4 py-2 text-sm font-bold text-flare">
                {projection.eyebrow}
              </span>
              <span className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-subject-muted">
                {projection.episodeNumber}
              </span>
              <span className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-subject-muted">
                Synthetic data only
              </span>
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] text-subject md:text-7xl">
              {projection.title}
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-subject-muted md:text-2xl">
              {projection.subtitle}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-white/12 bg-white/10 p-5 shadow-glass backdrop-blur-[16px] md:p-6">
              <p className="text-sm font-bold uppercase text-flare">Public promise</p>
              <p className="mt-3 text-lg leading-8 text-subject">{projection.thesis}</p>
            </div>
            <div className="rounded-[28px] border border-white/12 bg-void-light/65 p-5 shadow-glass backdrop-blur-[16px] md:p-6">
              <p className="text-sm font-bold uppercase text-flare">Hero visual descriptor</p>
              <p className="mt-3 text-base leading-7 text-subject-muted">
                {projection.heroVisualDescriptor}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[rgba(245,239,230,0.04)]">
        <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-7 md:grid-cols-[0.75fr_1.25fr_auto] md:px-8">
          <div>
            <p className="text-xs font-bold uppercase text-flare">Listen</p>
            <h2 className="mt-2 text-2xl font-black text-subject">{projection.audio.label}</h2>
          </div>
          <div className="flex items-center gap-4 rounded-full border border-white/12 bg-void-light/70 px-4 py-4 shadow-glass">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-flare text-lg font-black text-void">
              ||
            </div>
            <div className="min-w-0 flex-1">
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-1/3 rounded-full bg-flare" />
              </div>
              <p className="mt-2 text-sm text-subject-muted">
                Disabled placeholder for a future approved audio asset.
              </p>
            </div>
          </div>
          <div className="rounded-[18px] border border-white/12 bg-white/8 px-5 py-4 text-sm font-bold text-subject-muted">
            {projection.audio.durationLabel}
          </div>
        </div>
      </section>

      <ProjectionSection eyebrow="Story map" title="Episode beats from Studio structure">
        <p className="mt-5 max-w-3xl text-lg leading-8 text-subject-muted">
          {projection.summary}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {projection.beats.map((beat) => (
            <article
              key={beat.title}
              className="rounded-[24px] border border-white/10 bg-white/7 p-5 shadow-glass backdrop-blur"
            >
              <p className="text-xs font-bold uppercase text-flare">{beat.label}</p>
              <h3 className="mt-3 text-xl font-black leading-tight text-subject">
                {beat.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-subject-muted">{beat.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/12 px-3 py-1 text-subject-muted">
                  {beat.sourceStructure}
                </span>
                <span className="rounded-full border border-white/12 px-3 py-1 text-subject-muted">
                  {beat.timingHint}
                </span>
              </div>
            </article>
          ))}
        </div>
      </ProjectionSection>

      <section className="bg-paper text-[#211912]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 md:grid-cols-[0.85fr_1.15fr] md:px-8">
          <div>
            <p className="mb-3 text-xs font-bold uppercase text-[#9a4514]">Voice projection</p>
            <h2 className="text-3xl font-black leading-[1.05] md:text-5xl">
              Homer, Charlie, and the cleanup still visible enough to fix.
            </h2>
          </div>
          <div className="grid gap-4">
            {projection.voiceCards.map((card) => (
              <article
                key={card.speaker}
                className="rounded-[24px] border border-[#211912]/10 bg-white/55 p-5 shadow-[0_18px_40px_rgba(33,25,18,0.14)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#9a4514]">{card.label}</p>
                    <h3 className="mt-2 text-2xl font-black">{card.speaker}</h3>
                  </div>
                  <span className="rounded-full border border-[#211912]/12 px-3 py-1 text-xs font-bold text-[#5e5144]">
                    {card.wordEstimate.toLocaleString()} words
                  </span>
                </div>
                <p className="mt-4 text-base leading-7 text-[#514337]">{card.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ProjectionSection eyebrow="Pull quotes" title="Memorable lines with citation state attached">
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {projection.pullQuotes.map((quote) => (
            <figure
              key={quote.text}
              className="rounded-[28px] border border-white/10 bg-flora/45 p-6 shadow-glass"
            >
              <blockquote className="text-2xl font-black leading-tight text-subject">
                "{quote.text}"
              </blockquote>
              <figcaption className="mt-5 text-sm font-bold text-subject-muted">
                {quote.attribution}
              </figcaption>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/12 px-3 py-1 text-xs font-bold text-subject-muted">
                  {quote.semanticTag}
                </span>
                <StatusPill status={quote.citationStatus} />
              </div>
            </figure>
          ))}
        </div>
      </ProjectionSection>

      <section className="border-y border-white/8 bg-[rgba(255,255,255,0.035)]">
        <ProjectionSection eyebrow="Sources" title="Citation notes without private editor leakage">
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {projection.citedSources.map((source) => (
              <article
                key={source.title}
                className="rounded-[24px] border border-white/10 bg-void-light/70 p-5 shadow-glass"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={source.status} />
                  <span className="rounded-full border border-white/12 px-3 py-1 text-xs font-bold text-subject-muted">
                    {source.sourceType}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-black text-subject">{source.title}</h3>
                <p className="mt-2 text-sm font-bold text-flare">{source.locator}</p>
                <p className="mt-3 text-sm leading-6 text-subject-muted">{source.note}</p>
              </article>
            ))}
          </div>
        </ProjectionSection>
      </section>

      <ProjectionSection eyebrow="Book relationship" title={projection.relatedBookChapter.title}>
        <div className="mt-7 grid gap-5 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/7 p-6 shadow-glass">
            <p className="text-lg leading-8 text-subject-muted">
              {projection.relatedBookChapter.summary}
            </p>
          </div>
          <div className="rounded-[28px] border border-flare/18 bg-flare/10 p-6 shadow-glass">
            <p className="text-sm font-bold uppercase text-flare">Backstage notes</p>
            <div className="mt-5 space-y-4">
              {projection.backstageNotes.map((note) => (
                <div key={note.label}>
                  <h3 className="font-black text-subject">{note.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-subject-muted">{note.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ProjectionSection>

      <section className="mx-auto grid max-w-[1200px] gap-4 px-5 pb-16 pt-4 md:grid-cols-2 md:px-8">
        <div className="rounded-[28px] border border-white/10 bg-white/7 p-6 shadow-glass">
          <p className="text-sm font-bold uppercase text-flare">
            {projection.navigation.previous.label}
          </p>
          <h2 className="mt-3 text-2xl font-black text-subject">
            {projection.navigation.previous.title}
          </h2>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-white/7 p-6 shadow-glass md:text-right">
          <p className="text-sm font-bold uppercase text-flare">
            {projection.navigation.next.label}
          </p>
          <h2 className="mt-3 text-2xl font-black text-subject">
            {projection.navigation.next.title}
          </h2>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-5 pb-12 md:px-8">
        <Link
          href="/"
          className="inline-flex rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold text-subject no-underline hover:border-flare/40 hover:text-flare"
        >
          Return to High Ground Odyssey
        </Link>
      </div>
    </main>
  );
}
