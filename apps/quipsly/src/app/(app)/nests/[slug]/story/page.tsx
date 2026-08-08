import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { readSourceStoryWorkspace } from "@/lib/server/source-story";
import { readSourceCollections } from "@/lib/server/source-collections";
import { readSourceLibraryPage } from "@/lib/server/source-library";
import { readSpatialRenderReadiness } from "@/lib/server/spatial-render-readiness";
import { listExternalMediaLibraries } from "@/lib/server/external-media-library";
import { buildSourceLibraryItems, resolveSourceLibraryItem } from "@/lib/source-library-projection";
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
  searchParams: Promise<{ asset?: string | string[]; external?: string | string[]; set?: string | string[]; board?: string | string[]; card?: string | string[] }>;
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
    const [initialSourcePage, sourceCollections, externalMediaLibraries, tags, episodes, coreWorkspace, spatialRenderReadiness] = await Promise.all([
      readSourceLibraryPage({ prisma, projectId: project.id, limit: 60 }),
      readSourceCollections(prisma, { projectId: project.id, actorUserId: session.user.id }),
      listExternalMediaLibraries({ prisma, projectId: project.id, actorUserId: session.user.id }),
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
      readSpatialRenderReadiness(),
    ]);
    const requestedCardId = typeof query.card === "string" ? query.card : null;
    const focusedCard = coreWorkspace.cards.find((card) => card.id === requestedCardId) ?? null;
    const requestedAssetId = typeof query.asset === "string" ? query.asset : focusedCard?.sourceRange?.sourceRevision.mediaAsset?.id ?? null;
    const requestedExternalReferenceId = typeof query.external === "string" ? query.external : focusedCard?.sourceRange?.sourceRevision.externalReference?.id ?? null;
    const requestedSourceSetId = typeof query.set === "string" ? query.set : focusedCard?.sourceRange?.sourceSet?.id ?? null;
    const requestedSourceId = requestedSourceSetId || requestedExternalReferenceId || requestedAssetId;
    const focusedSourcePage = requestedSourceId && !initialSourcePage.orderedKeys.some((key) => key.endsWith(`:${requestedSourceId}`))
      ? await readSourceLibraryPage({ prisma, projectId: project.id, limit: 3, query: requestedSourceId })
      : null;
    const sourcePage = focusedSourcePage ? {
      ...initialSourcePage,
      orderedKeys: [...focusedSourcePage.orderedKeys, ...initialSourcePage.orderedKeys.filter((key) => !focusedSourcePage.orderedKeys.includes(key))],
      sourceSets: [...focusedSourcePage.sourceSets, ...initialSourcePage.sourceSets.filter((sourceSet) => !focusedSourcePage.sourceSets.some((focused) => focused.id === sourceSet.id))],
      externalSources: [...focusedSourcePage.externalSources, ...initialSourcePage.externalSources.filter((source) => !focusedSourcePage.externalSources.some((focused) => focused.id === source.id))],
      assets: [...focusedSourcePage.assets, ...initialSourcePage.assets.filter((asset) => !focusedSourcePage.assets.some((focused) => focused.id === asset.id))],
    } : initialSourcePage;
    const assets = sourcePage.assets;
    const workspace = {
      ...coreWorkspace,
      sourceSets: sourcePage.sourceSets,
      externalSources: sourcePage.externalSources,
      sourceCollections,
      externalMediaLibraries,
    };
    const fallbackSourceKey = sourcePage.orderedKeys[0] ?? null;
    const requestedSourceKey = requestedSourceSetId
      ? `source-set:${requestedSourceSetId}`
      : requestedExternalReferenceId
        ? `external:${requestedExternalReferenceId}`
        : requestedAssetId
          ? `asset:${requestedAssetId}`
          : null;
    const logicalSourceItems = buildSourceLibraryItems({
      assets,
      externalSources: workspace.externalSources,
      sourceSets: workspace.sourceSets,
      cards: workspace.cards,
      boards: workspace.boards,
    });
    const selectedLogicalSource = resolveSourceLibraryItem(logicalSourceItems, requestedSourceKey ?? fallbackSourceKey);
    const selectedSourceSetId = selectedLogicalSource?.kind === "source-set" ? selectedLogicalSource.id : null;
    const selectedExternalReferenceId = selectedLogicalSource?.kind === "external" ? selectedLogicalSource.id : null;
    const requestedBoardId = typeof query.board === "string" ? query.board : null;
    const selectedAssetId = selectedLogicalSource?.kind === "asset" ? selectedLogicalSource.id : null;
    const focusedCardBoard = focusedCard
      ? workspace.boards.find((board) => board.placements.some((placement) => placement.cardId === focusedCard.id))
      : null;
    const selectedBoardId = workspace.boards.some((board) => board.id === requestedBoardId)
      ? requestedBoardId
      : focusedCardBoard?.id ?? workspace.boards[0]?.id ?? null;

    return (
      <SourceStoryClient
        project={{ id: project.id, slug: project.slug, name: project.name }}
        canWrite={canWrite}
        initialAssets={assets}
        tags={tags}
        episodes={episodes}
        initialWorkspace={workspace}
        initialSourcePageInfo={sourcePage.pageInfo}
        spatialRenderReadiness={spatialRenderReadiness}
        initialAssetId={selectedAssetId}
        initialExternalReferenceId={selectedExternalReferenceId}
        initialSourceSetId={selectedSourceSetId}
        initialBoardId={selectedBoardId}
        initialCardId={focusedCard?.id ?? null}
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
