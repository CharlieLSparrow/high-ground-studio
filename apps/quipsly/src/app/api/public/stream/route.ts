import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipStreamCards } from "@high-ground/quipsly-domain/seed";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "for-you";
  
  try {
    const prisma = getPrismaClient();
    // Attempt to query real verified quotes.
    // If the database is empty or the table doesn't have the explicit projection yet,
    // we fallback safely to the public domain seed data.
    const realQuotesCount = await (prisma as any).quote?.count({
      where: { verificationStatus: "verified" }
    }).catch(() => 0);

    if (realQuotesCount > 0) {
      const realQuotes = await (prisma as any).quote.findMany({
        where: { verificationStatus: "verified" },
        take: 20,
        include: { person: true, sourceWork: true }
      });
      
      // In a real implementation, map Prisma models to QuipStreamCardProjection here.
      // For beta, if we have real quotes but missing projection mappers, we fallback to seed
      // to ensure the UI doesn't crash on incomplete data shapes.
      return NextResponse.json({
        data: getQuipStreamCards(mode as any),
        source: "seed-fallback-mode",
        realQuotesCount
      });
    }

    // Fallback: Return strictly safe, public-domain seed data
    return NextResponse.json({
      data: getQuipStreamCards(mode as any),
      source: "seed-fallback"
    });

  } catch (error) {
    // Failsafe: Never expose stack traces or private data on the public boundary
    return NextResponse.json({
      data: getQuipStreamCards(mode as any),
      source: "seed-fallback-error"
    });
  }
}
