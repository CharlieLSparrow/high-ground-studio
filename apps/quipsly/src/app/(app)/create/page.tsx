import Workspace from "./Workspace";
import { loadWorkbenchStateWithScope, seedTonightPack } from "./actions";
import { DEV_PROJECT_SLUG, listStudioProjectOptions } from "./projectConfig";
import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  ensureKnownLiveNestsForAdmin,
  listVisibleNestsForEmail,
  resolveNestAccess,
} from "@/lib/server/quipsly-core";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveInitialFocusBlockId } from "./block-focus";

export const dynamic = "force-dynamic";

function projectFallbackUrl({
  projectSlug,
  requestedDocumentId,
}: {
  projectSlug: string;
  requestedDocumentId?: string;
}) {
  const query = new URLSearchParams({ fallback: "true" });
  if (requestedDocumentId) {
    query.set("documentUnavailable", "1");
    query.set("nest", projectSlug);
  } else {
    query.set("missing", projectSlug);
  }
  return `/projects?${query.toString()}`;
}

function notebookSectionLabelFromSource(sourceLabel?: string | null, title?: string | null) {
  const normalizedSource = String(sourceLabel ?? "").toLowerCase();
  const normalizedTitle = String(title ?? "").toLowerCase();

  if (normalizedSource.includes("study") || normalizedSource.includes("source") || normalizedSource.includes("research")) {
    return "Sources and research";
  }
  if (normalizedSource.includes("note")) return "Notes";
  if (normalizedSource.includes("draft") || normalizedSource.includes("article") || normalizedSource.includes("outline")) {
    return "Drafts";
  }
  if (normalizedTitle.includes("source notes") || normalizedTitle.includes("research")) return "Sources and research";
  return "Manuscript pages";
}

export default async function CreatePage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; document?: string; block?: string; scope?: string | string[] }>
}) {
  const params = await searchParams;
  const isDefaultFallback = typeof params?.project !== "string";

  if (isDefaultFallback) {
    redirect("/projects?fallback=true");
  }

  const projectSlug = params.project!;
  const requestedDocumentId =
    typeof params?.document === "string" ? params.document : undefined;
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const isAdminActor = isUserManagementAdminEmail(actorEmail);

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
    if (canWriteProject && projectSlug === DEV_PROJECT_SLUG) {
      const seedResult = await seedTonightPack(projectSlug);
      if (!seedResult.ok) {
        console.warn(`Could not seed ${projectSlug}: ${seedResult.error}`);
      }
    }
    state = await loadWorkbenchStateWithScope(
      projectSlug,
      scopeProjectSlugs,
      requestedDocumentId,
    );
  } catch (error) {
    console.warn(`Could not open Nest/project ${projectSlug}.`, error);
    redirect(projectFallbackUrl({ projectSlug, requestedDocumentId }));
  }

  if (!state) {
    redirect(projectFallbackUrl({ projectSlug, requestedDocumentId }));
  }

  if (state.persistenceMode === "unavailable") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[#fdfaf6] px-4 py-10 text-[#3d3122] md:px-8" aria-labelledby="writing-unavailable-title">
        <section className="mx-auto max-w-2xl rounded-3xl border border-rose-300 bg-white p-6 shadow-sm md:p-10" role="alert">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-rose-700">Canonical database unavailable</div>
          <h1 id="writing-unavailable-title" className="mt-3 text-3xl font-bold font-serif text-[#342618]">
            Your writing was not loaded
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#6b5b45]">
            Quipsly could not open the persisted document for <strong>{state.projectName}</strong>. No starter manuscript, episode text, or editable fallback has been substituted, because it could be mistaken for saved work.
          </p>
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            <strong>No document is open.</strong> Typing is disabled, nothing on this screen is saved locally, and this outage view is not evidence that the Nest is empty.
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/create?project=${encodeURIComponent(projectSlug)}`}
              className="rounded-full border border-[#3d3122] bg-[#3d3122] px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-[#59442d]"
            >
              Retry persisted document
            </Link>
            <Link
              href="/projects"
              className="rounded-full border border-[#d9c7a5] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#5e4b33] hover:bg-[#f8f3e6]"
            >
              Back to Nests
            </Link>
          </div>
        </section>
      </main>
    );
  }

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

  const activeProjectDocument = state.projectDocuments?.find((document) => document.id === state.documentId) ?? null;
  const notebookSectionLabel = notebookSectionLabelFromSource(
    activeProjectDocument?.sourceLabel,
    state.documentTitle,
  );
  const initialFocusBlockId = resolveInitialFocusBlockId(state.blocks, params?.block);

  return <Workspace
    initialBlocks={state.blocks}
    initialViews={state.views}
    projectTags={state.projectTags}
    initialDocumentTags={state.documentTags}
    projectId={state.projectId}
    projectSlug={state.projectSlug}
    projectName={state.projectName}
    documentId={state.documentId}
    documentTitle={state.documentTitle}
    documentUpdatedAt={state.documentUpdatedAt}
    documentTagRevision={state.documentTagRevision}
    notebookSectionLabel={notebookSectionLabel}
    persistenceMode={state.persistenceMode}
    projectNestKind={state.projectNestKind}
    workflowSystem={state.workflowSystem}
    projectDocuments={state.projectDocuments}
    availableProjects={availableProjects}
    linkedProjects={state.linkedProjects}
    isDefaultFallback={isDefaultFallback}
    initialFocusBlockId={initialFocusBlockId}
  />;
}
