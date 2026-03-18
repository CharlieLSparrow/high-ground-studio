import DocsPageShell from "@/components/docs/DocsPageShell";
import EpisodePageShell from "@/components/docs/EpisodePageShell";
import { source } from "@/lib/source";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];

  const page = source.getPage(segments);
  if (!page) return notFound();

  const MDX = page.data.body;

  const title = typeof page.data.title === "string" ? page.data.title : "";
  const description =
    "description" in page.data && typeof page.data.description === "string"
      ? page.data.description
      : undefined;

  const youtubeId =
    "youtube" in page.data && typeof page.data.youtube === "string"
      ? page.data.youtube
      : undefined;

  if (youtubeId) {
    return (
      <EpisodePageShell
        title={title}
        description={description}
        youtubeId={youtubeId}
      >
        <MDX />
      </EpisodePageShell>
    );
  }

  return (
    <DocsPageShell title={title} description={description}>
      <MDX />
    </DocsPageShell>
  );
}