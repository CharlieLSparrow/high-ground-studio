'use server'

import { getPrismaClient } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function addShootDay(projectId: string) {
  const prisma = getPrismaClient();

  const latestDay = await prisma.shootDay.findFirst({
    where: { projectId },
    orderBy: { dayNumber: 'desc' }
  });

  const nextDayNumber = latestDay ? latestDay.dayNumber + 1 : 1;
  
  // Find highest stripOrder in the project across both scenes and days
  const lastScene = await prisma.scene.findFirst({
    where: { projectId },
    orderBy: { stripOrder: 'desc' }
  });
  
  const lastDay = await prisma.shootDay.findFirst({
    where: { projectId },
    orderBy: { sortOrder: 'desc' }
  });

  const maxSceneOrder = lastScene?.stripOrder || 0;
  const maxDayOrder = lastDay?.sortOrder || 0;
  const nextSortOrder = Math.max(maxSceneOrder, maxDayOrder) + 1;

  await prisma.shootDay.create({
    data: {
      projectId,
      dayNumber: nextDayNumber,
      sortOrder: nextSortOrder,
    }
  });

  revalidatePath('/stripboard');
}

export async function updateStripOrder(items: Array<{ id: string, type: 'scene' | 'day', shootDayId: string | null, stripOrder: number }>) {
  const prisma = getPrismaClient();

  await prisma.$transaction(
    items.map(item => {
      if (item.type === 'scene') {
        return prisma.scene.update({
          where: { id: item.id },
          data: { 
            stripOrder: item.stripOrder,
            shootDayId: item.shootDayId
          }
        });
      } else {
        return prisma.shootDay.update({
          where: { id: item.id },
          data: {
            sortOrder: item.stripOrder
          }
        });
      }
    })
  );

  revalidatePath('/stripboard');
}
