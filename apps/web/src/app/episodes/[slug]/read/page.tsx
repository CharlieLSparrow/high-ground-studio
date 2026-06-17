import InteractiveReaderClient from "./InteractiveReaderClient";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { readHgoPublicEpisodePacket } from "@/lib/hgo/public-episode-store";

function parseInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";
  
  const blocks = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);
    
  return blocks
    .map((block) => {
      // 1. Check for heading: e.g. ## Heading
      const headingMatch = block.match(/^#{2,6}\s+(.+)$/);
      if (headingMatch) {
        const title = parseInlineMarkdown(headingMatch[1]);
        return `<h2>${title}</h2>`;
      }
      
      // 2. Check for blockquote: e.g. > Quote
      if (block.startsWith(">")) {
        const quoteText = parseInlineMarkdown(block.replace(/^>\s*/gm, ""));
        return `<blockquote>${quoteText}</blockquote>`;
      }
      
      // 3. Check for speaker block: e.g. **[Homer’s Preface]** body or **[Speaker]** body
      const speakerMatch = block.match(/^\*\*\[([^\]]+)\]\*\*\s*(.*)$/s);
      if (speakerMatch) {
        const label = speakerMatch[1];
        const body = parseInlineMarkdown(speakerMatch[2].trim());
        return `<p><strong>[${label}]</strong> ${body}</p>`;
      }
      
      const speakerMatch2 = block.match(/^\*\*\[([^\]]+)\]\s*([^*]+)\*\*\s*(.*)$/s);
      if (speakerMatch2) {
        const label = speakerMatch2[1];
        const body = parseInlineMarkdown(`${speakerMatch2[2]}${speakerMatch2[3]}`.trim());
        return `<p><strong>[${label}]</strong> ${body}</p>`;
      }

      // Default paragraph
      return `<p>${parseInlineMarkdown(block)}</p>`;
    })
    .join("");
}

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

  // 2. Fetch transcript from public store (checks database first, then local JSON, then bundled JSON)
  const packet = await readHgoPublicEpisodePacket(slug);

  const episode = await prisma.hgoEpisodePublishCandidate.findFirst({
    where: {
      projectionSlug: slug,
    },
  });

  const episodeTitle = packet?.title || episode?.projectionTitle || slug.replace(/-/g, " ");
  
  // High fidelity default fallback content if packet or database candidate lacks transcript
  let transcriptContent = "";
  if (packet?.essayVersion) {
    transcriptContent = convertMarkdownToHtml(packet.essayVersion);
  } else if (episode?.mdxDraft) {
    const isHtml = /<[a-z][\s\S]*>/i.test(episode.mdxDraft);
    transcriptContent = isHtml ? episode.mdxDraft : convertMarkdownToHtml(episode.mdxDraft);
  } else {
    transcriptContent = `
      <h2>The Opening Thoughts</h2>
      <p>This is where the podcast transcript or paired reading goes. The text is entirely read-only, but because we are using Tiptap, we can layer our custom highlights selection on top to allow Patreon members to save snippets.</p>
      <blockquote>"Nothing I've already built is sacred. No sunk cost fallacy allowed."</blockquote>
      <h2>Diving Into the Strategy</h2>
      <p>When you are building a modern content network, your primary bottleneck is not generating the media; it is capturing the engagement. By allowing users to save their favorite quotes directly to personal collections, you build dynamic relationships with your audience.</p>
      <p>Our collaborative Studio is the command center where we organize everything. And the consumer brands like High Ground Odyssey and QuipLore are the high-ticket front doors.</p>
    `;
  }

  // 3. Retrieve user's previously saved highlights for this episode
  let savedHighlights: Array<{
    id: string;
    highlightedText: string;
    note?: string | null;
    createdAt: string;
  }> = [];
  
  if (userEmail && isPatreonMember) {
    const userRecord = await prisma.user.findFirst({
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
    });
    if (userRecord) {
      const snippets = await prisma.snippet.findMany({
        where: {
          userId: userRecord.id,
          sourceUrl: `/episodes/${slug}/read`,
        },
        select: {
          id: true,
          highlightedText: true,
          note: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      savedHighlights = snippets.map((s) => ({
        id: s.id,
        highlightedText: s.highlightedText,
        note: s.note,
        createdAt: s.createdAt.toISOString(),
      }));
    }
  }

  return (
    <div className="min-h-screen bg-void text-[var(--text-light)] flex flex-col items-center py-20 px-6 relative overflow-hidden">
      {/* Background Cinematic Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[var(--color-flare)]/5 rounded-full blur-[120px] pointer-events-none animate-breathe" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-[var(--color-flora)]/10 rounded-full blur-[120px] pointer-events-none animate-slow-pan" />

      <div className={`${isPatreonMember ? "max-w-6xl" : "max-w-3xl"} w-full relative z-10`}>
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
            savedHighlights={savedHighlights}
          />
        </div>
      </div>
    </div>
  );
}
