import "server-only";

import { google } from "googleapis";

const processorEnvironmentNames = [
  "QUIPSLY_MEDIA_PROCESSOR_PROJECT_ID",
  "QUIPSLY_MEDIA_PROCESSOR_REGION",
  "QUIPSLY_MEDIA_PROCESSOR_JOB",
] as const;

export function mediaProcessorEnabled() {
  return process.env.QUIPSLY_MEDIA_PROCESSOR_ENABLED === "1"
    && processorEnvironmentNames.every(
      (name) => Boolean(process.env[name]?.trim()),
    );
}

export function mediaProcessorExecutionRequestIsRecent(value: string | null) {
  if (!value) return false;
  const requestedAt = new Date(value).getTime();
  return Number.isFinite(requestedAt)
    && Date.now() - requestedAt < 2 * 60 * 1_000;
}

export async function requestMediaProcessorExecution() {
  const projectId = requiredEnv("QUIPSLY_MEDIA_PROCESSOR_PROJECT_ID");
  const region = requiredEnv("QUIPSLY_MEDIA_PROCESSOR_REGION");
  const jobName = requiredEnv("QUIPSLY_MEDIA_PROCESSOR_JOB");
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  await client.request({
    url:
      `https://run.googleapis.com/v2/projects/${encodeURIComponent(projectId)}`
      + `/locations/${encodeURIComponent(region)}`
      + `/jobs/${encodeURIComponent(jobName)}:run`,
    method: "POST",
    data: {},
  });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
