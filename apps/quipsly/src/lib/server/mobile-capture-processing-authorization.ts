import "server-only";

import { createHash } from "node:crypto";

import type {
  MobileCaptureProcessingAuthorization,
  MobileCaptureResumableManifest,
} from "@/lib/server/mobile-capture-resumable-store";
import {
  evaluateMobileCaptureRoomReadiness,
  type MobileCaptureRoomReadinessEvaluation,
} from "@/lib/server/mobile-capture-room-readiness";

export const EXTERNAL_SOURCE_IMPORT_PROFILE_KIND =
  "quipsly-nest-external-recording-import-v1";
export const EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION =
  "quipsly-source-import-attestation-2026-09-01";
export const EXTERNAL_SOURCE_IMPORT_ATTESTATION =
  "I confirm that everyone heard or shown in this source agreed to be recorded when it was made.";

type ExternalImportBinding = {
  uploadSessionId: string;
  captureId: string;
  captureGroupId: string;
  callRoomId: string;
  actorUserId: string;
  participantId: string;
  recordingConsentId: string;
  sourceType: "audio" | "video";
  sha256: string;
  expectedSizeBytes: number;
  fileName: string;
};

function sourceProfile(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function isExternalSourceImportProfile(value: string | null | undefined) {
  const profile = sourceProfile(value);
  return profile?.kind === EXTERNAL_SOURCE_IMPORT_PROFILE_KIND
    && profile.clientKind === "web";
}

function authorizationMatchesBinding(
  authorization: any,
  binding: ExternalImportBinding,
) {
  return Boolean(
    authorization
    && authorization.uploadSessionId === binding.uploadSessionId
    && authorization.captureId === binding.captureId
    && authorization.captureGroupId === binding.captureGroupId
    && authorization.roomId === binding.callRoomId
    && authorization.actorUserId === binding.actorUserId
    && authorization.participantId === binding.participantId
    && authorization.recordingConsentId === binding.recordingConsentId
    && authorization.sourceType === binding.sourceType
    && authorization.sha256 === binding.sha256
    && Number(authorization.sizeBytes) === binding.expectedSizeBytes
    && authorization.fileName === binding.fileName
    && authorization.attestationVersion === EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
  );
}

export async function authorizeExternalSourceImport(input: {
  prisma: any;
  binding: ExternalImportBinding;
  explicitlyAttested: boolean;
  uploadOrigin: string;
}) {
  if (!input.explicitlyAttested) {
    return {
      ok: false as const,
      status: 400,
      error: "Confirm that everyone in the recording agreed when it was made.",
    };
  }

  const readiness = await evaluateMobileCaptureRoomReadiness({
    prisma: input.prisma,
    roomId: input.binding.callRoomId,
    captureId: input.binding.captureId,
    actorUserId: input.binding.actorUserId,
    recordingConsentId: input.binding.recordingConsentId,
    sourceType: input.binding.sourceType,
  });
  if (
    !readiness.allPartiesCurrentlyReady
    || readiness.actorConsentId !== input.binding.recordingConsentId
  ) {
    return {
      ok: false as const,
      status: 409,
      error: "Everyone in this Session must allow this recording type before it can be imported.",
    };
  }

  const attestedAt = new Date();
  const metadataJson = {
    schema: "quipsly-capture-source-import-authorization-v1",
    uploadOrigin: input.uploadOrigin,
    attestation: EXTERNAL_SOURCE_IMPORT_ATTESTATION,
    attestationSha256: createHash("sha256")
      .update(EXTERNAL_SOURCE_IMPORT_ATTESTATION)
      .digest("hex"),
    allPartyConsentVersions: readiness.consentVersions,
  };
  const authorization = await input.prisma.captureSourceImportAuthorization.upsert({
    where: { uploadSessionId: input.binding.uploadSessionId },
    create: {
      uploadSessionId: input.binding.uploadSessionId,
      captureId: input.binding.captureId,
      captureGroupId: input.binding.captureGroupId,
      roomId: input.binding.callRoomId,
      actorUserId: input.binding.actorUserId,
      participantId: input.binding.participantId,
      recordingConsentId: input.binding.recordingConsentId,
      consentVersion: readiness.consentVersion,
      sourceType: input.binding.sourceType,
      sha256: input.binding.sha256,
      sizeBytes: BigInt(input.binding.expectedSizeBytes),
      fileName: input.binding.fileName,
      attestationVersion: EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION,
      attestedAt,
      metadataJson,
    },
    update: {},
  });
  if (!authorizationMatchesBinding(authorization, input.binding)) {
    return {
      ok: false as const,
      status: 409,
      error: "This import identity is already bound to a different source. Choose the file again to start a new import.",
    };
  }

  return {
    ok: true as const,
    authorization: {
      kind: "source-import",
      authorizationId: authorization.id,
      consentVersion: authorization.consentVersion,
      attestationVersion: authorization.attestationVersion,
    } satisfies MobileCaptureProcessingAuthorization,
    readiness,
  };
}

export type MobileCaptureProcessingAuthorizationEvaluation = {
  authorized: boolean;
  reasonCode: string;
  reason: string;
  readiness: MobileCaptureRoomReadinessEvaluation;
  authorization: MobileCaptureProcessingAuthorization | null;
};

export async function evaluateMobileCaptureProcessingAuthorization(input: {
  prisma: any;
  manifest: MobileCaptureResumableManifest;
}): Promise<MobileCaptureProcessingAuthorizationEvaluation> {
  const manifest = input.manifest;
  const readiness = await evaluateMobileCaptureRoomReadiness({
    prisma: input.prisma,
    roomId: manifest.callRoomId,
    captureId: manifest.captureId,
    actorUserId: manifest.actorUserId,
    recordingConsentId: manifest.recordingConsentId,
    sourceType: manifest.sourceType as "audio" | "video",
  });
  const authorization = manifest.processingAuthorization;
  const currentConsentReady = readiness.allPartiesCurrentlyReady
    && readiness.actorConsentId === manifest.recordingConsentId;
  if (!currentConsentReady) {
    return {
      authorized: false,
      reasonCode: "ALL_PARTY_CONSENT_REQUIRED",
      reason: "Everyone in this Session must currently allow this recording type.",
      readiness,
      authorization,
    };
  }
  if (manifest.processingDisposition !== "eligible" || !authorization) {
    return {
      authorized: false,
      reasonCode: "PROCESSING_AUTHORIZATION_REQUIRED",
      reason: "This source has no immutable recording authorization.",
      readiness,
      authorization,
    };
  }
  if (authorization.kind === "capture-start") {
    const authorized = readiness.eligibleForProcessing
      && authorization.authorizationId === readiness.startReceiptId
      && authorization.consentVersion === readiness.startConsentVersion
      && manifest.startReceiptId === authorization.authorizationId
      && manifest.consentVersion === authorization.consentVersion;
    return {
      authorized,
      reasonCode: authorized ? "READY" : "IMMUTABLE_START_BINDING_REQUIRED",
      reason: authorized
        ? "The live capture has an exact actor-owned START and consent binding."
        : "The live capture no longer matches its immutable START and consent binding.",
      readiness,
      authorization,
    };
  }

  const imported = await input.prisma.captureSourceImportAuthorization.findUnique({
    where: { uploadSessionId: manifest.uploadSessionId },
  });
  if (!manifest.participantId) {
    return {
      authorized: false,
      reasonCode: "SOURCE_IMPORT_PARTICIPANT_REQUIRED",
      reason: "The imported source is not bound to a Session participant.",
      readiness,
      authorization,
    };
  }
  const binding: ExternalImportBinding = {
    uploadSessionId: manifest.uploadSessionId,
    captureId: manifest.captureId,
    captureGroupId: manifest.captureGroupId,
    callRoomId: manifest.callRoomId,
    actorUserId: manifest.actorUserId,
    participantId: manifest.participantId,
    recordingConsentId: manifest.recordingConsentId,
    sourceType: manifest.sourceType as "audio" | "video",
    sha256: manifest.sha256,
    expectedSizeBytes: manifest.expectedSizeBytes,
    fileName: manifest.fileName,
  };
  const authorized = authorizationMatchesBinding(imported, binding)
    && imported.id === authorization.authorizationId
    && imported.consentVersion === authorization.consentVersion
    && authorization.attestationVersion === EXTERNAL_SOURCE_IMPORT_ATTESTATION_VERSION;
  return {
    authorized,
    reasonCode: authorized ? "READY" : "SOURCE_IMPORT_AUTHORIZATION_MISMATCH",
    reason: authorized
      ? "The external original has an exact source-time attestation and current participant consent."
      : "The imported source does not match its immutable authorization.",
    readiness,
    authorization,
  };
}
