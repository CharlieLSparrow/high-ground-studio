import "server-only";

import { queueAudioMastery } from "@/lib/server/audio-mastery";

type CaptureAudioReadinessManifest = {
  actorEmail: string;
  projectSlug: string;
  sourceType: string;
  contentType: string;
};

type CaptureAudioReadinessFinalization = {
  processingDisposition: "HELD" | "RELEASED";
  mediaAssetId: string | null;
  sourceId: string | null;
};

export type AutomaticCaptureAudioReadinessResult =
  | { disposition: "skipped"; reason: "source-held" | "source-not-materialized" | "non-audio-source" }
  | { disposition: "retained"; jobId: string | null; status: string };

/**
 * Queues the ordinary post-call measurement once an immutable participant
 * audio source is attached to its Nest. A failed automatic attempt remains
 * visible for explicit retry instead of creating an unbounded retry loop.
 * The worker can create only an unpromoted derivative; it never replaces the
 * Capture original or publishes a result.
 */
export async function ensureCaptureAudioReadinessQueued(input: {
  prisma: any;
  manifest: CaptureAudioReadinessManifest;
  finalization: CaptureAudioReadinessFinalization;
}): Promise<AutomaticCaptureAudioReadinessResult> {
  if (input.finalization.processingDisposition !== "RELEASED") {
    return { disposition: "skipped", reason: "source-held" };
  }
  if (!input.finalization.mediaAssetId || !input.finalization.sourceId) {
    return { disposition: "skipped", reason: "source-not-materialized" };
  }
  const isAudio = input.manifest.sourceType === "audio"
    || input.manifest.contentType.toLowerCase().startsWith("audio/");
  if (!isAudio) return { disposition: "skipped", reason: "non-audio-source" };

  const status = await queueAudioMastery({
    prisma: input.prisma,
    projectSlug: input.manifest.projectSlug,
    assetId: input.finalization.mediaAssetId,
    sourceId: input.finalization.sourceId,
    profileId: "apple-podcasts-dialogue-v1",
    actorEmail: input.manifest.actorEmail,
    retryFailed: false,
  });
  return {
    disposition: "retained",
    jobId: status.jobId,
    status: status.status,
  };
}
