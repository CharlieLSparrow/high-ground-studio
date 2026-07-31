import { getPrismaClient } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { ClipLoggerClient } from './clip-logger-client';
import { listMediaTags } from '../actions';
import { getCurrentHomeNestActorEmail } from '@/lib/server/home-nest';
import { authorizeStudioMediaAsset } from '@/lib/server/studio-media-asset-access';

export const dynamic = 'force-dynamic';

export default async function ClipLoggerPage(props: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ source?: string; tag?: string; clip?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();
  const access = await authorizeStudioMediaAsset({
    prisma,
    actorEmail,
    assetId: params.assetId,
    action: "read",
  });

  if (!access.allowed) return notFound();

  const [asset, mediaTagCatalog, canonicalTagCatalog] = await Promise.all([
    prisma.studioMediaAsset.findUnique({
      where: { id: params.assetId },
      include: {
        clips: {
          include: {
            mediaTags: true,
            tags: {
              where: {
                projectId: { in: access.readableProjectIds },
              },
              select: {
                id: true,
                label: true,
                isActive: true,
                project: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { inTimecode: 'asc' }
        },
        mediaTags: true,
        projects: {
          select: { name: true }
        }
      }
    }),
    listMediaTags(),
    access.writableProjectIds.length
      ? prisma.studioTag.findMany({
          where: {
            projectId: { in: access.writableProjectIds },
            isActive: true,
          },
          orderBy: [
            { project: { name: "asc" } },
            { label: "asc" },
          ],
          select: {
            id: true,
            label: true,
            isActive: true,
            project: {
              select: { id: true, name: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  if (!asset) return notFound();
  const focusedClipId = String(searchParams.clip || "").trim();
  if (focusedClipId && !asset.clips.some((clip) => clip.id === focusedClipId)) {
    return notFound();
  }
  const backHref = searchParams?.source === 'iphone'
    ? '/media?source=iphone'
    : searchParams?.source === "find" && searchParams.tag
      ? `/find?tag=${encodeURIComponent(searchParams.tag)}`
      : '/media';

  return (
    <>
      <ClipLoggerClient
        asset={asset}
        mediaTagCatalog={mediaTagCatalog}
        canonicalTagCatalog={canonicalTagCatalog}
        backHref={backHref}
        canWrite={access.canWrite}
        focusedClipId={focusedClipId || undefined}
      />
    </>
  );
}
