import Workspace from "./Workspace";
import { loadWorkbenchState, seedTonightPack } from "./actions";
import { listStudioProjectOptions } from "./projectConfig";
import { getPrismaClient } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams
}: {
  searchParams?: Promise<{ project?: string }> | { project?: string }
} = {}) {
  const params = await searchParams;
  const isDefaultFallback = typeof params?.project !== "string";
  
  if (isDefaultFallback) {
    redirect("/projects?fallback=true");
  }

  const projectSlug = params.project!;
  await seedTonightPack(projectSlug);
  const state = await loadWorkbenchState(projectSlug);

  if (!state) return <div>Failed to load workbench.</div>;

  let availableProjects: { slug: string; name: string; nestKind?: string }[] = [];
  try {
    const prisma = getPrismaClient();
    availableProjects = await listStudioProjectOptions(prisma);
  } catch {
    availableProjects = state.projectSlug && state.projectName
      ? [{ slug: state.projectSlug, name: state.projectName }]
      : [];
  }

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
    isDefaultFallback={isDefaultFallback}
  />;
}
