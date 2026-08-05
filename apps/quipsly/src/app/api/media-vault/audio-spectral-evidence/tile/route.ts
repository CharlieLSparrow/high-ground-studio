import { open } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getMediaBucket } from "@/lib/server/gcs";
import { resolveAudioSpectralTile } from "@/lib/server/audio-spectral-evidence";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const projectSlug = request.nextUrl.searchParams.get("projectSlug")?.trim() || "";
    const assetId = request.nextUrl.searchParams.get("assetId")?.trim() || "";
    const jobId = request.nextUrl.searchParams.get("jobId")?.trim() || "";
    const levelId = request.nextUrl.searchParams.get("level")?.trim() || "";
    const tileValue = request.nextUrl.searchParams.get("tile")?.trim() ?? "";
    const tileIndex = tileValue ? Number(tileValue) : Number.NaN;
    if (!projectSlug || !assetId || !jobId || !levelId || !Number.isSafeInteger(tileIndex)) return NextResponse.json({ ok: false, error: "A complete spectral tile coordinate is required." }, { status: 400 });
    const prisma = getPrismaClient();
    const access = await resolveEpisodeProductionAccess({ request, projectSlug, action: "read", prisma });
    if (!access.allowed) return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status, headers: { "Cache-Control": "private, no-store" } });
    const tile = await resolveAudioSpectralTile({ prisma, projectSlug, assetId, jobId, levelId, tileIndex });
    if (!tile) return NextResponse.json({ ok: false, error: "Spectral tile is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    let bytes: Buffer;
    if (tile.provider === "gcs") {
      [bytes] = await getMediaBucket(tile.bucketName).file(tile.objectName, { generation: tile.generation }).download({ start: tile.offset, end: tile.offset + tile.byteLength - 1 });
      if (bytes.length !== tile.byteLength) throw new Error("Cloud spectral tile pack ended before the requested tile.");
    } else {
      const file = await open(tile.path, "r");
      try {
        bytes = Buffer.alloc(tile.byteLength);
      const read = await file.read(bytes, 0, bytes.length, tile.offset);
      if (read.bytesRead !== bytes.length) throw new Error("Spectral tile pack ended before the requested tile.");
      } finally { await file.close(); }
    }
    return new Response(new Uint8Array(bytes), { status: 200, headers: {
        "Cache-Control": "private, max-age=300, immutable",
        "Content-Length": String(bytes.length),
        "Content-Type": "application/vnd.quipsly.spectral-tile; format=gray8",
        "X-Quipsly-Pack-Sha256": tile.sha256,
        "X-Quipsly-Tile-Start-Seconds": String(tile.startSeconds),
        "X-Quipsly-Tile-Duration-Seconds": String(tile.durationSeconds),
        Vary: "Authorization, Cookie",
      } });
  } catch (error) {
    console.error("[audio spectral tile] failed", error);
    return NextResponse.json({ ok: false, error: "Unable to read the protected spectral tile." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
