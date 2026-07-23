CREATE TYPE "TaskReminderOperation" AS ENUM (
  'CREATED',
  'RESCHEDULED',
  'CANCELED',
  'REACTIVATED'
);

CREATE TABLE "TaskReminderRevision" (
  "id" TEXT NOT NULL,
  "reminderId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "operation" "TaskReminderOperation" NOT NULL,
  "previousRemindAt" TIMESTAMP(3),
  "remindAt" TIMESTAMP(3),
  "previousStatus" "TaskReminderStatus",
  "status" "TaskReminderStatus" NOT NULL,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskReminderRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskReminderRevision_reminderId_createdAt_idx"
  ON "TaskReminderRevision"("reminderId", "createdAt");

CREATE INDEX "TaskReminderRevision_actorUserId_createdAt_idx"
  ON "TaskReminderRevision"("actorUserId", "createdAt");

ALTER TABLE "TaskReminderRevision"
  ADD CONSTRAINT "TaskReminderRevision_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "TaskReminder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskReminderRevision"
  ADD CONSTRAINT "TaskReminderRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
