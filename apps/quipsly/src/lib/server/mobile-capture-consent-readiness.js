import { createHash } from "node:crypto";
import {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
} from "../mobile-capture-consent-policy.js";

export {
  MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION,
  MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT,
  MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
};

export const MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES = Object.freeze([
  "quipsly-capture-consent-v2",
  "quipsly-session-workspace-consent-v1",
  "quipsly-personal-self-capture-v1",
]);

export function isSupportedMobileCaptureConsentPresentationSurface(value) {
  return typeof value === "string"
    && MOBILE_CAPTURE_CONSENT_PRESENTATION_SURFACES.includes(value.trim());
}

function metadataObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function isoDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function latestMobileCaptureConsentForParticipant(participant, consents) {
  return [...consents]
    .filter((consent) => (
      consent.participantId === participant.id
      || (participant.userId && consent.userId === participant.userId)
    ))
    .sort((left, right) => {
      const byUpdatedAt = (isoDate(right.updatedAt) || "").localeCompare(isoDate(left.updatedAt) || "");
      return byUpdatedAt || right.id.localeCompare(left.id);
    })[0] ?? null;
}

export function buildMobileCaptureConsentVersions({ participants, consents }) {
  return participants
    .filter((participant) => Boolean(participant.userId) && participant.role !== "OBSERVER")
    .map((participant) => {
      const consent = latestMobileCaptureConsentForParticipant(participant, consents);
      const metadata = metadataObject(consent?.metadataJson);
      const presentation = metadataObject(metadata.presentationEvidence);
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
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
}

export function mobileCaptureConsentHasCurrentPolicyEvidence(consent) {
  return (
    consent.policyVersion === MOBILE_CAPTURE_CONSENT_POLICY_VERSION
    && consent.consentTextHash === MOBILE_CAPTURE_CONSENT_TEXT_SHA256
    && consent.evidenceVersion === MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION
    && consent.recordingChoiceExplicit === true
    && consent.allAudibleParticipantsNotifiedAndAgreed === true
    && isSupportedMobileCaptureConsentPresentationSurface(
      consent.presentationSurface,
    )
    && consent.presentationVersion === 1
  );
}

export function mobileCaptureConsentVersion(versions) {
  const canonicalJson = (value) => {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return createHash("sha256")
    .update(canonicalJson(versions))
    .digest("hex");
}

// Compatibility only for START receipts issued before consent hashes used
// canonical JSON. JSONB does not preserve object-key order, so this value may
// validate an old receipt only when its stored snapshot also exactly matches
// the current canonical consent material.
export function legacyMobileCaptureConsentVersion(versions) {
  return createHash("sha256")
    .update(JSON.stringify(versions))
    .digest("hex");
}

export function mobileCaptureAllPartiesReady(versions, sourceType) {
  return versions.length > 0 && versions.every((consent) => (
    consent.status === "GRANTED"
    && Boolean(consent.consentedAt)
    && !consent.revokedAt
    && mobileCaptureConsentHasCurrentPolicyEvidence(consent)
    && (sourceType === "video" ? consent.canRecordVideo : consent.canRecordAudio)
  ));
}

export function mobileCaptureAllPartiesAllowTranscription(versions) {
  return versions.length > 0 && versions.every((consent) => (
    consent.status === "GRANTED"
    && Boolean(consent.consentedAt)
    && !consent.revokedAt
    && mobileCaptureConsentHasCurrentPolicyEvidence(consent)
    && consent.transcriptionChoiceExplicit === true
    && consent.canTranscribe === true
  ));
}

/** Deterministic provider-composite snapshot: room composite captures A/V. */
export function buildMobileCaptureProviderCompositeReadiness({ participants, consents }) {
  const consentVersions = buildMobileCaptureConsentVersions({ participants, consents });
  const consentVersion = mobileCaptureConsentVersion(consentVersions);
  const allPartiesAudioReady = mobileCaptureAllPartiesReady(consentVersions, "audio");
  const allPartiesVideoReady = mobileCaptureAllPartiesReady(consentVersions, "video");
  const allPartiesAllowTranscription = mobileCaptureAllPartiesAllowTranscription(consentVersions);
  return {
    consentVersions,
    consentVersion,
    allPartiesAudioReady,
    allPartiesVideoReady,
    allPartiesSourceReady: allPartiesAudioReady && allPartiesVideoReady,
    allPartiesAllowTranscription,
  };
}
