import Link from "next/link";
import { redirect } from "next/navigation";
import { projectAccessErrorCode, requireProjectAccess } from "@/lib/server/access";
import { loadEpisodeEditDesk } from "@/lib/server/episode-edit-store";

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
  await requireProjectAccess(slug, "read");
  let canEdit = false;
  try {
    await requireProjectAccess(slug, "write");
    canEdit = true;
  } catch (error) {
    if (projectAccessErrorCode(error) === "FORBIDDEN") {
      canEdit = false;
    } else {
      throw error;
    }
  }

  const payload = await loadEpisodeEditDesk(slug, query.episode, canEdit);

  if (payload.selectedEpisode) {
    redirect(`/nests/${encodeURIComponent(slug)}/episodes/${encodeURIComponent(payload.selectedEpisode.slug)}?mode=edit`);
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

  return null;
}
