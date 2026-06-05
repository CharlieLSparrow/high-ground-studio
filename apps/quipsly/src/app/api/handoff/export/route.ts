import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const prisma = getPrismaClient();

  const studioProject = await prisma.studioProject.findUnique({
    where: { id: projectId },
    // @ts-ignore
    include: {
      tags: {
        where: { category: 'production_breakdown' },
        include: {
          knowledgeNodes: true
        }
      },
      storyboards: {
        orderBy: { createdAt: 'asc' },
        include: {
          frames: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  });

  if (!studioProject) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const packet = {
    metadata: {
      generatedAt: new Date().toISOString(),
      title: studioProject.name,
      breakdownSource: studioProject.name,
    },
    breakdown: studioProject.tags.map((tag: any) => ({
      category: tag.label,
      elements: tag.knowledgeNodes.map((node: any) => ({
        element: node.title,
        notes: node.body
      }))
    })),
    storyboards: studioProject.storyboards.map((storyboard: any) => ({
      title: storyboard.title,
      description: storyboard.description,
      frames: storyboard.frames.map((frame: any) => ({
        frameNumber: frame.frameNumber,
        action: frame.action,
        cameraInfo: frame.cameraInfo,
        dialogue: frame.dialogue,
        imageUrl: frame.imageUrl
      }))
    }))
  };

  return NextResponse.json(packet);
}
