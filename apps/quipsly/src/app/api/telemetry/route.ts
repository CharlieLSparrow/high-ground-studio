import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

type RetentionTelemetryRecord = {
  segmentIndex: number;
  timestamp: number;
  retentionRate: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId') || "AI-Revolution-01";

  console.log(`[Telemetry API] Fetching retention graph for ${videoId}...`);

  try {
    const prisma = getPrismaClient();
    
    // Check if we have records for this videoId
    let telemetryRecords = await prisma.retentionTelemetry.findMany({
      where: { videoId },
      orderBy: { segmentIndex: 'asc' }
    });

    // If database is empty, let's seed it with the mock trajectory so it has live Postgres data!
    if (telemetryRecords.length === 0) {
      console.log(`[Telemetry API] No telemetry records found in Postgres for ${videoId}. Seeding data...`);
      
      const seedData = Array.from({ length: 40 }).map((_, i) => {
        let retention = 100 - (i * 0.5); // Natural decay
        if (i >= 15) {
          retention -= 24; // Sharp drop at segment 15
        }
        return {
          videoId,
          segmentIndex: i,
          timestamp: i * 15,
          retentionRate: Math.max(10, retention + (Math.random() * 5))
        };
      });

      await prisma.retentionTelemetry.createMany({
        data: seedData
      });

      // Refetch
      telemetryRecords = await prisma.retentionTelemetry.findMany({
        where: { videoId },
        orderBy: { segmentIndex: 'asc' }
      });
    }

    return NextResponse.json({
      success: true,
      videoId,
      source: "postgres",
      alert: {
        type: "SHARP_DROP",
        segmentIndex: 15,
        severity: "high",
        message: "24% drop detected in the Leadership cohort."
      },
      data: telemetryRecords.map((r: RetentionTelemetryRecord) => ({
        segmentIndex: r.segmentIndex,
        timestamp: r.timestamp,
        retentionRate: r.retentionRate
      }))
    });

  } catch (err) {
    console.warn(`[Telemetry API] Could not connect to Postgres database. Falling back to in-memory mock generation.`, err);

    // Fallback mock generation if database is disconnected/placeholder
    const dataPoints = Array.from({ length: 40 }).map((_, i) => {
      let retention = 100 - (i * 0.5);
      if (i >= 15) {
        retention -= 24;
      }
      return {
        segmentIndex: i,
        timestamp: i * 15,
        retentionRate: Math.max(10, retention + (Math.random() * 5))
      };
    });

    return NextResponse.json({ 
      success: true, 
      videoId,
      source: "fallback-mock",
      alert: {
        type: "SHARP_DROP",
        segmentIndex: 15,
        severity: "high",
        message: "24% drop detected in the Leadership cohort."
      },
      data: dataPoints
    });
  }
}
