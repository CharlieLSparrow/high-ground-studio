import Workspace from "./Workspace";
import { loadWorkbenchStateWithScope, seedTonightPack } from "./actions";
import { listStudioProjectOptions } from "./projectConfig";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  ensureKnownLiveNestsForAdmin,
  listVisibleNestsForEmail,
  resolveNestAccess,
} from "@/lib/server/quipsly-core";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams
}: {
  searchParams?: Promise<{ project?: string; scope?: string | string[] }> | { project?: string; scope?: string | string[] }
} = {}) {
  const params = await searchParams;
  const isDefaultFallback = typeof params?.project !== "string";

  if (isDefaultFallback) {
    redirect("/projects?fallback=true");
  }

  const projectSlug = params.project!;
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const isAdminActor =
    process.env.QUIPSLY_OWNER_OVERRIDE === "true" || isUserManagementAdminEmail(actorEmail);

  try {
    await ensureKnownLiveNestsForAdmin({
      actorEmail,
      isAdminActor,
      nestSlug: projectSlug,
    });
  } catch (error) {
    console.warn(`Could not ensure live-work Nests before opening ${projectSlug}.`, error);
  }

  const readAccess = await resolveNestAccess({
    nestSlug: projectSlug,
    email: actorEmail,
    action: "read",
  });
  const canOpenProject = isAdminActor || readAccess.allowed;

  if (!canOpenProject) {
    redirect(`/projects?fallback=true&missing=${encodeURIComponent(projectSlug)}`);
  }

  const writeAccess = await resolveNestAccess({
    nestSlug: projectSlug,
    email: actorEmail,
    action: "write",
  });
  const canWriteProject = isAdminActor || writeAccess.allowed;

  const scopeInput = params?.scope;
  const scopeProjectSlugs = typeof scopeInput === "string"
    ? scopeInput.split(",")
    : Array.isArray(scopeInput)
      ? scopeInput
      : [];

  let state: Awaited<ReturnType<typeof loadWorkbenchStateWithScope>>;
  try {
    if (canWriteProject) {
      await seedTonightPack(projectSlug);
    }
    state = await loadWorkbenchStateWithScope(projectSlug, scopeProjectSlugs);
  } catch (error) {
    console.warn(`Could not open Nest/project ${projectSlug}.`, error);
    redirect(`/projects?fallback=true&missing=${encodeURIComponent(projectSlug)}`);
  }

  if (!state) redirect(`/projects?fallback=true&missing=${encodeURIComponent(projectSlug)}`);

  let availableProjects: { slug: string; name: string; nestKind?: string }[] = [];
  try {
    const prisma = getPrismaClient();

    if (isAdminActor) {
      availableProjects = await listStudioProjectOptions(prisma);
    } else if (actorEmail) {
      availableProjects = (await listVisibleNestsForEmail({ email: actorEmail, prisma })).map((project) => ({
        slug: project.slug,
        name: project.name,
        nestKind: project.nest.kind,
      }));
    }
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
    projectNestKind={state.projectNestKind}
    workflowSystem={state.workflowSystem}
    availableProjects={availableProjects}
    linkedProjects={state.linkedProjects}
    isDefaultFallback={isDefaultFallback}
  />;
}
