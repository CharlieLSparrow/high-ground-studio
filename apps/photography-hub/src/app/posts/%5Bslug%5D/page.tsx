import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock, Tag, User, Camera } from "lucide-react";
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

  const htmlContent = markdownToHtml(post.content, "amber");

  return (
    <div className="flex flex-col min-h-screen bg-stone-955 font-sans text-stone-200 selection:bg-amber-400 selection:text-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-stone-900/60 bg-stone-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 group-hover:bg-amber-400/20 transition-colors">
              <Camera className="size-5" />
            </span>
            <span className="font-serif text-lg font-bold tracking-wide text-stone-50 group-hover:text-amber-400 transition-colors">
              Aperture & Light
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold text-stone-400">
            <Link href="/" className="hover:text-amber-400 transition-colors">Home</Link>
            <span className="text-stone-700">/</span>
            <span className="text-amber-400 font-mono">Guides</span>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-stone-900 bg-stone-900/10 px-6 py-16 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-955/15 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-3xl">
          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400 hover:text-amber-400 transition-colors mb-8 font-mono"
          >
            <ArrowLeft className="size-4" /> Back to Journal
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400 mb-6 uppercase tracking-wider font-mono">
            {post.category}
          </span>

          <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-5xl text-stone-50 mb-6 leading-tight">
            {post.title}
          </h1>

          {post.subtitle && (
            <p className="text-lg text-stone-450 mb-8 font-light italic">
              {post.subtitle}
            </p>
          )}

          {/* Author/Date/ReadTime Bar */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-stone-400 font-mono border-t border-stone-900 pt-6">
            <div className="flex items-center gap-2">
              <User className="size-4 text-amber-400" />
              <span>By {post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-amber-400" />
              <span>{post.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-amber-400" />
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
          <AdSenseBannerSlot slotId="photo-post-footer-slot" />
        </div>

        {/* Donation Callout */}
        <div className="mt-12">
          <DonationPledgeBanner />
        </div>

        {/* Recommended Resources Grid */}
        <div className="mt-12 font-sans">
          <h3 className="font-serif text-lg font-bold text-stone-100 mb-6 flex items-center gap-3">
            <span className="h-0.5 w-4 bg-amber-400" />
            Essential Gear & Literature
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <AffiliateProductCard
              title="Understanding Exposure, Fourth Edition"
              brandOrAuthor="Bryan Peterson"
              description="Learn to capture professional exposures in any condition, demystifying shutter speed, aperture, and ISO."
              category="book"
              price="$24.99"
              amazonUrl="https://www.amazon.com/dp/1607748509"
            />
            <AffiliateProductCard
              title="Fujifilm X-T5 Mirrorless Camera"
              brandOrAuthor="Fujifilm"
              description="A state-of-the-art 40MP APS-C sensor packed into a beautifully tactile retro body, perfect for landscape and portraiture."
              category="gear"
              price="$1,699.00"
              amazonUrl="https://www.amazon.com/dp/B0BKTGD28C"
            />
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 pt-8 border-t border-stone-900 flex flex-wrap gap-2 items-center">
            <Tag className="size-4 text-stone-600 mr-2" />
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-stone-900/60 border border-stone-850 px-2.5 py-1 text-xs text-stone-400 font-mono"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950 px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-stone-500 font-mono">
          <p>© {new Date().getFullYear()} Aperture & Light. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/ads.txt" className="hover:text-stone-300">ads.txt</Link>
            <Link href="#" className="hover:text-stone-300">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
