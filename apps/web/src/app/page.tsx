import EpisodeFeed from "@/components/home/EpisodeFeed";
import { EpisodeEssay } from "@/components/hgo/public/EpisodeEssay";
import { EpisodeQuotes } from "@/components/hgo/public/EpisodeQuotes";
import { EpisodeShowNotes } from "@/components/hgo/public/EpisodeShowNotes";
import { EpisodeSupportCta } from "@/components/hgo/public/EpisodeSupportCta";
import { EpisodeVideoEmbed } from "@/components/hgo/public/EpisodeVideoEmbed";
import { EpisodeAudioPlayer } from "@/components/hgo/public/EpisodeAudioPlayer";
import { listHgoPublicEpisodePackets } from "@/lib/hgo/public-episode-store";

export default async function HomePage() {
  const episodes = await listHgoPublicEpisodePackets();
  const latestEpisode = episodes.at(-1);

  return (
    <main className="min-h-screen text-[var(--text-light)] bg-void">
      {latestEpisode ? (
        <>
          <EpisodeVideoEmbed packet={latestEpisode} />
          <EpisodeAudioPlayer packet={latestEpisode} />
          <EpisodeSupportCta packet={latestEpisode} compact />
          <div className="w-full bg-zinc-950">
            <EpisodeShowNotes packet={latestEpisode} />
          </div>
          <div className="w-full bg-zinc-950">
            <EpisodeQuotes packet={latestEpisode} />
          </div>
          <div className="mt-12 w-full border-t border-zinc-900 bg-zinc-950">
            <EpisodeEssay packet={latestEpisode} />
          </div>
        </>
      ) : (
        <section className="mx-auto max-w-5xl px-6 py-28 text-center">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
            High Ground Odyssey
          </div>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-white">
            Episodes are being prepared.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            The public episode packet feed is empty. Check back after the next Quipsly publish.
          </p>
          <EpisodeSupportCta compact />
        </section>
      )}
      <EpisodeFeed />
    </main>
  );
}
