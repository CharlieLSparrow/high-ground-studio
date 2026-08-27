ALTER TABLE "StudioAssistantSession"
ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "StudioAssistantSession"
ADD CONSTRAINT "StudioAssistantSession_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "StudioAssistantSession_projectId_status_idx";

CREATE INDEX "StudioAssistantSession_projectId_ownerUserId_status_idx"
ON "StudioAssistantSession"("projectId", "ownerUserId", "status");
