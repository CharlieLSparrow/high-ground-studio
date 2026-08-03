ALTER TABLE "TranscriptSpeakerAttribution"
ADD CONSTRAINT "TranscriptSpeakerAttr_status_check"
CHECK ("status" IN ('active', 'superseded')),
ADD CONSTRAINT "TranscriptSpeakerAttr_supersession_check"
CHECK (
  ("status" = 'active' AND "supersededAt" IS NULL)
  OR ("status" = 'superseded' AND "supersededAt" IS NOT NULL)
),
ADD CONSTRAINT "TranscriptSpeakerAttr_provider_label_check"
CHECK (char_length(btrim("providerSpeakerLabel")) BETWEEN 1 AND 160),
ADD CONSTRAINT "TranscriptSpeakerAttr_participant_label_check"
CHECK (char_length(btrim("participantDisplaySnapshot")) BETWEEN 1 AND 160),
ADD CONSTRAINT "TranscriptSpeakerAttr_request_id_check"
CHECK (char_length(btrim("clientRequestId")) BETWEEN 1 AND 160),
ADD CONSTRAINT "TranscriptSpeakerAttr_provider_snapshot_check"
CHECK ("providerSnapshotSha256" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "TranscriptSpeakerAttr_sample_ids_check"
CHECK (
  jsonb_typeof("sampleSegmentIdsJson") = 'array'
  AND jsonb_array_length("sampleSegmentIdsJson") BETWEEN 1 AND 3
),
ADD CONSTRAINT "TranscriptSpeakerAttr_sample_evidence_check"
CHECK (
  jsonb_typeof("sampleEvidenceJson") = 'array'
  AND jsonb_array_length("sampleEvidenceJson") = jsonb_array_length("sampleSegmentIdsJson")
);
