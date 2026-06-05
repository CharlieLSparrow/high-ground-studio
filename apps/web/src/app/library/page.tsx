import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildSignInHref } from "@/lib/content-access";
import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";
import BackLink from "@/components/ui/BackLink";
import { deleteSnippetAction } from "./actions";

const LIBRARY_TIME_ZONE = "America/Denver";

function formatLibraryDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: LIBRARY_TIME_ZONE,
  }).format(value);
}

export default async function LibraryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(buildSignInHref("/library"));
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    include: {
      snippets: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!user) {
    redirect("/");
  }

  const snippets = user.snippets;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)] pb-20 pt-24">
      <PageContainer>
        <div className="mb-6">
          <BackLink href="/dashboard">
            ← Back to Dashboard
          </BackLink>
        </div>

        <GlassPanel className="p-6 text-[var(--text-light)]">
          <div className="mb-4">
            <PageEyebrow>Study Library</PageEyebrow>
            <h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] leading-[0.98] tracking-[-0.04em] text-[var(--text-light)]">
              Your Saved Highlights
            </h1>
            <p className="mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Manage and review the passages and notes you curated while reading High Ground Odyssey transcripts in the Interactive Reader.
            </p>
          </div>
        </GlassPanel>

        {snippets.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-white/4 px-5 py-12 text-center text-[0.98rem] leading-7 text-[rgba(245,239,230,0.82)]">
            <p className="mb-4">No highlights saved yet.</p>
            <Link
              href="/"
              className="inline-flex rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/30 hover:text-[var(--accent)]"
            >
              Explore Episodes
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {snippets.map((snippet) => (
              <GlassPanel
                key={snippet.id}
                className="flex flex-col justify-between p-6 text-[var(--text-light)]"
              >
                <div>
                  <blockquote className="border-l-2 border-amber-400 pl-4 text-sm italic text-zinc-200">
                    "{snippet.highlightedText}"
                  </blockquote>
                  {snippet.note && (
                    <div className="mt-3 text-xs text-zinc-400 bg-black/20 px-3 py-2 rounded-lg">
                      <strong>Note:</strong> {snippet.note}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-4 text-xs text-zinc-400">
                  <div className="space-y-1">
                    <div>
                      Saved from{" "}
                      {snippet.sourceUrl ? (
                        <Link
                          href={snippet.sourceUrl}
                          className="font-semibold text-amber-400 hover:underline"
                        >
                          {snippet.sourceTitle || "Episode"}
                        </Link>
                      ) : (
                        <span className="font-semibold text-zinc-300">
                          {snippet.sourceTitle || "Episode"}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-zinc-500">
                      {formatLibraryDate(snippet.createdAt)}
                    </div>
                  </div>

                  <form action={deleteSnippetAction}>
                    <input type="hidden" name="snippetId" value={snippet.id} />
                    <button
                      type="submit"
                      className="inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-red-200 transition hover:bg-red-500/25"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </PageContainer>
    </main>
  );
}

