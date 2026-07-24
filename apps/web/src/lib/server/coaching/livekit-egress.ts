import { createHash, createHmac } from "crypto";
import type { Prisma } from "@prisma/client";

import { createCoachingStorageClient } from "@/lib/server/coaching/gcs-storage";
import { prisma } from "@/lib/prisma";
import { webProviderCompositeConsentReadiness } from "@/lib/server/coaching/transcript-release-gate";

type ProviderEgressAction = "START" | "STOP";

type ProviderEgressResult = {
  status: "started" | "stopped" | "held";
  callRoomId: string;
  recordingAssetId?: string;
  egressId?: string;
  message: string;
};

type ProviderEgressReconciliationResult = {
  status: "verified" | "held" | "failed";
  callRoomId: string;
  recordingAssetId: string;
  transcriptJobId?: string;
  message: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
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
  const bucket =
    text(process.env.LIVEKIT_EGRESS_GCS_BUCKET) ||
    text(process.env.COACHING_CAPTURE_BUCKET) ||
    text(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
  const credentials =
    text(process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON) ||
    text(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
    text(process.env.GCP_SERVICE_ACCOUNT_JSON);

  const missing = [
    livekitUrl ? null : "LIVEKIT_URL",
    apiKey ? null : "LIVEKIT_API_KEY",
    apiSecret ? null : "LIVEKIT_API_SECRET",
    bucket ? null : "LIVEKIT_EGRESS_GCS_BUCKET or COACHING_CAPTURE_BUCKET",
    credentials ? null : "LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON or service account JSON",
  ].filter(Boolean) as string[];

  return { livekitUrl, apiKey, apiSecret, bucket, credentials, missing };
}

function getStorageConfig() {
  const bucket =
    text(process.env.LIVEKIT_EGRESS_GCS_BUCKET) ||
    text(process.env.COACHING_CAPTURE_BUCKET) ||
    text(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);
  const credentials =
    text(process.env.LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON) ||
    text(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
    text(process.env.GCP_SERVICE_ACCOUNT_JSON);

  return { bucket, credentials };
}

function getStorageClient(credentialsJson: string) {
  return createCoachingStorageClient(credentialsJson);
}

function providerEndpoint(livekitUrl: string, method: string) {
  return `${livekitUrl}/twirp/livekit.Egress/${method}`;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function recordingPath(roomId: string) {
  return `media-vault/recordings/livekit/${roomId}/${safeTimestamp()}-room-composite.mp4`;
}

function readManifestValue(asset: any, key: string) {
  const manifest = asset?.localManifestJson;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return "";
  const livekit = (manifest as Record<string, unknown>).livekit;
  if (!livekit || typeof livekit !== "object" || Array.isArray(livekit)) return "";
  const value = (livekit as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function readManifestObject(asset: any) {
  return readJsonObject(asset?.localManifestJson);
}

async function createHeldAsset(input: {
  room: any;
  action: ProviderEgressAction;
  reason: string;
  operatorUserId: string;
}) {
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
        action: input.action,
        heldAt: now.toISOString(),
        heldByUserId: input.operatorUserId,
        reason: input.reason,
      },
    },
  });
}

async function loadRoom(callRoomId: string) {
  const room = await (prisma as any).callRoom.findUnique({
    where: { id: callRoomId },
    include: {
      participants: true,
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

function providerConsentReason(
  readiness: ReturnType<typeof webProviderCompositeConsentReadiness>,
) {
  if (readiness.consentVersions.length === 0) {
    return "No signed-in, non-observer participants are attached to this room yet.";
  }
  if (!readiness.allPartiesSourceReady) {
    return "Provider room-composite recording requires current, explicit audio and video consent evidence for every signed-in, non-observer participant.";
  }
  return "";
}

export async function startLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
}): Promise<ProviderEgressResult> {
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

  const consentReadiness = webProviderCompositeConsentReadiness(room);
  const consentReason = providerConsentReason(consentReadiness);
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
          response: payload as Prisma.InputJsonValue,
        },
      } as Prisma.InputJsonValue,
    },
  });

  await (prisma as any).callRoom.update({
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

export async function stopLiveKitRoomCompositeEgress(input: {
  callRoomId: string;
  operatorUserId: string;
}): Promise<ProviderEgressResult> {
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

  await (prisma as any).callRoom.update({
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

export async function reconcileLiveKitEgressRecording(input: {
  recordingAssetId: string;
  operatorUserId: string;
}): Promise<ProviderEgressReconciliationResult> {
  const asset = await prisma.recordingAsset.findUnique({
    where: { id: input.recordingAssetId },
    include: {
      room: { include: { participants: true, recordingConsents: true } },
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!asset) {
    throw new Error("Recording asset was not found.");
  }

  if (asset.kind !== "SERVER_MIX") {
    throw new Error("Only provider/server-mix recordings can be reconciled by this action.");
  }

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

    return {
      status: "held",
      callRoomId: asset.roomId,
      recordingAssetId: asset.id,
      message,
    };
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

      return {
        status: "held",
        callRoomId: asset.roomId,
        recordingAssetId: asset.id,
        message,
      };
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

      return {
        status: "held",
        callRoomId: asset.roomId,
        recordingAssetId: asset.id,
        message,
      };
    }

    const now = new Date();
    const manifest = readManifestObject(asset);
    const consentBinding = readJsonObject(manifest.providerConsentBinding);
    const snapshotVersions = Array.isArray(consentBinding.consentVersions)
      ? consentBinding.consentVersions
      : [];
    const currentReadiness = webProviderCompositeConsentReadiness(asset.room);
    const snapshotConsentVersion = createHash("sha256")
      .update(JSON.stringify(snapshotVersions))
      .digest("hex");
    const consentBindingMatches = Boolean(
      consentBinding.version === 1
      && text(consentBinding.consentVersion)
      && text(consentBinding.consentVersion) === snapshotConsentVersion
      && text(consentBinding.consentVersion) === currentReadiness.consentVersion,
    );
    const sourceReleased = consentBindingMatches && currentReadiness.allPartiesSourceReady;
    const allowTranscription = sourceReleased
      && currentReadiness.allPartiesAllowTranscription;
    const sourceHoldReason = sourceReleased
      ? null
      : "Verified provider bytes remain held because the current all-party source consent no longer matches the immutable egress-start binding.";
    const transcriptHoldReason = allowTranscription
      ? null
      : "Provider transcription requires the unchanged egress-start source binding and current explicit all-party transcription consent.";
    const verifiedAsset = await prisma.recordingAsset.update({
      where: { id: asset.id },
      data: {
        status: sourceReleased ? "VERIFIED" : "HELD",
        contentType: text(metadata.contentType) || asset.contentType || "video/mp4",
        byteSize: BigInt(Math.round(byteSize)),
        uploadedAt: asset.uploadedAt || now,
        verifiedAt: now,
        errorMessage: sourceHoldReason,
        localManifestJson: {
          ...manifest,
          verification: {
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
          },
          providerProcessingDisposition: sourceReleased ? "RELEASED" : "HELD",
          providerProcessingHoldReason: sourceHoldReason,
          providerTranscriptDisposition: allowTranscription ? "RELEASED" : "HELD",
          providerTranscriptHoldReason: transcriptHoldReason,
          lastProviderConsentEvaluation: {
            evaluatedAt: now.toISOString(),
            consentVersion: currentReadiness.consentVersion,
            bindingMatches: consentBindingMatches,
            allPartiesSourceReady: currentReadiness.allPartiesSourceReady,
            allPartiesAllowTranscription: currentReadiness.allPartiesAllowTranscription,
          },
        },
      },
    });

    const existingTranscriptJob = asset.transcriptJobs?.[0];
    const transcriptJob = existingTranscriptJob
      ? existingTranscriptJob.status === "COMPLETED"
        ? existingTranscriptJob
        : await prisma.transcriptJob.update({
            where: { id: existingTranscriptJob.id },
            data: {
              status: allowTranscription ? "QUEUED" : "HELD",
              errorMessage: transcriptHoldReason,
              requestedBy: input.operatorUserId,
              resultJson: {
                ...readJsonObject(existingTranscriptJob.resultJson),
                source: "livekit-egress-reconciliation",
                storageBucket,
                storageObjectPath,
                consentVersion: currentReadiness.consentVersion,
                consentBindingMatches,
                transcriptReleased: allowTranscription,
                reconciledAt: now.toISOString(),
              },
            },
          })
      : await prisma.transcriptJob.create({
        data: {
          roomId: asset.roomId,
          assetId: verifiedAsset.id,
          status: allowTranscription ? "QUEUED" : "HELD",
          provider: "deepgram",
          language: "en",
          requestedBy: input.operatorUserId,
          errorMessage: transcriptHoldReason,
          resultJson: {
            source: "livekit-egress-reconciliation",
            storageBucket,
            storageObjectPath,
            consentVersion: currentReadiness.consentVersion,
            consentBindingMatches,
            transcriptReleased: allowTranscription,
            reconciledAt: now.toISOString(),
          },
        },
      });

    if (!sourceReleased) {
      return {
        status: "held",
        callRoomId: asset.roomId,
        recordingAssetId: asset.id,
        transcriptJobId: transcriptJob.id,
        message: sourceHoldReason || "Provider media remains held for consent review.",
      };
    }

    return {
      status: "verified",
      callRoomId: asset.roomId,
      recordingAssetId: asset.id,
      transcriptJobId: transcriptJob.id,
      message: allowTranscription
        ? existingTranscriptJob
          ? "Provider recording released. Existing transcript job is ready behind the shared release gate."
          : "Provider recording released and a consent-gated transcript job was queued."
        : "Provider recording is released for media use, but transcription remains held for explicit all-party consent.",
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

    return {
      status: "failed",
      callRoomId: asset.roomId,
      recordingAssetId: asset.id,
      message,
    };
  }
}
