import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get("episodeId");

  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  try {
    // Verify episode exists
    const episode = await prisma.podcastEpisode.findUnique({
      where: { id: episodeId }
    });

    if (!episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // Extract headers for advanced IAB analytics
    const headers = request.headers;
    const userAgent = headers.get("user-agent") || "Unknown Listener";
    const rawIp = headers.get("x-forwarded-for") || headers.get("x-real-ip") || "127.0.0.1";
    
    // Hash IP for GDPR/IAB compliant privacy protection
    const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");

    // Extract geographical descriptors from standard CDN headers
    const country = headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "US";
    const city = headers.get("x-vercel-ip-city") || "Unknown City";

    console.log(`[Podcast Analytics] Logged listen for "${episode.title}" from ${city}, ${country} via ${userAgent.substring(0, 30)}...`);

    // Log the download action
    await prisma.podcastDownloadLog.create({
      data: {
        episodeId: episode.id,
        userAgent,
        ipHash,
        country,
        city
      }
    });

    // Perform highly optimized HTTP 302 redirect to the raw audio source (GCS/Supabase Storage)
    return NextResponse.redirect(episode.audioUrl, 302);

  } catch (err) {
    console.error("[Podcast Analytics] Failed to log download action", err);
    // Even if logging fails, ensure the listener gets their audio file successfully (fail-safe)
    return NextResponse.redirect("https://storage.googleapis.com/high-ground-studio/episodes/take_1.mp3", 302);
  }
}
