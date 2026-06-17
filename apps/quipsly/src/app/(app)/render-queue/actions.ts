"use server";
import { renderVideoFromEDL } from "../../../remotion/render";

export type RenderJob = {
  id: string;
  name: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  timeRemaining: string;
  edlPayload?: any;
};

// In-memory store for the prototype. In production, this is in PostgreSQL.
const MOCK_DB: Record<string, RenderJob> = {};

export async function submitRenderJob(jobName: string, edlPayload?: any) {
  const jobId = `job_${Date.now()}`;
  
  MOCK_DB[jobId] = {
    id: jobId,
    name: jobName,
    status: "queued",
    progress: 0,
    timeRemaining: "Estimating...",
    edlPayload,
  };

  // Simulate a background worker picking it up asynchronously
  setTimeout(() => processMockJob(jobId), 1000);

  return { success: true, jobId };
}

export async function getRenderJobs() {
  return Object.values(MOCK_DB).sort((a, b) => b.id.localeCompare(a.id));
}

export async function clearCompletedJobs() {
  for (const id in MOCK_DB) {
    if (MOCK_DB[id].status === "completed") {
      delete MOCK_DB[id];
    }
  }
  return { success: true };
}

// Internal mock processor to simulate FFmpeg/Remotion
async function processMockJob(jobId: string) {
  const job = MOCK_DB[jobId];
  if (!job) return;

  job.status = "rendering";
  
  try {
    const { getPrismaClient } = await import("@/lib/prisma");
    const prisma = getPrismaClient();

    // 1. Resolve asset URLs
    const edl = job.edlPayload?.timelineState;
    if (edl && Array.isArray(edl.clips)) {
      for (const clip of edl.clips) {
        if (clip.assetId) {
          const asset = await prisma.studioAsset.findUnique({
            where: { id: clip.assetId }
          });
          // Attach resolved URL so Remotion can render it
          clip.resolvedUrl = asset?.url || null;
        }
      }
    }

    // 2. Render
    const result = await renderVideoFromEDL(jobId, job.edlPayload);
    if (result.success) {
      job.status = "completed";
      job.progress = 100;
      job.timeRemaining = "0s";

      // 3. Update PublishCandidate if episodeSlug is available
      if (job.edlPayload?.episodeSlug) {
        const candidates = await prisma.hgoEpisodePublishCandidate.findMany({
          where: { projectionSlug: job.edlPayload.episodeSlug }
        });
        
        for (const candidate of candidates) {
          try {
            const packet = candidate.packetJson as any;
            if (packet && packet.media) {
              packet.media.videoUrl = result.outputLocation;
              await prisma.hgoEpisodePublishCandidate.update({
                where: { id: candidate.id },
                data: { packetJson: packet }
              });
            }
          } catch (e) {
            console.error(`Failed to update candidate ${candidate.id}`, e);
          }
        }
      }
    }
  } catch (err) {
    console.error("Render failed", err);
    job.status = "failed";
  }
}
