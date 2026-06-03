import React from "react";
import Link from "next/link";
import { getPrismaClient } from "@/lib/prisma";
import { ArrowLeft, BookOpen, ChevronRight, HelpCircle } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prisma = getPrismaClient();
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug },
  });

  return {
    title: article ? `${article.title} - Quipsly Help Center` : "Help Article",
    description: article ? `Read our guide about ${article.title} on Quipsly.` : "Quipsly Documentation",
  };
}

// A simple, secure markdown text formatter helper to render articles safely
function renderSimpleMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inList = false;

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className="list-disc pl-6 space-y-2 mb-4 text-studio-muted">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // H1 Heading
    if (line.startsWith("# ")) {
      flushList(String(i));
      elements.push(
        <h1 key={i} className="text-3xl font-black text-studio-ink mt-8 mb-4 tracking-tight border-b border-studio-line pb-2">
          {line.substring(2)}
        </h1>
      );
    }
    // H2 Heading
    else if (line.startsWith("## ")) {
      flushList(String(i));
      elements.push(
        <h2 key={i} className="text-xl font-bold text-[#f0b765] mt-6 mb-3 tracking-tight">
          {line.substring(3)}
        </h2>
      );
    }
    // H3 Heading
    else if (line.startsWith("### ")) {
      flushList(String(i));
      elements.push(
        <h3 key={i} className="text-base font-bold text-studio-ink mt-5 mb-2">
          {line.substring(4)}
        </h3>
      );
    }
    // Unordered List Items
    else if (line.startsWith("- ")) {
      inList = true;
      const cleanLine = line.substring(2);
      // Basic inline bold formatter **text**
      const boldParts = cleanLine.split("**");
      const formattedNode = boldParts.map((part, index) => 
        index % 2 === 1 ? <strong key={index} className="text-studio-ink font-bold">{part}</strong> : part
      );
      listItems.push(<li key={`li-${i}`} className="text-sm leading-relaxed">{formattedNode}</li>);
    }
    // Empty Line
    else if (line === "") {
      flushList(String(i));
    }
    // Standard Paragraph
    else {
      flushList(String(i));
      // Basic inline bold formatter **text**
      const boldParts = line.split("**");
      const formattedNode = boldParts.map((part, index) => 
        index % 2 === 1 ? <strong key={index} className="text-studio-ink font-bold">{part}</strong> : part
      );
      elements.push(
        <p key={i} className="text-sm text-studio-muted leading-relaxed mb-4">
          {formattedNode}
        </p>
      );
    }
  }

  flushList("end");
  return elements;
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prisma = getPrismaClient();

  // Fetch target article
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug },
    include: { category: true },
  });

  if (!article || !article.isPublished) {
    notFound();
  }

  // Fetch sidebar directory (categories with published articles list)
  const categories = await prisma.knowledgeCategory.findMany({
    include: {
      articles: {
        where: { isPublished: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return (
    <div className="w-full max-w-6xl mx-auto py-12 px-4 flex flex-col gap-6 text-studio-ink min-h-screen">
      
      {/* Back button & Breadcrumbs */}
      <nav className="flex items-center justify-between border-b border-studio-line pb-4 mb-4 shrink-0 text-xs">
        <Link
          href="/help"
          className="flex items-center gap-1.5 text-studio-dim hover:text-studio-ink transition-colors font-bold"
        >
          <ArrowLeft size={14} /> Back to Help Center
        </Link>
        
        <div className="flex items-center gap-1.5 text-studio-dim">
          <span>Help</span>
          <ChevronRight size={12} />
          <span className="text-[#f0b765]">{article.category.name}</span>
          <ChevronRight size={12} />
          <span className="text-studio-muted truncate max-w-xs">{article.title}</span>
        </div>
      </nav>

      {/* Main body: Sidebar + Article View */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar Nav (1 col) */}
        <aside className="lg:col-span-1 flex flex-col gap-6 bg-[#032321]/30 border border-studio-line rounded-2xl p-5 h-fit max-lg:order-last">
          <h4 className="text-xs font-bold uppercase tracking-wider text-studio-dim flex items-center gap-1.5">
            <BookOpen size={14} className="text-studio-tag" /> Directory
          </h4>

          <div className="flex flex-col gap-4">
            {categories.map(cat => (
              <div key={cat.id} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[#f0b765] uppercase tracking-wider">{cat.name}</span>
                <div className="flex flex-col gap-1 pl-2 border-l border-studio-line">
                  {cat.articles.map(art => (
                    <Link
                      key={art.id}
                      href={`/help/article/${art.slug}`}
                      className={`text-xs py-1 transition-all ${
                        art.slug === slug 
                          ? "text-studio-tag font-bold" 
                          : "text-studio-muted hover:text-studio-ink"
                      }`}
                    >
                      {art.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Viewer (3 cols) */}
        <main className="lg:col-span-3 bg-[#032321]/50 border border-studio-line rounded-3xl p-6 md:p-8 shadow-studio-panel h-fit">
          <article className="prose prose-invert max-w-none text-left">
            {renderSimpleMarkdown(article.content)}
          </article>
        </main>

      </div>

    </div>
  );
}
