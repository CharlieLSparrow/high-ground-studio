-- A reminder row preserves canonical user intent. It does not claim that a
-- phone granted notification permission, scheduled an alert, or delivered it.
CREATE TYPE "TaskReminderStatus" AS ENUM ('ACTIVE', 'CANCELED');

CREATE TABLE "TaskReminder" (
  "id" TEXT NOT NULL,
  "actionItemId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "status" "TaskReminderStatus" NOT NULL DEFAULT 'ACTIVE',
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskReminder_actionItemId_key" ON "TaskReminder"("actionItemId");
CREATE INDEX "TaskReminder_ownerUserId_status_remindAt_idx" ON "TaskReminder"("ownerUserId", "status", "remindAt");
CREATE INDEX "TaskReminder_status_remindAt_idx" ON "TaskReminder"("status", "remindAt");

ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
