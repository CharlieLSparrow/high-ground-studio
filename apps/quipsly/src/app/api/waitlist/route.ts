import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const prisma = getPrismaClient();

    // Check if they are already on the waitlist
    const existing = await prisma.waitlistSubscriber.findUnique({
      where: { email }
    });

    if (existing) {
      return NextResponse.json({ message: 'You are already on the waitlist!' });
    }

    // Add to waitlist
    await prisma.waitlistSubscriber.create({
      data: {
        email
      }
    });

    return NextResponse.json({ success: true, message: 'You have been added to the waitlist!' });
  } catch (error) {
    console.error("Waitlist API Error:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
