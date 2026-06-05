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
    
    // Attempt to query the real database for the verified quote
    const dbQuote = await (prisma as any).quote?.findUnique({
      where: { slug: slug },
      include: { person: true, sourceWork: true }
    }).catch(() => null);

    // Strict boundary: Only return verified or public-domain data
    if (dbQuote && dbQuote.verificationStatus === "verified") {
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
