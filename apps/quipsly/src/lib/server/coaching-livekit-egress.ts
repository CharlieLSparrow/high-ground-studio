import { createHmac } from "crypto";

import { Storage } from "@google-cloud/storage";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildMobileCaptureProviderCompositeReadiness,
  mobileCaptureConsentVersion,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import {
  buildLiveKitRecordingObjectName,
  chooseConfiguredMediaVaultBucket,
  MEDIA_VAULT_BUCKET_ENV_NAMES,
  MEDIA_VAULT_PREFIXES,
} from "@/lib/server/media-vault";

type ProviderEgressAction = "START" | "STOP";

export type QuipslyProviderEgressResult = {
  status: "started" | "stopped" | "held";
  callRoomId: string;
  recordingAssetId?: string;
  egressId?: string;
  message: string;
};

export type QuipslyProviderEgressReconciliationResult = {
  status: "verified" | "held" | "failed";
  callRoomId: string;
  recordingAssetId: string;
  transcriptJobId?: string;
  message: string;
};

export type QuipslyLiveKitEgressReadiness = {
  preferredProvider: "livekit";
  liveKitJoinConfigured: boolean;
  liveKitEgressConfigured: boolean;
  liveKitEgressStartEnabled: boolean;
  operatorEgressEnabled: boolean;
  operatorEgressRequested: boolean;
  productionStartInterlock: boolean;
  durableCommandLedgerImplemented: false;
  liveKitControlConfigured: boolean;
  mediaVaultBucketConfigured: boolean;
  storageCredentialConfigured: boolean;
  configuredBucketEnvName: string | null;
  bucketValueIsSecret: false;
  providerSecretsExposed: false;
  storagePrefix: typeof MEDIA_VAULT_PREFIXES.livekitRecording;
  missing: string[];
  sourceOfTruth: string;
  nextAction: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function parseCredentials(credentialsJson?: string | null) {
  if (!credentialsJson?.trim()) return null;

  try {
    return JSON.parse(credentialsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function signLiveKitAdminToken(input: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  subject: string;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    exp: nowSeconds + 10 * 60,
    iss: input.apiKey,
    sub: input.subject,
    nbf: nowSeconds - 5,
    video: {
      room: input.roomName,
      roomRecord: true,
    },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", input.apiSecret).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

function getLiveKitEgressConfig() {
  const livekitUrl = text(process.env.LIVEKIT_URL).replace(/\/+$/, "");
  const apiKey = text(process.env.LIVEKIT_API_KEY);
  const apiSecret = text(process.env.LIVEKIT_API_SECRET);
  const configuredBucket = chooseConfiguredMediaVaultBucket();
  const bucket = configuredBucket.bucketName;
  const credentials =
    text(process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON) ||
    text(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
    text(process.env.GCP_SERVICE_ACCOUNT_JSON);
  const liveKitControlConfigured = Boolean(livekitUrl && apiKey && apiSecret);
  const mediaVaultBucketConfigured = Boolean(bucket);
  const storageCredentialConfigured = Boolean(credentials);
  const egressRequested = process.env.LIVEKIT_EGRESS_ENABLED === "true";
  // The legacy provider call is not backed by an idempotent durable
  // command/outbox and provider reconciliation lock yet. Keep START impossible
  // in production even if a stale environment variable is present. STOP and
  // reconciliation remain available so operators can make an existing provider
  // recording safe. Local integration testing needs two explicit flags.
  const unsafeLocalOverride =
    process.env.NODE_ENV !== "production"
    && process.env.LIVEKIT_EGRESS_UNSAFE_LOCAL_DEV === "true";
  const egressEnabled = egressRequested && unsafeLocalOverride;

  const missing = [
    livekitUrl ? null : "LIVEKIT_URL",
    apiKey ? null : "LIVEKIT_API_KEY",
    apiSecret ? null : "LIVEKIT_API_SECRET",
    bucket ? null : `one media-vault bucket env (${MEDIA_VAULT_BUCKET_ENV_NAMES.join(", ")})`,
    credentials ? null : "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON or service account JSON",
  ].filter(Boolean) as string[];

  return {
    livekitUrl,
    apiKey,
    apiSecret,
    bucket,
    bucketEnvName: configuredBucket.envName,
    credentials,
    egressRequested,
    egressEnabled,
    productionStartInterlock: !unsafeLocalOverride,
    liveKitControlConfigured,
    mediaVaultBucketConfigured,
    storageCredentialConfigured,
    missing,
  };
}

export function getQuipslyLiveKitEgressReadiness(): QuipslyLiveKitEgressReadiness {
  const config = getLiveKitEgressConfig();
  const liveKitEgressConfigured =
    config.liveKitControlConfigured &&
    config.mediaVaultBucketConfigured &&
    config.storageCredentialConfigured;
  const liveKitEgressStartEnabled = liveKitEgressConfigured && config.egressEnabled;

  return {
    preferredProvider: "livekit",
    liveKitJoinConfigured: config.liveKitControlConfigured,
    liveKitEgressConfigured,
    liveKitEgressStartEnabled,
    operatorEgressEnabled: config.egressEnabled,
    operatorEgressRequested: config.egressRequested,
    productionStartInterlock: config.productionStartInterlock,
    durableCommandLedgerImplemented: false,
    liveKitControlConfigured: config.liveKitControlConfigured,
    mediaVaultBucketConfigured: config.mediaVaultBucketConfigured,
    storageCredentialConfigured: config.storageCredentialConfigured,
    configuredBucketEnvName: config.bucketEnvName || null,
    bucketValueIsSecret: false,
    providerSecretsExposed: false,
    storagePrefix: MEDIA_VAULT_PREFIXES.livekitRecording,
    missing: config.missing,
    sourceOfTruth:
      "LiveKit records bytes into the configured Quipsly media-vault bucket. CallRoom, RecordingAsset, TranscriptJob, packets, and receipts own meaning, access, review, and publishing truth.",
    nextAction: !config.liveKitControlConfigured
      ? "Configure LiveKit URL, API key, and API secret before provider room join or egress can work."
      : !config.mediaVaultBucketConfigured
        ? "Configure the shared Quipsly media-vault bucket before provider egress can write recordings."
        : !config.storageCredentialConfigured
          ? "Configure service-account JSON for LiveKit egress storage writes."
          : !config.egressEnabled
            ? "Provider START is interlocked until Quipsly has an idempotent durable command/outbox, per-room lock, and provider reconciliation. Local integration testing requires LIVEKIT_EGRESS_ENABLED=true plus LIVEKIT_EGRESS_UNSAFE_LOCAL_DEV=true."
            : "Unsafe local-only LiveKit egress testing is enabled; production START remains interlocked.",
  };
}

function getStorageConfig() {
  const bucket =
    chooseConfiguredMediaVaultBucket().bucketName;
  const credentials =
    text(process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON) ||
    text(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
    text(process.env.GCP_SERVICE_ACCOUNT_JSON);

  return { bucket, credentials };
}

function getStorageClient(credentialsJson: string) {
  const credentials = parseCredentials(credentialsJson);
  return credentials ? new Storage({ credentials }) : new Storage();
}

function providerEndpoint(livekitUrl: string, method: string) {
  return `${livekitUrl}/twirp/livekit.Egress/${method}`;
}

function recordingPath(roomId: string) {
  return buildLiveKitRecordingObjectName(roomId);
}

function readManifestObject(asset: any) {
  const manifest = asset?.localManifestJson;
  return manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as Record<string, unknown>)
    : {};
}

function readManifestValue(asset: any, key: string) {
  const manifest = readManifestObject(asset);
  const livekit = manifest.livekit;
  if (!livekit || typeof livekit !== "object" || Array.isArray(livekit)) return "";
  const value = (livekit as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function createHeldAsset(input: {
  room: any;
  action: ProviderEgressAction;
  reason: string;
  operatorUserId: string;
}) {
  const prisma = getPrismaClient() as any;
  const now = new Date();
  return prisma.recordingAsset.create({
    data: {
      roomId: input.room.id,
      kind: "SERVER_MIX",
      status: "HELD",
      fileName: `${input.room.id}-livekit-${input.action.toLowerCase()}-held.txt`,
      errorMessage: input.reason,
      recordedStartedAt: input.action === "START" ? now : null,
      localManifestJson: {
        provider: "livekit",
        captureGroupId: input.room.captureGroupId,
        action: input.action,
        heldAt: now.toISOString(),
        heldByUserId: input.operatorUserId,
        reason: input.reason,
      },
    },
  });
}

async function loadRoom(callRoomId: string) {
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findUnique({
    where: { id: callRoomId },
    include: {
      participants: { where: { accessStatus: "ACTIVE" } },
      recordingConsents: true,
      recordingAssets: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  if (!room) {
    throw new Error("Call room was not found.");
  }

  return room;
}

export function providerCompositeConsentReadiness(room: any) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const consents = Array.isArray(room.recordingConsents) ? room.recordingConsents : [];
  return buildMobileCaptureProviderCompositeReadiness({ participants, consents });
}

function providerCompositeConsentReason(readiness: ReturnType<typeof providerCompositeConsentReadiness>) {
  if (readiness.consentVersions.length === 0) {
    return "No signed-in, non-observer participants are attached to this room yet.";
  }
  if (!readiness.allPartiesAudioReady || !readiness.allPartiesVideoReady) {
    return "Provider room-composite recording requires every signed-in, non-observer participant to grant current audio and video recording consent.";
  }
  return "";
}

export async function startQuipslyLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
}): Promise<QuipslyProviderEgressResult> {
  const prisma = getPrismaClient() as any;
  const room = await loadRoom(input.callRoomId);
  const provider = text(room.provider).toLowerCase();
  const roomName = text(room.providerRoomId) || room.id;

  if (provider !== "livekit") {
    const reason = "Prepare this room for LiveKit before starting provider egress.";
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  if (["CANCELED", "ENDED", "FAILED"].includes(room.status)) {
    const reason = "Closed rooms cannot start provider recording.";
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  const alreadyActive = room.recordingAssets.find((asset: any) => {
    return asset.kind === "SERVER_MIX" && asset.status === "UPLOADING" && readManifestValue(asset, "egressId");
  });

  if (alreadyActive) {
    const reason = "This room already has an active provider recording. Stop it before starting another.";
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  const consentReadiness = providerCompositeConsentReadiness(room);
  const consentReason = providerCompositeConsentReason(consentReadiness);
  if (consentReason) {
    const asset = await createHeldAsset({ room, action: "START", reason: consentReason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: consentReason };
  }

  const config = getLiveKitEgressConfig();
  if (config.missing.length > 0) {
    const reason = `LiveKit provider recording is not configured: missing ${config.missing.join(", ")}.`;
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  if (!config.egressEnabled) {
    const reason =
      "LiveKit provider START is held by the production safety interlock until an idempotent durable command/outbox, per-room lock, and provider reconciliation are implemented.";
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  const filepath = recordingPath(room.id);
  const token = signLiveKitAdminToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    roomName,
    subject: `quipsly-egress-${room.id}`,
  });

  const response = await fetch(providerEndpoint(config.livekitUrl, "StartRoomCompositeEgress"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room_name: roomName,
      layout: "speaker",
      file_outputs: [
        {
          file_type: "MP4",
          filepath,
          gcp: {
            bucket: config.bucket,
            credentials: config.credentials,
          },
        },
      ],
    }),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    const reason = `LiveKit egress start failed (${response.status}): ${raw || response.statusText}`;
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  const egressId = text(payload.egress_id) || text(payload.egressId);
  if (!egressId) {
    const reason = "LiveKit accepted the egress request without returning an immutable egress ID. Provider recording remains held for operator reconciliation.";
    const asset = await createHeldAsset({ room, action: "START", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }
  const now = new Date();
  const asset = await prisma.recordingAsset.create({
    data: {
      roomId: room.id,
      kind: "SERVER_MIX",
      status: "UPLOADING",
      fileName: filepath.split("/").pop() || "livekit-room-composite.mp4",
      contentType: "video/mp4",
      storageBucket: config.bucket,
      storageObjectPath: filepath,
      recordedStartedAt: now,
      localManifestJson: {
        provider: "livekit",
        captureGroupId: room.captureGroupId,
        providerProcessingDisposition: "PENDING",
        providerTranscriptDisposition: consentReadiness.allPartiesAllowTranscription
          ? "PENDING"
          : "HELD",
        providerConsentBinding: {
          version: 1,
          sourceTypes: ["audio", "video"],
          consentVersion: consentReadiness.consentVersion,
          consentVersions: consentReadiness.consentVersions,
          allPartiesAllowTranscriptionAtStart:
            consentReadiness.allPartiesAllowTranscription,
          capturedAt: now.toISOString(),
          capturedByUserId: input.operatorUserId,
        },
        livekit: {
          egressId,
          roomName,
          filepath,
          startedAt: now.toISOString(),
          startedByUserId: input.operatorUserId,
          response: payload,
        },
      },
    },
  });

  await prisma.callRoom.update({
    where: { id: room.id },
    data: {
      status: "RECORDING",
      recordingStartedAt: now,
      metadataJson: {
        ...(room.metadataJson || {}),
        activeLiveKitEgressId: egressId,
        activeProviderRecordingAssetId: asset.id,
        providerRecordingStartedAt: now.toISOString(),
        providerRecordingStartedByUserId: input.operatorUserId,
      },
    },
  });

  return {
    status: "started",
    callRoomId: room.id,
    recordingAssetId: asset.id,
    egressId,
    message: "LiveKit provider recording started.",
  };
}

export async function stopQuipslyLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
}): Promise<QuipslyProviderEgressResult> {
  const prisma = getPrismaClient() as any;
  const room = await loadRoom(input.callRoomId);
  const roomName = text(room.providerRoomId) || room.id;
  const activeAsset = room.recordingAssets.find((asset: any) => {
    return asset.kind === "SERVER_MIX" && asset.status === "UPLOADING" && readManifestValue(asset, "egressId");
  });
  const egressId = readManifestValue(activeAsset, "egressId");

  if (!egressId) {
    const reason = "No active LiveKit egress recording was found for this room.";
    const asset = await createHeldAsset({ room, action: "STOP", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, message: reason };
  }

  const config = getLiveKitEgressConfig();
  if (config.missing.some((item) => item.startsWith("LIVEKIT_"))) {
    const reason = `LiveKit provider recording cannot be stopped from Quipsly: missing ${config.missing.join(", ")}.`;
    const asset = await createHeldAsset({ room, action: "STOP", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, egressId, message: reason };
  }

  const token = signLiveKitAdminToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    roomName,
    subject: `quipsly-egress-stop-${room.id}`,
  });

  const response = await fetch(providerEndpoint(config.livekitUrl, "StopEgress"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ egress_id: egressId }),
  });

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    const reason = `LiveKit egress stop failed (${response.status}): ${raw || response.statusText}`;
    const asset = await createHeldAsset({ room, action: "STOP", reason, operatorUserId: input.operatorUserId });
    return { status: "held", callRoomId: room.id, recordingAssetId: asset.id, egressId, message: reason };
  }

  const now = new Date();
  await prisma.recordingAsset.update({
    where: { id: activeAsset.id },
    data: {
      status: "UPLOADED",
      recordedStoppedAt: now,
      uploadedAt: now,
      localManifestJson: {
        ...(activeAsset.localManifestJson || {}),
        livekit: {
          ...((activeAsset.localManifestJson || {}).livekit || {}),
          stoppedAt: now.toISOString(),
          stoppedByUserId: input.operatorUserId,
          stopResponse: payload,
        },
      },
    },
  });

  await prisma.callRoom.update({
    where: { id: room.id },
    data: {
      status: "OPEN",
      metadataJson: {
        ...(room.metadataJson || {}),
        lastLiveKitEgressId: egressId,
        lastProviderRecordingAssetId: activeAsset.id,
        providerRecordingStoppedAt: now.toISOString(),
        providerRecordingStoppedByUserId: input.operatorUserId,
        activeLiveKitEgressId: null,
        activeProviderRecordingAssetId: null,
      },
    },
  });

  return {
    status: "stopped",
    callRoomId: room.id,
    recordingAssetId: activeAsset.id,
    egressId,
    message: "LiveKit provider recording stopped and marked uploaded pending verification.",
  };
}

function providerConsentBindingDecision(asset: any) {
  const manifest = readManifestObject(asset);
  const binding = manifest.providerConsentBinding && typeof manifest.providerConsentBinding === "object"
    && !Array.isArray(manifest.providerConsentBinding)
    ? manifest.providerConsentBinding as Record<string, any>
    : {};
  const readiness = providerCompositeConsentReadiness(asset.room);
  const snapshotVersions = Array.isArray(binding.consentVersions)
    ? binding.consentVersions
    : [];
  const bindingMatches =
    binding.version === 1
    && snapshotVersions.length > 0
    && binding.consentVersion === mobileCaptureConsentVersion(snapshotVersions)
    && binding.consentVersion === readiness.consentVersion;
  return {
    readiness,
    bindingMatches,
    sourceReleased: bindingMatches && readiness.allPartiesSourceReady,
    reason: !bindingMatches
      ? "Provider recording consent changed after START_EGRESS or the immutable start snapshot is missing. Media processing remains held pending audited provider review."
      : !readiness.allPartiesSourceReady
        ? "Current all-party audio and video recording consent is incomplete. Media processing remains held."
        : null,
  };
}

async function reconcileProviderTranscriptJob(args: {
  prisma: any;
  asset: any;
  recordingAsset: any;
  allowTranscription: boolean;
  operatorUserId: string;
  storageBucket: string;
  storageObjectPath: string;
  consentVersion: string;
  now: Date;
}) {
  const existing = args.asset.transcriptJobs?.[0] ?? null;
  const resultJson = {
    ...(existing?.resultJson && typeof existing.resultJson === "object" ? existing.resultJson : {}),
    source: "livekit-egress-reconciliation",
    storageBucket: args.storageBucket,
    storageObjectPath: args.storageObjectPath,
    providerConsentVersion: args.consentVersion,
    providerTranscriptDisposition: args.allowTranscription ? "RELEASED" : "HELD",
    reconciledAt: args.now.toISOString(),
  };
  if (!args.allowTranscription) {
    const message = "Provider transcript held until the unchanged START_EGRESS snapshot and current all-party transcription consent both authorize it.";
    if (existing) {
      if (existing.status === "COMPLETED") return existing;
      return args.prisma.transcriptJob.update({
        where: { id: existing.id },
        data: {
          status: "HELD",
          provider: "processing-hold",
          errorMessage: message,
          resultJson,
        },
      });
    }
    return args.prisma.transcriptJob.create({
      data: {
        roomId: args.asset.roomId,
        assetId: args.recordingAsset.id,
        status: "HELD",
        provider: "processing-hold",
        language: "en",
        requestedBy: args.operatorUserId,
        errorMessage: message,
        resultJson,
      },
    });
  }

  if (existing) {
    const shouldQueue = ["HELD", "FAILED"].includes(existing.status);
    return args.prisma.transcriptJob.update({
      where: { id: existing.id },
      data: {
        status: shouldQueue ? "QUEUED" : existing.status,
        provider: shouldQueue ? "deepgram" : existing.provider,
        errorMessage: shouldQueue ? null : existing.errorMessage,
        requestedBy: args.operatorUserId,
        resultJson,
      },
    });
  }
  return args.prisma.transcriptJob.create({
    data: {
      roomId: args.asset.roomId,
      assetId: args.recordingAsset.id,
      status: "QUEUED",
      provider: "deepgram",
      language: "en",
      requestedBy: args.operatorUserId,
      resultJson: {
        ...resultJson,
        queuedAfterVerifiedAt: args.now.toISOString(),
      },
    },
  });
}

export async function reconcileQuipslyLiveKitEgressRecording(input: {
  recordingAssetId: string;
  operatorUserId: string;
}): Promise<QuipslyProviderEgressReconciliationResult> {
  const prisma = getPrismaClient() as any;
  const asset = await prisma.recordingAsset.findUnique({
    where: { id: input.recordingAssetId },
    include: {
      room: {
        include: {
          participants: true,
          recordingConsents: true,
        },
      },
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!asset) throw new Error("Recording asset was not found.");
  if (asset.kind !== "SERVER_MIX") throw new Error("Only provider/server-mix recordings can be reconciled by this action.");

  const storageObjectPath = text(asset.storageObjectPath);
  const storageBucket = text(asset.storageBucket) || getStorageConfig().bucket;

  if (!storageBucket || !storageObjectPath) {
    const message = "Provider recording cannot be verified until storage bucket and object path are known.";
    await prisma.recordingAsset.update({
      where: { id: asset.id },
      data: {
        status: "HELD",
        errorMessage: message,
        localManifestJson: {
          ...readManifestObject(asset),
          verification: {
            status: "held",
            checkedAt: new Date().toISOString(),
            checkedByUserId: input.operatorUserId,
            reason: message,
          },
        },
      },
    });
    return { status: "held", callRoomId: asset.roomId, recordingAssetId: asset.id, message };
  }

  const storageConfig = getStorageConfig();
  const storage = getStorageClient(storageConfig.credentials);
  const file = storage.bucket(storageBucket).file(storageObjectPath);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      const message = "Provider recording object is not visible in storage yet. Keep it held and retry reconciliation.";
      await prisma.recordingAsset.update({
        where: { id: asset.id },
        data: {
          status: "HELD",
          errorMessage: message,
          localManifestJson: {
            ...readManifestObject(asset),
            verification: {
              status: "held",
              checkedAt: new Date().toISOString(),
              checkedByUserId: input.operatorUserId,
              storageBucket,
              storageObjectPath,
              reason: message,
            },
          },
        },
      });
      return { status: "held", callRoomId: asset.roomId, recordingAssetId: asset.id, message };
    }

    const [metadata] = await file.getMetadata();
    const byteSize = Number(metadata.size || 0);
    if (!Number.isFinite(byteSize) || byteSize <= 0) {
      const message = "Provider recording object exists but has no bytes yet. Keep it held and retry reconciliation.";
      await prisma.recordingAsset.update({
        where: { id: asset.id },
        data: {
          status: "HELD",
          errorMessage: message,
          localManifestJson: {
            ...readManifestObject(asset),
            verification: {
              status: "held",
              checkedAt: new Date().toISOString(),
              checkedByUserId: input.operatorUserId,
              storageBucket,
              storageObjectPath,
              metadata,
              reason: message,
            },
          },
        },
      });
      return { status: "held", callRoomId: asset.roomId, recordingAssetId: asset.id, message };
    }

    const now = new Date();
    const consentDecision = providerConsentBindingDecision(asset);
    const verification = {
      status: "verified",
      checkedAt: now.toISOString(),
      checkedByUserId: input.operatorUserId,
      storageBucket,
      storageObjectPath,
      metadata: {
        size: metadata.size,
        contentType: metadata.contentType,
        generation: metadata.generation,
        metageneration: metadata.metageneration,
        updated: metadata.updated,
        md5Hash: metadata.md5Hash,
        crc32c: metadata.crc32c,
      },
    };
    const allowTranscription = consentDecision.sourceReleased
      && consentDecision.readiness.allPartiesAllowTranscription;
    const verifiedAsset = await prisma.recordingAsset.update({
      where: { id: asset.id },
      data: {
        status: consentDecision.sourceReleased ? "VERIFIED" : "HELD",
        contentType: text(metadata.contentType) || asset.contentType || "video/mp4",
        byteSize: BigInt(Math.round(byteSize)),
        uploadedAt: asset.uploadedAt || now,
        verifiedAt: now,
        errorMessage: consentDecision.reason,
        localManifestJson: {
          ...readManifestObject(asset),
          verification,
          providerProcessingDisposition: consentDecision.sourceReleased
            ? "RELEASED"
            : "HELD",
          providerProcessingHoldReason: consentDecision.reason,
          providerTranscriptDisposition: allowTranscription
            ? "RELEASED"
            : "HELD",
          providerTranscriptHoldReason: allowTranscription
            ? null
            : "Provider transcript requires the unchanged START_EGRESS source snapshot and current all-party transcription consent.",
          lastProviderConsentEvaluation: {
            evaluatedAt: now.toISOString(),
            consentVersion: consentDecision.readiness.consentVersion,
            bindingMatches: consentDecision.bindingMatches,
            allPartiesAudioReady: consentDecision.readiness.allPartiesAudioReady,
            allPartiesVideoReady: consentDecision.readiness.allPartiesVideoReady,
            allPartiesAllowTranscription:
              consentDecision.readiness.allPartiesAllowTranscription,
          },
        },
      },
    });

    const transcriptJob = await reconcileProviderTranscriptJob({
      prisma,
      asset,
      recordingAsset: verifiedAsset,
      allowTranscription,
      operatorUserId: input.operatorUserId,
      storageBucket,
      storageObjectPath,
      consentVersion: consentDecision.readiness.consentVersion,
      now,
    });

    if (!consentDecision.sourceReleased) {
      return {
        status: "held",
        callRoomId: asset.roomId,
        recordingAssetId: asset.id,
        transcriptJobId: transcriptJob.id,
        message: consentDecision.reason
          || "Provider recording bytes verified, but media processing remains held.",
      };
    }
    return {
      status: "verified",
      callRoomId: asset.roomId,
      recordingAssetId: asset.id,
      transcriptJobId: transcriptJob.id,
      message: allowTranscription
        ? "Provider recording verified with unchanged all-party source and transcription consent; transcript evidence is queued or preserved."
        : "Provider recording verified for media use. Transcript remains HELD because separate all-party transcription consent is incomplete.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify provider recording object.";
    await prisma.recordingAsset.update({
      where: { id: asset.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        localManifestJson: {
          ...readManifestObject(asset),
          verification: {
            status: "failed",
            checkedAt: new Date().toISOString(),
            checkedByUserId: input.operatorUserId,
            storageBucket,
            storageObjectPath,
            error: message,
          },
        },
      },
    });

    return { status: "failed", callRoomId: asset.roomId, recordingAssetId: asset.id, message };
  }
}
