import { createHash, randomUUID } from "node:crypto";

import {
  buildLongSourceDeadLetterObjectName,
  claimLongSourceVerification,
  completeLongSourceVerification,
  failLongSourceVerification,
  parseLongSourceQueueReceipt,
  parseLongSourceVerificationState,
  parseLongSourceWorkerManifest,
  releaseLongSourceVerificationClaim,
  type LongSourceQueueReceipt,
  type LongSourceVerificationState,
} from "@high-ground/quipsly-capture-verification";

export type GenerationMatchedJson = {
  value: unknown;
  generation: string;
};

export type QueueObject = {
  name: string;
  generation: string;
};

export type SourceObjectEvidence = {
  bucketName: string;
  objectName: string;
  generation: string;
  sizeBytes: number;
  contentType: string;
  crc32c: string | null;
  md5Hash: string | null;
  customMetadata: Record<string, string>;
};

export type HashedSourceObject = {
  sha256: string;
  streamedBytes: number;
};

export interface LongSourceWorkerStorage {
  listQueueObjects(limit: number): Promise<QueueObject[]>;
  loadJson(objectName: string, generation?: string): Promise<GenerationMatchedJson>;
  saveJson(
    objectName: string,
    value: unknown,
    ifGenerationMatch: string,
  ): Promise<GenerationMatchedJson>;
  sourceObjectEvidence(
    objectName: string,
    generation: string,
  ): Promise<SourceObjectEvidence | null>;
  hashSourceObject(
    objectName: string,
    generation: string,
  ): Promise<HashedSourceObject>;
  deleteObject(objectName: string, ifGenerationMatch: string): Promise<void>;
  writeDeadLetter(
    objectName: string,
    value: unknown,
    sourceQueueGeneration: string,
  ): Promise<void>;
}

export type WorkerOptions = {
  executionId: string;
  buildId: string;
  imageDigest: string | null;
  leaseDurationMs: number;
  now: () => Date;
};

export type ReceiptResult =
  | { disposition: "verified"; uploadSessionId: string; streamedBytes: number }
  | { disposition: "already-complete"; uploadSessionId: string }
  | { disposition: "terminal"; uploadSessionId: string; code: string }
  | { disposition: "busy"; uploadSessionId: string }
  | { disposition: "claim-lost"; uploadSessionId: string };

class TerminalVerificationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TerminalVerificationError";
    this.code = code;
  }
}

export async function runLongSourceWorker(
  storage: LongSourceWorkerStorage,
  options: WorkerOptions,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Worker receipt limit must be between 1 and 100.");
  }
  const queueObjects = await storage.listQueueObjects(limit);
  const results: ReceiptResult[] = [];
  const transientFailures: Error[] = [];
  for (const queueObject of queueObjects) {
    try {
      results.push(
        await processLongSourceQueueObject(storage, options, queueObject),
      );
    } catch (error) {
      if (error instanceof TerminalVerificationError) {
        try {
          results.push(
            await quarantineInvalidQueueObject(
              storage,
              queueObject,
              error,
              options.now(),
            ),
          );
          continue;
        } catch (quarantineError) {
          transientFailures.push(
            quarantineError instanceof Error
              ? quarantineError
              : new Error("Unknown queue quarantine failure."),
          );
          continue;
        }
      }
      transientFailures.push(
        error instanceof Error ? error : new Error("Unknown worker failure."),
      );
    }
  }
  if (transientFailures.length > 0) {
    throw new AggregateError(
      transientFailures,
      `${transientFailures.length} long-source receipt(s) need retry.`,
    );
  }
  return results;
}

export async function processLongSourceQueueObject(
  storage: LongSourceWorkerStorage,
  options: WorkerOptions,
  queueObject: QueueObject,
): Promise<ReceiptResult> {
  const storedQueue = await storage.loadJson(
    queueObject.name,
    queueObject.generation,
  );
  let receipt: LongSourceQueueReceipt;
  try {
    receipt = parseLongSourceQueueReceipt(storedQueue.value);
  } catch {
    throw new TerminalVerificationError(
      "queue-receipt-invalid",
      "Queue receipt is malformed or has an unsafe immutable binding.",
    );
  }
  if (queueObject.name !== receiptQueueName(receipt)) {
    throw new TerminalVerificationError(
      "queue-path-mismatch",
      "Queue object path does not match its upload session.",
    );
  }

  let storedManifest = await storage.loadJson(receipt.manifestObjectName);
  let manifest: ReturnType<typeof parseLongSourceWorkerManifest>;
  try {
    manifest = parseLongSourceWorkerManifest(
      storedManifest.value,
      receipt.uploadSessionId,
    );
  } catch {
    throw new TerminalVerificationError(
      "worker-manifest-invalid",
      "Queued manifest is not a valid hardened long-video upload.",
    );
  }
  const initialState = manifest.longSourceVerification;
  if (
    initialState.status === "queued" &&
    storedManifest.generation !== receipt.manifestGeneration
  ) {
    throw new TerminalVerificationError(
      "queue-manifest-generation-mismatch",
      "Queue receipt does not identify the manifest generation that entered the queue.",
    );
  }

  if (initialState.status === "bytes-verified") {
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "already-complete",
      uploadSessionId: receipt.uploadSessionId,
    };
  }
  if (initialState.status === "failed-terminal") {
    await deadLetterAndDelete(
      storage,
      receipt,
      queueObject,
      initialState,
    );
    return {
      disposition: "terminal",
      uploadSessionId: receipt.uploadSessionId,
      code: initialState.failure!.code,
    };
  }

  const leaseId = randomUUID();
  const claimedState = claimLongSourceVerification({
    state: initialState,
    leaseId,
    executionId: options.executionId,
    now: options.now(),
    leaseDurationMs: options.leaseDurationMs,
  });
  if (!claimedState) {
    return {
      disposition: "busy",
      uploadSessionId: receipt.uploadSessionId,
    };
  }

  try {
    storedManifest = await storage.saveJson(
      receipt.manifestObjectName,
      withLongSourceState(storedManifest.value, claimedState, options.now()),
      storedManifest.generation,
    );
  } catch (error) {
    if (isPreconditionFailure(error)) {
      return {
        disposition: "claim-lost",
        uploadSessionId: receipt.uploadSessionId,
      };
    }
    throw error;
  }

  try {
    const evidence = await storage.sourceObjectEvidence(
      manifest.objectName,
      claimedState.objectGeneration,
    );
    assertObjectBinding(manifest, evidence);
    const hashed = await storage.hashSourceObject(
      manifest.objectName,
      claimedState.objectGeneration,
    );
    if (hashed.streamedBytes !== manifest.expectedSizeBytes) {
      throw new TerminalVerificationError(
        "stream-size-mismatch",
        `Worker streamed ${hashed.streamedBytes} bytes; expected ${manifest.expectedSizeBytes}.`,
      );
    }
    if (hashed.sha256 !== manifest.sha256) {
      throw new TerminalVerificationError(
        "sha256-mismatch",
        "Worker-computed SHA-256 does not match the immutable device digest.",
      );
    }

    const latest = await storage.loadJson(receipt.manifestObjectName);
    const latestManifest = parseLongSourceWorkerManifest(
      latest.value,
      receipt.uploadSessionId,
    );
    const completedState = completeLongSourceVerification({
      state: latestManifest.longSourceVerification,
      leaseId,
      evidence: {
        expectedSha256: manifest.sha256,
        computedSha256: hashed.sha256,
        expectedSizeBytes: manifest.expectedSizeBytes,
        streamedSizeBytes: hashed.streamedBytes,
        bucketName: manifest.bucketName,
        objectName: manifest.objectName,
        generation: claimedState.objectGeneration,
        crc32c: evidence!.crc32c,
        md5Hash: evidence!.md5Hash,
        workerBuildId: options.buildId,
        workerImageDigest: options.imageDigest,
        verifiedAt: options.now().toISOString(),
      },
    });
    await storage.saveJson(
      receipt.manifestObjectName,
      withLongSourceState(latest.value, completedState, options.now()),
      latest.generation,
    );
    await storage.deleteObject(queueObject.name, queueObject.generation);
    return {
      disposition: "verified",
      uploadSessionId: receipt.uploadSessionId,
      streamedBytes: hashed.streamedBytes,
    };
  } catch (error) {
    if (!(error instanceof TerminalVerificationError)) {
      await releaseTransientClaim(
        storage,
        receipt,
        leaseId,
        options.now(),
      );
      throw error;
    }
    const terminal = await commitTerminalFailure(
      storage,
      receipt,
      leaseId,
      error,
      options.now(),
    );
    await deadLetterAndDelete(storage, receipt, queueObject, terminal);
    return {
      disposition: "terminal",
      uploadSessionId: receipt.uploadSessionId,
      code: error.code,
    };
  }
}

async function quarantineInvalidQueueObject(
  storage: LongSourceWorkerStorage,
  queueObject: QueueObject,
  error: TerminalVerificationError,
  now: Date,
): Promise<ReceiptResult> {
  const uploadSessionId =
    queueUploadSessionId(queueObject.name) ?? "unknown";
  const fingerprint = createHash("sha256")
    .update(`${queueObject.name}:${queueObject.generation}`)
    .digest("hex");
  await storage.writeDeadLetter(
    `media-vault/control/mobile-capture-verification-dead-letter/invalid-${fingerprint}.json`,
    {
      queueObject,
      failure: {
        code: error.code,
        message: error.message,
        failedAt: now.toISOString(),
      },
      deadLetteredAt: now.toISOString(),
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
  return {
    disposition: "terminal",
    uploadSessionId,
    code: error.code,
  };
}

async function releaseTransientClaim(
  storage: LongSourceWorkerStorage,
  receipt: LongSourceQueueReceipt,
  leaseId: string,
  now: Date,
) {
  const latest = await storage.loadJson(receipt.manifestObjectName);
  const manifest = parseLongSourceWorkerManifest(
    latest.value,
    receipt.uploadSessionId,
  );
  const released = releaseLongSourceVerificationClaim({
    state: manifest.longSourceVerification,
    leaseId,
  });
  if (!released) return;
  try {
    await storage.saveJson(
      receipt.manifestObjectName,
      withLongSourceState(latest.value, released, now),
      latest.generation,
    );
  } catch (error) {
    if (!isPreconditionFailure(error)) throw error;
  }
}

async function commitTerminalFailure(
  storage: LongSourceWorkerStorage,
  receipt: LongSourceQueueReceipt,
  leaseId: string,
  error: TerminalVerificationError,
  now: Date,
) {
  const latest = await storage.loadJson(receipt.manifestObjectName);
  const manifest = parseLongSourceWorkerManifest(
    latest.value,
    receipt.uploadSessionId,
  );
  const failedState = failLongSourceVerification({
    state: manifest.longSourceVerification,
    leaseId,
    code: error.code,
    message: error.message,
    failedAt: now.toISOString(),
  });
  await storage.saveJson(
    receipt.manifestObjectName,
    withLongSourceState(latest.value, failedState, now),
    latest.generation,
  );
  return failedState;
}

async function deadLetterAndDelete(
  storage: LongSourceWorkerStorage,
  receipt: LongSourceQueueReceipt,
  queueObject: QueueObject,
  state: LongSourceVerificationState,
) {
  await storage.writeDeadLetter(
    buildLongSourceDeadLetterObjectName(receipt.uploadSessionId),
    {
      receipt,
      failure: state.failure,
      deadLetteredAt: new Date().toISOString(),
    },
    queueObject.generation,
  );
  await storage.deleteObject(queueObject.name, queueObject.generation);
}

function assertObjectBinding(
  manifest: ReturnType<typeof parseLongSourceWorkerManifest>,
  evidence: SourceObjectEvidence | null,
): asserts evidence is SourceObjectEvidence {
  if (!evidence) {
    throw new TerminalVerificationError(
      "source-object-missing",
      "The immutable source object does not exist.",
    );
  }
  if (
    evidence.bucketName !== manifest.bucketName ||
    evidence.objectName !== manifest.objectName ||
    evidence.generation !==
      manifest.longSourceVerification.objectGeneration ||
    evidence.sizeBytes !== manifest.expectedSizeBytes ||
    evidence.contentType.toLowerCase() !== manifest.contentType.toLowerCase()
  ) {
    throw new TerminalVerificationError(
      "source-object-binding-mismatch",
      "Source object generation, size, type, or location changed.",
    );
  }
  const expectedMetadata: Record<string, string> = {
    quipslyContract: manifest.kind,
    quipslyUploadSessionId: manifest.uploadSessionId,
    quipslyActorUserId: manifest.actorUserId,
    quipslyProjectId: manifest.projectId,
    quipslyProjectSlug: manifest.projectSlug,
    quipslyRecordingConsentId: manifest.recordingConsentId,
    quipslyCaptureId: manifest.captureId,
    quipslyStartReceiptId: manifest.startReceiptId!,
    quipslyConsentVersion: manifest.consentVersion!,
    quipslyProcessingDisposition: manifest.processingDisposition,
    quipslyRoomReadinessBindingVersion: "1",
    quipslyExpectedSizeBytes: String(manifest.expectedSizeBytes),
    quipslyExpectedSha256: manifest.sha256,
  };
  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (metadataValue(evidence.customMetadata, key) !== expected) {
      throw new TerminalVerificationError(
        "source-object-metadata-mismatch",
        `Source object has invalid ${key} binding metadata.`,
      );
    }
  }
}

function withLongSourceState(
  value: unknown,
  state: LongSourceVerificationState,
  now: Date,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored manifest is not an object.");
  }
  return {
    ...(value as Record<string, unknown>),
    status: state.status === "failed-terminal" ? "failed" : "verifying",
    updatedAt: now.toISOString(),
    failure: state.status === "failed-terminal"
      ? {
          code: state.failure!.code,
          message: state.failure!.message,
          retryable: false,
          failedAt: state.failure!.failedAt,
        }
      : null,
    longSourceVerification: state,
  };
}

function receiptQueueName(receipt: LongSourceQueueReceipt) {
  return `media-vault/control/mobile-capture-verification-queue/${receipt.uploadSessionId}.json`;
}

function queueUploadSessionId(queueObjectName: string) {
  const match = queueObjectName.match(
    /^media-vault\/control\/mobile-capture-verification-queue\/([0-9a-f-]{36})\.json$/,
  );
  return match?.[1] ?? null;
}

function metadataValue(metadata: Record<string, string>, key: string) {
  return Object.entries(metadata).find(
    ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
  )?.[1] ?? null;
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
