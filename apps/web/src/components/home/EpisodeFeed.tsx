import { prisma } from "@/lib/prisma";
import EpisodeCard from "@/components/home/EpisodeCard";

export default async function EpisodeFeed() {
  const publishedEpisodes = await prisma.hgoEpisodePublishCandidate.findMany({
    where: { candidateStatus: "published" },
    orderBy: { createdAt: "desc" },
    take: 6
  });
  
  const feed = publishedEpisodes;

  return (
    <section className="mx-auto max-w-[1200px] px-6 pb-[90px] pt-12 relative z-10">
      <div className="mb-8">
        <div className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-flare">
          Episode Library
        </div>
        <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-subject">
          Start with the published episodes
        </h2>
        <p className="mb-0 mt-3 max-w-[720px] text-[1rem] leading-7 text-[rgba(245,239,230,0.92)]">
          Each episode opens a story, a lesson, and a companion reading path
          through the larger High Ground Odyssey project.
        </p>
      </div>

      {feed.length === 0 ? (
        <div className="p-12 text-center border border-white/10 rounded-2xl bg-white/5 backdrop-blur-sm">
          <p className="text-neutral-400">No published episodes found in the database. Awaiting Studio publishing pipeline...</p>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {feed.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </section>
  );
}
