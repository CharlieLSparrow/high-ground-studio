type VideoFrameProps = {
  youtubeId: string;
  title: string;
  className?: string;
  aspectClassName?: string;
};

export default function VideoFrame({
  youtubeId,
  title,
  className="text-[14px] tracking-[0.04em] text-[rgba(255,255,255,0.82)] no-underline transition hover:text-[var(--accent)]",
  aspectClassName = "pt-[56.25%]",
}: VideoFrameProps) {
  return (
    <div className={["overflow-hidden bg-black", className].join(" ")}>
      <div className={["relative", aspectClassName].join(" ")}>
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}