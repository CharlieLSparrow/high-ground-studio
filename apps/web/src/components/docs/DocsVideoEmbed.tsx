export default function DocsVideoEmbed({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  return (
    <div className="mb-8 overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
      <div className="relative pt-[56.25%]">
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