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
  Plus,
  Video,
} from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import {
  createStudioProject,
  HGO_PROJECT_SLUG,
  listStudioProjectOptions,
  NEST_KIND_LABELS,
  normalizeNestKind,
  type StudioNestKind,
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

function iconForNestKind(kind: StudioNestKind) {
  if (kind === "study" || kind === "research") return GraduationCap;
  if (kind === "production") return Video;
  if (kind === "gallery") return Images;
  if (kind === "course") return BookOpen;
  if (kind === "fiction") return FileText;
  return Folder;
}

function colorForNestKind(kind: StudioNestKind) {
  if (kind === "study" || kind === "research") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (kind === "production") return "border-rose-200 bg-rose-50 text-rose-900";
  if (kind === "gallery") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (kind === "course") return "border-violet-200 bg-violet-50 text-violet-900";
  if (kind === "fiction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900";
  if (kind === "mixed") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-[#eadfca] bg-[#fffaf3] text-[#3d3122]";
}

async function createNest(formData: FormData) {
  "use server";

  const name = String(formData.get("name") || "").trim();
  const template = String(formData.get("template") || "writing");
  const documentTitle = String(formData.get("documentTitle") || "").trim();
  if (!name) return;

  const prisma = getPrismaClient();
  const nestKind = normalizeNestKind(template);
  const selectedTemplate = nestTemplates.find((item) => item.value === nestKind);
  const { project } = await createStudioProject(prisma, {
    name,
    nestKind,
    documentTitle: documentTitle || selectedTemplate?.starterTitle || undefined,
  });

  revalidatePath("/projects");
  redirect(`/create?project=${encodeURIComponent(project.slug)}`);
}

export default async function ProjectsHub({
  searchParams,
}: {
  searchParams?: Promise<{ fallback?: string }> | { fallback?: string };
} = {}) {
  const params = await searchParams;
  const isFallback = params?.fallback === "true";

  const prisma = getPrismaClient();
  let projects: Awaited<ReturnType<typeof listStudioProjectOptions>> = [];
  let projectLoadError = "";

  try {
    projects = await listStudioProjectOptions(prisma);
  } catch (error) {
    projectLoadError = error instanceof Error ? error.message : "Could not reach the project registry.";
  }

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
            {process.env.NODE_ENV === "development" || process.env.QUIPSLY_OWNER_OVERRIDE === "true" ? (
              <div className="shrink-0">
                <Link
                  href={`/create?project=${encodeURIComponent(HGO_PROJECT_SLUG)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-[#fffdf9] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
                >
                  <BookOpen size={14} />
                  Open Owner Manuscript
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        {isFallback && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <h3 className="font-serif text-lg font-black text-rose-900">Wait, where is my document?</h3>
            <p className="mt-1 text-sm text-rose-800">
              Quipsly no longer drops people into a shared default manuscript. Choose your Nest below, or create a new private one.
            </p>
          </div>
        )}

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
              body: "Outputs like HGO pages, RSS, clips, courses, and galleries should come from public-safe packets, not raw private notes.",
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
                {projects.length} active
              </div>
            </div>

            {projects.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {projects.map((project) => {
                  const kind = project.nestKind;
                  const Icon = iconForNestKind(kind);
                  return (
                    <Link
                      key={project.id}
                      href={`/create?project=${encodeURIComponent(project.slug)}`}
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
                      <div className="mt-3 rounded-xl border border-[#f0e3ca] bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8a7659]">
                        {project.documentTitle ?? "Living document ready"}
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[#8a7659]">
                        <Clock size={14} />
                        {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "Unknown update"}
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
                  You don't have any Nests yet. Choose a starting shape on the right to create your first secure workspace.
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
