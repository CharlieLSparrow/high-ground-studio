import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studioProjectId = searchParams.get('studioProjectId');
  const projectId = searchParams.get('projectId');

  if (!studioProjectId || !projectId) {
    return NextResponse.json({ error: 'Missing studioProjectId or projectId' }, { status: 400 });
  }

  const prisma = getPrismaClient();

  const studioProject = await prisma.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      tags: {
        where: { category: 'production_breakdown' },
        include: {
          knowledgeNodes: true
        }
      }
    }
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      scenes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          shots: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  });

  if (!studioProject || !project) {
    return NextResponse.json({ error: 'Projects not found' }, { status: 404 });
  }

  const packet = {
    metadata: {
      generatedAt: new Date().toISOString(),
      title: project.title,
      breakdownSource: studioProject.name,
    },
    breakdown: studioProject.tags.map(tag => ({
      category: tag.label,
      elements: tag.knowledgeNodes.map(node => ({
        element: node.title,
        notes: node.body
      }))
    })),
    storyboards: project.scenes.map(scene => ({
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      shots: scene.shots.map(shot => ({
        shotNumber: shot.shotNumber,
        camera: shot.cameraInfo,
        action: shot.action,
        dialogue: shot.dialogue,
        vfx: shot.vfxNotes,
        image: shot.imageUrl
      }))
    }))
  };

  return NextResponse.json(packet);
}
