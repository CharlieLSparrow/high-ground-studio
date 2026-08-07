import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { readSourceStoryWorkspace } from "@/lib/server/source-story";
import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
  roleAllowsAction,
} from "@/lib/server/studio-project-access";

import { SourceStoryClient } from "./SourceStoryClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Source Story - Quipsly",
  description: "Browse source media, mark exact ranges, and arrange source-backed story cards without changing originals.",
};

export default async function SourceStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ asset?: string | string[]; external?: string | string[]; board?: string | string[] }>;
}) {
  const [{ slug }, query, session] = await Promise.all([params, searchParams, getQuipslySession()]);
  if (!session?.user.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/nests/${slug}/story`)}`);
  const actorEmail = normalizeAccessEmail(session.user.primaryEmail || session.user.email);
  const prisma = getPrismaClient();
  const project = await findStudioProjectForAccess(slug, prisma);
  if (!project) notFound();
  const access = await resolveStudioProjectAccess({ projectSlug: slug, email: actorEmail, action: "read", prisma });
  if (!access.allowed || !access.projectId) notFound();
  const canWrite = Boolean(access.role && roleAllowsAction(access.role, "write"));

  try {
    const [assets, tags, episodes, workspace] = await Promise.all([
      prisma.studioMediaAsset.findMany({
        where: {
          OR: [
            { projects: { some: { id: project.id } } },
            { mediaBin: { projectId: project.id } },
            { assetAttachments: { some: { projectId: project.id } } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { filename: "asc" }],
        take: 500,
        select: {
          id: true,
          filename: true,
          url: true,
          mimeType: true,
          sizeBytes: true,
          duration: true,
          resolution: true,
          fps: true,
          thumbnailUrl: true,
          isProxy: true,
          updatedAt: true,
          _count: { select: { clips: true, variants: true } },
        },
      }),
      prisma.studioTag.findMany({
        where: { projectId: project.id, isActive: true },
        orderBy: [{ category: "asc" }, { label: "asc" }],
        take: 200,
        select: { id: true, label: true, slug: true, category: true },
      }),
      prisma.studioEpisodeProduction.findMany({
        where: { projectId: project.id },
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        take: 100,
        select: { id: true, slug: true, title: true, status: true },
      }),
      readSourceStoryWorkspace(prisma, project.id),
    ]);
    const requestedAssetId = typeof query.asset === "string" ? query.asset : null;
    const requestedExternalReferenceId = typeof query.external === "string" ? query.external : null;
    const selectedExternalReferenceId = workspace.externalSources.some((source) => source.id === requestedExternalReferenceId)
      ? requestedExternalReferenceId
      : null;
    const requestedBoardId = typeof query.board === "string" ? query.board : null;
    const selectedAssetId = selectedExternalReferenceId ? null : assets.some((asset) => asset.id === requestedAssetId)
      ? requestedAssetId
      : assets[0]?.id ?? null;
    const selectedBoardId = workspace.boards.some((board) => board.id === requestedBoardId)
      ? requestedBoardId
      : workspace.boards[0]?.id ?? null;

    return (
      <SourceStoryClient
        project={{ id: project.id, slug: project.slug, name: project.name }}
        canWrite={canWrite}
        initialAssets={assets.map((asset) => ({
          ...asset,
          sizeBytes: asset.sizeBytes?.toString() ?? null,
          updatedAt: asset.updatedAt.toISOString(),
        }))}
        tags={tags}
        episodes={episodes}
        initialWorkspace={workspace}
        initialAssetId={selectedAssetId}
        initialExternalReferenceId={selectedExternalReferenceId}
        initialBoardId={selectedBoardId}
      />
    );
  } catch (error) {
    console.error("[source-story-page] canonical workspace unavailable", error);
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-[#3d3122]">
        <Link href={`/nests/${encodeURIComponent(slug)}?view=media`} className="text-xs font-black uppercase tracking-wide text-[#76522c] hover:underline">Return to project media</Link>
        <section role="status" className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-7">
          <p className="text-xs font-black uppercase tracking-wide text-amber-800">Source workspace unavailable</p>
          <h1 className="mt-2 font-serif text-3xl font-black">No source or story state was changed.</h1>
          <p className="mt-3 font-semibold leading-6 text-[#765f40]">Quipsly could not verify the canonical source-story tables. It did not substitute a sample storyboard or save browser-only cards.</p>
        </section>
      </main>
    );
  }
}
