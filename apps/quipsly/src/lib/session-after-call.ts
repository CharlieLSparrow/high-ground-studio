import { isOriginalSessionRecordingAsset } from "./session-recording-sources";
import { recordingContentReadiness } from "./server/mobile-capture-content-readiness";
import { transcriptFailurePresentation } from "./server/transcript-failure-presentation";

export type SessionFollowThrough = {
  recap: { id: string; title: string; excerpt: string; visibility: string } | null;
  openTasks: number;
  openGoals: number;
  nextSteps: { id: string; title: string; kind: "TASK" | "GOAL"; ownerLabel: string; visibility: string }[];
};

export type SessionAfterCall = {
  roomId: string;
  recordings: { uploaded: number; pending: number; attention: number };
  transcripts: { available: number; processing: number; attention: number };
  transcriptSourceId: string | null;
  recordingSourceId?: string | null;
  otherRecordingCount?: number;
  transcriptIssues?: {recordingAssetId: string; message: string; retryable: boolean; failureCode: string | null}[];
  /** Authorized ordinary work, not a second packet or an approval queue. */
  followThrough?: SessionFollowThrough | null;
};

type Recording = {
  id: string; kind: string; status: string; verifiedAt: Date | null; localManifestJson: unknown;
};
type Transcript = { assetId: string | null; status: string; provider?: string | null; errorMessage?: string | null; _count: { segments: number } };

/** Availability only. Playback and editing still use their source-bound routes.
 * Jobs arrive newest first; retries must not count the same source twice. */
export function sessionAfterCall(roomId: string, assets: Recording[], jobs: Transcript[]): SessionAfterCall {
  const originals = assets.filter(isOriginalSessionRecordingAsset);
  const content = recordingContentReadiness(originals);
  const uploaded = new Set(originals.filter(asset => recordingContentReadiness([asset]).uploadedRecordingCount > 0).map(asset => asset.id));
  const seen = new Set<string>();
  const usable = new Set<string>();
  const transcripts = { available: 0, processing: 0, attention: 0 };
  const transcriptIssues: NonNullable<SessionAfterCall["transcriptIssues"]> = [];
  let transcriptSourceId: string | null = null;
  for (const job of jobs) {
    if (!job.assetId || !uploaded.has(job.assetId)) continue;
    if (job.status === "COMPLETED" && job._count.segments > 0 && !usable.has(job.assetId)) {
      usable.add(job.assetId);
      transcripts.available += 1;
      transcriptSourceId ??= job.assetId;
    }
    if (seen.has(job.assetId)) continue;
    seen.add(job.assetId);
    if (["FAILED", "HELD"].includes(job.status) || job.status === "COMPLETED" && job._count.segments === 0) {
      transcripts.attention += 1;
      const failure = transcriptFailurePresentation(job);
      transcriptIssues.push({recordingAssetId: job.assetId, message: failure.errorMessage || "No transcript words were returned for this recording. You can listen to the original and try transcription again.",
        failureCode: failure.failureCode, retryable: job.status === "COMPLETED" || failure.retryable});
    }
    else if (job.status !== "COMPLETED") transcripts.processing += 1;
  }
  return { roomId,
    recordings: { uploaded: content.uploadedRecordingCount, pending: content.pendingRecordingCount, attention: content.attentionRecordingCount },
    transcripts, transcriptSourceId, ...(transcriptIssues.length ? {transcriptIssues} : {}) };
}
