import { getPrismaClient } from '@/lib/prisma';
import { SidebarLayout } from '@/components/SidebarLayout';
import { notFound } from 'next/navigation';
import { ClipLoggerClient } from './clip-logger-client';

export const dynamic = 'force-dynamic';

export default async function ClipLoggerPage({ params }: { params: { assetId: string } }) {
  const prisma = getPrismaClient();

  const asset = await prisma.studioMediaAsset.findUnique({
    where: { id: params.assetId },
    include: {
      clips: {
        orderBy: { inTimecode: 'asc' }
      }
    }
  });

  if (!asset) return notFound();

  return (
    <SidebarLayout>
      <ClipLoggerClient asset={asset} />
    </SidebarLayout>
  );
}
