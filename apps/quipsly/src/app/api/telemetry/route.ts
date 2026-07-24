import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

type RetentionTelemetryRecord = {
  segmentIndex: number;
  timestamp: number;
  retentionRate: number;
};

const MAX_VIDEO_ID_LENGTH = 200;
const MAX_RETENTION_POINTS = 1_000;
const SHARP_DROP_THRESHOLD = 15;

export function findSharpRetentionDrop(records: RetentionTelemetryRecord[]) {
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    const dropPercentagePoints = previous.retentionRate - current.retentionRate;
    if (dropPercentagePoints >= SHARP_DROP_THRESHOLD) {
      return {
        type: "SHARP_DROP",
        segmentIndex: current.segmentIndex,
        severity: "high",
        dropPercentagePoints: Number(dropPercentagePoints.toFixed(2)),
        message: `Retention fell ${dropPercentagePoints.toFixed(1)} percentage points at segment ${current.segmentIndex}.`,
      };
    }
  }
  return null;
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, errorCode: "AUTH_REQUIRED", error: "Sign in before reading retention telemetry." },
      { status: 401 },
    );
  }
  if (!session.user.isStaff) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "RETENTION_TELEMETRY_STAFF_ONLY",
        error: "Retention telemetry is not tenant-scoped yet, so only staff can inspect it safely.",
      },
      { status: 403 },
    );
  }

  const videoId = new URL(request.url).searchParams.get("videoId")?.trim() ?? "";
  if (!videoId) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "VIDEO_ID_REQUIRED",
        error: "Enter the exact persisted video ID to inspect retention telemetry.",
      },
      { status: 400 },
    );
  }
  if (videoId.length > MAX_VIDEO_ID_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "VIDEO_ID_TOO_LONG",
        error: `Video IDs may be at most ${MAX_VIDEO_ID_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrismaClient();
    const telemetryRecords = await prisma.retentionTelemetry.findMany({
      where: { videoId },
      orderBy: { segmentIndex: "asc" },
      take: MAX_RETENTION_POINTS,
      select: {
        segmentIndex: true,
        timestamp: true,
        retentionRate: true,
      },
    });
    const data = telemetryRecords.map((record) => ({
      segmentIndex: record.segmentIndex,
      timestamp: record.timestamp,
      retentionRate: record.retentionRate,
    }));

    return NextResponse.json({
      success: true,
      videoId,
      source: "postgres",
      readOnly: true,
      pointCount: data.length,
      truncated: data.length === MAX_RETENTION_POINTS,
      alert: findSharpRetentionDrop(data),
      data,
      nextAction: data.length
        ? "Review the persisted points and trace any drop back to source media before changing an edit."
        : "No persisted retention points match this video ID. Nothing was seeded or inferred.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[telemetry] Persisted retention lookup failed", error);
    return NextResponse.json(
      {
        success: false,
        errorCode: "RETENTION_TELEMETRY_UNAVAILABLE",
        error: "Quipsly could not read persisted retention telemetry. No sample data was substituted.",
        videoId,
        readOnly: true,
        data: [],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
