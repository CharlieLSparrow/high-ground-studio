import Link from "next/link";
import { Video, Film, Play, Scissors } from "lucide-react";
import { getAllPosts } from "../lib/content";

export default function Home() {
  const dynamicPosts = getAllPosts();
  const categoryIcons: Record<string, any> = {
    "Color Science": Film,
    "Editing & Pacing": Scissors,
    "Action Cam Lab": Video,
  };

  const tutorials = dynamicPosts.map((post) => ({
    title: post.title,
    snippet: post.description,
    duration: post.readTime,
    topic: post.category,
    icon: categoryIcons[post.category] || Film,
    href: `/posts/${post.slug}`,
  }));

  // Fallback to seeds if empty
  if (tutorials.length === 0) {
    tutorials.push(
      {
        title: "Color Grading in DaVinci Resolve: The Node Flow Manual",
        snippet: "How to structure serial, parallel, and layer nodes for clean skin tones and consistent spatial exposure.",
        duration: "10 min read",
        topic: "Color Science",
        icon: Film,
        href: "#"
      },
      {
        title: "Pacing and Retaining Attention in Short-Form Video",
        snippet: "A frame-by-frame structural breakdown of jump cuts, pattern interrupts, and semantic sound design keys.",
        duration: "7 min read",
        topic: "Editing & Pacing",
        icon: Scissors,
        href: "#"
      },
      {
        title: "Optimizing the Insta360 Studio Workflow for Action Sequences",
        snippet: "Advanced reframing tricks, flowstate stabilization settings, and stitching export calibrations.",
        duration: "8 min read",
        topic: "Action Cam Lab",
        icon: Video,
        href: "#"
      }
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 font-sans text-zinc-250">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-900/60 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <Film className="size-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-wide text-zinc-50 uppercase">
              Studio Cut Lab
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-semibold text-zinc-400">
            <Link href="#" className="hover:text-rose-500 transition-colors">Grading</Link>
            <Link href="#" className="hover:text-rose-500 transition-colors">Workflows</Link>
            <Link href="#" className="hover:text-rose-500 transition-colors">Pacing</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 lg:py-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-950/15 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-500 mb-6 font-mono uppercase tracking-wider">
            Cinema & Assembly
          </span>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl text-zinc-50 mb-6 leading-tight uppercase">
            Advanced Video Editing, Color Grading & Assembly Masterclass
          </h1>
          <p className="text-lg leading-relaxed text-zinc-400 max-w-2xl mx-auto mb-10">
            Field manuals, grading node structures, pacing mechanics, and Insta360 editing guidelines designed to accelerate your rendering workspace.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href="#latest"
              className="flex h-12 items-center justify-center rounded-lg bg-rose-500 px-6 font-semibold text-zinc-950 transition-all hover:bg-rose-400 hover:shadow-[0_0_24px_rgba(244,63,94,0.38)]"
            >
              Start Editing Lessons
            </a>
            <a
              href="#"
              className="flex h-12 items-center justify-center rounded-lg border border-zinc-850 bg-zinc-900/40 px-6 font-semibold text-zinc-300 transition-all hover:bg-zinc-900"
            >
              Cine Showreels
            </a>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="latest" className="flex-1 mx-auto max-w-6xl w-full px-6 py-12">
        <h2 className="font-display text-xl font-bold text-zinc-100 mb-8 flex items-center gap-3 uppercase tracking-wider">
          <span className="h-0.5 w-6 bg-rose-500" />
          Technical Manuals & Timelines
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {tutorials.map((tutorial) => {
            const Icon = tutorial.icon;
            return (
              <article
                key={tutorial.title}
                className="group relative flex flex-col justify-between rounded-xl border border-zinc-900 bg-zinc-900/20 p-6 shadow-sm transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-900/40"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-rose-500/0 via-transparent to-rose-500/3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider font-mono">
                      {tutorial.topic}
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {tutorial.duration}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-zinc-150 mb-2 group-hover:text-rose-400 transition-colors">
                    {tutorial.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400 mb-6">
                    {tutorial.snippet}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-rose-500 group-hover:translate-x-1 transition-transform">
                  <Icon className="size-4 shrink-0" />
                  Open workshop →
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-zinc-500 font-mono">
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
