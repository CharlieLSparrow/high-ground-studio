import "server-only";

import { queueAudioSignalProfile } from "@/lib/server/audio-signal-profile";
import type { MobileCaptureResumableManifest } from "@/lib/server/mobile-capture-resumable-store";

export type MobileCaptureAudioAnalysisScheduling =
  | { status: "not-applicable"; reason: "not-audio" | "processing-held" | "promotion-incomplete" }
  | { status: "queued"; jobId: string | null; jobStatus: string };

export async function ensureMobileCaptureAudioAnalysisQueued(input: {
  prisma: any;
  manifest: MobileCaptureResumableManifest;
}): Promise<MobileCaptureAudioAnalysisScheduling> {
  const { manifest } = input;
  if (manifest.sourceType !== "audio" && !manifest.contentType.startsWith("audio/")) {
    return { status: "not-applicable", reason: "not-audio" };
  }
  if (manifest.finalization?.processingDisposition !== "RELEASED") {
    return { status: "not-applicable", reason: "processing-held" };
  }
  const mediaAssetId = manifest.finalization.mediaAssetId?.trim();
  const sourceId = manifest.finalization.sourceId?.trim();
  if (!mediaAssetId || !sourceId) {
    return { status: "not-applicable", reason: "promotion-incomplete" };
  }
  const queued = await queueAudioSignalProfile({
    prisma: input.prisma,
    projectSlug: manifest.projectSlug,
    assetId: mediaAssetId,
    sourceId,
    actorEmail: manifest.actorEmail,
  });
  return {
    status: "queued",
    jobId: queued.jobId,
    jobStatus: queued.status,
  };
}
