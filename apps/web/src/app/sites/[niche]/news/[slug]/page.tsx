import { notFound } from "next/navigation";
import { getNewsSource } from "@/lib/source";

export default async function NewsArticlePage({ params }: any) {
  const { niche, slug } = await params;
  const source = await getNewsSource(niche);
  
  // Note: For Fumadocs, slug usually comes as an array, but if our route is [slug] it's a string.
  // getPage expects an array of segments.
  const page = source.getPage([slug]);

  if (!page) {
    notFound();
  }

  const PageContent = (page as any).data.body;

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-3xl mx-auto prose prose-invert">
      <h1 className="text-4xl font-bold mb-4">{(page as any).data.title}</h1>
      <p className="text-gray-400 mb-8">{(page as any).data.description}</p>
      <PageContent />
    </div>
  );
}
