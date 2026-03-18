import DocsPageShell from "@/components/docs/DocsPageShell";
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

  return (
    <DocsPageShell
      title={page.data.title}
      description={
        "description" in page.data ? page.data.description : undefined
      }
      youtubeId={"youtube" in page.data ? page.data.youtube : undefined}
    >
      <MDX />
    </DocsPageShell>
  );
}