import { isOriginalSessionRecordingAsset } from "./session-recording-sources";
import { recordingContentReadiness } from "./server/mobile-capture-content-readiness";

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
  /** Authorized ordinary work, not a second packet or an approval queue. */
  followThrough?: SessionFollowThrough | null;
};

type Recording = {
  id: string; kind: string; status: string; verifiedAt: Date | null; localManifestJson: unknown;
};
type Transcript = { assetId: string | null; status: string; _count: { segments: number } };

/** Availability only. Playback and editing still use their source-bound routes.
 * Jobs arrive newest first; retries must not count the same source twice. */
export function sessionAfterCall(roomId: string, assets: Recording[], jobs: Transcript[]): SessionAfterCall {
  const originals = assets.filter(isOriginalSessionRecordingAsset);
  const content = recordingContentReadiness(originals);
  const uploaded = new Set(originals.filter(asset => recordingContentReadiness([asset]).uploadedRecordingCount > 0).map(asset => asset.id));
  const seen = new Set<string>();
  const usable = new Set<string>();
  const transcripts = { available: 0, processing: 0, attention: 0 };
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
    if (["FAILED", "HELD"].includes(job.status) || job.status === "COMPLETED" && job._count.segments === 0) transcripts.attention += 1;
    else if (job.status !== "COMPLETED") transcripts.processing += 1;
  }
  return { roomId,
    recordings: { uploaded: content.uploadedRecordingCount, pending: content.pendingRecordingCount, attention: content.attentionRecordingCount },
    transcripts, transcriptSourceId };
}
