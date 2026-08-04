ALTER TABLE "TranscriptEvaluationWindow"
DROP CONSTRAINT "TranscriptEvalWindow_playback_evidence_check";

ALTER TABLE "TranscriptEvaluationWindow"
ADD CONSTRAINT "TranscriptEvalWindow_playback_evidence_check"
CHECK (
  jsonb_typeof("sourcePlaybackEvidenceJson") = 'object'
  AND "sourcePlaybackEvidenceJson" ->> 'playbackSourceId' = "playbackSourceId"
  AND ("sourcePlaybackEvidenceJson" ->> 'durationSeconds')::double precision = "sourceDurationSeconds"
  AND jsonb_typeof("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = 'array'
  AND char_length(btrim("sourcePlaybackEvidenceJson" ->> 'completedAt')) >= 20
  AND (
    (
      "sourcePlaybackEvidenceJson" ->> 'schema' = 'quipsly-complete-source-playback-v1'
      AND "sourceStartSeconds" = 0
      AND "sourceEndSeconds" = "sourceDurationSeconds"
      AND jsonb_array_length("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = ceil("sourceDurationSeconds")::integer
    )
    OR
    (
      "sourcePlaybackEvidenceJson" ->> 'schema' = 'quipsly-window-playback-v1'
      AND ("sourcePlaybackEvidenceJson" ->> 'startSeconds')::double precision = "sourceStartSeconds"
      AND ("sourcePlaybackEvidenceJson" ->> 'endSeconds')::double precision = "sourceEndSeconds"
      AND "sourceEndSeconds" - "sourceStartSeconds" = "sourceDurationSeconds"
      AND jsonb_array_length("sourcePlaybackEvidenceJson" -> 'listenedSecondBins') = (ceil("sourceEndSeconds") - floor("sourceStartSeconds"))::integer
    )
  )
);
