CREATE TYPE "CoachingFormOutcomeKind" AS ENUM ('NOTE', 'TASK', 'GOAL');

CREATE TABLE "CoachingFormOutcomePromotionReceipt" (
    "id" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "responseRevisionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "kind" "CoachingFormOutcomeKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "selectedFieldIdsJson" JSONB NOT NULL DEFAULT '[]',
    "sourceSnapshotJson" JSONB NOT NULL DEFAULT '{}',
    "reviewedPayloadJson" JSONB NOT NULL DEFAULT '{}',
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingFormOutcomePromotionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingFormOutcomePromotionReceipt_requestId_key"
ON "CoachingFormOutcomePromotionReceipt"("requestId");

CREATE UNIQUE INDEX "CoachFormOutcomePromotion_kind_target_key"
ON "CoachingFormOutcomePromotionReceipt"("kind", "targetId");

CREATE INDEX "CoachFormOutcomePromotion_assignment_created_idx"
ON "CoachingFormOutcomePromotionReceipt"("assignmentId", "createdAt");

CREATE INDEX "CoachFormOutcomePromotion_response_created_idx"
ON "CoachingFormOutcomePromotionReceipt"("responseRevisionId", "createdAt");

CREATE INDEX "CoachFormOutcomePromotion_actor_created_idx"
ON "CoachingFormOutcomePromotionReceipt"("actorUserId", "createdAt");

CREATE INDEX "CoachFormOutcomePromotion_removed_created_idx"
ON "CoachingFormOutcomePromotionReceipt"("removedAt", "createdAt");

ALTER TABLE "CoachingFormOutcomePromotionReceipt"
ADD CONSTRAINT "CoachingFormOutcomePromotionReceipt_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "CoachingFormAssignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachingFormOutcomePromotionReceipt"
ADD CONSTRAINT "CoachingFormOutcomePromotionReceipt_responseRevisionId_fkey"
FOREIGN KEY ("responseRevisionId") REFERENCES "CoachingFormResponseRevision"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachingFormOutcomePromotionReceipt"
ADD CONSTRAINT "CoachingFormOutcomePromotionReceipt_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
