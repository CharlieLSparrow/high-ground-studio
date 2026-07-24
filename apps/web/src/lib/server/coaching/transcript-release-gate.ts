import { createHash } from "node:crypto";

import {
  transcriptReleaseGate,
  type TranscriptReleaseGateDecision,
  type TranscriptReleaseGateInput,
} from "@high-ground/quipsly-domain/coaching-packet";

// Parity adapter for the durable capture-consent evidence emitted by Quipsly
// Capture. These values intentionally match the current Capture v2 contract;
// stale or weaker web consent evidence fails closed.
const CONSENT_POLICY_VERSION = "2026-07-18.capture-consent-v2";
const CONSENT_TEXT_SHA256 =
  "379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9";
const CONSENT_EVIDENCE_VERSION = 2;

function asObject(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function immutableReceiptMatchesRecordingAsset(receipt: any, recordingAsset: any) {
  const metadata = asObject(receipt?.metadataJson);
  const binding = asObject(metadata.immutableUploadBinding);
  return Boolean(
    text(receipt?.recordingAssetId) === text(recordingAsset?.id)
    && text(binding.uploadSessionId) === text(receipt?.uploadSessionId)
    && text(binding.roomId) === text(recordingAsset?.roomId)
    && text(binding.sha256).toLowerCase() === text(recordingAsset?.checksum).toLowerCase()
    && text(binding.bucketName) === text(recordingAsset?.storageBucket)
    && text(binding.objectName) === text(recordingAsset?.storageObjectPath)
    && numeric(binding.sizeBytes) !== null
    && numeric(binding.sizeBytes) === numeric(recordingAsset?.byteSize),
  );
}

function latestConsent(participant: any, consents: any[]) {
  return [...consents]
    .filter((consent) => (
      consent?.participantId === participant?.id
      || (participant?.userId && consent?.userId === participant.userId)
    ))
    .sort((left, right) => {
      const byUpdatedAt = (isoDate(right?.updatedAt) || "")
        .localeCompare(isoDate(left?.updatedAt) || "");
      return byUpdatedAt || text(right?.id).localeCompare(text(left?.id));
    })[0] ?? null;
}

function consentVersions(room: any) {
  const participants = Array.isArray(room?.participants) ? room.participants : [];
  const consents = Array.isArray(room?.recordingConsents) ? room.recordingConsents : [];
  return participants
    .filter((participant: any) => Boolean(participant?.userId) && participant?.role !== "OBSERVER")
    .map((participant: any) => {
      const consent = latestConsent(participant, consents);
      const metadata = asObject(consent?.metadataJson);
      const presentation = asObject(metadata.presentationEvidence);
      return {
        participantId: participant.id,
        userId: participant.userId,
        role: participant.role || "GUEST",
        consentId: consent?.id ?? null,
        status: consent?.status || "MISSING",
        policyVersion: consent?.policyVersion || null,
        canRecordAudio: consent?.canRecordAudio === true,
        canRecordVideo: consent?.canRecordVideo === true,
        canTranscribe: consent?.canTranscribe === true,
        consentedAt: isoDate(consent?.consentedAt),
        revokedAt: isoDate(consent?.revokedAt),
        updatedAt: isoDate(consent?.updatedAt),
        consentTextHash: typeof metadata.consentTextHash === "string"
          ? metadata.consentTextHash
          : null,
        evidenceVersion: Number.isInteger(metadata.consentEvidenceVersion)
          ? metadata.consentEvidenceVersion
          : null,
        recordingChoiceExplicit: metadata.recordingChoiceExplicit === true,
        transcriptionChoiceExplicit: metadata.transcriptionChoiceExplicit === true,
        allAudibleParticipantsNotifiedAndAgreed:
          metadata.allAudibleParticipantsNotifiedAndAgreed === true,
        presentationSurface: typeof presentation.surface === "string"
          ? presentation.surface
          : null,
        presentationVersion: Number.isInteger(presentation.version)
          ? presentation.version
          : null,
      };
    })
    .sort((left: any, right: any) => left.participantId.localeCompare(right.participantId));
}

function consentEvidenceIsCurrent(consent: any) {
  return consent.policyVersion === CONSENT_POLICY_VERSION
    && consent.consentTextHash === CONSENT_TEXT_SHA256
    && consent.evidenceVersion === CONSENT_EVIDENCE_VERSION
    && consent.recordingChoiceExplicit === true
    && consent.allAudibleParticipantsNotifiedAndAgreed === true
    && consent.presentationSurface === "quipsly-capture-consent-v2"
    && consent.presentationVersion === 1;
}

function allPartiesSourceReady(versions: any[]) {
  return versions.length > 0 && versions.every((consent) => (
    consent.status === "GRANTED"
    && Boolean(consent.consentedAt)
    && !consent.revokedAt
    && consentEvidenceIsCurrent(consent)
    && consent.canRecordAudio === true
    && consent.canRecordVideo === true
  ));
}

function allPartiesAllowTranscription(versions: any[]) {
  return versions.length > 0 && versions.every((consent) => (
    consent.status === "GRANTED"
    && Boolean(consent.consentedAt)
    && !consent.revokedAt
    && consentEvidenceIsCurrent(consent)
    && consent.transcriptionChoiceExplicit === true
    && consent.canTranscribe === true
  ));
}

function consentVersion(versions: any[]) {
  return createHash("sha256").update(JSON.stringify(versions)).digest("hex");
}

export function webProviderCompositeConsentReadiness(room: any) {
  const versions = consentVersions(room);
  return {
    consentVersions: versions,
    consentVersion: consentVersion(versions),
    allPartiesSourceReady: allPartiesSourceReady(versions),
    allPartiesAllowTranscription: allPartiesAllowTranscription(versions),
  };
}

export function transcriptReleaseGateInputFromEvidence(input: {
  recordingAsset: any;
  receipts?: any[];
  room?: any;
}): TranscriptReleaseGateInput {
  const manifest = asObject(input.recordingAsset?.localManifestJson);
  const livekit = asObject(manifest.livekit);
  const verification = asObject(manifest.verification);
  const binding = asObject(manifest.providerConsentBinding);
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  const readiness = webProviderCompositeConsentReadiness(input.room);
  const versions = readiness.consentVersions;
  const currentConsentVersion = readiness.consentVersion;
  const snapshotVersions = Array.isArray(binding.consentVersions)
    ? binding.consentVersions
    : [];

  return {
    manifestProcessingDisposition: text(manifest.processingDisposition) || null,
    manifestTranscriptDisposition:
      text(manifest.transcriptionDisposition)
      || text(manifest.transcriptDisposition)
      || null,
    manifestProcessingHoldReasonCode: text(manifest.processingHoldReasonCode) || null,
    manifestProcessingHoldReason: text(manifest.processingHoldReason) || null,
    manifestTranscriptHoldReasonCode:
      text(manifest.transcriptionHoldReasonCode)
      || text(manifest.transcriptHoldReasonCode)
      || null,
    manifestTranscriptHoldReason:
      text(manifest.transcriptionHoldReason)
      || text(manifest.transcriptHoldReason)
      || null,
    normalizedFinalizationReceipts: receipts.map((receipt) => ({
      processingDisposition: text(receipt?.processingDisposition) || null,
      transcriptDisposition: text(receipt?.transcriptDisposition) || null,
      immutableBindingMatches: immutableReceiptMatchesRecordingAsset(
        receipt,
        input.recordingAsset,
      ),
      holdReasonCode: text(receipt?.holdReasonCode) || null,
      holdReason: text(receipt?.holdReason) || null,
      transcriptHoldReasonCode: text(receipt?.transcriptHoldReasonCode) || null,
      transcriptHoldReason: text(receipt?.transcriptHoldReason) || null,
    })),
    trustedProvider: {
      immutableProviderEvidenceVerified: Boolean(
        input.recordingAsset?.kind === "SERVER_MIX"
        && manifest.provider === "livekit"
        && text(livekit.egressId)
        && verification.status === "verified"
        && text(input.recordingAsset?.storageObjectPath)
        && binding.version === 1
        && text(binding.consentVersion)
        && snapshotVersions.length > 0,
      ),
      roomEvidenceAvailable: Boolean(input.room),
      currentAllPartySourceConsent: readiness.allPartiesSourceReady,
      currentAllPartyTranscriptionConsent: readiness.allPartiesAllowTranscription,
      immutableConsentBindingMatches: Boolean(
        input.room
        && text(binding.consentVersion) === currentConsentVersion
        && text(binding.consentVersion) === consentVersion(snapshotVersions),
      ),
      processingDisposition: text(manifest.providerProcessingDisposition) || null,
      transcriptDisposition: text(manifest.providerTranscriptDisposition) || null,
    },
  };
}

export async function coachingTranscriptReleaseGate(input: {
  prisma: any;
  recordingAsset: any;
}): Promise<TranscriptReleaseGateDecision> {
  const receipts = await input.prisma.mobileCaptureFinalizationReceipt.findMany({
    where: { recordingAssetId: input.recordingAsset.id },
    orderBy: { createdAt: "asc" },
  });
  const room = receipts.length === 0
    ? await input.prisma.callRoom.findUnique({
        where: { id: input.recordingAsset.roomId },
        include: { participants: true, recordingConsents: true },
      })
    : null;
  return transcriptReleaseGate(transcriptReleaseGateInputFromEvidence({
    recordingAsset: input.recordingAsset,
    receipts,
    room,
  }));
}
