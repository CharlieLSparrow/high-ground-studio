ALTER TABLE "TranscriptEvaluationWindow"
ADD COLUMN "sourcePlaybackEvidenceJson" JSONB NOT NULL;

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_playback_evidence_check"
CHECK (
  jsonb_typeof("sourcePlaybackEvidenceJson") = 'object'
  AND "sourcePlaybackEvidenceJson" ->> 'schema' = 'quipsly-complete-source-playback-v1'
  AND jsonb_typeof("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = 'array'
  AND jsonb_array_length("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') BETWEEN 60 AND 180
  AND char_length(btrim("sourcePlaybackEvidenceJson" ->> 'completedAt')) >= 20
);
