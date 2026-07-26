import "server-only";

import { google } from "googleapis";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  saveMobileCaptureResumableManifest,
  type MobileCaptureResumableManifest,
  type StoredMobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import {
  LONG_SOURCE_QUEUE_CONTRACT,
  LONG_SOURCE_VERIFICATION_VERSION,
  buildLongSourceQueueObjectName,
  newLongSourceQueuedState,
  parseLongSourceQueueReceipt,
  type LongSourceQueueReceipt,
} from "@high-ground/quipsly-capture-verification";

export function longSourceVerifierEnabled() {
  return (
    process.env.QUIPSLY_LONG_SOURCE_VERIFIER_ENABLED === "1"
    && verifierEnvironmentNames.every((name) =>
      Boolean(process.env[name]?.trim()))
  );
}

const verifierEnvironmentNames = [
  "QUIPSLY_LONG_SOURCE_VERIFIER_PROJECT_ID",
  "QUIPSLY_LONG_SOURCE_VERIFIER_REGION",
  "QUIPSLY_LONG_SOURCE_VERIFIER_JOB",
] as const;

export async function ensureLongSourceVerificationQueued(input: {
  stored: StoredMobileCaptureResumableManifest;
  objectGeneration: string;
}) {
  if (!longSourceVerifierEnabled()) {
    throw new Error("Long-source verification is not enabled.");
  }
  if (input.stored.manifest.storageBackend !== "gcs") {
    throw new Error("Long-source verification requires immutable GCS storage.");
  }

  let stored = input.stored;
  let newlyQueued = false;
  if (!stored.manifest.longSourceVerification) {
    const queuedAt = new Date().toISOString();
    const queued: MobileCaptureResumableManifest = {
      ...stored.manifest,
      status: "verifying",
      updatedAt: queuedAt,
      finalizeLease: null,
      failure: null,
      longSourceVerification: newLongSourceQueuedState({
        uploadSessionId: stored.manifest.uploadSessionId,
        objectGeneration: input.objectGeneration,
        queuedAt,
      }),
    };
    stored = await saveMobileCaptureResumableManifest(
      queued,
      stored.generation,
    );
    newlyQueued = true;
  }

  const state = stored.manifest.longSourceVerification!;
  if (state.objectGeneration !== input.objectGeneration) {
    throw new Error(
      "Long-source verification is bound to a different object generation.",
    );
  }
  if (state.status === "bytes-verified" || state.status === "failed-terminal") {
    return { stored, newlyQueued: false, jobRequested: false };
  }

  await ensureQueueReceipt(stored);
  let jobRequested = false;
  if (state.status === "queued") {
    await requestVerifierExecution();
    jobRequested = true;
  }
  return { stored, newlyQueued, jobRequested };
}

async function ensureQueueReceipt(
  stored: StoredMobileCaptureResumableManifest,
) {
  const manifest = stored.manifest;
  const queueObjectName = buildLongSourceQueueObjectName(
    manifest.uploadSessionId,
  );
  const receipt: LongSourceQueueReceipt = {
    kind: LONG_SOURCE_QUEUE_CONTRACT,
    version: LONG_SOURCE_VERIFICATION_VERSION,
    uploadSessionId: manifest.uploadSessionId,
    manifestObjectName:
      `media-vault/control/mobile-capture-resumable/${manifest.uploadSessionId}.json`,
    manifestGeneration: stored.generation,
    enqueuedAt: manifest.longSourceVerification!.queuedAt,
  };
  const file = getMediaBucket(manifest.bucketName).file(queueObjectName);
  try {
    await file.save(JSON.stringify(receipt), {
      resumable: false,
      validation: "crc32c",
      contentType: "application/json; charset=utf-8",
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          quipslyKind: "mobile-capture-verification-queue",
          quipslyUploadSessionId: manifest.uploadSessionId,
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
    const [raw] = await file.download({ validation: "crc32c" });
    const existing = parseLongSourceQueueReceipt(
      JSON.parse(raw.toString("utf8")) as unknown,
    );
    if (
      existing.uploadSessionId !== receipt.uploadSessionId ||
      existing.manifestObjectName !== receipt.manifestObjectName ||
      existing.manifestGeneration !== receipt.manifestGeneration ||
      existing.enqueuedAt !== receipt.enqueuedAt
    ) {
      throw new Error(
        "Existing long-source queue receipt has different immutable binding.",
      );
    }
  }
}

async function requestVerifierExecution() {
  const projectId = requiredEnv("QUIPSLY_LONG_SOURCE_VERIFIER_PROJECT_ID");
  const region = requiredEnv("QUIPSLY_LONG_SOURCE_VERIFIER_REGION");
  const jobName = requiredEnv("QUIPSLY_LONG_SOURCE_VERIFIER_JOB");
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

export function longSourceByteEvidenceMatchesManifest(
  manifest: MobileCaptureResumableManifest,
) {
  const state = manifest.longSourceVerification;
  const evidence = state?.status === "bytes-verified"
    ? state.evidence
    : null;
  return Boolean(
    evidence
      && evidence.expectedSha256 === manifest.sha256
      && evidence.computedSha256 === manifest.sha256
      && evidence.expectedSizeBytes === manifest.expectedSizeBytes
      && evidence.streamedSizeBytes === manifest.expectedSizeBytes
      && evidence.bucketName === manifest.bucketName
      && evidence.objectName === manifest.objectName
      && evidence.generation === state?.objectGeneration,
  );
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isPreconditionFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const code = Number(
    candidate.code ?? candidate.status ?? candidate.response?.status,
  );
  return code === 409 || code === 412;
}
