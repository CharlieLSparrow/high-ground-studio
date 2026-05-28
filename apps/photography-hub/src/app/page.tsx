import Link from "next/link";
import { Camera, Eye, Zap, BookOpen } from "lucide-react";
import { getAllPosts } from "../lib/content";

export default function Home() {
  const dynamicPosts = getAllPosts();
  const categoryIcons: Record<string, any> = {
    "Lighting Technique": Eye,
    "Gear Reviews": Camera,
    "Camera Manual": Zap,
  };

  const posts = dynamicPosts.map((post) => ({
    title: post.title,
    snippet: post.description,
    readTime: post.readTime,
    category: post.category,
    icon: categoryIcons[post.category] || Camera,
    href: `/posts/${post.slug}`,
  }));

  // Fallback to seeds if empty
  if (posts.length === 0) {
    posts.push(
      {
        title: "Mastering Natural Light in Portraiture",
        snippet: "How to read dynamic shadows, identify the golden hour windows, and position reflectors for clean catches.",
        readTime: "6 min read",
        category: "Lighting Technique",
        icon: Eye,
        href: "#"
      },
      {
        title: "The Ultimate Prime Lens Guide: 35mm vs 50mm vs 85mm",
        snippet: "Breakdowns of focal lengths, spatial compression, and when to pick each prime for maximum sharpness.",
        readTime: "9 min read",
        category: "Gear Reviews",
        icon: Camera,
        href: "#"
      },
      {
        title: "Understanding Shutter Speed & Spatial Kinetic Motion",
        snippet: "A practical guide to panning, freezing action, and using motion blur creatively in street photography.",
        readTime: "8 min read",
        category: "Camera Manual",
        icon: Zap,
        href: "#"
      }
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-stone-950 font-sans text-stone-200">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-stone-900/60 bg-stone-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
              <Camera className="size-5" />
            </span>
            <span className="font-serif text-lg font-bold tracking-wide text-stone-50">
              Aperture & Light
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-semibold text-stone-400">
            <Link href="#" className="hover:text-amber-400 transition-colors">Portfolios</Link>
            <Link href="#" className="hover:text-amber-400 transition-colors">Guides</Link>
            <Link href="#" className="hover:text-amber-400 transition-colors">Gear</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 lg:py-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-950/15 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400 mb-6 font-mono">
            Focus & Composition
          </span>
          <h1 className="font-serif text-4xl font-extrabold tracking-tight sm:text-6xl text-stone-50 mb-6 leading-tight">
            Creative Photography & Lighting Masterclass Guides
          </h1>
          <p className="text-lg leading-relaxed text-stone-400 max-w-2xl mx-auto mb-10">
            Dedicated camera journals, field research, and lens insights constructed to expand your compositional eye and master natural exposure.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href="#latest"
              className="flex h-12 items-center justify-center rounded-lg bg-amber-400 px-6 font-semibold text-stone-950 transition-all hover:bg-amber-300 hover:shadow-[0_0_24px_rgba(251,191,36,0.38)]"
            >
              Start Learning Guides
            </a>
            <a
              href="#"
              className="flex h-12 items-center justify-center rounded-lg border border-stone-850 bg-stone-900/40 px-6 font-semibold text-stone-300 transition-all hover:bg-stone-900"
            >
              Visual Portfolios
            </a>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="latest" className="flex-1 mx-auto max-w-6xl w-full px-6 py-12">
        <h2 className="font-serif text-2xl font-bold text-stone-100 mb-8 flex items-center gap-3">
          <span className="h-0.5 w-6 bg-amber-400" />
          Field Publications & Manuals
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((post) => {
            const Icon = post.icon;
            return (
              <article
                key={post.title}
                className="group relative flex flex-col justify-between rounded-xl border border-stone-900 bg-stone-900/20 p-6 shadow-sm transition-all duration-300 hover:border-stone-800 hover:bg-stone-900/40"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-400/0 via-transparent to-amber-400/3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider font-mono">
                      {post.category}
                    </span>
                    <span className="text-xs text-stone-500 font-mono">
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-bold text-stone-150 mb-2 group-hover:text-amber-300 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-stone-400 mb-6">
                    {post.snippet}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
                  <Icon className="size-4 shrink-0" />
                  Read field guide →
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-stone-500 font-mono">
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
