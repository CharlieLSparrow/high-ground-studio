import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock, Tag, User, Radio } from "lucide-react";
import { getPostBySlug, getAllPosts, markdownToHtml } from "../../../lib/content";
import AdSenseBannerSlot from "../../../components/monetization/AdSenseBannerSlot";
import AffiliateProductCard from "../../../components/monetization/AffiliateProductCard";
import DonationPledgeBanner from "../../../components/monetization/DonationPledgeBanner";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const htmlContent = markdownToHtml(post.content, "teal");

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-teal-500 selection:text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="flex size-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 transition-colors">
              <Radio className="size-5 animate-pulse" />
            </span>
            <span className="font-mono text-lg font-bold tracking-wider text-slate-50 uppercase group-hover:text-teal-400 transition-colors">
              AI Pulse Hub
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold text-slate-350">
            <Link href="/" className="hover:text-teal-400 transition-colors">Home</Link>
            <span className="text-slate-600">/</span>
            <span className="text-teal-400 font-mono">Logs</span>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-900 bg-slate-900/10 px-6 py-16 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-teal-950/15 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-3xl">
          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-teal-400 transition-colors mb-8"
          >
            <ArrowLeft className="size-4" /> Back to Research
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-400 mb-6 uppercase tracking-wider font-mono">
            {post.category}
          </span>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-slate-100 mb-6 leading-tight">
            {post.title}
          </h1>

          {post.subtitle && (
            <p className="text-lg text-slate-400 mb-8 font-light">
              {post.subtitle}
            </p>
          )}

          {/* Author/Date/ReadTime Bar */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 font-mono border-t border-slate-900 pt-6">
            <div className="flex items-center gap-2">
              <User className="size-4 text-teal-400" />
              <span>By {post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-teal-400" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-teal-400" />
              <span>{post.readTime}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 mx-auto max-w-3xl w-full px-6 py-12">
        <article className="prose prose-invert max-w-none">
          {/* Dynamic Article Render */}
          <div 
            className="space-y-4"
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
          />
        </article>

        {/* AdSense Slot */}
        <div className="mt-8">
          <AdSenseBannerSlot slotId="ai-post-footer-slot" />
        </div>

        {/* Donation Callout */}
        <div className="mt-12">
          <DonationPledgeBanner />
        </div>

        {/* Recommended Resources Grid */}
        <div className="mt-12">
          <h3 className="text-sm font-bold tracking-wider text-slate-200 uppercase mb-6 flex items-center gap-2 font-mono">
            <span className="h-0.5 w-4 bg-teal-500" />
            Recommended Resources
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <AffiliateProductCard
              title="Designing Data-Intensive Applications"
              brandOrAuthor="Martin Kleppmann"
              description="The definitive guide to system architectures, databases, and large-scale data processing models."
              category="book"
              price="$39.99"
              amazonUrl="https://www.amazon.com/dp/1449373321"
            />
            <AffiliateProductCard
              title="Keychron K2 Mechanical Keyboard"
              brandOrAuthor="Keychron"
              description="A gorgeous, compact mechanical keyboard with hot-swappable key switches, perfect for high-speed coding sessions."
              category="gear"
              price="$79.99"
              amazonUrl="https://www.amazon.com/dp/B07QBPDYGP"
            />
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-900 flex flex-wrap gap-2 items-center">
            <Tag className="size-4 text-slate-500 mr-2" />
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-slate-900/60 border border-slate-800 px-2.5 py-1 text-xs text-slate-400 font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-slate-500 font-mono">
          <p>© {new Date().getFullYear()} AI Pulse Hub. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/ads.txt" className="hover:text-slate-300">ads.txt</Link>
            <Link href="#" className="hover:text-slate-300">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
