import Link from "next/link";
import { Cpu, Terminal, Layers, Radio } from "lucide-react";
import { getAllPosts } from "../lib/content";

export default function Home() {
  const dynamicPosts = getAllPosts();
  const categoryIcons: Record<string, any> = {
    "Agentic Systems": Terminal,
    "Deep Learning": Layers,
    "Retrieval (RAG)": Cpu,
  };

  const articles = dynamicPosts.map((post) => ({
    title: post.title,
    snippet: post.description,
    readTime: post.readTime,
    category: post.category,
    icon: categoryIcons[post.category] || Terminal,
    href: `/posts/${post.slug}`,
  }));

  // Fallback to seeds if empty
  if (articles.length === 0) {
    articles.push(
      {
        title: "The Architecture of Autonomous Coding Agents",
        snippet: "Exploring decision loops, tool-calling constraints, and contextual state recovery mechanisms in agentic AI frameworks.",
        readTime: "8 min read",
        category: "Agentic Systems",
        icon: Terminal,
        href: "#"
      },
      {
        title: "Understanding Multimodal LLM Inference",
        snippet: "How next-generation models process complex spatial data, diagram projections, and text-based layouts concurrently.",
        readTime: "12 min read",
        category: "Deep Learning",
        icon: Layers,
        href: "#"
      },
      {
        title: "Context Windows and Retrieval-Augmented Generation",
        snippet: "Analyzing retrieval latency, chunking density, and vector score models for extremely large enterprise codebases.",
        readTime: "10 min read",
        category: "Retrieval (RAG)",
        icon: Cpu,
        href: "#"
      }
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 font-sans text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
              <Radio className="size-5 animate-pulse" />
            </span>
            <span className="font-mono text-lg font-bold tracking-wider text-slate-50 uppercase">
              AI Pulse Hub
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-semibold text-slate-300">
            <Link href="#" className="hover:text-teal-400 transition-colors">Research</Link>
            <Link href="#" className="hover:text-teal-400 transition-colors">Logs</Link>
            <Link href="#" className="hover:text-teal-400 transition-colors">Guides</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-20 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-teal-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-400 mb-6">
            <span className="size-1.5 rounded-full bg-teal-400 animate-ping" />
            Active Research Stream
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-slate-100 mb-6">
            Advanced Agentic Workflows & Deep Learning Research
          </h1>
          <p className="text-lg leading-relaxed text-slate-400 max-w-2xl mx-auto mb-10">
            A comprehensive, data-driven log exploring neural architectures, agentic code generation, context scaling, and next-generation reasoning engine models.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href="#latest"
              className="flex h-12 items-center justify-center rounded-lg bg-teal-500 px-6 font-semibold text-slate-950 transition-all hover:bg-teal-400 hover:shadow-[0_0_24px_rgba(20,184,166,0.38)]"
            >
              Explore Research Logs
            </a>
            <a
              href="#"
              className="flex h-12 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 px-6 font-semibold text-slate-200 transition-all hover:bg-slate-900"
            >
              System Architectures
            </a>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main id="latest" className="flex-1 mx-auto max-w-6xl w-full px-6 py-12">
        <h2 className="text-xl font-bold tracking-wider text-slate-200 uppercase mb-8 flex items-center gap-2">
          <span className="h-0.5 w-6 bg-teal-500" />
          Latest Publications
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {articles.map((article) => {
            const Icon = article.icon;
            return (
              <article
                key={article.title}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-6 shadow-sm transition-all duration-300 hover:border-slate-700/60 hover:bg-slate-900/60"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-teal-500/0 via-transparent to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                      {article.category}
                    </span>
                    <span className="text-xs text-slate-500">
                      {article.readTime}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 mb-2 group-hover:text-teal-300 transition-colors">
                    {article.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400 mb-6">
                    {article.snippet}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-teal-400 group-hover:translate-x-1 transition-transform">
                  <Icon className="size-4 shrink-0" />
                  Read full analysis →
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900/60 bg-slate-950 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row text-xs text-slate-500 font-mono">
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
