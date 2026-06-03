import Workspace from "./Workspace";
import { loadWorkbenchState, seedTonightPack } from "./actions";
import { DEFAULT_PROJECT_SLUG } from "./projectConfig";
import { getPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams
}: {
  searchParams?: Promise<{ project?: string }> | { project?: string }
} = {}) {
  const params = await searchParams;
  const projectSlug = typeof params?.project === "string" ? params.project : DEFAULT_PROJECT_SLUG;
  await seedTonightPack(projectSlug);
  const state = await loadWorkbenchState(projectSlug);

  if (!state) return <div>Failed to load workbench.</div>;

  const prisma = getPrismaClient();
  const availableProjects = await prisma.studioProject.findMany({
    select: { slug: true, name: true },
    orderBy: { updatedAt: "desc" }
  });

  return <Workspace 
    initialBlocks={state.blocks} 
    initialViews={state.views}
    projectId={state.projectId} 
    projectSlug={state.projectSlug}
    projectName={state.projectName}
    documentId={state.documentId} 
    documentTitle={state.documentTitle}
    persistenceMode={state.persistenceMode}
    availableProjects={availableProjects}
  />;
}
