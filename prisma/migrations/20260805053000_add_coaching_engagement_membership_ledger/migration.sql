-- Membership governance is append-only. Invitations are expiring capabilities,
-- current membership stays on CoachingEngagementMember, and every accepted or
-- rejected authority transition is retained in the receipt ledger.
CREATE TYPE "CoachingEngagementMemberAction" AS ENUM ('INVITE', 'ACCEPT', 'REMOVE', 'RESTORE', 'REVOKE_INVITE');
CREATE TYPE "CoachingEngagementInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "CoachingEngagementMember"
  ADD COLUMN "accessChangedAt" TIMESTAMP(3),
  ADD COLUMN "accessChangedByUserId" TEXT,
  ADD COLUMN "accessRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CoachingEngagementInvitation" (
  "id" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "role" "CoachingEngagementMemberRole" NOT NULL,
  "status" "CoachingEngagementInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedByUserId" TEXT,
  "acceptedByUserId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachingEngagementInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachingEngagementMemberReceipt" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "engagementId" TEXT NOT NULL,
  "memberId" TEXT,
  "invitationId" TEXT,
  "subjectUserId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "CoachingEngagementMemberAction" NOT NULL,
  "roleBefore" "CoachingEngagementMemberRole",
  "roleAfter" "CoachingEngagementMemberRole",
  "statusBefore" "CoachingEngagementMemberStatus",
  "statusAfter" "CoachingEngagementMemberStatus",
  "accessRevision" INTEGER,
  "reason" TEXT,
  "outcomeJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachingEngagementMemberReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingEngagementInvitation_tokenHash_key" ON "CoachingEngagementInvitation"("tokenHash");
CREATE INDEX "CoachingEngagementInvitation_engagementId_status_createdAt_idx" ON "CoachingEngagementInvitation"("engagementId", "status", "createdAt");
CREATE INDEX "CoachingEngagementInvitation_invitedUserId_status_expiresAt_idx" ON "CoachingEngagementInvitation"("invitedUserId", "status", "expiresAt");
CREATE INDEX "CoachingEngagementInvitation_invitedEmail_status_expiresAt_idx" ON "CoachingEngagementInvitation"("invitedEmail", "status", "expiresAt");
CREATE UNIQUE INDEX "CoachingEngagementMemberReceipt_requestId_key" ON "CoachingEngagementMemberReceipt"("requestId");
CREATE INDEX "CoachingEngagementMemberReceipt_engagementId_createdAt_idx" ON "CoachingEngagementMemberReceipt"("engagementId", "createdAt");
CREATE INDEX "CoachingEngagementMemberReceipt_subjectUserId_createdAt_idx" ON "CoachingEngagementMemberReceipt"("subjectUserId", "createdAt");
CREATE INDEX "CoachingEngagementMemberReceipt_invitationId_createdAt_idx" ON "CoachingEngagementMemberReceipt"("invitationId", "createdAt");
CREATE UNIQUE INDEX "CoachingEngagementMemberReceipt_memberId_accessRevision_key" ON "CoachingEngagementMemberReceipt"("memberId", "accessRevision");

ALTER TABLE "CoachingEngagementMember" ADD CONSTRAINT "CoachingEngagementMember_accessChangedByUserId_fkey" FOREIGN KEY ("accessChangedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementInvitation" ADD CONSTRAINT "CoachingEngagementInvitation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementInvitation" ADD CONSTRAINT "CoachingEngagementInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementInvitation" ADD CONSTRAINT "CoachingEngagementInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementInvitation" ADD CONSTRAINT "CoachingEngagementInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMemberReceipt" ADD CONSTRAINT "CoachingEngagementMemberReceipt_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CoachingEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMemberReceipt" ADD CONSTRAINT "CoachingEngagementMemberReceipt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CoachingEngagementMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMemberReceipt" ADD CONSTRAINT "CoachingEngagementMemberReceipt_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CoachingEngagementInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMemberReceipt" ADD CONSTRAINT "CoachingEngagementMemberReceipt_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingEngagementMemberReceipt" ADD CONSTRAINT "CoachingEngagementMemberReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
