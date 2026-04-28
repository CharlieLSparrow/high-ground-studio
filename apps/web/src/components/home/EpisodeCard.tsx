import type { Episode } from "@/lib/site";
import type { LayoutVariant } from "@/lib/layout-variant";
import GlassPanel from "@/components/ui/GlassPanel";
import {
  getLayoutGlowEnabled,
  getLayoutPanelTreatment,
  getLayoutTextTreatment,
} from "@/lib/layout-variant-styles";
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
  const featuredPanelClass = [
    "overflow-hidden transition-all",
    layoutVariant === "cinematic"
      ? "hover:border-flare/40"
      : layoutVariant === "editorial"
        ? "hover:border-[rgba(255,244,225,0.28)]"
        : "hover:border-[rgba(255,255,255,0.16)]",
    getLayoutPanelTreatment(layoutVariant, "featured"),
  ].join(" ");

  if (featured) {
    return (
      <GlassPanel glow={getLayoutGlowEnabled(layoutVariant)} className={featuredPanelClass}>
        <VideoFrame youtubeId={episode.youtubeId} title={episode.title} />
        <div className="px-6 py-7">
          <div
            className={[
              "mb-3 text-[13px] font-extrabold uppercase tracking-[0.08em]",
              getLayoutTextTreatment(layoutVariant, "featureLabel"),
            ].join(" ")}
          >
            {layoutVariant === "signal" ? "Lead Story" : "Featured Episode"}
          </div>
          <h2
            className={[
              "mb-3 text-[clamp(2rem,4vw,3rem)] font-black leading-none tracking-tight",
              getLayoutTextTreatment(layoutVariant, "title"),
            ].join(" ")}
          >
            {episode.title}
          </h2>
          <p
            className={[
              "mb-5 max-w-[760px] leading-relaxed",
              getLayoutTextTreatment(layoutVariant, "body"),
            ].join(" ")}
          >
            {episode.description}
          </p>
          <a
            href={episode.href}
            className={[
              "font-bold",
              getLayoutTextTreatment(layoutVariant, "link"),
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
        layoutVariant === "cinematic"
          ? "hover:border-flare/30"
          : layoutVariant === "editorial"
            ? "hover:border-[rgba(255,244,225,0.28)]"
            : "hover:border-[rgba(255,255,255,0.16)]",
        getLayoutPanelTreatment(layoutVariant, "standard"),
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
            getLayoutTextTreatment(layoutVariant, "rail"),
          ].join(" ")}
        >
          Episode
        </div>
        <h3
          className={[
            "mb-3 pl-4 text-[clamp(1.8rem,3vw,2.5rem)] leading-none tracking-[-0.05em]",
            getLayoutTextTreatment(layoutVariant, "title"),
          ].join(" ")}
        >
          {episode.title}
        </h3>
        <p
          className={[
            "mb-5 max-w-[620px] pl-4 text-[1.02rem] leading-8",
            getLayoutTextTreatment(layoutVariant, "body"),
          ].join(" ")}
        >
          {episode.description}
        </p>
        <div className="pl-4">
          <a
            href={episode.href}
            className={[
              "text-[15px] font-extrabold no-underline transition-colors",
              getLayoutTextTreatment(layoutVariant, "link"),
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
