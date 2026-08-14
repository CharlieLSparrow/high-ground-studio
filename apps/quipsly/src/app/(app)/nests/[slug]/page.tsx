import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArchiveRestore,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  ListTodo,
  Mic,
  Microscope,
  PackageCheck,
  PanelsTopLeft,
  Radio,
  Share2,
  Tags,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import { getOutputFamilyLabel, listOutputsForNestKind } from "@high-ground/quipsly-domain/output-catalog";

import { auth } from "@/auth";
import { tagFocusHref } from "@/components/tag-search-chips";
import { getPrismaClient } from "@/lib/prisma";
import {
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import { readNestProjectFollowThrough } from "@/lib/server/nest-project-follow-through";
import {
  findStudioProjectForAccess,
  listStudioProjectAccessGrants,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
} from "@/lib/server/studio-project-access";
import {
  NEST_KIND_LABELS,
  nestKindFromSourceLabel,
  type StudioNestKind,
} from "@/lib/studio/project-registry";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";

import { CreateDocumentButton } from "./CreateDocumentButton";
import {
  EpisodeRoomDirectory,
  type EpisodeRoomDirectoryEpisode,
  type EpisodeRoomSourceCandidate,
} from "./EpisodeRoomDirectory";
import { NLETimeline } from "@/components/nle/NLETimeline";
import {
  sourceEpisodeNumber,
  suggestedEpisodeSlug,
  suggestedEpisodeTitle,
} from "./episode-room-suggestions";
import { NestQuickCapture } from "./NestQuickCapture";

export const dynamic = "force-dynamic";

const PROJECT_VIEWS = ["overview", "notes", "work", "sessions", "media", "tools"] as const;
type ProjectView = typeof PROJECT_VIEWS[number];

type NestDashboardPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
};

function normalizeProjectView(value: string | string[] | undefined): ProjectView {
  return typeof value === "string" && PROJECT_VIEWS.includes(value as ProjectView)
    ? value as ProjectView
    : "overview";
}

function defaultEpisodeForNest(slug: string) {
  return slug === "high-ground-odyssey-manuscript" ? "episode-4" : "current-episode";
}

function mediaTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function documentActionLabel(kind: StudioNestKind) {
  if (kind === "study" || kind === "research") return "Open study document";
  if (kind === "production") return "Open production notes";
  if (kind === "fiction") return "Open story bible";
  if (kind === "gallery") return "Open gallery notes";
  if (kind === "home") return "Open home vault";
  return "Open manuscript";
}

function projectHref(slug: string, view: ProjectView) {
  const base = `/nests/${encodeURIComponent(slug)}`;
  return view === "overview" ? base : `${base}?view=${view}`;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function ToolCard({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
}) {
  return (
    <Link
      href={href}
      className="group block h-full rounded-2xl border border-[#e3d4b9] bg-white p-5 outline-none transition hover:-translate-y-0.5 hover:border-[#bd9d68] hover:shadow-md focus-visible:ring-4 focus-visible:ring-sky-200"
    >
      <span className="flex items-center gap-3">
        <span className="rounded-xl bg-[#f7eddb] p-2.5 text-[#795a35]"><Icon size={19} aria-hidden="true" /></span>
        <span className="font-serif text-xl font-black text-[#3d3122]">{title}</span>
      </span>
      <span className="mt-3 block text-sm font-semibold leading-6 text-[#715f48]">{description}</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[#8a653d]">
        Open <ExternalLink size={12} aria-hidden="true" />
      </span>
    </Link>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9c7a5] bg-[#fffaf0] p-5">
      <h3 className="font-serif text-xl font-black text-[#3d3122]">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#765f40]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export default async function NestDashboardPage({ params, searchParams }: NestDashboardPageProps) {
  const [{ slug }, requested] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ view?: string | string[] }>({}),
  ]);
  const view = normalizeProjectView(requested.view);
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  const actorUserId = session?.user?.id;

  if (!actorEmail || !actorUserId) {
    redirect(`/login?callbackUrl=${encodeURIComponent(projectHref(slug, view))}`);
  }

  const access = await resolveStudioProjectAccess({
    projectSlug: slug,
    email: actorEmail,
    action: "read",
  });
  if (!access.allowed) notFound();

  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(slug, prisma);
  if (!project) notFound();
  const episodeSourceProjectSlug = project.slug === "high-ground-odyssey"
    ? "high-ground-odyssey-manuscript"
    : project.slug;
  const episodeSourceAccess = await resolveStudioProjectAccess({
    projectSlug: episodeSourceProjectSlug,
    email: actorEmail,
    action: "read",
    prisma,
  });

  const actorRoomVisibility = {
    OR: [
      { createdByUserId: actorUserId },
      { participants: { some: { userId: actorUserId, accessStatus: "ACTIVE" as const } } },
      { booking: { is: { OR: [{ clientUserId: actorUserId }, { coachUserId: actorUserId }] } } },
    ],
  };
  const projectRoomScope = {
    OR: [
      { projectId: project.id },
      { nestSlug: project.slug },
      { projectSlug: project.slug },
    ],
  };

  const [documents, grants, assets, mediaBins, projectFollowThrough, tags, rooms, episodeProductions, episodeSourceDocuments] = await Promise.all([
    prisma.studioDocument.findMany({
      where: {
        projectId: project.id,
        ...personalWritingDocumentVisibilityWhere(actorUserId),
      },
      select: {
        id: true,
        stableId: true,
        title: true,
        sourceLabel: true,
        updatedAt: true,
        blocks: {
          where: { archivedAt: null },
          orderBy: { order: "asc" },
          take: 1,
          select: { id: true, body: true },
        },
        _count: { select: { blocks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    listStudioProjectAccessGrants(project.slug, prisma),
    prisma.studioMediaAsset.findMany({
      where: { projects: { some: { id: project.id } } },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
      take: 18,
      orderBy: { createdAt: "desc" },
    }),
    prisma.mediaBin.findMany({
      where: { projectId: project.id },
      select: { id: true, name: true, updatedAt: true },
      take: 18,
      orderBy: { updatedAt: "desc" },
    }),
    readNestProjectFollowThrough(prisma, {
      projectId: project.id,
      projectSlug: project.slug,
      actorUserId,
    }),
    prisma.studioTag.findMany({
      where: { projectId: project.id, isActive: true },
      select: { id: true, label: true, slug: true, category: true },
      orderBy: [{ category: "asc" }, { label: "asc" }],
      take: 30,
    }),
    prisma.callRoom.findMany({
      where: { AND: [projectRoomScope, actorRoomVisibility] },
      select: {
        id: true,
        title: true,
        status: true,
        purpose: true,
        scheduledStart: true,
        updatedAt: true,
        _count: {
          select: {
            participants: true,
            transcriptJobs: true,
            actionItems: true,
            goals: true,
          },
        },
      },
      orderBy: [{ scheduledStart: "desc" }, { updatedAt: "desc" }],
      take: 24,
    }),
    prisma.studioEpisodeProduction.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        productionJson: true,
        document: { select: { title: true } },
        milestones: { select: { status: true } },
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
      take: 24,
    }),
    episodeSourceAccess.allowed && episodeSourceAccess.projectId
      ? prisma.studioDocument.findMany({
          where: {
            projectId: episodeSourceAccess.projectId,
            personalOwnerUserId: null,
            blocks: { some: { archivedAt: null } },
            ...(project.slug === "high-ground-odyssey"
              ? { sourceLabel: { contains: "hgo-draft-kind:podcast-episode" } }
              : { NOT: { sourceLabel: { contains: "document-kind:episode-room-manuscript" } } }),
          },
          select: {
            id: true,
            title: true,
            sourceLabel: true,
            updatedAt: true,
            _count: { select: { blocks: { where: { archivedAt: null } } } },
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const nestKind = nestKindFromSourceLabel(project.sourceLabel);
  const canWrite = access.role ? roleAllowsAction(access.role, "write") : false;
  const canManage = access.role ? roleAllowsAction(access.role, "manage") : false;
  const activeCollaborators = grants.filter((grant) => grant.status === "ACTIVE");
  const goals = projectFollowThrough.goals;
  const tasks = projectFollowThrough.tasks;
  const openTasks = tasks.filter((task) => task.status === "OPEN");
  const resolvedTasks = tasks.filter((task) => task.status !== "OPEN");
  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");
  const nextTask = openTasks[0] ?? tasks[0];
  const activeGoal = goals.find((goal) => goal.status === "ACTIVE") ?? goals[0];
  const nextRoom = rooms.find((room) => room.scheduledStart && room.scheduledStart >= new Date()) ?? rooms[0];
  const latestDocument = documents[0];
  const episodeSlug = defaultEpisodeForNest(project.slug);
  const activeEpisode = episodeProductions.find((episode) => episode.slug === episodeSlug)
    ?? episodeProductions[0];
  const episodeDirectory: EpisodeRoomDirectoryEpisode[] = episodeProductions.map((episode) => {
    const sourceImport = jsonRecord(jsonRecord(episode.productionJson).sourceImport);
    return {
      id: episode.id,
      slug: episode.slug,
      title: episode.title,
      status: episode.status,
      documentTitle: episode.document.title,
      updatedAt: episode.updatedAt.toISOString(),
      milestoneCount: episode.milestones.length,
      completedMilestoneCount: episode.milestones.filter((milestone) => milestone.status === "COMPLETED").length,
      sourceDocumentTitle: typeof sourceImport.sourceDocumentTitle === "string" ? sourceImport.sourceDocumentTitle : null,
      sourceBlockCount: typeof sourceImport.sourceBlockCount === "number" ? sourceImport.sourceBlockCount : null,
    };
  });
  const existingEpisodeBySourceDocument = new Map(
    episodeProductions.flatMap((episode) => {
      const sourceImport = jsonRecord(jsonRecord(episode.productionJson).sourceImport);
      return typeof sourceImport.sourceDocumentId === "string"
        ? [[sourceImport.sourceDocumentId, episode.slug] as const]
        : [];
    }),
  );
  const episodeSourceCandidates: EpisodeRoomSourceCandidate[] = episodeSourceDocuments
    .map((document) => {
      const episodeNumber = sourceEpisodeNumber(document.sourceLabel, document.title);
      const title = suggestedEpisodeTitle(document.title, episodeNumber);
      return {
        id: document.id,
        projectSlug: episodeSourceProjectSlug,
        title: document.title,
        suggestedTitle: title,
        suggestedSlug: suggestedEpisodeSlug(title, episodeNumber),
        episodeNumber,
        blockCount: document._count.blocks,
        updatedAt: document.updatedAt.toISOString(),
        existingEpisodeSlug: existingEpisodeBySourceDocument.get(document.id) ?? null,
      };
    })
    .sort((left, right) => (left.episodeNumber ?? Number.MAX_SAFE_INTEGER) - (right.episodeNumber ?? Number.MAX_SAFE_INTEGER));
  const outputs = listOutputsForNestKind(nestKind === "home" ? "study" : nestKind).slice(0, 6);
  const hasVisualResearchLab = project.slug === "marine-biology-research" || nestKind === "gallery";

  const nav: Array<{ id: ProjectView; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "notes", label: "Notes", count: documents.length },
    { id: "work", label: "Work", count: activeGoals.length + openTasks.length },
    { id: "sessions", label: "Sessions", count: rooms.length },
    { id: "media", label: "Media", count: assets.length + mediaBins.length },
    { id: "tools", label: "Tools" },
  ];

  return (
    <main className="min-h-full bg-[#fdfaf6] px-3 py-5 text-[#3d3122] sm:px-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/projects" className="inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-wide text-[#795a35] hover:underline">
          <ArrowLeft size={15} aria-hidden="true" /> All projects
        </Link>

        <header className="mt-2 rounded-[2rem] border border-[#e3d4b9] bg-white px-5 py-6 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-[#8a653d]">
                <span>{NEST_KIND_LABELS[nestKind]} project</span>
                <span aria-hidden="true">·</span>
                <span>{access.source === "operator-override" ? `Operator ${access.role}` : access.role}</span>
              </div>
              <h1 className="mt-2 truncate font-serif text-4xl font-black tracking-tight md:text-5xl">{project.name}</h1>
              {project.description ? (
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#715f48]">{project.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={`/find?q=${encodeURIComponent(project.name)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dcc9a7] bg-[#fffaf0] px-4 text-xs font-black text-[#684f32]">
                Search project
              </Link>
              <Link href={`/nests/${encodeURIComponent(project.slug)}/access`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dcc9a7] bg-white px-4 text-xs font-black text-[#684f32]">
                <Users size={15} aria-hidden="true" />
                {activeCollaborators.length} {activeCollaborators.length === 1 ? "person" : "people"}
              </Link>
            </div>
          </div>

          <nav aria-label={`${project.name} workspace`} className="-mx-2 mt-6 flex gap-1 overflow-x-auto px-2 pb-1">
            {nav.map((item) => {
              const active = item.id === view;
              return (
                <Link
                  key={item.id}
                  href={projectHref(project.slug, item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-black transition ${
                    active ? "bg-[#3e2f21] text-white" : "text-[#765f40] hover:bg-[#f7eddb]"
                  }`}
                >
                  {item.label}
                  {item.count !== undefined ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/15" : "bg-[#eadcc4]"}`}>{item.count}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="mt-6 space-y-6">
          {view === "overview" ? (
            <>
              {canWrite ? (
                <NestQuickCapture projectId={project.id} projectSlug={project.slug} projectName={project.name} tags={tags} />
              ) : (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                  You can read this project. An owner can grant editor access when you need to add or change work.
                </section>
              )}

              <section aria-labelledby="continue-heading" className="rounded-3xl border border-[#e3d4b9] bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Continue</p>
                    <h2 id="continue-heading" className="mt-1 font-serif text-3xl font-black">Pick up the thread</h2>
                  </div>
                  <p className="text-xs font-semibold text-[#806a4d]">These are links to canonical records, never copies.</p>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {activeEpisode ? (
                    <Link href={`/nests/${encodeURIComponent(project.slug)}/episodes/${encodeURIComponent(activeEpisode.slug)}`} className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 outline-none hover:border-orange-400 focus-visible:ring-4 focus-visible:ring-orange-100">
                      <Film className="text-orange-800" size={19} aria-hidden="true" />
                      <span className="mt-3 block text-[10px] font-black uppercase tracking-wide text-orange-800">Episode Room</span>
                      <span className="mt-1 block font-black">{activeEpisode.title}</span>
                      <span className="mt-2 block text-xs font-semibold text-[#806a4d]">Text, shared clips, recording clock, timeline, and chat</span>
                    </Link>
                  ) : null}
                  {latestDocument ? (
                    <Link href={`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(latestDocument.id)}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 outline-none hover:border-amber-400 focus-visible:ring-4 focus-visible:ring-amber-100">
                      <FileText className="text-amber-800" size={19} aria-hidden="true" />
                      <span className="mt-3 block text-[10px] font-black uppercase tracking-wide text-amber-800">Recent note</span>
                      <span className="mt-1 block font-black">{latestDocument.title}</span>
                      <span className="mt-2 block text-xs font-semibold text-[#806a4d]">Updated {latestDocument.updatedAt.toLocaleDateString()}</span>
                    </Link>
                  ) : null}
                  {nextTask ? (
                    <Link href={`/work?task=${encodeURIComponent(nextTask.id)}`} className="rounded-2xl border border-emerald-200 bg-emerald-50/55 p-4 outline-none hover:border-emerald-400 focus-visible:ring-4 focus-visible:ring-emerald-100">
                      <CheckCircle2 className="text-emerald-800" size={19} aria-hidden="true" />
                      <span className="mt-3 block text-[10px] font-black uppercase tracking-wide text-emerald-800">Next task</span>
                      <span className="mt-1 block font-black">{nextTask.title}</span>
                      <span className="mt-2 block text-xs font-semibold text-[#806a4d]">{nextTask.dueAt ? `Due ${nextTask.dueAt.toLocaleDateString()}` : "No due date"}</span>
                    </Link>
                  ) : null}
                  {activeGoal ? (
                    <Link href={`/work?goal=${encodeURIComponent(activeGoal.id)}`} className="rounded-2xl border border-violet-200 bg-violet-50/55 p-4 outline-none hover:border-violet-400 focus-visible:ring-4 focus-visible:ring-violet-100">
                      <Target className="text-violet-800" size={19} aria-hidden="true" />
                      <span className="mt-3 block text-[10px] font-black uppercase tracking-wide text-violet-800">Active goal</span>
                      <span className="mt-1 block font-black">{activeGoal.title}</span>
                      <span className="mt-2 block text-xs font-semibold text-[#806a4d]">{activeGoal.progressReceipts[0]?.progressPercent ?? 0}% recorded progress</span>
                    </Link>
                  ) : null}
                  {nextRoom ? (
                    <Link href={`/sessions/${encodeURIComponent(nextRoom.id)}`} className="rounded-2xl border border-sky-200 bg-sky-50/55 p-4 outline-none hover:border-sky-400 focus-visible:ring-4 focus-visible:ring-sky-100">
                      <CalendarDays className="text-sky-800" size={19} aria-hidden="true" />
                      <span className="mt-3 block text-[10px] font-black uppercase tracking-wide text-sky-800">Session</span>
                      <span className="mt-1 block font-black">{nextRoom.title || "Untitled session"}</span>
                      <span className="mt-2 block text-xs font-semibold text-[#806a4d]">{nextRoom.scheduledStart ? nextRoom.scheduledStart.toLocaleString() : nextRoom.status.toLowerCase()}</span>
                    </Link>
                  ) : null}
                  {!activeEpisode && !latestDocument && !nextTask && !activeGoal && !nextRoom ? (
                    <div className="md:col-span-2 xl:col-span-4">
                      <EmptyState title="This project has a clean slate." body="Capture the first note, task, or goal above. Quipsly will keep it attached to this project." />
                    </div>
                  ) : null}
                </div>
              </section>

              <section aria-labelledby="nle-timeline-heading" className="rounded-3xl border border-neutral-800 bg-[#1e1e1e] shadow-xl overflow-hidden mb-8 h-[600px] flex flex-col">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-[#252526]">
                  <div>
                    <h2 id="nle-timeline-heading" className="text-sm font-black tracking-wide text-neutral-300">Storyboard NLE Sandbox</h2>
                    <p className="text-xs text-neutral-500 mt-1">Experimental core timeline rendering engine (Phase 5 Slice)</p>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                  <NLETimeline projectId={project.id} />
                </div>
              </section>

              <EpisodeRoomDirectory
                projectSlug={project.slug}
                episodes={episodeDirectory}
                sourceCandidates={episodeSourceCandidates}
                canManage={canManage}
                collaboratorCount={activeCollaborators.length}
              />

              <section aria-labelledby="project-tags-heading" className="rounded-3xl border border-sky-200 bg-[linear-gradient(135deg,#f7fcff,#fffdf9)] p-5 shadow-sm md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">Reusable vocabulary</p>
                    <h2 id="project-tags-heading" className="mt-1 inline-flex items-center gap-2 font-serif text-2xl font-black"><Tags size={20} aria-hidden="true" />Project tags</h2>
                  </div>
                  <Link href={`/work?manage=tags&project=${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-white px-4 text-xs font-black text-sky-900">
                    Manage this vocabulary
                  </Link>
                </div>
                {tags.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Link key={tag.id} href={tagFocusHref(tag.id)} className="inline-flex min-h-11 items-center rounded-full border border-sky-200 bg-white px-4 text-xs font-black text-sky-950 hover:border-sky-500">
                        #{tag.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm font-semibold leading-6 text-sky-950">No intentional tags yet. Create a small reusable vocabulary when repeated themes emerge.</p>
                )}
              </section>
            </>
          ) : null}

          {view === "notes" ? (
            <section aria-labelledby="notes-heading" className="rounded-3xl border border-[#e3d4b9] bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Project memory</p>
                  <h2 id="notes-heading" className="mt-1 font-serif text-3xl font-black">Notes & documents</h2>
                  <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Private living documents, ordered by the last real edit.</p>
                </div>
                {canWrite ? <CreateDocumentButton projectSlug={project.slug} /> : null}
              </div>
              {documents.length ? (
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {documents.map((document) => (
                    <li key={document.id}>
                      <Link href={`/create?project=${encodeURIComponent(project.slug)}&document=${encodeURIComponent(document.id)}`} className="block h-full rounded-2xl border border-[#e3d4b9] bg-[#fffdf9] p-5 outline-none hover:border-[#bd9d68] focus-visible:ring-4 focus-visible:ring-amber-100">
                        <span className="font-serif text-xl font-black">{document.title}</span>
                        {document.blocks[0]?.body ? <span className="mt-2 line-clamp-3 block text-sm font-semibold leading-6 text-[#715f48]">{document.blocks[0].body}</span> : null}
                        <span className="mt-4 block text-[10px] font-black uppercase tracking-wide text-[#8a653d]">{document._count.blocks} blocks · updated {document.updatedAt.toLocaleDateString()}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-5"><EmptyState title="No notes yet." body="Create a note to establish the project’s durable writing surface." /></div>
              )}
            </section>
          ) : null}

          {view === "work" ? (
            <>
              {canWrite ? <NestQuickCapture projectId={project.id} projectSlug={project.slug} projectName={project.name} tags={tags} /> : null}
              <section aria-labelledby="nest-follow-through-heading" className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-800">Same records, in context</p>
                    <h2 id="nest-follow-through-heading" className="mt-1 font-serif text-3xl font-black">Project follow-through</h2>
                    <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Only your owned goals and actor-visible committed tasks appear. Unreviewed transcript suggestions stay excluded.</p>
                  </div>
                  <Link href="/work" className="inline-flex min-h-11 items-center rounded-full border border-sky-300 bg-white px-4 text-xs font-black text-sky-900">Open all work</Link>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/35 p-4">
                    <h3 className="inline-flex items-center gap-2 font-serif text-xl font-black"><Target size={18} className="text-violet-700" aria-hidden="true" /> Goals</h3>
                    {goals.length ? <ul className="mt-3 space-y-2">{goals.map((goal) => {
                      const progress = goal.progressReceipts[0]?.progressPercent;
                      return <li key={goal.id}><Link href={`/work?goal=${encodeURIComponent(goal.id)}`} className="block rounded-xl border border-violet-100 bg-white p-3 outline-none hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500"><span className="font-black">{goal.title}</span><span className="mt-1 block text-xs font-bold text-[#806a4d]">{goal.status.toLowerCase().replaceAll("_", " ")} · {progress === null || progress === undefined ? "no progress update" : `${progress}% progress`}{goal.targetAt ? ` · target ${goal.targetAt.toLocaleDateString()}` : ""}</span></Link></li>;
                    })}</ul> : <p className="mt-3 text-sm font-semibold text-[#765f40]">No owned goals are attached yet.</p>}
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-4">
                    <h3 className="inline-flex items-center gap-2 font-serif text-xl font-black"><ListTodo size={18} className="text-emerald-700" aria-hidden="true" /> Tasks</h3>
                    {openTasks.length ? <ul className="mt-3 space-y-2">{openTasks.map((task) => <li key={task.id} className="rounded-xl border border-emerald-100 bg-white p-3"><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="font-black outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600">{task.title}</Link><p className="mt-1 text-xs font-bold text-[#806a4d]">{task.dueAt ? `due ${task.dueAt.toLocaleDateString()}` : "no due date"}{task.room?.title ? ` · ${task.room.title}` : ""}</p>{task.sourceAnchor ? <Link href={`/sessions/${encodeURIComponent(task.sourceAnchor.roomId)}#transcript-segment-${encodeURIComponent(task.sourceAnchor.segmentId)}`} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-900 hover:underline">Return to {mediaTime(task.sourceAnchor.startSeconds)}–{mediaTime(task.sourceAnchor.endSeconds)}</Link> : null}</li>)}</ul> : <p className="mt-3 text-sm font-semibold text-[#765f40]">No open actor-visible tasks are attached yet.</p>}
                    {resolvedTasks.length ? (
                      <details className="mt-3 rounded-xl border border-emerald-100 bg-white p-3">
                        <summary className="cursor-pointer text-xs font-black text-emerald-900">Resolved tasks · {resolvedTasks.length}</summary>
                        <ul className="mt-3 space-y-2">
                          {resolvedTasks.map((task) => <li key={task.id}><Link href={`/work?task=${encodeURIComponent(task.id)}`} className="text-xs font-bold text-[#765f40] hover:underline">{task.title} · {task.status.toLowerCase()}</Link></li>)}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-semibold leading-5 text-[#806a4d]">Opening work only navigates. This page cannot complete work, schedule time, send a message, alter an external calendar, or publish.</p>
              </section>
            </>
          ) : null}

          {view === "sessions" ? (
            <section aria-labelledby="sessions-heading" className="rounded-3xl border border-[#e3d4b9] bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Record, transcribe, follow through</p>
                  <h2 id="sessions-heading" className="mt-1 font-serif text-3xl font-black">Sessions</h2>
                  <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Only sessions where you are the creator, participant, client, or coach are shown.</p>
                </div>
                <Link href="/coaching/sessions" className="inline-flex min-h-11 items-center rounded-full border border-[#dcc9a7] bg-[#fffaf0] px-4 text-xs font-black text-[#684f32]">Prepare a session</Link>
              </div>
              {rooms.length ? (
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {rooms.map((room) => (
                    <li key={room.id}>
                      <Link href={`/sessions/${encodeURIComponent(room.id)}`} className="block h-full rounded-2xl border border-sky-200 bg-sky-50/35 p-5 outline-none hover:border-sky-400 focus-visible:ring-4 focus-visible:ring-sky-100">
                        <span className="text-[10px] font-black uppercase tracking-wide text-sky-800">{room.purpose.toLowerCase()} · {room.status.toLowerCase()}</span>
                        <span className="mt-2 block font-serif text-xl font-black">{room.title || "Untitled session"}</span>
                        <span className="mt-2 block text-sm font-semibold text-[#715f48]">{room.scheduledStart ? room.scheduledStart.toLocaleString() : `Updated ${room.updatedAt.toLocaleDateString()}`}</span>
                        <span className="mt-4 block text-[10px] font-black uppercase tracking-wide text-sky-800">{room._count.participants} people · {room._count.transcriptJobs} transcripts · {room._count.goals} goals · {room._count.actionItems} tasks</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <div className="mt-5"><EmptyState title="No actor-visible sessions in this project." body="Prepare a session when a recording, transcript, coaching conversation, or episode review belongs here." /></div>}
            </section>
          ) : null}

          {view === "media" ? (
            <section aria-labelledby="media-heading" className="rounded-3xl border border-[#e3d4b9] bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Project files</p>
                  <h2 id="media-heading" className="mt-1 font-serif text-3xl font-black">Media</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Bins and assets already attached to this project.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/nests/${encodeURIComponent(project.slug)}/story`} className="inline-flex min-h-11 items-center rounded-full bg-[#3e2f21] px-4 text-xs font-black text-white">Browse & build story</Link>
                  <Link href={`/editor?project=${encodeURIComponent(project.slug)}`} className="inline-flex min-h-11 items-center rounded-full border border-[#dcc9a7] bg-white px-4 text-xs font-black text-[#684f32]">Open timeline editor</Link>
                </div>
              </div>
              {assets.length || mediaBins.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mediaBins.map((bin) => <div key={bin.id} className="rounded-2xl border border-[#e3d4b9] bg-[#fffdf9] p-4"><FolderOpen size={17} className="text-[#8a653d]" aria-hidden="true" /><p className="mt-3 font-serif text-lg font-black">{bin.name}</p><p className="mt-2 text-xs font-bold text-[#806a4d]">Bin · updated {bin.updatedAt.toLocaleDateString()}</p></div>)}
                  {assets.map((asset) => <Link key={asset.id} href={`/nests/${encodeURIComponent(project.slug)}/story?asset=${encodeURIComponent(asset.id)}`} className="rounded-2xl border border-[#e3d4b9] bg-[#fffdf9] p-4 outline-none transition hover:border-[#bd9d68] focus-visible:ring-4 focus-visible:ring-sky-100">{asset.mimeType?.includes("video") ? <Film size={17} className="text-[#8a653d]" aria-hidden="true" /> : <Camera size={17} className="text-[#8a653d]" aria-hidden="true" />}<p className="mt-3 truncate font-serif text-lg font-black">{asset.filename}</p><p className="mt-2 text-xs font-bold text-[#806a4d]">{asset.sizeBytes ? `${(Number(asset.sizeBytes) / 1024 / 1024).toFixed(1)} MB · ` : ""}{asset.createdAt.toLocaleDateString()}</p><span className="mt-3 inline-flex text-[10px] font-black uppercase tracking-wide text-[#8a653d]">Open source viewer</span></Link>)}
                </div>
              ) : <div className="mt-5"><EmptyState title="No attached media yet." body="Use the editor or recorder to bring audio, video, photos, and working bins into this project." /></div>}
            </section>
          ) : null}

          {view === "tools" ? (
            <>
              <section aria-labelledby="tools-heading" className="rounded-3xl border border-[#e3d4b9] bg-[#fffaf0] p-5 shadow-sm md:p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a653d]">Deep work surfaces</p>
                <h2 id="tools-heading" className="mt-1 inline-flex items-center gap-2 font-serif text-3xl font-black"><Wrench size={22} aria-hidden="true" />Tools</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#765f40]">Open a specialized surface when the work needs it. Each tool keeps this project identity instead of creating a second project.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeEpisode ? <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/episodes/${encodeURIComponent(activeEpisode.slug)}`} title="Episode Room" description="Bring the episode text, shared watch clips, recording clock, timeline alignment, and collaboration thread into one live workspace." icon={Radio} /> : null}
                  {activeEpisode ? <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/episodes/${encodeURIComponent(activeEpisode.slug)}?mode=edit`} title="Episode editing desk" description="Switch episodes, watch synchronized angles, and make attributable display decisions without changing the protected sync baseline." icon={Film} /> : null}
                  <ToolCard href={`/create?project=${encodeURIComponent(project.slug)}`} title={documentActionLabel(nestKind)} description="Write, study, structure, tag, annotate, and work with transparent assistance." icon={BookOpen} />
                  {hasVisualResearchLab ? <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/visual-research`} title="Visual research lab" description="Review image batches, source metadata, visual labels, masks, and model-ready exports." icon={Microscope} /> : null}
                  <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/story`} title="Source & story desk" description="Browse long-form media, mark immutable ranges, write source-backed cards, and arrange them into a shared story without changing originals." icon={Clapperboard} />
                  <ToolCard href={`/editor?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episodeSlug)}`} title="Media editor" description="Sync, cut, and prepare episode or social timelines attached to this project." icon={Film} />
                  <ToolCard href={`/recorder?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episodeSlug)}`} title="Recorder" description="Record a live session with the project context and manuscript nearby." icon={Mic} />
                  <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/access`} title={canManage ? "Manage access" : "View collaborators"} description={canManage ? "Invite collaborators and set deliberate viewer, editor, or owner access." : "See who can access this project. An owner manages invitations."} icon={Users} />
                  {canManage ? <ToolCard href={`/nests/${encodeURIComponent(project.slug)}/portable`} title="Backup and transfer" description="Export verified notes, work, and tag vocabulary or preview a no-overwrite restore into this Nest." icon={ArchiveRestore} /> : null}
                  <ToolCard href="/coaching/sessions" title="Session preparation" description="Prepare participants, consent, capture readiness, and follow-through before a live room." icon={Radio} />
                  <ToolCard href={`/publishing-suite/package-builder?project=${encodeURIComponent(project.slug)}`} title="Package builder" description="Prepare output packets without implying anything has been delivered or published." icon={Share2} />
                  <ToolCard href={`/media?projectId=${encodeURIComponent(project.id)}`} title="Media library" description="Browse the project’s attached assets and their durable metadata." icon={Camera} />
                  {project.slug === PRIVATE_FICTION_PROJECT_SLUG ? (
                    <>
                      <ToolCard href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`} title="Private comic packet" description="Open the current seed packet, story bible entities, and private source overview." icon={BookOpen} />
                      <ToolCard href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}/scroll`} title="Scroll preview" description="Preview the phone-first story flow while keeping source material private." icon={PanelsTopLeft} />
                      <ToolCard href="/storyboards/builder" title="Storyboard builder" description="Shape panels, visual beats, and media-generation plans." icon={FileText} />
                    </>
                  ) : null}
                </div>
              </section>

              <section aria-labelledby="outputs-heading" className="rounded-3xl border border-[#e3d4b9] bg-white p-5 shadow-sm md:p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-[#f7eddb] p-2.5 text-[#795a35]"><PackageCheck size={20} aria-hidden="true" /></span>
                  <div><p className="text-[10px] font-black uppercase tracking-wide text-[#8a653d]">Available pathways</p><h2 id="outputs-heading" className="font-serif text-2xl font-black">Outputs</h2></div>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {outputs.map((output) => <div key={output.id} className="rounded-2xl border border-[#e3d4b9] bg-[#fffdf9] p-4"><p className="text-[10px] font-black uppercase tracking-wide text-[#8a653d]">{getOutputFamilyLabel(output.family)}</p><h3 className="mt-1 font-black">{output.title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-[#715f48]">{output.description}</p></div>)}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
