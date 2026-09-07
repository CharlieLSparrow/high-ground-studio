import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Folder,
  Images,
  Plus,
  Users,
} from "lucide-react";

import { auth } from "@/auth";
import {
  canAccessPrivateFictionNest,
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import {
  listAccessibleStudioProjectSummariesForEmail,
} from "@/lib/server/studio-project-access";
import { hasPlatformOwnerRole, requireQuipslyAdminActor } from "@/lib/server/user-management";
import { ensureLiveWorkNests } from "@/lib/studio/live-work-nests";
import {
  HGO_PROJECT_SLUG,
  listStudioProjectOptions,
  NEST_KIND_LABELS,
  workflowSystemForNestKind,
  nestKindFromSourceLabel,
  type StudioNestKind,
  type QuipslyWorkflowSystem,
} from "@/lib/studio/project-registry";
import { NestRegistryUnavailableState } from "./NestRegistryUnavailableState";
import { CreateNestForm } from "./CreateNestForm";

export const dynamic = "force-dynamic";


function CollaboratorAvatars({ collaborators }: { collaborators?: { email: string; role: string }[] }) {
  if (!collaborators || collaborators.length === 0) return null;
  const display = collaborators.slice(0, 3);
  const extra = collaborators.length - 3;
  return (
    <div className="flex -space-x-2">
      {display.map((c) => (
        <div
          key={c.email}
          title={`${c.email} (${c.role})`}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#e8dcc4] text-[9px] font-bold text-foreground"
        >
          {c.email.charAt(0).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-background text-[9px] font-bold text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  );
}

type CollaborationRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workflowSystem: QuipslyWorkflowSystem;
  label: string;
  role: string;
  nestKind?: StudioNestKind;
  collaborators?: { email: string; role: string }[];
};


function hasWritingDesk(kind: StudioNestKind | undefined) {
  return ["writing", "study", "research", "fiction", "course", "mixed"].includes(kind ?? "");
}

function ProjectCard({ project }: { project: CollaborationRow }) {
  return (
    <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {project.label}
          </div>
          <CollaboratorAvatars collaborators={project.collaborators} />
        </div>
        <h3 className="font-serif text-xl font-black text-foreground">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {project.description}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href={`/nests/${encodeURIComponent(project.slug)}`}
          className="rounded-full bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-primary-foreground transition hover:-translate-y-0.5"
        >
          Open
        </Link>
        {hasWritingDesk(project.nestKind) ? (
          <Link
            href={`/create?project=${encodeURIComponent(project.slug)}`}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-900 transition hover:-translate-y-0.5 hover:bg-emerald-100"
          >
            Write
          </Link>
        ) : null}
        <Link
          href={`/nests/${encodeURIComponent(project.slug)}/access`}
          className="rounded-full border border-border bg-card px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-[#fff8eb]"
        >
          People
        </Link>

      </div>
    </div>
  );
}



function canManageRole(role: string | undefined) {
  const normalized = String(role || "").toUpperCase();
  return normalized.includes("ADMIN") || normalized.includes("OWNER");
}

async function bootstrapLiveWorkNests() {
  "use server";

  const actor = await requireQuipslyAdminActor();
  const prisma = getPrismaClient();
  const results = await ensureLiveWorkNests({
    prisma,
    ownerEmail: actor.email,
  });

  revalidatePath("/projects");
  for (const result of results) {
    revalidatePath(`/nests/${result.slug}`);
  }

  redirect(`/projects?liveNests=${results.length}`);
}

export default async function ProjectsHub({
  searchParams,
}: {
  searchParams?: Promise<{
    fallback?: string;
    missing?: string;
    nest?: string;
    documentUnavailable?: string;
    liveNests?: string;
    adminAccessDenied?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const isFallback = params?.fallback === "true";
  const missingProjectSlug = typeof params?.missing === "string" ? params.missing : "";
  const unavailableDocumentNest =
    params?.documentUnavailable === "1" && typeof params?.nest === "string"
      ? params.nest
      : "";
  const liveNestsBootstrapped = typeof params?.liveNests === "string" ? params.liveNests : "";
  const adminAccessDenied = params?.adminAccessDenied === "1";

  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  let prisma: ReturnType<typeof getPrismaClient> | null = null;
  let projects: Awaited<ReturnType<typeof listStudioProjectOptions>> = [];
  let projectRegistryUnavailable = false;
  let canOpenPrivateFictionNest = false;
  let sharedProjects: Awaited<ReturnType<typeof listAccessibleStudioProjectSummariesForEmail>> = [];
  let actorHomeNestId = "";
  const projectRoles = new Map<string, string>();
  const canManageLiveNests = hasPlatformOwnerRole(session?.user?.roles);

  try {
    prisma = getPrismaClient();
  } catch (error) {
    projectRegistryUnavailable = true;
    console.error("[projects] Nest registry client could not be initialized.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }

  if (actorEmail && prisma) {
    try {
      const actorHomeNest = await ensureHomeNestForEmail(actorEmail, prisma);
      actorHomeNestId = actorHomeNest.id;
    } catch {
      // The hub should still render even if the personal Home Nest cannot be created yet.
    }
  }

  if (prisma && !projectRegistryUnavailable) {
    try {
      if (actorEmail) {
        const visibleProjects = await listProjectsVisibleToEmail(actorEmail, prisma);
        projects = visibleProjects.map((project) => {
          projectRoles.set(project.slug, project.role);
          return {
            id: project.id,
            slug: project.slug,
            name: project.name,
            description: null,
            documentTitle: null,
            nestKind: nestKindFromSourceLabel(project.sourceLabel),
            updatedAt: project.updatedAt,
          };
        });
      }
    } catch (error) {
      projectRegistryUnavailable = true;
      console.error("[projects] Nest registry ownership read failed.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  if (prisma && !projectRegistryUnavailable) {
    try {
      sharedProjects = await listAccessibleStudioProjectSummariesForEmail(actorEmail, prisma);
    } catch (error) {
      projectRegistryUnavailable = true;
      console.error("[projects] Nest registry collaboration read failed.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  if (!projectRegistryUnavailable) {
    try {
      canOpenPrivateFictionNest = await canAccessPrivateFictionNest(actorEmail);
    } catch {
      canOpenPrivateFictionNest = false;
    }
  } else {
    projects = [];
    sharedProjects = [];
    actorHomeNestId = "";
    projectRoles.clear();
  }

  const ownedProjectIds = new Set(projects.map((project) => project.id));
  const collaborationProjects = sharedProjects.filter((project) => !ownedProjectIds.has(project.id));
  const collaborationRows: CollaborationRow[] = [
    ...projects.map((project) => {
      const workflowSystem = workflowSystemForNestKind(project.nestKind);
      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description ?? null,
        workflowSystem,
        nestKind: project.nestKind,
        label: NEST_KIND_LABELS[project.nestKind],
        role: projectRoles.get(project.slug) ?? "Owner / manager",
        collaborators: project.collaborators,
      };
    }),
    ...collaborationProjects.map((project) => {
      const collaborationKind = nestKindFromSourceLabel(project.sourceLabel);
      const workflowSystem = workflowSystemForNestKind(collaborationKind);
      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        workflowSystem,
        nestKind: collaborationKind,
        label: NEST_KIND_LABELS[collaborationKind],
        role: project.role,
        collaborators: project.collaborators,
      };
    }),
  ];

  const homeNestRow =
    collaborationRows.find(p => p.id === actorHomeNestId)
    ?? collaborationRows.find(p => p.nestKind === 'home' && canManageRole(p.role));
  const myNests = collaborationRows.filter(p => p.id !== homeNestRow?.id && canManageRole(p.role));
  const sharedNests = collaborationRows.filter(p => !canManageRole(p.role));


  return (
    <main className="min-h-full bg-background px-4 py-6 text-foreground md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
                Your workspace
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                Your Nests
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                Keep notes, conversations, sessions, and projects together. Work on your own or with the people you invite.
              </p>
            </div>
            {canManageLiveNests && !projectRegistryUnavailable ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <form action={bootstrapLiveWorkNests}>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                    type="submit"
                  >
                    <Plus size={14} />
                    Bootstrap Live Nests
                  </button>
                </form>
                <Link
                  href={`/create?project=${encodeURIComponent(HGO_PROJECT_SLUG)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                >
                  <BookOpen size={14} />
                  Daily Writing Desk
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        {isFallback && !projectRegistryUnavailable && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <h3 className="font-serif text-lg font-black text-rose-900">Wait, where is my document?</h3>
            <p className="mt-1 text-sm text-rose-800">
              {unavailableDocumentNest
                ? `That document is not available to this account. Your access to the "${unavailableDocumentNest}" Nest is unchanged; open another page below or ask the document owner to share the work intentionally.`
                : missingProjectSlug
                ? `Quipsly could not find a Nest named "${missingProjectSlug}". Choose an existing Nest below, or create a new private one.`
                : "Quipsly no longer drops people into a shared default manuscript. Choose your Nest below, or create a new private one."}
            </p>
          </div>
        )}

        {liveNestsBootstrapped && !projectRegistryUnavailable ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
            <h3 className="font-serif text-lg font-black">Live Nests are ready</h3>
            <p className="mt-1 text-sm leading-6">
              Quipsly checked or created {liveNestsBootstrapped} real-work Nests and granted owner access to the admin actor.
            </p>
          </div>
        ) : null}

        {adminAccessDenied && !projectRegistryUnavailable ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <h3 className="font-serif text-lg font-black">Admin action blocked</h3>
            <p className="mt-1 text-sm leading-6">
              This action is limited to configured Quipsly admins. You can still open any Nest you have been invited to.
            </p>
          </div>
        ) : null}

        {projectRegistryUnavailable ? (
          <NestRegistryUnavailableState />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            {homeNestRow && (
              <section>
                <h2 className="mb-4 flex items-center gap-3 font-serif text-2xl font-black text-foreground">
                  <Images size={28} className="text-emerald-600" />
                  Personal Nest
                </h2>
                <div className="rounded-3xl border-2 border-emerald-100 bg-emerald-50/50 p-2 shadow-sm">
                  <ProjectCard project={homeNestRow} />
                  <p className="mt-3 px-3 text-xs font-bold text-emerald-800">
                    A place for your notes, recordings, and ideas.
                  </p>
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-4 font-serif text-2xl font-black text-foreground">My Nests</h2>
              {myNests.length > 0 || canOpenPrivateFictionNest ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {canOpenPrivateFictionNest && !myNests.some((p) => p.slug === PRIVATE_FICTION_PROJECT_SLUG) && (
                    <Link
                      href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`}
                      className="group flex flex-col justify-between rounded-3xl border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-900">
                            Private fiction
                          </div>
                        </div>
                        <h3 className="font-serif text-xl font-black leading-tight text-fuchsia-950">
                          My Heart Is a Junkyard Starship
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-fuchsia-900/80">
                          Private comic packet, story bible, and scroll preview.
                        </p>
                      </div>
                      <div className="mt-6 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-fuchsia-950 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:-translate-y-0.5">
                          Open Packet
                        </span>
                      </div>
                    </Link>
                  )}
                  {myNests.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm leading-6 text-muted-foreground">
                  <Folder size={32} className="mb-4 text-[#c8a66b]" />
                  <p>You have not created any Nests yet.<br />Create one for your next project.</p>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 font-serif text-2xl font-black text-foreground">Shared with me</h2>
              {sharedNests.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {sharedNests.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm leading-6 text-muted-foreground">
                  <Users size={32} className="mb-4 text-[#c8a66b]" />
                  <p>No shared Nests yet.<br />When collaborators invite you to their Nests, they will appear here.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6 lg:sticky lg:top-6 lg:self-start">
            <h2 className="font-serif text-2xl font-black">Create a Nest</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Give your next project a home. A name is all you need.
            </p>

            <CreateNestForm clientRequestId={randomUUID()} />
          </aside>
          </div>
        )}
      </div>
    </main>
  );
}
