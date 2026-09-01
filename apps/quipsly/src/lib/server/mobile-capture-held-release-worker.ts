import "server-only";

import { ensureMobileCaptureAudioAnalysisQueued } from "@/lib/server/mobile-capture-audio-analysis";
import { finalizeMobileCaptureDatabaseEvidence } from "@/lib/server/mobile-capture-resumable-finalization";
import {
  computeMobileCaptureObjectSha256,
  getMobileCaptureObjectEvidence,
  loadMobileCaptureResumableManifest,
  saveMobileCaptureResumableManifest,
  type MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import { evaluateMobileCaptureRoomReadiness } from "@/lib/server/mobile-capture-room-readiness";

export const AUTOMATIC_CAPTURE_RELEASE_REASON =
  "Automatically released after canonical room readiness and participant consent converged.";

const MAX_SCAN = 200;

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function releaseControlReady(receipt: any) {
  return objectValue(objectValue(receipt?.metadataJson).automaticRelease)
    .controlManifestStatus === "ready";
}

async function markReleaseControlManifestReady(input: {
  prisma: any;
  uploadSessionId: string;
  synchronizedAt: string;
}) {
  const current = await input.prisma.mobileCaptureFinalizationReceipt.findUnique({
    where: { uploadSessionId: input.uploadSessionId },
    select: { metadataJson: true },
  });
  const metadata = objectValue(current?.metadataJson);
  await input.prisma.mobileCaptureFinalizationReceipt.update({
    where: { uploadSessionId: input.uploadSessionId },
    data: {
      metadataJson: {
        ...metadata,
        automaticRelease: {
          ...objectValue(metadata.automaticRelease),
          schema: "quipsly-mobile-capture-automatic-release-v1",
          controlManifestStatus: "ready",
          synchronizedAt: input.synchronizedAt,
        },
      },
    },
  });
}

async function markAutomaticReleaseChecked(input: {
  prisma: any;
  uploadSessionId: string;
  status: string;
  checkedAt: string;
}) {
  const current = await input.prisma.mobileCaptureFinalizationReceipt.findUnique({
    where: { uploadSessionId: input.uploadSessionId },
    select: { metadataJson: true },
  });
  const metadata = objectValue(current?.metadataJson);
  await input.prisma.mobileCaptureFinalizationReceipt.update({
    where: { uploadSessionId: input.uploadSessionId },
    data: {
      metadataJson: {
        ...metadata,
        automaticRelease: {
          ...objectValue(metadata.automaticRelease),
          schema: "quipsly-mobile-capture-automatic-release-v1",
          lastCheckStatus: input.status,
          lastCheckedAt: input.checkedAt,
        },
      },
    },
  });
}

async function saveReleasedManifest(input: {
  uploadSessionId: string;
  manifest: MobileCaptureResumableManifest;
  generation: string;
}) {
  let manifest = input.manifest;
  let generation = input.generation;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await saveMobileCaptureResumableManifest(manifest, generation);
    } catch (error) {
      const winner = await loadMobileCaptureResumableManifest(input.uploadSessionId);
      if (!winner) throw error;
      if (
        winner.manifest.finalization?.processingDisposition === manifest.finalization?.processingDisposition
        && winner.manifest.finalization?.transcriptDisposition === manifest.finalization?.transcriptDisposition
      ) {
        return winner;
      }
      manifest = {
        ...winner.manifest,
        updatedAt: manifest.updatedAt,
        finalization: manifest.finalization,
      };
      generation = winner.generation;
    }
  }
  throw new Error("Automatic release control manifest could not be synchronized.");
}

export async function reconcileHeldMobileCaptureRelease(input: {
  prisma: any;
  receipt: any;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const stored = await loadMobileCaptureResumableManifest(input.receipt.uploadSessionId);
  if (!stored) return { status: "manifest-missing" as const, releasedMedia: false, releasedTranscript: false };
  const manifest = stored.manifest;
  if (manifest.status !== "verified" || !manifest.verification) {
    return { status: "bytes-not-verified" as const, releasedMedia: false, releasedTranscript: false };
  }
  if (
    input.receipt.actorUserId !== manifest.actorUserId
    || input.receipt.roomId !== manifest.callRoomId
    || input.receipt.captureId !== manifest.captureId
  ) {
    return { status: "binding-mismatch" as const, releasedMedia: false, releasedTranscript: false };
  }

  const readiness = await evaluateMobileCaptureRoomReadiness({
    prisma: input.prisma,
    roomId: manifest.callRoomId,
    captureId: manifest.captureId,
    actorUserId: manifest.actorUserId,
    recordingConsentId: manifest.recordingConsentId,
    sourceType: manifest.sourceType as "audio" | "video",
  });
  if (!readiness.allPartiesCurrentlyReady || readiness.actorConsentId !== manifest.recordingConsentId) {
    return { status: "waiting-for-consent" as const, releasedMedia: false, releasedTranscript: false };
  }

  const mediaNeedsRelease = input.receipt.processingDisposition !== "RELEASED";
  const transcriptNeedsRelease = input.receipt.transcriptDisposition !== "RELEASED"
    && readiness.allPartiesCurrentlyAllowTranscription;
  const manifestAlreadySynchronized =
    manifest.finalization?.processingDisposition === "RELEASED"
    && manifest.finalization?.transcriptDisposition === input.receipt.transcriptDisposition;
  if (!mediaNeedsRelease && !transcriptNeedsRelease && manifestAlreadySynchronized) {
    if (!releaseControlReady(input.receipt)) {
      await markReleaseControlManifestReady({
        prisma: input.prisma,
        uploadSessionId: manifest.uploadSessionId,
        synchronizedAt: now.toISOString(),
      });
    }
    return { status: "already-released" as const, releasedMedia: false, releasedTranscript: false };
  }
  if (!mediaNeedsRelease && !transcriptNeedsRelease) {
    const synchronized = await saveReleasedManifest({
      uploadSessionId: manifest.uploadSessionId,
      manifest: {
        ...manifest,
        updatedAt: now.toISOString(),
        finalization: {
          ...manifest.finalization!,
          processingDisposition: input.receipt.processingDisposition,
          transcriptDisposition: input.receipt.transcriptDisposition,
        },
      },
      generation: stored.generation,
    });
    await markReleaseControlManifestReady({
      prisma: input.prisma,
      uploadSessionId: manifest.uploadSessionId,
      synchronizedAt: synchronized.manifest.updatedAt,
    });
    return { status: "control-reconciled" as const, releasedMedia: false, releasedTranscript: false };
  }

  const object = await getMobileCaptureObjectEvidence(manifest.bucketName, manifest.objectName);
  if (
    !object
    || object.generation !== manifest.verification.generation
    || object.sizeBytes !== manifest.verification.verifiedSizeBytes
    || (
      manifest.verification.crc32c !== null
      && object.crc32c !== null
      && object.crc32c !== manifest.verification.crc32c
    )
    || (
      manifest.verification.md5Hash !== null
      && object.md5Hash !== null
      && object.md5Hash !== manifest.verification.md5Hash
    )
  ) {
    return { status: "source-evidence-mismatch" as const, releasedMedia: false, releasedTranscript: false };
  }
  const hasImmutableGcsChecksumEvidence =
    object.storageBackend === "gcs"
    && manifest.verification.crc32c !== null
    && object.crc32c === manifest.verification.crc32c;
  if (!hasImmutableGcsChecksumEvidence) {
    // Legacy receipts and local-development sources do not always retain a
    // provider checksum. Preserve the full SHA-256 fallback for those cases.
    const hashed = await computeMobileCaptureObjectSha256(object);
    if (
      hashed.streamedBytes !== manifest.verification.verifiedSizeBytes
      || hashed.sha256 !== manifest.verification.computedSha256
      || hashed.sha256 !== manifest.sha256
    ) {
      return { status: "source-integrity-failed" as const, releasedMedia: false, releasedTranscript: false };
    }
  }

  // Legacy hashing can take meaningful time, and even metadata checks race
  // consent changes. Recheck at the release boundary so revocation always wins.
  const releaseReadiness = await evaluateMobileCaptureRoomReadiness({
    prisma: input.prisma,
    roomId: manifest.callRoomId,
    captureId: manifest.captureId,
    actorUserId: manifest.actorUserId,
    recordingConsentId: manifest.recordingConsentId,
    sourceType: manifest.sourceType as "audio" | "video",
  });
  if (
    !releaseReadiness.allPartiesCurrentlyReady
    || releaseReadiness.actorConsentId !== manifest.recordingConsentId
  ) {
    return { status: "waiting-for-consent" as const, releasedMedia: false, releasedTranscript: false };
  }
  const releaseTranscriptNeedsRelease = input.receipt.transcriptDisposition !== "RELEASED"
    && releaseReadiness.allPartiesCurrentlyAllowTranscription;

  const releasedAt = now.toISOString();
  const finalization = await finalizeMobileCaptureDatabaseEvidence({
    prisma: input.prisma,
    manifest,
    object,
    actorIsStaff: true,
    processingDecision: {
      disposition: "RELEASED",
      reasonCode: null,
      reason: null,
      startReceiptId: manifest.startReceiptId,
      consentVersion: manifest.consentVersion,
      releaseAudit: mediaNeedsRelease ? {
        releasedByUserId: manifest.actorUserId,
        releaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
        releasedAt,
      } : null,
      transcriptDisposition: releaseReadiness.allPartiesCurrentlyAllowTranscription ? "RELEASED" : "HELD",
      transcriptReasonCode: releaseReadiness.allPartiesCurrentlyAllowTranscription
        ? null
        : "ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED",
      transcriptReason: releaseReadiness.allPartiesCurrentlyAllowTranscription
        ? null
        : "Transcript held until every signed-in, non-observer participant grants transcription consent.",
      transcriptReleaseAudit: releaseTranscriptNeedsRelease ? {
        releasedByUserId: manifest.actorUserId,
        releaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
        releasedAt,
      } : null,
    },
  });
  const releasedManifest: MobileCaptureResumableManifest = {
    ...manifest,
    updatedAt: releasedAt,
    finalization,
  };
  const synchronized = await saveReleasedManifest({
    uploadSessionId: manifest.uploadSessionId,
    manifest: releasedManifest,
    generation: stored.generation,
  });
  await markReleaseControlManifestReady({
    prisma: input.prisma,
    uploadSessionId: manifest.uploadSessionId,
    synchronizedAt: synchronized.manifest.updatedAt,
  });
  try {
    await ensureMobileCaptureAudioAnalysisQueued({
      prisma: input.prisma,
      manifest: synchronized.manifest,
    });
  } catch {
    // Finalization already schedules its durable audio-readiness outbox. A
    // supplemental analysis queue outage must not undo the consent recovery.
  }
  return {
    status: "released" as const,
    releasedMedia: mediaNeedsRelease,
    releasedTranscript: releaseTranscriptNeedsRelease,
  };
}

export async function runHeldMobileCaptureReleaseMaintenance(input: {
  prisma: any;
  limit: number;
  now?: Date;
}) {
  const candidates = await input.prisma.mobileCaptureFinalizationReceipt.findMany({
    where: {
      OR: [
        { processingDisposition: "HELD" },
        { transcriptDisposition: "HELD" },
        {
          releaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
          NOT: { metadataJson: { path: ["automaticRelease", "controlManifestStatus"], equals: "ready" } },
        },
        {
          transcriptReleaseReason: AUTOMATIC_CAPTURE_RELEASE_REASON,
          NOT: { metadataJson: { path: ["automaticRelease", "controlManifestStatus"], equals: "ready" } },
        },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { uploadSessionId: "asc" }],
    take: Math.min(MAX_SCAN, input.limit * 10),
  });
  const settled = [];
  for (const receipt of candidates.slice(0, input.limit)) {
    try {
      const result = await reconcileHeldMobileCaptureRelease({
        prisma: input.prisma,
        receipt,
        now: input.now,
      });
      if (result.status !== "released" && result.status !== "control-reconciled") {
        await markAutomaticReleaseChecked({
          prisma: input.prisma,
          uploadSessionId: receipt.uploadSessionId,
          status: result.status,
          checkedAt: (input.now ?? new Date()).toISOString(),
        });
      }
      settled.push(result);
    } catch {
      settled.push({ status: "failed" as const, releasedMedia: false, releasedTranscript: false });
    }
  }
  return {
    schema: "quipsly-mobile-capture-held-release-maintenance-v1",
    scanned: candidates.length,
    attempted: Math.min(candidates.length, input.limit),
    releasedMedia: settled.filter((result) => result.releasedMedia).length,
    releasedTranscripts: settled.filter((result) => result.releasedTranscript).length,
    waiting: settled.filter((result) => result.status === "waiting-for-consent").length,
    failed: settled.filter((result) => result.status === "failed").length,
    results: settled,
  };
}
