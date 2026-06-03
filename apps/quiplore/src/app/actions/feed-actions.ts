"use server";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getConsumerVideoFeed() {
  const segments = await prisma.studioVideoSegment.findMany({
    include: {
      source: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 20
  });

  return segments;
}

export async function getConsumerLorelist(listId: string) {
  const listItems = await prisma.studioSegmentListItem.findMany({
    where: { listId },
    orderBy: { position: 'asc' },
    include: {
      segment: {
        include: { source: true }
      }
    }
  });

  // Extract the ordered segments from the items
  const segments = listItems.map(item => item.segment);
  return segments;
}

export async function getLorelistsHomeData() {
  const lists = await prisma.studioSegmentList.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        orderBy: { position: 'asc' },
        take: 1, // just get the first item for thumbnail/preview
        include: {
          segment: {
            include: { source: true }
          }
        }
      },
      _count: {
        select: { items: true }
      }
    }
  });

  return lists;
}
