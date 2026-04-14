import type { Episode } from "@/lib/site";
import GlassPanel from "@/components/ui/GlassPanel";
import VideoFrame from "@/components/ui/VideoFrame";

export default function EpisodeCard({
  episode,
  featured = false,
}: {
  episode: Episode;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <GlassPanel
        glow
        className="overflow-hidden transition-transform hover:-translate-y-1 hover:border-flare/40"
      >
        <VideoFrame youtubeId={episode.youtubeId} title={episode.title} />

        <div className="px-6 py-7">
          <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-flare">
            Featured Episode
          </div>

          <h2 className="mb-3 text-[clamp(2rem,4vw,3rem)] leading-none tracking-[-0.05em] text-subject">
            {episode.title}
          </h2>

          <p className="mb-5 max-w-[760px] text-[1.04rem] leading-8 text-subject-muted">
            {episode.description}
          </p>

          <a
            href={episode.href}
            className="text-[15px] font-extrabold text-subject no-underline transition-colors hover:text-flare"
          >
            Read companion article →
          </a>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="grid overflow-hidden transition-transform hover:-translate-y-1 hover:border-flare/30 md:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="relative flex flex-col justify-center px-7 py-8">
        {/* The Action Line: Driven by our punchy Flare tokens */}
        <div className="absolute bottom-6 left-0 top-6 w-1 rounded-full bg-gradient-to-b from-flare to-flare-glow" />

        <div className="mb-2 pl-4 text-[12px] font-extrabold uppercase tracking-[0.08em] text-flare-glow">
          Episode
        </div>

        <h3 className="mb-3 pl-4 text-[clamp(1.8rem,3vw,2.5rem)] leading-none tracking-[-0.05em] text-subject">
          {episode.title}
        </h3>

        <p className="mb-5 max-w-[620px] pl-4 text-[1.02rem] leading-8 text-subject-muted">
          {episode.description}
        </p>

        <div className="pl-4">
          <a
            href={episode.href}
            className="text-[15px] font-extrabold text-subject no-underline transition-colors hover:text-flare"
          >
            Read companion article →
          </a>
        </div>
      </div>

      <div className="relative min-h-[280px]">
        <VideoFrame
          youtubeId={episode.youtubeId}
          title={episode.title}
          className="h-full border-l border-white/5"
          aspectClassName="h-full min-h-[280px]"
        />
      </div>
    </GlassPanel>
  );
}