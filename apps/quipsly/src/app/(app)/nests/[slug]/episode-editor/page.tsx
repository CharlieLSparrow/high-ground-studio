import Link from "next/link";
import { requireProjectAccess } from "@/lib/server/access";
import { ensureEpisodeEditBranch, loadEpisodeEditDesk, type EditActor } from "@/lib/server/episode-edit-store";
import EpisodeEditorClient from "./EpisodeEditorClient";

export const dynamic = "force-dynamic";

export default async function SharedEpisodeEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ episode?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const readAccess = await requireProjectAccess(slug, "read");
  let canEdit = false;
  try {
    await requireProjectAccess(slug, "write");
    canEdit = true;
  } catch {
    canEdit = false;
  }

  let payload = await loadEpisodeEditDesk(slug, query.episode, canEdit);
  if (canEdit && payload.selectedEpisode && !payload.branch) {
    const user = readAccess.user as { id?: string; primaryEmail?: string; displayName?: string | null };
    const actor: EditActor = {
      userId: user.id,
      email: user.primaryEmail,
      label: user.displayName ?? user.primaryEmail,
      type: "human",
    };
    await ensureEpisodeEditBranch(slug, payload.selectedEpisode.slug, actor);
    payload = await loadEpisodeEditDesk(slug, payload.selectedEpisode.slug, canEdit);
  }

  if (!payload.selectedEpisode) {
    return (
      <main className="min-h-screen bg-[#07110d] px-6 py-16 text-[#f2ead8]">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[#31483b] bg-[#101b15] p-10">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d8ad56]">Shared episode editor</p>
          <h1 className="mt-4 font-serif text-4xl">This Nest has no episodes yet.</h1>
          <p className="mt-4 text-[#b7c4b8]">Create an episode production first. Its protected sync baseline will appear here automatically.</p>
          <Link href={`/nests/${slug}`} className="mt-8 inline-flex rounded-full bg-[#d8ad56] px-5 py-3 font-bold text-[#172018]">Back to the Nest</Link>
        </div>
      </main>
    );
  }

  return <EpisodeEditorClient initialPayload={payload} />;
}
