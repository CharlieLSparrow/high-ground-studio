import "server-only";

import { after } from "next/server";

import { reconcileCaptureTranscriptFollowThrough } from "@/lib/server/capture-transcript-follow-through";

/**
 * Starts ordinary editable Session follow-through after the transcript response
 * has reached Capture. Cloud Scheduler remains the durable recovery path, so a
 * packet build failure must never turn a safely attached transcript into an
 * apparent recording failure on the phone.
 */
export function dispatchCaptureTranscriptFollowThrough(input: {
  prisma: any;
  transcriptJobId: string;
}) {
  after(async () => {
    try {
      await reconcileCaptureTranscriptFollowThrough(input);
    } catch (error) {
      console.error("[Capture Follow-through] Immediate dispatch remains retryable", {
        transcriptJobId: input.transcriptJobId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  });
}
