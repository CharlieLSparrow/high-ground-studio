import { getPrismaClient } from "@/lib/prisma";
import { SidebarLayout } from "@/components/SidebarLayout";
import { fetchStoryboardByProjectId } from "./actions";
import { StoryboardHeader } from "./components/StoryboardHeader";
import { StoryboardCanvas } from "./components/StoryboardCanvas";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function StoryboardSandboxPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const projectId = searchParams.project;

  if (!projectId) {
    redirect("/projects");
  }

  const prisma = getPrismaClient();

  // Validate the project exists and the user has access
  // In a real app we'd verify organization/user permissions here
  const project = await prisma.studioProject.findFirst({
    where: { slug: projectId },
  });

  if (!project) {
    return (
      <SidebarLayout>
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">Project Not Found</h2>
            <p className="text-zinc-500">The project you are looking for does not exist.</p>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  // Fetch or auto-create the storyboard for this project
  const storyboard = await fetchStoryboardByProjectId(project.id);
  
  if (!storyboard) {
    return null;
  }

  // Clean up types for the client component
  const cleanFrames = storyboard.frames.map((f) => ({
    id: f.id,
    frameNumber: f.frameNumber,
    sortOrder: f.sortOrder,
    imageUrl: (f as any).imageUrl || null,
    action: f.action,
    dialogue: f.dialogue,
    cameraInfo: f.cameraInfo,
    shotSize: f.shotSize,
    lens: f.lens,
    estimatedDuration: f.estimatedDuration ? Number(f.estimatedDuration) : null,
    vfxNotes: f.vfxNotes,
  }));

  return (
    <SidebarLayout>
      <div className="flex flex-col h-[100dvh] w-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
        <StoryboardHeader 
          storyboardTitle={storyboard.title} 
          projectSlug={project.slug} 
        />
        
        <StoryboardCanvas 
          storyboardId={storyboard.id} 
          initialFrames={cleanFrames} 
        />
      </div>
    </SidebarLayout>
  );
}
