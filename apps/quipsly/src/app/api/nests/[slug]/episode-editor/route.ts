import { NextRequest, NextResponse } from "next/server";
import { PROGRAM_DECISION_KINDS, type ProgramDecisionKind } from "@/lib/editor/program-edit-contract";
import {
  EpisodeEditConflict,
  ensureEpisodeEditBranch,
  loadEpisodeEditDesk,
  saveProgramDecision,
  saveTimelineAnnotation,
  type EditActor,
} from "@/lib/server/episode-edit-store";
import { requireProjectAccess } from "@/lib/server/access";

export const dynamic = "force-dynamic";

function actorFromAccess(access: Awaited<ReturnType<typeof requireProjectAccess>>): EditActor {
  const user = access.user as { id?: string; primaryEmail?: string; displayName?: string | null };
  return {
    userId: user.id,
    email: user.primaryEmail,
    label: user.displayName ?? user.primaryEmail,
    type: "human",
  };
}

async function canWrite(projectSlug: string): Promise<boolean> {
  try {
    await requireProjectAccess(projectSlug, "write");
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await requireProjectAccess(slug, "read");
  const episode = request.nextUrl.searchParams.get("episode") ?? undefined;
  const payload = await loadEpisodeEditDesk(slug, episode, await canWrite(slug));
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const access = await requireProjectAccess(slug, "write");
  const actor = actorFromAccess(access);
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const episodeSlug = String(body.episodeSlug ?? "");
  if (!episodeSlug) return NextResponse.json({ error: "Choose an episode first." }, { status: 400 });

  try {
    if (action === "open-episode") {
      await ensureEpisodeEditBranch(slug, episodeSlug, actor);
    } else if (action === "set-decision") {
      const kind = String(body.kind ?? "") as ProgramDecisionKind;
      if (!PROGRAM_DECISION_KINDS.includes(kind)) {
        return NextResponse.json({ error: "Unknown edit decision." }, { status: 400 });
      }
      await saveProgramDecision({
        projectSlug: slug,
        episodeSlug,
        kind,
        sequenceTime: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        actor,
      });
    } else if (action === "add-annotation") {
      await saveTimelineAnnotation({
        projectSlug: slug,
        episodeSlug,
        sequenceTime: Number(body.sequenceTime ?? 0),
        expectedRevision: Number(body.expectedRevision ?? 0),
        clientRequestId: String(body.clientRequestId ?? crypto.randomUUID()),
        kind: String(body.kind ?? "note"),
        body: String(body.body ?? ""),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        actor,
      });
    } else {
      return NextResponse.json({ error: "Unknown editor action." }, { status: 400 });
    }
    return NextResponse.json(await loadEpisodeEditDesk(slug, episodeSlug, true), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof EpisodeEditConflict) {
      return NextResponse.json({
        error: "Another editor saved a newer change. The shared edit has been refreshed.",
        currentRevision: error.currentRevision,
        payload: await loadEpisodeEditDesk(slug, episodeSlug, true),
      }, { status: 409 });
    }
    throw error;
  }
}
