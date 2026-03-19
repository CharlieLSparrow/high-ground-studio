import VideoFrame from "@/components/ui/VideoFrame";

export default function DocsVideoEmbed({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  return <VideoFrame youtubeId={youtubeId} title={title} />;
}