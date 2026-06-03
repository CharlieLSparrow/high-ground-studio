import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const prisma = getPrismaClient();

    // For prototype purposes, get the first user
    const firstUser = await prisma.user.findFirst();
    if (!firstUser) {
      return NextResponse.json({ error: 'System not configured' }, { status: 500 });
    }

    const newCampaign = await prisma.marketingCampaign.create({
      data: {
        userId: firstUser.id,
        name: `New Launch Campaign ${new Date().toLocaleDateString()}`,
        description: 'A new product launch orchestration.',
        status: 'draft'
      }
    });

    return NextResponse.json(newCampaign);
  } catch (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
