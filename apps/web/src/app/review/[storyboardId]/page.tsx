import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import ScrollExperienceEngine from '@/components/scroll-experience/ScrollExperienceEngine';
import { ScrollExperience, ScrollGroup } from '@/components/scroll-experience/types';

export default async function StoryboardReviewPage(props: { params: Promise<{ storyboardId: string }> }) {
  // Ensure route is protected by standard Beta Auth
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { storyboardId } = await props.params;

  const storyboard = await prisma.studioStoryboard.findUnique({
    where: { id: storyboardId },
    include: {
      frames: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  if (!storyboard) {
    notFound();
  }

  // Fetch interactions
  const dbInteractions = await prisma.scrollInteraction.findMany({
    where: { experienceId: storyboard.id }
  });

  const { transformStoryboardToScrollExperience } = await import('@/components/scroll-experience/utils/transformStoryboardToScrollExperience');

  // We can pass different types via search params later, for now we default to STORYBOARD
  // or maybe infer it from the query params?
  // Let's grab ?type=COMIC or something from search params if it exists.
  // Wait, page component doesn't get searchParams in this snippet easily without changing the signature.
  // We'll just hardcode STORYBOARD for the base route, since mock simulator handles the rest.
  const experience = transformStoryboardToScrollExperience(storyboard, dbInteractions, 'STORYBOARD');

  return (
    <div className="w-full h-[100dvh] bg-black overflow-hidden overscroll-none">
      <ScrollExperienceEngine experience={experience} mode="review" />
    </div>
  );
}
