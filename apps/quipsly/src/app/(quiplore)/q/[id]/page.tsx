import { getPrismaClient } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Metadata } from "next";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const prisma = getPrismaClient();
  const quote = await prisma.quipLoreQuote.findUnique({
    where: { id: params.id },
    include: {
      author: true,
      work: true
    }
  });

  if (!quote) return { title: "Quote Not Found" };

  const authorName = quote.author?.name || "High Ground Odyssey";
  const title = `Quote by ${authorName} | QuipLore`;
  const description = quote.text.substring(0, 160) + (quote.text.length > 160 ? "..." : "");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    }
  };
}

export default async function QuotePassportPage(props: Props) {
  const params = await props.params;
  const prisma = getPrismaClient();
  
  const quote = await prisma.quipLoreQuote.findUnique({
    where: { id: params.id },
    include: {
      author: true,
      work: true,
      tags: true,
      project: true
    }
  });

  if (!quote) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center p-4 font-sans text-[#EAEAEA]">
      <div className="max-w-2xl w-full bg-[#1A1A1A] border border-[#333] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Trading Card Header */}
        <div className="px-8 py-6 border-b border-[#333] flex items-center justify-between bg-gradient-to-r from-[#111] to-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center">
              <span className="text-xl">📖</span>
            </div>
            <div>
              <div className="text-xs text-[#888] uppercase tracking-wider font-semibold">QuipLore Passport</div>
              <div className="text-sm font-medium text-indigo-400">{quote.project.slug}</div>
            </div>
          </div>
          <div className="text-xs text-[#666] font-mono">
            ID: {quote.id.slice(-8)}
          </div>
        </div>

        {/* Quote Content */}
        <div className="p-10 space-y-8">
          <blockquote className="text-2xl md:text-3xl font-serif text-[#EAEAEA] leading-relaxed italic relative">
            <span className="absolute -top-4 -left-6 text-6xl text-[#333] select-none">"</span>
            {quote.text}
          </blockquote>
          
          <div className="flex flex-col gap-1">
            <div className="text-lg font-medium text-white">
              — {quote.author?.name || "Unknown Author"}
            </div>
            {quote.work?.title && (
              <div className="text-sm text-[#888]">
                From <span className="italic">{quote.work.title}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tags & Metadata Footer */}
        <div className="px-8 py-5 bg-[#111] border-t border-[#333] flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2 flex-wrap">
            {quote.tags.map(tag => (
              <span key={tag.id} className="px-2.5 py-1 rounded-md bg-[#222] border border-[#333] text-xs font-medium text-[#AAA]">
                #{tag.name}
              </span>
            ))}
            {quote.tags.length === 0 && (
              <span className="text-xs text-[#555] italic">No tags</span>
            )}
          </div>
          
          <div className="text-xs text-[#555]">
            Extracted {quote.createdAt.toLocaleDateString()}
          </div>
        </div>

      </div>
    </div>
  );
}
