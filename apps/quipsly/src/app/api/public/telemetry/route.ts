import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const prisma = getPrismaClient() as any;
    const body = await request.json();
    
    // We expect { sessionId, events: [] }
    // Or just a single event payload
    const { sessionId, events } = body;
    
    if (!sessionId || !events || !Array.isArray(events)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Upsert the session to ensure it exists
    await prisma.quipStreamSession.upsert({
      where: { id: sessionId },
      update: {},
      create: {
        id: sessionId,
        mode: events[0]?.mode || "unknown",
        entrySurface: "quiplore_feed",
        anonymous: true
      }
    });

    // Create the events
    const eventCreates = events.map(event => ({
      sessionId: sessionId,
      type: event.type,
      quoteId: event.quoteId,
      mode: event.mode || "unknown",
      dwellMs: event.dwellMs || null,
      metadataJson: event.metadata || {}
    }));

    if (eventCreates.length > 0) {
      await prisma.quipStreamEvent.createMany({
        data: eventCreates
      });
    }

    return NextResponse.json({ success: true, logged: eventCreates.length });

  } catch (error) {
    console.error("Telemetry ingest error:", error);
    // Never fail the client for telemetry errors
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 200 });
  }
}
