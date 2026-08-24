CREATE TYPE "SessionAudioAlignmentDecisionOperation" AS ENUM ('APPROVE', 'REVOKE');

CREATE TABLE "SessionAudioAlignmentDecisionReceipt" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "roomId" TEXT NOT NULL,
    "alignmentJobId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "operation" "SessionAudioAlignmentDecisionOperation" NOT NULL,
    "revision" INTEGER NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "requestSha256" TEXT NOT NULL,
    "resultSha256" TEXT NOT NULL,
    "placementJson" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAudioAlignmentDecisionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionAudioAlignmentDecisionReceipt_requestId_key"
    ON "SessionAudioAlignmentDecisionReceipt"("requestId");
CREATE UNIQUE INDEX "SessionAudioAlignmentDecisionReceipt_alignmentJobId_revision_key"
    ON "SessionAudioAlignmentDecisionReceipt"("alignmentJobId", "revision");
CREATE INDEX "SessionAudioAlignmentDecisionReceipt_roomId_createdAt_idx"
    ON "SessionAudioAlignmentDecisionReceipt"("roomId", "createdAt");
CREATE INDEX "SessionAudioAlignmentDecisionReceipt_actorUserId_createdAt_idx"
    ON "SessionAudioAlignmentDecisionReceipt"("actorUserId", "createdAt");

ALTER TABLE "SessionAudioAlignmentDecisionReceipt"
    ADD CONSTRAINT "SessionAudioAlignmentDecisionReceipt_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAlignmentDecisionReceipt"
    ADD CONSTRAINT "SessionAudioAlignmentDecisionReceipt_alignmentJobId_fkey"
    FOREIGN KEY ("alignmentJobId") REFERENCES "SessionAudioAlignmentJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionAudioAlignmentDecisionReceipt"
    ADD CONSTRAINT "SessionAudioAlignmentDecisionReceipt_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
