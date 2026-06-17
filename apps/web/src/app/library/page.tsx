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
import LibraryClient from "./LibraryClient";

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
              Manage, search, and design shareable graphics from the passages and notes you curated while reading High Ground Odyssey transcripts.
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
          <LibraryClient snippets={snippets} />
        )}
      </PageContainer>
    </main>
  );
}

