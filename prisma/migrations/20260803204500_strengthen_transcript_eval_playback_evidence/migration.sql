ALTER TABLE "TranscriptEvaluationWindow"
DROP CONSTRAINT "TranscriptEvalWindow_playback_evidence_check";

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_playback_evidence_check"
CHECK (
  jsonb_typeof("sourcePlaybackEvidenceJson") = 'object'
  AND "sourcePlaybackEvidenceJson" ->> 'schema' = 'quipsly-complete-source-playback-v1'
  AND "sourcePlaybackEvidenceJson" ->> 'playbackSourceId' = "playbackSourceId"
  AND ("sourcePlaybackEvidenceJson" ->> 'durationSeconds')::double precision = "sourceDurationSeconds"
  AND jsonb_typeof("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = 'array'
  AND jsonb_array_length("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = ceil("sourceDurationSeconds")::integer
  AND char_length(btrim("sourcePlaybackEvidenceJson" ->> 'completedAt')) >= 20
);
