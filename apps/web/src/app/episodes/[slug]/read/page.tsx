import InteractiveReaderClient from "./InteractiveReaderClient";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default async function InteractiveReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  
  const session = await auth();
  
  // 1. Resolve member/patreon status from the database
  let isPatreonMember = false;
  let userEmail = session?.user?.email?.toLowerCase() || null;
  
  if (userEmail) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: userEmail },
          {
            aliases: {
              some: {
                email: userEmail,
              },
            },
          },
        ],
      },
      include: {
        memberships: {
          include: {
            plan: true,
          },
        },
        roles: true,
      },
    });

    const hasActivePatreon = user?.memberships.some(
      (m) => m.status === "ACTIVE"
    );
    const isStaff = user?.roles.some((r) =>
      ["OWNER", "COACH", "TEAM_SCHEDULER"].includes(r.role)
    );
    
    isPatreonMember = Boolean(hasActivePatreon || isStaff);
  }

  // Developer testing override via query parameters in development mode
  const devMode = process.env.NODE_ENV === "development";
  const simulateNonMember = resolvedSearchParams.preview_as === "non-member";
  const simulateMember = resolvedSearchParams.preview_as === "member";
  
  if (devMode) {
    if (simulateNonMember) {
      isPatreonMember = false;
    } else if (simulateMember) {
      isPatreonMember = true;
    }
  }

  // 2. Fetch transcript from Prisma
  const episode = await prisma.hgoEpisodePublishCandidate.findFirst({
    where: {
      projectionSlug: slug,
    },
  });

  const episodeTitle = episode?.projectionTitle || slug.replace(/-/g, " ");
  
  // High fidelity default fallback content if database candidate lacks transcript or does not exist
  const transcriptContent = episode?.mdxDraft || `
    <h2>The Opening Thoughts</h2>
    <p>This is where the podcast transcript or paired reading goes. The text is entirely read-only, but because we are using Tiptap, we can layer our custom highlights selection on top to allow Patreon members to save snippets.</p>
    <blockquote>"Nothing I've already built is sacred. No sunk cost fallacy allowed."</blockquote>
    <h2>Diving Into the Strategy</h2>
    <p>When you are building a modern content network, your primary bottleneck is not generating the media; it is capturing the engagement. By allowing users to save their favorite quotes directly to personal collections, you build dynamic relationships with your audience.</p>
    <p>Our collaborative Studio is the command center where we organize everything. And the consumer brands like High Ground Odyssey and QuipLore are the high-ticket front doors.</p>
  `;

  return (
    <div className="min-h-screen bg-void text-[var(--text-light)] flex flex-col items-center py-20 px-6 relative overflow-hidden">
      {/* Background Cinematic Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--color-flare)]/5 rounded-full blur-[120px] pointer-events-none animate-breathe" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-[var(--color-flora)]/10 rounded-full blur-[120px] pointer-events-none animate-slow-pan" />

      <div className="max-w-3xl w-full relative z-10">
        {/* Back Navigation & Breadcrumb */}
        <div className="flex justify-between items-center mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-[14px] font-bold"
          >
            <ArrowLeft size={16} />
            <span>Back to Odyssey Feed</span>
          </Link>
          
          {/* Dev helper switch visible only in development */}
          {devMode && (
            <div className="flex items-center gap-2 border border-yellow-500/20 bg-yellow-500/5 px-3 py-1.5 rounded-xl text-[12px]">
              <span className="text-yellow-500 font-bold">Dev Tool:</span>
              <Link
                href={`/episodes/${slug}/read?preview_as=member`}
                className={`px-2 py-0.5 rounded transition-all ${
                  isPatreonMember && !simulateNonMember
                    ? "bg-yellow-500 text-void font-bold"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Member
              </Link>
              <Link
                href={`/episodes/${slug}/read?preview_as=non-member`}
                className={`px-2 py-0.5 rounded transition-all ${
                  !isPatreonMember || simulateNonMember
                    ? "bg-yellow-500 text-void font-bold"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Gated
              </Link>
            </div>
          )}
        </div>

        <div className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.25em] text-[var(--color-flare)] flex items-center gap-2">
          <Sparkles size={14} className="animate-spin" />
          <span>Interactive Reader</span>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-black mb-8 text-[var(--color-subject)] tracking-tight capitalize leading-tight">
          {episodeTitle}
        </h1>
        
        <div className="p-8 md:p-12 border border-white/10 bg-white/5 rounded-3xl shadow-[var(--shadow-glass)] backdrop-blur-md">
          <InteractiveReaderClient
            content={transcriptContent}
            isPatreonMember={isPatreonMember}
            episodeSlug={slug}
          />
        </div>
      </div>
    </div>
  );
}
