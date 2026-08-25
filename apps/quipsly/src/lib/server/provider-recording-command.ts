import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Storage } from "@google-cloud/storage";
import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import { buildMobileCaptureProviderCompositeReadiness } from "@/lib/server/mobile-capture-consent-readiness";
import {
  buildLiveKitRecordingObjectNameForRequest,
  chooseConfiguredMediaVaultBucket,
  MEDIA_VAULT_BUCKET_ENV_NAMES,
} from "@/lib/server/media-vault";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import {
  createLiveKitEgressProvider,
  liveKitEgressMatchesObject,
  type LiveKitEgressEvidence,
  type LiveKitEgressProvider,
  type LiveKitWebhookEvidence,
} from "@/lib/server/livekit-egress-provider";

const COMMAND_SCHEMA = "quipsly-provider-recording-command-v1";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_MILLISECONDS = 45_000;

type ProviderCommandAction = "START" | "STOP";

export type ProviderRecordingEnvironment = {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  bucket: string;
  bucketEnvName: string;
  credentials: string;
  webhookUrl: string;
  egressMode: "audio-reference" | "video-composite";
  egressRequested: boolean;
  egressEnabled: boolean;
  liveKitControlConfigured: boolean;
  mediaVaultBucketConfigured: boolean;
  storageCredentialConfigured: boolean;
  webhookConfigured: boolean;
  missing: string[];
};

export type ProviderRecordingCommandResult = {
  status:
    | "queued"
    | "processing"
    | "started"
    | "stopped"
    | "reconcile-required"
    | "held"
    | "failed";
  callRoomId: string;
  commandId: string;
  requestId: string;
  idempotentReplay: boolean;
  recordingAssetId?: string;
  egressId?: string;
  message: string;
};

export class ProviderRecordingCommandError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function json<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function retryableTransactionError(error: unknown) {
  const code = text(object(error).code);
  return ["P2002", "P2034", "23505", "40001", "40P01"].includes(code);
}

async function serializableTransaction<T>(
  prisma: any,
  operation: (tx: any) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!retryableTransactionError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

function publicOrigin() {
  const explicit = text(process.env.LIVEKIT_EGRESS_WEBHOOK_URL);
  if (explicit) return explicit;
  const configuredOrigin =
    text(process.env.QUIPSLY_PUBLIC_ORIGIN) ||
    text(process.env.NEXTAUTH_URL) ||
    text(process.env.AUTH_URL) ||
    text(process.env.QUIPSLY_APP_HOST);
  if (!configuredOrigin) return "";
  try {
    const origin = configuredOrigin.includes("://")
      ? configuredOrigin
      : `https://${configuredOrigin}`;
    return new URL("/api/providers/livekit/webhook", origin).toString();
  } catch {
    return "";
  }
}

export function getProviderRecordingEnvironment(): ProviderRecordingEnvironment {
  const livekitUrl = text(process.env.LIVEKIT_URL);
  const apiKey = text(process.env.LIVEKIT_API_KEY);
  const apiSecret = text(process.env.LIVEKIT_API_SECRET);
  const configuredBucket = chooseConfiguredMediaVaultBucket();
  const credentials =
    text(process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON) ||
    text(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
    text(process.env.GCP_SERVICE_ACCOUNT_JSON);
  const webhookUrl = publicOrigin();
  const liveKitControlConfigured = Boolean(livekitUrl && apiKey && apiSecret);
  const mediaVaultBucketConfigured = Boolean(configuredBucket.bucketName);
  const storageCredentialConfigured = Boolean(credentials);
  const webhookConfigured =
    Boolean(webhookUrl) &&
    (process.env.NODE_ENV !== "production" ||
      webhookUrl.startsWith("https://"));
  const egressRequested = process.env.LIVEKIT_EGRESS_ENABLED === "true";
  const egressMode =
    process.env.LIVEKIT_EGRESS_MODE === "video-composite"
      ? ("video-composite" as const)
      : ("audio-reference" as const);
  const missing = [
    livekitUrl ? null : "LIVEKIT_URL",
    apiKey ? null : "LIVEKIT_API_KEY",
    apiSecret ? null : "LIVEKIT_API_SECRET",
    configuredBucket.bucketName
      ? null
      : `one media-vault bucket env (${MEDIA_VAULT_BUCKET_ENV_NAMES.join(", ")})`,
    credentials
      ? null
      : "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON or service account JSON",
    webhookConfigured
      ? null
      : "LIVEKIT_EGRESS_WEBHOOK_URL or a public Quipsly origin",
  ].filter(Boolean) as string[];

  return {
    livekitUrl,
    apiKey,
    apiSecret,
    bucket: configuredBucket.bucketName,
    bucketEnvName: configuredBucket.envName,
    credentials,
    webhookUrl,
    egressMode,
    egressRequested,
    egressEnabled: egressRequested && missing.length === 0,
    liveKitControlConfigured,
    mediaVaultBucketConfigured,
    storageCredentialConfigured,
    webhookConfigured,
    missing,
  };
}

function providerForEnvironment(
  environment: ProviderRecordingEnvironment,
  supplied?: LiveKitEgressProvider,
) {
  if (supplied) return supplied;
  return createLiveKitEgressProvider({
    url: environment.livekitUrl,
    apiKey: environment.apiKey,
    apiSecret: environment.apiSecret,
    bucket: environment.bucket,
    credentials: environment.credentials,
  });
}

function commandIntent(command: any) {
  return object(command.requestJson).intent;
}

function assertReplay(
  command: any,
  input: {
    requestId: string;
    roomId: string;
    actorUserId: string;
    action: ProviderCommandAction;
  },
) {
  const expected = digest({
    schema: COMMAND_SCHEMA,
    requestId: input.requestId,
    roomId: input.roomId,
    actorUserId: input.actorUserId,
    action: input.action,
  });
  if (
    command.roomId !== input.roomId ||
    command.actorUserId !== input.actorUserId ||
    command.action !== input.action ||
    commandIntent(command) !== expected
  ) {
    throw new ProviderRecordingCommandError(
      "That request ID is already bound to a different provider recording action.",
      409,
      "PROVIDER_RECORDING_IDEMPOTENCY_CONFLICT",
    );
  }
}

function providerReadiness(room: any) {
  return buildMobileCaptureProviderCompositeReadiness({
    participants: Array.isArray(room.participants) ? room.participants : [],
    consents: Array.isArray(room.recordingConsents)
      ? room.recordingConsents
      : [],
  });
}

function providerConsentReason(
  readiness: ReturnType<typeof providerReadiness>,
) {
  if (readiness.consentVersions.length === 0) {
    return "No signed-in, non-observer participants are attached to this room yet.";
  }
  if (!readiness.allPartiesAudioReady || !readiness.allPartiesVideoReady) {
    return "Provider room-composite recording requires every signed-in, non-observer participant to grant current audio and video recording consent.";
  }
  return "";
}

function paymentHoldReason(room: any) {
  const paymentPolicy = text(room.booking?.paymentPolicy).toUpperCase();
  const paymentStatus = text(room.booking?.paymentRecord?.status).toUpperCase();
  const bookingStatus = text(room.booking?.status).toUpperCase();
  return paymentPolicy === "PAID_ONE_TO_ONE" &&
    paymentStatus !== "PAID" &&
    ["HOLDING_PAYMENT", "REQUESTED", "CONFIRMED"].includes(
      bookingStatus || "HOLDING_PAYMENT",
    )
    ? "Provider recording cannot start for a paid one-to-one coaching session until payment evidence is resolved."
    : "";
}

function asResult(
  command: any,
  idempotentReplay: boolean,
): ProviderRecordingCommandResult {
  const status =
    command.status === "APPLIED"
      ? command.action === "START"
        ? "started"
        : "stopped"
      : command.status === "PROCESSING"
        ? "processing"
        : command.status === "QUEUED"
          ? "queued"
          : command.status === "RECONCILE_REQUIRED"
            ? "reconcile-required"
            : command.status === "FAILED"
              ? "failed"
              : "held";
  const fallback =
    status === "started"
      ? "Provider safety recording started. Local protected masters remain the synchronization and production sources."
      : status === "stopped"
        ? "Provider safety recording stopped. Its file remains untrusted until storage reconciliation."
        : status === "reconcile-required"
          ? "Provider outcome is uncertain. Quipsly will not retry START blindly; reconcile the durable command first."
          : status === "held"
            ? "Provider recording is held. Local protected recording remains available and independent."
            : "Provider recording command is queued for safe processing.";
  return {
    status,
    callRoomId: command.roomId,
    commandId: command.id,
    requestId: command.requestId,
    idempotentReplay,
    ...(command.recordingAssetId
      ? { recordingAssetId: command.recordingAssetId }
      : {}),
    ...(command.providerEgressId ? { egressId: command.providerEgressId } : {}),
    message:
      command.errorMessage ||
      object(command.providerResponseJson).message ||
      fallback,
  };
}

async function loadRoom(prisma: any, roomId: string) {
  const room = await prisma.callRoom.findUnique({
    where: { id: roomId },
    include: {
      booking: { include: { paymentRecord: true } },
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
      recordingAssets: { orderBy: { createdAt: "desc" }, take: 20 },
      providerRecordingCommands: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!room) {
    throw new ProviderRecordingCommandError(
      "Call room was not found.",
      404,
      "PROVIDER_RECORDING_ROOM_NOT_FOUND",
    );
  }
  return room;
}

async function createHeldCommand(
  tx: any,
  input: {
    requestId: string;
    room: any;
    actorUserId: string;
    action: ProviderCommandAction;
    reason: string;
    errorCode: string;
    recordingAssetId?: string | null;
    providerEgressId?: string | null;
    expectedStorageBucket?: string | null;
    expectedStorageObjectPath?: string | null;
    consentVersion?: string | null;
    consentSnapshot?: unknown;
  },
) {
  return tx.providerRecordingCommand.create({
    data: {
      requestId: input.requestId,
      roomId: input.room.id,
      actorUserId: input.actorUserId,
      action: input.action,
      status: "HELD",
      provider: text(input.room.provider).toLowerCase() || "livekit",
      providerRoomId: text(input.room.providerRoomId) || input.room.id,
      captureGroupId: input.room.captureGroupId,
      recordingAssetId: input.recordingAssetId || null,
      providerEgressId: input.providerEgressId || null,
      expectedStorageBucket: input.expectedStorageBucket || null,
      expectedStorageObjectPath: input.expectedStorageObjectPath || null,
      consentVersion: input.consentVersion || null,
      consentSnapshotJson: json(input.consentSnapshot || {}),
      requestJson: json({
        schema: COMMAND_SCHEMA,
        intent: digest({
          schema: COMMAND_SCHEMA,
          requestId: input.requestId,
          roomId: input.room.id,
          actorUserId: input.actorUserId,
          action: input.action,
        }),
        localProtectedMastersRemainAuthoritative: true,
        providerRecordingIsOptionalWitness: true,
      }),
      providerResponseJson: json({ message: input.reason }),
      heldAt: new Date(),
      errorCode: input.errorCode,
      errorMessage: input.reason,
    },
  });
}

function validateRequestId(requestId: string) {
  if (!UUID.test(requestId)) {
    throw new ProviderRecordingCommandError(
      "Provider recording actions require a stable UUID request ID.",
      400,
      "INVALID_PROVIDER_RECORDING_REQUEST_ID",
    );
  }
}

export async function requestProviderRecordingStart(input: {
  callRoomId: string;
  operatorUserId: string;
  requestId: string;
  prisma?: any;
  provider?: LiveKitEgressProvider;
  environment?: ProviderRecordingEnvironment;
}): Promise<ProviderRecordingCommandResult> {
  validateRequestId(input.requestId);
  const prisma = input.prisma || (getPrismaClient() as any);
  const environment = input.environment || getProviderRecordingEnvironment();
  const existing = await prisma.providerRecordingCommand.findUnique({
    where: { requestId: input.requestId },
  });
  if (existing) {
    assertReplay(existing, {
      requestId: input.requestId,
      roomId: input.callRoomId,
      actorUserId: input.operatorUserId,
      action: "START",
    });
    if (
      ["QUEUED", "PROCESSING", "RECONCILE_REQUIRED"].includes(existing.status)
    ) {
      return processProviderRecordingCommand({
        commandId: existing.id,
        prisma,
        provider: input.provider,
        environment,
        idempotentReplay: true,
      });
    }
    return asResult(existing, true);
  }

  const command = await serializableTransaction(prisma, async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${input.callRoomId}`,
    );
    const replay = await tx.providerRecordingCommand.findUnique({
      where: { requestId: input.requestId },
    });
    if (replay) {
      assertReplay(replay, {
        requestId: input.requestId,
        roomId: input.callRoomId,
        actorUserId: input.operatorUserId,
        action: "START",
      });
      return replay;
    }
    const room = await loadRoom(tx, input.callRoomId);
    const provider = text(room.provider).toLowerCase();
    const readiness = providerReadiness(room);
    const consentReason = providerConsentReason(readiness);
    const paymentReason = paymentHoldReason(room);
    const closed = ["CANCELED", "ENDED", "FAILED"].includes(room.status);
    const activeAsset = room.recordingAssets.find(
      (asset: any) =>
        asset.kind === "SERVER_MIX" &&
        asset.status === "UPLOADING" &&
        text(object(object(asset.localManifestJson).livekit).egressId),
    );
    const roomMetadata = object(room.metadataJson);
    const activeCommand = room.providerRecordingCommands.find(
      (candidate: any) =>
        candidate.action === "START" &&
        (["QUEUED", "PROCESSING", "RECONCILE_REQUIRED"].includes(
          candidate.status,
        ) ||
          (candidate.status === "APPLIED" &&
            (roomMetadata.activeProviderRecordingCommandId === candidate.id ||
              roomMetadata.activeLiveKitEgressId ===
                candidate.providerEgressId))) &&
        candidate.recordingAssetId !== null,
    );
    const hold =
      provider !== "livekit"
        ? [
            "PROVIDER_NOT_LIVEKIT",
            "Prepare this room for LiveKit before starting provider egress.",
          ]
        : closed
          ? [
              "PROVIDER_RECORDING_ROOM_CLOSED",
              "Closed rooms cannot start provider recording.",
            ]
          : paymentReason
            ? ["PROVIDER_RECORDING_PAYMENT_HOLD", paymentReason]
            : consentReason
              ? ["PROVIDER_RECORDING_CONSENT_HOLD", consentReason]
              : activeAsset || activeCommand
                ? [
                    "PROVIDER_RECORDING_ALREADY_ACTIVE",
                    "This room already has an active or unresolved provider START command. Stop or reconcile it before starting another.",
                  ]
                : environment.missing.length > 0
                  ? [
                      "PROVIDER_RECORDING_NOT_CONFIGURED",
                      `Provider recording is not configured: missing ${environment.missing.join(", ")}.`,
                    ]
                  : !environment.egressEnabled
                    ? [
                        "PROVIDER_RECORDING_DISABLED",
                        "Provider recording is configured but deliberately disabled. Local protected masters remain available.",
                      ]
                    : null;
    if (hold) {
      return createHeldCommand(tx, {
        requestId: input.requestId,
        room,
        actorUserId: input.operatorUserId,
        action: "START",
        reason: hold[1],
        errorCode: hold[0],
        consentVersion: readiness.consentVersion,
        consentSnapshot: readiness,
      });
    }

    const storageObjectPath = buildLiveKitRecordingObjectNameForRequest(
      room.id,
      input.requestId,
      environment.egressMode,
    );
    const now = new Date();
    const asset = await tx.recordingAsset.create({
      data: {
        roomId: room.id,
        kind: "SERVER_MIX",
        status: "HELD",
        fileName: storageObjectPath.split("/").pop(),
        contentType:
          environment.egressMode === "audio-reference"
            ? "audio/ogg"
            : "video/mp4",
        storageBucket: environment.bucket,
        storageObjectPath,
        errorMessage:
          "Provider START is durably queued; no provider media is claimed yet.",
        localManifestJson: json({
          schema: COMMAND_SCHEMA,
          source: "provider-recording-command-reservation",
          provider: "livekit",
          captureGroupId: room.captureGroupId,
          requestId: input.requestId,
          expectedStorageBucket: environment.bucket,
          expectedStorageObjectPath: storageObjectPath,
          providerProcessingDisposition: "HELD",
          providerTranscriptDisposition: "HELD",
          localProtectedMastersRemainAuthoritative: true,
          providerRecordingIsOptionalWitness: true,
          providerRecordingMode: environment.egressMode,
          reservedAt: now.toISOString(),
        }),
      },
    });
    return tx.providerRecordingCommand.create({
      data: {
        requestId: input.requestId,
        roomId: room.id,
        actorUserId: input.operatorUserId,
        action: "START",
        status: "QUEUED",
        provider: "livekit",
        providerRoomId: text(room.providerRoomId) || room.id,
        captureGroupId: room.captureGroupId,
        recordingAssetId: asset.id,
        expectedStorageBucket: environment.bucket,
        expectedStorageObjectPath: storageObjectPath,
        consentVersion: readiness.consentVersion,
        consentSnapshotJson: json(readiness),
        requestJson: json({
          schema: COMMAND_SCHEMA,
          intent: digest({
            schema: COMMAND_SCHEMA,
            requestId: input.requestId,
            roomId: room.id,
            actorUserId: input.operatorUserId,
            action: "START",
          }),
          webhookUrl: environment.webhookUrl,
          providerRecordingMode: environment.egressMode,
          providerRecordingIsOptionalWitness: true,
          localProtectedMastersRemainAuthoritative: true,
          noImplicitTranscript: true,
          noImplicitStudioPromotion: true,
        }),
      },
    });
  });

  if (command.status === "HELD") return asResult(command, false);
  return processProviderRecordingCommand({
    commandId: command.id,
    prisma,
    provider: input.provider,
    environment,
    idempotentReplay: false,
  });
}

export async function requestProviderRecordingStop(input: {
  callRoomId: string;
  operatorUserId: string;
  requestId: string;
  prisma?: any;
  provider?: LiveKitEgressProvider;
  environment?: ProviderRecordingEnvironment;
}): Promise<ProviderRecordingCommandResult> {
  validateRequestId(input.requestId);
  const prisma = input.prisma || (getPrismaClient() as any);
  const environment = input.environment || getProviderRecordingEnvironment();
  const existing = await prisma.providerRecordingCommand.findUnique({
    where: { requestId: input.requestId },
  });
  if (existing) {
    assertReplay(existing, {
      requestId: input.requestId,
      roomId: input.callRoomId,
      actorUserId: input.operatorUserId,
      action: "STOP",
    });
    if (
      ["QUEUED", "PROCESSING", "RECONCILE_REQUIRED"].includes(existing.status)
    ) {
      return processProviderRecordingCommand({
        commandId: existing.id,
        prisma,
        provider: input.provider,
        environment,
        idempotentReplay: true,
      });
    }
    return asResult(existing, true);
  }

  const command = await serializableTransaction(prisma, async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${input.callRoomId}`,
    );
    const replay = await tx.providerRecordingCommand.findUnique({
      where: { requestId: input.requestId },
    });
    if (replay) return replay;
    const room = await loadRoom(tx, input.callRoomId);
    const activeAsset = room.recordingAssets.find(
      (asset: any) =>
        asset.kind === "SERVER_MIX" &&
        asset.status === "UPLOADING" &&
        text(object(object(asset.localManifestJson).livekit).egressId),
    );
    const roomMetadata = object(room.metadataJson);
    const activeStart = room.providerRecordingCommands.find(
      (candidate: any) =>
        candidate.action === "START" &&
        candidate.status === "APPLIED" &&
        candidate.providerEgressId &&
        candidate.recordingAssetId &&
        (roomMetadata.activeProviderRecordingCommandId === candidate.id ||
          roomMetadata.activeLiveKitEgressId === candidate.providerEgressId),
    );
    const recordingAssetId =
      activeAsset?.id || activeStart?.recordingAssetId || null;
    const providerEgressId =
      text(object(object(activeAsset?.localManifestJson).livekit).egressId) ||
      text(activeStart?.providerEgressId);
    if (!recordingAssetId || !providerEgressId) {
      return createHeldCommand(tx, {
        requestId: input.requestId,
        room,
        actorUserId: input.operatorUserId,
        action: "STOP",
        reason: "No active provider recording is durably bound to this room.",
        errorCode: "PROVIDER_RECORDING_NOT_ACTIVE",
      });
    }
    if (!environment.liveKitControlConfigured) {
      return createHeldCommand(tx, {
        requestId: input.requestId,
        room,
        actorUserId: input.operatorUserId,
        action: "STOP",
        reason:
          "LiveKit control credentials are unavailable. Preserve the active egress ID and stop it from an authorized operator surface.",
        errorCode: "PROVIDER_RECORDING_STOP_NOT_CONFIGURED",
        recordingAssetId,
        providerEgressId,
      });
    }
    return tx.providerRecordingCommand.create({
      data: {
        requestId: input.requestId,
        roomId: room.id,
        actorUserId: input.operatorUserId,
        action: "STOP",
        status: "QUEUED",
        provider: "livekit",
        providerRoomId: text(room.providerRoomId) || room.id,
        captureGroupId: room.captureGroupId,
        recordingAssetId,
        providerEgressId,
        expectedStorageBucket:
          activeAsset?.storageBucket || activeStart?.expectedStorageBucket,
        expectedStorageObjectPath:
          activeAsset?.storageObjectPath ||
          activeStart?.expectedStorageObjectPath,
        requestJson: json({
          schema: COMMAND_SCHEMA,
          intent: digest({
            schema: COMMAND_SCHEMA,
            requestId: input.requestId,
            roomId: room.id,
            actorUserId: input.operatorUserId,
            action: "STOP",
          }),
          targetProviderEgressId: providerEgressId,
          localProtectedMastersRemainAuthoritative: true,
        }),
      },
    });
  });

  if (command.status === "HELD") return asResult(command, false);
  return processProviderRecordingCommand({
    commandId: command.id,
    prisma,
    provider: input.provider,
    environment,
    idempotentReplay: false,
  });
}

async function claimCommand(prisma: any, commandId: string) {
  const leaseToken = randomUUID();
  return serializableTransaction(prisma, async (tx: any) => {
    const current = await tx.providerRecordingCommand.findUnique({
      where: { id: commandId },
    });
    if (!current)
      throw new ProviderRecordingCommandError(
        "Provider command was not found.",
        404,
        "PROVIDER_RECORDING_COMMAND_NOT_FOUND",
      );
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${current.roomId}`,
    );
    const command = await tx.providerRecordingCommand.findUnique({
      where: { id: commandId },
    });
    if (!command)
      throw new ProviderRecordingCommandError(
        "Provider command was not found.",
        404,
        "PROVIDER_RECORDING_COMMAND_NOT_FOUND",
      );
    if (["APPLIED", "HELD", "FAILED"].includes(command.status)) {
      return { command, claimed: false };
    }
    const now = new Date();
    if (
      command.status === "PROCESSING" &&
      command.leaseExpiresAt &&
      command.leaseExpiresAt.getTime() > now.getTime()
    )
      return { command, claimed: false };
    const claimed = await tx.providerRecordingCommand.update({
      where: { id: command.id },
      data: {
        status: "PROCESSING",
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });
    return { command: claimed, claimed: true };
  });
}

async function markCommand(
  prisma: any,
  command: any,
  input: {
    status: "RECONCILE_REQUIRED" | "HELD" | "FAILED";
    code: string;
    message: string;
    providerResponse?: unknown;
  },
) {
  const now = new Date();
  return prisma.providerRecordingCommand.update({
    where: { id: command.id },
    data: {
      status: input.status,
      providerResponseJson: json({
        ...object(command.providerResponseJson),
        ...object(input.providerResponse),
        message: input.message,
      }),
      leaseToken: null,
      leaseExpiresAt: null,
      errorCode: input.code,
      errorMessage: input.message,
      ...(input.status === "HELD" ? { heldAt: now } : {}),
      ...(input.status === "FAILED" ? { failedAt: now } : {}),
      reconciledAt:
        input.status === "RECONCILE_REQUIRED" ? now : command.reconciledAt,
    },
  });
}

async function expectedObjectEvidence(
  command: any,
  environment: ProviderRecordingEnvironment,
) {
  const bucketName = text(command.expectedStorageBucket);
  const objectPath = text(command.expectedStorageObjectPath);
  if (!bucketName || !objectPath || !environment.credentials) return null;
  try {
    const credentials = JSON.parse(environment.credentials);
    const storage = new Storage({ credentials });
    const file = storage.bucket(bucketName).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    if (!Number.isFinite(size) || size <= 0) return null;
    return {
      bucket: bucketName,
      objectPath,
      size,
      generation: text(metadata.generation),
      contentType: text(metadata.contentType),
      updated: text(metadata.updated),
      md5Hash: text(metadata.md5Hash),
      crc32c: text(metadata.crc32c),
    };
  } catch {
    return null;
  }
}

async function finalizeStart(
  prisma: any,
  command: any,
  evidence: LiveKitEgressEvidence,
  source: string,
) {
  if (!evidence.egressId) {
    return markCommand(prisma, command, {
      status: "RECONCILE_REQUIRED",
      code: "PROVIDER_START_MISSING_EGRESS_ID",
      message:
        "LiveKit evidence did not include an immutable egress ID. START will not be retried blindly.",
      providerResponse: { source, evidence: evidence.raw },
    });
  }
  return serializableTransaction(prisma, async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${command.roomId}`,
    );
    const current = await tx.providerRecordingCommand.findUnique({
      where: { id: command.id },
    });
    if (!current)
      throw new ProviderRecordingCommandError(
        "Provider command disappeared during reconciliation.",
        409,
        "PROVIDER_RECORDING_COMMAND_DRIFT",
      );
    if (current.status === "APPLIED") return current;
    const conflicting = await tx.providerRecordingCommand.findFirst({
      where: {
        providerEgressId: evidence.egressId,
        action: "START",
        NOT: { id: current.id },
      },
    });
    if (conflicting) {
      return tx.providerRecordingCommand.update({
        where: { id: current.id },
        data: {
          status: "HELD",
          heldAt: new Date(),
          errorCode: "PROVIDER_EGRESS_ID_CONFLICT",
          errorMessage:
            "The provider egress ID is already bound to another durable command.",
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
    }
    const now = new Date();
    const asset = current.recordingAssetId
      ? await tx.recordingAsset.findUnique({
          where: { id: current.recordingAssetId },
        })
      : null;
    if (!asset)
      throw new ProviderRecordingCommandError(
        "The reserved provider recording asset was not found.",
        409,
        "PROVIDER_RECORDING_ASSET_MISSING",
      );
    await tx.recordingAsset.update({
      where: { id: asset.id },
      data: {
        status: "UPLOADING",
        recordedStartedAt: asset.recordedStartedAt || now,
        errorMessage: null,
        localManifestJson: json({
          ...object(asset.localManifestJson),
          provider: "livekit",
          captureGroupId: current.captureGroupId,
          providerProcessingDisposition: "PENDING",
          providerTranscriptDisposition: object(current.consentSnapshotJson)
            .allPartiesAllowTranscription
            ? "PENDING"
            : "HELD",
          providerConsentBinding: {
            version: 1,
            consentVersion: current.consentVersion,
            consentVersions:
              object(current.consentSnapshotJson).consentVersions || [],
            allPartiesAllowTranscriptionAtStart: Boolean(
              object(current.consentSnapshotJson).allPartiesAllowTranscription,
            ),
            capturedAt: current.createdAt.toISOString(),
            capturedByUserId: current.actorUserId,
          },
          livekit: {
            egressId: evidence.egressId,
            roomName: current.providerRoomId,
            filepath: current.expectedStorageObjectPath,
            startedAt: evidence.startedAt || now.toISOString(),
            startedByUserId: current.actorUserId,
            reconciliationSource: source,
            response: evidence.raw,
          },
        }),
      },
    });
    const room = await tx.callRoom.findUnique({
      where: { id: current.roomId },
    });
    await tx.callRoom.update({
      where: { id: current.roomId },
      data: {
        status: "RECORDING",
        recordingStartedAt: room?.recordingStartedAt || now,
        metadataJson: json({
          ...object(room?.metadataJson),
          activeLiveKitEgressId: evidence.egressId,
          activeProviderRecordingAssetId: asset.id,
          activeProviderRecordingCommandId: current.id,
          providerRecordingStartedAt: evidence.startedAt || now.toISOString(),
          providerRecordingStartedByUserId: current.actorUserId,
          providerRecordingIsOptionalWitness: true,
        }),
      },
    });
    return tx.providerRecordingCommand.update({
      where: { id: current.id },
      data: {
        status: "APPLIED",
        providerEgressId: evidence.egressId,
        providerResponseJson: json({
          source,
          evidence: evidence.raw,
          message: "Provider safety recording started.",
        }),
        appliedAt: now,
        reconciledAt: source === "start-response" ? null : now,
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });
}

async function finalizeStop(
  prisma: any,
  command: any,
  evidence: LiveKitEgressEvidence | null,
  source: string,
) {
  return serializableTransaction(prisma, async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${command.roomId}`,
    );
    const current = await tx.providerRecordingCommand.findUnique({
      where: { id: command.id },
    });
    if (!current)
      throw new ProviderRecordingCommandError(
        "Provider command disappeared during STOP.",
        409,
        "PROVIDER_RECORDING_COMMAND_DRIFT",
      );
    if (current.status === "APPLIED") return current;
    const now = new Date();
    const asset = current.recordingAssetId
      ? await tx.recordingAsset.findUnique({
          where: { id: current.recordingAssetId },
        })
      : null;
    if (asset) {
      await tx.recordingAsset.update({
        where: { id: asset.id },
        data: {
          status: "UPLOADED",
          recordedStoppedAt: asset.recordedStoppedAt || now,
          uploadedAt: asset.uploadedAt || now,
          errorMessage:
            "Provider egress stopped; storage bytes still require verification.",
          localManifestJson: json({
            ...object(asset.localManifestJson),
            livekit: {
              ...object(object(asset.localManifestJson).livekit),
              stoppedAt: evidence?.endedAt || now.toISOString(),
              stoppedByUserId: current.actorUserId,
              stopReconciliationSource: source,
              stopResponse: evidence?.raw || {},
            },
          }),
        },
      });
    }
    const room = await tx.callRoom.findUnique({
      where: { id: current.roomId },
    });
    await tx.callRoom.update({
      where: { id: current.roomId },
      data: {
        status: room?.status === "RECORDING" ? "OPEN" : room?.status,
        metadataJson: json({
          ...object(room?.metadataJson),
          lastLiveKitEgressId: current.providerEgressId,
          lastProviderRecordingAssetId: current.recordingAssetId,
          providerRecordingStoppedAt: evidence?.endedAt || now.toISOString(),
          providerRecordingStoppedByUserId: current.actorUserId,
          activeLiveKitEgressId: null,
          activeProviderRecordingAssetId: null,
          activeProviderRecordingCommandId: null,
        }),
      },
    });
    return tx.providerRecordingCommand.update({
      where: { id: current.id },
      data: {
        status: "APPLIED",
        providerResponseJson: json({
          source,
          evidence: evidence?.raw || {},
          message: "Provider safety recording stopped.",
        }),
        appliedAt: now,
        reconciledAt: source === "stop-response" ? null : now,
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });
}

async function reconcileStart(input: {
  prisma: any;
  command: any;
  provider: LiveKitEgressProvider;
  environment: ProviderRecordingEnvironment;
}) {
  const active = await input.provider.listActive(input.command.providerRoomId);
  const match = active.find((item) =>
    liveKitEgressMatchesObject(item, input.command.expectedStorageObjectPath),
  );
  if (match)
    return finalizeStart(
      input.prisma,
      input.command,
      match,
      "active-provider-reconciliation",
    );
  if (active.length > 0) {
    return markCommand(input.prisma, input.command, {
      status: "HELD",
      code: "PROVIDER_ACTIVE_EGRESS_MISMATCH",
      message:
        "LiveKit reports an active room recording with a different durable output path. Quipsly will not start another.",
      providerResponse: { active: active.map((item) => item.raw) },
    });
  }
  const stored = await expectedObjectEvidence(input.command, input.environment);
  if (stored) {
    if (input.command.recordingAssetId) {
      const asset = await input.prisma.recordingAsset.findUnique({
        where: { id: input.command.recordingAssetId },
      });
      if (asset) {
        await input.prisma.recordingAsset.update({
          where: { id: asset.id },
          data: {
            status: "UPLOADED",
            byteSize: BigInt(stored.size),
            uploadedAt: new Date(),
            errorMessage:
              "Provider bytes were recovered after a lost START response. Egress identity still requires webhook/operator reconciliation.",
            localManifestJson: json({
              ...object(asset.localManifestJson),
              lostStartResponseRecovery: stored,
            }),
          },
        });
      }
    }
    return markCommand(input.prisma, input.command, {
      status: "RECONCILE_REQUIRED",
      code: "PROVIDER_START_RESPONSE_LOST_OBJECT_RECOVERED",
      message:
        "Provider bytes exist at the deterministic path, so START will not be retried. Await the authenticated webhook or reconcile the exact file.",
      providerResponse: { stored },
    });
  }
  if (input.command.dispatchedAt) {
    return markCommand(input.prisma, input.command, {
      status: "RECONCILE_REQUIRED",
      code: "PROVIDER_START_OUTCOME_UNKNOWN",
      message:
        "START may have reached LiveKit, but no matching active egress or completed object is visible yet. Quipsly will not risk a duplicate retry.",
      providerResponse: { active: active.map((item) => item.raw) },
    });
  }
  return input.command;
}

async function holdUndispatchedStartIfReadinessDrifted(input: {
  prisma: any;
  command: any;
  environment: ProviderRecordingEnvironment;
}) {
  if (input.command.action !== "START" || input.command.dispatchedAt) {
    return input.command;
  }
  const room = await loadRoom(input.prisma, input.command.roomId);
  const readiness = providerReadiness(room);
  const closed = ["CANCELED", "ENDED", "FAILED"].includes(room.status);
  const consentReason = providerConsentReason(readiness);
  const paymentReason = paymentHoldReason(room);
  const consentDrifted =
    Boolean(input.command.consentVersion) &&
    readiness.consentVersion !== input.command.consentVersion;
  const hold =
    text(room.provider).toLowerCase() !== "livekit"
      ? [
          "PROVIDER_NOT_LIVEKIT",
          "The room provider changed before START dispatch.",
        ]
      : closed
        ? [
            "PROVIDER_RECORDING_ROOM_CLOSED",
            "The room closed before provider START dispatch.",
          ]
        : paymentReason
          ? ["PROVIDER_RECORDING_PAYMENT_HOLD", paymentReason]
          : consentReason
            ? ["PROVIDER_RECORDING_CONSENT_HOLD", consentReason]
            : consentDrifted
              ? [
                  "PROVIDER_RECORDING_CONSENT_DRIFT",
                  "Participant consent evidence changed after this START command was queued. Review the current consent and issue a new explicit request.",
                ]
              : !input.environment.egressEnabled
                ? [
                    "PROVIDER_RECORDING_DISABLED",
                    input.environment.missing.length
                      ? `Provider recording became unavailable before dispatch: missing ${input.environment.missing.join(", ")}.`
                      : "Provider recording was deliberately disabled before dispatch. Local protected masters remain available.",
                  ]
                : null;
  if (!hold) return input.command;
  return markCommand(input.prisma, input.command, {
    status: "HELD",
    code: hold[0],
    message: hold[1],
    providerResponse: {
      readinessRecheckedImmediatelyBeforeDispatch: true,
      currentConsentVersion: readiness.consentVersion,
      queuedConsentVersion: input.command.consentVersion,
      localProtectedMastersRemainAuthoritative: true,
    },
  });
}

export async function processProviderRecordingCommand(input: {
  commandId: string;
  prisma?: any;
  provider?: LiveKitEgressProvider;
  environment?: ProviderRecordingEnvironment;
  idempotentReplay?: boolean;
}): Promise<ProviderRecordingCommandResult> {
  const prisma = input.prisma || (getPrismaClient() as any);
  const environment = input.environment || getProviderRecordingEnvironment();
  const claim = await claimCommand(prisma, input.commandId);
  let command = claim.command;
  if (["APPLIED", "HELD", "FAILED"].includes(command.status)) {
    return asResult(command, Boolean(input.idempotentReplay));
  }
  if (!claim.claimed) {
    return asResult(command, Boolean(input.idempotentReplay));
  }
  command = await holdUndispatchedStartIfReadinessDrifted({
    prisma,
    command,
    environment,
  });
  if (command.status === "HELD") {
    return asResult(command, Boolean(input.idempotentReplay));
  }
  if (!environment.liveKitControlConfigured) {
    command = await markCommand(prisma, command, {
      status: "HELD",
      code: "PROVIDER_RECORDING_CONTROL_NOT_CONFIGURED",
      message:
        "LiveKit control credentials are unavailable. The durable command remains visible and local protected masters are unaffected.",
    });
    return asResult(command, Boolean(input.idempotentReplay));
  }
  const provider = providerForEnvironment(environment, input.provider);

  if (command.action === "START") {
    if (command.dispatchedAt || command.status === "RECONCILE_REQUIRED") {
      try {
        command = await reconcileStart({
          prisma,
          command,
          provider,
          environment,
        });
      } catch (error) {
        command = await markCommand(prisma, command, {
          status: "RECONCILE_REQUIRED",
          code: "PROVIDER_RECONCILIATION_UNAVAILABLE",
          message: `START was already dispatched and LiveKit reconciliation is unavailable: ${error instanceof Error ? error.message : "unknown error"}. Quipsly will not retry START blindly.`,
        });
      }
      return asResult(command, Boolean(input.idempotentReplay));
    }
    let preflight;
    try {
      preflight = await reconcileStart({
        prisma,
        command,
        provider,
        environment,
      });
    } catch (error) {
      preflight = await markCommand(prisma, command, {
        status: "HELD",
        code: "PROVIDER_PREFLIGHT_UNAVAILABLE",
        message: `LiveKit could not be inspected before START: ${error instanceof Error ? error.message : "unknown error"}. No provider START was sent.`,
      });
    }
    if (preflight.status !== "PROCESSING") {
      return asResult(preflight, Boolean(input.idempotentReplay));
    }
    command = await prisma.providerRecordingCommand.update({
      where: { id: command.id },
      data: { dispatchedAt: new Date() },
    });
    try {
      const evidence = await provider.startRoomComposite({
        roomName: command.providerRoomId,
        storageObjectPath: command.expectedStorageObjectPath,
        mode:
          object(command.requestJson).providerRecordingMode ===
          "video-composite"
            ? "video-composite"
            : "audio-reference",
        webhookUrl: environment.webhookUrl,
        webhookSigningKey: environment.apiKey,
      });
      command = await finalizeStart(
        prisma,
        command,
        evidence,
        "start-response",
      );
    } catch (error) {
      try {
        command = await reconcileStart({
          prisma,
          command,
          provider,
          environment,
        });
      } catch {
        command = await markCommand(prisma, command, {
          status: "RECONCILE_REQUIRED",
          code: "PROVIDER_START_RECONCILIATION_UNAVAILABLE",
          message: `LiveKit START returned an uncertain transport outcome and reconciliation was unavailable: ${error instanceof Error ? error.message : "unknown error"}. Quipsly will not retry it blindly.`,
        });
      }
      if (command.status === "PROCESSING") {
        command = await markCommand(prisma, command, {
          status: "RECONCILE_REQUIRED",
          code: "PROVIDER_START_TRANSPORT_UNCERTAIN",
          message: `LiveKit START returned an uncertain transport outcome: ${error instanceof Error ? error.message : "unknown error"}. Quipsly will not retry it blindly.`,
        });
      }
    }
    return asResult(command, Boolean(input.idempotentReplay));
  }

  let active: LiveKitEgressEvidence[];
  try {
    active = await provider.listActive(command.providerRoomId);
  } catch (error) {
    command = await markCommand(prisma, command, {
      status: command.dispatchedAt ? "RECONCILE_REQUIRED" : "HELD",
      code: "PROVIDER_STOP_PREFLIGHT_UNAVAILABLE",
      message: `LiveKit could not be inspected before STOP: ${error instanceof Error ? error.message : "unknown error"}. The active egress ID remains visible for recovery.`,
    });
    return asResult(command, Boolean(input.idempotentReplay));
  }
  const matching = active.find(
    (item) => item.egressId === command.providerEgressId,
  );
  if (!matching) {
    command = await finalizeStop(
      prisma,
      command,
      null,
      "provider-no-longer-active",
    );
    return asResult(command, Boolean(input.idempotentReplay));
  }
  command = await prisma.providerRecordingCommand.update({
    where: { id: command.id },
    data: { dispatchedAt: command.dispatchedAt || new Date() },
  });
  try {
    const evidence = await provider.stop(command.providerEgressId);
    command = await finalizeStop(prisma, command, evidence, "stop-response");
  } catch (error) {
    let after: LiveKitEgressEvidence[] = [];
    let reconciliationFailed = false;
    try {
      after = await provider.listActive(command.providerRoomId);
    } catch {
      reconciliationFailed = true;
    }
    if (reconciliationFailed) {
      command = await markCommand(prisma, command, {
        status: "RECONCILE_REQUIRED",
        code: "PROVIDER_STOP_RECONCILIATION_UNAVAILABLE",
        message: `LiveKit STOP and follow-up reconciliation were unavailable: ${error instanceof Error ? error.message : "unknown error"}. Do not assume recording ended.`,
      });
    } else if (
      !after.some((item) => item.egressId === command.providerEgressId)
    ) {
      command = await finalizeStop(
        prisma,
        command,
        null,
        "stop-transport-reconciled-inactive",
      );
    } else {
      command = await markCommand(prisma, command, {
        status: "RECONCILE_REQUIRED",
        code: "PROVIDER_STOP_TRANSPORT_UNCERTAIN",
        message: `LiveKit STOP outcome is uncertain: ${error instanceof Error ? error.message : "unknown error"}. Reconcile before assuming recording ended.`,
      });
    }
  }
  return asResult(command, Boolean(input.idempotentReplay));
}

export async function applyLiveKitProviderWebhook(input: {
  evidence: LiveKitWebhookEvidence;
  prisma?: any;
}) {
  const prisma = input.prisma || (getPrismaClient() as any);
  const evidence = input.evidence;
  if (
    !evidence.eventId ||
    !evidence.eventType.startsWith("egress_") ||
    !evidence.egress?.egressId
  ) {
    return {
      ok: true,
      ignored: true,
      idempotentReplay: false,
      message: "Authenticated non-egress webhook acknowledged.",
    };
  }
  const room = await prisma.callRoom.findFirst({
    where: {
      OR: [
        { providerRoomId: evidence.egress.roomName },
        { id: evidence.egress.roomName },
      ],
    },
  });
  if (!room) {
    throw new ProviderRecordingCommandError(
      "Authenticated provider event did not match a Quipsly room.",
      404,
      "PROVIDER_WEBHOOK_ROOM_NOT_FOUND",
    );
  }

  return serializableTransaction(prisma, async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `provider-recording:${room.id}`,
    );
    const replay = await tx.providerRecordingEventReceipt.findUnique({
      where: { providerEventId: evidence.eventId },
    });
    if (replay) {
      return {
        ok: true,
        ignored: false,
        idempotentReplay: true,
        receiptId: replay.id,
        message: replay.applyMessage,
      };
    }
    let command = await tx.providerRecordingCommand.findFirst({
      where: {
        providerEgressId: evidence.egress!.egressId,
        ...(evidence.eventType === "egress_started" ||
        evidence.eventType === "egress_updated"
          ? { action: "START" }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!command) {
      const candidates = await tx.providerRecordingCommand.findMany({
        where: {
          roomId: room.id,
          action: "START",
          status: { in: ["QUEUED", "PROCESSING", "RECONCILE_REQUIRED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      command =
        candidates.find((candidate: any) =>
          liveKitEgressMatchesObject(
            evidence.egress!,
            candidate.expectedStorageObjectPath,
          ),
        ) || null;
    }
    const asset = command?.recordingAssetId
      ? await tx.recordingAsset.findUnique({
          where: { id: command.recordingAssetId },
        })
      : null;
    let applied = false;
    let message =
      "Authenticated provider event retained; no durable Quipsly command matched it.";
    const now = new Date();
    if (command && asset) {
      if (
        evidence.eventType === "egress_started" ||
        evidence.eventType === "egress_updated"
      ) {
        await tx.providerRecordingCommand.update({
          where: { id: command.id },
          data: {
            status: "APPLIED",
            providerEgressId: evidence.egress!.egressId,
            providerResponseJson: json({
              source: "authenticated-webhook",
              evidence: evidence.egress!.raw,
              message:
                "Provider safety recording acknowledged by authenticated webhook.",
            }),
            appliedAt: command.appliedAt || now,
            reconciledAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
        await tx.recordingAsset.update({
          where: { id: asset.id },
          data: {
            status: "UPLOADING",
            recordedStartedAt:
              asset.recordedStartedAt ||
              (evidence.egress!.startedAt
                ? new Date(evidence.egress!.startedAt)
                : now),
            errorMessage: null,
            localManifestJson: json({
              ...object(asset.localManifestJson),
              livekit: {
                ...object(object(asset.localManifestJson).livekit),
                egressId: evidence.egress!.egressId,
                roomName: evidence.egress!.roomName,
                filepath: command.expectedStorageObjectPath,
                startedAt: evidence.egress!.startedAt || now.toISOString(),
                reconciliationSource: "authenticated-webhook",
                lastEvent: evidence.egress!.raw,
              },
            }),
          },
        });
        await tx.callRoom.update({
          where: { id: room.id },
          data: {
            status: "RECORDING",
            recordingStartedAt:
              room.recordingStartedAt ||
              (evidence.egress!.startedAt
                ? new Date(evidence.egress!.startedAt)
                : now),
            metadataJson: json({
              ...object(room.metadataJson),
              activeLiveKitEgressId: evidence.egress!.egressId,
              activeProviderRecordingAssetId: asset.id,
              activeProviderRecordingCommandId: command.id,
              providerRecordingIsOptionalWitness: true,
            }),
          },
        });
        applied = true;
        message =
          "Provider START evidence reconciled from an authenticated webhook.";
      } else if (evidence.eventType === "egress_ended") {
        const providerError = text(evidence.egress!.raw.error);
        await tx.providerRecordingCommand.update({
          where: { id: command.id },
          data: {
            status: "APPLIED",
            providerEgressId: evidence.egress!.egressId,
            providerResponseJson: json({
              source: "authenticated-webhook",
              evidence: evidence.egress!.raw,
              message: providerError
                ? "Provider recording ended with an explicit provider error."
                : "Provider recording ended; storage verification remains separate.",
            }),
            appliedAt: command.appliedAt || now,
            reconciledAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
            errorCode: providerError
              ? "PROVIDER_EGRESS_ENDED_WITH_ERROR"
              : null,
            errorMessage: providerError || null,
          },
        });
        await tx.recordingAsset.update({
          where: { id: asset.id },
          data: {
            status: providerError ? "HELD" : "UPLOADED",
            recordedStoppedAt: evidence.egress!.endedAt
              ? new Date(evidence.egress!.endedAt)
              : now,
            uploadedAt: providerError
              ? asset.uploadedAt
              : asset.uploadedAt || now,
            errorMessage:
              providerError ||
              "Provider egress ended; exact storage bytes still require reconciliation.",
            localManifestJson: json({
              ...object(asset.localManifestJson),
              livekit: {
                ...object(object(asset.localManifestJson).livekit),
                egressId: evidence.egress!.egressId,
                endedAt: evidence.egress!.endedAt || now.toISOString(),
                endEvent: evidence.egress!.raw,
              },
            }),
          },
        });
        await tx.callRoom.update({
          where: { id: room.id },
          data: {
            status: room.status === "RECORDING" ? "OPEN" : room.status,
            metadataJson: json({
              ...object(room.metadataJson),
              lastLiveKitEgressId: evidence.egress!.egressId,
              lastProviderRecordingAssetId: asset.id,
              providerRecordingStoppedAt:
                evidence.egress!.endedAt || now.toISOString(),
              activeLiveKitEgressId: null,
              activeProviderRecordingAssetId: null,
              activeProviderRecordingCommandId: null,
            }),
          },
        });
        applied = true;
        message = providerError
          ? "Provider END evidence was retained with an explicit media hold."
          : "Provider END evidence reconciled; storage verification remains required.";
      }
    }
    const receipt = await tx.providerRecordingEventReceipt.create({
      data: {
        providerEventId: evidence.eventId,
        provider: "livekit",
        eventType: evidence.eventType,
        roomId: room.id,
        commandId: command?.id || null,
        recordingAssetId: asset?.id || null,
        providerEgressId: evidence.egress!.egressId,
        providerCreatedAt: evidence.createdAt
          ? new Date(evidence.createdAt)
          : null,
        payloadJson: json(evidence.raw),
        applied,
        applyMessage: message,
        appliedAt: applied ? now : null,
      },
    });
    return {
      ok: true,
      ignored: false,
      idempotentReplay: false,
      receiptId: receipt.id,
      applied,
      message,
    };
  });
}
