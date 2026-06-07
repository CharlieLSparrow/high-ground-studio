import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuotePassportBySlug } from "@high-ground/quipsly-domain/seed";

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const prisma = getPrismaClient();

    // Attempt to query the real database for the published packet, NOT the raw manuscript quote
    const dbPacket = await (prisma as any).publishPacket?.findUnique({
      where: { slug: slug }
    }).catch(() => null);

    // Strict boundary: Only return data if it is part of a published packet
    if (dbPacket && dbPacket.kind === "quote-feed") {
      // Map to QuotePassportProjection here in the future
      return NextResponse.json({
        data: getQuotePassportBySlug(slug),
        source: "seed-fallback-mode"
      });
    }

    // Fallback to strictly safe seed data
    const seedPassport = getQuotePassportBySlug(slug);

    if (!seedPassport) {
      return NextResponse.json({ error: "Passport not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: seedPassport,
      source: "seed-fallback"
    });

  } catch (error) {
    // Failsafe: Never expose private data
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
