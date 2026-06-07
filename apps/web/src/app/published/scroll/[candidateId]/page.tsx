import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ScrollExperienceEngine from '@/components/scroll-experience/ScrollExperienceEngine';
import { ScrollExperience, ScrollGroup, ExperienceType } from '@/components/scroll-experience/types';

export default async function PublishedScrollExperiencePage(props: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await props.params;

  const candidate = await prisma.hgoEpisodePublishCandidate.findUnique({
    where: { id: candidateId }
  });

  // Ensure we only serve publicly published packets, not private drafts
  if (!candidate || candidate.candidateStatus !== 'published') {
    notFound();
  }

  // The packet adheres to the new PublishPacketKind foundation from packages/quipsly-domain/src/publishing.ts
  const packet = (candidate.packetJson || candidate.draftPacketJson) as any;
  if (!packet) {
    notFound();
  }

  // Map PublishPacketKind to our internal ExperienceType rendering engine
  let expType: ExperienceType = 'STORYBOARD';
  if (packet.kind === 'gallery-proof') expType = 'PHOTOGRAPHY';
  else if (packet.kind === 'course-export') expType = 'COURSE';
  else if (packet.kind === 'quote-feed') expType = 'LORELIST';
  else if (packet.kind === 'story-scroll') expType = 'COMIC';

  const mainGroup: ScrollGroup = {
    id: `group-${candidate.id}`,
    experienceId: candidate.id,
    title: packet.title || 'Untitled',
    order: 0,
    layoutType: 'HORIZONTAL_CAROUSEL',
    panels: (packet.media || []).map((m: any, index: number) => ({
      id: m.id || `panel-${index}`,
      groupId: `group-${candidate.id}`,
      type: 'MEDIA',
      sourceId: m.id || `source-${index}`,
      order: index,
      content: {
        imageUrl: m.kind === 'image' ? m.url : undefined,
        videoUrl: m.kind === 'video' ? m.url : undefined,
        text: m.kind === 'document' ? m.label : undefined,
        caption: m.label || undefined,
      },
      interactions: [], // Public packets might restrict interactive comments or load them dynamically
    })),
  };

  const experience: ScrollExperience = {
    id: candidate.id,
    projectId: packet.source?.projectSlug || 'unknown',
    title: packet.title || 'Untitled',
    description: packet.summary || undefined,
    type: expType,
    settings: {
      theme: 'dark',
      enableComments: false, // Public mode
      enableSelections: false,
      requireCompletion: false,
    },
    groups: [mainGroup],
  };

  return (
    <div className="w-full h-[100dvh] bg-black overflow-hidden overscroll-none">
      <ScrollExperienceEngine experience={experience} mode="view" />
    </div>
  );
}
