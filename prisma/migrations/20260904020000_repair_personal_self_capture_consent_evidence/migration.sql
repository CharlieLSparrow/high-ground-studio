-- Repair only server-created, actor-owned personal self-capture receipts made
-- by the briefly deployed pre-v2 metadata writer. The person's GRANTED choice,
-- policy text, capabilities, and timestamp already exist; this restores the
-- missing machine-readable presentation evidence used by the current policy.
UPDATE "RecordingConsent" AS consent
SET
  "metadataJson" = COALESCE(consent."metadataJson", '{}'::jsonb) || jsonb_build_object(
    'recordingChoiceExplicit', true,
    'transcriptionChoiceExplicit', true,
    'allAudibleParticipantsNotifiedAndAgreed', true,
    'presentationEvidence', jsonb_build_object(
      'version', 1,
      'surface', 'quipsly-personal-self-capture-v1',
      'presentedAt', consent."consentedAt",
      'serverConfirmedAt', consent."consentedAt",
      'recordingChoicePresented', true,
      'transcriptionChoicePresented', true,
      'audibleParticipantAttestationPresented', true
    )
  ),
  "updatedAt" = NOW()
FROM "CallRoom" AS room
WHERE consent."roomId" = room."id"
  AND room."purpose" = 'PERSONAL_NOTE'
  AND room."createdByUserId" = consent."userId"
  AND room."metadataJson" ->> 'personalSelfCapture' = 'true'
  AND room."metadataJson" ->> 'otherAudibleParticipantsAllowed' = 'false'
  AND consent."status" = 'GRANTED'
  AND consent."canRecordAudio" = true
  AND consent."canTranscribe" = true
  AND consent."consentedAt" IS NOT NULL
  AND consent."revokedAt" IS NULL
  AND consent."policyVersion" = '2026-07-18.capture-consent-v2'
  AND consent."metadataJson" ->> 'source' = 'ios-personal-self-capture'
  AND consent."metadataJson" ->> 'consentTextHash' = '379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9'
  AND consent."metadataJson" ->> 'consentEvidenceVersion' = '2'
  AND (
    consent."metadataJson" ->> 'recordingChoiceExplicit' IS DISTINCT FROM 'true'
    OR consent."metadataJson" ->> 'transcriptionChoiceExplicit' IS DISTINCT FROM 'true'
    OR consent."metadataJson" ->> 'allAudibleParticipantsNotifiedAndAgreed' IS DISTINCT FROM 'true'
    OR consent."metadataJson" #>> '{presentationEvidence,surface}' IS DISTINCT FROM 'quipsly-personal-self-capture-v1'
    OR consent."metadataJson" #>> '{presentationEvidence,version}' IS DISTINCT FROM '1'
  );
