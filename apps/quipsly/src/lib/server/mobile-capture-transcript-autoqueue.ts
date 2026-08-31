import "server-only";

import {
  ensureCaptureTranscriptProcessingQueued,
  type CaptureTranscriptQueueStatus,
} from "@/lib/server/capture-transcript-processing";
import { mobileCaptureInterruptionRepairRequired } from "@/lib/server/mobile-capture-interruption-repair";
import type {
  MobileCaptureResumableFinalizationEvidence,
  MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";

export type MobileCaptureTranscriptAutoqueueResult =
  | CaptureTranscriptQueueStatus
  | {
      status:
        | "processing-held"
        | "transcription-held"
        | "transcript-job-missing"
        | "transcript-job-not-queueable"
        | "device-transcript-expected"
        | "interruption-repair-pending";
      transcriptJobId: string | null;
      executionRequested: false;
      queueObjectName: null;
      manifestObjectName: null;
      resultObjectName: null;
    };

function skipped(
  status: Exclude<MobileCaptureTranscriptAutoqueueResult["status"], CaptureTranscriptQueueStatus["status"]>,
  transcriptJobId: string | null,
): MobileCaptureTranscriptAutoqueueResult {
  return {
    status,
    transcriptJobId,
    executionRequested: false,
    queueObjectName: null,
    manifestObjectName: null,
    resultObjectName: null,
  };
}

/**
 * Starts the durable transcript outbox after canonical capture finalization.
 * Recording/transcription consent and exact-byte release remain authoritative;
 * this helper removes only the redundant human step of pressing Run after a
 * released upload. Interrupted containers wait for their separately verified
 * repair derivative rather than sending questionable media to a provider.
 */
export async function ensureMobileCaptureTranscriptAutoqueued(input: {
  prisma: any;
  manifest: MobileCaptureResumableManifest;
  finalization: MobileCaptureResumableFinalizationEvidence;
  interruptionRepairVerified?: boolean;
}): Promise<MobileCaptureTranscriptAutoqueueResult> {
  const { manifest, finalization } = input;
  const transcriptJobId = finalization.transcriptJobId || null;
  if (finalization.processingDisposition !== "RELEASED") {
    return skipped("processing-held", transcriptJobId);
  }
  if (finalization.transcriptDisposition !== "RELEASED") {
    return skipped("transcription-held", transcriptJobId);
  }
  if (!transcriptJobId) {
    return skipped("transcript-job-missing", null);
  }
  if (!["QUEUED", "RUNNING", "COMPLETED"].includes(finalization.transcriptJobStatus || "")) {
    return skipped("transcript-job-not-queueable", transcriptJobId);
  }
  if (manifest.onDeviceTranscriptExpected === true) {
    // The canonical job remains the source-bound fallback handle. The device
    // sidecar endpoint completes that untouched job in place after verifying
    // the uploaded bytes, so provider ASR is not purchased speculatively and
    // no redundant pending job survives a successful device transcript.
    return skipped("device-transcript-expected", transcriptJobId);
  }
  if (
    mobileCaptureInterruptionRepairRequired(manifest.sourceProfileJson)
    && input.interruptionRepairVerified !== true
  ) {
    return skipped("interruption-repair-pending", transcriptJobId);
  }
  return ensureCaptureTranscriptProcessingQueued({
    prisma: input.prisma,
    transcriptJobId,
    actorUserId: manifest.actorUserId,
    actorEmail: manifest.actorEmail,
  });
}
