import type { Episode } from "@/lib/site";
import type { LayoutVariant } from "@/lib/layout-variant";
import GlassPanel from "@/components/ui/GlassPanel";
import VideoFrame from "@/components/ui/VideoFrame";

export default function EpisodeCard({
  episode,
  featured = false,
  variant = "wide",
  layoutVariant = "cinematic",
}: {
  episode: Episode;
  featured?: boolean;
  variant?: "wide" | "poster";
  layoutVariant?: LayoutVariant;
}) {
  const featuredPanelClass =
    layoutVariant === "editorial"
      ? "overflow-hidden border-[rgba(255,244,225,0.18)] bg-[rgba(77,57,39,0.45)] transition-all hover:border-[rgba(255,244,225,0.28)]"
      : layoutVariant === "signal"
        ? "overflow-hidden border-white/8 bg-[rgba(255,255,255,0.035)] transition-all hover:border-[rgba(255,255,255,0.16)]"
        : "overflow-hidden transition-all hover:border-flare/40";

  if (featured) {
    return (
      <GlassPanel glow={layoutVariant !== "signal"} className={featuredPanelClass}>
        <VideoFrame youtubeId={episode.youtubeId} title={episode.title} />
        <div className="px-6 py-7">
          <div
            className={[
              "mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em]",
              layoutVariant === "editorial"
                ? "text-[rgba(255,244,225,0.78)]"
                : layoutVariant === "signal"
                  ? "text-[rgba(230,236,238,0.72)]"
                  : "text-flare",
            ].join(" ")}
          >
            {layoutVariant === "signal" ? "Lead Story" : "Featured Episode"}
          </div>
          <h2
            className={[
              "mb-3 text-[clamp(2rem,4vw,3rem)] font-black leading-none tracking-tight",
              layoutVariant === "signal" ? "text-[var(--text-light)]" : "text-subject",
            ].join(" ")}
          >
            {episode.title}
          </h2>
          <p
            className={[
              "mb-5 max-w-[760px] leading-relaxed",
              layoutVariant === "signal"
                ? "text-[rgba(230,236,238,0.78)]"
                : "text-subject-muted",
            ].join(" ")}
          >
            {episode.description}
          </p>
          <a
            href={episode.href}
            className={[
              "font-bold",
              layoutVariant === "signal"
                ? "text-[var(--text-light)] hover:text-white"
                : "text-subject hover:text-flare",
            ].join(" ")}
          >
            {layoutVariant === "editorial"
              ? "Open reading →"
              : "Read companion article →"}
          </a>
        </div>
      </GlassPanel>
    );
  }

  if (variant === "poster") {
    return (
      <a href={episode.href} className="group relative block overflow-hidden rounded-2xl border border-white/5 bg-void shadow-2xl transition-all hover:-translate-y-2 hover:border-flare/40">
        <div className="aspect-[2/3] w-full overflow-hidden">
          <img 
            src={`https://img.youtube.com/vi/${episode.youtubeId}/maxresdefault.jpg`}
            alt={episode.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent opacity-90" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-flare">Episode</div>
          <h3 className="text-xl font-bold text-subject group-hover:text-flare-glow">{episode.title}</h3>
        </div>
      </a>
    );
  }

  return (
    <GlassPanel
      className={[
        "grid overflow-hidden transition-all md:grid-cols-[1.15fr_0.85fr]",
        layoutVariant === "editorial"
          ? "border-[rgba(255,244,225,0.18)] bg-[rgba(77,57,39,0.42)] hover:border-[rgba(255,244,225,0.28)]"
          : layoutVariant === "signal"
            ? "border-white/8 bg-[rgba(255,255,255,0.035)] hover:border-[rgba(255,255,255,0.16)]"
            : "hover:border-flare/30",
      ].join(" ")}
    >
      <div className="relative flex flex-col justify-center px-7 py-8">
        <div
          className={[
            "absolute bottom-6 left-0 top-6 w-1 rounded-full",
            layoutVariant === "editorial"
              ? "bg-gradient-to-b from-[rgba(255,244,225,0.82)] to-[rgba(199,154,105,0.66)]"
              : layoutVariant === "signal"
                ? "bg-gradient-to-b from-[rgba(230,236,238,0.9)] to-[rgba(124,151,166,0.7)]"
                : "bg-gradient-to-b from-flare to-flare-glow",
          ].join(" ")}
        />
        <div
          className={[
            "mb-2 pl-4 text-[12px] font-extrabold uppercase tracking-[0.08em]",
            layoutVariant === "editorial"
              ? "text-[rgba(255,244,225,0.72)]"
              : layoutVariant === "signal"
                ? "text-[rgba(230,236,238,0.7)]"
                : "text-flare-glow",
          ].join(" ")}
        >
          Episode
        </div>
        <h3
          className={[
            "mb-3 pl-4 text-[clamp(1.8rem,3vw,2.5rem)] leading-none tracking-[-0.05em]",
            layoutVariant === "signal" ? "text-[var(--text-light)]" : "text-subject",
          ].join(" ")}
        >
          {episode.title}
        </h3>
        <p
          className={[
            "mb-5 max-w-[620px] pl-4 text-[1.02rem] leading-8",
            layoutVariant === "signal"
              ? "text-[rgba(230,236,238,0.78)]"
              : "text-subject-muted",
          ].join(" ")}
        >
          {episode.description}
        </p>
        <div className="pl-4">
          <a
            href={episode.href}
            className={[
              "text-[15px] font-extrabold no-underline transition-colors",
              layoutVariant === "signal"
                ? "text-[var(--text-light)] hover:text-white"
                : "text-subject hover:text-flare",
            ].join(" ")}
          >
            {layoutVariant === "editorial"
              ? "Open reading →"
              : "Read companion article →"}
          </a>
        </div>
      </div>
      <div className="relative min-h-[280px]">
        <VideoFrame youtubeId={episode.youtubeId} title={episode.title} className="h-full border-l border-white/5" aspectClassName="h-full min-h-[280px]" />
      </div>
    </GlassPanel>
  );
}
