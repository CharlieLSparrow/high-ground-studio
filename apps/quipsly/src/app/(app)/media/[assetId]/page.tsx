import { getPrismaClient } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { ClipLoggerClient } from './clip-logger-client';
import { listMediaTags } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ClipLoggerPage({
  params,
  searchParams,
}: {
  params: { assetId: string };
  searchParams?: { source?: string };
}) {
  const prisma = getPrismaClient();

  const [asset, mediaTagCatalog] = await Promise.all([
    prisma.studioMediaAsset.findUnique({
      where: { id: params.assetId },
      include: {
        clips: {
          include: {
            mediaTags: true
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
  ]);

  if (!asset) return notFound();
  const backHref = searchParams?.source === 'iphone' ? '/media?source=iphone' : '/media';

  return (
    <>
      <ClipLoggerClient asset={asset} mediaTagCatalog={mediaTagCatalog} backHref={backHref} />
    </>
  );
}
