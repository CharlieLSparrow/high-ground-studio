import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  Folder,
  GraduationCap,
  Images,
  MessageCircle,
  PackageCheck,
  Plus,
  Video,
  Users,
} from "lucide-react";
import {
  getOutputFamilyLabel,
  listOutputsForNestKind,
} from "@high-ground/quipsly-domain/output-catalog";

import { auth } from "@/auth";
import {
  canAccessPrivateFictionNest,
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { createNestWithOwner } from "@/lib/server/quipsly-core";
import {
  listAccessibleStudioProjectSummariesForEmail,
  normalizeAccessEmail,
} from "@/lib/server/studio-project-access";
import { isUserManagementAdminEmail, requireQuipslyAdminActor } from "@/lib/server/user-management";
import { ensureLiveWorkNests } from "@/lib/studio/live-work-nests";
import {
  HGO_PROJECT_SLUG,
  listStudioProjectOptions,
  NEST_KIND_LABELS,
  WORKFLOW_SYSTEM_DESCRIPTIONS,
  WORKFLOW_SYSTEM_LABELS,
  workflowSystemForNestKind,
  normalizeNestKind,
  nestKindFromSourceLabel,
  type StudioNestKind,
  type QuipslyWorkflowSystem,
} from "@/lib/studio/project-registry";

export const dynamic = "force-dynamic";

const nestTemplates: Array<{
  value: StudioNestKind;
  label: string;
  description: string;
  starterTitle: string;
}> = [
  {
    value: "writing",
    label: "Original content document",
    description: "Books, articles, talks, scripts, and episode manuscripts you are actively authoring.",
    starterTitle: "Welcome to your Writing Nest",
  },
  {
    value: "study",
    label: "Study document",
    description: "Imported books, course pages, research sources, highlights, notes, and analysis layered over source text.",
    starterTitle: "Study Document: Source Notes and Questions",
  },
  {
    value: "production",
    label: "Media production",
    description: "Audio, video, clips, transcripts, publish packets, and episode production rooms.",
    starterTitle: "Production Nest: Episode Control Room",
  },
  {
    value: "research",
    label: "Research library",
    description: "A source-first Nest for Quipslys to organize references, examples, quotes, and packets.",
    starterTitle: "Research Library: Examples, Sources, and Receipts",
  },
  {
    value: "fiction",
    label: "Fiction world",
    description: "Characters, places, scenes, story maps, romance chaos, and continuity notes.",
    starterTitle: "Story Bible: World, Characters, and Scenes",
  },
  {
    value: "course",
    label: "Course / lesson package",
    description: "SCORM-ready lessons, quizzes, flashcards, and mobile-friendly learning flows.",
    starterTitle: "Course Source: Lessons, Checks, and Learner Flow",
  },
  {
    value: "gallery",
    label: "Photo client gallery",
    description: "Photo groups, comments, selects, client review, and publishable galleries.",
    starterTitle: "Gallery Review: Client Selection Notes",
  },
  {
    value: "mixed",
    label: "Mixed media lab",
    description: "A flexible sandbox when you are not ready to choose one shape yet.",
    starterTitle: "Quipsly Mixed Nest: Start Anywhere",
  },
];

const WORKFLOW_SYSTEM_ORDER: QuipslyWorkflowSystem[] = [
  "data-ingestion",
  "knowledge-processing",
  "content-creation",
  "content-publishing",
];

type CollaborationRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workflowSystem: QuipslyWorkflowSystem;
  label: string;
  role: string;
  nestKind?: StudioNestKind;
};

function workflowChipColor(system: QuipslyWorkflowSystem) {
  if (system === "data-ingestion") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (system === "knowledge-processing") return "border-purple-200 bg-purple-50 text-purple-900";
  if (system === "content-creation") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function iconForNestKind(kind: StudioNestKind) {
  if (kind === "home") return Images;
  if (kind === "study" || kind === "research") return GraduationCap;
  if (kind === "production") return Video;
  if (kind === "gallery") return Images;
  if (kind === "course") return BookOpen;
  if (kind === "fiction") return FileText;
  return Folder;
}

function colorForNestKind(kind: StudioNestKind) {
  if (kind === "home") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (kind === "study" || kind === "research") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (kind === "production") return "border-rose-200 bg-rose-50 text-rose-900";
  if (kind === "gallery") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (kind === "course") return "border-violet-200 bg-violet-50 text-violet-900";
  if (kind === "fiction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900";
  if (kind === "mixed") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-[#eadfca] bg-[#fffaf3] text-[#3d3122]";
}

function canManageRole(role: string | undefined) {
  const normalized = String(role || "").toUpperCase();
  return normalized.includes("ADMIN") || normalized.includes("OWNER");
}

async function createNest(formData: FormData) {
  "use server";

  const name = String(formData.get("name") || "").trim();
  const template = String(formData.get("template") || "writing");
  const documentTitle = String(formData.get("documentTitle") || "").trim();
  if (!name) return;

  const prisma = getPrismaClient();
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  if (!actorEmail) {
    redirect("/api/auth/signin?callbackUrl=/projects");
  }

  const nestKind = normalizeNestKind(template);
  const selectedTemplate = nestTemplates.find((item) => item.value === nestKind);
  const { nest } = await createNestWithOwner({
    prisma,
    name,
    nestKind,
    documentTitle: documentTitle || selectedTemplate?.starterTitle || undefined,
    ownerEmail: actorEmail,
  });

  revalidatePath("/projects");
  redirect(`/nests/${encodeURIComponent(nest.slug)}`);
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
  searchParams?: Promise<{ fallback?: string; missing?: string; liveNests?: string; adminAccessDenied?: string }>
    | { fallback?: string; missing?: string; liveNests?: string; adminAccessDenied?: string };
} = {}) {
  const params = await searchParams;
  const isFallback = params?.fallback === "true";
  const missingProjectSlug = typeof params?.missing === "string" ? params.missing : "";
  const liveNestsBootstrapped = typeof params?.liveNests === "string" ? params.liveNests : "";
  const adminAccessDenied = params?.adminAccessDenied === "1";

  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;
  const prisma = getPrismaClient();
  let projects: Awaited<ReturnType<typeof listStudioProjectOptions>> = [];
  let projectLoadError = "";
  let canOpenPrivateFictionNest = false;
  let sharedProjects: Awaited<ReturnType<typeof listAccessibleStudioProjectSummariesForEmail>> = [];
  const projectRoles = new Map<string, string>();
  const canManageLiveNests =
    process.env.QUIPSLY_OWNER_OVERRIDE === "true" || isUserManagementAdminEmail(actorEmail);

  if (actorEmail) {
    try {
      await ensureHomeNestForEmail(actorEmail, prisma);
    } catch {
      // The hub should still render even if the personal Home Nest cannot be created yet.
    }
  }

  try {
    if (canManageLiveNests) {
      projects = await listStudioProjectOptions(prisma);
      for (const project of projects) projectRoles.set(project.slug, "Admin");
    } else if (actorEmail) {
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
    projectLoadError = error instanceof Error ? error.message : "Could not reach the project registry.";
  }

  try {
    canOpenPrivateFictionNest = await canAccessPrivateFictionNest(actorEmail);
  } catch {
    canOpenPrivateFictionNest = false;
  }

  try {
    sharedProjects = await listAccessibleStudioProjectSummariesForEmail(actorEmail, prisma);
  } catch {
    sharedProjects = [];
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
      };
    }),
  ];

  const workflowSummary = WORKFLOW_SYSTEM_ORDER.map((system) => ({
    system,
    count: collaborationRows.filter((project) => project.workflowSystem === system).length,
  }));
  const firstAccessibleNest = collaborationRows[0];
  const firstAccessibleNestCanManage = canManageRole(firstAccessibleNest?.role);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-[#e8dcc4] bg-white/90 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                Quipsly Nest System
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                Nests hold the work. Documents hold the text.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                A Nest is the project container: one book, course, client gallery, research library, podcast season, or fiction world.
                Inside it, Quipsly can keep writing documents, study documents, media, publishing packets, and assistant context connected without turning them into five disconnected tools.
              </p>
            </div>
            {canManageLiveNests ? (
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
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffdf9] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
                >
                  <BookOpen size={14} />
                  Open HGO Manuscript
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        {isFallback && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <h3 className="font-serif text-lg font-black text-rose-900">Wait, where is my document?</h3>
            <p className="mt-1 text-sm text-rose-800">
              {missingProjectSlug
                ? `Quipsly could not find a Nest named "${missingProjectSlug}". Choose an existing Nest below, or create a new private one.`
                : "Quipsly no longer drops people into a shared default manuscript. Choose your Nest below, or create a new private one."}
            </p>
          </div>
        )}

        {liveNestsBootstrapped ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
            <h3 className="font-serif text-lg font-black">Live Nests are ready</h3>
            <p className="mt-1 text-sm leading-6">
              Quipsly checked or created {liveNestsBootstrapped} real-work Nests and granted owner access to the admin actor.
            </p>
          </div>
        ) : null}

        {adminAccessDenied ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
            <h3 className="font-serif text-lg font-black">Admin action blocked</h3>
            <p className="mt-1 text-sm leading-6">
              This action is limited to configured Quipsly admins. You can still open any Nest you have been invited to.
            </p>
          </div>
        ) : null}

        {projectLoadError ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h3 className="font-serif text-lg font-black text-amber-950">Nest registry is temporarily unavailable</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              The project database could not be reached, so Quipsly is showing the beta onboarding shell instead of crashing. Existing Nests and new Nest creation will come back when the database connection is healthy.
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
              Diagnostic: {projectLoadError.slice(0, 160)}
            </p>
          </div>
        ) : null}

        <section className="mb-6 rounded-3xl border border-[#e8dcc4] bg-[#fffdf9] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                Beta tester happy path
              </div>
              <h2 className="mt-2 font-serif text-3xl font-black text-[#3d3122]">
                Start here. Open your Nest, then open the document.
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b5b45]">
                If someone invited you, your assigned Nest should appear on this page after sign-in. A Nest is the workspace; the document is where the writing, studying, tags, and Quipsly assistant context live.
              </p>
            </div>
            {firstAccessibleNest ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/nests/${encodeURIComponent(firstAccessibleNest.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:-translate-y-0.5"
                >
                  <ArrowRight size={14} />
                  Open assigned Nest
                </Link>
                <Link
                  href={`/create?project=${encodeURIComponent(firstAccessibleNest.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
                >
                  <BookOpen size={14} />
                  Open document
                </Link>
                <Link
                  href={`/nests/${encodeURIComponent(firstAccessibleNest.slug)}/access`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffaf3] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
                >
                  <Users size={14} />
                  {firstAccessibleNestCanManage ? "Invite collaborator" : "View access"}
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] p-4 text-sm leading-6 text-[#6b5b45] lg:max-w-sm">
                No Nests are assigned yet. Create your first Nest below, or ask the owner to invite the same email you used to sign in.
              </div>
            )}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ["1", "Open assigned Nest", "Click the Nest card or the button above."],
              ["2", "Open document", "Use the living document for writing, study, and tags."],
              ["3", "Open chat", "Use the Nest Chat button in the bottom-right corner."],
              ["4", "Invite if allowed", "Owners can invite collaborators from the access page."],
            ].map(([step, title, body]) => (
              <div key={step} className="rounded-2xl border border-[#eadfca] bg-white p-4">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3d3122] text-xs font-black text-[#fffaf3]">
                  {step}
                </div>
                <h3 className="font-serif text-lg font-black text-[#3d3122]">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-[#7d6a50]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "1. Pick a Nest",
              body: "A Nest is the customer-safe project boundary for documents, media, assistant memory, and publishing packets.",
            },
            {
              title: "2. Write or study",
              body: "Writing documents are for original work. Study documents preserve sources while you tag, annotate, and learn on top.",
            },
            {
              title: "3. Publish from packets",
              body: "Outputs like HGO pages, RSS, clips, courses, quote feeds, and galleries should come from public-safe packets, not raw private notes.",
            },
            {
              title: "4. Learn by editing",
              body: "New Nests open with a real editable welcome document, so beta users learn the workflow inside the same editor they will use.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#eadfca] bg-white/85 p-4 shadow-sm">
              <h3 className="font-serif text-lg font-black text-[#3d3122]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#6b5b45]">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="mb-6 rounded-3xl border border-[#e8dcc4] bg-white/90 p-5 shadow-sm md:p-6">
          <h2 className="mb-3 font-serif text-2xl font-black">Workflow systems</h2>
          <p className="mb-4 text-sm leading-6 text-[#6b5b45]">
            Every Nest is tagged with a production lane for visibility. This is a transparent routing signal, not a requirement or quality gate.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workflowSummary.map(({ system, count }) => (
              <div
                key={system}
                className={`rounded-2xl border px-4 py-3 ${workflowChipColor(system)}`}
              >
                <h3 className="text-sm font-black uppercase tracking-[0.14em]">{WORKFLOW_SYSTEM_LABELS[system]}</h3>
                <p className="mt-2 text-xs leading-5 text-[#5f4f38]">
                  {WORKFLOW_SYSTEM_DESCRIPTIONS[system]}
                </p>
                <div className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] opacity-80">
                  {count} active Nests
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-[#e8dcc4] bg-white/90 p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-black">Collaboration</h2>
              <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                Invite collaborators by email, even before they have accounts. Shared Nests appear here after sign-in.
              </p>
            </div>
            <div className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              {collaborationRows.length} access records
            </div>
          </div>

          {collaborationRows.length > 0 || canOpenPrivateFictionNest ? (
            <div className="grid gap-3 md:grid-cols-2">
              {canOpenPrivateFictionNest && !collaborationRows.some((project) => project.slug === PRIVATE_FICTION_PROJECT_SLUG) ? (
                <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-900">Private fiction</div>
                  <h3 className="mt-2 font-serif text-xl font-black text-fuchsia-950">My Heart Is a Junkyard Starship</h3>
                  <p className="mt-2 text-sm leading-6 text-fuchsia-900/80">
                    Private comic packet and storyboard Nest.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`}
                      className="rounded-full bg-fuchsia-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white"
                    >
                      Open packet
                    </Link>
                    <Link
                      href={`/nests/${PRIVATE_FICTION_PROJECT_SLUG}/access`}
                      className="rounded-full border border-fuchsia-200 bg-white/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-950"
                    >
                      Access
                    </Link>
                  </div>
                </div>
              ) : null}

              {collaborationRows.map((project) => (
                <div key={project.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a36f2e]">{project.label}</div>
                  <h3 className="mt-2 font-serif text-xl font-black text-[#3d3122]">{project.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#7d6a50]">
                    {project.description || "No description yet."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${workflowChipColor(project.workflowSystem)}`}>
                      Workflow: {WORKFLOW_SYSTEM_LABELS[project.workflowSystem]}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                      {project.role}
                    </span>
                    <Link
                      href={`/nests/${encodeURIComponent(project.slug)}`}
                      className="rounded-full bg-[#3d3122] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#fffaf3]"
                    >
                      Open Nest
                    </Link>
                    <Link
                      href={`/nests/${encodeURIComponent(project.slug)}/access`}
                      className="rounded-full border border-[#eadfca] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]"
                    >
                      Access
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
              No shared Nests yet. Create a Nest below, then invite collaborators from its access panel.
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-black">Open a Nest</h2>
                <p className="mt-1 text-sm text-[#7d6a50]">
                  These are real StudioProject records. The label is friendlier now; the database can stay boring.
                </p>
              </div>
              <div className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                {projects.length + collaborationProjects.length + (canOpenPrivateFictionNest && !collaborationProjects.some((project) => project.slug === PRIVATE_FICTION_PROJECT_SLUG) ? 1 : 0)} active
              </div>
            </div>

            {projects.length > 0 || canOpenPrivateFictionNest ? (
              <div className="grid gap-4 md:grid-cols-2">
                {canOpenPrivateFictionNest && (
                  <Link
                    href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`}
                    className="group rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-100 hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="rounded-2xl border border-fuchsia-200 bg-white/70 p-3 text-fuchsia-900">
                        <FileText size={22} />
                      </div>
                      <span className="rounded-full border border-fuchsia-200 bg-white/70 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-900">
                        Private fiction
                      </span>
                    </div>
                    <h3 className="font-serif text-xl font-black leading-tight text-fuchsia-950">
                      My Heart Is a Junkyard Starship
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-fuchsia-900/80">
                      Private comic packet, story bible, and scroll preview. Access is controlled by Fiction Lab Nest grants.
                    </p>
                      <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-fuchsia-900">
                        Open private packet
                        <ArrowRight size={14} className="transition group-hover:translate-x-1" />
                      </div>
                  </Link>
                )}
                {projects.map((project) => {
                  const kind = project.nestKind;
                  const outputKind = kind === "home" ? "study" : kind;
                  const workflowSystem = workflowSystemForNestKind(project.nestKind);
                  const Icon = iconForNestKind(kind);
                  return (
                    <Link
                      key={project.id}
                      href={`/nests/${encodeURIComponent(project.slug)}`}
                      className="group rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d5b77d] hover:bg-[#fff8eb] hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className={`rounded-2xl border p-3 ${colorForNestKind(kind)}`}>
                          <Icon size={22} />
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${colorForNestKind(kind)}`}>
                          {NEST_KIND_LABELS[kind]}
                        </span>
                      </div>
                      <h3 className="font-serif text-2xl font-black text-[#342618] transition group-hover:text-[#9a5f13]">
                        {project.name}
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#3d3122] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#fffaf3]">
                          Open Nest
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#eadfca] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          <BookOpen size={12} />
                          Document inside
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#eadfca] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          <MessageCircle size={12} />
                          Chat inside
                        </span>
                      </div>
                      <div className="mt-3 rounded-xl border border-[#f0e3ca] bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8a7659]">
                        {project.documentTitle ?? "Living document ready"}
                      </div>
                      <div className="mt-3 rounded-xl border border-[#f0e3ca] bg-[#fffaf3] p-3">
                        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                          <PackageCheck size={12} />
                          Output paths
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {listOutputsForNestKind(outputKind).slice(0, 3).map((output) => (
                            <span
                              key={output.id}
                              className="rounded-full border border-[#eadfca] bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.09em] text-[#8c6b4a]"
                              title={`${getOutputFamilyLabel(output.family)}: ${output.description}`}
                            >
                              {output.title}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[#8a7659]">
                        <Clock size={14} />
                        {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "Unknown update"}
                      </div>
                      <div className="mt-3 rounded-xl border border-[#f0e3ca] bg-[#fffaf3] p-3">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${workflowChipColor(workflowSystem)}`}>
                          {WORKFLOW_SYSTEM_LABELS[workflowSystem]}
                        </span>
                        <p className="mt-2 text-[11px] leading-5 text-[#6b5b45]">
                          {WORKFLOW_SYSTEM_DESCRIPTIONS[workflowSystem]}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] p-10 text-center text-sm leading-6 text-[#6b5b45]">
                <Folder size={32} className="mb-4 text-[#c8a66b]" />
                <h3 className="font-serif text-xl font-black text-[#3d3122]">Welcome to your Studio</h3>
                <p className="mt-2 max-w-sm text-xs text-[#8a7659]">
                  You do not have any Nests yet. If you were invited, confirm you signed in with the invited email. Otherwise choose a starting shape on the right to create your first secure workspace.
                </p>
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6 lg:sticky lg:top-6 lg:self-start">
            <h2 className="font-serif text-2xl font-black">Create a Nest</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b5b45]">
              Start with the closest shape. You can still use the same tagging, lenses, media, and publishing tools.
            </p>

            <form action={createNest} className="mt-5 space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-black uppercase tracking-[0.16em] text-[#8a7659]">
                  Nest name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  placeholder="High Ground Odyssey Book, Udacity Study, Melissa Fiction Lab..."
                  className="mt-2 w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition focus:border-[#a36f2e] focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label htmlFor="documentTitle" className="block text-xs font-black uppercase tracking-[0.16em] text-[#8a7659]">
                  First document title
                </label>
                <input
                  type="text"
                  id="documentTitle"
                  name="documentTitle"
                  placeholder="Optional. Quipsly will make a sensible one."
                  className="mt-2 w-full rounded-xl border border-[#d9c7a5] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition focus:border-[#a36f2e] focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <fieldset>
                <legend className="block text-xs font-black uppercase tracking-[0.16em] text-[#8a7659]">
                  Starting shape
                </legend>
                <div className="mt-2 grid gap-2">
                  {nestTemplates.map((template) => {
                    const Icon = iconForNestKind(template.value);
                    return (
                      <label
                        key={template.value}
                        className="group flex cursor-pointer gap-3 rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-3 transition hover:border-[#d5b77d] hover:bg-[#fff8eb]"
                      >
                        <input
                          type="radio"
                          name="template"
                          value={template.value}
                          defaultChecked={template.value === "writing"}
                          className="mt-1 accent-[#8c6b4a]"
                        />
                        <span className={`mt-0.5 h-9 w-9 shrink-0 rounded-xl border p-2 ${colorForNestKind(template.value)}`}>
                          <Icon size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-black text-[#3d3122]">{template.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#7d6a50]">{template.description}</span>
                          <span className="mt-2 block rounded-xl border border-[#eadfca] bg-white px-2 py-1 text-[11px] font-bold leading-5 text-[#8a7659]">
                            Starts with: {template.starterTitle}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8c6b4a]">Writing vs study</div>
                <p className="mt-2 text-xs leading-5 text-[#6b5b45]">
                  Writing documents are for authoring original content. Study documents keep source material intact while you highlight, tag, summarize, question, and add your own notes on top.
                </p>
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-[#59442d]"
              >
                <Plus size={16} />
                Create and open Nest
              </button>
            </form>
          </aside>
        </div>
      </div>
    </main>
  );
}
