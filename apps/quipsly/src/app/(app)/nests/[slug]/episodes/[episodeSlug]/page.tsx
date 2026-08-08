import Link from "next/link";
import { notFound } from "next/navigation";

import { projectAccessErrorCode, requireProjectAccess } from "@/lib/server/access";
import { ensureEpisodeEditBranch, loadEpisodeEditDesk, type EditActor } from "@/lib/server/episode-edit-store";
import { loadEpisodeRoomDesk } from "@/lib/server/episode-room-store";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import EpisodeEditorClient from "../../episode-editor/EpisodeEditorClient";
import EpisodeRoomClient from "./EpisodeRoomClient";

export const dynamic = "force-dynamic";

export default async function EpisodeRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; episodeSlug: string }>;
  searchParams?: Promise<{
    mode?: string;
    source?: string;
    storyCard?: string;
    storyPlacement?: string;
  }>;
}) {
  const { slug, episodeSlug } = await params;
  const query = await searchParams;
  const requestedMode = query?.mode;
  const mode = requestedMode === "edit"
    ? "edit"
    : requestedMode === "record"
      ? "record"
      : "plan";
  try {
    await requireProjectAccess(slug, "read");
  } catch (error) {
    const code = projectAccessErrorCode(error);
    if (code === "NOT_FOUND" || code === "FORBIDDEN") notFound();
    throw error;
  }

  let canEdit = false;
  try {
    await requireProjectAccess(slug, "write");
    canEdit = true;
  } catch (error) {
    const code = projectAccessErrorCode(error);
    if (code === "FORBIDDEN") {
      canEdit = false;
    } else if (code === "NOT_FOUND") {
      notFound();
    } else {
      throw error;
    }
  }

  const session = await getQuipslySession();
  const payload = await loadEpisodeRoomDesk(
    slug,
    episodeSlug,
    canEdit,
    session?.user ? {
      userId: session.user.id,
      email: session.user.primaryEmail,
      label: session.user.name || session.user.primaryEmail,
      isStaff: session.user.isStaff,
    } : undefined,
  );
  if (!payload) notFound();

  if (!payload.episode) {
    return (
      <main className="min-h-screen bg-[#07110d] px-6 py-16 text-[#f4eedf]">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#30483d] bg-[#101b16] p-10">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d8ad56]">Episode Room</p>
          <h1 className="mt-4 font-serif text-4xl font-black">This episode is not ready yet.</h1>
          <p className="mt-4 text-[#aab9af]">Create the episode production boundary first, then its text, watch list, chat, and timeline will meet here.</p>
          <Link href={`/nests/${encodeURIComponent(slug)}`} className="mt-8 inline-flex rounded-full bg-[#d8ad56] px-5 py-3 font-black text-[#172018]">Back to the Nest</Link>
        </div>
      </main>
    );
  }

  if (mode === "edit") {
    let editPayload = await loadEpisodeEditDesk(slug, episodeSlug, canEdit, {
      selectedMediaAssetId: query?.source,
    });
    if (canEdit && editPayload.selectedEpisode && !editPayload.branch) {
      const actor: EditActor = {
        userId: session?.user.id,
        email: session?.user.primaryEmail,
        label: session?.user.name || session?.user.primaryEmail || "Quipsly collaborator",
        type: "human",
      };
      await ensureEpisodeEditBranch(slug, editPayload.selectedEpisode.slug, actor);
      editPayload = await loadEpisodeEditDesk(slug, editPayload.selectedEpisode.slug, canEdit, {
        selectedMediaAssetId: query?.source,
      });
    }

    const recordingRoomId = payload.room.session?.recordingRoomId
      || payload.recordingSessions.find((recording) => recording.status === "RECORDING")?.id
      || payload.recordingSessions[0]?.id
      || null;

    return <EpisodeEditorClient
      initialPayload={editPayload}
      projectName={payload.project.name}
      canonicalWorkspace
      recordingRoomId={recordingRoomId}
      initialStoryCardId={query?.storyCard}
      initialStoryPlacementId={query?.storyPlacement}
    />;
  }

  return <EpisodeRoomClient initialPayload={payload} initialMode={mode} />;
}
