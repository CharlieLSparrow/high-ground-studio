import Link from "next/link";
import { BookOpenText, CircleAlert, ShieldCheck } from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import { getCurrentHomeNestActorEmail } from "@/lib/server/home-nest";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { ReadModeManuscript } from "./ReadModeManuscript";
import { RecorderBottomBar } from "./RecorderBottomBar";
import { WakeLockManager } from "./WakeLockManager";
import { mapPersistedReadBlocks } from "./read-mode-model";

export const dynamic = "force-dynamic";

type ReadContextResult =
  | {
      state: "ready";
      projectTitle: string;
      episodeTitle: string;
      blocks: ReturnType<typeof mapPersistedReadBlocks>;
      accessRole: string;
    }
  | { state: "signed-out" }
  | { state: "not-found" }
  | { state: "unavailable"; message: string };

function safeReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The manuscript database connection is unavailable.";
  }
  return "Quipsly could not load this manuscript safely.";
}

export async function fetchEpisodeContext(
  projectSlug: string,
  episodeSlug: string,
): Promise<ReadContextResult> {
  const actorEmail = await getCurrentHomeNestActorEmail();
  if (!actorEmail) return { state: "signed-out" };

  const prisma = getPrismaClient();
  try {
    const access = await resolveStudioProjectAccess({
      projectSlug,
      email: actorEmail,
      action: "read",
      prisma,
    });
    if (!access.allowed || !access.projectId) return { state: "not-found" };

    const episode = await prisma.studioEpisodeProduction.findFirst({
      where: {
        projectId: access.projectId,
        slug: episodeSlug,
      },
      include: {
        project: { select: { name: true } },
        document: {
          include: {
            blocks: {
              where: { archivedAt: null },
              orderBy: { order: "asc" },
              select: {
                stableId: true,
                title: true,
                body: true,
              },
            },
          },
        },
      },
    });
    if (!episode?.document) return { state: "not-found" };

    return {
      state: "ready",
      projectTitle: episode.project.name,
      episodeTitle: episode.title,
      blocks: mapPersistedReadBlocks(episode.document.blocks),
      accessRole: access.role || "VIEWER",
    };
  } catch (error) {
    console.error("[read] Failed to load authorized episode manuscript", error);
    return { state: "unavailable", message: safeReadError(error) };
  }
}

function ReadState({
  eyebrow,
  title,
  detail,
  signedOut = false,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  signedOut?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f3e7] px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl border border-[#e5d5b7] bg-white p-8 shadow-sm" role="status">
        <BookOpenText className="h-9 w-9 text-[#76522c]" aria-hidden="true" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-[#987443]">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-4xl font-black text-[#3d3122]">{title}</h1>
        <p className="mt-3 font-semibold leading-relaxed text-[#765f40]">{detail}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {signedOut && <Link href="/login?callbackUrl=%2Fread" className="rounded-full bg-[#3e2f21] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white">Sign in</Link>}
          <Link href="/projects" className="rounded-full border border-[#d9c7a5] bg-[#fffaf1] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-[#5b472f]">Choose a Nest</Link>
        </div>
      </section>
    </main>
  );
}

export default async function ReadModePage({
  searchParams,
}: {
  searchParams: Promise<{ projectSlug?: string; episodeSlug?: string }>;
}) {
  const { projectSlug, episodeSlug } = await searchParams;
  if (!projectSlug || !episodeSlug) {
    return (
      <ReadState
        eyebrow="Read mode"
        title="Choose a real episode manuscript."
        detail="Open Read mode from an episode inside an accessible Nest. Quipsly no longer opens a blank page or inserts sample media when no manuscript was selected."
      />
    );
  }

  const context = await fetchEpisodeContext(projectSlug, episodeSlug);
  if (context.state === "signed-out") {
    return (
      <ReadState
        eyebrow="Private manuscript"
        title="Sign in before reading this episode."
        detail="Read mode follows the same Nest access grants as the writing desk. A guessed project or episode slug is not enough."
        signedOut
      />
    );
  }
  if (context.state === "not-found") {
    return (
      <ReadState
        eyebrow="Episode unavailable"
        title="This manuscript is not available to this account."
        detail="The episode may have moved, or this account may not have an active Nest grant. Quipsly does not reveal private manuscript details from guessed links."
      />
    );
  }
  if (context.state === "unavailable") {
    return (
      <ReadState
        eyebrow="Read mode unavailable"
        title="No sample manuscript is standing in."
        detail={`${context.message} Your persisted blocks and source media have not been changed.`}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black selection:bg-red-500/30">
      <WakeLockManager />
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-900/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto max-w-prose">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-zinc-400">{context.projectTitle}</h3>
              <h1 className="truncate text-lg font-semibold text-zinc-100">{context.episodeTitle}</h1>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300">
              <ShieldCheck size={13} aria-hidden="true" /> {context.accessRole} access
            </span>
          </div>
          <p className="mt-2 flex items-center gap-2 text-[11px] font-bold text-zinc-500">
            <CircleAlert size={13} aria-hidden="true" /> Persisted manuscript blocks only. No sample clip or placeholder media is inserted.
          </p>
        </div>
      </header>
      <main>
        {context.blocks.length > 0 ? (
          <ReadModeManuscript blocks={context.blocks} />
        ) : (
          <div className="mx-auto max-w-prose px-6 py-24 text-center text-zinc-400">
            <h2 className="text-2xl font-black text-zinc-100">This episode has no active manuscript blocks yet.</h2>
            <p className="mt-3 font-semibold">Add persisted writing in its Nest before using Read mode.</p>
          </div>
        )}
      </main>
      <RecorderBottomBar projectSlug={projectSlug} episodeSlug={episodeSlug} />
    </div>
  );
}
