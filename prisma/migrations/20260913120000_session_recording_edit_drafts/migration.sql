CREATE TABLE "SessionRecordingEditDraft" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "takeId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "clientRequestId" UUID NOT NULL,
  "stateJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionRecordingEditDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionRecordingEditDraft_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionRecordingEditDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SessionRecordingEditDraft_roomId_userId_takeId_key" ON "SessionRecordingEditDraft"("roomId", "userId", "takeId");
CREATE INDEX "SessionRecordingEditDraft_userId_updatedAt_idx" ON "SessionRecordingEditDraft"("userId", "updatedAt");
