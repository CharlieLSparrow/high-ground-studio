import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeAccessEmail, resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

// QuipLore quotes do not yet carry an explicit public-release state. Keep
// metadata generic so crawlers, link unfurlers, and signed-out requests cannot
// disclose private quote text, authors, works, tags, or project identity.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Private quote passport | Quipsly",
    description: "A private, source-aware QuipLore record. Sign in with project access to view it.",
    robots: { index: false, follow: false },
  };
}

export default async function QuotePassportPage(props: Props) {
  const { id } = await props.params;
  const session = await auth();
  const email = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  if (!session?.user || !email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/q/${id}`)}`);
  }

  const prisma = getPrismaClient();
  const quoteLocator = await prisma.quipLoreQuote.findUnique({
    where: { id },
    select: { id: true, project: { select: { id: true, slug: true } } },
  });
  if (!quoteLocator) notFound();

  const access = await resolveStudioProjectAccess({
    projectSlug: quoteLocator.project.slug,
    email,
    action: "read",
    prisma,
  });
  if (!access.allowed || access.projectId !== quoteLocator.project.id) notFound();

  const quote = await prisma.quipLoreQuote.findFirst({
    where: { id, projectId: access.projectId },
    include: {
      author: true,
      work: true,
      tags: true,
      project: true,
    },
  });
  if (!quote) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0E0E0E] p-4 font-sans text-[#EAEAEA]">
      <article className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#333] bg-[#1A1A1A] shadow-2xl" aria-label="Private quote passport">
        <header className="flex items-center justify-between border-b border-[#333] bg-gradient-to-r from-[#111] to-[#1A1A1A] px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-500/50 bg-indigo-500/20" aria-hidden="true">
              <span className="text-xl">📖</span>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#888]">Private QuipLore passport</div>
              <div className="text-sm font-medium text-indigo-400">{quote.project.slug}</div>
            </div>
          </div>
          <div className="font-mono text-xs text-[#666]">ID: {quote.id.slice(-8)}</div>
        </header>

        <section className="space-y-8 p-10">
          <blockquote className="relative font-serif text-2xl italic leading-relaxed text-[#EAEAEA] md:text-3xl">
            <span className="absolute -left-6 -top-4 select-none text-6xl text-[#333]" aria-hidden="true">&ldquo;</span>
            {quote.text}
          </blockquote>
          <div className="flex flex-col gap-1">
            <div className="text-lg font-medium text-white">— {quote.author?.name || "Unknown author"}</div>
            {quote.work?.title ? <div className="text-sm text-[#888]">From <span className="italic">{quote.work.title}</span></div> : null}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#333] bg-[#111] px-8 py-5">
          <div className="flex flex-wrap gap-2">
            {quote.tags.map((tag) => <span key={tag.id} className="rounded-md border border-[#333] bg-[#222] px-2.5 py-1 text-xs font-medium text-[#AAA]">#{tag.name}</span>)}
            {!quote.tags.length ? <span className="text-xs italic text-[#555]">No tags</span> : null}
          </div>
          <div className="text-xs text-[#555]">Extracted {quote.createdAt.toLocaleDateString()}</div>
        </footer>

        <div className="border-t border-[#333] px-8 py-4">
          <Link href="/research" className="text-xs font-black uppercase tracking-wider text-indigo-300 hover:text-indigo-200">Back to private research</Link>
        </div>
      </article>
    </main>
  );
}
