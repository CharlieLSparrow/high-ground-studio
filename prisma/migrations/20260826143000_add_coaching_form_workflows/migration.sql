CREATE TYPE "CoachingFormPurpose" AS ENUM (
  'INTAKE',
  'PRE_SESSION',
  'POST_SESSION',
  'REFLECTION',
  'ASSESSMENT',
  'FEEDBACK'
);

CREATE TYPE "CoachingFormTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CoachingFormAssignmentTiming" AS ENUM ('ENGAGEMENT_START', 'BEFORE_SESSION', 'AFTER_SESSION', 'ON_DEMAND');
CREATE TYPE "CoachingFormAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'CANCELED');
CREATE TYPE "CoachingFormResponseState" AS ENUM ('DRAFT', 'SUBMITTED');

CREATE TABLE "CoachingFormTemplate" (
  "id" TEXT NOT NULL,
  "ownerCoachUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "purpose" "CoachingFormPurpose" NOT NULL,
  "status" "CoachingFormTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedRevision" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachingFormTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormTemplate_published_revision_check"
    CHECK ("publishedRevision" IS NULL OR "publishedRevision" > 0)
);

CREATE TABLE "CoachingFormTemplateVersion" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "templateId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "definitionSha256" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "definitionJson" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingFormTemplateVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormTemplateVersion_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachingFormTemplateVersion_sha_check"
    CHECK ("definitionSha256" ~ '^[0-9a-f]{64}$' AND "inputSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "CoachingFormAssignment" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "bookingId" TEXT,
  "callRoomId" TEXT,
  "assignedByUserId" TEXT NOT NULL,
  "assignedToUserId" TEXT NOT NULL,
  "timing" "CoachingFormAssignmentTiming" NOT NULL DEFAULT 'ON_DEMAND',
  "status" "CoachingFormAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "currentResponseRevision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachingFormAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormAssignment_current_revision_check"
    CHECK ("currentResponseRevision" >= 0),
  CONSTRAINT "CoachingFormAssignment_sha_check"
    CHECK ("inputSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CoachingFormAssignment_state_timestamps_check" CHECK (
    ("status" <> 'SUBMITTED' OR "submittedAt" IS NOT NULL)
    AND ("status" <> 'CANCELED' OR "canceledAt" IS NOT NULL)
  )
);

CREATE TABLE "CoachingFormResponseRevision" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "state" "CoachingFormResponseState" NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "answersJson" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingFormResponseRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormResponseRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachingFormResponseRevision_sha_check"
    CHECK ("inputSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CoachingFormResponseRevision_submitted_check"
    CHECK ("state" <> 'SUBMITTED' OR "submittedAt" IS NOT NULL)
);

CREATE INDEX "CoachFormTemplate_owner_status_updated_idx"
  ON "CoachingFormTemplate"("ownerCoachUserId", "status", "updatedAt");
CREATE INDEX "CoachFormTemplate_owner_purpose_updated_idx"
  ON "CoachingFormTemplate"("ownerCoachUserId", "purpose", "updatedAt");
CREATE UNIQUE INDEX "CoachFormTemplateVersion_template_revision_key"
  ON "CoachingFormTemplateVersion"("templateId", "revision");
CREATE UNIQUE INDEX "CoachingFormTemplateVersion_requestId_key"
  ON "CoachingFormTemplateVersion"("requestId");
CREATE UNIQUE INDEX "CoachFormTemplateVersion_id_template_key"
  ON "CoachingFormTemplateVersion"("id", "templateId");
CREATE INDEX "CoachFormTemplateVersion_creator_created_idx"
  ON "CoachingFormTemplateVersion"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "CoachingFormAssignment_requestId_key"
  ON "CoachingFormAssignment"("requestId");
CREATE INDEX "CoachFormAssignment_recipient_status_due_idx"
  ON "CoachingFormAssignment"("assignedToUserId", "status", "dueAt");
CREATE INDEX "CoachFormAssignment_coach_status_due_idx"
  ON "CoachingFormAssignment"("assignedByUserId", "status", "dueAt");
CREATE INDEX "CoachFormAssignment_engagement_status_updated_idx"
  ON "CoachingFormAssignment"("engagementId", "status", "updatedAt");
CREATE INDEX "CoachFormAssignment_booking_status_idx"
  ON "CoachingFormAssignment"("bookingId", "status");
CREATE INDEX "CoachFormAssignment_room_status_idx"
  ON "CoachingFormAssignment"("callRoomId", "status");
CREATE UNIQUE INDEX "CoachingFormResponseRevision_requestId_key"
  ON "CoachingFormResponseRevision"("requestId");
CREATE UNIQUE INDEX "CoachFormResponse_assignment_revision_key"
  ON "CoachingFormResponseRevision"("assignmentId", "revision");
CREATE INDEX "CoachFormResponse_actor_created_idx"
  ON "CoachingFormResponseRevision"("actorUserId", "createdAt");

ALTER TABLE "CoachingFormTemplate"
  ADD CONSTRAINT "CoachingFormTemplate_ownerCoachUserId_fkey"
  FOREIGN KEY ("ownerCoachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormTemplateVersion"
  ADD CONSTRAINT "CoachingFormTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CoachingFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormTemplateVersion"
  ADD CONSTRAINT "CoachingFormTemplateVersion_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CoachingFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_templateVersionId_templateId_fkey"
  FOREIGN KEY ("templateVersionId", "templateId")
  REFERENCES "CoachingFormTemplateVersion"("id", "templateId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_callRoomId_fkey"
  FOREIGN KEY ("callRoomId") REFERENCES "CallRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAssignment"
  ADD CONSTRAINT "CoachingFormAssignment_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormResponseRevision"
  ADD CONSTRAINT "CoachingFormResponseRevision_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "CoachingFormAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormResponseRevision"
  ADD CONSTRAINT "CoachingFormResponseRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
