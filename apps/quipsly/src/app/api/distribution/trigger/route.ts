import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { projectSlug, episodeSlug, videoUrl, audioUrl, platforms } = payload;

    if (!projectSlug || !episodeSlug || !videoUrl || !platforms) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log(`[Distribution] Received publish trigger for ${projectSlug}/${episodeSlug}`);
    console.log(`[Distribution] Target platforms: ${platforms.join(", ")}`);

    // Mock enqueueing jobs for each selected platform
    const jobs = platforms.map(async (platform: string) => {
      console.log(`[Distribution] Enqueued background job for ${platform}`);
      return { platform, status: "queued" };
    });

    await Promise.all(jobs);

    return NextResponse.json({
      ok: true,
      message: `Enqueued ${platforms.length} distribution jobs for ${episodeSlug}.`,
    });
  } catch (error) {
    console.error("[Distribution] Error triggering distribution:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
