import { failRetiredPublishingExecution } from "@/lib/server/retired-publishing-execution";

/**
 * The legacy runner mixed provider calls, process-local filesystem writes,
 * invented success states, and database job updates without one atomic
 * publication receipt. Keep every exported entry point fail-closed so an old
 * server action or queued-job caller cannot bypass the retired HTTP routes.
 */
export async function enqueuePublishJobs(
  candidateId: string,
  destinations: string[],
  requestedByEmail = "system@quipsly.com",
) {
  void candidateId;
  void destinations;
  void requestedByEmail;
  return failRetiredPublishingExecution();
}

export async function processSyncJobsBackground(candidateId: string, jobIds: string[]) {
  void candidateId;
  void jobIds;
  return failRetiredPublishingExecution();
}

export async function enqueueRollbackJobs(
  candidateId: string,
  destinations: string[],
  requestedByEmail = "system@quipsly.com",
) {
  void candidateId;
  void destinations;
  void requestedByEmail;
  return failRetiredPublishingExecution();
}

export async function processRollbackJobsBackground(candidateId: string, jobIds: string[]) {
  void candidateId;
  void jobIds;
  return failRetiredPublishingExecution();
}
