import EpisodeCard from "@/components/home/EpisodeCard";

const episodes = [
  {
    title: "Preface Pilot Episode",
    href: "/docs/episode-001",
    youtubeId: "96LN__TA-T8",
    description:
      "The opening preface to Learning to Lead — why this story exists, and why it matters.",
  },
  {
    title: "It’s a Metaphor!",
    href: "/docs/episode-002",
    youtubeId: "7Rn4rV2cLy4",
    description:
      "Finding life lessons in ordinary things, and learning to make good meaning.",
  },
  {
    title: "In the Beginning",
    href: "/docs/episode-003",
    youtubeId: "rf3L1xki_Nk",
    description:
      "Family history, legacy, and the power of knowing where you came from.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)] text-[var(--text-light)]">
      <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-10">
        <div className="max-w-[780px]">
          <div className="mb-[18px] inline-block rounded-full border border-white/12 bg-white/10 px-[14px] py-[8px] text-[12px] uppercase tracking-[0.08em]">
            High Ground Odyssey
          </div>

          <h1 className="m-0 text-[clamp(3rem,7vw,6rem)] leading-[0.92] tracking-[-0.06em] text-[var(--text-light)]">
            Stories worth
            <br />
            climbing for.
          </h1>

          <p className="mb-0 mt-5 max-w-[700px] text-[clamp(1.04rem,2vw,1.18rem)] leading-8 text-[rgba(245,239,230,0.92)]">
            High Ground Odyssey is a podcast and storytelling project about
            leadership, legacy, family, and the lessons hidden inside ordinary
            life. Start with the opening episodes below.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-9">
        <EpisodeCard episode={episodes[0]} featured />
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
        <div className="mb-[22px]">
          <div className="mb-[10px] text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--accent-soft)]">
            Episode Feed
          </div>

          <h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] leading-[0.98] tracking-[-0.05em] text-[var(--text-light)]">
            Start with the opening run
          </h2>
        </div>

        <div className="grid gap-6">
          {episodes.slice(1).map((episode) => (
            <EpisodeCard key={episode.href} episode={episode} />
          ))}
        </div>
      </section>
    </main>
  );
}