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
    const result = await renderVideoFromEDL(jobId, job.edlPayload);
    if (result.success) {
      job.status = "completed";
      job.progress = 100;
      job.timeRemaining = "0s";
    }
  } catch (err) {
    job.status = "failed";
  }
}
