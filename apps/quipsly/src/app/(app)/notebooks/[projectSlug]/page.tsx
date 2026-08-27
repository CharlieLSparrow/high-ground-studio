import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  NotebookPen,
  Plus,
  ScrollText,
  Search,
  StickyNote,
} from "lucide-react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";
import { personalWritingDocumentVisibilityWhere } from "@/lib/server/personal-writing-documents";
import {
  NEST_KIND_LABELS,
  nestKindFromSourceLabel,
  workflowSystemForNestKind,
  WORKFLOW_SYSTEM_LABELS,
  type StudioNestKind,
} from "@/lib/studio/project-registry";
import { createNotebookPage } from "../actions";

export const dynamic = "force-dynamic";

type NotebookDocumentRow = {
  id: string;
  stableId: string;
  title: string;
  sourceLabel: string | null;
  updatedAt: Date;
  _count: { blocks: number };
  blocks: {
    id: string;
    order: number;
    title: string | null;
    body: string;
  }[];
};

type NotebookSection = {
  id: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
  newPageKind: string;
  emptyText: string;
};

const NOTEBOOK_SECTIONS: NotebookSection[] = [
  {
    id: "manuscript",
    label: "Manuscript pages",
    description: "Chapters, episode writing, article bodies, and living draft pages.",
    icon: BookOpen,
    newPageKind: "writing-page",
    emptyText: "No manuscript pages yet. Start with one calm page.",
  },
  {
    id: "drafts",
    label: "Drafts",
    description: "Working passes, alternate versions, examples, outlines, and experiments.",
    icon: ScrollText,
    newPageKind: "draft",
    emptyText: "No drafts yet. This is where messy-but-useful versions can live.",
  },
  {
    id: "notes",
    label: "Notes",
    description: "Loose thoughts, meeting notes, coaching ideas, and quick capture.",
    icon: StickyNote,
    newPageKind: "note",
    emptyText: "No notes yet. Capture first, organize later.",
  },
  {
    id: "sources",
    label: "Sources and research",
    description: "Study sources, research packets, imported text, references, and evidence.",
    icon: FileText,
    newPageKind: "study-source",
    emptyText: "No sources yet. Fixed documents and source notes can land here.",
  },
];

function sectionIdForDocument(document: NotebookDocumentRow) {
  const label = (document.sourceLabel || "").toLowerCase();
  if (label.includes("study") || label.includes("source") || label.includes("research")) return "sources";
  if (label.includes("note")) return "notes";
  if (label.includes("draft") || label.includes("article") || label.includes("outline")) return "drafts";
  return "manuscript";
}

function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function bodyPreview(document: NotebookDocumentRow) {
  const block = document.blocks[0];
  if (!block) return "Blank page. Open it and start writing.";
  const text = [block.title, block.body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.slice(0, 180) || "Blank page. Open it and start writing.";
}

function NewPageForm({
  projectSlug,
  kind,
  compact = false,
}: {
  projectSlug: string;
  kind: string;
  compact?: boolean;
}) {
  return (
    <form action={createNotebookPage} className={compact ? "mt-3" : "mt-5"}>
      <input type="hidden" name="projectSlug" value={projectSlug} />
      <input type="hidden" name="kind" value={kind} />
      <div className={compact ? "flex gap-2" : "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"}>
        <input
          name="title"
          placeholder={compact ? "New page title..." : "New page, note, draft, or source title..."}
          className="min-w-0 rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-800"
        >
          <Plus size={13} />
          New
        </button>
      </div>
    </form>
  );
}

function PageCard({
  document,
  projectSlug,
}: {
  document: NotebookDocumentRow;
  projectSlug: string;
}) {
  return (
    <Link
      href={`/create?project=${encodeURIComponent(projectSlug)}&document=${encodeURIComponent(document.id)}`}
      className="group block rounded-2xl border border-[#eadfca] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#cfa66f] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-xl font-black leading-tight text-[#3d3122]">
            {document.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#6b5b45]">
            {bodyPreview(document)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#eadfca] bg-[#fffaf3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#7d6a50]">
          {document._count.blocks} blocks
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#8a7659]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffaf3] px-2.5 py-1">
          <Clock size={12} />
          {formatUpdatedAt(document.updatedAt)}
        </span>
        <span className="rounded-full bg-[#fffaf3] px-2.5 py-1">
          {document.sourceLabel || "writing-page"}
        </span>
        <span className="text-[#a36f2e] opacity-0 transition group-hover:opacity-100">
          Open in editor
        </span>
      </div>
    </Link>
  );
}

export default async function NotebookNestPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const resolvedParams = await params;
  const projectSlug = decodeURIComponent(resolvedParams.projectSlug);
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);
  const actorUserId = session?.user?.id;

  if (!actorEmail || !actorUserId) {
    redirect(`/login?callbackUrl=/notebooks/${encodeURIComponent(projectSlug)}`);
  }

  const prisma = getPrismaClient();
  const readAccess = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "read",
    prisma,
  });

  if (!readAccess.allowed) {
    redirect(`/notebooks?notAllowed=1`);
  }

  const project = await prisma.studioProject.findFirst({
    where: { slug: projectSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sourceLabel: true,
      updatedAt: true,
    },
  });

  if (!project) {
    redirect("/notebooks?missingNest=1");
  }

  const writeAccess = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "write",
    prisma,
  });
  const canWrite = writeAccess.allowed;
  const nestKind = nestKindFromSourceLabel(project.sourceLabel);
  const workflow = workflowSystemForNestKind(nestKind);
  const documents = await prisma.studioDocument.findMany({
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
      _count: { select: { blocks: true } },
      blocks: {
        where: { archivedAt: null },
        select: { id: true, order: true, title: true, body: true },
        orderBy: { order: "asc" },
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const documentsBySection = new Map<string, NotebookDocumentRow[]>();
  for (const section of NOTEBOOK_SECTIONS) {
    documentsBySection.set(section.id, []);
  }
  for (const document of documents) {
    const sectionId = sectionIdForDocument(document);
    documentsBySection.get(sectionId)?.push(document);
  }

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/notebooks"
            className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
          >
            <ArrowLeft size={14} />
            Writing Desk
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/create?project=${encodeURIComponent(project.slug)}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:bg-[#5a4530]"
            >
              <NotebookPen size={14} />
              Open Editor
            </Link>
            <Link
              href={`/nests/${encodeURIComponent(project.slug)}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
            >
              <FolderOpen size={14} />
              Nest Dashboard
            </Link>
          </div>
        </div>

        <header className="overflow-hidden rounded-[2rem] border border-[#e8dcc4] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="p-6 md:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-900">
                <BookOpen size={13} />
                {NEST_KIND_LABELS[nestKind as StudioNestKind]} notebook
              </div>
              <h1 className="mt-4 max-w-4xl font-serif text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
                {project.name}
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                {project.description || "A calm notebook map for manuscript pages, drafts, notes, and source material. The clever Quipsly graph can hum in the walls; this room stays easy to walk through."}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">Pages</div>
                  <p className="mt-2 text-2xl font-black text-[#3d3122]">{documents.length}</p>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">Workflow</div>
                  <p className="mt-2 text-sm font-black text-[#3d3122]">{WORKFLOW_SYSTEM_LABELS[workflow]}</p>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a36f2e]">Access</div>
                  <p className="mt-2 text-sm font-black text-[#3d3122]">{canWrite ? "Can write" : "Read only"}</p>
                </div>
              </div>
            </div>

            <aside className="border-t border-[#eadfca] bg-[#fffaf3] p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-black">Quick capture</h2>
                  <p className="mt-1 text-sm leading-6 text-[#7d6a50]">Make a page first. Decide what it is later.</p>
                </div>
              </div>
              {canWrite ? (
                <NewPageForm projectSlug={project.slug} kind="note" />
              ) : (
                <p className="mt-5 rounded-2xl border border-[#eadfca] bg-white p-4 text-sm leading-6 text-[#7d6a50]">
                  You can read this notebook. Ask an owner for editor access before creating pages.
                </p>
              )}
              <Link
                href={`/notebooks?q=${encodeURIComponent(project.name)}`}
                className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] hover:text-[#3d3122]"
              >
                <Search size={14} />
                Search this notebook from the desk
              </Link>
            </aside>
          </div>
        </header>

        <section className="grid gap-5">
          {NOTEBOOK_SECTIONS.map((section) => {
            const Icon = section.icon;
            const sectionDocuments = documentsBySection.get(section.id) ?? [];
            return (
              <article key={section.id} className="rounded-[1.75rem] border border-[#eadfca] bg-[#fffdf9] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="shrink-0 rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-serif text-2xl font-black leading-tight">{section.label}</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#7d6a50]">{section.description}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-[#eadfca] bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7d6a50]">
                    {sectionDocuments.length} pages
                  </span>
                </div>

                {canWrite ? (
                  <NewPageForm projectSlug={project.slug} kind={section.newPageKind} compact />
                ) : null}

                {sectionDocuments.length > 0 ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {sectionDocuments.map((document) => (
                      <PageCard key={document.id} document={document} projectSlug={project.slug} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl border border-dashed border-[#eadfca] bg-white p-4 text-sm leading-6 text-[#7d6a50]">
                    {section.emptyText}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
