import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Camera,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  MessageCircle,
  Mic,
  PackageCheck,
  PanelsTopLeft,
  Radio,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getOutputFamilyLabel, listOutputsForNestKind } from "@high-ground/quipsly-domain/output-catalog";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  listStudioProjectAccessGrants,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
} from "@/lib/server/studio-project-access";
import {
  PRIVATE_FICTION_ISSUE_SLUG,
  PRIVATE_FICTION_PROJECT_SLUG,
  PRIVATE_FICTION_SERIES_SLUG,
} from "@/lib/fiction/private-fiction-access";
import {
  NEST_KIND_LABELS,
  WORKFLOW_SYSTEM_DESCRIPTIONS,
  WORKFLOW_SYSTEM_LABELS,
  nestKindFromSourceLabel,
  workflowSystemForNestKind,
  type QuipslyWorkflowSystem,
  type StudioNestKind,
} from "@/lib/studio/project-registry";

export const dynamic = "force-dynamic";

type NestDashboardPageProps = {
  params: Promise<{ slug: string }>;
};

function cardTint(kind: StudioNestKind) {
  if (kind === "home") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (kind === "study" || kind === "research") return "border-cyan-200 bg-cyan-50 text-cyan-950";
  if (kind === "production") return "border-rose-200 bg-rose-50 text-rose-950";
  if (kind === "gallery") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (kind === "course") return "border-violet-200 bg-violet-50 text-violet-950";
  if (kind === "fiction") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950";
  if (kind === "mixed") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-[#eadfca] bg-[#fffaf3] text-[#3d3122]";
}

function workflowTint(system: QuipslyWorkflowSystem) {
  if (system === "data-ingestion") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (system === "knowledge-processing") return "border-purple-200 bg-purple-50 text-purple-900";
  if (system === "content-creation") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function workCopy(slug: string, kind: StudioNestKind) {
  if (slug === "high-ground-odyssey-manuscript") {
    return [
      "Write and structure the book/manuscript.",
      "Open episode production when media is ready.",
      "Publish public-safe episode packets to HighGroundOdyssey.com.",
    ];
  }

  if (slug === "marine-biology-research") {
    return [
      "Attach research-photo batches, source folders, and dataset manifests to this shared Nest.",
      "Capture organism IDs, visible evidence, uncertainty, reviewer notes, and provenance before any model work.",
      "Use the future Mac Vision Lab for local-heavy image workflows when the data is organized enough to train safely.",
    ];
  }

  if (slug === "quiplore-quote-library") {
    return [
      "Collect quote sources, attributions, and disputed variants.",
      "Prepare reusable quote packets for QuipLore and social publishing.",
      "Let Quipslys find examples and receipts without replacing your judgement.",
    ];
  }

  if (slug === "homer-travel-footage") {
    return [
      "Import travel footage into the Home Nest or this shared footage Nest.",
      "Tag usable moments, clips, and candidate social cuts.",
      "Move synced clips into the editor when a story or episode emerges.",
    ];
  }

  if (kind === "home") {
    return [
      "Drop unsorted uploads here first.",
      "Attach assets to working Nests once you know where they belong.",
      "Share this Home Nest only deliberately because it is your intake area.",
    ];
  }

  if (kind === "fiction") {
    return [
      "Hold private fiction source materials, seed packets, story bibles, characters, scenes, and continuity maps.",
      "Project comic packets into story bible, storyboard, and phone-first scroll previews without duplicating truth.",
      "Keep access private until you intentionally invite collaborators through this Nest's access page.",
    ];
  }

  if (kind === "gallery") {
    return [
      "Group photos into client-friendly sets.",
      "Track selects, comments, and delivery notes.",
      "Publish proofing experiences when the gallery workflow is ready.",
    ];
  }

  return [
    "Open the living document and start shaping the work.",
    "Attach media, research, or publishing outputs as the work becomes clearer.",
    "Invite collaborators when this Nest is ready to become shared work.",
  ];
}

function documentActionLabel(kind: StudioNestKind) {
  if (kind === "study" || kind === "research") return "Open study document";
  if (kind === "production") return "Open production notes";
  if (kind === "fiction") return "Open story bible";
  if (kind === "gallery") return "Open gallery notes";
  if (kind === "home") return "Open home vault";
  return "Open manuscript";
}

function defaultEpisodeForNest(slug: string) {
  if (slug === "high-ground-odyssey-manuscript") return "episode-4";
  return "current-episode";
}

function ToolCard({
  href,
  title,
  description,
  icon: Icon,
  disabled = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  disabled?: boolean;
}) {
  const body = (
    <div className="h-full rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d5b77d] hover:bg-[#fff8eb] hover:shadow-md">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
          <Icon size={20} />
        </div>
        <h3 className="font-serif text-xl font-black text-[#3d3122]">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-[#6b5b45]">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
        {disabled ? "Not yet" : "Open"}
        {!disabled ? <ExternalLink size={13} /> : null}
      </div>
    </div>
  );

  if (disabled) return <div className="opacity-60">{body}</div>;
  return <Link href={href}>{body}</Link>;
}

export default async function NestDashboardPage({ params }: NestDashboardPageProps) {
  const { slug } = await params;
  const session = await auth();
  const actorEmail = normalizeAccessEmail(session?.user?.primaryEmail || session?.user?.email);

  if (!actorEmail) {
    redirect(`/api/auth/signin?callbackUrl=/nests/${encodeURIComponent(slug)}`);
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

  const [documents, grants] = await Promise.all([
    prisma.studioDocument.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        stableId: true,
        title: true,
        updatedAt: true,
        _count: { select: { blocks: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    listStudioProjectAccessGrants(project.slug, prisma),
  ]);

  const nestKind = nestKindFromSourceLabel(project.sourceLabel);
  const workflowSystem = workflowSystemForNestKind(nestKind);
  const outputs = listOutputsForNestKind(nestKind === "home" ? "study" : nestKind).slice(0, 6);
  const canWrite = access.role ? roleAllowsAction(access.role, "write") : false;
  const canManage = access.role ? roleAllowsAction(access.role, "manage") : false;
  const activeCollaborators = grants.filter((grant) => grant.status === "ACTIVE");
  const episodeSlug = defaultEpisodeForNest(project.slug);

  return (
    <main className="min-h-full bg-[#fdfaf6] px-4 py-6 text-[#3d3122] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
        >
          <ArrowLeft size={14} />
          Back to all Nests
        </Link>

        <header className="overflow-hidden rounded-3xl border border-[#e8dcc4] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-6 md:p-8">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                Live Nest Control Room
              </div>
              <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
                {project.name}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6b5b45] md:text-base">
                {project.description || "This Nest connects documents, media, collaborators, outputs, and assistant context for one body of real work."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${cardTint(nestKind)}`}>
                  {NEST_KIND_LABELS[nestKind]}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${workflowTint(workflowSystem)}`}>
                  {WORKFLOW_SYSTEM_LABELS[workflowSystem]}
                </span>
                <span className="rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
                  Your role: {access.role}
                </span>
              </div>
            </div>

            <aside className="border-t border-[#eadfca] bg-[#fffaf3] p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-black">Real-work status</h2>
                  <p className="mt-1 text-xs leading-5 text-[#7d6a50]">
                    Transparent availability, not judgement gates.
                  </p>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3">
                  <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">Documents</dt>
                  <dd className="mt-1 font-serif text-2xl font-black">{documents.length}</dd>
                </div>
                <div className="rounded-2xl border border-[#eadfca] bg-white p-3">
                  <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a]">People</dt>
                  <dd className="mt-1 font-serif text-2xl font-black">{activeCollaborators.length}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </header>

        <section className="rounded-3xl border border-[#e8dcc4] bg-[#fffdf9] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#a36f2e]">
                First thing to do in this Nest
              </div>
              <h2 className="mt-2 font-serif text-3xl font-black text-[#3d3122]">
                Open the document. Chat and collaborators are already attached.
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b5b45]">
                The document is the living work surface. Nest Chat follows this same Nest slug on manuscript, editor, recorder, and call routes, so conversations stay with the project instead of floating off into space like a poorly supervised raccoon.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/create?project=${encodeURIComponent(project.slug)}`}
                className="inline-flex items-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3] shadow-sm transition hover:-translate-y-0.5"
              >
                <BookOpen size={14} />
                Open document
              </Link>
              <Link
                href={`/nests/${encodeURIComponent(project.slug)}/access`}
                className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb]"
              >
                <Users size={14} />
                {canManage ? "Invite collaborator" : "View collaborators"}
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ["1", "Document", "Write, study, tag, and organize the work."],
              ["2", "Chat", "Use the Nest Chat button in the bottom-right corner for the shared thread."],
              ["3", "Media tools", "Open the editor or recorder when audio/video belongs to this Nest."],
              ["4", "Access", canManage ? "Invite collaborators by email whenever you are ready." : "You can see collaborators; an owner handles invites."],
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ToolCard
            href={`/create?project=${encodeURIComponent(project.slug)}`}
            title={documentActionLabel(nestKind)}
            description="The one living document spine: write, study, tag Chapter/Episode structure, annotate, and let Quipslys assist transparently."
            icon={BookOpen}
          />
          <ToolCard
            href={`/editor?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episodeSlug)}`}
            title="Open media editor"
            description="Import audio/video, set spine audio, sync clips, build timelines, and prepare episode or social outputs attached to this Nest."
            icon={Film}
          />
          <ToolCard
            href={`/recorder?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episodeSlug)}`}
            title="Open recorder"
            description="Record or prepare live sessions with the manuscript nearby, then hydrate the editor from the same project/episode payload."
            icon={Mic}
          />
          <ToolCard
            href={`/nests/${encodeURIComponent(project.slug)}/access`}
            title="Invite collaborators"
            description={canManage ? "Grant viewer/editor/owner access by email, even before the person creates an account." : "View who has access. Owners can invite or revoke collaborators."}
            icon={Users}
          />
          <div className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-white p-3 text-[#8c6b4a]">
                <MessageCircle size={20} />
              </div>
              <h3 className="font-serif text-xl font-black text-[#3d3122]">Open Nest Chat</h3>
            </div>
            <p className="text-sm leading-6 text-[#6b5b45]">
              Use the fixed Nest Chat button in the bottom-right corner. It stays attached to <strong>{project.slug}</strong> across document, editor, recorder, and call routes.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#8c6b4a]">
              Bottom-right button
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">What this Nest is for</h2>
                <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                  This is a plain-English map of available work, not a pass/fail checklist.
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {workCopy(project.slug, nestKind).map((item) => (
                <div key={item} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 text-sm leading-6 text-[#6b5b45]">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <aside className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <PackageCheck size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Output paths</h2>
                <p className="mt-1 text-sm leading-6 text-[#7d6a50]">
                  Places this Nest can eventually publish or package work.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {outputs.map((output) => (
                <div key={output.id} className="rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-3">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#a36f2e]">
                    {getOutputFamilyLabel(output.family)}
                  </div>
                  <div className="mt-1 font-bold text-[#3d3122]">{output.title}</div>
                  <p className="mt-1 text-xs leading-5 text-[#7d6a50]">{output.description}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <FileText size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Documents</h2>
                <p className="mt-1 text-sm text-[#7d6a50]">Open the current document spine for this Nest.</p>
              </div>
            </div>
            <div className="space-y-3">
              {documents.map((document) => (
                <Link
                  key={document.id}
                  href={`/create?project=${encodeURIComponent(project.slug)}`}
                  className="block rounded-2xl border border-[#eadfca] bg-[#fffdf9] p-4 transition hover:border-[#d5b77d] hover:bg-[#fff8eb]"
                >
                  <div className="font-serif text-xl font-black text-[#3d3122]">{document.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#8c6b4a]">
                    <span className="rounded-full border border-[#eadfca] bg-white px-2 py-1">{document._count.blocks} blocks</span>
                    <span className="rounded-full border border-[#eadfca] bg-white px-2 py-1">Updated {document.updatedAt.toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
              {documents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#eadfca] bg-[#fffaf3] p-5 text-sm leading-6 text-[#7d6a50]">
                  <h3 className="font-serif text-xl font-black text-[#3d3122]">No document is listed yet.</h3>
                  <p className="mt-2">
                    Open the document surface anyway. Quipsly can seed or recover the living document for this Nest from there.
                  </p>
                  <Link
                    href={`/create?project=${encodeURIComponent(project.slug)}`}
                    className="mt-4 inline-flex rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#fffaf3]"
                  >
                    Open document surface
                  </Link>
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-3xl border border-[#e8dcc4] bg-white p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-[#eadfca] bg-[#fffaf3] p-3 text-[#8c6b4a]">
                <Boxes size={22} />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-black">Connected tools</h2>
                <p className="mt-1 text-sm text-[#7d6a50]">Use the same Nest slug across heavy tools.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolCard
                href={`/call?project=${encodeURIComponent(project.slug)}&episode=${encodeURIComponent(episodeSlug)}&room=${encodeURIComponent(episodeSlug)}&role=host`}
                title="Live call room"
                description="Host a browser recording call attached to this Nest and episode slug."
                icon={Radio}
              />
              <ToolCard
                href={`/publishing-suite/package-builder?project=${encodeURIComponent(project.slug)}`}
                title="Package builder"
                description="Prepare output packets and publishing surfaces from this Nest."
                icon={Share2}
              />
              <ToolCard
                href={`/media?projectId=${encodeURIComponent(project.id)}`}
                title="Media library"
                description="Browse assets attached to this Nest. Personal uploads start in Home Nest, then attach here when the project needs them."
                icon={Camera}
              />
              <ToolCard
                href="/outputs"
                title="Output catalog"
                description="See what Quipsly can create from this kind of work."
                icon={FolderOpen}
              />
              {project.slug === PRIVATE_FICTION_PROJECT_SLUG ? (
                <>
                  <ToolCard
                    href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}`}
                    title="Private comic packet"
                    description="Open the current fiction seed packet, story bible entities, import refresh action, and private source-material overview."
                    icon={BookOpen}
                  />
                  <ToolCard
                    href={`/fiction-tools/private/${PRIVATE_FICTION_SERIES_SLUG}/${PRIVATE_FICTION_ISSUE_SLUG}/scroll`}
                    title="Scroll preview"
                    description="Preview the phone-first comic/story flow while keeping the private source packet guarded by Nest access."
                    icon={PanelsTopLeft}
                  />
                  <ToolCard
                    href="/storyboards/builder"
                    title="Storyboard builder"
                    description="Open the storyboard workspace for comic panels, visual beats, and future media-generation planning."
                    icon={FileText}
                  />
                </>
              ) : null}
            </div>
          </article>
        </section>

        {!canWrite ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 shadow-sm">
            You have read access to this Nest. Ask an owner for editor access before changing manuscript, media, or publishing state.
          </section>
        ) : null}
      </div>
    </main>
  );
}
