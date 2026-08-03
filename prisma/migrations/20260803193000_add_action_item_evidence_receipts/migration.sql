-- Reviewed transcript evidence is append-only and must not bump ActionItem.updatedAt
-- or alter canonical task state. This table also gives export/restore and source
-- return an independently addressable ledger.
CREATE TABLE "ActionItemEvidenceReceipt" (
    "id" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionItemEvidenceReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActionItemEvidenceReceipt_actionItemId_occurredAt_idx"
ON "ActionItemEvidenceReceipt"("actionItemId", "occurredAt");

CREATE INDEX "ActionItemEvidenceReceipt_actorUserId_createdAt_idx"
ON "ActionItemEvidenceReceipt"("actorUserId", "createdAt");

ALTER TABLE "ActionItemEvidenceReceipt"
ADD CONSTRAINT "ActionItemEvidenceReceipt_actionItemId_fkey"
FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionItemEvidenceReceipt"
ADD CONSTRAINT "ActionItemEvidenceReceipt_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
