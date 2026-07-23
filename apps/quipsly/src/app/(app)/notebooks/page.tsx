import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  Library,
  NotebookPen,
  Plus,
  Search,
  Sprout,
} from "lucide-react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import {
  listAccessibleStudioProjectSummariesForEmail,
  normalizeAccessEmail,
} from "@/lib/server/studio-project-access";
import { isUserManagementAdminEmail } from "@/lib/server/user-management";
import {
  listStudioProjectOptions,
  NEST_KIND_LABELS,
  nestKindFromSourceLabel,
  workflowSystemForNestKind,
  WORKFLOW_SYSTEM_LABELS,
  type StudioNestKind,
} from "@/lib/studio/project-registry";
import { createNotebook, createNotebookPage } from "./actions";

export const dynamic = "force-dynamic";

type WritingNestRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  nestKind: StudioNestKind;
  role: string;
  updatedAt: Date;
};

type DocumentRow = {
  id: string;
  stableId: string;
  title: string;
  updatedAt: Date;
  projectId: string;
  blockCount: number;
};

type BlockMatchRow = {
  id: string;
  stableId: string;
  order: number;
  title: string | null;
  body: string;
  document: {
    id: string;
    stableId: string;
    title: string;
    projectId: string;
  };
};

const WRITING_KINDS = new Set<StudioNestKind>([
  "writing",
  "study",
  "research",
  "fiction",
  "course",
  "mixed",
]);

function isWritingKind(kind: StudioNestKind) {
  return WRITING_KINDS.has(kind);
}

function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function coerceDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value;
  if (value) return new Date(value);
  return new Date(0);
}

function kindTone(kind: StudioNestKind) {
  if (kind === "study" || kind === "research") return "border-cyan-200 bg-cyan-50 text-cyan-950";
  if (kind === "fiction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950";
  if (kind === "course") return "border-violet-200 bg-violet-50 text-violet-950";
  if (kind === "mixed") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function roleTone(role: string) {
  const normalized = role.toUpperCase();
  if (normalized.includes("OWNER") || normalized.includes("ADMIN")) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized.includes("EDITOR")) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-[#eadfca] bg-[#fffaf3] text-[#7d6a50]";
}

function canWriteInNest(role: string) {
  const normalized = role.toUpperCase();
  return normalized.includes("OWNER") || normalized.includes("ADMIN") || normalized.includes("EDITOR");
}

function snippetFor(body: string, query: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!query) return compact.slice(0, 180);
  const index = compact.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return compact.slice(0, 180);
  const start = Math.max(0, index - 70);
  const end = Math.min(compact.length, index + query.length + 110);
  return `${start > 0 ? "..." : ""}${compact.slice(start, end)}${end < compact.length ? "..." : ""}`;
}

function NotebookCard({
  nest,
  documents,
}: {
  nest: WritingNestRow;
  documents: DocumentRow[];
}) {
  const workflow = workflowSystemForNestKind(nest.nestKind);
  const primaryDocument = documents[0];
  const openHref = primaryDocument
    ? `/create?project=${encodeURIComponent(nest.slug)}&document=${encodeURIComponent(primaryDocument.id)}`
    : `/create?project=${encodeURIComponent(nest.slug)}`;
  const notebookHref = `/notebooks/${encodeURIComponent(nest.slug)}`;

  return (
    <article className="rounded-3xl border border-[#eadfca] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${kindTone(nest.nestKind)}`}>
              {NEST_KIND_LABELS[nest.nestKind]}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${roleTone(nest.role)}`}>
              {nest.role}
            </span>
          </div>
          <h2 className="mt-4 font-serif text-2xl font-black leading-tight text-[#3d3122]">
            {nest.name}
          </h2>
          {nest.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6b5b45]">
              {nest.description}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#8a7659]">
              A notebook-shaped Nest for pages, drafts, source notes, and tagged writing blocks.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] px-3 py-2 text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a7659]">
            {WORKFLOW_SYSTEM_LABELS[workflow]}
          </div>
          <div className="mt-1 text-xs font-bold text-[#6b5b45]">
            {formatUpdatedAt(nest.updatedAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={notebookHref}
          className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#5a4530]"
        >
          <NotebookPen size={14} />
          Open Notebook
        </Link>
        <Link
          href={openHref}
          className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffaf3] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] transition hover:bg-[#fff8eb]"
        >
          <FileText size={14} />
          {primaryDocument ? "Latest Page" : "Editor"}
        </Link>
        <Link
          href={`/nests/${encodeURIComponent(nest.slug)}`}
          className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffaf3] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] transition hover:bg-[#fff8eb]"
        >
          <FolderOpen size={14} />
          Nest Dashboard
        </Link>
      </div>

      {canWriteInNest(nest.role) ? (
        <form action={createNotebookPage} className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          <input type="hidden" name="projectSlug" value={nest.slug} />
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-900">
            Fast new page
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
            <input
              name="title"
              placeholder="New chapter note, article draft, source notes..."
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <select
              name="kind"
              defaultValue="writing-page"
              className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="writing-page">Writing</option>
              <option value="draft">Draft</option>
              <option value="note">Note</option>
              <option value="study-source">Source</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-800"
            >
              <Plus size={13} />
              Create
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5 rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-xs leading-5 text-[#7d6a50]">
          Viewer access: open and read pages here. Ask an owner for editor access when you are ready to write in this Nest.
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-[#efe5d2] bg-[#fffdf9] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a36f2e]">
            Recent pages
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a7659]">
            {documents.length} shown
          </div>
        </div>
        {documents.length > 0 ? (
          <div className="mt-3 space-y-2">
            {documents.slice(0, 4).map((document) => (
              <Link
                key={document.id}
                href={`/create?project=${encodeURIComponent(nest.slug)}&document=${encodeURIComponent(document.id)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-[#eadfca] hover:bg-[#fff8eb]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[#3d3122]">
                    {document.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-[#8a7659]">
                    <Clock size={12} />
                    {formatUpdatedAt(document.updatedAt)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-[#eadfca] bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#7d6a50]">
                  {document.blockCount} blocks
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-3 text-sm leading-6 text-[#7d6a50]">
            No pages yet. Open the writing desk to create the first calm page instead of spelunking through project machinery.
          </p>
        )}
      </div>
    </article>
  );
}

export default async function NotebooksPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; missingNest?: string; notAllowed?: string }>
    | { q?: string; missingNest?: string; notAllowed?: string };
} = {}) {
  const params = await searchParams;
  const searchQuery = typeof params?.q === "string" ? params.q.trim() : "";
  const missingNest = params?.missingNest === "1";
  const notAllowed = params?.notAllowed === "1";
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);

  if (!actorEmail) {
    redirect("/api/auth/signin?callbackUrl=/notebooks");
  }

  const prisma = getPrismaClient();

  try {
    await ensureHomeNestForEmail(actorEmail, prisma);
  } catch {
    // Keep the writing desk renderable even if the personal Home Nest cannot be created yet.
  }

  let ownedNests: WritingNestRow[] = [];
  let sharedNests: WritingNestRow[] = [];
  let loadError = "";

  try {
    if (isUserManagementAdminEmail(actorEmail)) {
      const projects = await listStudioProjectOptions(prisma);
      ownedNests = projects
        .filter((project) => isWritingKind(project.nestKind))
        .map((project) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
          description: project.description ?? null,
          nestKind: project.nestKind,
          role: "Admin",
          updatedAt: coerceDate(project.updatedAt),
        }));
    } else {
      const projects = await listProjectsVisibleToEmail(actorEmail, prisma);
      ownedNests = projects
        .map((project) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
          description: null,
          nestKind: nestKindFromSourceLabel(project.sourceLabel),
          role: project.role,
          updatedAt: coerceDate(project.updatedAt),
        }))
        .filter((project) => isWritingKind(project.nestKind));
    }

    const ownedIds = new Set(ownedNests.map((nest) => nest.id));
    const shared = await listAccessibleStudioProjectSummariesForEmail(actorEmail, prisma);
    sharedNests = shared
      .filter((project) => !ownedIds.has(project.id))
      .map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        nestKind: nestKindFromSourceLabel(project.sourceLabel),
        role: project.role,
        updatedAt: coerceDate(project.updatedAt),
      }))
      .filter((project) => isWritingKind(project.nestKind));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Could not load the notebook desk.";
  }

  const writingNests = [...ownedNests, ...sharedNests].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const normalizedSearch = searchQuery.toLowerCase();
  const documents = writingNests.length > 0
    ? await prisma.studioDocument.findMany({
        where: { projectId: { in: writingNests.map((nest) => nest.id) } },
        select: {
          id: true,
          stableId: true,
          title: true,
          updatedAt: true,
          projectId: true,
          _count: { select: { blocks: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 80,
      })
    : [];
  const blockMatches: BlockMatchRow[] = normalizedSearch && writingNests.length > 0
    ? await prisma.studioDocumentBlock.findMany({
        where: {
          archivedAt: null,
          document: { projectId: { in: writingNests.map((nest) => nest.id) } },
          OR: [
            { body: { contains: searchQuery, mode: "insensitive" } },
            { title: { contains: searchQuery, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          stableId: true,
          order: true,
          title: true,
          body: true,
          document: {
            select: {
              id: true,
              stableId: true,
              title: true,
              projectId: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 20,
      })
    : [];

  const documentsByNest = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    const current = documentsByNest.get(document.projectId) ?? [];
    current.push({
      id: document.id,
      stableId: document.stableId,
      title: document.title,
      updatedAt: document.updatedAt,
      projectId: document.projectId,
      blockCount: document._count.blocks,
    });
    documentsByNest.set(document.projectId, current);
  }

  const latestDocuments = documents.slice(0, 8);
  const visibleWritingNests = normalizedSearch
    ? writingNests.filter((nest) => {
        const nestHaystack = `${nest.name} ${nest.description ?? ""} ${NEST_KIND_LABELS[nest.nestKind]}`.toLowerCase();
        const documentMatch = (documentsByNest.get(nest.id) ?? []).some((document) =>
          `${document.title} ${document.stableId}`.toLowerCase().includes(normalizedSearch),
        );
        return nestHaystack.includes(normalizedSearch) || documentMatch;
      })
    : writingNests;
  const visibleLatestDocuments = normalizedSearch
    ? latestDocuments.filter((document) => {
        const nest = writingNests.find((item) => item.id === document.projectId);
        return `${document.title} ${document.stableId} ${nest?.name ?? ""}`.toLowerCase().includes(normalizedSearch);
      })
    : latestDocuments;

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="p-6 md:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-900">
                <Library size={13} />
                Quipsly Writing Desk
              </div>
              <h1 className="mt-4 max-w-4xl font-serif text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
                One obvious place to write.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                This is the OneNote floor: Nests hold the work, notebooks/pages hold the writing, and Quipsly intelligence stays out of the doorway until you ask for it.
              </p>
              <form action="/notebooks" method="get" className="mt-6 max-w-2xl">
                <label className="flex items-center gap-2 rounded-2xl border border-[#eadfca] bg-[#fffdf9] px-4 py-3 shadow-sm">
                  <Search size={18} className="shrink-0 text-[#8c6b4a]" />
                  <input
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="Search notebooks and recent pages..."
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#b59f7d]"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-[#3d3122] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#5a4530]"
                  >
                    Find
                  </button>
                </label>
              </form>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">1. Choose Nest</div>
                  <p className="mt-2 text-sm leading-6 text-[#6b5b45]">Book, study, research, fiction world, course, or mixed notebook.</p>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">2. Open page</div>
                  <p className="mt-2 text-sm leading-6 text-[#6b5b45]">Recent pages are listed directly. No project archaeology required.</p>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">3. Write</div>
                  <p className="mt-2 text-sm leading-6 text-[#6b5b45]">Tags, research, drafts, and publishing stay attached but secondary.</p>
                </div>
              </div>
            </div>

            <aside className="border-t border-[#eadfca] bg-[#fffaf3] p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-black">New notebook</h2>
                  <p className="mt-1 text-sm leading-6 text-[#7d6a50]">Create a writing or study Nest without leaving the desk.</p>
                </div>
              </div>
              <form action={createNotebook} className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7659]">Title</span>
                  <input
                    name="title"
                    required
                    placeholder="High Ground Odyssey, Marketing Notes, Fiction Lab..."
                    className="mt-2 w-full rounded-2xl border border-[#d9c7a5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a36f2e] focus:ring-2 focus:ring-amber-500/20"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7659]">Kind</span>
                  <select
                    name="kind"
                    defaultValue="Book"
                    className="mt-2 w-full rounded-2xl border border-[#d9c7a5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a36f2e] focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option>Book</option>
                    <option>Article notebook</option>
                    <option>Study notebook</option>
                    <option>Research notebook</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-[#5a4530]"
                >
                  <Sprout size={15} />
                  Create notebook
                </button>
              </form>
            </aside>
          </div>
        </header>

        {loadError ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <h2 className="font-serif text-lg font-black">Notebook desk needs attention</h2>
            <p className="mt-1 text-sm leading-6">{loadError.slice(0, 180)}</p>
          </section>
        ) : null}

        {missingNest || notAllowed ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <h2 className="font-serif text-lg font-black">Page creation needs attention</h2>
            <p className="mt-1 text-sm leading-6">
              {missingNest
                ? "Quipsly could not tell which Nest should receive the new page."
                : "You need editor or owner access before creating pages in that Nest."}
            </p>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-3xl font-black">Your writing Nests</h2>
                <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                  {searchQuery
                    ? `Showing matches for "${searchQuery}".`
                    : "Only writing-capable Nests appear here. Media, gallery, and production Nests still live in Projects."}
                </p>
              </div>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
              >
                <FolderOpen size={14} />
                All Nests
              </Link>
            </div>

            {visibleWritingNests.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {visibleWritingNests.map((nest) => (
                  <NotebookCard
                    key={nest.id}
                    nest={nest}
                    documents={documentsByNest.get(nest.id) ?? []}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-[#eadfca] bg-white p-10 text-center">
                <BookOpen size={34} className="mx-auto text-[#c8a66b]" />
                <h2 className="mt-4 font-serif text-2xl font-black">
                  {searchQuery ? "No notebook matches yet" : "No writing notebooks yet"}
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#7d6a50]">
                  {searchQuery
                    ? "Try a simpler search, or open all Nests if you are looking for media, gallery, or production work."
                    : "Create a notebook above. Quipsly will keep the Nest/document truth underneath, but the door you walk through stays simple."}
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl border border-[#eadfca] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                  <Clock size={18} />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-black">Last touched</h2>
                  <p className="text-xs leading-5 text-[#7d6a50]">Fast retrieval beats cleverness.</p>
                </div>
              </div>
              {visibleLatestDocuments.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {visibleLatestDocuments.map((document) => {
                    const nest = writingNests.find((item) => item.id === document.projectId);
                    if (!nest) return null;
                    return (
                      <Link
                        key={document.id}
                        href={`/create?project=${encodeURIComponent(nest.slug)}&document=${encodeURIComponent(document.id)}`}
                        className="block rounded-2xl border border-[#efe5d2] bg-[#fffdf9] p-3 transition hover:border-[#d5b77d] hover:bg-[#fff8eb]"
                      >
                        <span className="block truncate text-sm font-black text-[#3d3122]">{document.title}</span>
                        <span className="mt-1 block truncate text-[11px] font-bold text-[#8a7659]">{nest.name}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-3 text-sm leading-6 text-[#7d6a50]">
                  Recent pages will appear here once you start writing.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                <Search size={14} />
                Writing rule
              </div>
              <p className="mt-3 text-sm leading-6">
                If this page ever feels harder to understand than OneNote, the clever part is wrong. The notebook path wins.
              </p>
            </div>

            {searchQuery ? (
              <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                  <Search size={14} />
                  Phrase matches
                </div>
                {blockMatches.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {blockMatches.slice(0, 8).map((match) => {
                      const nest = writingNests.find((item) => item.id === match.document.projectId);
                      if (!nest) return null;
                      return (
                        <Link
                          key={match.id}
                          href={`/create?project=${encodeURIComponent(nest.slug)}&document=${encodeURIComponent(match.document.id)}`}
                          className="block rounded-2xl border border-cyan-200 bg-white/80 p-3 transition hover:bg-white"
                        >
                          <span className="block truncate text-sm font-black">{match.document.title}</span>
                          <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-800">
                            {nest.name} · block {match.order + 1}
                          </span>
                          <span className="mt-2 block text-xs leading-5 text-cyan-900/80">
                            {snippetFor(match.body, searchQuery)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl border border-dashed border-cyan-200 bg-white/70 p-3 text-sm leading-6">
                    No block text matched. Title matches, if any, still appear in the notebook list.
                  </p>
                )}
              </div>
            ) : null}

            <div className="rounded-3xl border border-[#eadfca] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">
                <FileText size={14} />
                Source truth
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6b5b45]">
                Drafts, notes, and fixed study sources can sit beside the manuscript. The app should not force every thought into one sacred page.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
