-- A transcript must be able to become fully human-reviewed even when the
-- provider got a segment right. This append-only receipt records an exact
-- playback-backed "confirmed as-is" decision without fabricating a no-op
-- TranscriptCorrection.
CREATE TABLE "TranscriptSegmentVerification" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "transcriptJobId" TEXT NOT NULL,
  "segmentId" TEXT NOT NULL,
  "recordingAssetId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "reviewerEmailSnapshot" TEXT,
  "clientRequestId" TEXT NOT NULL,
  "reviewKind" TEXT NOT NULL DEFAULT 'confirmed-as-is',
  "providerTextSha256" TEXT NOT NULL,
  "providerSpeakerLabel" TEXT,
  "startSecondsSnapshot" DOUBLE PRECISION NOT NULL,
  "endSecondsSnapshot" DOUBLE PRECISION NOT NULL,
  "playbackSourceId" TEXT NOT NULL,
  "playbackPositionSeconds" DOUBLE PRECISION NOT NULL,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TranscriptSegmentVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranscriptSegVerify_reviewer_request_key"
  ON "TranscriptSegmentVerification"("reviewerUserId", "clientRequestId");
CREATE INDEX "TranscriptSegVerify_room_created_idx"
  ON "TranscriptSegmentVerification"("roomId", "createdAt");
CREATE INDEX "TranscriptSegVerify_job_segment_created_idx"
  ON "TranscriptSegmentVerification"("transcriptJobId", "segmentId", "createdAt");
CREATE INDEX "TranscriptSegVerify_asset_created_idx"
  ON "TranscriptSegmentVerification"("recordingAssetId", "createdAt");

ALTER TABLE "TranscriptSegmentVerification"
  ADD CONSTRAINT "TranscriptSegmentVerification_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptSegmentVerification"
  ADD CONSTRAINT "TranscriptSegmentVerification_transcriptJobId_fkey"
  FOREIGN KEY ("transcriptJobId") REFERENCES "TranscriptJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptSegmentVerification"
  ADD CONSTRAINT "TranscriptSegmentVerification_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "TranscriptSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptSegmentVerification"
  ADD CONSTRAINT "TranscriptSegmentVerification_recordingAssetId_fkey"
  FOREIGN KEY ("recordingAssetId") REFERENCES "RecordingAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TranscriptSegmentVerification"
  ADD CONSTRAINT "TranscriptSegmentVerification_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
