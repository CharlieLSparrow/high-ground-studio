import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { timelineState, projectSlug, episodeSlug } = await req.json();

    if (!timelineState || !timelineState.clips) {
      return NextResponse.json({ error: "Invalid timeline state" }, { status: 400 });
    }

    // Extract loop clips that should become artifacts
    const loopClips = Array.isArray(timelineState.loopClips) ? timelineState.loopClips : [];
    const artifacts = loopClips
      .filter((loop: any) => loop.manuscriptBlockId && loop.exportability === "exportable")
      .map((loop: any) => ({
        id: `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        projectId: projectSlug,
        episodeSlug,
        manuscriptBlockId: loop.manuscriptBlockId,
        destination: "manuscript-sidecar",
        status: "published",
        metadataJson: {
          title: loop.title,
          sourceType: loop.sourceType,
          sourceUrl: loop.sourceUrl,
          startSec: loop.startSec,
          endSec: loop.endSec,
          sourceLoopId: loop.id
        },
        publishedAt: new Date().toISOString()
      }));

    if (artifacts.length > 0) {
      const artifactsDir = path.join(process.cwd(), "data", "artifacts");
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
      }
      
      const sidecarPath = path.join(artifactsDir, "sidecar.json");
      let existingArtifacts = [];
      if (fs.existsSync(sidecarPath)) {
        try {
          existingArtifacts = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
        } catch (e) {
          console.error("Failed to parse sidecar.json", e);
        }
      }
      
      // Append new artifacts
      existingArtifacts.push(...artifacts);
      fs.writeFileSync(sidecarPath, JSON.stringify(existingArtifacts, null, 2));
    }

    const { submitRenderJob } = await import("@/app/(app)/render-queue/actions");
    const result = await submitRenderJob(`Render: ${episodeSlug}`, {
      timelineState,
      projectSlug,
      episodeSlug
    });

    return NextResponse.json({
      success: true,
      renderId: result.jobId,
      status: "processing",
      artifacts,
      message: "Render job submitted to background queue."
    });

  } catch (error: any) {
    console.error("Error in Cloud Render API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
