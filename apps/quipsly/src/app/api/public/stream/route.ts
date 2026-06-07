import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipStreamCards } from "@high-ground/quipsly-domain/seed";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "for-you";

  try {
    const prisma = getPrismaClient();
    // Attempt to query published packets instead of raw manuscript state.
    // We look for PublishPackets that have 'quiplore' as a published destination.
    const realPacketsCount = await (prisma as any).publishPacket?.count({
      where: {
        kind: "quote-feed",
        destinationsJson: {
          path: "$[*].destination",
          array_contains: "quiplore"
        }
      }
    }).catch(() => 0);

    if (realPacketsCount > 0) {
      const realPackets = await (prisma as any).publishPacket.findMany({
        where: { kind: "quote-feed" },
        take: 20
      });

      // In a real implementation, map Prisma models to QuipStreamCardProjection here.
      // For beta, if we have real quotes but missing projection mappers, we fallback to seed
      // to ensure the UI doesn't crash on incomplete data shapes.
      return NextResponse.json({
        data: getQuipStreamCards(mode as any),
        source: "seed-fallback-mode",
        realPacketsCount
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
