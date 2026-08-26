CREATE TYPE "CoachingFormAutomationTrigger" AS ENUM ('BEFORE_SESSION', 'AFTER_SESSION');
CREATE TYPE "CoachingFormAutomationPolicyStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "CoachingFormAutomationVersionMode" AS ENUM ('LATEST_PUBLISHED', 'PINNED_VERSION');
CREATE TYPE "CoachingFormAutomationOverrideAction" AS ENUM ('SEND_NOW', 'SKIP', 'CLEAR');

CREATE TABLE "CoachingFormAutomationPolicy" (
  "id" TEXT NOT NULL,
  "ownerCoachUserId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "pinnedTemplateVersionId" TEXT,
  "engagementId" TEXT NOT NULL,
  "trigger" "CoachingFormAutomationTrigger" NOT NULL,
  "status" "CoachingFormAutomationPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
  "versionMode" "CoachingFormAutomationVersionMode" NOT NULL DEFAULT 'LATEST_PUBLISHED',
  "releaseOffsetMinutes" INTEGER NOT NULL,
  "dueOffsetMinutes" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoachingFormAutomationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormAutomationPolicy_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachingFormAutomationPolicy_offsets_check" CHECK (
    "releaseOffsetMinutes" BETWEEN -525600 AND 525600
    AND "dueOffsetMinutes" BETWEEN -525600 AND 525600
    AND (
      ("trigger" = 'BEFORE_SESSION' AND "releaseOffsetMinutes" <= 0 AND "dueOffsetMinutes" >= 0)
      OR
      ("trigger" = 'AFTER_SESSION' AND "releaseOffsetMinutes" >= 0 AND "dueOffsetMinutes" >= "releaseOffsetMinutes")
    )
  ),
  CONSTRAINT "CoachingFormAutomationPolicy_version_mode_check" CHECK (
    ("versionMode" = 'LATEST_PUBLISHED' AND "pinnedTemplateVersionId" IS NULL)
    OR
    ("versionMode" = 'PINNED_VERSION' AND "pinnedTemplateVersionId" IS NOT NULL)
  )
);

CREATE TABLE "CoachingFormAutomationPolicyRevision" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "policyId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingFormAutomationPolicyRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormAutomationPolicyRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachingFormAutomationPolicyRevision_sha_check" CHECK ("inputSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "CoachingFormAutomationReceipt" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "callRoomId" TEXT,
  "templateVersionId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "trigger" "CoachingFormAutomationTrigger" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "manualOverride" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingFormAutomationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormAutomationReceipt_event_key_check" CHECK (char_length("eventKey") BETWEEN 1 AND 300),
  CONSTRAINT "CoachingFormAutomationReceipt_window_check" CHECK ("eligibleAt" <= "dueAt")
);

CREATE TABLE "CoachingFormAutomationOverride" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "policyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "CoachingFormAutomationOverrideAction" NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "reason" TEXT,
  "revision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingFormAutomationOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingFormAutomationOverride_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "CoachingFormAutomationOverride_sha_check" CHECK ("inputSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CoachingFormAutomationOverride_reason_check" CHECK ("reason" IS NULL OR char_length("reason") <= 500)
);

CREATE UNIQUE INDEX "CoachFormAutomationPolicy_template_engagement_trigger_key"
  ON "CoachingFormAutomationPolicy"("templateId", "engagementId", "trigger");
CREATE INDEX "CoachFormAutomationPolicy_owner_status_updated_idx"
  ON "CoachingFormAutomationPolicy"("ownerCoachUserId", "status", "updatedAt");
CREATE INDEX "CoachFormAutomationPolicy_engagement_status_trigger_idx"
  ON "CoachingFormAutomationPolicy"("engagementId", "status", "trigger");
CREATE UNIQUE INDEX "CoachingFormAutomationPolicyRevision_requestId_key"
  ON "CoachingFormAutomationPolicyRevision"("requestId");
CREATE UNIQUE INDEX "CoachFormAutomationPolicyRevision_policy_revision_key"
  ON "CoachingFormAutomationPolicyRevision"("policyId", "revision");
CREATE INDEX "CoachFormAutomationPolicyRevision_actor_created_idx"
  ON "CoachingFormAutomationPolicyRevision"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "CoachingFormAutomationReceipt_assignmentId_key"
  ON "CoachingFormAutomationReceipt"("assignmentId");
CREATE UNIQUE INDEX "CoachFormAutomationReceipt_policy_event_key"
  ON "CoachingFormAutomationReceipt"("policyId", "eventKey");
CREATE INDEX "CoachFormAutomationReceipt_booking_trigger_idx"
  ON "CoachingFormAutomationReceipt"("bookingId", "trigger", "createdAt");
CREATE INDEX "CoachFormAutomationReceipt_policy_created_idx"
  ON "CoachingFormAutomationReceipt"("policyId", "createdAt");
CREATE UNIQUE INDEX "CoachingFormAutomationOverride_requestId_key"
  ON "CoachingFormAutomationOverride"("requestId");
CREATE UNIQUE INDEX "CoachFormAutomationOverride_policy_booking_revision_key"
  ON "CoachingFormAutomationOverride"("policyId", "bookingId", "revision");
CREATE INDEX "CoachFormAutomationOverride_policy_booking_created_idx"
  ON "CoachingFormAutomationOverride"("policyId", "bookingId", "createdAt");
CREATE INDEX "CoachFormAutomationOverride_actor_created_idx"
  ON "CoachingFormAutomationOverride"("actorUserId", "createdAt");

ALTER TABLE "CoachingFormAutomationPolicy"
  ADD CONSTRAINT "CoachingFormAutomationPolicy_ownerCoachUserId_fkey"
  FOREIGN KEY ("ownerCoachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationPolicy"
  ADD CONSTRAINT "CoachingFormAutomationPolicy_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "CoachingFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationPolicy"
  ADD CONSTRAINT "CoachingFormAutomationPolicy_pinnedTemplateVersionId_templateId_fkey"
  FOREIGN KEY ("pinnedTemplateVersionId", "templateId") REFERENCES "CoachingFormTemplateVersion"("id", "templateId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationPolicy"
  ADD CONSTRAINT "CoachingFormAutomationPolicy_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationPolicyRevision"
  ADD CONSTRAINT "CoachingFormAutomationPolicyRevision_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "CoachingFormAutomationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationPolicyRevision"
  ADD CONSTRAINT "CoachingFormAutomationPolicyRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationReceipt"
  ADD CONSTRAINT "CoachingFormAutomationReceipt_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "CoachingFormAutomationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationReceipt"
  ADD CONSTRAINT "CoachingFormAutomationReceipt_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationReceipt"
  ADD CONSTRAINT "CoachingFormAutomationReceipt_callRoomId_fkey"
  FOREIGN KEY ("callRoomId") REFERENCES "CallRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationReceipt"
  ADD CONSTRAINT "CoachingFormAutomationReceipt_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "CoachingFormTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationReceipt"
  ADD CONSTRAINT "CoachingFormAutomationReceipt_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "CoachingFormAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationOverride"
  ADD CONSTRAINT "CoachingFormAutomationOverride_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "CoachingFormAutomationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationOverride"
  ADD CONSTRAINT "CoachingFormAutomationOverride_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "CoachingBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingFormAutomationOverride"
  ADD CONSTRAINT "CoachingFormAutomationOverride_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
