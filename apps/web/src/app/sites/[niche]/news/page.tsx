import { notFound } from "next/navigation";
import { getNewsSource } from "@/lib/source";

export default async function NewsPage({ params }: any) {
  const { niche } = await params;
  const source = await getNewsSource(niche);
  
  // Get all pages for this niche, they represent the news articles
  const pages = source.getPages();

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 capitalize">{niche} News Feed</h1>
      <div className="flex flex-col gap-6">
        {pages.map((page: any) => (
          <a key={page.url} href={page.url} className="block p-6 rounded-lg border border-white/10 hover:bg-white/5 transition-colors">
            <h2 className="text-2xl font-semibold mb-2">{page.data.title}</h2>
            <p className="text-gray-400">{page.data.description}</p>
          </a>
        ))}
        {pages.length === 0 && (
          <p className="text-gray-500">No news articles found for this niche yet.</p>
        )}
      </div>
    </div>
  );
}
