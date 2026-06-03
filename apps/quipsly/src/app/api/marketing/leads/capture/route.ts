import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email, name, landingPageId } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const prisma = getPrismaClient();

    // For prototype purposes, get the first user
    const firstUser = await prisma.user.findFirst();
    if (!firstUser) {
      return NextResponse.json({ error: 'System not configured' }, { status: 500 });
    }

    // Capture the lead
    const lead = await prisma.marketingLead.create({
      data: {
        userId: firstUser.id,
        email,
        name,
        landingPageId: landingPageId || null,
      }
    });

    // Increment conversions on the Landing Page if provided
    if (landingPageId) {
      // In a real app we'd verify the landing page exists first, but upsert/update is fine here
      await prisma.landingPage.update({
        where: { id: landingPageId },
        data: {
          conversions: { increment: 1 }
        }
      }).catch(err => {
        console.error("Failed to increment landing page conversions", err);
      });
    }

    // SIMULATED WEBHOOK TRIGGER
    console.log(`\n======================================================`);
    console.log(`[WEBHOOK FIRED] 🚀 New Lead Captured: ${email}`);
    console.log(`[AUTOMATOR QUEUED] The 5-Day Welcome Sequence has been triggered for Lead ID: ${lead.id}`);
    console.log(`======================================================\n`);

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (error) {
    console.error("Error capturing lead:", error);
    return NextResponse.json({ error: 'Failed to capture lead' }, { status: 500 });
  }
}
