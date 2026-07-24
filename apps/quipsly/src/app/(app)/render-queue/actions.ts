"use server";

export type RenderJob = {
  id: string;
  name: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  timeRemaining: string;
  edlPayload?: unknown;
};

const unavailable = {
  success: false,
  errorCode: "RECEIPT_BACKED_RENDER_WORKER_NOT_CONNECTED" as const,
  error:
    "Web render submission is unavailable until Quipsly has an actor-scoped worker and durable render receipt. No job was queued.",
};

export async function submitRenderJob(jobName: string, edlPayload?: unknown) {
  void jobName;
  void edlPayload;
  return unavailable;
}

export async function getRenderJobs(): Promise<RenderJob[]> {
  return [];
}

export async function clearCompletedJobs() {
  return unavailable;
}
