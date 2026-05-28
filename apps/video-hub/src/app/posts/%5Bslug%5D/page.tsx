import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock, Tag, User, Film } from "lucide-react";
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

  const htmlContent = markdownToHtml(post.content, "rose");

  return (
    <div className="flex flex-col min-h-screen bg-zinc-955 font-sans text-zinc-200 selection:bg-rose-500 selection:text-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-900/60 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="flex size-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20 transition-colors">
              <Film className="size-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-wide text-zinc-50 uppercase group-hover:text-rose-500 transition-colors">
              Studio Cut Lab
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold text-zinc-400">
            <Link href="/" className="hover:text-rose-500 transition-colors">Home</Link>
            <span className="text-zinc-700">/</span>
            <span className="text-rose-500 font-mono">Workshops</span>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-900 bg-zinc-900/10 px-6 py-16 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-955/15 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-3xl">
          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-rose-500 transition-colors mb-8 font-mono"
          >
            <ArrowLeft className="size-4" /> Back to Timelines
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-500 mb-6 uppercase tracking-wider font-mono">
            {post.category}
          </span>

          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl text-zinc-50 mb-6 leading-tight uppercase">
            {post.title}
          </h1>

          {post.subtitle && (
            <p className="text-lg text-zinc-400 mb-8 font-light">
              {post.subtitle}
            </p>
          )}

          {/* Author/Date/ReadTime Bar */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400 font-mono border-t border-zinc-900 pt-6">
            <div className="flex items-center gap-2">
              <User className="size-4 text-rose-500" />
              <span>By {post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-rose-500" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-rose-500" />
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
          <AdSenseBannerSlot slotId="video-post-footer-slot" />
        </div>

        {/* Donation Callout */}
        <div className="mt-12">
          <DonationPledgeBanner />
        </div>

        {/* Recommended Resources Grid */}
        <div className="mt-12">
          <h3 className="font-display text-sm font-bold text-zinc-100 mb-6 flex items-center gap-3 uppercase tracking-wider">
            <span className="h-0.5 w-4 bg-rose-500" />
            Recommended Editing Tools
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <AffiliateProductCard
              title="In the Blink of an Eye: A Perspective on Film Editing"
              brandOrAuthor="Walter Murch"
              description="A masterclass on the philosophy and structural cuts of film assembly, essential reading for any video creator."
              category="book"
              price="$16.99"
              amazonUrl="https://www.amazon.com/dp/1879505622"
            />
            <AffiliateProductCard
              title="Insta360 X4 Action Camera"
              brandOrAuthor="Insta360"
              description="Capture incredible 8K 360-degree footage with flowstate stabilization. Reframing workflows are standard."
              category="gear"
              price="$499.99"
              amazonUrl="https://www.amazon.com/dp/B0CX1DTVR1"
            />
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-zinc-900 flex flex-wrap gap-2 items-center">
            <Tag className="size-4 text-zinc-600 mr-2" />
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-zinc-900/60 border border-zinc-850 px-2.5 py-1 text-xs text-zinc-400 font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-zinc-500 font-mono">
          <p>© {new Date().getFullYear()} Studio Cut Lab. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/ads.txt" className="hover:text-zinc-300">ads.txt</Link>
            <Link href="#" className="hover:text-zinc-300">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
