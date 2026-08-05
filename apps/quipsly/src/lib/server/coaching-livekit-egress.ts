import { Storage } from "@google-cloud/storage";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildMobileCaptureProviderCompositeReadiness,
  mobileCaptureConsentVersion,
} from "@/lib/server/mobile-capture-consent-readiness.js";
import {
  chooseConfiguredMediaVaultBucket,
  MEDIA_VAULT_PREFIXES,
} from "@/lib/server/media-vault";
import {
  getProviderRecordingEnvironment,
  requestProviderRecordingStart,
  requestProviderRecordingStop,
  type ProviderRecordingCommandResult,
} from "@/lib/server/provider-recording-command";

export type QuipslyProviderEgressResult = ProviderRecordingCommandResult;

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
  durableCommandLedgerImplemented: true;
  authenticatedWebhookLedgerImplemented: true;
  webhookConfigured: boolean;
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

function parseCredentials(credentialsJson?: string | null) {
  if (!credentialsJson?.trim()) return null;

  try {
    return JSON.parse(credentialsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getQuipslyLiveKitEgressReadiness(): QuipslyLiveKitEgressReadiness {
  const config = getProviderRecordingEnvironment();
  const liveKitEgressConfigured =
    config.liveKitControlConfigured &&
    config.mediaVaultBucketConfigured &&
    config.storageCredentialConfigured &&
    config.webhookConfigured;
  const liveKitEgressStartEnabled = liveKitEgressConfigured && config.egressEnabled;

  return {
    preferredProvider: "livekit",
    liveKitJoinConfigured: config.liveKitControlConfigured,
    liveKitEgressConfigured,
    liveKitEgressStartEnabled,
    operatorEgressEnabled: config.egressEnabled,
    operatorEgressRequested: config.egressRequested,
    productionStartInterlock: false,
    durableCommandLedgerImplemented: true,
    authenticatedWebhookLedgerImplemented: true,
    webhookConfigured: config.webhookConfigured,
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
            ? "The durable provider command path is ready, but provider START remains deliberately disabled until LIVEKIT_EGRESS_ENABLED=true. Local protected masters are unaffected."
            : "Durable provider START/STOP, active-provider reconciliation, deterministic storage recovery, and authenticated webhook receipts are enabled.",
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

function readManifestObject(asset: any) {
  const manifest = asset?.localManifestJson;
  return manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as Record<string, unknown>)
    : {};
}

export function providerCompositeConsentReadiness(room: any) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const consents = Array.isArray(room.recordingConsents) ? room.recordingConsents : [];
  return buildMobileCaptureProviderCompositeReadiness({ participants, consents });
}

// Public control always enters through the durable command ledger. The legacy
// direct-call path has been removed so routes cannot bypass idempotency,
// per-room serialization, or provider reconciliation.
export async function startQuipslyLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
  requestId: string;
}): Promise<QuipslyProviderEgressResult> {
  return requestProviderRecordingStart(input);
}

export async function stopQuipslyLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
  requestId: string;
}): Promise<QuipslyProviderEgressResult> {
  return requestProviderRecordingStop(input);
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
