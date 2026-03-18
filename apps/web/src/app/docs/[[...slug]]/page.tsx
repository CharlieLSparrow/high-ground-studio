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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 40 }}>
      <h1>{page.data.title}</h1>
      <article>
        <MDX />
      </article>
    </main>
  );
}