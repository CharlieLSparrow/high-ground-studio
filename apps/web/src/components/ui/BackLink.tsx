type VideoFrameProps = {
  youtubeId: string;
  title: string;
  className?: string;
  aspectClassName?: string;
};

export default function VideoFrame({
  youtubeId,
  title,
  className = "",
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