-- Preserve the established Capture/session deletion lifecycle. Studio review
-- rows have no room id and remain protected by their transcript/media source.
ALTER TABLE "TranscriptCorrection"
  DROP CONSTRAINT "TranscriptCorrection_roomId_fkey",
  DROP CONSTRAINT "TranscriptCorrection_transcriptJobId_fkey",
  ADD CONSTRAINT "TranscriptCorrection_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TranscriptCorrection_transcriptJobId_fkey"
    FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranscriptSegmentVerification"
  DROP CONSTRAINT "TranscriptSegmentVerification_roomId_fkey",
  ADD CONSTRAINT "TranscriptSegmentVerification_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
